# doc §13.5 C23/C98/C99: CI-only fresh/upgrade/rollback and idempotency rehearsal.
[CmdletBinding()]
param([string] $BaselineDumpPath = $env:DAWLYY_DB_0002_DUMP)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:CI -notin @('true', '1')) { throw 'C23/C98/C99 run only in CI against disposable databases.' }
if (-not $env:DATABASE_URL_SERVICE -or -not $env:DATABASE_URL) {
    throw 'C23/C98/C99 require privileged DATABASE_URL_SERVICE and runtime DATABASE_URL.'
}
if (-not $BaselineDumpPath -or -not (Test-Path -LiteralPath $BaselineDumpPath -PathType Leaf)) {
    throw 'C23/C98 require a genuine 0002 dawlyy_test dump: pass -BaselineDumpPath or DAWLYY_DB_0002_DUMP. Never dump/downgrade the live shared database here.'
}
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dbDirectory = Join-Path $repository 'packages/db'
$migrationDirectory = Join-Path $dbDirectory 'migrations'
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '_' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$databasePrefix = 'dawlyy_mig_' + $stamp
$databaseNames = @(($databasePrefix + '_base'), ($databasePrefix + '_upgrade'), ($databasePrefix + '_failure'), ($databasePrefix + '_fresh'))
$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) $databasePrefix
$oldEnvironment = @{}
foreach ($name in @('DATABASE_URL', 'DATABASE_URL_SERVICE', 'DRIZZLE_NO_POLICIES')) {
    $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Utf8([string] $Path, [string] $Value) {
    [IO.File]::WriteAllText($Path, $Value.Replace("`r`n", "`n"), $utf8)
}
function Database-Url([string] $Original, [string] $Database) {
    if ($Database -notmatch '^[a-z0-9_]+$') { throw 'Invalid disposable database identifier.' }
    $builder = New-Object UriBuilder($Original)
    $builder.Path = '/' + $Database
    return $builder.Uri.AbsoluteUri
}
function Invoke-Checked([string] $Executable, [string[]] $Arguments) {
    $output = @(& $Executable @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE):`n$($output -join "`n")" }
    return ($output -join "`n")
}
function Query([string] $Url, [string] $Statement) {
    return Invoke-Checked 'psql' @('--no-psqlrc', '--dbname', $Url, '--set', 'ON_ERROR_STOP=1', '-A', '-t', '-c', $Statement)
}
function New-MigrationCopy([string] $Label, [int] $LastIndex) {
    $target = Join-Path $temporaryDirectory $Label
    New-Item -ItemType Directory -Path (Join-Path $target 'meta') -Force | Out-Null
    $journal = Get-Content -LiteralPath (Join-Path $migrationDirectory 'meta/_journal.json') -Raw | ConvertFrom-Json
    $journal.entries = @($journal.entries | Where-Object { $_.idx -le $LastIndex })
    foreach ($entry in $journal.entries) {
        Copy-Item -LiteralPath (Join-Path $migrationDirectory ($entry.tag + '.sql')) -Destination $target
    }
    Get-ChildItem -LiteralPath (Join-Path $migrationDirectory 'meta') -Filter '*_snapshot.json' | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target 'meta')
    }
    Write-Utf8 (Join-Path $target 'meta/_journal.json') ($journal | ConvertTo-Json -Depth 100)
    return $target
}
function New-Config([string] $Label, [string] $Migrations) {
    $config = Join-Path $temporaryDirectory ($Label + '.config.ts')
    $schemaPath = (Join-Path $dbDirectory 'src/schema/index.ts').Replace('\', '/') | ConvertTo-Json -Compress
    $outputPath = $Migrations.Replace('\', '/') | ConvertTo-Json -Compress
    Write-Utf8 $config "export default { dialect: 'postgresql', schema: $schemaPath, out: $outputPath, schemaFilter: ['public', 'app'], dbCredentials: { url: process.env.DATABASE_URL_SERVICE }, strict: true };`n"
    return $config
}
function Migrate([string] $Url, [string] $Config) {
    $env:DATABASE_URL_SERVICE = $Url
    return Invoke-Checked 'pnpm' @('--filter', '@dawlyy/db', 'exec', 'drizzle-kit', 'migrate', '--config', $Config)
}
function Journal([string] $Url) {
    return Query $Url 'select id,hash,created_at from drizzle.__drizzle_migrations order by created_at,id'
}
function Assert-Journal([string] $Url, [int] $ExpectedCount) {
    $actual = Query $Url 'select count(*) from drizzle.__drizzle_migrations'
    if ($actual.Trim() -ne [string] $ExpectedCount) { throw "Migration journal expected $ExpectedCount entries; got $actual" }
    $journal = Get-Content -LiteralPath (Join-Path $migrationDirectory 'meta/_journal.json') -Raw | ConvertFrom-Json
    $last = @($journal.entries | Where-Object { $_.idx -eq ($ExpectedCount - 1) })
    if ($last.Count -ne 1) { throw 'Journal entry is missing or duplicated.' }
    $timestamp = Query $Url 'select max(created_at) from drizzle.__drizzle_migrations'
    if ($timestamp.Trim() -ne [string] $last[0].when) { throw 'Applied journal timestamp differs from the real migration journal.' }
    foreach ($entry in @($journal.entries | Where-Object { $_.idx -lt $ExpectedCount })) {
        $hash = (Get-FileHash -LiteralPath (Join-Path $migrationDirectory ($entry.tag + '.sql')) -Algorithm SHA256).Hash.ToLowerInvariant()
        $recorded = Query $Url ("select hash from drizzle.__drizzle_migrations where created_at = " + [string] $entry.when)
        if ($recorded.Trim() -ne $hash) { throw "Applied hash differs for $($entry.tag)" }
    }
}
function Artifacts([string] $Directory) {
    return ((Get-ChildItem -LiteralPath $Directory -Recurse -File | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($Directory.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join "`n")
}

# Complete identities, including ACL grantees/default owners, replace all unstable OIDs.
$catalogQuery = @'
with objects as (
 select 'table' as kind,n.nspname||'.'||c.relname as identity,
   jsonb_build_object('owner',c.relowner::regrole::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'kind',c.relkind) as value
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app') and c.relkind in ('r','p','S','v')
 union all
 select 'column',n.nspname||'.'||c.relname||'.'||a.attname,
   jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
 where n.nspname in ('public','app') and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
 union all
 select 'policy',n.nspname||'.'||c.relname||'.'||p.polname,
   jsonb_build_object('roles',array(select case when r=0 then 'PUBLIC' else r::regrole::text end from unnest(p.polroles)r order by 1),'command',p.polcmd,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app')
 union all
 select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,
   jsonb_build_object('function',t.tgfoid::regprocedure::text,'bits',t.tgtype,'columns',array(select a.attname from unnest(t.tgattr::smallint[])k join pg_attribute a on a.attrelid=t.tgrelid and a.attnum=k order by 1),'when',(regexp_match(pg_get_triggerdef(t.oid,true),'WHEN [(](.*)[)] EXECUTE FUNCTION'))[1],'args',encode(t.tgargs,'hex'),'enabled',t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','app')
 union all
 select 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,
   jsonb_build_object('definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred)
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app')
 union all
 select 'index',n.nspname||'.'||c.relname,
   jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)
 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app')
 union all
 select 'function',p.oid::regprocedure::text,
   jsonb_build_object('owner',p.proowner::regrole::text,'definer',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid),'acl',coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a),'[]'::jsonb))
 from pg_proc p where p.pronamespace in ('public'::regnamespace,'app'::regnamespace) and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 union all
 select 'relation_acl',n.nspname||'.'||c.relname,
   coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee::regrole::text,a.privilege_type,a.grantor::regrole::text) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner)))a),'[]'::jsonb)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app') and c.relkind in ('r','p','S','v')
 union all
 select 'column_acl',n.nspname||'.'||c.relname||'.'||a.attname,
   coalesce((select jsonb_agg(jsonb_build_array(case when x.grantee=0 then 'PUBLIC' else x.grantee::regrole::text end,x.grantor::regrole::text,x.privilege_type,x.is_grantable)order by x.grantee::regrole::text,x.privilege_type)from aclexplode(a.attacl)x),'[]'::jsonb)
 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app')and a.attnum>0 and not a.attisdropped
 union all
 select 'default_acl',d.defaclrole::regrole::text||'.'||case when d.defaclnamespace=0 then '<global>'else d.defaclnamespace::regnamespace::text end||'.'||d.defaclobjtype,
   coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC'else a.grantee::regrole::text end,a.grantor::regrole::text,a.privilege_type,a.is_grantable)order by a.grantee::regrole::text,a.privilege_type)from aclexplode(d.defaclacl)a),'[]'::jsonb)
 from pg_default_acl d
 union all
 select 'schema_acl',n.nspname,coalesce((select jsonb_agg(jsonb_build_array(case when a.grantee=0 then 'PUBLIC'else a.grantee::regrole::text end,a.privilege_type,a.is_grantable)order by a.grantee::regrole::text,a.privilege_type)from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a),'[]'::jsonb)from pg_namespace n where n.nspname in ('public','app')
 union all
 select 'role',r.rolname,jsonb_build_object('login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'bypass',r.rolbypassrls,'createdb',r.rolcreatedb,'createrole',r.rolcreaterole,'replication',r.rolreplication)from pg_roles r where r.rolname in ('dawlyy_app','dawlyy_rls','anon','authenticated','service_role')
 union all
 select 'membership',m.member::regrole::text||'->'||m.roleid::regrole::text,jsonb_build_object('grantor',m.grantor::regrole::text,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)from pg_auth_members m where m.member in ('dawlyy_app'::regrole,'dawlyy_rls'::regrole)
)
select kind,identity,value::text from objects order by kind collate "C",identity collate "C",value::text collate "C";
'@
function Catalog([string] $Url) { return Query $Url $catalogQuery }
function Run-CatalogContracts([string] $ServiceUrl, [string] $RuntimeUrl) {
    $env:DATABASE_URL_SERVICE = $ServiceUrl
    $env:DATABASE_URL = $RuntimeUrl
    $validation = Invoke-Checked 'pnpm' @('--filter', '@dawlyy/db', 'exec', 'vitest', 'run', 'test/security.catalog.test.ts', 'test/security.integrity.test.ts', '--testNamePattern', '(?:^|\s)(?:C(?:0[1-9]b?|1[0124])|N0[123])\b')
    $validation = [regex]::Replace($validation, "$([char]27)\[[0-9;]*m", '')
    if ($validation -notmatch '\b[1-9][0-9]* passed\b') { throw 'C23 catalog validation did not execute passing tests.' }
}

$created = New-Object 'System.Collections.Generic.List[string]'
try {
    New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
    Remove-Item Env:DRIZZLE_NO_POLICIES -ErrorAction SilentlyContinue
    $adminUrl = Database-Url $oldEnvironment.DATABASE_URL_SERVICE 'postgres'
    foreach ($database in $databaseNames) {
        if ($database -notmatch '^dawlyy_mig_[a-z0-9_]+$' -or $database.Length -gt 63) { throw 'Unsafe disposable name.' }
        $null = Query $adminUrl ('CREATE DATABASE "' + $database + '" OWNER postgres')
        $created.Add($database)
    }
    $baseUrl = Database-Url $oldEnvironment.DATABASE_URL_SERVICE $databaseNames[0]
    $upgradeUrl = Database-Url $oldEnvironment.DATABASE_URL_SERVICE $databaseNames[1]
    $failureUrl = Database-Url $oldEnvironment.DATABASE_URL_SERVICE $databaseNames[2]
    $freshUrl = Database-Url $oldEnvironment.DATABASE_URL_SERVICE $databaseNames[3]
    $baseCopy = New-MigrationCopy 'base' 2
    $fullCopy = New-MigrationCopy 'full' 6
    $badCopy = New-MigrationCopy 'injected-failure' 6
    $baseConfig = New-Config 'base' $baseCopy
    $fullConfig = New-Config 'full' $fullCopy
    $badConfig = New-Config 'bad' $badCopy
    $null = Migrate $baseUrl $baseConfig
    $null = Invoke-Checked 'pg_restore' @('--dbname', $baseUrl, '--clean', '--if-exists', '--exit-on-error', $BaselineDumpPath)
    Assert-Journal $baseUrl 3
    # Restore the CI artifact, then add controlled H1 witnesses; never connect to shared dawlyy_test.
    $seedSql = @'
insert into tenants(id,name,slug) values('10000000-0000-4000-8000-000000000001','C98 preserved tenant','c98-preserved');
insert into clients(id,tenant_id,code,first_name,status)values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',app.next_client_code('10000000-0000-4000-8000-000000000001'),'C98 preserved client','active');
insert into tasks(id,tenant_id,title,source_event_id)values('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','C98 preserved task','10000000-0000-4000-8000-000000000004');
'@
    $null = Query $baseUrl $seedSql
    $dataQuery = @'
create function pg_temp.c23_rows()returns table(relation text,row_data jsonb)language plpgsql as $$
declare r record; omitted text[];
begin
 for r in select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p')
   and c.relname not in ('tenant_hidden_items','message_revisions')
   and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
 loop
   omitted:=case r.relname when 'tenants'then array['receipt_counter']when 'clients'then array['search_key']when 'invitations'then array['display_name']when 'events'then array['actor_user_id','actor_role']when 'set_logs'then array['deleted_at']when 'exercises'then array['based_on_id']when 'foods'then array['based_on_id']when 'tasks'then array['source_event_id']else array[]::text[]end;
   return query execute format('select %L::text,to_jsonb(t)-$1 from public.%I t',r.relname,r.relname)using omitted;
 end loop;
end $$;
select relation,row_data::text from pg_temp.c23_rows()order by relation collate "C",row_data::text collate "C";
'@
    $preserved = Query $baseUrl $dataQuery
    $dumpPath = Join-Path $temporaryDirectory '0002.dump'
    $null = Invoke-Checked 'pg_dump' @('--dbname', $baseUrl, '--format=custom', '--file', $dumpPath)
    foreach ($url in @($upgradeUrl, $failureUrl)) { $null = Invoke-Checked 'pg_restore' @('--dbname', $url, '--exit-on-error', $dumpPath) }
    Write-Output 'C23/C98: rehearse 0002 -> 0006 with the real migrator and journal.'
    $null = Migrate $upgradeUrl $fullConfig
    Assert-Journal $upgradeUrl 7
    if ((Query $upgradeUrl $dataQuery) -cne $preserved) { throw 'C98 changed preserved 0002 rows.' }
    if ((Query $upgradeUrl 'select count(*) from tasks where source_event_id is not null').Trim() -ne '0') { throw 'C98 H1 did not clear old UUID event ids.' }
    if ((Query $upgradeUrl "select (not exists(select 1 from clients where search_key<>'') and not exists(select 1 from tenants where receipt_counter<>0))").Trim() -ne 't') { throw 'C98 new columns did not receive their documented defaults.' }
    Run-CatalogContracts $upgradeUrl (Database-Url $oldEnvironment.DATABASE_URL $databaseNames[1])
    Write-Output 'C23: injected final-statement failure must roll back all pending migrations.'
    $beforeCatalog = Catalog $failureUrl
    $beforeJournal = Journal $failureUrl
    $beforeData = Query $failureUrl $dataQuery
    $lastFile = Join-Path $badCopy '0006_guards_and_grants.sql'
    Write-Utf8 $lastFile ((Get-Content -LiteralPath $lastFile -Raw) + "`nselect 1/0;`n--> statement-breakpoint`n")
    $failed = $false
    try { $null = Migrate $failureUrl $badConfig } catch { $failed = $true; if ($_.Exception.Message -notmatch 'division by zero') { throw } }
    if (-not $failed) { throw 'Injected migration unexpectedly succeeded.' }
    if ((Catalog $failureUrl) -cne $beforeCatalog -or (Journal $failureUrl) -cne $beforeJournal -or (Query $failureUrl $dataQuery) -cne $beforeData) { throw 'C23 failed to roll back schema, journal or data to 0002.' }
    Assert-Journal $failureUrl 3
    Write-Output 'C23/C99: fresh install and exact rerun catalog comparison.'
    $null = Migrate $freshUrl $fullConfig
    Assert-Journal $freshUrl 7
    $beforeRerun = Catalog $freshUrl
    Write-Utf8 (Join-Path $temporaryDirectory 'catalog-before.txt') $beforeRerun
    $null = Invoke-Checked 'psql' @('--no-psqlrc', '--dbname', $freshUrl, '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', (Join-Path $migrationDirectory '0003_rls_role_and_helpers.sql'), '--file', (Join-Path $migrationDirectory '0006_guards_and_grants.sql'))
    $afterRerun = Catalog $freshUrl
    Write-Utf8 (Join-Path $temporaryDirectory 'catalog-after.txt') $afterRerun
    if ($beforeRerun -cne $afterRerun) { throw 'C99 catalog changed on rerunning 0003/0006; compare catalog-before/after in CI artifacts.' }
    Run-CatalogContracts $freshUrl (Database-Url $oldEnvironment.DATABASE_URL $databaseNames[3])
    $artifactsBefore = Artifacts $fullCopy
    Remove-Item Env:DRIZZLE_NO_POLICIES -ErrorAction SilentlyContinue
    $env:DATABASE_URL_SERVICE = $freshUrl
    $generation = Invoke-Checked 'pnpm' @('--filter', '@dawlyy/db', 'exec', 'drizzle-kit', 'generate', '--config', $fullConfig)
    if ($generation -notmatch 'No schema changes' -or (Artifacts $fullCopy) -cne $artifactsBefore) { throw 'C99 generation changed artifacts or did not report No schema changes.' }
    Write-Output 'C23/C98/C99 passed.'
} finally {
    $cleanupFailures = New-Object 'System.Collections.Generic.List[string]'
    try {
        foreach ($database in $created) {
            try {
                if ($database -notmatch '^dawlyy_mig_[a-z0-9_]+$') { throw 'Refusing to drop a database outside the disposable namespace.' }
                $null = Query (Database-Url $oldEnvironment.DATABASE_URL_SERVICE 'postgres') ('DROP DATABASE IF EXISTS "' + $database + '" WITH (FORCE)')
            } catch { $cleanupFailures.Add($_.Exception.Message) }
        }
    } finally {
        foreach ($name in $oldEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process') }
        if (Test-Path -LiteralPath $temporaryDirectory) {
            $resolvedTemporary = [IO.Path]::GetFullPath($temporaryDirectory)
            $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
            if (-not $resolvedTemporary.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedTemporary) -ne $databasePrefix) { throw 'Refusing cleanup outside the verified temporary directory.' }
            Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
        }
    }
    if ($cleanupFailures.Count -gt 0) { throw ('Disposable database cleanup failed: ' + ($cleanupFailures -join '; ')) }
}
