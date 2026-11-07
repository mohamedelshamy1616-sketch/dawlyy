# Local Postgres 18 cluster for DAWLYY database tests (Windows PowerShell 5.1).
# Usage: powershell -File tools/local_pg.ps1 -Action init|start|stop|status|reset|prepare|psql [-Sql "select 1"]
# Only touches the instance folder named below; never other instances under .pg0\instances.
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('init', 'start', 'stop', 'status', 'reset', 'prepare', 'psql')]
  [string]$Action,
  [string]$Sql
)

$ErrorActionPreference = 'Continue'

$BIN  = 'C:\Users\compuline\.pg0\installation\18.1.0\bin'
$DATA = 'C:\Users\compuline\.pg0\instances\dawlyy-test\data'
$PORT = 54329
$DB   = 'dawlyy_test'
$LOG  = Join-Path (Split-Path $DATA -Parent) 'postgres.log'

$ServiceUrl = "postgresql://postgres@127.0.0.1:$PORT/$DB"
$AppUrl     = "postgresql://dawlyy_app:dawlyy_app@127.0.0.1:$PORT/$DB"

function Test-Running {
  & "$BIN\pg_ctl.exe" status -D $DATA *> $null
  return ($LASTEXITCODE -eq 0)
}

function Invoke-Psql([string]$Database, [string]$Command) {
  & "$BIN\psql.exe" -h 127.0.0.1 -p $PORT -U postgres -d $Database -v ON_ERROR_STOP=1 -X -q -t -A -c $Command
  return $LASTEXITCODE
}

function Start-Cluster {
  if (-not (Test-Path $DATA)) { throw "No cluster at $DATA. Run -Action init first." }
  if (Test-Running) { Write-Host "Already running on port $PORT."; return }
  # Launch through WMI so the postmaster is not a child of this shell and inherits none of its handles.
  # (A normal child inherits the caller's stdout pipe; pnpm, CI or an agent shell then waits for it forever.)
  $cmd = "`"$BIN\pg_ctl.exe`" start -D `"$DATA`" -l `"$LOG`" -o `"-p $PORT`""
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
  if ($r.ReturnValue -ne 0) { throw "could not launch pg_ctl (WMI return $($r.ReturnValue))" }
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    & "$BIN\pg_isready.exe" -h 127.0.0.1 -p $PORT -q
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  }
  if (-not $ready) { throw "server did not accept connections within 60 s. See $LOG" }
  Write-Host "Started on port $PORT."
}

function Stop-Cluster {
  if (-not (Test-Path $DATA) -or -not (Test-Running)) { Write-Host 'Not running.'; return }
  & "$BIN\pg_ctl.exe" stop -D $DATA -m fast -w -t 60 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl stop failed (exit $LASTEXITCODE)" }
}

function Initialize-Cluster {
  if (-not (Test-Path $DATA)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $DATA -Parent) | Out-Null
    & "$BIN\initdb.exe" -D $DATA -U postgres -A trust -E UTF8 --locale=C | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "initdb failed (exit $LASTEXITCODE)" }
    Add-Content -Path (Join-Path $DATA 'postgresql.conf') -Encoding ascii -Value "`nport = $PORT`nlisten_addresses = '127.0.0.1'"
  } else {
    Write-Host "Data directory exists, skipping initdb."
  }
  Start-Cluster
  $exists = & "$BIN\psql.exe" -h 127.0.0.1 -p $PORT -U postgres -d postgres -X -q -t -A -c "select 1 from pg_database where datname = '$DB'"
  if ("$exists".Trim() -ne '1') {
    $rc = Invoke-Psql 'postgres' "create database $DB"
    if ($rc -ne 0) { throw "create database failed" }
  }
  Set-AppRole
  Write-Host "Ready. Database $DB on 127.0.0.1:$PORT."
}

# Local-only password for the restricted runtime role. Never put this in a migration.
# The role is created here when missing (the migration only creates it if absent) and altered afterwards.
function Set-AppRole {
  $cmd = "do `$`$ begin if not exists (select 1 from pg_roles where rolname = 'dawlyy_app') then create role dawlyy_app login noinherit nobypassrls; end if; end `$`$; alter role dawlyy_app password 'dawlyy_app';"
  $rc = Invoke-Psql 'postgres' $cmd
  if ($rc -ne 0) { throw 'could not prepare role dawlyy_app' }
}

switch ($Action) {
  'init'    { Initialize-Cluster }
  'start'   { Start-Cluster }
  'stop'    { Stop-Cluster }
  'prepare' { if (-not (Test-Running)) { throw 'Cluster is not running.' }; Set-AppRole; Write-Host 'dawlyy_app password set.' }
  'status'  {
    if (Test-Path $DATA) {
      & "$BIN\pg_ctl.exe" status -D $DATA | Out-Host
    } else {
      Write-Host "No cluster at $DATA."
    }
    if (Test-Path $DATA) {
      if (Test-Running) { Write-Host "running on port $PORT" } else { Write-Host "stopped (port $PORT)" }
    }
    Write-Host "DATABASE_URL_SERVICE=$ServiceUrl"
    Write-Host "DATABASE_URL=$AppUrl"
  }
  'reset'   {
    Stop-Cluster
    if (Test-Path $DATA) { Remove-Item -Recurse -Force -Path $DATA }
    Initialize-Cluster
  }
  'psql'    {
    if (-not (Test-Running)) { throw 'Cluster is not running.' }
    if ($Sql) {
      & "$BIN\psql.exe" -h 127.0.0.1 -p $PORT -U postgres -d $DB -X -c $Sql
    } else {
      & "$BIN\psql.exe" -h 127.0.0.1 -p $PORT -U postgres -d $DB
    }
  }
}
