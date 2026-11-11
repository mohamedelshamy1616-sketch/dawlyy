# DAWLYY restore drill

This is a checklist to execute later, not a completed drill. Owner: Mohamed. Operator: a session after his explicit yes to each account, credential and restore action. Never restore over production as a drill. Never send mail or push to real users from scratch. Protect all dumps and evidence as sensitive data; do not commit them. A database restore alone does not prove recovery of Storage object bytes or hosted Auth settings.

Cost gate: BUDGET.md / Stage B / Supabase and Stage C / Supabase Pro cover the database/storage provider. Scratch compute, backup retention, object backup and PITR prices are not established here: **verify in the console; check before paying**. PITR needs a separate approved quote and yes. No recovery-time or data-loss target has been agreed in the repository; record measured results and have Mohamed accept them before go-live.

| Date (UTC / Cairo) | Source project / reviewed commit | Backup id / checksum / recovery point | Scratch project | Restore duration | Total verified recovery time | Table / tenant | Rows before | Rows after | Operator | Signed off by / date |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

Repeat rows for every counted table/tenant. Keep counts at the backup's recovery point, not against a changing live database. Record object counts and byte totals separately for each bucket. Record Auth user counts without exporting addresses to the evidence table.

1. [ ] **Authorize and prepare.** Who: Mohamed, then the approved operator. Read LAUNCH_RUNBOOK.md steps 1-7 and 14. Record source environment, app commit, migration journal, approval and recovery point. Confirm a private scratch Supabase project in the approved region, separate credentials, no production DNS, no enabled cron and no mail/push credentials. Exact project/restore controls: **verify in the console**. Expected: source cannot be written by the drill and scratch cannot notify people. Verify every connection target privately with `select current_database(), current_user, session_user;` and project references. Rollback: stop before restore if targets are ambiguous; leave production unchanged.

2. [ ] **Capture a consistent baseline and usable backup.** Who: the approved operator. For a planned logical drill stop source writers through the approved maintenance procedure, including cron, before taking counts and the backup. Do not pause production without the named approval. Record UTC start/end. Run the row-count query below as `postgres`, and inventory Auth identities and Storage objects. Run `pg_dump --dbname="$env:DATABASE_URL_SERVICE" --format=custom --file=<approved-backup-path>` using the direct privileged source connection. Run `pg_restore --list <approved-backup-path>` and `Get-FileHash -Algorithm SHA256 <approved-backup-path>`. Secure the backup and manifest. Alternatively select an existing daily backup or PITR recovery point in the provider restore flow; **verify in the console** the baseline at that point. Expected: complete readable archive or restorable provider backup with exact recovery point. Verify whether hosted Auth, roles, ownership and ACLs are included and whether platform-managed schemas can be restored. Store encrypted object-byte backups for `client-media` and `tenant-assets` at the same point. Record any consistency gap between database references and objects. Rollback: resume the unchanged source after the backup window; do not proceed with an incomplete baseline.

3. [ ] **Start the clock and restore only to scratch.** Who: the approved operator. Record restore-request time. Use the provider's supported restore-to-separate-project flow; exact console path and availability: **verify in the console**. If unavailable on the selected plan, stop and obtain approval for a supported scratch restore method. For a logical archive, use a fresh compatible scratch database only after rehearsing how the provider handles managed schemas and roles. `pg_dump` does not contain cluster role definitions or Storage bytes. The full 0000-0006 migration run is the role/schema contract; role recreation outside a full migration run is not an allowed workaround. Do not first migrate a destination and then restore a full schema archive over it. Resolve the supported empty-target/role preparation with the provider and a reviewed restore procedure. Once the target has the required roles and is confirmed empty of DAWLYY objects, the logical restore command is:

   ```powershell
   pg_restore --dbname="$env:DAWLYY_RESTORE_TARGET_URL" --exit-on-error --single-transaction <approved-backup-path>
   ```

   `DAWLYY_RESTORE_TARGET_URL` is a drill-shell operand for psql/pg_restore, not an application variable. Load it privately with the direct scratch connection. Never use `--clean` against an existing project, suppress ACL restoration or ignore permission errors. If ownership remapping is needed, stop for a reviewed provider-specific procedure; verify all objects have the same owner as memberships afterward. Expected: restore exit 0, no ignored errors and journal matching the backed-up app version. If a role or managed-schema conflict occurs, the drill fails until the procedure is corrected. Record restore-complete time and duration, including any failed attempts. Rollback: stop and retain the scratch error evidence; do not retry against production. Deleting or rebuilding scratch needs Mohamed's yes.

4. [ ] **Verify data and migration state.** Who: the approved operator. Run `select id, hash, created_at from drizzle.__drizzle_migrations order by created_at;` in scratch. Compare with the backup baseline and checked-in journal. A current release has migrations 0000 through 0006. A rollback backup must use the matching older app, not a forced upgrade during the drill. Run the row-count query below again. Compare every table and tenant count, Auth identity count, audit/event history and sample receipt/immutable-version records at the recovery point. Expected: exact counts and references at the same recovery point. Save query output privately. Rollback: stop release on a mismatch and investigate; do not edit data to make counts match.

5. [ ] **Verify security in scratch.** Who: the approved operator. Run Q1-Q8, C06, C09 and C14 below as `postgres`. Save all results. Expected: Q1-Q7 zero rows; Q8 one true row; C14 no PUBLIC/null function ACL and one true default row; C06 exactly the 21-function set in security-model section 3.4; C09 exactly the four listed edges. Confirm policy roles are `dawlyy_rls`, role attributes match section 3.1, and all required guard triggers exist. Compare `pg_policies` and non-internal `pg_trigger` inventory with the migrated release baseline. Check Data API `public` remains unexposed and DAWLYY Realtime `postgres_changes` remains off: these account settings may not be in a backup. Verify PostgREST denial with both a user JWT and the service key. The service key can access Storage but must not access DAWLYY tables via Data API. Run catalog/default-ACL/isolation tests on a separate migrated disposable database using `pnpm test:db`; these tests create fixtures and objects, so never aim them at the source or the scratch data being counted. Expected: tests pass plus hosted audits pass. Rollback: keep scratch isolated and fail sign-off on any privilege difference; never weaken policies or tests.

6. [ ] **Restore Auth, Storage and configuration.** Who: the approved operator. Use the supported hosted Auth recovery process; **verify in the console** what the backup contains. Restore private object bytes from their separate backup using the approved transfer procedure. Keep both bucket limits at 8388608 bytes and use the MIME lists in LAUNCH_RUNBOOK.md step 6. Restore bucket policies/settings separately if necessary. Verify actual byte content/checksums, not just `storage.objects` metadata. Sample both tenant-assets and client-media through authorized signed downloads. Verify wrong-tenant and direct anonymous/JWT downloads fail. Verify owner Auth login/recovery using only approved test identities and messages. Expected: media references resolve to matching bytes and Auth identities link to memberships. Rollback: keep scratch inaccessible if any required object, identity or setting is missing; do not copy scratch settings into production.

7. [ ] **Prove the app against scratch and finish timing.** Who: the approved operator. Deploy the backed-up compatible build to an isolated staging target after the required yes. Use scratch-only credentials, approved test identities and no production cron. Run the Task 12 ar/en flow: invite/recovery, package/proof/verify/receipt/refund, activation, workout and nutrition publishing, offline sync without duplicates, check-in submission/review, renewal/freeze/extension and recalculated dates. Verify client A cannot read client B and assigned staff cannot read unassigned clients. Verify no development login route exists in the production build. Expected: data is usable, isolated and recoverable, including remote proof uploads. Record end-to-end recovery time from restore request through completed verification, not just provider job duration. Record actual recovery point/data-loss window and all failures. Rollback: withdraw staging access; keep production and its build unchanged.

8. [ ] **Sign off and retain evidence.** Who: Mohamed. Complete the table, approve the measured recovery time and data-loss window, and link private logs, counts, checksums and screenshots in the private release record. Mark pass only when every checklist item passes. If failed, record the failure and next rehearsal; no launch. Keep backups under the approved retention/access policy. Remove scratch secrets from test deployments after the drill; rotation, data deletion and project deletion each need the appropriate explicit yes. Expected: signed recovery evidence and an executable rollback procedure. Rollback: withhold go-live until the drill passes.

## Row counts at the recovery point

Run this in `psql` on the direct source connection during the backup window, then on scratch. `\gexec` executes generated read-only count statements. Output can be large; save it privately. Includes total and per-tenant counts for every public table, plus Auth users, Storage object metadata, app allowlists and the migration journal. Count object bytes in the separate Storage inventory too.

```sql
select format('select %L as table_name, count(*) as row_count from %I.%I;',
              n.nspname || '.' || c.relname, n.nspname, c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p')
  and (n.nspname = 'public'
       or (n.nspname = 'auth' and c.relname = 'users')
       or (n.nspname = 'storage' and c.relname = 'objects')
       or (n.nspname = 'app' and c.relname in ('audit_actions','event_types'))
       or (n.nspname = 'drizzle' and c.relname = '__drizzle_migrations'))
order by n.nspname, c.relname;
\gexec
select format('select %L as table_name, tenant_id, count(*) as row_count from %I.%I group by tenant_id order by tenant_id;',
              table_schema || '.' || table_name, table_schema, table_name)
from information_schema.columns
where table_schema = 'public' and column_name = 'tenant_id'
order by table_name;
\gexec
```

## Database security query set

Copied from security-model sections 12.2, 3.4 and 3.3. Read-only queries run as `postgres`. Q1-Q7 must return zero rows; Q8 must return one true row.

```sql
-- Q1 tables with RLS off, or with FORCE (the design never uses FORCE, §3.2)
select relname, relrowsecurity, relforcerowsecurity from pg_class
 where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
   and (not relrowsecurity or relforcerowsecurity);

-- Q2 any table, sequence or function in public or app whose owner differs from the owner of public.memberships
select c.oid::regclass::text as object, 'relation' as kind from pg_class c
 where c.relnamespace in ('public'::regnamespace, 'app'::regnamespace) and c.relkind in ('r', 'p', 'S', 'v', 'm')
   and c.relowner <> (select relowner from pg_class where oid = 'public.memberships'::regclass)
   and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
union all
select p.oid::regprocedure::text, 'function' from pg_proc p
 where p.pronamespace in ('public'::regnamespace, 'app'::regnamespace)
   and p.proowner <> (select relowner from pg_class where oid = 'public.memberships'::regclass)
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

-- Q3 Supabase roles and the runtime login hold any privilege on any DAWLYY table or sequence
select r.rolname, c.oid::regclass::text as object
  from pg_roles r
  join pg_class c on c.relnamespace in ('public'::regnamespace, 'app'::regnamespace) and c.relkind in ('r', 'p', 'v', 'S')
 where r.rolname in ('anon', 'authenticated', 'service_role', 'dawlyy_app')
   and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
   and ((c.relkind = 'S' and has_sequence_privilege(r.oid, c.oid, 'usage, select, update'))
        or (c.relkind <> 'S' and has_table_privilege(r.oid, c.oid, 'select, insert, update, delete, truncate, references, trigger')));

-- Q4 those roles hold EXECUTE on any function in app or public
select r.rolname, p.oid::regprocedure::text as func
  from pg_roles r
  join pg_proc p on p.pronamespace in ('public'::regnamespace, 'app'::regnamespace)
 where r.rolname in ('anon', 'authenticated', 'service_role', 'dawlyy_app')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and has_function_privilege(r.oid, p.oid, 'execute');

-- Q5 dawlyy_rls holds TRUNCATE, REFERENCES or TRIGGER anywhere, or any sequence privilege
select c.oid::regclass::text as object from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'S')
   and ((c.relkind = 'S' and has_sequence_privilege('dawlyy_rls', c.oid, 'usage, select, update'))
        or (c.relkind <> 'S' and has_table_privilege('dawlyy_rls', c.oid, 'truncate, references, trigger')));

-- Q6 role attributes: dawlyy_app must log in; neither role may be super, bypass RLS, inherit, create roles or databases
select rolname from pg_roles
 where (rolname = 'dawlyy_app' and not rolcanlogin)
    or (rolname = 'dawlyy_rls' and rolcanlogin)
    or (rolname in ('dawlyy_app', 'dawlyy_rls')
        and (rolsuper or rolbypassrls or rolinherit or rolcreaterole or rolcreatedb or rolreplication));

-- Q7 CREATE on either schema for the runtime roles
select s.nspname, r.rolname from pg_namespace s
  join pg_roles r on r.rolname in ('dawlyy_app', 'dawlyy_rls')
 where s.nspname in ('public', 'app') and has_schema_privilege(r.oid, s.oid, 'create');

-- Q8 the global default for functions still withholds PUBLIC (C14). Exactly one row, value true.
select exists (
  select 1 from pg_default_acl d
   where d.defaclnamespace = 0 and d.defaclobjtype = 'f'
     and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0)) as global_function_default_ok;
```

C06 must return exactly these signatures (schema-qualified or equivalent catalog display):

`uid()`, `membership()`, `membership_id()`, `tenant_id()`, `role()`, `client_id()`, `is_staff()`, `is_owner()`, `is_client()`, `sees_all_clients()`, `assigned_client_ids()`, `accessible_user_ids()`, `can_access_client(uuid)`, `can_access_user(uuid)`, `has_perm(text,text)`, `guard_resolve(jsonb,text)`, `audit(text,text,text,jsonb,jsonb,text,text)`, `emit_event(text,text,text,jsonb)`, `register_push(text,jsonb,text)`, `advance_due(uuid)`, `team_directory()`, all in `app`.

```sql
-- C06: the effective EXECUTE set of dawlyy_rls is exactly the 21 functions above (extension functions excluded)
select p.oid::regprocedure from pg_proc p
 where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace) and p.prokind in ('f', 'p')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and has_function_privilege('dawlyy_rls', p.oid, 'execute')
 order by 1;
-- C14: no function carries a PUBLIC grant or a null ACL (a null ACL means the default, which includes PUBLIC); zero rows
select p.oid::regprocedure from pg_proc p
 where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace)
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0));
-- C14: the global default entry for functions exists and does not name PUBLIC; one row, true
select exists (
  select 1 from pg_default_acl d
   where d.defaclnamespace = 0 and d.defaclobjtype = 'f'
     and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 0));
```

C09 must return only `forms -> form_versions`, `notifications -> notification_deliveries`, `nutrition_plans -> nutrition_plan_versions`, `programs -> program_versions`.

```sql
select format('%s -> %s', pc.relname, cc.relname) as cascade_edge
  from pg_constraint c
  join pg_class pc on pc.oid = c.confrelid
  join pg_class cc on cc.oid = c.conrelid
 where c.contype = 'f' and c.confdeltype = 'c' and pc.relnamespace = 'public'::regnamespace
   and has_table_privilege('dawlyy_rls', pc.oid, 'delete')
 order by 1;
```

Record other owners' default privileges for review; `supabase_admin` entries alone are not a failure. Q2 must prove it owns none of our objects.

```sql
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl order by 1, 2, 3;
-- Policies must address the restricted RLS role; compare full inventory with release baseline.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
-- Compare guard/other trigger inventory with the migrated release baseline (security model section 7.12).
select c.relname, t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid
where c.relnamespace='public'::regnamespace and not t.tgisinternal
order by c.relname,t.tgname;
```
