# DAWLYY database security model (v2)

Status: design, 2026-11-07, revised after the design review (eight review lenses and a Codex consult; every accepted
change is folded into the sections below). This is the contract for the database hardening pass that fixes the 51
findings of the adversarial database audit (four lenses: authority, exposure, history, scope; plus a
tenant-reference matrix). It is implemented by new migrations 0003–0006. Migrations 0000–0002 are applied and are
never edited.

Product defaults taken (Mohamed's open questions, answered at their stated defaults so the build can proceed; he can
change any of them later):

1. **Module permissions in the database.** Staff publish programs, nutrition plans and forms (`programs`, `nutrition`
   and `forms` with `publish`), verify, reject and refund payments (`billing` / `verify`), approve AI output (`ai` /
   `publish`) and create clients (`clients` / `create`) only with the matching module permission. Owners always may.
   `app.has_perm` (§4) enforces it through the guard keys `perm_transitions` and `require_perm` (§6.1) and the
   `clients` insert policy (§5.2). Money and catalogue writes (payments, subscriptions, subscription events,
   entitlement overrides, packages) follow the same rule. The database has no owner-only shortcut for
   `draft → published`.
2. **Assigned-scope staff keep what they create.** A staff member with `client_scope = 'assigned'` who creates a client
   is assigned to that client at once (trigger `clients_80_assign_creator`, §7).
3. **Freezes (S14, S32 in `docs/plans/STATE.md`), as recommended there.** A freeze that is not a multiple of 7 days
   keeps weekday cadences on their weekday; a retroactive freeze cancels the open check-ins inside the frozen window.
   These are core and API rules and change nothing in the database.
4. **Open legal question for counsel:** Law 151/2020 (erasure of personal data) against tax retention of payment
   records. Default taken: erasing a client deletes the client's payments with the rest. If counsel requires
   retention, erasure anonymises payments instead; that change belongs in `app.erase_client` (§7.9) and §12, and
   nowhere else.

Readers: whoever implements or extends `packages/db`. Every table added later follows §15.

---

## 1. Threat model and trust boundary

- End users never connect to Postgres and never use the Supabase Data API. Every query comes from the API server
  through `withAuthTx` / `withUserTx` (runtime pool, role `dawlyy_app`) or `withServiceTx` / `withErasureTx`
  (privileged pool).
- The API server asserts identity: it validates the Supabase session, then sets `request.jwt.claim.sub`,
  `request.jwt.claims` and `app.membership_id` itself. The database therefore defends against **application bugs** —
  a handler that forgets a filter, spreads a request body into an update, or points a row at another client's data.
  It does not defend against SQL injection on the runtime connection. Rule: no `sql.raw()` and no string-built SQL with
  request data outside migrations and tests (source-scan test C13).
- Roles inside a tenant: `owner` (everything in the tenant), `staff` (`client_scope` = `all` or `assigned`; module
  permissions from the owner), `client` (own data only).
- What the database enforces: tenant isolation, client scope, role authority (a client cannot do staff actions),
  immutable history, attribution (who did it, with server-stamped times), state machines for money and published
  documents, referential integrity across tenant and client boundaries, and the module permissions that guard
  publishing, payment verification, AI approval, client creation, billing and packages (`app.has_perm`, §4, §6).
- What stays in the API (documented obligations, §12): the module permissions of every other module and action, column
  projections for client responses (`clientColumns`, the only control for column privacy), ids embedded inside JSON
  documents, outbox processing rules.
- Service transactions (cron, seeds, invitation acceptance, erasure and tenant closure) bypass RLS and the guards.
  They must filter by tenant explicitly and pass a reason (already enforced by `withServiceTx`). Erasure of a client
  and closure of a tenant are service transactions of one kind: they run through `withErasureTx` (§14) and call the
  service-only functions `app.erase_client` and `app.close_tenant` (§7.9). Those two functions are never granted to
  the runtime role.

## 2. Audit findings → fixes

| Cluster | Findings | Fix |
|---|---|---|
| A Data API exposure | EXP-09, H-9 | New role `dawlyy_rls` (§3); revoke everything from `anon`, `authenticated`, `service_role`, `PUBLIC`; default privileges revoked, including the global `PUBLIC` EXECUTE default for functions; EXECUTE granted by one explicit list at the end of 0006 (§3.4) |
| A2 GUC cast crash | EXP-10 | `app.membership()` rewritten (§4) |
| B Payments | AUTH-01, EXP-01, SC-02, H-3 | Guard config + receipt trigger + no DELETE (§6, §7); staff move a payment to verified, rejected or refunded only with `billing` / `verify`; a partial refund keeps the payment `verified`; receipt numbers have no gaps (no `ON CONFLICT` on payments, §12) |
| C Invitations | AUTH-02, EXP-02, SC-05 | Owner/staff split policies, staff may only invite clients they can access, token and acceptance immutable (§5, §6) |
| D Published versions | AUTH-03, H-2, SC-08, SC-12 | `protect_published_version` for all roles (the erasure path of §7.1 is the one exception), version guard + `version_rules`, one published per head, head pointers kept by trigger, client reads published only (§5–§7) |
| E Module permissions | AUTH-04, EXP-03, SC-14 | Database for publishing, payment verification, AI approval, client creation, billing and packages: `app.has_perm` with the guard keys `perm_transitions` and `require_perm` (§4, §6). API obligation for every other module action (§12), now implementable because `AuthContext` carries `permissions` (§14) |
| F Messaging | SC-01, EXP-04, AUTH-06 (high); AUTH-05, EXP-06, SC-03, H-4 | Internal policies require `client_id is null`; `message_rules` stamps sender and read markers, author-only edits, nothing changes after a delete; counters and previews by trigger; edits are kept in the append-only `message_revisions` (§5, §7) |
| G Client-writable server columns | AUTH-07/08/09, EXP-07, SC-04, H-4 | Guard allowlists per table (§6); `created_at` / `updated_at` stamped by the guard on every runtime insert; media bucket and path CHECK (§8) |
| H audit_log / events forgery | AUTH-10, EXP-08, H-1, SC-09 | No INSERT privilege; `app.audit()` / `app.emit_event()` accept only names listed in `app.audit_actions` / `app.event_types` for the caller's role, derive the client from the entity row and stamp the actor (§7) |
| I Over-broad staff SELECT | EXP-05, H-6, SC-06, SC-07, SC-13 | Scoped policies for audit_log, events, memberships, assignments, consents, invitations (§5); clients read coach names only through `app.team_directory()` (§7) |
| J Cross-tenant / cross-client references | AUTH-11, EXP-14, SC-11 (74 pairs) | Composite foreign keys, inherit triggers, `app.visible_refs()` and head-qualified pointer keys (§7, §8) |
| K `next_client_code` | AUTH-12, EXP-11, H-10, SC-10 | Not executable at runtime; code assigned by trigger; `code`, `membership_id` immutable (§6, §7) |
| L History deletion | AUTH-13, H-5, SC-14 | DELETE granted only on the tables in §3.3 (none on memberships, exercises, foods, client_flags, ai_requests; `metric_entries` and `message_revisions` are append-only); cascade contract test C09; erasure and tenant closure only through the service-only `app.erase_client` / `app.close_tenant` (§7.9) |
| M Caller-supplied attribution | many | Stamps in the guard, including server times (§6) |
| N Audit coverage | H-7 | Audit triggers on every remaining sensitive table, including ai_requests, client_flags and media; the version tables audit status changes only (§10) |
| O Consents | EXP-13, H-8 | Append-only, `withdrawn_at` set once (§6) |
| P Clients read coach-internal columns | EXP-12 | API projections: `clientColumns` maps in `packages/db`, client routes select only through them, source-scan test C15 (§12) |

Findings of the design review (Codex C1–C24, the self-review S1–S11 and the lens findings) are folded into the
clusters above and into the section each one changed.

`source` on tracking rows outside `metric_entries` and `inbody_records` (where the guard pins it to `'manual'` for
clients) stays an unverified client claim. Nothing downstream may trust it as provenance.

## 3. Roles and privileges

### 3.1 Roles

| Role | Attributes | Purpose |
|---|---|---|
| `dawlyy_app` | LOGIN NOINHERIT NOBYPASSRLS (exists, 0000) | Runtime login. Has no privileges of its own; its only route to data is `SET LOCAL ROLE dawlyy_rls`. |
| `dawlyy_rls` | NOLOGIN NOINHERIT NOBYPASSRLS (new, 0003) | The only role RLS policies apply to. `dawlyy_app` is a member; `withAuthTx`/`withUserTx` run `SET LOCAL ROLE dawlyy_rls`. |
| `authenticated`, `anon`, `service_role` | Supabase roles (local: `authenticated` from 0000) | No privileges on DAWLYY objects at all. |

Why a new role: on Supabase, `authenticated` is the role PostgREST uses for every signed-in user, and Supabase's
default privileges grant ALL on new public tables to `anon`, `authenticated` and `service_role`. Policies written
`TO authenticated` were reachable through the Data API with only a user JWT, around every API check. With policies
`TO dawlyy_rls` and all grants revoked from the Supabase roles, the Data API returns permission denied for every
DAWLYY table, and a leaked `service_role` key cannot read them through PostgREST either.

The guarantee is about **effective privilege, not role membership**:

- 0006 revokes `authenticated` from `dawlyy_app` only when the migration role may (a `pg_auth_members` row for
  `authenticated` and `current_user` with `admin_option`). Otherwise it raises a WARNING and relies on
  `authenticated` holding
  no privilege on any DAWLYY object. It never fails the migration over this statement (PRIV-02).
- Role memberships are cluster-wide. Another database's 0000 runs `grant authenticated to dawlyy_app` again, so a
  test must not assert that the membership is gone. C05 asserts instead: every role `dawlyy_app` can become, except
  `dawlyy_rls`, holds no privilege on any table or sequence in `public` and no EXECUTE on any function in `app`.
  Local test databases are migrated one after the other, never in parallel.
- Supabase staging: if 0000's `grant authenticated to dawlyy_app` fails there, wrap it in a DO block that checks
  `exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = current_user::regrole and admin_option)` first. Editing 0000 for this is allowed,
  because no deployed database has applied it yet (§11).
- Supabase keeps default privileges for `supabase_admin` in `public`, which `postgres` cannot change. They apply only
  to objects that `supabase_admin` creates. No table in `public` is owned by `supabase_admin` (C12), and §12 gives the
  audit query to run after every migration.

Release step (gated: it is an account action and needs Mohamed's explicit yes; §12 lists it, it is not optional):
remove `public` from the Data API's exposed schemas before go-live. Keep Realtime `postgres_changes` off for DAWLYY
tables (see §12).

### 3.2 Guard discriminator

Guard triggers (§6, §7) act only when `current_user = 'dawlyy_rls'`. Inside SECURITY DEFINER functions, service
transactions and foreign-key actions `current_user` is another role, so trusted code is not blocked. Every-role integrity triggers include `protect_published_version` (§7.1), `task_assignee_check` (§7.11.2) and
`media_proof_rules` (§7.11.3). The published-version DELETE branch has a single exception, the
erasure path: `current_user <> 'dawlyy_rls'` and the transaction-local setting `app.erasure` is `on`. `withErasureTx`,
`app.erase_client` and `app.close_tenant` set the flag. The runtime role can set the setting too, but the trigger
ignores it for that role, so the flag gives the runtime no power.

Foreign-key cascades also run as the table owner, so **the runtime role must never be able to delete a parent whose
cascade removes history**; §3.3 lists exactly where DELETE is granted and test C09 enforces the cascade map.

**Never use `FORCE ROW LEVEL SECURITY`.** SECURITY DEFINER functions (`app.membership()`, `app.can_access_client()`,
`app.audit_row()`, the receipt, message and pointer triggers, `app.audit`, `app.emit_event`) read RLS-enabled tables as
their owner and rely on the owner's exemption from RLS. This only works while the function owner equals the table
owner. So every migration runs as `postgres`, which owns every table in `public` and every function in `app`. On
Supabase `postgres` is not a superuser, so nothing else would mask a violation: a table or function created by another
role, or a table with `FORCE`, makes `memberships_*` policies recurse through `app.membership()` or return nothing.
C07 and C12 assert the three queries below, and each must return zero rows:

```sql
-- every SECURITY DEFINER function in app has the owner of the tables it reads
select p.oid::regprocedure from pg_proc p
 where p.pronamespace = 'app'::regnamespace and p.prosecdef
   and p.proowner <> (select relowner from pg_class where oid = 'public.memberships'::regclass);
-- no table has FORCE ROW LEVEL SECURITY
select relname from pg_class
 where relnamespace = 'public'::regnamespace and relkind in ('r', 'p') and relforcerowsecurity;
-- every table in public has the same owner
select relname from pg_class
 where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
   and relowner <> (select relowner from pg_class where oid = 'public.memberships'::regclass);
```

### 3.3 Table privileges of `dawlyy_rls`

S = SELECT, I = INSERT, U = UPDATE, D = DELETE. Nothing else (no TRUNCATE, REFERENCES, TRIGGER). RLS still filters
every row; privileges make forbidden commands fail loudly (42501) instead of affecting zero rows.

| Table | Priv | Table | Priv |
|---|---|---|---|
| tenants | S U | exercises | S I U |
| memberships | S I U | foods | S I U |
| staff_client_assignments | S I D | tenant_hidden_items (new) | S I D |
| invitations | S I U D | programs | S I U D |
| business_settings | S I U | program_versions | S I U D |
| user_preferences | S I U D | nutrition_plans | S I U D |
| consents | S I U | nutrition_plan_versions | S I U D |
| clients | S I U | forms | S I U D |
| client_notes | S I U D | form_versions | S I U D |
| client_flags | S I U | form_submissions | S I U |
| tasks | S I U D | calendar_events | S I U |
| ai_requests | S I U | metric_entries | S I |
| packages | S I U D | measurement_sets | S I U |
| subscriptions | S I U | progress_photo_sets | S I U |
| subscription_events | S I | inbody_records | S I U |
| client_entitlement_overrides | S I U | workout_sessions | S I U |
| payments | S I U | set_logs | S I U |
| conversations | S I U | meal_logs | S I U |
| messages | S I U | supplement_logs | S I U |
| message_revisions (new) | S | media | S I U D |
| notifications | S U D | audit_log | S |
| notification_deliveries | S | events | S |
| push_subscriptions | S I U D | job_runs | S |
| idempotency_keys | S I D |  |  |

That is 47 tables. Where the matrix is stricter than a reader might expect:

- **No DELETE on `memberships`.** The owner removes a staff member by setting `status = 'disabled'`; the row stays, so
  tasks, assignments and audit rows that name it keep resolving.
- **No DELETE on `exercises` and `foods`.** A tenant retires an item with `hidden = true`, and hides a system item with
  `tenant_hidden_items`. Logged sets keep their exercise.
- **No DELETE on `client_flags` and `ai_requests`.** A flag is resolved; an AI request ends rejected. Both are audited
  (§10).
- **`metric_entries` is append-only: S I, no UPDATE.** A correction inserts a new row with `correction_of`. An offline
  retry of an identical row uses `ON CONFLICT DO NOTHING`.
- **`message_revisions` is S only.** Rows come from the SECURITY DEFINER trigger `messages_95_revision`; the runtime sees
  them exactly as it sees the message. It cannot insert, update or delete.
- `audit_log`, `events` and `job_runs` are S only; `app.audit` / `app.emit_event` (definer) and service code write them.
- `app.audit_actions` and `app.event_types` (§7.8) live in schema `app`, belong to `postgres` and carry no privilege for
  any runtime role. Only the two definer functions read them.

No sequence privileges (all runtime-written tables use uuid keys; `audit_log`/`events` identities are written by
SECURITY DEFINER functions).

Allowed ON DELETE CASCADE children of runtime-deletable tables (test C09; anything else fails the test):
`notifications → notification_deliveries`, `programs → program_versions`, `nutrition_plans →
nutrition_plan_versions`, `forms → form_versions`. The last three are guarded by `head_rules`: a head can be deleted
only while every one of its versions is a draft (C11). `memberships → staff_client_assignments` is no longer
runtime-reachable, because `memberships` has no DELETE; it stays a service-only cascade. The pointer rule `on delete set
null (current_version_id)` (§8.2) removes no history and is not part of the map. C09 reads the map from the catalog:

```sql
select format('%s -> %s', pc.relname, cc.relname) as cascade_edge
  from pg_constraint c
  join pg_class pc on pc.oid = c.confrelid
  join pg_class cc on cc.oid = c.conrelid
 where c.contype = 'f' and c.confdeltype = 'c' and pc.relnamespace = 'public'::regnamespace
   and has_table_privilege('dawlyy_rls', pc.oid, 'delete')
 order by 1;
```

### 3.4 Function privileges of `dawlyy_rls`

EXECUTE exactly on these 21 functions, and on nothing else:

| Function | Called by |
|---|---|
| `app.uid()`, `app.membership()`, `app.membership_id()`, `app.tenant_id()`, `app.role()`, `app.client_id()`, `app.is_staff()`, `app.is_owner()`, `app.is_client()` | Identity helpers (§4): policies, guards, the API |
| `app.sees_all_clients()` | `ACCESS(...)` in policies |
| `app.assigned_client_ids()` | `ACCESS(...)` in policies (PERF-01) |
| `app.accessible_user_ids()` | the `consents_staff` policy (PERF-02) |
| `app.can_access_client(uuid)`, `app.can_access_user(uuid)` | single-value checks only; no policy calls them |
| `app.has_perm(text, text)` | `app.guard_row` (`require_perm`, `perm_transitions`), the `clients` insert policy |
| `app.guard_resolve(jsonb, text)` | `app.guard_row` |
| `app.audit(text, text, text, jsonb, jsonb, text, text)` | the API, in the same transaction as the change |
| `app.emit_event(text, text, text, jsonb)` | the API, in the same transaction as the change |
| `app.register_push(text, jsonb, text)` | the API, at login and when the browser subscribes |
| `app.advance_due(uuid)` | the API, when a check-in is submitted at its due time |
| `app.team_directory()` | the API, for client-facing coach names |

Never granted to `dawlyy_rls` (or to any other role): `app.erase_client(uuid, uuid)` and `app.close_tenant(uuid)`
(service-only), `app.next_client_code(uuid)`, `app.next_receipt_no(uuid)`, `app.entity_client(text, text, uuid)`, and
every trigger function (`guard_row`, `protect_published_version`, `version_rules`, `message_rules`, ...). Trigger
functions need no EXECUTE grant to fire. DAWLYY defines no function in schema `public`, so nothing is reachable as a
Supabase `/rpc` endpoint.

Why the list is exact. PostgreSQL grants EXECUTE on every new function to `PUBLIC`, and `dawlyy_rls` is a member of
`PUBLIC`. A schema-scoped `alter default privileges in schema ... revoke execute on functions from public` removes
nothing, because `PUBLIC`'s grant comes from the built-in global default (PRIV-01, SQLX-01, CV-03). Three rules follow:

1. 0003 and 0006 both start with the global default revoke, written for the migration role: `alter default privileges
   for role postgres revoke execute on functions from public`. From then on a new function carries only its owner's
   grant.
2. The whole function-privilege block is the **last** part of 0006, after every `create function` (§11). Anything
   created earlier already has the `PUBLIC` grant.
3. Every function that is created later revokes `PUBLIC` explicitly and lists its grants (§15).

```sql
alter default privileges for role postgres revoke execute on functions from public;
--> statement-breakpoint
-- ... every create function of 0006 runs before this point ...
revoke all on all functions in schema app from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all functions in schema app from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
    end if;
  end loop;
end $$;
--> statement-breakpoint
grant execute on function
  app.uid(), app.membership(), app.membership_id(), app.tenant_id(), app.role(), app.client_id(),
  app.is_staff(), app.is_owner(), app.is_client(), app.sees_all_clients(),
  app.assigned_client_ids(), app.accessible_user_ids(),
  app.can_access_client(uuid), app.can_access_user(uuid), app.has_perm(text, text),
  app.guard_resolve(jsonb, text),
  app.audit(text, text, text, jsonb, jsonb, text, text), app.emit_event(text, text, text, jsonb),
  app.register_push(text, jsonb, text), app.advance_due(uuid), app.team_directory()
to dawlyy_rls;
--> statement-breakpoint
```

C06 and C14 test the effective privilege, so inherited `PUBLIC` grants are caught. Each
query below must return the rows described:

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

C14 also asserts, for `anon`, `authenticated`, `service_role` and `dawlyy_app`, that `has_function_privilege(role, oid,
'execute')` is false for every function in `app` and `public` outside the list, and a throwaway function created in the
test is not executable by `dawlyy_rls`.
## 4. Identity helpers (migration 0003)

`app.membership()` now **requires** a pinned membership. Without `app.membership_id` there is no tenant context:
`withUserTx` may select the caller's own membership rows (policy `memberships_self_select`) and shared system
exercise/food rows with `tenant_id is null`, but no tenant-scoped rows. System reads neither establish membership nor
permit writes; the database no longer silently acts as the caller's oldest membership. The cast is fixed: after a transaction-local `set_config`
the setting reads back as `''` on a pooled connection, and `''::uuid` raised 22P02 (EXP-10).

Migration 0003 does six things, in this order:

1. `set check_function_bodies = on` (C23). 0000 turns body checking off for its own session because its functions
   name tables that do not exist yet. Keep the setting on: it validates syntax and SQL-language bodies where
   applicable; PL/pgSQL statements may resolve names only when executed, and dynamic SQL resolves names at runtime.
   Successful migration does not prove every branch names valid columns. Behavior suites execute every trigger call
   site and entity/head/library expansion, including service-only functions. C20/C23 check creation/order;
   G/D/K/L/E/A/N check execution.
2. The **global** default-privilege revoke for functions (T2, PRIV-01, SQLX-01, CV-03):
   `alter default privileges revoke execute on functions from public`. PostgreSQL gives PUBLIC `EXECUTE` on every new
   function through a built-in global default. A schema-scoped `alter default privileges in schema ... revoke ... from
   public` can only subtract from schema-scoped entries and therefore does nothing; the first version of this design
   used it. The global form applies to every function the migration role creates later in this database (0003 itself,
   0004 to 0006, and every table or function added after the beta, §15). It names no role, so it covers the role that
   runs the migration (`postgres` locally and on Supabase); if another role ever runs migrations, repeat the
   statement with `for role <that role>`. Test C14 checks the entry in `pg_default_acl`. The block that revokes the
   privileges of the functions that already exist (0000's) runs at the end of 0006 (§11), after the last
   `create function`.
3. The role `dawlyy_rls` and its membership grant.
4. The pinned-membership helpers (`app.membership`, `app.membership_id`, `app.is_owner`, `app.is_client`).
5. The client and user scope helpers: `app.can_access_client` now proves the client exists in the caller's tenant
   (C3); `app.sees_all_clients`, `app.assigned_client_ids` (PERF-01) and `app.accessible_user_ids` (PERF-02) are the
   building blocks of the policies in §5.
6. `app.has_perm(p_module, p_action)` (T20, CV-01): the module permissions of the pinned staff membership, readable
   by guards and policies.

Which helper is for what:

| Helper | Returns | Called by | Rule |
|---|---|---|---|
| `app.can_access_client(uuid)` | boolean | `app.audit`, `app.emit_event`, other definer functions | **Single-value checks only.** No policy calls it with a column (PERF-01): a call with a row column is a per-row SubPlan that costs 26–58 µs a row. Test C17 enforces it. |
| `app.sees_all_clients()` | boolean | `ACCESS(c)` | Owner, or staff with `client_scope = all`. One InitPlan per query. |
| `app.assigned_client_ids()` | `setof uuid`, `rows 100` | `ACCESS(c)` | The clients assigned to the pinned staff membership; empty for every other caller. Planned as a **hashed** SubPlan, built once per query. |
| `app.can_access_user(uuid)` | boolean | definer functions | Single-value checks only; no policy calls it. |
| `app.accessible_user_ids()` | `setof uuid`, `rows 600` | `consents_staff` | The users whose tenant-scoped records the caller may see (PERF-02). |
| `app.has_perm(text, text)` | boolean | `app.guard_row` keys `perm_transitions` and `require_perm` (§6.1), the `clients_create_insert` policy | Same rule as `hasAction` in `packages/core/src/authz/index.ts` (T20). |

`app.can_access_client` is the one function whose result changes: a client id that does not exist in the caller's
tenant is now refused for every role. Before, owners and all-scope staff got `true` for any non-null uuid, so
`app.audit` and `app.emit_event` accepted foreign or invented client ids (C3, SQLX-03). Creating a client does not need
this function: the staff insert policy of `clients` has its own condition (§5.2).

`app.has_perm` follows `hasAction`/`isAllowed` exactly:

- Owner: `true` for every known module and action. Client, disabled or unpinned caller, and staff without a
  `permissions` document: `false`.
- Staff: `permissions -> 'modules' -> <module>` must be a JSON array, and the array must contain `'manage'` or the
  asked action. A missing module is `false`; nothing is implied (no `view` from `edit`).
- An unknown module or action is `false` for everybody, owner included, as in core. The two lists inside the function
  are copies of `MODULES` and `ACTIONS` from core; test I11 compares the function with core `isAllowed` for every
  preset and every module/action pair, so a new module in core fails the test until a later migration replaces the
  function.
- It reads the membership through `app.membership()`, so the pin rule applies: the permissions come from the pinned,
  active membership of the caller, never from the request.

Full text of `migrations/0003_rls_role_and_helpers.sql` (custom migration):

```sql
-- DAWLYY 0003: the RLS role and the identity helpers the new policies (0005) call.
-- See docs/architecture/02-database-security-model.md §3–§4. Idempotent.
-- 0000 switched body checking off; keep validation on. PL/pgSQL and dynamic-SQL names still need execution tests.
set check_function_bodies = on;
--> statement-breakpoint

-- New functions get no PUBLIC execute. This is the GLOBAL form (no IN SCHEMA): the schema-scoped form is a no-op
-- because PUBLIC's EXECUTE comes from the built-in global default. Runs as the migration role (postgres).
alter default privileges revoke execute on functions from public;
--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dawlyy_rls') then
    create role dawlyy_rls nologin noinherit nobypassrls;
  end if;
end $$;
--> statement-breakpoint
grant dawlyy_rls to dawlyy_app;
--> statement-breakpoint
grant usage on schema public, app to dawlyy_rls;
--> statement-breakpoint

-- The caller's membership: only the one pinned by withAuthTx (app.membership_id), only if it belongs to the
-- caller and is active. No pin, no tenant context.
create or replace function app.membership()
returns table (membership_id uuid, tenant_id uuid, role text, client_id uuid, permissions jsonb)
language sql stable security definer
set search_path = ''
as $$
  select m.id, m.tenant_id, m.role::text, m.client_id, m.permissions
  from public.memberships m
  where m.id = nullif(current_setting('app.membership_id', true), '')::uuid
    and m.user_id = app.uid()
    and m.status = 'active'
$$;
--> statement-breakpoint

create or replace function app.membership_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select membership_id from app.membership() $$;
--> statement-breakpoint

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'owner' from app.membership()), false) $$;
--> statement-breakpoint

create or replace function app.is_client() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'client' from app.membership()), false) $$;
--> statement-breakpoint

-- C3: does this client exist in the caller's tenant, and may the caller see it?
-- Owner: every client of the tenant. Staff: client_scope = all, or an assignment. Client: only their own record.
-- For single-value checks (app.audit, app.emit_event). Policies use app.sees_all_clients() and
-- app.assigned_client_ids() instead (PERF-01): never call this function with a row column.
create or replace function app.can_access_client(cid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select exists (select 1 from public.clients c where c.id = cid and c.tenant_id = m.tenant_id)
       and case m.role
             when 'owner' then true
             when 'client' then m.client_id = cid
             when 'staff' then
               coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all'
               or exists (
                 select 1 from public.staff_client_assignments a
                 where a.membership_id = m.membership_id and a.client_id = cid)
             else false
           end
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- Owner, or staff with client_scope = all: every client of the tenant. Evaluated once per query (InitPlan).
create or replace function app.sees_all_clients() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select m.role = 'owner'
        or (m.role = 'staff' and coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all')
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- PERF-01: the clients assigned to the pinned staff membership. Empty for owners, clients and unpinned callers.
-- `rows 100` tells the planner to expect a small set, so `c in (select app.assigned_client_ids())` becomes a
-- hashed SubPlan that is built once per query, not once per row.
create or replace function app.assigned_client_ids() returns setof uuid
language sql stable security definer set search_path = '' rows 100
as $$
  select a.client_id
  from app.membership() m
  join public.staff_client_assignments a
    on a.membership_id = m.membership_id and a.tenant_id = m.tenant_id
  where m.role = 'staff'
$$;
--> statement-breakpoint

-- May the caller see this user's tenant-scoped records (consents)? Owner: any member of the tenant.
-- Staff: team members, and client members of clients they can access. Client: only themself.
-- Single-value checks only; consents_staff uses app.accessible_user_ids() (PERF-02).
create or replace function app.can_access_user(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
      when 'owner' then exists (
        select 1 from public.memberships x where x.tenant_id = m.tenant_id and x.user_id = target)
      when 'staff' then exists (
        select 1 from public.memberships x
        where x.tenant_id = m.tenant_id and x.user_id = target
          and (x.role in ('owner', 'staff') or app.can_access_client(x.client_id)))
      else target = app.uid()
    end
    from app.membership() m
  ), false)
$$;
--> statement-breakpoint

-- PERF-02: the same answer as can_access_user, as a set. Hashed SubPlan, one evaluation per query.
create or replace function app.accessible_user_ids() returns setof uuid
language sql stable security definer set search_path = '' rows 600
as $$
  select x.user_id
  from app.membership() m
  join public.memberships x on x.tenant_id = m.tenant_id
  where case m.role
          when 'owner' then true
          when 'staff' then x.role in ('owner', 'staff')
                            or coalesce(m.permissions ->> 'client_scope', 'assigned') = 'all'
                            or x.client_id in (
                                 select a.client_id from public.staff_client_assignments a
                                 where a.membership_id = m.membership_id)
          else x.user_id = app.uid()
        end
$$;
--> statement-breakpoint

-- T20 / CV-01: module permissions of the pinned membership. Same rule as hasAction/isAllowed in
-- packages/core/src/authz/index.ts: owner passes; staff need the action or 'manage' in permissions.modules.<module>;
-- client, disabled, unpinned: false. Unknown module or action: false (the lists are MODULES and ACTIONS of core).
create or replace function app.has_perm(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case m.role
      when 'owner' then true
      when 'staff' then coalesce(
        jsonb_typeof(m.permissions -> 'modules' -> p_module) = 'array'
        and ((m.permissions -> 'modules' -> p_module) @> '"manage"'::jsonb
             or (m.permissions -> 'modules' -> p_module) @> to_jsonb(p_action)),
        false)
      else false
    end
    from app.membership() m
  ), false)
  and p_module = any (array['dashboard', 'clients', 'packages', 'billing', 'programs', 'exercises', 'nutrition',
                            'foods', 'forms', 'checkins', 'assessments', 'calendar', 'tracking', 'messages',
                            'media', 'team', 'settings', 'reports', 'ai'])
  and p_action = any (array['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'])
$$;
--> statement-breakpoint

-- Belt and braces on top of the global default: nothing here is executable by PUBLIC.
revoke all on function
  app.membership(), app.membership_id(), app.is_owner(), app.is_client(), app.can_access_client(uuid),
  app.sees_all_clients(), app.assigned_client_ids(), app.can_access_user(uuid), app.accessible_user_ids(),
  app.has_perm(text, text)
from public;
--> statement-breakpoint

grant execute on function
  app.uid(), app.membership(), app.membership_id(), app.tenant_id(), app.role(), app.client_id(),
  app.is_staff(), app.is_owner(), app.is_client(), app.sees_all_clients(), app.assigned_client_ids(),
  app.can_access_client(uuid), app.can_access_user(uuid), app.accessible_user_ids(), app.has_perm(text, text)
to dawlyy_rls;
--> statement-breakpoint
```

`app.uid()`, `app.tenant_id()`, `app.role()`, `app.client_id()` and `app.is_staff()` keep their 0000 definitions (they
read `app.membership()`, so they inherit the pin rule). PERF-06 (inlinable helpers with direct bodies) is deferred; see
§15. All helpers are owned by the migration role, which also owns the tables they read; they depend on the owner's
exemption from row-level security and on no table having `FORCE ROW LEVEL SECURITY` (§3.2).

The `revoke all ... from public` statement changes nothing on a database that follows this script, because the global
default already withholds PUBLIC's `EXECUTE` from the new functions. It stays so that a database where the default
was missing for any reason (for example a different migration role) still ends in the same state. The grants that
0000 gave to `authenticated` and `dawlyy_app` on its own functions (`app.uid()`, `app.tenant_id()`, ...) are removed by
the privilege block at the end of 0006 (§11, §3.4), not here.

Tested on PostgreSQL 18.1 with this exact script in one transaction (the way Drizzle's migrator runs it), twice in a
row: the second run changes nothing. Nothing in it needs more than PostgreSQL 15 (C24).

Cases for §13 (suite I, `security.identity.test.ts`, in addition to I01–I04):

- **I05** `app.can_access_client`, as owner, all-scope staff, assigned staff and client: own-tenant clients follow the
  scope rule; a client of tenant 2, a random uuid and `null` are refused for every role; with no pin the answer is
  `false` (C3).
- **I06** `app.sees_all_clients()` is `true` only for the owner and all-scope staff. `app.assigned_client_ids()`
  returns explicit assignments for every pinned active staff membership, whether client_scope is assigned or all.
  Owners, clients and unpinned/inactive callers get no rows. ACCESS uses sees_all_clients for all-scope access, so
  retained assignments do not narrow that access.
- **I07** `app.accessible_user_ids()` equals the set of `m.user_id` for which `app.can_access_user(m.user_id)` is
  `true`, for owner, all-scope staff, assigned staff and client of a tenant that also has a second tenant's members.
- **I08** `app.has_perm`: owner `true`; staff with the `assistant` preset: `('billing','create')` false,
  `('checkins','review')` true; `coach` preset: `('billing','verify')` false, `('billing','edit')` true, any other
  module `manage`; `business_manager`: `('billing','verify')` true; staff with `permissions = null` false; client false;
  unpinned false; `('nonsense','view')` and `('billing','nonsense')` false even for the owner.
- **I09** a disabled membership and a pinned membership of another user give `false` from `has_perm`,
  `sees_all_clients` and `can_access_client` (extends I03 and I04).
- **I10** the plan check of PERF-01: as assigned staff with data, `EXPLAIN (FORMAT JSON) select count(*) from
  set_logs` contains a SubPlan node whose filter text includes `hashed SubPlan` and does not include
  `can_access_client`.
- **I11** `app.has_perm` equals core `isAllowed` for every preset in `PRESETS`, every `MODULES` entry and every
  `ACTIONS` entry, and for a hand-written matrix that uses `manage`.
- **I12** every function in this section is executable by `dawlyy_rls` and by no other runtime role (`PUBLIC`,
  `anon`, `authenticated`, `service_role`, `dawlyy_app`), and a function created after 0003 by the migration role has
  no `dawlyy_rls` `EXECUTE` (C06, C14).

## 5. Policy model

### 5.1 Vocabulary (`packages/db/src/schema/_rls.ts`)

```ts
import { sql, type SQL } from 'drizzle-orm';
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

/** The only role RLS policies apply to; withAuthTx/withUserTx run SET LOCAL ROLE dawlyy_rls. */
export const rls = pgRole('dawlyy_rls').existing();

/** DRIZZLE_NO_POLICIES=1 only while generating migration 0004 (see §11). */
const POLICIES_ON = process.env.DRIZZLE_NO_POLICIES !== '1';

export const T = (tenantId: unknown) => sql`${tenantId} = (select app.tenant_id())`;
export const STAFF = sql`(select app.is_staff())`;          // owner or staff
export const OWNER = sql`(select app.is_owner())`;
export const CLIENT = sql`(select app.is_client())`;
/**
 * Owner and all-scope staff: every client. Assigned staff: the clients in app.assigned_client_ids().
 * The IN-subquery becomes a hashed SubPlan built once per query (PERF-01). Never write
 * `app.can_access_client(<column>)` in a policy: that is a per-row SubPlan, about 100 times slower for assigned staff.
 */
export const ACCESS = (clientId: unknown) =>
  sql`((select app.sees_all_clients()) or ${clientId} in (select app.assigned_client_ids()))`;
export const OWN = (clientId: unknown) => sql`${clientId} = (select app.client_id())`;
export const ME = (userId: unknown) => sql`${userId} = (select app.uid())`;
/** Module permission of the pinned membership (§4); the owner always passes. Literal arguments only. */
export const CAN_CREATE_CLIENTS = sql`(select app.has_perm('clients', 'create'))`;

export type Cmd = 'select' | 'insert' | 'update' | 'delete';

/** One permissive policy per command, named `${name}_${cmd}`. `check` defaults to `using`. */
export function allow(name: string, cmds: Cmd[], using: SQL, check: SQL = using) {
  if (!POLICIES_ON) return [];
  return cmds.map((cmd) =>
    pgPolicy(`${name}_${cmd}`, {
      as: 'permissive',
      for: cmd,
      to: rls,
      ...(cmd === 'insert' ? { withCheck: check } : cmd === 'update' ? { using, withCheck: check } : { using }),
    }),
  );
}

/** The restrictive tenant-isolation policy every table has exactly one of: `${table}_tenant_guard`. */
export function tenantGuard(table: string, using: SQL, check: SQL = using) {
  if (!POLICIES_ON) return [];
  return [pgPolicy(`${table}_tenant_guard`, { as: 'restrictive', for: 'all', to: rls, using, withCheck: check })];
}
```

Presets may wrap these (e.g. `clientScoped(table, t, { staff, client })`), but every policy name below must come out
exactly as listed, and every `pgPolicy` in the schema must go through `allow` / `tenantGuard` (so the flag works).
Every table gets `.enableRLS()` so RLS stays on even while policies are switched off (§11). The old helpers
`tenantPolicies`, `clientPolicies`, `coachPrivatePolicies`, `userOwnedPolicies`, `documentHeadPolicies` and the
`authenticated` export are removed.

Restrictive policies AND with the permissive ones: a forgotten tenant check in a permissive policy can no longer leak
across tenants. Permissive policies still repeat `T(...)` so each one reads correctly on its own.

**Why `ACCESS` has two arms (PERF-01).** The first arm is an InitPlan: owners and all-scope staff pay one function
call per query and keep the plain scan speed. The second arm, `c in (select app.assigned_client_ids())`, does not
mention the row except as the probe value, so the planner builds the set once and probes a hash table (`ANY (c =
(hashed SubPlan 1).col1)`). The earlier form `(select app.can_access_client(c))` referenced the row, so PostgreSQL
ran a correlated SubPlan per row: on 150 000 `set_logs` rows an assigned staff member's `count(*)` took 3.9–7.4 s
against 42 ms for the hashed form, and the cost was paid before any user predicate could reject a row (the policy
qual runs first for every non-leakproof predicate such as `ILIKE` or `->>`). `c = any((select
app.assigned_client_ids()))` is not an option: it does not parse (`uuid = uuid[]`), and with an explicit array cast
PostgreSQL scans the array for every row, which degrades linearly with the number of assigned clients. The
trade-off: a primary-key point lookup by assigned staff builds the hash of the staff member's assignments first
(about 0.1 ms more per statement); it is small next to the scan win and is accepted. Do not replace the `sees_all`
arm with a function that returns every tenant client for owners: that costs owners a five-fold slowdown.

Check run for this revision (PostgreSQL 18.1, 100 000 rows, staff assigned to 42 of 100 clients, role `dawlyy_rls`):
`select count(*)` took 33 ms with the form above and 4 959 ms with the old form; with an extra non-leakproof predicate
(`load > 49`) 20 ms against 7 667 ms. The plan filter reads `ANY (client_id = (hashed SubPlan 5).col1)` and the old one
`SubPlan 5 ... loops=100000`. For the owner the same query is 31 ms and the `SubPlan` line says `never executed`.
The same shape shows for `consents_staff` (`ANY (user_id = (hashed SubPlan 4).col1)`, 16 ms for 9 rows of a scratch
tenant) and `message_revisions_member`. Test I10 and test C17 keep this from regressing.

### 5.2 Policy matrix

`T` = `T(tenant_id)`. "staff …" means the expression starts with `T and STAFF`. Policy name = prefix + `_` + command.
Every policy name is at most 63 bytes (D1).

Restrictive guard for every table is `T` (USING and WITH CHECK) except:

| Table | `<table>_tenant_guard` USING | WITH CHECK |
|---|---|---|
| tenants | `id = (select app.tenant_id())` | same |
| memberships | `T or ME(user_id)` | `T` |
| exercises, foods | `tenant_id is null or T` | `T` |

Permissive policies. A command is listed only when §3.3 grants it to `dawlyy_rls`; a policy for a command without a
privilege would never be reached.

| Table | Prefix | Commands | Expression |
|---|---|---|---|
| tenants | `tenants_member` | select | `id = (select app.tenant_id())` |
| | `tenants_owner` | update | `id = (select app.tenant_id()) and OWNER` |
| memberships | `memberships_self` | select | `ME(user_id)` |
| | `memberships_self` | update | `T and ME(user_id)` (FL-04: own display name, phone, locale and last-seen time; the guard limits the columns, §6.3) |
| | `memberships_owner` | select insert update | `T and OWNER` (no delete: remove staff by setting `status = 'disabled'`, FL-07) |
| | `memberships_staff` | select | `T and STAFF and (role in ('owner','staff') or ACCESS(client_id))` |
| staff_client_assignments | `staff_client_assignments_owner` | select insert delete | `T and OWNER` |
| | `staff_client_assignments_staff` | select | `T and STAFF and (membership_id = (select app.membership_id()) or ACCESS(client_id))` |
| invitations | `invitations_owner` | select insert update delete | `T and OWNER` |
| | `invitations_staff` | select | `T and STAFF and (ME(invited_by) or (role = 'client' and ACCESS(client_id)))` |
| | `invitations_staff` | insert | `T and STAFF and role = 'client' and permissions is null and ACCESS(client_id)` |
| | `invitations_staff` | update | `T and STAFF and ME(invited_by) and role = 'client'` |
| business_settings | `business_settings_member` | select | `T` |
| | `business_settings_owner` | insert update | `T and OWNER` |
| user_preferences | `user_preferences_self` | select insert update delete | `T and ME(user_id)` |
| consents | `consents_self` | select insert update | `T and ME(user_id)` |
| | `consents_owner` | select | `T and OWNER` |
| | `consents_staff` | select | `T and STAFF and user_id in (select app.accessible_user_ids())` (PERF-02) |
| clients | `clients_staff` | select update | `T and STAFF and ACCESS(id)` |
| | `clients_create` | insert | `T and STAFF and CAN_CREATE_CLIENTS` (T20; no `ACCESS(id)`, the row is new) |
| | `clients_client` | select update | `T and OWN(id)` (FL-04: the client edits their own profile; the guard limits the columns, §6.3) |
| client_notes | `client_notes_staff` | select insert | `T and STAFF and ACCESS(client_id)` |
| | `client_notes_author` | update delete | `T and STAFF and ACCESS(client_id) and (ME(author_user_id) or OWNER)` (ATK-11) |
| client_flags | `client_flags_staff` | select insert update | `T and STAFF and ACCESS(client_id)` (no delete: resolve a flag instead, ATK-11, CV-07) |
| tasks | `tasks_staff` | select insert update delete | `T and STAFF and (client_id is null or ACCESS(client_id))` |
| ai_requests | `ai_requests_staff` | select insert update | `T and STAFF and (client_id is null or ACCESS(client_id))` (no delete: a request ends `rejected`, ATK-07, CV-07; approval is limited by `perm_transitions`, §6.3) |
| packages | `packages_staff` | select insert update delete | `T and STAFF` |
| | `packages_client` | select | `T and CLIENT and is_public and archived_at is null` |
| subscriptions, client_entitlement_overrides | `<t>_staff` | select insert update | `T and STAFF and ACCESS(client_id)` |
| | `<t>_client` | select | `T and OWN(client_id)` |
| subscription_events | `subscription_events_staff` | select insert | `T and STAFF and ACCESS(client_id)` |
| | `subscription_events_client` | select | `T and OWN(client_id)` |
| payments | `payments_staff` | select insert update | `T and STAFF and ACCESS(client_id)` |
| | `payments_client` | select insert | `T and OWN(client_id)` |
| | `payments_client` | update | USING `T and OWN(client_id) and state = 'pending'`, CHECK `T and OWN(client_id)` |
| exercises, foods | `<t>_system` | select | `tenant_id is null` |
| | `<t>_member` | select | `T` |
| | `<t>_staff` | insert update | `T and STAFF` (no delete: retire an item with `hidden` or `tenant_hidden_items`, FL-08) |
| tenant_hidden_items | `tenant_hidden_items_member` | select | `T` |
| | `tenant_hidden_items_staff` | insert delete | `T and STAFF` |
| programs, nutrition_plans, forms | `<t>_staff_templates` | select insert update delete | `T and STAFF and client_id is null` |
| | `<t>_staff_copies` | select insert update delete | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| | `<t>_client` | select | `T and OWN(client_id)` |
| forms only | `forms_client_templates` | select | `T and CLIENT and client_id is null` |
| program_versions, nutrition_plan_versions, form_versions | `<t>_staff_templates` | select insert update delete | `T and STAFF and client_id is null` |
| | `<t>_staff_copies` | select insert update delete | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| | `<t>_client` | select | `T and OWN(client_id) and status in ('published','superseded')` |
| form_versions only | `form_versions_client_templates` | select | `T and CLIENT and client_id is null and status in ('published','superseded')` |
| metric_entries | `metric_entries_staff` | select insert | `T and STAFF and ACCESS(client_id)` (append-only: no update, T24) |
| | `metric_entries_client` | select insert | `T and OWN(client_id)` |
| measurement_sets, progress_photo_sets, inbody_records, workout_sessions, set_logs, meal_logs, supplement_logs, form_submissions | `<t>_staff` | select insert update | `T and STAFF and ACCESS(client_id)` |
| | `<t>_client` | select insert update | `T and OWN(client_id)` |
| calendar_events | `calendar_events_staff` | select insert update | `T and STAFF and ACCESS(client_id)` |
| | `calendar_events_client` | select update | `T and OWN(client_id)` |
| conversations | `conversations_staff_client` | select insert update | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| | `conversations_staff_internal` | select insert update | `T and STAFF and client_id is null and kind = 'internal'` |
| | `conversations_client` | select insert update | `T and OWN(client_id)` |
| messages | `messages_staff_client` | select insert update | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| | `messages_staff_internal` | select insert update | `T and STAFF and client_id is null` |
| | `messages_client` | select insert update | `T and OWN(client_id)` |
| message_revisions | `message_revisions_member` | select | `T and exists (select 1 from public.messages m where m.id = message_id)` (T10: the message's own policies decide, so a revision is visible exactly when its message is; no insert, update or delete for the runtime) |
| notifications | `notifications_self` | select update delete | `T and ME(user_id)` |
| notification_deliveries | `notification_deliveries_self` | select | `T and ME(user_id)` |
| push_subscriptions | `push_subscriptions_self` | select insert update delete | `T and ME(user_id)` |
| idempotency_keys | `idempotency_keys_self` | select insert delete | `T and ME(user_id)` |
| media | `media_tenant_assets` | select | `T and client_id is null` |
| | `media_tenant_assets_staff` | insert update delete | `T and STAFF and client_id is null` |
| | `media_client_staff` | select insert update | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| | `media_client_own` | select insert | `T and OWN(client_id)` |
| | `media_client_own` | update | USING `T and OWN(client_id) and (ME(owner_user_id) or review_state in ('requested','needs_resubmission'))`, CHECK `T and OWN(client_id)` (FL-11) |
| audit_log | `audit_log_owner` | select | `T and OWNER` |
| | `audit_log_staff` | select | `T and STAFF and client_id is not null and ACCESS(client_id)` |
| events | `events_owner` | select | `T and OWNER` |
| job_runs | `job_runs_staff` | select | `T and STAFF` |

Notes:
- **No policy calls `app.can_access_client(<column>)` or `app.can_access_user(<column>)`** (PERF-01, PERF-02). Test C17
  scans `pg_policies` for both names. `ACCESS(c)` and `user_id in (select app.accessible_user_ids())` are the only
  scope expressions; both become hashed SubPlans.
- `messages.client_id` is stamped from the conversation before WITH CHECK runs (§7), so a client can never post into an
  internal thread or another client's thread whatever the request says.
- **Creating clients (T20).** `clients_create_insert` lets the owner and every staff member with the `clients` /
  `create` permission insert a client of their tenant. Staff with `client_scope = assigned` could not create clients
  before, because `ACCESS(id)` is false for a new id; now the AFTER INSERT trigger `clients_80_assign_creator` (§7.10)
  assigns the new client to the creating membership. Row-level security checks the row that `INSERT ... RETURNING`
  returns before that trigger runs, so assigned-scope staff insert without `RETURNING` and read the row in the next
  statement (§12); with `RETURNING` the insert fails with `42501`. Staff without the permission get `42501` on the
  insert as well. All other staff reads and writes on a client still need `ACCESS(id)` (`clients_staff_select`,
  `clients_staff_update`).
- **Self-service (FL-04).** `clients_client_update` and `memberships_self_update` give the policy; the guard decides
  the columns (§6.3). A client may change only their own contact and profile columns; a member may change only their
  own display name, phone, locale and last-seen time. `status`, `tags`, `source`, `code`, and for memberships
  `role`, `status`, `permissions` and `client_id`, stay with staff or owner and fail with `42501`. The restrictive
  guard of `memberships` is `T or ME(user_id)` for USING and `T` for WITH CHECK, so a self-update needs the tenant pin,
  while the self-select does not.
- **Coach names for clients (FL-13).** A client sees only their own `memberships` row. Names of the coaches who wrote
  a message or reviewed something come from `app.team_directory()` (§7.10), never from a wider policy on `memberships`.
- **Notes (ATK-11).** Any staff member who can access the client reads and adds notes. Only the author or the owner
  edits or deletes one, so the author name on a note cannot be forged. `client_notes.author_user_id` stays immutable.
- **Media requests (FL-11).** A request that staff created is owned by the coach (`owner_user_id` is the inserting
  user). The client answers it by moving the row `requested -> uploaded`, or `needs_resubmission -> uploaded`, so the
  USING clause also admits rows in those two states that the client does not own. The WITH CHECK clause cannot repeat
  that test: after the move the row is `uploaded` and still owned by the coach. The guard (§6.3) limits what the client may
  change and which edges they may take, and `owner_user_id` is immutable.
- **Push subscriptions.** The row policy hides other users' rows, so a plain `INSERT ... ON CONFLICT` cannot take over
  an endpoint that another user registered. Registration goes through `app.register_push(...)` (§7.10); the unique
  key is `(tenant_id, endpoint)`.
- **Commands removed from the earlier matrix.** DELETE is no longer granted, so its policies are gone:

  | Table | Why (decision) |
  |---|---|
  | `memberships` | Owner disables instead of deleting; tasks, notes and history keep their references (FL-07, T13) |
  | `client_flags` | Safety flags are resolved, never erased (ATK-11, T19, CV-07) |
  | `ai_requests` | An AI request ends `rejected`, never deleted (CV-07, T21) |
  | `exercises`, `foods` | Retire with `hidden` or `tenant_hidden_items`; set logs and meal logs point at them (FL-08, SQLX-05, T14) |
  | `metric_entries` | Also loses UPDATE: corrections are new rows with `correction_of` (T24, C5) |

- Clients can read the tenant's form templates and their published versions: a sent check-in or assessment uses the
  template unless the coach customised it for the client, and the client must read the questions to answer.
  Program and nutrition templates stay staff-only.

Cases for §13 that belong to this section (the suites are the ones listed in §13):

- **Suite T.** Staff with the `assistant` preset (no `clients` / `create`) cannot insert a client (`42501`); staff with
  `clients` / `create` and `client_scope = assigned` inserts one without `RETURNING`, then reads and updates it;
  an owner inserts and reads it back with `RETURNING`; a client cannot insert a client; a client edits their own
  `phone` and cannot edit another client's row (zero rows) nor `status`, `tags`, `source` or `code` (guard,
  `42501`); a staff member edits their own `display_name`, not their `permissions`; a member cannot update another
  member's row; the owner cannot DELETE a membership (`42501`); a staff note is editable by its author and the owner,
  not by another staff member (zero rows); `client_notes` deletes follow the same rule.
- **Suite K.** Coach inserts a `requested` media row for client A; A completes `requested -> uploaded`; client B
  cannot (zero rows); A cannot move a coach-owned row that is `approved`; `metric_entries` accepts no UPDATE (`42501`).
- **Suite M.** A client sees the `message_revisions` rows of their own thread's messages and none of an internal thread
  or another client's thread; assigned staff see revisions of messages of clients they can access; the runtime gets
  `42501` on INSERT, UPDATE and DELETE of `message_revisions`.
- **Suite A.** `consents_staff`: all-scope staff and the owner see the consents of the whole tenant, assigned staff see
  the consents of team members and of their assigned clients only, a client sees only their own; no DELETE on
  `client_flags` and `ai_requests` (`42501`).
- **C17** (catalog): no row of `pg_policies` has `qual` or `with_check` containing `can_access_client` or
  `can_access_user`.
## 6. The row guard (`app.guard_row`)

One SECURITY INVOKER trigger function, configured per table by a JSON argument. It runs only for the runtime role
(§3.2), BEFORE INSERT OR UPDATE OR DELETE, as trigger `<table>_50_guard`. It checks the caller's module permission with
`app.has_perm` (§4), so `dawlyy_rls` needs EXECUTE on `app.guard_resolve(jsonb, text)` and `app.has_perm(text, text)`
(§3.4).

Errors: column, role and permission rules raise SQLSTATE `42501` (API → 403); state rules (`transitions`,
`editable_in`, `delete_when`, `monotonic`) raise `P0001` (API → 409), the same code the published-version rule already
uses. A config that names an unknown stamp token raises `P0001` too; that is a bug in the config, and test C08 catches
it first. Every raise also carries the key that refused it (6.1, "Error detail").

### 6.1 Config keys

| Key | Applies to | Meaning |
|---|---|---|
| `require_perm` | INSERT, UPDATE, DELETE, staff | `{ insert?, update?, delete? }`, each value `[module, action]`. A staff caller needs `app.has_perm(module, action)` for the operation being run, else `42501`. The owner always passes; clients are not affected (their limits are their own keys). It binds staff only. |
| `perm_transitions` | INSERT, UPDATE, staff | `{ "<to state>": [module, action] }` for the column of the table's `transitions`. A staff caller who inserts a row in that state, or changes the column to it, needs `app.has_perm(module, action)`, else `42501`. The owner always passes. |
| `stamp_insert` | INSERT | `{ column: token }` — overwritten whatever the caller sent. Tokens: `uid`, `role`, `now`, `null`. |
| `insert_eq` | INSERT, every runtime role | `{ column: value }` — the caller's value must equal it (JSON `null` = must be null). |
| `client_insert_eq` | INSERT, clients | Same, extra list for clients. |
| `immutable` | UPDATE | Columns that may not change, for every runtime role, the owner included. The list holds the identity columns and every column that only triggers, the guard's own stamps or the service write (6.3, "Columns that only triggers or the service write"). |
| `set_once` | UPDATE | Columns that may change only from null to a value. |
| `update_allow` | UPDATE | Allowlist for every role. |
| `client_update` | UPDATE, clients | Allowlist for clients. A client update on a table with neither `client_update` nor `update_allow` is rejected (fail-closed). |
| `staff_update` | UPDATE, staff | Allowlist for staff (owner is never limited by it). |
| `stamp_update` | UPDATE | `{ column: token }` set on every update, after all checks. These columns are exempt from the allowlist check only (`update_allow`, `client_update`, `staff_update`), so a caller who sends a stale `updated_at` is not refused. Never list a stamp_update column under `immutable`, `set_once`, `update_to` or `monotonic` (test C08). |
| `update_to` | UPDATE | `{ column: value }` — the column may change only to that value (unread counters: reset to `0`). Applies to every role. |
| `monotonic` | UPDATE | `[column, ...]` — a numeric or timestamp column never decreases and never goes back to null once set; a lower value is a stale write (`P0001`). Used for `client_updated_at` (offline sync) and `payments.refund_amount`. |
| `editable_in` | UPDATE | Array of rules `{ column, states, cols }` — the `cols` of a rule may change only while the OLD value of `column` is in `states` (JSON `null` is a state). Every rule applies; a column in two rules must satisfy both. |
| `transitions` | INSERT, UPDATE | `{ column, insert?, edges }` — initial values allowed on insert; `[from, to]` edges allowed on update. JSON `null` is a state. Every role is bound, the owner included. A config carries the key only when some runtime role can write `column`: a key whose column no role may write can never fire (N14, test C08). |
| `client_transitions` | INSERT, UPDATE, clients | Same shape; checked in addition to `transitions`. Present only when the table's client allowlist (`client_update` or `update_allow`) holds `column` (N14, test C08). |
| `on_transition` | INSERT, UPDATE | `{ column, stamps: { state: { column: token } } }` — entering `state` stamps columns. Token `null` clears a column, so a reopened row loses its completion stamps. |
| `on_set` | INSERT, UPDATE | `{ column: { column2: token } }` — `column` going from null to a value stamps `column2` (the column itself too, to ignore the caller's value). |
| `on_clear` | UPDATE | `{ column: { column2: token } }` — `column` going from a value back to null stamps `column2`. A column listed here is a toggle: it may go null to a value or value to null, never value to a different value (`42501`). |
| `delete_when` | DELETE | `{ column, states }` — a row may be deleted only while `column` is in `states`. |

Tokens: `uid` is the caller's user id, `role` the caller's role (`owner`, `staff` or `client`), `now` the transaction time,
`null` the SQL null.

The owner (N20). The owner has no allowlist of its own: `client_update` and `staff_update` do not apply to it, and
`require_perm` and `perm_transitions` bind staff only. On UPDATE the owner is limited by `immutable`, `set_once`,
`update_to`, `monotonic` and the transition keys (`transitions`, `editable_in` and the `on_clear` toggle rule), and by
`update_allow` on a table that has one. A client/staff allowlist therefore cannot protect a column from the owner: a column that
only triggers or the service may write goes in `immutable`, and an unread counter uses `update_to` (reset to `0` only)
for every runtime role, the owner included. Universal `update_allow` binds owners, staff and clients; the N20
owner-limits enumeration omits it; this design keeps the existing universal restriction pending Mohamed's
confirmation. Owners bypass only `client_update` and `staff_update`. Test M12 pins this for conversations; G05/G20 pin
universal allowlists.

Error detail (N2). Three layers answer `42501`: a missing table privilege (`permission denied for table`), a row-level
security policy (`new row violates row-level security policy`) and this guard. So every raise in `app.guard_row` and
`app.guard_resolve` sets, besides its `errcode` and message (both unchanged), `detail = 'guard:<config key that refused>'`
and `table = tg_table_name`, and `column = <the column at fault>` when one column is at fault (when several are, the
message lists all of them and `column` is the first). The key is the config key of the table above; for an allowlist it
is the list that applied (`client_update` for clients, `staff_update` for staff, `update_allow` otherwise) and for the
insert checks it is `insert_eq` or `client_insert_eq`, for state edges `transitions` or `client_transitions`. A client
update on a table with no allowlist is `guard:client_update`, no column. Two raises name an engine rule, not a key:
`guard:no_membership` (`42501`, no active membership; table only) and `guard:stamp` (`P0001`, unknown stamp token;
`app.guard_resolve` cannot see the table, so it sets `column` only). `require_perm` sets the table and no column.
postgres-js exposes the three fields as `error.detail`, `error.table_name` and `error.column_name`. The trigger functions of
§7 use `detail = 'rule:app.<function name>'` in the same way. Tests assert the detail (helpers `expectGuard(work, rule,
column?)`, `expectRls(work)` and `expectPrivilege(work)`, §13), never the code alone.

Server clock (engine rule, no config): on every runtime INSERT the guard sets `created_at` and `updated_at` to `now()`
when the table has those columns, whatever the caller sent. Times the client really knows stay in their own columns
(`performed_at`, `recorded_at`, `local_date`, `client_updated_at`) and are not stamped. Messages have no guard;
`app.message_rules` stamps their `created_at` (§7.4). Test C08b checks, per guarded table, that a runtime insert with a
forged `created_at` ends with `now()`.

Order: checks run on the caller's row first (permission by operation, `insert_eq`, initial states, `immutable`,
`set_once`, toggle rule, allowlist, `update_to`, `monotonic`, `editable_in`, `transitions`, `perm_transitions`), then
stamps are applied: `created_at`/`updated_at`, `stamp_insert` or `stamp_update`, `on_transition`, `on_set`, `on_clear`
(a later stamp wins). So a stamped column can be immutable for callers and still be set by the guard.

### 6.2 Functions (migration 0006)

```sql
-- Resolve a stamp spec { column: 'uid' | 'role' | 'now' | 'null' } to concrete values.
create or replace function app.guard_resolve(spec jsonb, who text) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  k text;
  v text;
  resolved jsonb := '{}'::jsonb;
begin
  for k, v in select key, value from jsonb_each_text(coalesce(spec, '{}'::jsonb)) loop
    if v is null or v not in ('uid', 'role', 'now', 'null') then
      raise exception 'guard: unknown stamp token % for column %', v, k
        using detail = 'guard:stamp', column = k;
    end if;
    resolved := resolved || jsonb_build_object(k, case v
      when 'uid' then to_jsonb(app.uid())
      when 'role' then to_jsonb(who)
      when 'null' then 'null'::jsonb
      else to_jsonb(now())
    end);
  end loop;
  return resolved;
end $$;
--> statement-breakpoint

-- Column, state, permission and attribution rules for statements run by the runtime role. See §6.1 for the keys.
create or replace function app.guard_row() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cfg jsonb := coalesce(nullif(tg_argv[0], ''), '{}')::jsonb;
  who text;
  newj jsonb;
  oldj jsonb;
  stamps jsonb := '{}'::jsonb;
  allowed jsonb;
  akey text;
  rkey text;
  mkey text;
  skip jsonb;
  machine jsonb;
  rule jsonb;
  perm jsonb;
  bad text;
  col text;
  st_old jsonb;
  st_new jsonb;
  lower_than boolean;
begin
  -- Service transactions, SECURITY DEFINER functions and foreign-key actions run as another role: trusted.
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  who := app.role();
  if who is null then
    raise exception 'no active membership'
      using errcode = '42501', detail = 'guard:no_membership', table = tg_table_name;
  end if;

  -- Module permission for this operation (staff only: the owner passes, clients follow their own keys).
  if who = 'staff' then
    perm := cfg #> array['require_perm', lower(tg_op)];
    if perm is not null and not app.has_perm(perm ->> 0, perm ->> 1) then
      raise exception '%: % requires the % % permission', tg_table_name, lower(tg_op), perm ->> 0, perm ->> 1
        using errcode = '42501', detail = 'guard:require_perm', table = tg_table_name;
    end if;
  end if;

  if tg_op = 'DELETE' then
    if cfg ? 'delete_when' then
      col := cfg #>> '{delete_when,column}';
      if not (cfg #> '{delete_when,states}') @> jsonb_build_array(to_jsonb(old) -> col) then
        raise exception '%: a row whose % is % cannot be deleted', tg_table_name, col, to_jsonb(old) ->> col
          using errcode = 'P0001', detail = 'guard:delete_when', table = tg_table_name, column = col;
      end if;
    end if;
    return old;
  end if;

  newj := to_jsonb(new);

  if tg_op = 'INSERT' then
    select string_agg(e.key, ', '), (array_agg(e.src))[1] into bad, rkey
      from (select m.key, m.value,
                   case when who = 'client' and (cfg -> 'client_insert_eq') ? m.key then 'client_insert_eq' else 'insert_eq' end as src
              from jsonb_each(coalesce(cfg -> 'insert_eq', '{}'::jsonb)
                              || case when who = 'client' then coalesce(cfg -> 'client_insert_eq', '{}'::jsonb) else '{}'::jsonb end) m) e
     where (newj -> e.key) is distinct from e.value;
    if bad is not null then
      raise exception '%: % cannot be set on insert', tg_table_name, bad
        using errcode = '42501', detail = 'guard:' || rkey, table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    foreach mkey in array array['transitions', 'client_transitions'] loop
      machine := case when mkey = 'transitions' or who = 'client' then cfg -> mkey end;
      continue when machine is null or not machine ? 'insert';
      col := machine ->> 'column';
      if not (machine -> 'insert') @> jsonb_build_array(newj -> col) then
        raise exception '%: a new row cannot start with % = %', tg_table_name, col, newj -> col
          using errcode = 'P0001', detail = 'guard:' || mkey, table = tg_table_name, column = col;
      end if;
    end loop;

    -- The server clock owns created_at and updated_at on every runtime insert, whatever the caller sent.
    if newj ? 'created_at' then
      stamps := stamps || jsonb_build_object('created_at', now());
    end if;
    if newj ? 'updated_at' then
      stamps := stamps || jsonb_build_object('updated_at', now());
    end if;
    stamps := stamps || app.guard_resolve(cfg -> 'stamp_insert', who);
  else
    oldj := to_jsonb(old);
    skip := coalesce(cfg -> 'stamp_update', '{}'::jsonb);

    select string_agg(c, ', ') into bad
      from jsonb_array_elements_text(coalesce(cfg -> 'immutable', '[]'::jsonb)) c
     where (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % cannot be changed', tg_table_name, bad
        using errcode = '42501', detail = 'guard:immutable', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    select string_agg(c, ', ') into bad
      from jsonb_array_elements_text(coalesce(cfg -> 'set_once', '[]'::jsonb)) c
     where (oldj -> c) <> 'null'::jsonb and (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % is already set', tg_table_name, bad
        using errcode = '42501', detail = 'guard:set_once', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    -- A toggle column (an on_clear key) goes from null to a value or back to null, never from one value to another.
    select string_agg(c, ', ') into bad
      from jsonb_object_keys(coalesce(cfg -> 'on_clear', '{}'::jsonb)) c
     where (oldj -> c) <> 'null'::jsonb and (newj -> c) <> 'null'::jsonb and (newj -> c) is distinct from (oldj -> c);
    if bad is not null then
      raise exception '%: % is already set; clear it first', tg_table_name, bad
        using errcode = '42501', detail = 'guard:on_clear', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    akey := case who
      when 'client' then case when cfg ? 'client_update' then 'client_update' else 'update_allow' end
      when 'staff' then case when cfg ? 'staff_update' then 'staff_update' else 'update_allow' end
      else 'update_allow'
    end;
    allowed := cfg -> akey;
    if who = 'client' and allowed is null then
      raise exception '%: clients cannot change these rows', tg_table_name
        using errcode = '42501', detail = 'guard:client_update', table = tg_table_name;
    end if;
    if allowed is not null then
      select string_agg(n.key, ', ') into bad
        from jsonb_each(newj) n
       where n.value is distinct from (oldj -> n.key)
         and not (allowed ? n.key)
         and not (skip ? n.key);
      if bad is not null then
        raise exception '%: % cannot be changed by %', tg_table_name, bad, who
          using errcode = '42501', detail = 'guard:' || akey, table = tg_table_name, column = split_part(bad, ', ', 1);
      end if;
    end if;

    -- A listed column may only be changed to the listed value (unread counters: reset to 0).
    select string_agg(e.key, ', ') into bad
      from jsonb_each(coalesce(cfg -> 'update_to', '{}'::jsonb)) e
     where (newj -> e.key) is distinct from (oldj -> e.key)
       and (newj -> e.key) is distinct from e.value;
    if bad is not null then
      raise exception '%: % can only be set to its reset value', tg_table_name, bad
        using errcode = '42501', detail = 'guard:update_to', table = tg_table_name, column = split_part(bad, ', ', 1);
    end if;

    -- A listed column never decreases and never goes back to null (numeric and timestamp columns only).
    for col in select jsonb_array_elements_text(coalesce(cfg -> 'monotonic', '[]'::jsonb)) loop
      st_old := oldj -> col;
      st_new := newj -> col;
      if st_new is distinct from st_old and st_old <> 'null'::jsonb then
        if st_new = 'null'::jsonb then
          lower_than := true;
        elsif jsonb_typeof(st_new) = 'number' then
          lower_than := (st_new #>> '{}')::numeric < (st_old #>> '{}')::numeric;
        else
          lower_than := (st_new #>> '{}')::timestamptz < (st_old #>> '{}')::timestamptz;
        end if;
        if lower_than then
          raise exception '%: % cannot decrease (stale write)', tg_table_name, col
            using errcode = 'P0001', detail = 'guard:monotonic', table = tg_table_name, column = col;
        end if;
      end if;
    end loop;

    for rule in select jsonb_array_elements(coalesce(cfg -> 'editable_in', '[]'::jsonb)) loop
      col := rule ->> 'column';
      if not (rule -> 'states') @> jsonb_build_array(oldj -> col) then
        select string_agg(c, ', ') into bad
          from jsonb_array_elements_text(rule -> 'cols') c
         where (newj -> c) is distinct from (oldj -> c);
        if bad is not null then
          raise exception '%: % can only change while % is one of %', tg_table_name, bad, col, rule -> 'states'
            using errcode = 'P0001', detail = 'guard:editable_in', table = tg_table_name, column = split_part(bad, ', ', 1);
        end if;
      end if;
    end loop;

    foreach mkey in array array['transitions', 'client_transitions'] loop
      machine := case when mkey = 'transitions' or who = 'client' then cfg -> mkey end;
      continue when machine is null;
      col := machine ->> 'column';
      st_old := oldj -> col;
      st_new := newj -> col;
      if st_new is distinct from st_old and not exists (
        select 1 from jsonb_array_elements(machine -> 'edges') e where e -> 0 = st_old and e -> 1 = st_new
      ) then
        raise exception '%: % cannot move from % to %', tg_table_name, col, st_old, st_new
          using errcode = 'P0001', detail = 'guard:' || mkey, table = tg_table_name, column = col;
      end if;
    end loop;

    stamps := app.guard_resolve(skip, who);
  end if;

  -- Entering a state needs the module permission the config names for that state (staff only).
  if who = 'staff' and cfg ? 'perm_transitions' then
    col := cfg #>> '{transitions,column}';
    if tg_op = 'INSERT' or (newj -> col) is distinct from (oldj -> col) then
      perm := cfg -> 'perm_transitions' -> (newj ->> col);
      if perm is not null and not app.has_perm(perm ->> 0, perm ->> 1) then
        raise exception '%: moving % to % requires the % % permission', tg_table_name, col, newj ->> col,
          perm ->> 0, perm ->> 1
          using errcode = '42501', detail = 'guard:perm_transitions', table = tg_table_name, column = col;
      end if;
    end if;
  end if;

  -- Entering a state stamps columns (also on insert).
  if cfg ? 'on_transition' then
    col := cfg #>> '{on_transition,column}';
    if (newj -> col) is distinct from (case when tg_op = 'UPDATE' then oldj -> col end)
       and (cfg #> '{on_transition,stamps}') ? (newj ->> col) then
      stamps := stamps || app.guard_resolve(cfg #> array['on_transition', 'stamps', newj ->> col], who);
    end if;
  end if;

  -- A column going from null to a value stamps columns (also on insert).
  for col in select jsonb_object_keys(coalesce(cfg -> 'on_set', '{}'::jsonb)) loop
    if (newj -> col) <> 'null'::jsonb and (tg_op = 'INSERT' or (oldj -> col) = 'null'::jsonb) then
      stamps := stamps || app.guard_resolve(cfg -> 'on_set' -> col, who);
    end if;
  end loop;

  -- A column going from a value back to null stamps columns (reopen).
  if tg_op = 'UPDATE' then
    for col in select jsonb_object_keys(coalesce(cfg -> 'on_clear', '{}'::jsonb)) loop
      if (newj -> col) = 'null'::jsonb and (oldj -> col) <> 'null'::jsonb then
        stamps := stamps || app.guard_resolve(cfg -> 'on_clear' -> col, who);
      end if;
    end loop;
  end if;

  if stamps <> '{}'::jsonb then
    new := jsonb_populate_record(new, stamps);
  end if;
  return new;
end $$;
--> statement-breakpoint
```

The sole `app.task_assignee_check` / `tasks_20_assignee` and `app.media_proof_rules` / `media_20_proof` definitions are in §7.11.2–§7.11.3 (SECURITY DEFINER, every role; invalid assignee: `23503`, `rule:app.task_assignee_check`; protected proof: `P0001`, `rule:app.media_proof_rules`).

### 6.3 Per-table guard triggers (migration 0006)

Every guard trigger is `<table>_50_guard`, `before insert or update or delete ... for each row execute function
app.guard_row('<json>')`. The block below holds the literal statements and is the single source of every config: the
table before it only says in words what each config enforces. Drop and create, so the file stays re-runnable. The JSON
must stay free of single quotes, and every trigger name stays within 63 bytes (D1).

| Table | Trigger | What the config enforces |
|---|---|---|
| tenants | `tenants_50_guard` | Counters and `created_at` are immutable (the counters move only through the definer functions of §7.7). |
| memberships | `memberships_50_guard` | Identity columns are immutable. A client or a staff member may change only `display_name`, `phone`, `locale` and `last_seen_at` of their own row (policy `memberships_self`, §5.2); `status`, `role` and `permissions` stay with the owner, who is not limited by an allowlist. Trigger `memberships_40_owner` (§7) keeps one active owner per tenant. |
| staff_client_assignments | `staff_client_assignments_50_guard` | `assigned_by` is the caller. |
| invitations | `invitations_50_guard` | Server fields and the invitation token are immutable; staff may only revoke or expire (`pending` to `revoked` or `expired`); a new invitation starts `pending` with no acceptance. |
| business_settings | `business_settings_50_guard` | `updated_by` is the caller; `tenant_id` is immutable. |
| user_preferences | `user_preferences_50_guard` | Only `preferences` changes. |
| consents | `consents_50_guard` | Append-only. `withdrawn_at` goes from null to a value once and is then stamped `now()`. |
| clients | `clients_50_guard` | `code` and `membership_id` are empty on insert (the trigger assigns the code) and immutable afterwards. A client may edit the profile columns of the list (FL-04) and nothing else; `status`, `tags`, `source`, `started_on` and `archived_at` are staff columns. |
| client_notes | `client_notes_50_guard` | `author_user_id` is the caller and immutable. |
| client_flags | `client_flags_50_guard` | `raised_at` is the server clock. `resolved_at` is a toggle: a caller sets it from null to any value and the guard stamps `now()` and `resolved_by = caller`; setting it back to null clears `resolved_by`; changing it from one value to another is refused. `resolved_by` cannot be written. No runtime DELETE (§3.3). |
| tasks | `tasks_50_guard` | Runtime inserts are manual only (`source`, `source_event_id`, `dedupe_key` pinned), `client_id` is immutable (S3), the state machine is `open`/`snoozed` to `done` or `cancelled`, and `done`/`cancelled` back to `open`. Entering `done` stamps `completed_at` and `completed_by`; entering `open`, `snoozed` or `cancelled` clears them. Trigger `tasks_20_assignee` (§7.11.2) requires an active owner or staff assignee for every role; invalid assignees get 23503, rule:app.task_assignee_check, column assignee_membership_id. |
| ai_requests | `ai_requests_50_guard` | Inserts start in `draft`. `output` and `model` change only while `draft`. `draft` to `approved` needs `ai`/`publish` (staff) and stamps `approved_at`, `approved_by`; `draft` to `rejected` needs no permission. No runtime DELETE. |
| packages | `packages_50_guard` | Staff need `packages` create, edit and delete for the matching command. |
| subscriptions | `subscriptions_50_guard` | Staff need `billing` create or edit. `price` and `currency` are immutable (a correction is a new subscription). Inserts start `pending` or `active`; the 19 edges equal core `machines.subscription` after FL-18 (cancel from `pending` and `suspended` too). |
| subscription_events | `subscription_events_50_guard` | Staff need `billing`/`edit`; `actor_user_id` is the caller. The ledger is staff-declared; `audit_log` is the record of what changed (§10). |
| client_entitlement_overrides | `client_entitlement_overrides_50_guard` | Staff need `billing`/`edit` for INSERT and UPDATE. `revoked_at` is set once and server-stamped; removal is revocation. Runtime DELETE always fails at table privilege. |
| payments | `payments_50_guard` | See "Payments" below. |
| exercises | `exercises_50_guard` | Unchanged. No runtime DELETE (§3.3). |
| foods | `foods_50_guard` | Unchanged. No runtime DELETE (§3.3). |
| tenant_hidden_items | `tenant_hidden_items_50_guard` | `hidden_by` is the caller. |
| programs | `programs_50_guard` | Head. `published_version_id` is null on insert and immutable at runtime: the definer trigger `<versions table>_90_pointers` (§7.3) maintains it. |
| nutrition_plans | `nutrition_plans_50_guard` | Same as `programs`. |
| forms | `forms_50_guard` | Same as `programs`; `form_kind` is immutable too. |
| program_versions | `program_versions_50_guard` | VERSION config below, `<head>` = `program_id`, `<module>` = `programs`. |
| nutrition_plan_versions | `nutrition_plan_versions_50_guard` | VERSION config, `<head>` = `plan_id`, `<module>` = `nutrition`. |
| form_versions | `form_versions_50_guard` | VERSION config, `<head>` = `form_id`, `<module>` = `forms`. |
| metric_entries | `metric_entries_50_guard` | Append-only: the runtime has no UPDATE (§3.3). A client insert pins `source = manual`; device and import rows come from service transactions or definer functions. |
| measurement_sets | `measurement_sets_50_guard` | `taken_by` is `client` on client inserts; client edits are monotonic in `client_updated_at`. |
| progress_photo_sets | `progress_photo_sets_50_guard` | Client edits are monotonic in `client_updated_at`. |
| inbody_records | `inbody_records_50_guard` | A client insert pins `source = manual` and leaves `normalized` at its default `{}`; no runtime role can update `normalized`, and every runtime insert leaves it at `{}` (the API computes it in a service transaction). |
| workout_sessions | `workout_sessions_50_guard` | Every runtime insert leaves `summary` null and no runtime role can update it (CV-04); the API writes `summary` from `set_logs` in a service transaction. Client edits are monotonic in `client_updated_at`. |
| set_logs | `set_logs_50_guard` | Client edits are monotonic in `client_updated_at`; `deleted_at` is the tombstone. |
| meal_logs | `meal_logs_50_guard` | Client edits are monotonic in `client_updated_at`. |
| supplement_logs | `supplement_logs_50_guard` | Client edits are monotonic in `client_updated_at`. |
| form_submissions | `form_submissions_50_guard` | Answers change only while the check-in is `scheduled`, `due` or `overdue`; the client machine allows only `due`/`overdue` to `submitted`; stamps `submitted_at`, `reviewed_at`, `reviewed_by`; monotonic `client_updated_at`. |
| calendar_events | `calendar_events_50_guard` | Runtime inserts are manual only (`source = manual`, `rule_key` null). Clients move `scheduled`/`due`/`overdue` to `completed` or `skipped`. Entering `completed`, `skipped` or `cancelled` stamps its column and clears the other two; entering `scheduled`, `due`, `overdue` or `rescheduled` clears all three (FL-16). The three stamp columns are immutable to callers (the guard writes them), so no role edits them without a state change. |
| conversations | `conversations_50_guard` | Unread counters may only be set to 0 (`update_to`, every role, the owner included). `last_message_at` and `last_message_preview` are immutable for every runtime role, the owner included: only the definer triggers of §7.4 and the service write them. A runtime insert starts with both null and both counters 0 (`insert_eq`). A client updates only its own counter; staff update `subject`, `archived_at` and their counter; the owner may also reset both counters. |
| notifications | `notifications_50_guard` | Only `read_at` changes. |
| push_subscriptions | `push_subscriptions_50_guard` | `endpoint`, `last_used_at` and `failed_at` are immutable. Runtime inserts leave the two times null; only the service or `app.register_push` writes them. Runtime updates change only `keys` and `user_agent`; a row never re-points to another browser. |
| media | `media_50_guard` | See "Media" below. |

Payments (T12, CV-01, CV-05, FL-05, FL-09). Four rules carry the money history:

- **Who may do what.** Staff need `billing`/`create` to insert and `billing`/`edit` to update (`require_perm`). Entering `verified`, `rejected` or `refunded` also needs `billing`/`verify` (`perm_transitions`), on insert as well as on update. The owner passes both checks. A client never verifies: `state` is not in the client's `client_update` list and a client insert must start `pending` (`client_insert_eq`), so the table has no `client_transitions` key (it could never fire, N14).
- **What may change, and when** (`editable_in`, three rules): `amount`, `currency`, `method`, `proof_media_id`, `reference` and `paid_at` only while the old state is `pending`; `refund_amount` only while the old state is `verified`; `rejected_reason` only while the old state is `pending`. `subscription_id` is `set_once`, so a verified payment can still be linked to its subscription once. Clients may update only `proof_media_id`, `reference` and `paid_at`, and insert with `notes` null: a client who typed a wrong amount submits a new pending payment.
- **Refunds.** Every staff change to `refund_amount` needs `billing`/`verify` (`app.payment_refund_permission`, §7.11.4), even without a state change. A partial refund keeps the payment `verified`; `refunded` means fully refunded (the CHECK `payments_refund_state_ck` of §8.3). `refund_amount` is cumulative and `monotonic`. The first refund stamps `refunded_at` (`on_set`); `refunded_at` is immutable to callers.
- **Stamps.** `created_by` is the caller; entering `verified` stamps `verified_at` and `verified_by`; the receipt number comes from the definer trigger of §7.7.

Media (T15, FL-10, FL-11, SQLX-11, FL-19). `bucket`, `path`, `kind`, `purpose` and the review stamps are immutable. A resubmission may change `mime_type` (the new file overwrites the same Storage object), but only while `review_state` is `requested` or `needs_resubmission`. Bytes, dimensions, duration, `metadata`, `uploaded_at` and `deleted_at` change only while `review_state` is null or one of `requested`, `uploaded`, `processing`, `queued_for_review`, `needs_resubmission`, `archived`; once a file is `approved` or `rejected` nobody can rewrite or soft-delete it through the runtime. Trigger `media_20_proof` also refuses to soft-delete a payment proof that a payment outside `pending` points at, whatever the review state (proof rows usually have a null state). Its sole §7.11.3 definition is SECURITY DEFINER
and binds every role, including service purges, with P0001, rule:app.media_proof_rules, table media, column deleted_at.
Erasure removes the payment/media graph through its dedicated delete path.

The edge `null` to `uploaded` is the tenant-asset path: logos, exercise thumbnails and other assets have no review. It is not in core `machines.mediaReview`; F02 documents it as the one allowed extra edge.

Columns that only triggers or the service write (N20). Each one is in its table's `immutable` list, so no runtime role
can write it, the owner included (client/staff allowlists would not stop the owner, §6.1). The unread counters are the exception: the
runtime may reset them, so they use `update_to`.

| Column | Written by | Runs as | Config |
|---|---|---|---|
| `tenants.client_counter`, `tenants.receipt_counter` | `app.next_client_code`, `app.next_receipt_no` (§7.7), called from `clients_90_code` and `payments_90_receipt` | SECURITY DEFINER | `immutable` |
| `clients.code` | `app.assign_client_code` (`clients_90_code`, §7.7) | SECURITY DEFINER | `immutable`; `insert_eq` pins `''` |
| `payments.receipt_no` | `app.payment_receipt` (`payments_90_receipt`, §7.7) | SECURITY DEFINER | `immutable`; `insert_eq` pins null |
| `programs`, `nutrition_plans`, `forms`: `published_version_id` | `app.version_pointers` (§7.3.1 and §7.3.2) | SECURITY DEFINER | `immutable`; `insert_eq` pins null; earlier runtime refusal is `42501`, `rule:app.head_rules` |
| `conversations.last_message_at`, `conversations.last_message_preview` | `app.on_message_insert`, `app.on_message_update` (§7.4) | SECURITY DEFINER | `immutable`; `insert_eq` pins null |
| `conversations.unread_for_client`, `conversations.unread_for_coach` | `app.on_message_insert` raises them (§7.4); the runtime resets them | SECURITY DEFINER; runtime | `update_to` (`0` only, every role); `insert_eq` pins `0` |
| `workout_sessions.summary`, `inbody_records.normalized`, `push_subscriptions.last_used_at`, `push_subscriptions.failed_at` | API or worker through the service; `app.register_push` resets `failed_at` | service; SECURITY DEFINER | `immutable`; `insert_eq` pins null / `{}` defaults |
| `calendar_events.completed_at`, `skipped_at`, `cancelled_at` | the guard (`on_transition`); the service (due processor, rule engine) | the guard; service | `immutable`; `insert_eq` pins null |
| `payments.verified_at`, `verified_by`, `refunded_at`; `tasks.completed_at`, `completed_by`; `form_submissions.submitted_at`, `reviewed_at`, `reviewed_by`; `media.reviewed_at`, `reviewed_by`; `ai_requests.approved_at`, `approved_by`; `client_flags.resolved_by`; the version tables' `published_at`, `published_by`, `superseded_at` | the guard (`on_transition`, `on_set`, `on_clear`); the service for the version tables (§12) | the guard; service | `immutable` |

The guard skips service transactions and SECURITY DEFINER code (`current_user <> 'dawlyy_rls'`, 6.2 and §3.2), so every
writer above passes: the definer functions run as the table owner, and the guard's own stamps are applied after its
checks, which see only the row the caller sent. The two BEFORE triggers `clients_90_code` and `payments_90_receipt` run
after `<table>_50_guard`; the guard sees `code` and `receipt_no` as the caller sent them (`insert_eq` pins both) and the
numbers are assigned afterwards. `current_version_id` is not on the list: staff and the API set it, and
`app.version_pointers` only clears it.

VERSION config (the publish machine is `machines.publish` from `@dawlyy/core/state`; test F02 checks the DB allows
exactly those edges). Replace `<head>` and `<module>` as the table rows say; the statements below already hold the three
expansions. A staff member who is not the owner needs `<module>`/`publish` to enter `published` (T20); `draft` to
`published` has no owner-only shortcut in the database.

Runtime versions may start `draft` or `published`. Published INSERT supplies null publication stamps, requires
the corresponding staff publish permission, and receives `published_at`/`published_by` from `on_transition` and its
head pointer from `version_pointers`. Other initial states are refused. Frozen-content protection, uniqueness and
version ordering remain unchanged. C08/G22 goldens include both permitted initial states.

```json
{"stamp_insert":{"created_by":"uid"},
 "insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},
 "immutable":["id","tenant_id","client_id","<head>","version_no","created_by","created_at","published_at","published_by","superseded_at"],
 "editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],
 "transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},
 "perm_transitions":{"published":["<module>","publish"]},
 "on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},
 "delete_when":{"column":"status","states":["draft"]}}
```

The statements (generated from one list and run against a scratch database; 40 guard triggers; the two helper
triggers are defined only in §7.11):

```sql
drop trigger if exists tenants_50_guard on public.tenants;
--> statement-breakpoint
create trigger tenants_50_guard before insert or update or delete on public.tenants for each row execute function app.guard_row('{"immutable":["id","client_counter","receipt_counter","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists memberships_50_guard on public.memberships;
--> statement-breakpoint
create trigger memberships_50_guard before insert or update or delete on public.memberships for each row execute function app.guard_row('{"immutable":["id","tenant_id","user_id","client_id","created_at"],"stamp_update":{"updated_at":"now"},"client_update":["display_name","phone","locale","last_seen_at"],"staff_update":["display_name","phone","locale","last_seen_at"]}');
--> statement-breakpoint
drop trigger if exists staff_client_assignments_50_guard on public.staff_client_assignments;
--> statement-breakpoint
create trigger staff_client_assignments_50_guard before insert or update or delete on public.staff_client_assignments for each row execute function app.guard_row('{"stamp_insert":{"assigned_by":"uid"}}');
--> statement-breakpoint
drop trigger if exists invitations_50_guard on public.invitations;
--> statement-breakpoint
create trigger invitations_50_guard before insert or update or delete on public.invitations for each row execute function app.guard_row('{"stamp_insert":{"invited_by":"uid"},"insert_eq":{"status":"pending","accepted_at":null,"accepted_user_id":null},"immutable":["id","tenant_id","token_hash","role","client_id","invited_by","accepted_at","accepted_user_id","created_at"],"staff_update":["status"],"transitions":{"column":"status","insert":["pending"],"edges":[["pending","revoked"],["pending","expired"]]}}');
--> statement-breakpoint
drop trigger if exists business_settings_50_guard on public.business_settings;
--> statement-breakpoint
create trigger business_settings_50_guard before insert or update or delete on public.business_settings for each row execute function app.guard_row('{"stamp_insert":{"updated_by":"uid"},"immutable":["tenant_id"],"stamp_update":{"updated_by":"uid","updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists user_preferences_50_guard on public.user_preferences;
--> statement-breakpoint
create trigger user_preferences_50_guard before insert or update or delete on public.user_preferences for each row execute function app.guard_row('{"immutable":["tenant_id","user_id"],"update_allow":["preferences"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists consents_50_guard on public.consents;
--> statement-breakpoint
create trigger consents_50_guard before insert or update or delete on public.consents for each row execute function app.guard_row('{"stamp_insert":{"accepted_at":"now"},"insert_eq":{"withdrawn_at":null},"update_allow":["withdrawn_at"],"set_once":["withdrawn_at"],"on_set":{"withdrawn_at":{"withdrawn_at":"now"}}}');
--> statement-breakpoint
drop trigger if exists clients_50_guard on public.clients;
--> statement-breakpoint
create trigger clients_50_guard before insert or update or delete on public.clients for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"code":"","membership_id":null},"immutable":["id","tenant_id","code","membership_id","created_by","created_at"],"stamp_update":{"updated_at":"now"},"client_update":["first_name","last_name","display_name","email","phone","whatsapp","birth_date","locale","timezone","profile","search_key"]}');
--> statement-breakpoint
drop trigger if exists client_notes_50_guard on public.client_notes;
--> statement-breakpoint
create trigger client_notes_50_guard before insert or update or delete on public.client_notes for each row execute function app.guard_row('{"stamp_insert":{"author_user_id":"uid"},"immutable":["id","tenant_id","client_id","author_user_id","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists client_flags_50_guard on public.client_flags;
--> statement-breakpoint
create trigger client_flags_50_guard before insert or update or delete on public.client_flags for each row execute function app.guard_row('{"stamp_insert":{"raised_at":"now"},"insert_eq":{"resolved_by":null},"immutable":["id","tenant_id","client_id","raised_at","resolved_by"],"on_set":{"resolved_at":{"resolved_at":"now","resolved_by":"uid"}},"on_clear":{"resolved_at":{"resolved_by":"null"}}}');
--> statement-breakpoint
drop trigger if exists tasks_50_guard on public.tasks;
--> statement-breakpoint
create trigger tasks_50_guard before insert or update or delete on public.tasks for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"completed_by":null,"source":"manual","source_event_id":null,"dedupe_key":null},"immutable":["id","tenant_id","client_id","created_by","created_at","completed_at","completed_by","source","source_event_id","dedupe_key"],"stamp_update":{"updated_at":"now"},"transitions":{"column":"state","insert":["open"],"edges":[["open","snoozed"],["snoozed","open"],["open","done"],["snoozed","done"],["open","cancelled"],["snoozed","cancelled"],["done","open"],["cancelled","open"]]},"on_transition":{"column":"state","stamps":{"done":{"completed_at":"now","completed_by":"uid"},"open":{"completed_at":"null","completed_by":"null"},"snoozed":{"completed_at":"null","completed_by":"null"},"cancelled":{"completed_at":"null","completed_by":"null"}}}}');
--> statement-breakpoint
drop trigger if exists ai_requests_50_guard on public.ai_requests;
--> statement-breakpoint
create trigger ai_requests_50_guard before insert or update or delete on public.ai_requests for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"approved_by":null,"approved_at":null},"immutable":["id","tenant_id","client_id","kind","input","created_by","created_at","approved_by","approved_at"],"editable_in":[{"column":"state","states":["draft"],"cols":["output","model"]}],"transitions":{"column":"state","insert":["draft"],"edges":[["draft","approved"],["draft","rejected"]]},"perm_transitions":{"approved":["ai","publish"]},"on_transition":{"column":"state","stamps":{"approved":{"approved_at":"now","approved_by":"uid"}}}}');
--> statement-breakpoint
drop trigger if exists packages_50_guard on public.packages;
--> statement-breakpoint
create trigger packages_50_guard before insert or update or delete on public.packages for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"},"require_perm":{"insert":["packages","create"],"update":["packages","edit"],"delete":["packages","delete"]}}');
--> statement-breakpoint
drop trigger if exists subscriptions_50_guard on public.subscriptions;
--> statement-breakpoint
create trigger subscriptions_50_guard before insert or update or delete on public.subscriptions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","client_id","package_id","package_snapshot","price","currency","created_by","created_at"],"stamp_update":{"updated_at":"now"},"require_perm":{"insert":["billing","create"],"update":["billing","edit"]},"transitions":{"column":"state","insert":["pending","active"],"edges":[["pending","active"],["active","grace"],["active","expired"],["grace","expired"],["active","paused"],["paused","active"],["active","cancelled"],["grace","cancelled"],["paused","cancelled"],["pending","cancelled"],["suspended","cancelled"],["pending","suspended"],["active","suspended"],["grace","suspended"],["paused","suspended"],["expired","suspended"],["suspended","active"],["expired","active"],["grace","active"]]}}');
--> statement-breakpoint
drop trigger if exists subscription_events_50_guard on public.subscription_events;
--> statement-breakpoint
create trigger subscription_events_50_guard before insert or update or delete on public.subscription_events for each row execute function app.guard_row('{"stamp_insert":{"actor_user_id":"uid"},"require_perm":{"insert":["billing","edit"]}}');
--> statement-breakpoint
drop trigger if exists client_entitlement_overrides_50_guard on public.client_entitlement_overrides;
--> statement-breakpoint
create trigger client_entitlement_overrides_50_guard before insert or update or delete on public.client_entitlement_overrides for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"revoked_at":null},"update_allow":["revoked_at"],"set_once":["revoked_at"],"on_set":{"revoked_at":{"revoked_at":"now"}},"require_perm":{"insert":["billing","edit"],"update":["billing","edit"]}}');
--> statement-breakpoint
drop trigger if exists payments_50_guard on public.payments;
--> statement-breakpoint
create trigger payments_50_guard before insert or update or delete on public.payments for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"verified_at":null,"verified_by":null,"receipt_no":null,"refunded_at":null,"refund_amount":null,"rejected_reason":null},"client_insert_eq":{"state":"pending","notes":null,"provider":null,"provider_ref":null},"immutable":["id","tenant_id","client_id","created_by","created_at","verified_at","verified_by","receipt_no","refunded_at","provider","provider_ref"],"set_once":["subscription_id"],"monotonic":["refund_amount"],"stamp_update":{"updated_at":"now"},"client_update":["proof_media_id","reference","paid_at"],"editable_in":[{"column":"state","states":["pending"],"cols":["amount","currency","method","proof_media_id","reference","paid_at"]},{"column":"state","states":["verified"],"cols":["refund_amount"]},{"column":"state","states":["pending"],"cols":["rejected_reason"]}],"transitions":{"column":"state","insert":["pending","verified"],"edges":[["pending","verified"],["pending","rejected"],["verified","refunded"]]},"perm_transitions":{"verified":["billing","verify"],"rejected":["billing","verify"],"refunded":["billing","verify"]},"require_perm":{"insert":["billing","create"],"update":["billing","edit"]},"on_transition":{"column":"state","stamps":{"verified":{"verified_at":"now","verified_by":"uid"}}},"on_set":{"refund_amount":{"refunded_at":"now"}}}');
--> statement-breakpoint
drop trigger if exists exercises_50_guard on public.exercises;
--> statement-breakpoint
create trigger exercises_50_guard before insert or update or delete on public.exercises for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists foods_50_guard on public.foods;
--> statement-breakpoint
create trigger foods_50_guard before insert or update or delete on public.foods for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"immutable":["id","tenant_id","created_by","created_at"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists tenant_hidden_items_50_guard on public.tenant_hidden_items;
--> statement-breakpoint
create trigger tenant_hidden_items_50_guard before insert or update or delete on public.tenant_hidden_items for each row execute function app.guard_row('{"stamp_insert":{"hidden_by":"uid"}}');
--> statement-breakpoint
drop trigger if exists programs_50_guard on public.programs;
--> statement-breakpoint
create trigger programs_50_guard before insert or update or delete on public.programs for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists nutrition_plans_50_guard on public.nutrition_plans;
--> statement-breakpoint
create trigger nutrition_plans_50_guard before insert or update or delete on public.nutrition_plans for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists forms_50_guard on public.forms;
--> statement-breakpoint
create trigger forms_50_guard before insert or update or delete on public.forms for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_version_id":null},"immutable":["id","tenant_id","kind","form_kind","client_id","template_id","created_by","created_at","published_version_id"],"stamp_update":{"updated_at":"now"}}');
--> statement-breakpoint
drop trigger if exists program_versions_50_guard on public.program_versions;
--> statement-breakpoint
create trigger program_versions_50_guard before insert or update or delete on public.program_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","program_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["programs","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_50_guard on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_50_guard before insert or update or delete on public.nutrition_plan_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","plan_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["nutrition","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists form_versions_50_guard on public.form_versions;
--> statement-breakpoint
create trigger form_versions_50_guard before insert or update or delete on public.form_versions for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"published_at":null,"published_by":null,"superseded_at":null},"immutable":["id","tenant_id","client_id","form_id","version_no","created_by","created_at","published_at","published_by","superseded_at"],"editable_in":[{"column":"status","states":["draft"],"cols":["document","change_note"]}],"transitions":{"column":"status","insert":["draft","published"],"edges":[["draft","in_review"],["in_review","approved"],["in_review","draft"],["approved","published"],["draft","published"],["published","superseded"],["draft","archived"],["in_review","archived"],["approved","archived"],["published","archived"],["superseded","archived"]]},"perm_transitions":{"published":["forms","publish"]},"on_transition":{"column":"status","stamps":{"published":{"published_at":"now","published_by":"uid"},"superseded":{"superseded_at":"now"}}},"delete_when":{"column":"status","states":["draft"]}}');
--> statement-breakpoint
drop trigger if exists metric_entries_50_guard on public.metric_entries;
--> statement-breakpoint
create trigger metric_entries_50_guard before insert or update or delete on public.metric_entries for each row execute function app.guard_row('{"client_insert_eq":{"source":"manual"}}');
--> statement-breakpoint
drop trigger if exists measurement_sets_50_guard on public.measurement_sets;
--> statement-breakpoint
create trigger measurement_sets_50_guard before insert or update or delete on public.measurement_sets for each row execute function app.guard_row('{"client_insert_eq":{"taken_by":"client"},"immutable":["id","tenant_id","client_id","client_uuid","taken_by","created_at"],"monotonic":["client_updated_at"],"client_update":["local_date","values","note","client_updated_at"]}');
--> statement-breakpoint
drop trigger if exists progress_photo_sets_50_guard on public.progress_photo_sets;
--> statement-breakpoint
create trigger progress_photo_sets_50_guard before insert or update or delete on public.progress_photo_sets for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["local_date","poses","weight_kg","note","client_updated_at"]}');
--> statement-breakpoint
drop trigger if exists inbody_records_50_guard on public.inbody_records;
--> statement-breakpoint
create trigger inbody_records_50_guard before insert or update or delete on public.inbody_records for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"client_insert_eq":{"source":"manual"},"immutable":["id","tenant_id","client_id","created_by","created_at","normalized"],"client_update":["local_date","raw_media_id","fields","note"],"insert_eq":{"normalized":{}}}');
--> statement-breakpoint
drop trigger if exists workout_sessions_50_guard on public.workout_sessions;
--> statement-breakpoint
create trigger workout_sessions_50_guard before insert or update or delete on public.workout_sessions for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","program_id","program_version_id","phase_id","week_id","day_id","workout_id","planned_workout","client_uuid","created_at","summary"],"monotonic":["client_updated_at"],"stamp_update":{"updated_at":"now"},"client_update":["state","local_date","timezone","started_at","ended_at","active_seconds","rpe_overall","mood","pain_note","client_note","client_updated_at"],"insert_eq":{"summary":null}}');
--> statement-breakpoint
drop trigger if exists set_logs_50_guard on public.set_logs;
--> statement-breakpoint
create trigger set_logs_50_guard before insert or update or delete on public.set_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","session_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["exercise_id","block_id","item_id","set_no","tag","reps","load","load_unit","duration_sec","distance_m","rpe","rir","rest_sec","completed","skipped","substituted_for","pain_flag","note","client_updated_at","deleted_at"]}');
--> statement-breakpoint
drop trigger if exists meal_logs_50_guard on public.meal_logs;
--> statement-breakpoint
create trigger meal_logs_50_guard before insert or update or delete on public.meal_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid","created_at"],"monotonic":["client_updated_at"],"client_update":["plan_version_id","local_date","meal_id","option_id","free_entry","status","note","client_updated_at","recorded_at"]}');
--> statement-breakpoint
drop trigger if exists supplement_logs_50_guard on public.supplement_logs;
--> statement-breakpoint
create trigger supplement_logs_50_guard before insert or update or delete on public.supplement_logs for each row execute function app.guard_row('{"immutable":["id","tenant_id","client_id","client_uuid"],"monotonic":["client_updated_at"],"client_update":["plan_version_id","supplement_id","local_date","taken","client_updated_at","recorded_at"]}');
--> statement-breakpoint
drop trigger if exists form_submissions_50_guard on public.form_submissions;
--> statement-breakpoint
create trigger form_submissions_50_guard before insert or update or delete on public.form_submissions for each row execute function app.guard_row('{"insert_eq":{"reviewed_at":null,"reviewed_by":null,"submitted_at":null},"client_insert_eq":{"coach_feedback":null,"results":null},"immutable":["id","tenant_id","client_id","form_id","form_version_id","form_kind","calendar_event_id","subscription_id","client_uuid","created_at","submitted_at","reviewed_at","reviewed_by"],"monotonic":["client_updated_at"],"stamp_update":{"updated_at":"now"},"client_update":["answers","missing_required","state","client_updated_at"],"editable_in":[{"column":"state","states":["scheduled","due","overdue"],"cols":["answers","missing_required"]}],"transitions":{"column":"state","insert":["scheduled","due","submitted"],"edges":[["scheduled","due"],["due","overdue"],["due","submitted"],["overdue","submitted"],["submitted","waiting_for_coach"],["submitted","reviewed"],["waiting_for_coach","reviewed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"],["scheduled","rescheduled"],["due","rescheduled"],["overdue","rescheduled"],["scheduled","cancelled"],["due","cancelled"],["overdue","cancelled"]]},"client_transitions":{"column":"state","insert":["due","submitted"],"edges":[["due","submitted"],["overdue","submitted"]]},"on_transition":{"column":"state","stamps":{"submitted":{"submitted_at":"now"},"reviewed":{"reviewed_at":"now","reviewed_by":"uid"}}}}');
--> statement-breakpoint
drop trigger if exists calendar_events_50_guard on public.calendar_events;
--> statement-breakpoint
create trigger calendar_events_50_guard before insert or update or delete on public.calendar_events for each row execute function app.guard_row('{"stamp_insert":{"created_by":"uid"},"insert_eq":{"completed_at":null,"skipped_at":null,"cancelled_at":null,"source":"manual","rule_key":null},"immutable":["id","tenant_id","client_id","subscription_id","source","rule_key","created_by","created_at","completed_at","skipped_at","cancelled_at"],"stamp_update":{"updated_at":"now"},"client_update":["state"],"client_transitions":{"column":"state","edges":[["scheduled","completed"],["due","completed"],["overdue","completed"],["scheduled","skipped"],["due","skipped"],["overdue","skipped"]]},"on_transition":{"column":"state","stamps":{"scheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"due":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"overdue":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"rescheduled":{"completed_at":"null","skipped_at":"null","cancelled_at":"null"},"completed":{"completed_at":"now","skipped_at":"null","cancelled_at":"null"},"skipped":{"skipped_at":"now","completed_at":"null","cancelled_at":"null"},"cancelled":{"cancelled_at":"now","completed_at":"null","skipped_at":"null"}}}}');
--> statement-breakpoint
drop trigger if exists conversations_50_guard on public.conversations;
--> statement-breakpoint
create trigger conversations_50_guard before insert or update or delete on public.conversations for each row execute function app.guard_row('{"immutable":["id","tenant_id","kind","client_id","created_at","last_message_at","last_message_preview"],"insert_eq":{"last_message_at":null,"last_message_preview":null,"unread_for_coach":0,"unread_for_client":0},"client_insert_eq":{"kind":"client","subject":null,"archived_at":null},"update_to":{"unread_for_client":0,"unread_for_coach":0},"client_update":["unread_for_client"],"staff_update":["subject","archived_at","unread_for_coach"]}');
--> statement-breakpoint
drop trigger if exists notifications_50_guard on public.notifications;
--> statement-breakpoint
create trigger notifications_50_guard before insert or update or delete on public.notifications for each row execute function app.guard_row('{"update_allow":["read_at"]}');
--> statement-breakpoint
drop trigger if exists push_subscriptions_50_guard on public.push_subscriptions;
--> statement-breakpoint
create trigger push_subscriptions_50_guard before insert or update or delete on public.push_subscriptions for each row execute function app.guard_row('{"immutable":["id","tenant_id","user_id","endpoint","created_at","last_used_at","failed_at"],"update_allow":["keys","user_agent"],"insert_eq":{"last_used_at":null,"failed_at":null}}');
--> statement-breakpoint
drop trigger if exists media_50_guard on public.media;
--> statement-breakpoint
create trigger media_50_guard before insert or update or delete on public.media for each row execute function app.guard_row('{"stamp_insert":{"owner_user_id":"uid"},"insert_eq":{"reviewed_by":null,"reviewed_at":null},"client_insert_eq":{"review_note":null},"immutable":["id","tenant_id","client_id","owner_user_id","bucket","path","kind","purpose","created_at","reviewed_by","reviewed_at"],"set_once":["deleted_at"],"client_update":["mime_type","uploaded_at","bytes","width","height","duration_sec","metadata","deleted_at","review_state"],"editable_in":[{"column":"review_state","states":["requested","needs_resubmission"],"cols":["mime_type"]},{"column":"review_state","states":[null,"requested","uploaded","processing","queued_for_review","needs_resubmission","archived"],"cols":["bytes","width","height","duration_sec","metadata","uploaded_at","deleted_at"]}],"transitions":{"column":"review_state","insert":[null,"requested","uploaded"],"edges":[[null,"uploaded"],["requested","uploaded"],["uploaded","processing"],["uploaded","queued_for_review"],["processing","queued_for_review"],["queued_for_review","approved"],["queued_for_review","needs_resubmission"],["queued_for_review","rejected"],["needs_resubmission","uploaded"],["approved","archived"],["rejected","archived"],["needs_resubmission","archived"]]},"client_transitions":{"column":"review_state","insert":[null,"requested","uploaded"],"edges":[[null,"uploaded"],["requested","uploaded"],["uploaded","processing"],["uploaded","queued_for_review"],["processing","queued_for_review"],["needs_resubmission","uploaded"]]},"on_transition":{"column":"review_state","stamps":{"approved":{"reviewed_at":"now","reviewed_by":"uid"},"needs_resubmission":{"reviewed_at":"now","reviewed_by":"uid"},"rejected":{"reviewed_at":"now","reviewed_by":"uid"}}}}');
--> statement-breakpoint
```

Other triggers on guarded tables, for the order of execution only (their text is in §7; names ending `_10_` and `_20_`
run before `_50_guard`, `_60_`, `_80_` and `_90_` after it): `memberships_40_owner`, `<versions table>_10_version`,
`<versions table>_20_protect`, `<versions table>_90_pointers`, `<head table>_10_head`, `clients_80_assign_creator`,
`clients_90_code`, `payments_90_receipt`, `set_logs_10_library`, `exercises_10_library`, `foods_10_library`,
`form_submissions_10_submission`, `tasks_20_assignee` and `media_20_proof` (§7.11), `payments_60_refund_perm` (§7.11.4), and the audit triggers of §7.8.2.

Tables without a guard: `messages` (custom `message_rules`, §7.4), `message_revisions` (no runtime write privilege),
`audit_log`, `events`, `job_runs`, `notification_deliveries`, `idempotency_keys`, `audit_actions` and `event_types` (no
UPDATE privilege or no runtime privilege at all; INSERT where granted is already pinned by policy).

Notes on choices the triage left open:

- `ai_requests.state` is a text column, not an enum: its values are `draft`, `approved` and `rejected`. §8.3 may add a
  CHECK on them.
- Tasks have no machine in core. The guard allows `open` and `snoozed` to `done` or `cancelled`, `open` and `snoozed` to
  each other, and `done` or `cancelled` back to `open`; inserts start `open`.
- `client_flags` has no state column, so `resolved_at` is the driver of resolve and reopen (`on_set`, `on_clear`).
## 7. Special triggers and functions (migration 0006)

Everything in this section is created by the custom migration 0006. Drizzle cannot express triggers or functions (D4);
the Drizzle schema carries a one-line comment on each table that points here. Every SQL statement below ends with
`--> statement-breakpoint`, so the blocks can be concatenated into 0006 in the order of this section. Names are final:
the catalog test (C10) compares them with the inventory in §7.12.

Rules that hold for every object in this section:

- **Ownership.** Every function is owned by the migration role (`postgres`), which also owns every table it touches.
  No table uses `FORCE ROW LEVEL SECURITY` (§3.2): SECURITY DEFINER functions rely on the owner's exemption.
- **Privileges.** Every function is followed by `revoke all on function ... from public`. `EXECUTE` for `dawlyy_rls` is
  granted only by the §3.4 list at the end of 0006: `app.audit`, `app.emit_event`, `app.register_push`,
  `app.team_directory` and `app.advance_due` are on it, nothing else in this section. Trigger functions need no grant.
  `app.erase_client`, `app.close_tenant`, `app.next_client_code`, `app.next_receipt_no` and `app.entity_client` are
  service-only: no role but the owner can execute them.
- **Trigger order.** BEFORE triggers fire in name order. `<table>_10_*` to `<table>_40_*` run before
  `<table>_50_guard` (§6.3); `<table>_90_*` and `<table>_95_*` run after it. AFTER triggers use `_80_`, `_90_` and
  `_95_` the same way.
- **Which roles.** A function marked "every role" also binds service code and foreign-key actions; "runtime only"
  returns at once unless `current_user = 'dawlyy_rls'` (§3.2).
- **Drop and create.** Every `create trigger` is preceded by `drop trigger if exists` for the same name, so 0006 can
  be run again.
- **Error detail (N2).** Every `raise exception` in this section keeps its errcode and message and adds
  `detail = 'rule:app.<function name>'`, the schema-qualified name of the function that raises, for example
  `rule:app.message_rules`. A trigger function also sets `table = tg_table_name` and, when one column is at fault,
  `column = <that column>`. A function that is not a trigger sets `table` and `column` only where they are fixed
  (`app.advance_due`, `app.register_push`, `app.erase_client`, `app.close_tenant`, `app.next_client_code`,
  `app.next_receipt_no`, and `app.entity_client` once the entity is on its list); `app.audit` and `app.emit_event` name
  no single table and set neither. A raise with no single column at fault leaves `column` out, so `column_name` is
  empty. The prefix tells the layer apart: `guard:<key>` is the row guard (§6.1), `rule:app.<function>` is this section,
  and an error with neither is row-level security, a missing privilege or a foreign key. Tests assert `error.detail`,
  `error.table_name` and `error.column_name`; the API keeps mapping `42501` to 403 and `P0001` to 409 by code and uses
  the detail only to tell the layers apart (§12, §13).
- **Parent lookups and stamps (N12).** A trigger that reads a parent row reads it as the caller. A SECURITY INVOKER
  function runs under the caller's row-level security, so a parent the caller cannot see is a parent that does not
  exist: the raise is `23503` (`foreign_key_violation`), never `42501`. The SECURITY DEFINER lookups
  (`app.set_logs_library_check`, `app.exercise_thumbnail_check`, `app.task_assignee_check`) filter on the row's own
  tenant explicitly and raise the same `23503`. A column that the parent decides (a version's `tenant_id` and
  `client_id`, a message's `client_id`, a submission's `form_id` and `form_kind`) or that the session decides (a
  message's `sender_role`, `sender_user_id`, `created_at` and read markers) is **overwritten**, never rejected,
  whatever value the caller sent; tests assert the stored value. The one lookup that rejects a visible parent is
  `app.submission_rules` (`42501`, the form belongs to another client). The table at the end of §7.12 lists the lookup
  and the stamped columns of every trigger.

### 7.1 Published versions are immutable for every role (replaces 0002's function)

Every role is bound: the runtime, service code and foreign-key actions. The one exception is the erasure path (T1,
FL-01): a DELETE of a published, superseded or ever-published version is allowed only when `current_user` is not
`dawlyy_rls` **and** the transaction-local setting `app.erasure` is `on`. `app.erase_client` and `app.close_tenant`
(§7.9) set it, and so does `withErasureTx(tenantId, reason, fn)` in `client.ts` (§14). The runtime role can set the
GUC but the flag is ignored for it, and the runtime can never delete a head that has a published version (§7.3), so
the flag adds no runtime power. Every other rule stays: the frozen content cannot change, an archived version cannot
be reopened, and no frozen version moves backwards to a draft, for runtime and service code alike.

```sql
create or replace function app.protect_published_version() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  head_col text := tg_argv[0];
  frozen boolean := old.published_at is not null or old.status in ('published', 'superseded');
  bad text;
begin
  if tg_op = 'DELETE' then
    -- Only the erasure path may delete a frozen version, and never as the runtime role.
    if frozen and not (current_user <> 'dawlyy_rls' and coalesce(current_setting('app.erasure', true), '') = 'on') then
      raise exception 'published versions cannot be deleted (version %)', old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name;
    end if;
    return old;
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'archived versions cannot be reopened (version %)', old.id
      using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = 'status';
  end if;
  if frozen then
    -- The first column (in this order) that changed is reported as the column at fault.
    select c.col into bad
      from unnest(array['document', 'version_no', 'published_at', 'published_by', 'tenant_id', 'client_id', head_col])
           with ordinality c(col, ord)
     where (to_jsonb(new) -> c.col) is distinct from (to_jsonb(old) -> c.col)
     order by c.ord limit 1;
    if bad is not null then
      raise exception 'published versions are immutable (version %)', old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = bad;
    end if;
    if not (new.status = old.status
            or (old.status = 'published' and new.status in ('superseded', 'archived'))
            or (old.status = 'superseded' and new.status = 'archived')) then
      raise exception 'invalid transition from % to % (version %)', old.status, new.status, old.id
        using errcode = 'P0001', detail = 'rule:app.protect_published_version', table = tg_table_name, column = 'status';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.protect_published_version() from public;
--> statement-breakpoint
-- The argument is the head column of the versions table.
drop trigger if exists program_versions_protect_published on public.program_versions;
--> statement-breakpoint
drop trigger if exists program_versions_20_protect on public.program_versions;
--> statement-breakpoint
create trigger program_versions_20_protect before update or delete on public.program_versions
  for each row execute function app.protect_published_version('program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_protect_published on public.nutrition_plan_versions;
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_20_protect on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_20_protect before update or delete on public.nutrition_plan_versions
  for each row execute function app.protect_published_version('plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_protect_published on public.form_versions;
--> statement-breakpoint
drop trigger if exists form_versions_20_protect on public.form_versions;
--> statement-breakpoint
create trigger form_versions_20_protect before update or delete on public.form_versions
  for each row execute function app.protect_published_version('form_id');
--> statement-breakpoint
```

This closes the bypass superseded/archived → draft → edit → republish for every role, including service code.
Cases for §13 (suite D): erasing a client that owns a published program, nutrition plan and form removes all of it
through `app.erase_client`; the same `delete from clients` without the flag still raises `P0001`; the flag set inside a
`dawlyy_rls` transaction does not allow a delete; deleting a tenant with published versions works through
`app.close_tenant` only.

### 7.2 Versions inherit their head and keep their order (`<t>_10_version`, BEFORE INSERT OR UPDATE)

Arguments: head table, then head column: `('programs', 'program_id')`, `('nutrition_plans', 'plan_id')`,
`('forms', 'form_id')`. SECURITY INVOKER: at runtime the head is looked up under RLS, so a head the caller cannot see
does not exist for them.

Three rules are added to the 0002 design:

- **One writer per document (C15).** An INSERT, and an UPDATE that moves a version to `published`, first take
  `pg_advisory_xact_lock(hashtextextended(<head id>::text, 0))`. Two transactions that create or publish versions of
  the same head queue up behind each other until commit, so the `max(version_no)` checks below cannot race. Ordinary
  draft edits take no lock.
- **The newest published version comes from status too (SQLX-07).** The "no older republish" rule looks at every
  version with `published_at is not null` **or** `status in ('published', 'superseded')`. A version published by
  service code that forgot `published_at` therefore still counts, and the `*_published_at_ck` CHECK (§8.3) makes the
  omission impossible: service publishes set `published_at` and `published_by` themselves (§12).
- **Tenant and client always come from the head** (unchanged, N12). The head is looked up as the caller, under
  RLS: a head that is missing or that the caller cannot see raises `23503` (`document % not found`, column = the head
  column). `tenant_id` and `client_id` are **overwritten** from the head on every INSERT, never rejected, so a version
  that carries a foreign tenant or client is stored with the head's values. On UPDATE nothing is stamped: `tenant_id`,
  `client_id` and the head column are in the runtime `immutable` list of each versions table (§6.3).

```sql
create or replace function app.version_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  head_table text := tg_argv[0];
  head_col text := tg_argv[1];
  head_id uuid := (to_jsonb(new) ->> head_col)::uuid;
  h record;
  top integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(head_id::text, 0));
  elsif new.status = 'published' and old.status is distinct from 'published' then
    perform pg_advisory_xact_lock(hashtextextended(head_id::text, 0));
  end if;
  if tg_op = 'INSERT' then
    -- Every role: tenant and client always come from the head (no template/copy laundering).
    execute format('select tenant_id, client_id from public.%I where id = $1', head_table) into h using head_id;
    if h is null or h.tenant_id is null then
      raise exception 'document % not found', head_id
        using errcode = '23503', detail = 'rule:app.version_rules', table = tg_table_name, column = head_col;
    end if;
    new.tenant_id := h.tenant_id;
    new.client_id := h.client_id;
  end if;
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    execute format('select max(version_no) from public.%I where %I = $1', tg_table_name, head_col) into top using head_id;
    if top is not null and new.version_no <= top then
      raise exception 'version_no must be greater than % for this document', top
        using errcode = 'P0001', detail = 'rule:app.version_rules', table = tg_table_name, column = 'version_no';
    end if;
  elsif new.status = 'published' and old.status is distinct from 'published' then
    execute format('select max(version_no) from public.%I where %I = $1 and id <> $2 and (published_at is not null or status in (''published'', ''superseded''))',
                   tg_table_name, head_col) into top using head_id, new.id;
    if top is not null and new.version_no <= top then
      raise exception 'version % is older than version % that was already published', new.version_no, top
        using errcode = 'P0001', detail = 'rule:app.version_rules', table = tg_table_name, column = 'version_no';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.version_rules() from public;
--> statement-breakpoint
drop trigger if exists program_versions_10_version on public.program_versions;
--> statement-breakpoint
create trigger program_versions_10_version before insert or update on public.program_versions
  for each row execute function app.version_rules('programs', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_10_version on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_10_version before insert or update on public.nutrition_plan_versions
  for each row execute function app.version_rules('nutrition_plans', 'plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_10_version on public.form_versions;
--> statement-breakpoint
create trigger form_versions_10_version before insert or update on public.form_versions
  for each row execute function app.version_rules('forms', 'form_id');
--> statement-breakpoint
```

One published version per head is a partial unique index per versions table. It belongs to the Drizzle schema (0004),
not to 0006, so it must not be created twice: `program_versions_one_published_uq on (program_id) where status =
'published'`, `nutrition_plan_versions_one_published_uq on (plan_id) where status = 'published'` and
`form_versions_one_published_uq on (form_id) where status = 'published'`. The API supersedes the old version before
publishing the new one, in one transaction (§12).
Cases for §13 (suite D): two concurrent transactions that both create version 3 of one head — the second waits, then
gets `P0001`; a concurrent publish of two versions of one head ends with exactly one published; a version that service
code published without `published_at` is refused by the CHECK (23514); an older version cannot be published after a
newer one that carries only `status = 'superseded'`.

### 7.3 Document heads and version pointers

#### 7.3.1 `app.head_rules` (`<t>_10_head`, BEFORE INSERT OR UPDATE OR DELETE)

Arguments: versions table, then head column: `('program_versions', 'program_id')`,
`('nutrition_plan_versions', 'plan_id')`, `('form_versions', 'form_id')`. Note the order is the reverse of
`version_rules`: that one takes the head table first, this one the versions table first.

- **Delete (C11).** The runtime role may delete a head only while every one of its versions is a draft and none was
  ever published. A head with an `in_review`, `approved`, archived, published or superseded version cannot be deleted
  (`P0001`): cascades run as the table owner and would bypass `delete_when` on the versions. Service code and
  foreign-key cascades (client erasure, tenant closure) are not blocked here.
- **`published_version_id` belongs to the database (C10).** It is written only by `app.version_pointers` (§7.3.2). The
  runtime role cannot insert a head with it or change it (`42501`); for every role it must name a published version
  of this head.
- **Parent lookups (N12).** The function stamps nothing. Its lookups of the versions table run as the caller (SECURITY
  INVOKER), so a pointer to a version the caller cannot see raises `23503` like a pointer to a version that does not
  exist. A runtime write of `published_version_id` is refused here first (`rule:app.head_rules`, `42501`), because
  `<t>_10_head` fires before `<t>_50_guard`; the `immutable` entry for the column in §6.3 is the second line.
- **`current_version_id`** must name a version of this head (every role). Deleting that version clears the pointer: the
  head-qualified composite foreign key of §8.2 is declared `on delete set null (current_version_id)` (PostgreSQL 15
  and later; a hand edit of the generated migration, §11), and `app.version_pointers` repeats the clearing so the
  invariant does not depend on that key alone.

```sql
create or replace function app.head_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ver_table text := tg_argv[0];
  head_col text := tg_argv[1];
  found_it boolean;
begin
  if tg_op = 'DELETE' then
    if current_user = 'dawlyy_rls' then
      execute format('select exists (select 1 from public.%I where %I = $1 and (status <> ''draft'' or published_at is not null))', ver_table, head_col)
        into found_it using old.id;
      if found_it then
        raise exception 'a document with versions beyond draft cannot be deleted; archive it instead'
          using errcode = 'P0001', detail = 'rule:app.head_rules', table = tg_table_name;
      end if;
    end if;
    return old;
  end if;
  -- published_version_id is maintained by app.version_pointers; the runtime role never writes it.
  if current_user = 'dawlyy_rls' and new.published_version_id is not null
     and (tg_op = 'INSERT' or new.published_version_id is distinct from old.published_version_id) then
    raise exception 'published_version_id is maintained by the database'
      using errcode = '42501', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
  end if;
  if current_user = 'dawlyy_rls' and tg_op = 'UPDATE' and new.published_version_id is null and old.published_version_id is not null then
    raise exception 'published_version_id is maintained by the database'
      using errcode = '42501', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
  end if;
  -- Every role: pointers must name a version of this head.
  if new.published_version_id is not null
     and (tg_op = 'INSERT' or new.published_version_id is distinct from old.published_version_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and %I = $2 and status = ''published'')', ver_table, head_col)
      into found_it using new.published_version_id, new.id;
    if not found_it then
      raise exception 'published_version_id must be a published version of this document'
        using errcode = '23503', detail = 'rule:app.head_rules', table = tg_table_name, column = 'published_version_id';
    end if;
  end if;
  if new.current_version_id is not null
     and (tg_op = 'INSERT' or new.current_version_id is distinct from old.current_version_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and %I = $2)', ver_table, head_col)
      into found_it using new.current_version_id, new.id;
    if not found_it then
      raise exception 'current_version_id must be a version of this document'
        using errcode = '23503', detail = 'rule:app.head_rules', table = tg_table_name, column = 'current_version_id';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.head_rules() from public;
--> statement-breakpoint
drop trigger if exists programs_10_head on public.programs;
--> statement-breakpoint
create trigger programs_10_head before insert or update or delete on public.programs
  for each row execute function app.head_rules('program_versions', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plans_10_head on public.nutrition_plans;
--> statement-breakpoint
create trigger nutrition_plans_10_head before insert or update or delete on public.nutrition_plans
  for each row execute function app.head_rules('nutrition_plan_versions', 'plan_id');
--> statement-breakpoint
drop trigger if exists forms_10_head on public.forms;
--> statement-breakpoint
create trigger forms_10_head before insert or update or delete on public.forms
  for each row execute function app.head_rules('form_versions', 'form_id');
--> statement-breakpoint
```

#### 7.3.2 `app.version_pointers` (`<versions table>_90_pointers`, AFTER INSERT OR UPDATE OF status OR DELETE)

SECURITY DEFINER, so it writes the head whatever role changed the version. Arguments: head table, then head column,
the same order as `version_rules`.

| Event on the version | Effect on the head |
|---|---|
| status becomes `published` (INSERT or UPDATE) | `published_version_id := the version` |
| status leaves `published` (to `superseded` or `archived`) | `published_version_id := null` when it points at this version (FL-17, ATK-09) |
| DELETE | `current_version_id := null` and `published_version_id := null` where they point at this version |

Archiving the published version ("unpublish") therefore clears the pointer in the same transaction, and a client no
longer sees a head that points at a version it cannot read. When the API replaces a published version it supersedes
the old one first (pointer cleared), then publishes the new one (pointer set), in one transaction. The head pointers
live only in this trigger (T22); a later archive or supersede of the pointed version clears the pointer in that same
statement, so no deferred constraint trigger is added (N13).

Maintained columns (N20): `published_version_id` is written only here and is in the runtime `immutable` list of
`programs`, `nutrition_plans` and `forms` (§6.3; `insert_eq` pins it to null). The function is SECURITY DEFINER, so the
guard does not meet it. `current_version_id` is not trigger-owned: staff and the API set it, and this trigger only
clears it.

```sql
create or replace function app.version_pointers() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  head_table text := tg_argv[0];
  head_col text := tg_argv[1];
  head_id uuid;
begin
  if tg_op = 'DELETE' then
    head_id := (to_jsonb(old) ->> head_col)::uuid;
    execute format('update public.%I set current_version_id = null where id = $1 and current_version_id = $2', head_table)
      using head_id, old.id;
    execute format('update public.%I set published_version_id = null where id = $1 and published_version_id = $2', head_table)
      using head_id, old.id;
    return old;
  end if;
  head_id := (to_jsonb(new) ->> head_col)::uuid;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    execute format('update public.%I set published_version_id = $2 where id = $1', head_table) using head_id, new.id;
  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status <> 'published' then
    execute format('update public.%I set published_version_id = null where id = $1 and published_version_id = $2', head_table)
      using head_id, old.id;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.version_pointers() from public;
--> statement-breakpoint
drop trigger if exists program_versions_90_pointers on public.program_versions;
--> statement-breakpoint
create trigger program_versions_90_pointers after insert or update of status or delete on public.program_versions
  for each row execute function app.version_pointers('programs', 'program_id');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_90_pointers on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_90_pointers after insert or update of status or delete on public.nutrition_plan_versions
  for each row execute function app.version_pointers('nutrition_plans', 'plan_id');
--> statement-breakpoint
drop trigger if exists form_versions_90_pointers on public.form_versions;
--> statement-breakpoint
create trigger form_versions_90_pointers after insert or update of status or delete on public.form_versions
  for each row execute function app.version_pointers('forms', 'form_id');
--> statement-breakpoint
```

Cases for §13 (suite D): a head with a published version, an archived version or an `in_review` version cannot be
deleted by the runtime (`P0001`), a head whose versions are all drafts can, and deleting it cascades; publishing sets
`published_version_id`, superseding or archiving clears it; deleting the draft that is `current_version_id` clears that
pointer; the runtime cannot insert or update `published_version_id` (`42501`); a service transaction can only point it
at a published version of the same head.

### 7.4 Messages

Triggers: `messages_10_message` (BEFORE INSERT OR UPDATE), `messages_after_insert` and `messages_after_update`
(AFTER), `messages_95_revision` (AFTER UPDATE). The decisions behind the rules:

- **Insert.** The message takes its `client_id` from the conversation. For the runtime role the sender, the sender role
  and `created_at` are stamped (`created_at := now()`, SQLX-04, ATK-03): a caller cannot backdate a message or move a
  thread. The conversation is looked up as the caller (N12): a conversation the caller cannot see (another client's
  thread, an internal thread for a client, an unassigned client's thread for assigned-scope staff) raises `23503`.
  Stamped, never rejected: `client_id` (every role, the conversation's value, null for an internal thread),
  `sender_user_id`, `sender_role` and `created_at` (runtime). A caller who sends other values gets the stamps. Offline clients identify retries with `client_uuid` only; the unique index is
  `(tenant_id, sender_user_id, client_uuid)` (§8.1).
- **Update.** The author may change `body`, `attachments` and `deleted_at`. Whoever reads the thread may set **their
  own side's** read marker on **any** message of it, including their own, so a bulk "mark thread read" never aborts
  (FL-03). `allowed` is the union of both lists.
- **Read markers (C14).** A marker is set once and stamped by the server: a null marker that the caller sets becomes
  `now()` whatever value was sent; a marker that is already set keeps its value silently (so a repeated bulk update is
  harmless); clearing a marker is refused (`42501`).
- **Deleted messages (S2).** Once `deleted_at` is set, nobody can change `body`, `attachments` or `deleted_at` again,
  the author included. Read markers still move.
- **Previews (C14).** `on_message_insert` sets the conversation preview only for a message that is not older than the
  current `last_message_at`, and `last_message_at` never moves backwards (SQLX-04). `on_message_update` recomputes the
  preview from the newest message that is not deleted whenever a `body` is edited or a message is deleted, so a deleted
  or corrected text does not stay in the thread list. Unread counters are written only by these triggers and by the
  reset-to-zero rule of the guard key `update_to` on `conversations` (§6.1, SQLX-09). Maintained columns (N20):
  `conversations.last_message_at` and `last_message_preview` are in the runtime `immutable` list of §6.3, so no
  runtime role, the owner included, can write them; `unread_for_client` and `unread_for_coach` use `update_to` (0
  only, every role, the owner included); `insert_eq` pins all four to their start values (null, null, 0, 0). Both
  message triggers are SECURITY DEFINER, so the guard does not meet them. `messages` itself has no guard (§6.3): the
  columns outside `allowed` (`client_id`, `sender_*`, `created_at`, `conversation_id`) get `42501` on UPDATE, and
  `edited_at` and the read markers are stamped by `app.message_rules`.
- **History (ATK-10).** `messages_95_revision` copies the old `body` and `attachments` into the append-only table
  `message_revisions` (§9) whenever either changes. Runtime roles can only read it, with the same visibility as the
  message (§5.2).

```sql
create or replace function app.message_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conv_client uuid;
  who text;
  me uuid;
  allowed text[];
  bad text;
begin
  if tg_op = 'INSERT' then
    -- Every role: the message belongs to its conversation's client (null for internal threads).
    -- The lookup runs as the caller, so a conversation the caller cannot see is not found (N12).
    select c.client_id into conv_client from public.conversations c
     where c.id = new.conversation_id and c.tenant_id = new.tenant_id;
    if not found then
      raise exception 'conversation % not found', new.conversation_id
        using errcode = '23503', detail = 'rule:app.message_rules', table = tg_table_name, column = 'conversation_id';
    end if;
    new.client_id := conv_client;
  end if;
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  who := app.role();
  me := app.uid();
  if who is null then
    raise exception 'no active membership'
      using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name;
  end if;
  if tg_op = 'INSERT' then
    new.sender_user_id := me;
    new.sender_role := who;
    new.created_at := now();
    if new.edited_at is not null or new.deleted_at is not null
       or new.read_by_client_at is not null or new.read_by_coach_at is not null then
      raise exception 'a new message cannot carry edit, delete or read times'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name,
              column = case when new.edited_at is not null then 'edited_at'
                            when new.deleted_at is not null then 'deleted_at'
                            when new.read_by_client_at is not null then 'read_by_client_at'
                            else 'read_by_coach_at' end;
    end if;
    return new;
  end if;
  -- UPDATE. The author may edit or delete a message that is not deleted yet; every reader may set their own side's marker.
  allowed := case when old.sender_user_id = me and old.deleted_at is null
                  then array['body', 'attachments', 'deleted_at'] else array[]::text[] end
          || case when who = 'client' then array['read_by_client_at'] else array['read_by_coach_at'] end;
  select string_agg(n.key, ', ' order by n.key) into bad
    from jsonb_each(to_jsonb(new)) n
   where n.value is distinct from (to_jsonb(old) -> n.key)
     and n.key <> all (allowed)
     and n.key <> 'edited_at';
  if bad is not null then
    raise exception 'messages: % cannot be changed', bad
      using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = split_part(bad, ', ', 1);
  end if;
  -- Read markers: set once, stamped by the server.
  if old.read_by_client_at is not null then
    if new.read_by_client_at is null then
      raise exception 'messages: a read marker cannot be cleared'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = 'read_by_client_at';
    end if;
    new.read_by_client_at := old.read_by_client_at;
  elsif new.read_by_client_at is not null then
    new.read_by_client_at := now();
  end if;
  if old.read_by_coach_at is not null then
    if new.read_by_coach_at is null then
      raise exception 'messages: a read marker cannot be cleared'
        using errcode = '42501', detail = 'rule:app.message_rules', table = tg_table_name, column = 'read_by_coach_at';
    end if;
    new.read_by_coach_at := old.read_by_coach_at;
  elsif new.read_by_coach_at is not null then
    new.read_by_coach_at := now();
  end if;
  new.edited_at := case
    when new.body is distinct from old.body or new.attachments is distinct from old.attachments then now()
    else old.edited_at
  end;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.message_rules() from public;
--> statement-breakpoint

-- Conversation preview and unread counters follow every new message (clients cannot write them directly).
-- An older message (by created_at) never overwrites the preview or moves last_message_at backwards.
create or replace function app.on_message_insert() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_preview = case
           when c.last_message_at is null or new.created_at >= c.last_message_at then left(coalesce(new.body, ''), 140)
           else c.last_message_preview
         end,
         last_message_at = greatest(coalesce(c.last_message_at, new.created_at), new.created_at),
         unread_for_coach = c.unread_for_coach + case when new.sender_role = 'client' then 1 else 0 end,
         unread_for_client = c.unread_for_client + case when new.sender_role in ('owner', 'staff') then 1 else 0 end
   where c.id = new.conversation_id;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.on_message_insert() from public;
--> statement-breakpoint

-- After an edit or a delete, the preview shows the newest message that is not deleted.
create or replace function app.on_message_update() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  last_body text;
begin
  select m.body into last_body from public.messages m
   where m.conversation_id = new.conversation_id and m.deleted_at is null
   order by m.created_at desc, m.id desc
   limit 1;
  update public.conversations c
     set last_message_preview = case when found then left(coalesce(last_body, ''), 140) end
   where c.id = new.conversation_id;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.on_message_update() from public;
--> statement-breakpoint

-- Append-only history of edited messages (table public.message_revisions, §9).
create or replace function app.message_revision() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.message_revisions (tenant_id, message_id, client_id, body, attachments, revised_at, revised_by)
  values (old.tenant_id, old.id, old.client_id, old.body, old.attachments, now(), app.uid());
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.message_revision() from public;
--> statement-breakpoint
drop trigger if exists messages_10_message on public.messages;
--> statement-breakpoint
create trigger messages_10_message before insert or update on public.messages
  for each row execute function app.message_rules();
--> statement-breakpoint
drop trigger if exists messages_after_insert on public.messages;
--> statement-breakpoint
create trigger messages_after_insert after insert on public.messages
  for each row execute function app.on_message_insert();
--> statement-breakpoint
drop trigger if exists messages_after_update on public.messages;
--> statement-breakpoint
create trigger messages_after_update after update of body, deleted_at on public.messages
  for each row when (old.body is distinct from new.body or old.deleted_at is distinct from new.deleted_at)
  execute function app.on_message_update();
--> statement-breakpoint
drop trigger if exists messages_95_revision on public.messages;
--> statement-breakpoint
create trigger messages_95_revision after update of body, attachments on public.messages
  for each row when (old.body is distinct from new.body or old.attachments is distinct from new.attachments)
  execute function app.message_revision();
--> statement-breakpoint
```

Cases for §13 (suite M): a bulk `update messages set read_by_client_at = now() where conversation_id = $1 and
read_by_client_at is null` over a thread that contains the caller's own messages succeeds and cannot touch the other
side's marker; clearing a marker is refused, while resending any non-null value preserves its first stored time.
A runtime message sent with `created_at = '2099-01-01'` stores transaction `now()`. The conversation's
`last_message_at` becomes `greatest(previous_last_message_at, transaction now())`, treating previous null as now; it
never adopts the forged future time or decreases. Test empty and earlier-existing timestamps plus M10's older service
message case; an edit rewrites the preview when the message is the newest; deleting the newest
message shows the previous one; after deletion the author cannot edit, undelete or change the body; an edit writes one
`message_revisions` row with the old text and the runtime cannot insert, update or delete in that table.

### 7.5 Form submissions and `app.advance_due`

#### 7.5.1 `app.submission_rules` (`form_submissions_10_submission`, BEFORE INSERT)

Unchanged: the submission inherits form id and kind from the form version, the version must belong to the tenant, and
a form made for one client cannot be answered by another. At runtime only published or superseded versions can be
answered. The form version and its form are looked up as the caller (SECURITY INVOKER, N12): one the caller cannot see
(another client's copy, a draft template version for a client) raises `23503`, a visible copy that belongs to another
client raises `42501`, and a visible draft version raises `P0001` for the runtime. Stamped, never rejected: `form_id`
and `form_kind` (from the form, whatever the caller sent). Both are in the runtime `immutable` list of
`form_submissions` (§6.3), so they are written once, here, on INSERT.

```sql
create or replace function app.submission_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v record;
begin
  select fv.form_id, fv.status::text as status, f.form_kind, f.client_id, f.tenant_id into v
    from public.form_versions fv
    join public.forms f on f.id = fv.form_id
   where fv.id = new.form_version_id;
  if not found or v.tenant_id <> new.tenant_id then
    raise exception 'form version % not found', new.form_version_id
      using errcode = '23503', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'form_version_id';
  end if;
  if v.client_id is not null and v.client_id <> new.client_id then
    raise exception 'this form belongs to another client'
      using errcode = '42501', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'client_id';
  end if;
  if current_user = 'dawlyy_rls' and v.status not in ('published', 'superseded') then
    raise exception 'only a published form can be answered'
      using errcode = 'P0001', detail = 'rule:app.submission_rules', table = tg_table_name, column = 'form_version_id';
  end if;
  new.form_id := v.form_id;
  new.form_kind := v.form_kind;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.submission_rules() from public;
--> statement-breakpoint
drop trigger if exists form_submissions_10_submission on public.form_submissions;
--> statement-breakpoint
create trigger form_submissions_10_submission before insert on public.form_submissions
  for each row execute function app.submission_rules();
--> statement-breakpoint
```

#### 7.5.2 `app.advance_due(p_id uuid)` (T28, FL-19)

The check-in machine refuses `scheduled → submitted`. A client who answers at `due_at`, before the due processor has
flipped the row, would get a 409. `app.advance_due` closes that gap. `p_id` is the `form_submissions` id of the
check-in. The function is SECURITY DEFINER and does exactly one thing: when the caller can see the check-in (same
tenant, `app.can_access_client` on its client) and the linked calendar event has `due_at <= now()`, it moves the
check-in from `scheduled` to `due`, and the event from `scheduled` to `due` as well. It returns `true` when it moved
something, `false` when nothing was due. An unknown or invisible id raises `P0002`. It never sets any other state and
never moves a row that is not yet due. It writes only `state` and `updated_at` of the two rows, columns that no `immutable`
list holds (N20); as a SECURITY DEFINER function it does not meet the guard, so the edge `scheduled` to `due` is
allowed whoever calls it, and only for a row whose `due_at` has passed.

The function locks the submission first, validates access, then locks the linked event and reads its state/time.
Every writer that locks both rows uses this submission-then-event order. Both UPDATEs recheck tenant and scheduled
state, and the event UPDATE also rechecks `due_at <= now()`. `moved` is true only when an UPDATE affects a row.
The API calls it before a submit and, as a second line, retries the submit once after `P0001` (§12).

```sql
create or replace function app.advance_due(p_id uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  s record;
  e record;
  moved boolean := false;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.advance_due';
  end if;
  select fs.client_id, fs.state::text as state, fs.calendar_event_id into s
    from public.form_submissions fs
   where fs.id = p_id and fs.tenant_id = tid
   for update;
  if not found or not app.can_access_client(s.client_id) then
    raise exception 'check-in % not found', p_id
      using errcode = 'P0002', detail = 'rule:app.advance_due', table = 'form_submissions', column = 'id';
  end if;
  select ce.due_at, ce.state::text as state into e
    from public.calendar_events ce
   where ce.id = s.calendar_event_id and ce.tenant_id = tid
   for update;
  if not found or e.due_at is null or e.due_at > now() then
    return false;
  end if;
  if s.state = 'scheduled' then
    update public.form_submissions set state = 'due', updated_at = now()
     where id = p_id and tenant_id = tid and state = 'scheduled';
    moved := found;
  end if;
  if e.state = 'scheduled' then
    update public.calendar_events set state = 'due', updated_at = now()
     where id = s.calendar_event_id and tenant_id = tid and state = 'scheduled' and due_at <= now();
    moved := found or moved;
  end if;
  return moved;
end $$;
--> statement-breakpoint
revoke all on function app.advance_due(uuid) from public;
--> statement-breakpoint
```

Cases for §13 (E05/E06/E17): a client submits a `scheduled` check-in whose `due_at` has passed after calling
`app.advance_due`; with `due_at` in the future the function returns `false` and the submit still gives `P0001`; a client
cannot advance another client's check-in (`P0002`); a second call returns `false`.

### 7.6 Library, template and thumbnail checks

#### 7.6.1 Library references (`<t>_10_library`, BEFORE INSERT OR UPDATE)

A reference must be a system row (`tenant_id is null`) or a row of the same tenant. A reference that is missing, that
belongs to another tenant or that the caller cannot see raises `23503` (N12); neither function stamps a column.

- **`app.set_logs_library_check()`** (PERF-05) is the static variant for `set_logs`, the main offline-sync write path.
  It is SECURITY DEFINER with a fixed query, so Postgres caches its plan, and it leaks nothing: it only answers whether
  the exercise is a system row or a row of the same tenant. It is used for `exercise_id` and `substituted_for`; the
  single-column foreign keys `set_logs_exercise_fk` and `set_logs_substituted_fk` (§8.2) keep the history from being
  orphaned.
- **`app.library_ref_check()`** stays the generic, dynamic function for low-volume tables. Arguments: the library
  table, then the columns to check. `exercises`: `('exercises', 'based_on_id')`; `foods`: `('foods', 'based_on_id')`.

```sql
create or replace function app.set_logs_library_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.exercise_id is not null and (tg_op = 'INSERT' or new.exercise_id is distinct from old.exercise_id)
     and not exists (select 1 from public.exercises e
                      where e.id = new.exercise_id and (e.tenant_id is null or e.tenant_id = new.tenant_id)) then
    raise exception 'exercise_id % is not in this library', new.exercise_id
      using errcode = '23503', detail = 'rule:app.set_logs_library_check', table = tg_table_name, column = 'exercise_id';
  end if;
  if new.substituted_for is not null and (tg_op = 'INSERT' or new.substituted_for is distinct from old.substituted_for)
     and not exists (select 1 from public.exercises e
                      where e.id = new.substituted_for and (e.tenant_id is null or e.tenant_id = new.tenant_id)) then
    raise exception 'substituted_for % is not in this library', new.substituted_for
      using errcode = '23503', detail = 'rule:app.set_logs_library_check', table = tg_table_name, column = 'substituted_for';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.set_logs_library_check() from public;
--> statement-breakpoint

create or replace function app.library_ref_check() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  lib text := tg_argv[0];
  col text;
  ref uuid;
  ok boolean;
begin
  for i in 1 .. tg_nargs - 1 loop
    col := tg_argv[i];
    ref := (to_jsonb(new) ->> col)::uuid;
    if ref is not null and (tg_op = 'INSERT' or ref is distinct from (to_jsonb(old) ->> col)::uuid) then
      execute format('select exists (select 1 from public.%I where id = $1 and (tenant_id is null or tenant_id = $2))', lib)
        into ok using ref, new.tenant_id;
      if not ok then
        raise exception '% % is not in this library', col, ref
          using errcode = '23503', detail = 'rule:app.library_ref_check', table = tg_table_name, column = col;
      end if;
    end if;
  end loop;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.library_ref_check() from public;
--> statement-breakpoint
drop trigger if exists set_logs_10_library on public.set_logs;
--> statement-breakpoint
create trigger set_logs_10_library before insert or update on public.set_logs
  for each row execute function app.set_logs_library_check();
--> statement-breakpoint
drop trigger if exists exercises_10_library on public.exercises;
--> statement-breakpoint
create trigger exercises_10_library before insert or update on public.exercises
  for each row execute function app.library_ref_check('exercises', 'based_on_id');
--> statement-breakpoint
drop trigger if exists foods_10_library on public.foods;
--> statement-breakpoint
create trigger foods_10_library before insert or update on public.foods
  for each row execute function app.library_ref_check('foods', 'based_on_id');
--> statement-breakpoint
```

#### 7.6.2 Exercise thumbnails are tenant assets (`exercises_10_thumbnail`, T14, ATK-05)

Every client of the tenant can read the exercise library, so a thumbnail must never point at a client's private
media. The check applies to every role: `thumbnail_media_id` must name a media row of the same tenant with
`client_id is null` and `purpose` `exercise_demo` or `branding`. A system exercise (`tenant_id is null`) cannot have a
thumbnail media row at all; it uses `video_url`. The foreign key `exercises_thumbnail_fk` (§8.2) still keeps the row
from dangling.

```sql
create or replace function app.exercise_thumbnail_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.thumbnail_media_id is not null
     and (tg_op = 'INSERT' or new.thumbnail_media_id is distinct from old.thumbnail_media_id)
     and not exists (select 1 from public.media m
                      where m.id = new.thumbnail_media_id and m.tenant_id = new.tenant_id and m.client_id is null
                        and m.purpose in ('exercise_demo', 'branding')) then
    raise exception 'thumbnail_media_id must be a tenant asset (exercise demo or branding)'
      using errcode = '23503', detail = 'rule:app.exercise_thumbnail_check', table = tg_table_name, column = 'thumbnail_media_id';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.exercise_thumbnail_check() from public;
--> statement-breakpoint
drop trigger if exists exercises_10_thumbnail on public.exercises;
--> statement-breakpoint
create trigger exercises_10_thumbnail before insert or update on public.exercises
  for each row execute function app.exercise_thumbnail_check();
--> statement-breakpoint
```

#### 7.6.3 Templates are templates (`<t>_10_template`, T14, C7, ATK-17)

`template_id` on a program, nutrition plan or form must name a **template** of the same table and tenant:
`kind = 'template'` and `client_id is null`. This stops a copy from being based on another client's copy and from
blocking that client's erasure. SECURITY INVOKER: the caller must be able to see the template, and a template that is
missing or invisible raises `23503` (N12). The related CHECK
`client_id is not null or subscription_id is null` (C8, §8.3) keeps templates free of subscriptions.

```sql
create or replace function app.template_ref_check() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean;
begin
  if new.template_id is not null and (tg_op = 'INSERT' or new.template_id is distinct from old.template_id) then
    execute format('select exists (select 1 from public.%I where id = $1 and tenant_id = $2 and kind = ''template'' and client_id is null)', tg_table_name)
      into ok using new.template_id, new.tenant_id;
    if not ok then
      raise exception 'template_id % is not a template of this tenant', new.template_id
        using errcode = '23503', detail = 'rule:app.template_ref_check', table = tg_table_name, column = 'template_id';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.template_ref_check() from public;
--> statement-breakpoint
drop trigger if exists programs_10_template on public.programs;
--> statement-breakpoint
create trigger programs_10_template before insert or update on public.programs
  for each row execute function app.template_ref_check();
--> statement-breakpoint
drop trigger if exists nutrition_plans_10_template on public.nutrition_plans;
--> statement-breakpoint
create trigger nutrition_plans_10_template before insert or update on public.nutrition_plans
  for each row execute function app.template_ref_check();
--> statement-breakpoint
drop trigger if exists forms_10_template on public.forms;
--> statement-breakpoint
create trigger forms_10_template before insert or update on public.forms
  for each row execute function app.template_ref_check();
--> statement-breakpoint
```

Cases for §13 (suite K): another tenant's exercise is rejected for a set log and a system exercise is accepted; an
exercise with a client's private photo as thumbnail is rejected, with a tenant asset accepted; a program copy cannot use
another client's copy as `template_id`; deleting an exercise that a set log uses fails (23503) and the runtime has no
DELETE on exercises anyway (§3.3).

### 7.7 Client codes and receipt numbers (SECURITY DEFINER triggers)

Two counters on `tenants` give gap-free numbers: client codes (`DW-000123`) and receipts (`R-000001`). Padding is
`greatest(6, length(n::text))`, so number 1,000,000 is `DW-1000000`, never a truncated six-digit value, and two
numbers can never collide (C20). 0006 replaces the 0002 body of `app.next_client_code` for the same reason; its
parameter keeps the name `tid`.

Maintained columns (N20): `tenants.client_counter` and `tenants.receipt_counter`, `clients.code` and
`payments.receipt_no` are written only by the functions of this subsection, which are SECURITY DEFINER. Each is in the
runtime `immutable` list of its table in §6.3, and `insert_eq` pins `code` to `''` and `receipt_no` to null. The BEFORE
triggers `clients_90_code` and `payments_90_receipt` run after `<table>_50_guard`: the guard sees `code` and
`receipt_no` as the caller sent them and the numbers are assigned afterwards.

```sql
create or replace function app.next_client_code(tid uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
  prefix text;
begin
  update public.tenants
     set client_counter = client_counter + 1
   where id = tid
  returning client_counter, client_code_prefix into n, prefix;
  if n is null then
    raise exception 'unknown tenant %', tid
      using errcode = 'P0001', detail = 'rule:app.next_client_code', table = 'tenants', column = 'id';
  end if;
  return prefix || '-' || lpad(n::text, greatest(6, length(n::text)), '0');
end $$;
--> statement-breakpoint
revoke all on function app.next_client_code(uuid) from public;
--> statement-breakpoint

-- clients_90_code, BEFORE INSERT. Runtime inserts must leave code = '' (guard); the code always comes from the counter.
create or replace function app.assign_client_code() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := app.next_client_code(new.tenant_id);
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.assign_client_code() from public;
--> statement-breakpoint

create or replace function app.next_receipt_no(tid uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.tenants set receipt_counter = receipt_counter + 1 where id = tid returning receipt_counter into n;
  if n is null then
    raise exception 'unknown tenant %', tid
      using errcode = 'P0001', detail = 'rule:app.next_receipt_no', table = 'tenants', column = 'id';
  end if;
  return 'R-' || lpad(n::text, greatest(6, length(n::text)), '0');
end $$;
--> statement-breakpoint
revoke all on function app.next_receipt_no(uuid) from public;
--> statement-breakpoint

-- payments_90_receipt, BEFORE INSERT OR UPDATE, every role: a payment gets its receipt number when it is verified.
create or replace function app.payment_receipt() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.state = 'verified' and new.receipt_no is null
     and (tg_op = 'INSERT' or old.state is distinct from 'verified') then
    new.receipt_no := app.next_receipt_no(new.tenant_id);
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.payment_receipt() from public;
--> statement-breakpoint
drop trigger if exists clients_90_code on public.clients;
--> statement-breakpoint
create trigger clients_90_code before insert on public.clients
  for each row execute function app.assign_client_code();
--> statement-breakpoint
drop trigger if exists payments_90_receipt on public.payments;
--> statement-breakpoint
create trigger payments_90_receipt before insert or update on public.payments
  for each row execute function app.payment_receipt();
--> statement-breakpoint
```

`app.next_client_code(uuid)` and `app.next_receipt_no(uuid)` have no `EXECUTE` for any runtime role. Add the unique
index `payments_tenant_receipt_uq on payments (tenant_id, receipt_no)` (Drizzle schema, §8.1).

**Counter gaps (PRIV-05).** PostgreSQL fires BEFORE INSERT row triggers on the proposed row before it looks for a
conflict, so `INSERT ... ON CONFLICT` and the insert leg of `MERGE` consume a number even when the row turns out to
be a duplicate; the counter bump commits with the transaction and leaves a hole in the sequence. Rule: **no
`ON CONFLICT` and no `MERGE` on `payments` or `clients`.** Idempotency is a `select` first, or the unique violation
(23505) caught inside a savepoint, which rolls the counter back with it. Cases for §13 (suite P): a conflicting insert of
a verified payment, rolled back to its savepoint, leaves `receipt_counter` unchanged; the one millionth client gets
`DW-1000000`; receipt `R-999999` is followed by `R-1000000`.

### 7.8 Audit and outbox

#### 7.8.1 `app.audit_row()` — row snapshots

`app.audit_row()` (0002) is replaced. Changes: it handles the `tenants` table, which has no `tenant_id` column (the
tenant is `id`); it uses `cid = id` for the `clients` table, which has no `client_id` column, so a client's own audit
rows are visible to the staff who can access that client and can be found when the client is erased (C19); and it
takes an optional trigger argument, a comma-separated list of columns to leave out of both snapshots (SQLX-08, S8).
The three version tables pass `'document'`: the document history is the version rows themselves, and copying a
program of 190 KB twice on every autosave would fill the append-only log.

```sql
create or replace function app.audit_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  rowj jsonb := to_jsonb(coalesce(new, old));
  strip text[] := case when tg_nargs > 0 then string_to_array(tg_argv[0], ',') else array[]::text[] end;
  tid uuid := coalesce((rowj ->> 'tenant_id')::uuid, case when tg_table_name = 'tenants' then (rowj ->> 'id')::uuid end);
  cid uuid := case when tg_table_name = 'clients' then (rowj ->> 'id')::uuid else (rowj ->> 'client_id')::uuid end;
begin
  insert into public.audit_log (tenant_id, actor_user_id, actor_role, action, entity, entity_id, client_id, before, after, reason)
  values (
    tid,
    app.uid(),
    coalesce(app.role(), case when nullif(current_setting('app.service_reason', true), '') is not null then 'service' end),
    lower(tg_op),
    tg_table_name,
    rowj ->> 'id',
    cid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - strip end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - strip end,
    nullif(current_setting('app.service_reason', true), '')
  );
  return coalesce(new, old);
end $$;
--> statement-breakpoint
revoke all on function app.audit_row() from public;
--> statement-breakpoint
```

#### 7.8.2 Audit triggers (literal DDL)

The seven triggers of 0002 stay as they are (`subscriptions_audit`, `subscription_events_audit`, `payments_audit`,
`client_entitlement_overrides_audit`, `memberships_audit`, `staff_client_assignments_audit`, `business_settings_audit`).
0006 adds the following. §10 gives the reasons; this is the DDL.

Plain row audit, `AFTER INSERT OR UPDATE OR DELETE`, no argument: `clients`, `client_notes`, `packages`,
`invitations`, `consents`, `programs`, `nutrition_plans`, `forms`, `ai_requests`, `client_flags`, `media`.

```sql
drop trigger if exists clients_audit on public.clients;
--> statement-breakpoint
create trigger clients_audit after insert or update or delete on public.clients for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists client_notes_audit on public.client_notes;
--> statement-breakpoint
create trigger client_notes_audit after insert or update or delete on public.client_notes for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists packages_audit on public.packages;
--> statement-breakpoint
create trigger packages_audit after insert or update or delete on public.packages for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists invitations_audit on public.invitations;
--> statement-breakpoint
create trigger invitations_audit after insert or update or delete on public.invitations for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists consents_audit on public.consents;
--> statement-breakpoint
create trigger consents_audit after insert or update or delete on public.consents for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists programs_audit on public.programs;
--> statement-breakpoint
create trigger programs_audit after insert or update or delete on public.programs for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists nutrition_plans_audit on public.nutrition_plans;
--> statement-breakpoint
create trigger nutrition_plans_audit after insert or update or delete on public.nutrition_plans for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists forms_audit on public.forms;
--> statement-breakpoint
create trigger forms_audit after insert or update or delete on public.forms for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists ai_requests_audit on public.ai_requests;
--> statement-breakpoint
create trigger ai_requests_audit after insert or update or delete on public.ai_requests for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists client_flags_audit on public.client_flags;
--> statement-breakpoint
create trigger client_flags_audit after insert or update or delete on public.client_flags for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists media_audit on public.media;
--> statement-breakpoint
create trigger media_audit after insert or update or delete on public.media for each row execute function app.audit_row();
--> statement-breakpoint
```

The three version tables log inserts, deletes, and only the updates that change `status`, `published_at` or
`superseded_at`; draft autosaves write no audit row. The snapshots leave out `document`:

```sql
drop trigger if exists program_versions_audit on public.program_versions;
--> statement-breakpoint
create trigger program_versions_audit after insert or delete on public.program_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists program_versions_audit_update on public.program_versions;
--> statement-breakpoint
create trigger program_versions_audit_update after update of status, published_at, superseded_at on public.program_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_audit on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_audit after insert or delete on public.nutrition_plan_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists nutrition_plan_versions_audit_update on public.nutrition_plan_versions;
--> statement-breakpoint
create trigger nutrition_plan_versions_audit_update after update of status, published_at, superseded_at on public.nutrition_plan_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists form_versions_audit on public.form_versions;
--> statement-breakpoint
create trigger form_versions_audit after insert or delete on public.form_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
drop trigger if exists form_versions_audit_update on public.form_versions;
--> statement-breakpoint
create trigger form_versions_audit_update after update of status, published_at, superseded_at on public.form_versions
  for each row execute function app.audit_row('document');
--> statement-breakpoint
```

`tenants` uses two triggers so that counter bumps (`client_counter`, `receipt_counter`) are not audited:

```sql
drop trigger if exists tenants_audit on public.tenants;
--> statement-breakpoint
create trigger tenants_audit after insert or delete on public.tenants
  for each row execute function app.audit_row();
--> statement-breakpoint
drop trigger if exists tenants_audit_update on public.tenants;
--> statement-breakpoint
create trigger tenants_audit_update after update of name, slug, client_code_prefix, default_locale, timezone, currency, archived_at on public.tenants
  for each row execute function app.audit_row();
--> statement-breakpoint
```

#### 7.8.3 The allow-lists: `app.audit_actions` and `app.event_types` (T4)

`app.audit` and `app.emit_event` accept only names that are listed here. Both tables live in schema `app`, are owned by
`postgres`, have RLS enabled with no policy, and no runtime role has any privilege on them: only the SECURITY DEFINER
functions read them. They are seeded by 0006 with `on conflict ... do update`, so a later migration changes the list by
repeating the insert. `roles` lists the roles that may use the name; the outbox processor ignores an event whose
recorded `actor_role` is not in the `roles` of its type (§12).

Authoritative allow-list DDL and seed are in §9.2. Execute them exactly once before §6.2/§7 functions. Do not
recreate or reseed while concatenating §7. Use `nutrition_plan.publish`, `nutrition_plan.archive` and
`nutrition_plan.published` everywhere; `nutrition.*` aliases are not seeded.

`client.erase` is a name in the list but is written by `app.erase_client` itself (§7.9), not through `app.audit`: the
aggregate no longer exists after an erasure.

#### 7.8.4 `app.entity_client` — client and tenant come from the row

C4: the caller never passes a client id. The helper resolves the **entity row** through a closed list of tables and
returns the row's client. SECURITY DEFINER and service-only. It checks, in order: the entity is on the list (`42501`);
the id is a uuid (`22023`); the row exists and belongs to the tenant (`P0002`). The client is `clients.id` for the
`clients` table, `client_id` for every other table (null for tenant-wide rows such as templates, packages, internal
threads and the tenant itself). The `tenants` entity is the pinned tenant only.

```sql
create or replace function app.entity_client(p_entity text, p_id text, p_tenant uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'clients', 'memberships', 'invitations', 'packages', 'subscriptions', 'payments', 'programs', 'program_versions',
    'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions', 'form_submissions', 'calendar_events',
    'workout_sessions', 'conversations', 'messages', 'media', 'tasks', 'client_flags', 'client_notes', 'ai_requests',
    'tenants'];
  rowj jsonb;
begin
  if p_entity is null or p_entity <> all (allowed) then
    raise exception 'entity % is not allowed', p_entity using errcode = '42501', detail = 'rule:app.entity_client';
  end if;
  if p_entity = 'tenants' then
    if p_id is distinct from p_tenant::text then
      raise exception 'tenants % not found', p_id
        using errcode = 'P0002', detail = 'rule:app.entity_client', table = 'tenants', column = 'id';
    end if;
    return null;
  end if;
  begin
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_entity) into rowj using p_id::uuid;
  exception when invalid_text_representation then
    raise exception 'bad entity id %', p_id
      using errcode = '22023', detail = 'rule:app.entity_client', table = p_entity, column = 'id';
  end;
  if rowj is null or (rowj ->> 'tenant_id')::uuid is distinct from p_tenant then
    raise exception '% % not found', p_entity, p_id
      using errcode = 'P0002', detail = 'rule:app.entity_client', table = p_entity, column = 'id';
  end if;
  return case when p_entity = 'clients' then (rowj ->> 'id')::uuid else (rowj ->> 'client_id')::uuid end;
end $$;
--> statement-breakpoint
revoke all on function app.entity_client(text, text, uuid) from public;
--> statement-breakpoint
```

#### 7.8.5 `app.audit` and `app.emit_event` — semantic entries from the API

Both functions are SECURITY DEFINER, `search_path ''`, `EXECUTE` for `dawlyy_rls` (§3.4). Neither takes a client id.

1. The tenant comes from the pinned membership (`42501` without one).
2. The name must be on the list, and the caller's role (`app.role()`) must be in its `roles` (`42501`). For `app.audit`
   the entity must also equal the entity listed for the action.
3. The entity row is resolved with `app.entity_client` (the tenant is always the pinned one, never a parameter). The
   client is derived from it. A caller who is not owner or staff may only target rows that belong to their own client;
   a row without a client (template, internal thread, tenant) is staff-only. Staff must have access to the derived
   client (`app.can_access_client`, which also checks that the client belongs to the tenant, C3).
4. Size caps, `54000`: `p_payload` 16 KB, `p_before` and `p_after` 64 KB each (`pg_column_size`).
5. Actor and role are stamped from the session (`events.actor_user_id`, `events.actor_role`), never from arguments.

```sql
create or replace function app.audit(
  p_action text, p_entity text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null,
  p_reason text default null, p_request_id text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  who text := app.role();
  rule record;
  cid uuid;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.audit';
  end if;
  select a.entity, a.roles into rule from app.audit_actions a where a.action = p_action;
  if not found or rule.entity is distinct from p_entity or not (who = any (rule.roles)) then
    raise exception 'audit action % is not allowed', p_action using errcode = '42501', detail = 'rule:app.audit';
  end if;
  if pg_column_size(p_before) > 65536 or pg_column_size(p_after) > 65536 then
    raise exception 'audit snapshot too large' using errcode = '54000', detail = 'rule:app.audit';
  end if;
  cid := app.entity_client(p_entity, p_entity_id, tid);
  if (cid is null and who = 'client') or (cid is not null and not app.can_access_client(cid)) then
    raise exception 'no access to % %', p_entity, p_entity_id using errcode = '42501', detail = 'rule:app.audit';
  end if;
  insert into public.audit_log (tenant_id, actor_user_id, actor_role, action, entity, entity_id, client_id, before, after, reason, request_id)
  values (tid, app.uid(), who, p_action, p_entity, p_entity_id, cid, p_before, p_after, p_reason, p_request_id);
end $$;
--> statement-breakpoint
revoke all on function app.audit(text, text, text, jsonb, jsonb, text, text) from public;
--> statement-breakpoint

-- Outbox events from the API, in the same transaction as the change. The processor re-reads state (§12) and ignores an
-- event whose recorded actor_role is not in event_types.roles for its type.
create or replace function app.emit_event(
  p_type text, p_aggregate text, p_aggregate_id text, p_payload jsonb default '{}'::jsonb
) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  who text := app.role();
  rule record;
  cid uuid;
  new_id bigint;
begin
  if tid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  select e.roles into rule from app.event_types e where e.type = p_type;
  if not found or not (who = any (rule.roles)) then
    raise exception 'event type % is not allowed', p_type using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  if pg_column_size(p_payload) > 16384 then
    raise exception 'event payload too large' using errcode = '54000', detail = 'rule:app.emit_event';
  end if;
  cid := app.entity_client(p_aggregate, p_aggregate_id, tid);
  if (cid is null and who = 'client') or (cid is not null and not app.can_access_client(cid)) then
    raise exception 'no access to % %', p_aggregate, p_aggregate_id using errcode = '42501', detail = 'rule:app.emit_event';
  end if;
  insert into public.events (tenant_id, type, aggregate, aggregate_id, client_id, payload, actor_user_id, actor_role)
  values (tid, p_type, p_aggregate, p_aggregate_id, cid, coalesce(p_payload, '{}'::jsonb), app.uid(), who)
  returning id into new_id;
  return new_id;
end $$;
--> statement-breakpoint
revoke all on function app.emit_event(text, text, text, jsonb) from public;
--> statement-breakpoint
```

Cases for §13 (suite A): a client calling `app.audit` or `app.emit_event` for a staff-only name gets `42501`; a client
can emit `message.sent` for a message of its own thread but not for an internal thread or another client's message;
omitting the client id is not possible and an unlisted name, entity or aggregate gives `42501`; assigned staff naming an
unassigned client's payment gets `42501`; an entity of another tenant gives `P0002`; a payload over 16 KB gives
`54000`; the stored `actor_role` is the caller's role; every `app.audit_actions.entity` is on the `app.entity_client`
list (the helper does not answer `42501` for it); `client` rows written by `clients_audit` carry `client_id = id`, so
assigned staff see them and an unassigned staff member does not; client creation writes no `tenants` audit row.

### 7.9 Erasure and tenant closure (T1)

Erasure of a client (Law 151/2020) and closure of a tenant need two things the runtime never has: permission to delete
published history, and a sweep of the tables that have no foreign key to the client or tenant. Both functions are
**service-only**: `EXECUTE` is not granted to `dawlyy_rls`, and both also refuse a transaction that carries a user
identity (`app.uid()` is set only by `withAuthTx` and `withUserTx`). They are called through
`withErasureTx(tenantId, reason, fn)` (§14), which is `withServiceTx` plus `set_config('app.erasure', 'on', true)`.
Because the functions are SECURITY DEFINER, the `current_user` check of an earlier draft cannot work inside them; the
privilege and the identity check do the job. The functions establish `app.erasure` themselves; an identity-free
service transaction can deliberately invoke them. Ordinary service DELETE of frozen history without the flag fails.
`withErasureTx` is the API calling convention; the database does not identify a TypeScript wrapper.

`app.erase_client(p_tenant, p_client)`:

1. refuses a runtime identity (`42501`) and an unknown client (`P0002`), and turns the erasure flag on;
2. collects every linked user id and deletes those users' rows in `notifications` (cascading to `notification_deliveries`), `push_subscriptions`,
   `user_preferences` and `idempotency_keys` for the tenant;
3. deletes all of the client's memberships and the client; the cascades remove programs, nutrition plans, forms and their
   published versions, payments, subscriptions, check-ins, logs, media rows, conversations, messages and revisions;
4. deletes the client's rows in `audit_log` (`client_id` or the `clients` row itself) and `events`: both tables have no
   foreign key, and the audit rows written by the cascade carry the client's personal data in `before`;
5. writes one final audit entry, `client.erase`, entity `clients`, with the erased client id, the counts and the reason
   (the service reason), and no personal data; returns the counts as jsonb.

`consents` of the client's linked users are **not** touched: they are the evidence that consent was given, they hold no contact
data, and §12 states the retention decision (default: kept, see the legal question there). Do not assume one user per
client. The API first captures Storage paths and all linked user ids, deletes the target Storage objects, calls
`app.erase_client`/`app.close_tenant` through `withErasureTx`, then deletes each captured auth user with no remaining
membership. Client prefix: `<tenant>/clients/<client>/`; closure prefix: `<tenant>/`. Record and retry failed stages
before reporting completion.

`app.close_tenant(p_tenant)` sets the flag, deletes the tenant (every table with a foreign key to `tenants` cascades,
published versions included), then deletes what has a `tenant_id` and no foreign key: `idempotency_keys`, `job_runs`,
`audit_log` and `events`. The sweep runs **after** the delete because the cascade itself writes audit rows. It returns
the counts; the API writes its own closure record outside the tenant.

```sql
create or replace function app.erase_client(p_tenant uuid, p_client uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uids uuid[];
  gone jsonb := '{}'::jsonb;
  n bigint;
begin
  if app.uid() is not null then
    raise exception 'erase_client is service-only' using errcode = '42501', detail = 'rule:app.erase_client';
  end if;
  if not exists (select 1 from public.clients where tenant_id = p_tenant and id = p_client) then
    raise exception 'client not found'
      using errcode = 'P0002', detail = 'rule:app.erase_client', table = 'clients', column = 'id';
  end if;
  perform set_config('app.erasure', 'on', true);
  select coalesce(array_agg(distinct m.user_id), array[]::uuid[]) into uids
    from public.memberships m
   where m.tenant_id = p_tenant and m.client_id = p_client;
  delete from public.notifications where tenant_id = p_tenant and user_id = any(uids);
  delete from public.push_subscriptions where tenant_id = p_tenant and user_id = any(uids);
  delete from public.user_preferences where tenant_id = p_tenant and user_id = any(uids);
  delete from public.idempotency_keys where tenant_id = p_tenant and user_id = any(uids);
  delete from public.staff_client_assignments where tenant_id = p_tenant and client_id = p_client;
  delete from public.memberships where tenant_id = p_tenant and client_id = p_client;
  delete from public.clients where tenant_id = p_tenant and id = p_client;
  delete from public.audit_log
   where tenant_id = p_tenant and (client_id = p_client or (entity = 'clients' and entity_id = p_client::text));
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('audit_log', n);
  delete from public.events
   where tenant_id = p_tenant and (client_id = p_client or (aggregate = 'clients' and aggregate_id = p_client::text));
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('events', n);
  insert into public.audit_log (tenant_id, actor_role, action, entity, entity_id, after, reason)
  values (p_tenant, 'service', 'client.erase', 'clients', p_client::text,
          jsonb_build_object('deleted', gone), nullif(current_setting('app.service_reason', true), ''));
  return gone;
end $$;
--> statement-breakpoint
revoke all on function app.erase_client(uuid, uuid) from public;
--> statement-breakpoint

create or replace function app.close_tenant(p_tenant uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  gone jsonb := '{}'::jsonb;
  n bigint;
begin
  if app.uid() is not null then
    raise exception 'close_tenant is service-only' using errcode = '42501', detail = 'rule:app.close_tenant';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'tenant not found'
      using errcode = 'P0002', detail = 'rule:app.close_tenant', table = 'tenants', column = 'id';
  end if;
  perform set_config('app.erasure', 'on', true);
  delete from public.tenants where id = p_tenant;
  delete from public.idempotency_keys where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('idempotency_keys', n);
  delete from public.job_runs where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('job_runs', n);
  delete from public.audit_log where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('audit_log', n);
  delete from public.events where tenant_id = p_tenant;
  get diagnostics n = row_count;
  gone := gone || jsonb_build_object('events', n);
  return gone;
end $$;
--> statement-breakpoint
revoke all on function app.close_tenant(uuid) from public;
--> statement-breakpoint
```

Cases for §13 (suite D, erasure): erasing a client with a published program, nutrition plan and form leaves no row with
that `client_id` in any public table and no `audit_log` or `events` row that carries the client's email or phone, while
other clients of the tenant and the other tenant keep all rows; `app.erase_client` run inside a `dawlyy_rls`
transaction fails with `42501` (no EXECUTE); a second call gives `P0002`; closing a tenant leaves no row with that
`tenant_id` in any public table (the catalog query over every table that has the column), the other tenant is intact,
and the system library (`tenant_id is null`) is intact.

### 7.10 Team and device functions

#### 7.10.1 `app.keep_one_owner` (`memberships_40_owner`, BEFORE UPDATE OR DELETE, runtime only; FL-06)

A tenant must always keep an active owner. The runtime role cannot demote, disable or delete the last active owner,
itself included (`P0001`); with a second owner present the first can step down. The function locks per tenant, so two
owners stepping down at the same moment cannot both pass. Removing a staff member is `status = 'disabled'`; the
runtime has no DELETE on `memberships` (FL-07, §3.3), and the DELETE branch here is the second line.

```sql
create or replace function app.keep_one_owner() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
begin
  if current_user <> 'dawlyy_rls' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if old.role = 'owner' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.status <> 'active') then
    perform pg_advisory_xact_lock(hashtextextended('owners:' || old.tenant_id::text, 0));
    if not exists (select 1 from public.memberships m
                    where m.tenant_id = old.tenant_id and m.role = 'owner' and m.status = 'active' and m.id <> old.id) then
      -- The column at fault is the one that stops the owner being an active owner; a delete names no column.
      col := case when tg_op = 'DELETE' then null when new.role <> 'owner' then 'role' else 'status' end;
      raise exception 'a tenant must keep at least one active owner'
        using errcode = 'P0001', detail = 'rule:app.keep_one_owner', table = tg_table_name, column = coalesce(col, '');
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
--> statement-breakpoint
revoke all on function app.keep_one_owner() from public;
--> statement-breakpoint
drop trigger if exists memberships_40_owner on public.memberships;
--> statement-breakpoint
create trigger memberships_40_owner before update or delete on public.memberships
  for each row execute function app.keep_one_owner();
--> statement-breakpoint
```

The function is SECURITY INVOKER; the owner's own `memberships_owner` policy lets it see every membership of the
tenant, which is all the existence check needs.

#### 7.10.2 `app.team_directory()` (FL-13)

A client sees only its own `memberships` row, so thread headers and "reviewed by" labels cannot show a coach's name.
`app.team_directory()` returns the active owners and staff of the pinned tenant with **only** `user_id`, `role` and
`display_name`: no email, phone or permissions. Client-facing endpoints take coach names from it and never read
`memberships` (§12). `EXECUTE` for `dawlyy_rls` (§3.4).

```sql
create or replace function app.team_directory() returns table (user_id uuid, role text, display_name text)
language sql stable security definer
set search_path = ''
as $$
  select m.user_id, m.role::text, m.display_name
    from public.memberships m
   where m.tenant_id = (select t.tenant_id from app.membership() t)
     and m.role in ('owner', 'staff')
     and m.status = 'active'
$$;
--> statement-breakpoint
revoke all on function app.team_directory() from public;
--> statement-breakpoint
```

#### 7.10.3 `app.register_push(p_endpoint, p_keys, p_ua)` (T16, FL-12, ATK-08, S10)

`push_subscriptions` is unique on `(tenant_id, endpoint)` (§8.1) and has the CHECK `endpoint ~ '^https://'` (§8.3). A
browser endpoint belongs to one person at a time: when a second user logs in on the same device, or the same user
registers from a second tenant, a plain upsert would fail on the other user's row, which row-level security hides.
`app.register_push` is SECURITY DEFINER: it deletes the rows that carry this endpoint and belong to **other users** (in
any tenant), then upserts the caller's row for the pinned tenant, and returns the row id. It checks the endpoint shape
and length and that the keys object has `p256dh` and `auth`. Calls for one endpoint serialize across tenants on
`pg_advisory_xact_lock(hashtextextended('push:' || p_endpoint, 0))` before DELETE and upsert. Same-user rows in
different tenants remain permitted. The API calls it at login and when the browser
subscribes; logout deletes the caller's own rows; the API keeps an allowlist of push-service hosts (§12). Direct INSERT
and UPDATE by the runtime stay allowed by the policy; they cannot take over another user's row.

```sql
create or replace function app.register_push(p_endpoint text, p_keys jsonb, p_ua text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  tid uuid := app.tenant_id();
  uid uuid := app.uid();
  sub_id uuid;
begin
  if tid is null or uid is null then
    raise exception 'no tenant context' using errcode = '42501', detail = 'rule:app.register_push';
  end if;
  if p_endpoint is null or length(p_endpoint) > 2048 or p_endpoint !~ '^https://[^/@]+/' then
    raise exception 'invalid push endpoint'
      using errcode = '22023', detail = 'rule:app.register_push', table = 'push_subscriptions', column = 'endpoint';
  end if;
  if jsonb_typeof(p_keys) is distinct from 'object' or not (p_keys ? 'p256dh' and p_keys ? 'auth') then
    raise exception 'invalid push keys'
      using errcode = '22023', detail = 'rule:app.register_push', table = 'push_subscriptions', column = 'keys';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('push:' || p_endpoint, 0));
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into public.push_subscriptions (tenant_id, user_id, endpoint, keys, user_agent)
  values (tid, uid, p_endpoint, p_keys, left(p_ua, 512))
  on conflict (tenant_id, endpoint) do update
    set keys = excluded.keys, user_agent = excluded.user_agent, failed_at = null
  returning id into sub_id;
  return sub_id;
end $$;
--> statement-breakpoint
revoke all on function app.register_push(text, jsonb, text) from public;
--> statement-breakpoint
```

#### 7.10.4 `app.assign_creator` (`clients_80_assign_creator`, AFTER INSERT; T20)

Staff with `client_scope = 'assigned'` may create clients when they hold the `clients` / `create` permission
(`app.has_perm`, §4); the insert policy no longer needs `ACCESS(id)` for a row that does not exist yet. This trigger
then assigns the new client to the creating staff member's membership, so the creator sees the client at once. It is
SECURITY DEFINER because the runtime has no right to write assignments for itself. It does nothing for owners, for
staff with `client_scope = 'all'` and for service inserts (no pinned membership).

Row-level security applies the SELECT policy to the row that `INSERT ... RETURNING` hands back, **before** this AFTER
trigger has assigned it. Assigned-scope staff therefore insert a client **without `RETURNING`** and read it in the next
statement (§12).

```sql
create or replace function app.assign_creator() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  m record;
begin
  select * into m from app.membership();
  if m.role = 'staff' and m.tenant_id = new.tenant_id
     and coalesce(m.permissions ->> 'client_scope', 'assigned') = 'assigned' then
    insert into public.staff_client_assignments (tenant_id, membership_id, client_id, assigned_by)
    values (new.tenant_id, m.membership_id, new.id, app.uid())
    on conflict do nothing;
  end if;
  return null;
end $$;
--> statement-breakpoint
revoke all on function app.assign_creator() from public;
--> statement-breakpoint
drop trigger if exists clients_80_assign_creator on public.clients;
--> statement-breakpoint
create trigger clients_80_assign_creator after insert on public.clients
  for each row execute function app.assign_creator();
--> statement-breakpoint
```

Cases for §13 (suite T): the sole owner cannot disable, demote or delete themself (`P0001`), a second owner lets the first
step down; a client reads the coach names through `app.team_directory()` and sees no email or phone; the same push
endpoint registered by user B takes the row from user A, and user A registering it in a second tenant works; an
`http://` endpoint is refused; staff without `clients` / `create` cannot insert a client; assigned-scope staff with it
can, without `RETURNING`, and see the client afterwards; owners and all-scope staff get no assignment row.

### 7.11 Visible references, task assignees and payment proof

#### 7.11.1 `app.visible_refs` (`<t>_10_refs`, BEFORE INSERT OR UPDATE, runtime only; C9)

Foreign keys bypass RLS, so a client could point a workout session or a meal log at a version that is hidden from it
(a draft or `in_review` version of its own copy). The 4-column key on `workout_sessions` (§8.2) already binds session,
client, program and version together; this trigger adds visibility. For the runtime role, the version named in
`workout_sessions.program_version_id`, `meal_logs.plan_version_id` or `supplement_logs.plan_version_id` must be a row
the caller can **see** under RLS (the client policies show only published and superseded versions). The check runs
when the column is set or changed. SECURITY INVOKER.

```sql
create or replace function app.visible_refs() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ok boolean := true;
begin
  if current_user <> 'dawlyy_rls' then
    return new;
  end if;
  if tg_table_name = 'workout_sessions' then
    if new.program_version_id is not null
       and (tg_op = 'INSERT' or new.program_version_id is distinct from old.program_version_id) then
      ok := exists (select 1 from public.program_versions v where v.id = new.program_version_id);
    end if;
  elsif new.plan_version_id is not null
        and (tg_op = 'INSERT' or new.plan_version_id is distinct from old.plan_version_id) then
    ok := exists (select 1 from public.nutrition_plan_versions v where v.id = new.plan_version_id);
  end if;
  if not ok then
    raise exception '%: the referenced version is not visible to you', tg_table_name
      using errcode = '23503', detail = 'rule:app.visible_refs', table = tg_table_name,
            column = case when tg_table_name = 'workout_sessions' then 'program_version_id' else 'plan_version_id' end;
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.visible_refs() from public;
--> statement-breakpoint
drop trigger if exists workout_sessions_10_refs on public.workout_sessions;
--> statement-breakpoint
create trigger workout_sessions_10_refs before insert or update on public.workout_sessions
  for each row execute function app.visible_refs();
--> statement-breakpoint
drop trigger if exists meal_logs_10_refs on public.meal_logs;
--> statement-breakpoint
create trigger meal_logs_10_refs before insert or update on public.meal_logs
  for each row execute function app.visible_refs();
--> statement-breakpoint
drop trigger if exists supplement_logs_10_refs on public.supplement_logs;
--> statement-breakpoint
create trigger supplement_logs_10_refs before insert or update on public.supplement_logs
  for each row execute function app.visible_refs();
--> statement-breakpoint
```

#### 7.11.2 `app.task_assignee_check` (`tasks_20_assignee`, BEFORE INSERT OR UPDATE OF assignee_membership_id, every role; ATK-06)

`assignee_membership_id` must name an **active owner or staff** membership of the task's tenant. It is checked when
the column is set or changed, so a task that was assigned to a member who is disabled later stays readable.
SECURITY DEFINER, so the lookup does not depend on which memberships the caller can see (N12: it filters on the task's
own tenant, and a missing, disabled, client or foreign-tenant membership raises `23503`).

```sql
create or replace function app.task_assignee_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_membership_id is not null
     and (tg_op = 'INSERT' or new.assignee_membership_id is distinct from old.assignee_membership_id)
     and not exists (select 1 from public.memberships m
                      where m.id = new.assignee_membership_id and m.tenant_id = new.tenant_id
                        and m.role in ('owner', 'staff') and m.status = 'active') then
    raise exception 'tasks: the assignee must be an active owner or staff member'
      using errcode = '23503', detail = 'rule:app.task_assignee_check', table = tg_table_name, column = 'assignee_membership_id';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.task_assignee_check() from public;
--> statement-breakpoint
drop trigger if exists tasks_20_assignee on public.tasks;
--> statement-breakpoint
create trigger tasks_20_assignee before insert or update of assignee_membership_id on public.tasks
  for each row execute function app.task_assignee_check();
--> statement-breakpoint
```

#### 7.11.3 `app.media_proof_rules` (`media_20_proof`, BEFORE UPDATE OF deleted_at, every role; SQLX-11)

A payment proof that a verified, rejected or refunded payment points at is evidence. Soft-deleting it (which a purge
job would follow by removing the Storage object) is refused for every role while the payment is not `pending`.
SECURITY DEFINER, so the check does not depend on what the caller can see.

```sql
create or replace function app.media_proof_rules() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (select 1 from public.payments p where p.proof_media_id = old.id and p.state <> 'pending') then
    raise exception 'media: the proof of a payment that is no longer pending cannot be deleted'
      using errcode = 'P0001', detail = 'rule:app.media_proof_rules', table = tg_table_name, column = 'deleted_at';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.media_proof_rules() from public;
--> statement-breakpoint
drop trigger if exists media_20_proof on public.media;
--> statement-breakpoint
create trigger media_20_proof before update of deleted_at on public.media
  for each row execute function app.media_proof_rules();
--> statement-breakpoint
```

Cases for §13 (suite K): a client cannot start a session on a draft version of its own copy (`23503`) but can on a
published or superseded one; a task cannot be assigned to a disabled member, a client membership or a member of another
tenant; a client cannot soft-delete the proof of a verified payment (`P0001`) but can delete the proof of a pending one.

#### 7.11.4 Refund permission (`payments_60_refund_perm`, BEFORE UPDATE OF refund_amount)

Every staff change to `refund_amount`, including a partial refund that stays `verified`, requires `billing`/`verify`.
The guard still enforces billing/edit, monotonic amounts, state and receipt integrity. The owner passes; service
writes retain their trusted path. The trigger function receives no runtime EXECUTE grant.

```sql
create or replace function app.payment_refund_permission() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'dawlyy_rls' and app.role() = 'staff'
     and new.refund_amount is distinct from old.refund_amount
     and not app.has_perm('billing', 'verify') then
    raise exception 'refund changes require billing verify'
      using errcode = '42501', detail = 'rule:app.payment_refund_permission',
            table = tg_table_name, column = 'refund_amount';
  end if;
  return new;
end $$;
--> statement-breakpoint
revoke all on function app.payment_refund_permission() from public;
--> statement-breakpoint
drop trigger if exists payments_60_refund_perm on public.payments;
--> statement-breakpoint
create trigger payments_60_refund_perm before update of refund_amount on public.payments
  for each row execute function app.payment_refund_permission();
--> statement-breakpoint
```

### 7.12 Trigger inventory (catalog test C10)

The guard triggers `<table>_50_guard` are listed in §6.3. Every other trigger of the pass is below. The "Arguments"
column is the literal argument list of `create trigger`, in order.

| Trigger | Table | Timing and events | Function (arguments) |
|---|---|---|---|
| `<t>_20_protect` | program_versions, nutrition_plan_versions, form_versions | BEFORE UPDATE OR DELETE | `app.protect_published_version(<head column>)`: `'program_id'`, `'plan_id'`, `'form_id'` |
| `<t>_10_version` | the same three | BEFORE INSERT OR UPDATE | `app.version_rules(<head table>, <head column>)`: `('programs','program_id')`, `('nutrition_plans','plan_id')`, `('forms','form_id')` |
| `<t>_90_pointers` | the same three | AFTER INSERT OR UPDATE OF status OR DELETE | `app.version_pointers(<head table>, <head column>)`, the same pairs as `version_rules` |
| `<t>_10_head` | programs, nutrition_plans, forms | BEFORE INSERT OR UPDATE OR DELETE | `app.head_rules(<versions table>, <head column>)`: `('program_versions','program_id')`, `('nutrition_plan_versions','plan_id')`, `('form_versions','form_id')` |
| `<t>_10_template` | programs, nutrition_plans, forms | BEFORE INSERT OR UPDATE | `app.template_ref_check()` |
| `messages_10_message` | messages | BEFORE INSERT OR UPDATE | `app.message_rules()` |
| `messages_after_insert` | messages | AFTER INSERT | `app.on_message_insert()` |
| `messages_after_update` | messages | AFTER UPDATE OF body, deleted_at, WHEN body or deleted_at changed | `app.on_message_update()` |
| `messages_95_revision` | messages | AFTER UPDATE OF body, attachments, WHEN either changed | `app.message_revision()` |
| `form_submissions_10_submission` | form_submissions | BEFORE INSERT | `app.submission_rules()` |
| `set_logs_10_library` | set_logs | BEFORE INSERT OR UPDATE | `app.set_logs_library_check()` |
| `exercises_10_library` | exercises | BEFORE INSERT OR UPDATE | `app.library_ref_check('exercises','based_on_id')` |
| `foods_10_library` | foods | BEFORE INSERT OR UPDATE | `app.library_ref_check('foods','based_on_id')` |
| `exercises_10_thumbnail` | exercises | BEFORE INSERT OR UPDATE | `app.exercise_thumbnail_check()` |
| `workout_sessions_10_refs`, `meal_logs_10_refs`, `supplement_logs_10_refs` | those tables | BEFORE INSERT OR UPDATE | `app.visible_refs()` |
| `tasks_20_assignee` | tasks | BEFORE INSERT OR UPDATE OF assignee_membership_id | `app.task_assignee_check()` |
| `media_20_proof` | media | BEFORE UPDATE OF deleted_at | `app.media_proof_rules()` |
| `memberships_40_owner` | memberships | BEFORE UPDATE OR DELETE | `app.keep_one_owner()` |
| `clients_80_assign_creator` | clients | AFTER INSERT | `app.assign_creator()` |
| `clients_90_code` | clients | BEFORE INSERT | `app.assign_client_code()` |
| `payments_60_refund_perm` | payments | BEFORE UPDATE OF refund_amount | `app.payment_refund_permission()` |
| `payments_90_receipt` | payments | BEFORE INSERT OR UPDATE | `app.payment_receipt()` |
| `<t>_audit` | clients, client_notes, packages, invitations, consents, programs, nutrition_plans, forms, ai_requests, client_flags, media | AFTER INSERT OR UPDATE OR DELETE | `app.audit_row()` |
| `<t>_audit`, `<t>_audit_update` | the three versions tables | AFTER INSERT OR DELETE; AFTER UPDATE OF status, published_at, superseded_at | `app.audit_row('document')` |
| `tenants_audit`, `tenants_audit_update` | tenants | AFTER INSERT OR DELETE; AFTER UPDATE OF name, slug, client_code_prefix, default_locale, timezone, currency, archived_at | `app.audit_row()` |

Order on one table, by name: `programs_10_head` < `programs_10_template` < `programs_50_guard` (BEFORE);
`program_versions_10_version` < `program_versions_20_protect` < `program_versions_50_guard` (BEFORE);
`memberships_40_owner` < `memberships_50_guard`; `payments_50_guard` < `payments_60_refund_perm` < `payments_90_receipt`;
`clients_50_guard` < `clients_90_code` (BEFORE) and `clients_80_assign_creator` (AFTER). Every name is at most 63 bytes (D1).

#### Parent lookups and stamps (N12)

Every lookup below reads the parent as the caller. A SECURITY INVOKER function therefore sees only what RLS shows the
caller; the three SECURITY DEFINER lookups filter on the row's own tenant. A parent that is missing or invisible
always raises `23503`; the stamped columns are overwritten from the parent or the session and never raise. Tests assert
the stored value, not an error, for every stamp.

| Function (trigger) | Parent it reads | Missing or invisible parent | Columns it stamps (never rejected) | Rejected instead of stamped |
|---|---|---|---|---|
| `app.version_rules` (`<t>_10_version`) | the head (`programs`, `nutrition_plans`, `forms`) | `23503`, column = the head column | `tenant_id`, `client_id` on INSERT, every role | none |
| `app.head_rules` (`<t>_10_head`) | the versions of this head | `23503` (`published_version_id`, `current_version_id`) | none | a runtime write of `published_version_id` (`42501`) |
| `app.message_rules` (`messages_10_message`) | the conversation | `23503`, column `conversation_id` | INSERT: `client_id` (every role); runtime: `sender_user_id`, `sender_role`, `created_at`. UPDATE: `edited_at`, `read_by_client_at`, `read_by_coach_at` | edit, delete or read times on a new message and a cleared marker (`42501`) |
| `app.submission_rules` (`form_submissions_10_submission`) | the form version and its form | `23503`, column `form_version_id` | `form_id`, `form_kind` on INSERT | a visible form of another client (`42501`); an unpublished version at runtime (`P0001`) |
| `app.set_logs_library_check` (`set_logs_10_library`, definer) | `exercises` | `23503` (`exercise_id`, `substituted_for`) | none | none |
| `app.library_ref_check` (`exercises_10_library`, `foods_10_library`) | the same library table | `23503`, column = the reference column | none | none |
| `app.exercise_thumbnail_check` (`exercises_10_thumbnail`, definer) | `media` | `23503`, column `thumbnail_media_id` | none | none |
| `app.template_ref_check` (`<t>_10_template`) | the same table | `23503`, column `template_id` | none | none |
| `app.visible_refs` (`<t>_10_refs`, runtime only) | the version table | `23503`, column `program_version_id` or `plan_version_id` | none | none |
| `app.task_assignee_check` (`tasks_20_assignee`, definer) | `memberships` | `23503`, column `assignee_membership_id` | none | none |

#### Columns that triggers maintain (N20)

Each column below is in the runtime `immutable` list of its table in §6.3 (the unread counters use `update_to` with
`0` only), so no runtime role writes it, the owner included. Every writer is either SECURITY DEFINER, where the guard
does not apply, or a BEFORE trigger that stamps a column on INSERT only, where `immutable` does not apply. The catalog
test C08 (§13) checks that each of these columns is in the `immutable` list of §6.3 (or has `update_to`); no section 7
SECURITY INVOKER function writes a column that §6.3 makes immutable on UPDATE.

| Column | Written by | Runs as |
|---|---|---|
| `tenants.client_counter`, `tenants.receipt_counter` | `app.next_client_code`, `app.next_receipt_no` (§7.7) | definer |
| `clients.code` | `app.assign_client_code` (`clients_90_code`, §7.7) | definer |
| `payments.receipt_no` | `app.payment_receipt` (`payments_90_receipt`, §7.7) | definer |
| `programs`, `nutrition_plans`, `forms`: `published_version_id` | `app.version_pointers` (§7.3.2) | definer |
| `conversations.last_message_at`, `last_message_preview` | `app.on_message_insert`, `app.on_message_update` (§7.4) | definer |
| `conversations.unread_for_client`, `unread_for_coach` | `app.on_message_insert` (§7.4); reset to `0` by the runtime (`update_to`) | definer; runtime |
| `workout_sessions.summary`, `inbody_records.normalized` | API through service, after sync / normalization (§12) | service |
| `push_subscriptions.last_used_at`, `failed_at` | worker through service; `app.register_push` resets failed_at (§7.10.3) | service; definer |
| versions tables: `tenant_id`, `client_id` | `app.version_rules`, INSERT only (§7.2) | invoker |
| `form_submissions.form_id`, `form_kind` | `app.submission_rules`, INSERT only (§7.5.1) | invoker |
| `messages.client_id`, `sender_user_id`, `sender_role`, `created_at` | `app.message_rules`, INSERT only (§7.4); `messages` has no guard, an UPDATE of them gets `42501` from the same function | invoker |

Cases for §13 (N2, N12, N20): each family below raises with the detail and column named here, and each rejection is
followed in the same test by the permitted variant of the same actor. `rule:app.version_rules` with column
`version_no` (duplicate number) and `program_id` (invisible head, `23503`); `rule:app.protect_published_version` with
column `document` (frozen content), `status` (reopen, bad edge) and no column (delete);
`rule:app.head_rules` with column `published_version_id` (runtime write, `42501`) and `current_version_id`;
`rule:app.message_rules` with column `conversation_id` (invisible thread, `23503`), `edited_at` (new message with an edit
time), `body` (another author's text) and `read_by_client_at` (cleared marker); `rule:app.submission_rules` with column
`form_version_id` (`23503`, `P0001`) and `client_id` (`42501`); `rule:app.keep_one_owner` with column `role`, `status`
and none for a delete; `rule:app.payment_refund_permission` with column `refund_amount` (`42501`);
`rule:app.advance_due`, `rule:app.entity_client`, `rule:app.erase_client` and
`rule:app.close_tenant` with `table` and `column` as in the code above; `rule:app.audit` and `rule:app.emit_event` with
neither. `23503` for a client who names an internal thread, for assigned-scope staff who name an unassigned client's
thread, and for a version of a client's copy whose head the caller cannot see; a message that carries another
`sender_role`, `sender_user_id` or `client_id` is stored with the stamps; a version inserted with a foreign `tenant_id` or
`client_id` is stored with the head's values; a submission sent with a wrong `form_id` or `form_kind` is stored with the
form's.
## 8. Referential integrity

Every constraint, index, trigger and policy name in this section is at most 63 bytes (Postgres truncates longer names with
only a NOTICE, which would desynchronise the Drizzle snapshot from the database). The longest new name is
`program_versions_tenant_client_program_id_uq` (44 bytes). The one legacy exception is named in §8.2.

### 8.1 Unique targets (Drizzle `uniqueIndex`, explicit names)

`clients_tenant_id_uq (tenant_id, id)`, `memberships_tenant_id_uq (tenant_id, id)`, `packages_tenant_id_uq (tenant_id, id)`,
`subscriptions_tenant_client_id_uq (tenant_id, client_id, id)`, `media_tenant_id_uq (tenant_id, id)`,
`media_tenant_client_id_uq (tenant_id, client_id, id)`, `programs_tenant_id_uq (tenant_id, id)`,
`programs_tenant_client_id_uq (tenant_id, client_id, id)`, `nutrition_plans_tenant_id_uq (tenant_id, id)`,
`forms_tenant_id_uq (tenant_id, id)`,
`program_versions_tenant_client_program_id_uq (tenant_id, client_id, program_id, id)`,
`nutrition_plan_versions_tenant_client_id_uq (tenant_id, client_id, id)`, `form_versions_tenant_id_uq (tenant_id, id)`,
`calendar_events_tenant_client_id_uq (tenant_id, client_id, id)`, `metric_entries_tenant_client_id_uq (tenant_id, client_id, id)`,
`workout_sessions_tenant_client_id_uq (tenant_id, client_id, id)`, `conversations_tenant_id_uq (tenant_id, id)`,
`messages_tenant_id_uq (tenant_id, id)`, `messages_tenant_conversation_id_uq (tenant_id, conversation_id, id)`,
`notifications_tenant_id_uq (tenant_id, id)`.

Head-qualified targets for the `current_version_id` foreign keys (§8.2): `program_versions_id_program_uq (id, program_id)`,
`nutrition_plan_versions_id_plan_uq (id, plan_id)`, `form_versions_id_form_uq (id, form_id)`.

`program_versions_tenant_client_program_id_uq` is the parent key of `workout_sessions_version_fk` (§8.2) and replaces the
older 3-column key on the same table; `messages_tenant_id_uq` is the parent key of `message_revisions`.

**Offline-sync keys (ATK-14).** The `client_uuid` unique indexes include the owner of the row, so one client can neither
burn nor collide with another client's uuid. The index names do not change; only the columns do (drizzle-kit writes a
drop and a create). Every sync upsert uses the matching `ON CONFLICT` target.

| Index (existing name) | Table | Columns | `ON CONFLICT` target |
|---|---|---|---|
| `metric_entries_client_uuid_uq` | metric_entries | (tenant_id, client_id, client_uuid) | same columns |
| `measurement_sets_client_uuid_uq` | measurement_sets | (tenant_id, client_id, client_uuid) | same columns |
| `progress_photo_sets_client_uuid_uq` | progress_photo_sets | (tenant_id, client_id, client_uuid) | same columns |
| `workout_sessions_client_uuid_uq` | workout_sessions | (tenant_id, client_id, client_uuid) | same columns |
| `set_logs_client_uuid_uq` | set_logs | (tenant_id, client_id, client_uuid) | same columns |
| `meal_logs_client_uuid_uq` | meal_logs | (tenant_id, client_id, client_uuid) | same columns |
| `supplement_logs_client_uuid_uq` | supplement_logs | (tenant_id, client_id, client_uuid) | same columns |
| `form_submissions_client_uuid_uq` | form_submissions | (tenant_id, client_id, client_uuid) | same columns |
| `messages_client_uuid_uq` | messages | (tenant_id, sender_user_id, client_uuid) | same columns (messages in internal threads have no client) |

**Push subscriptions (T16).** `push_subscriptions_endpoint_uq (endpoint)` is replaced by
`push_subscriptions_tenant_endpoint_uq (tenant_id, endpoint)`. The same browser can subscribe in two tenants, and the
conflict target of `app.register_push` (§7) is `(tenant_id, endpoint)`. One row per endpoint per tenant is the rule;
`app.register_push` removes another user's row for the same endpoint before it upserts the caller's.

### 8.2 Foreign keys

Composite keys use Drizzle `foreignKey({ name, columns, foreignColumns })` with the explicit name below. "Replaces"
means the existing single-column `.references()` on that column is removed; every `tenant_id → tenants(id) on delete
cascade` stays. Postgres MATCH SIMPLE skips the check when any referencing column is null, which is the intended
behaviour for the nullable columns below.

| Name | Child (columns) | Parent (columns) | On delete | |
|---|---|---|---|---|
| memberships_client_fk | memberships (tenant_id, client_id) | clients (tenant_id, id) | cascade | new |
| sca_membership_fk | staff_client_assignments (tenant_id, membership_id) | memberships (tenant_id, id) | cascade | replaces |
| sca_client_fk | staff_client_assignments (tenant_id, client_id) | clients (tenant_id, id) | cascade | new |
| invitations_client_fk | invitations (tenant_id, client_id) | clients (tenant_id, id) | cascade | new |
| client_notes_client_fk | client_notes (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| client_flags_client_fk | client_flags (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| subscriptions_client_fk | subscriptions (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| subscriptions_package_fk | subscriptions (tenant_id, package_id) | packages (tenant_id, id) | no action | replaces |
| sub_events_subscription_fk | subscription_events (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | cascade | replaces |
| ceo_client_fk | client_entitlement_overrides (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| ceo_subscription_fk | client_entitlement_overrides (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | cascade | replaces |
| payments_client_fk | payments (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| payments_subscription_fk | payments (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | no action | replaces |
| payments_proof_media_fk | payments (tenant_id, client_id, proof_media_id) | media (tenant_id, client_id, id) | no action | new |
| exercises_thumbnail_fk | exercises (tenant_id, thumbnail_media_id) | media (tenant_id, id) | no action | new |
| exercises_based_on_fk | exercises (based_on_id) | exercises (id) | set null | new column |
| foods_based_on_fk | foods (based_on_id) | foods (id) | set null | new column |
| programs_client_fk | programs (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| programs_template_fk | programs (tenant_id, template_id) | programs (tenant_id, id) | no action | new |
| programs_subscription_fk | programs (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | no action | new |
| programs_current_version_fk | programs (current_version_id, id) | program_versions (id, program_id) | set null (current_version_id) | new, hand edit |
| program_versions_program_fk | program_versions (tenant_id, program_id) | programs (tenant_id, id) | cascade | replaces |
| nutrition_plans_client_fk | nutrition_plans (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| nutrition_plans_template_fk | nutrition_plans (tenant_id, template_id) | nutrition_plans (tenant_id, id) | no action | new |
| nutrition_plans_subscription_fk | nutrition_plans (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | no action | new |
| nutrition_plans_current_version_fk | nutrition_plans (current_version_id, id) | nutrition_plan_versions (id, plan_id) | set null (current_version_id) | new, hand edit |
| nutrition_plan_versions_plan_fk | nutrition_plan_versions (tenant_id, plan_id) | nutrition_plans (tenant_id, id) | cascade | replaces |
| meal_logs_client_fk | meal_logs (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| meal_logs_plan_version_fk | meal_logs (tenant_id, client_id, plan_version_id) | nutrition_plan_versions (tenant_id, client_id, id) | no action | new |
| supplement_logs_client_fk | supplement_logs (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| supplement_logs_plan_version_fk | supplement_logs (tenant_id, client_id, plan_version_id) | nutrition_plan_versions (tenant_id, client_id, id) | no action | new |
| forms_client_fk | forms (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| forms_template_fk | forms (tenant_id, template_id) | forms (tenant_id, id) | no action | new |
| forms_current_version_fk | forms (current_version_id, id) | form_versions (id, form_id) | set null (current_version_id) | new, hand edit |
| form_versions_form_fk | form_versions (tenant_id, form_id) | forms (tenant_id, id) | cascade | replaces |
| form_submissions_client_fk | form_submissions (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| form_submissions_version_fk | form_submissions (tenant_id, form_version_id) | form_versions (tenant_id, id) | no action | replaces |
| form_submissions_event_fk | form_submissions (tenant_id, client_id, calendar_event_id) | calendar_events (tenant_id, client_id, id) | no action | new |
| form_submissions_subscription_fk | form_submissions (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | no action | new |
| calendar_events_client_fk | calendar_events (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| calendar_events_subscription_fk | calendar_events (tenant_id, client_id, subscription_id) | subscriptions (tenant_id, client_id, id) | cascade | new |
| calendar_events_rescheduled_fk | calendar_events (tenant_id, client_id, rescheduled_from) | calendar_events (tenant_id, client_id, id) | no action | new |
| metric_entries_client_fk | metric_entries (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| metric_entries_correction_fk | metric_entries (tenant_id, client_id, correction_of) | metric_entries (tenant_id, client_id, id) | no action | new |
| measurement_sets_client_fk | measurement_sets (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| progress_photo_sets_client_fk | progress_photo_sets (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| inbody_records_client_fk | inbody_records (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| inbody_records_media_fk | inbody_records (tenant_id, client_id, raw_media_id) | media (tenant_id, client_id, id) | no action | new |
| workout_sessions_client_fk | workout_sessions (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| workout_sessions_program_fk | workout_sessions (tenant_id, client_id, program_id) | programs (tenant_id, client_id, id) | no action | new |
| workout_sessions_version_fk | workout_sessions (tenant_id, client_id, program_id, program_version_id) | program_versions (tenant_id, client_id, program_id, id) | no action | new (4 columns) |
| set_logs_session_fk | set_logs (tenant_id, client_id, session_id) | workout_sessions (tenant_id, client_id, id) | cascade | replaces |
| set_logs_exercise_fk | set_logs (exercise_id) | exercises (id) | no action | new |
| set_logs_substituted_fk | set_logs (substituted_for) | exercises (id) | no action | new |
| conversations_client_fk | conversations (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| messages_conversation_fk | messages (tenant_id, conversation_id) | conversations (tenant_id, id) | cascade | replaces |
| messages_reply_fk | messages (tenant_id, conversation_id, reply_to_id) | messages (tenant_id, conversation_id, id) | no action | new |
| tenant_hidden_items_tenant_fk | tenant_hidden_items (tenant_id) | tenants (id) | cascade | new table |
| message_revisions_tenant_fk | message_revisions (tenant_id) | tenants (id) | cascade | new table |
| message_revisions_message_fk | message_revisions (tenant_id, message_id) | messages (tenant_id, id) | cascade | new table |
| notifications_client_fk | notifications (tenant_id, client_id) | clients (tenant_id, id) | cascade | new |
| notification_deliveries_notification_fk | notification_deliveries (tenant_id, notification_id) | notifications (tenant_id, id) | cascade | replaces |
| tasks_client_fk | tasks (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| tasks_assignee_fk | tasks (tenant_id, assignee_membership_id) | memberships (tenant_id, id) | no action | new |
| media_client_fk | media (tenant_id, client_id) | clients (tenant_id, id) | cascade | replaces |
| ai_requests_client_fk | ai_requests (tenant_id, client_id) | clients (tenant_id, id) | cascade | new |

**Sessions and their program version (C9).** `workout_sessions_version_fk` names the program as well as the version, so a
session cannot pair program P1 with a version of program P2 of the same client. MATCH SIMPLE would skip the 4-column
check when `program_id` is null, so `workout_sessions_program_pair_ck` (§8.3) requires a program whenever a version is
set. `app.visible_refs()` (§7.6) still refuses references to versions the caller cannot see.

**Head pointers (C10, D4).** `current_version_id` must name a version of the same head. The three `*_current_version_fk`
keys reference `(id, <head column>)` on the versions table with the head's own `id`, so the check needs no tenant
column and the unique targets are the head-qualified ones of §8.1. `on delete set null (current_version_id)` clears
only that column when the version is deleted (the PG15+ column list); a plain `set null` would also null the head's `id`
and fail. Drizzle cannot express the column list, so the Drizzle schema declares no foreign key on `current_version_id`
(it carries one comment pointing here) and 0004 gets the hand edit of §11:

```sql
ALTER TABLE "programs" ADD CONSTRAINT "programs_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."program_versions"("id","program_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
ALTER TABLE "nutrition_plans" ADD CONSTRAINT "nutrition_plans_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."nutrition_plan_versions"("id","plan_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_current_version_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."form_versions"("id","form_id") ON DELETE set null ("current_version_id");
--> statement-breakpoint
```

These three statements go at the end of 0004, after every unique index they reference. Deleting a head deletes its
versions through `*_program_fk` / `*_plan_fk` / `*_form_fk` and the pointer reset finds no head row left, so a head
with a pointer deletes cleanly (tested). `published_version_id` has no foreign key: the definer trigger
`<versions table>_90_pointers` (§7.3) sets it on publish and clears it when the published version is archived, and it
is immutable for the runtime.

**Legacy name (D1).** The generated name of the existing foreign key
`client_entitlement_overrides_subscription_id_subscriptions_id_fk` is 64 bytes; the database stores its 63-byte
truncation. `ceo_subscription_fk` replaces it in 0004, and a `DROP CONSTRAINT` that uses the 64-byte name is truncated
the same way and works.

**Library and template references.** `set_logs.exercise_id` and `set_logs.substituted_for` are ordinary foreign keys with
no action: a deleted exercise would leave orphaned history (S9, C12). The runtime cannot delete exercises or foods at all
(§3.3), so retiring a library item means `hidden` or `tenant_hidden_items`. The tenant and system scope of a library
reference is still checked by trigger (§7.6). A foreign key cannot test `kind`, so two more rules live in §7.6 as triggers:
`template_id` must name a row with `kind = 'template'` and `client_id is null`, and an exercise thumbnail must be a
tenant asset (`media.client_id is null`).

**Erasure and closure.** Every cascade above completes inside one delete statement, and the `no action` keys are checked
at the end of the statement. Deleting a client (with sessions, set logs, payments that reference their proof media,
programs with a `current_version_id`, conversations with message revisions) and deleting a tenant (with set logs that
reference the same tenant's exercises) both succeed, so `app.erase_client` and `app.close_tenant` need no deferred
constraints.

Not foreign keys, by design: `clients.membership_id` (written only by the service at invitation acceptance, immutable
at runtime), user ids (`auth.users` is outside our schemas), `programs/nutrition_plans/forms.published_version_id` (kept
by the pointer trigger above), `message_revisions.client_id` (a copy of the message's client for the policies; the row
cascades with its message), `tenant_hidden_items.item_id` (points at exercises or foods by `kind`), ids inside JSON
documents (§12), `audit_log` and `events` (append-only history and queue).

### 8.3 CHECK constraints (Drizzle `check()`, every role)

| Name | Table | Expression |
|---|---|---|
| tenant_hidden_items_kind_ck | tenant_hidden_items | `kind in ('exercise','food')` |
| programs_kind_client_ck | programs | `(kind = 'template') = (client_id is null)` |
| nutrition_plans_kind_client_ck | nutrition_plans | same |
| forms_kind_client_ck | forms | same |
| conversations_kind_client_ck | conversations | `(kind = 'internal') = (client_id is null)` |
| invitations_role_client_ck | invitations | `(role = 'client') = (client_id is not null)` |
| memberships_role_client_ck | memberships | `(role = 'client') = (client_id is not null)` |
| calendar_events_rule_ck | calendar_events | `source <> 'package_rule' or (rule_key is not null and subscription_id is not null)` |
| programs_client_sub_ck | programs | `client_id is not null or subscription_id is null` |
| nutrition_plans_client_sub_ck | nutrition_plans | same |
| workout_sessions_program_pair_ck | workout_sessions | `program_version_id is null or program_id is not null` |
| payments_amount_ck | payments | `amount >= 0 and amount < 'Infinity'::numeric and (refund_amount is null or (refund_amount >= 0 and refund_amount <= amount))` |
| payments_refund_state_ck | payments | `(state = 'refunded') = (refund_amount is not null and refund_amount = amount) and (refund_amount is null or state in ('verified', 'refunded'))` |
| payments_rejected_reason_ck | payments | `rejected_reason is null or state = 'rejected'` |
| media_path_ck | media | the expression below |
| push_subscriptions_endpoint_ck | push_subscriptions | `endpoint ~ '^https://'` |
| program_versions_published_at_ck | program_versions | `status not in ('published', 'superseded') or published_at is not null` |
| nutrition_plan_versions_published_at_ck | nutrition_plan_versions | same |
| form_versions_published_at_ck | form_versions | same |

`media_path_ck` (T15; written with `[.]` instead of a backslash so the Drizzle `sql` template cannot mangle the escape):

```sql
bucket in ('client-media', 'tenant-assets')
and (client_id is null) = (bucket = 'tenant-assets')
and path ~ '^[A-Za-z0-9._/-]+$'
and path !~ '(^|/)[.]{1,2}(/|$)'
and path !~ '//'
and path !~ '/$'
and ((client_id is null and starts_with(path, tenant_id::text || '/assets/'))
     or (client_id is not null and starts_with(path, tenant_id::text || '/clients/' || client_id::text || '/')))
```

The media path rule matters because the API signs Storage URLs from `media.bucket/path` with the service key: a row
pointing at another tenant's object would hand that object out. Tenant assets (`client_id is null`) live in the
`tenant-assets` bucket under `<tenant>/assets/`; client media lives in `client-media` under `<tenant>/clients/<client>/`.
The character whitelist excludes backslash, `%` and control characters, and the two segment patterns exclude `.`, `..`
and empty segments, so no path can climb out of its prefix. The API chooses the file name after the prefix, and it uses
only the whitelisted characters.

Notes on the other rows:

- **Money and NaN (C20).** `payments.amount` and `refund_amount` are `numeric(12,2)`, which stores `NaN`, and `NaN >= 0`
  is true. Postgres sorts `NaN` above `Infinity`, so `amount < 'Infinity'::numeric` rejects both; a NaN `refund_amount`
  fails `refund_amount <= amount`. `subscriptions.price` and the package prices have no CHECK today and the triage adds
  none.
- **Refunds (FL-09, C20).** A partial refund leaves the payment `verified`; `refunded` means fully refunded. `refund_amount`
  is the running total and never decreases (guard key `monotonic`, §6.1). The second clause of
  `payments_refund_state_ck` says a refund amount exists only on a verified or refunded payment. The first refund stamps
  `refunded_at` (guard `on_set`). `payments_rejected_reason_ck` keeps a rejection reason off every other state.
- **Heads (C8).** A template has no client, and MATCH SIMPLE would skip its subscription foreign key, so
  `subscription_id` on a template could name any subscription of any tenant; the two `*_client_sub_ck` checks close that.
  `forms` has no `subscription_id` column and needs none.
- **Calendar rule (STATE.md S22).** `calendar_events_rule_ck` already implies the weaker rule
  `source <> 'package_rule' or rule_key is not null` that STATE.md asks 0003 to add; no second constraint is needed.
- **Published versions (SQLX-07).** The publish stamps come from the guard, which does not run for service code. A service
  publish must therefore set `published_at` and `published_by` itself (§12); the CHECK turns a forgotten stamp into a
  23514 instead of a silently unfrozen version. `version_rules` (§7.2) also computes the newest published version
  from `status`, not only from `published_at`.
- **Push (T16).** The runtime cannot aim a push at `http://` or any other scheme. The API additionally keeps a push-host
  allowlist (§12).

### 8.4 Child-side indexes (PERF-03)

A foreign key needs an index on the child side or every parent delete, cascade and update scans the whole tenant's
child rows. Rule (also §15, step 2): every foreign key has an index whose first column, or whose second column when the
first is `tenant_id`, is a non-tenant column of the key; partial predicates are fine for nullable key columns (Postgres
still picks them for the `key = $n` lookups that referential actions run; tested with generic plans). The primary key
on `id` covers the three head-qualified keys, because each includes the head's own `id`. Foreign keys on `tenant_id`
alone are exempt: they matter only when a whole tenant is closed.

Existing indexes of 0001 cover every other key. These indexes are new (Drizzle `index()` with explicit names):

| Index | Columns | Predicate | Serves |
|---|---|---|---|
| ai_requests_tenant_client_idx | ai_requests (tenant_id, client_id) | `client_id is not null` | ai_requests_client_fk |
| forms_tenant_client_idx | forms (tenant_id, client_id) | `client_id is not null` | forms_client_fk |
| invitations_tenant_client_idx | invitations (tenant_id, client_id) | `client_id is not null` | invitations_client_fk |
| notifications_tenant_client_idx | notifications (tenant_id, client_id) | `client_id is not null` | notifications_client_fk |
| subscriptions_tenant_package_idx | subscriptions (tenant_id, package_id) | | subscriptions_package_fk |
| tasks_tenant_assignee_idx | tasks (tenant_id, assignee_membership_id) | `assignee_membership_id is not null` | tasks_assignee_fk |
| programs_tenant_template_idx | programs (tenant_id, template_id) | `template_id is not null` | programs_template_fk |
| nutrition_plans_tenant_template_idx | nutrition_plans (tenant_id, template_id) | `template_id is not null` | nutrition_plans_template_fk |
| forms_tenant_template_idx | forms (tenant_id, template_id) | `template_id is not null` | forms_template_fk |
| form_submissions_tenant_version_idx | form_submissions (tenant_id, form_version_id) | | form_submissions_version_fk |
| exercises_tenant_thumbnail_idx | exercises (tenant_id, thumbnail_media_id) | `thumbnail_media_id is not null` | exercises_thumbnail_fk |
| exercises_based_on_idx | exercises (based_on_id) | `based_on_id is not null` | exercises_based_on_fk |
| foods_based_on_idx | foods (based_on_id) | `based_on_id is not null` | foods_based_on_fk |
| set_logs_exercise_idx | set_logs (exercise_id) | | set_logs_exercise_fk |
| set_logs_substituted_idx | set_logs (substituted_for) | `substituted_for is not null` | set_logs_substituted_fk |
| message_revisions_tenant_message_idx | message_revisions (tenant_id, message_id, revised_at) | | message_revisions_message_fk |

The first thirteen are PERF-03's list (every column checked against `packages/db/src/schema/*.ts`); the last three belong
to the keys this design adds. Catalog test C17 (C16 is the name-length test) returns zero rows on a migrated database:

```sql
with fk as (
  select c.conrelid, c.conname, c.conkey,
         (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'tenant_id') as tid
    from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
)
select fk.conrelid::regclass as child_table, fk.conname
  from fk
 where fk.conkey <> array[fk.tid]
   and not exists (
     select 1 from pg_index i
      where i.indrelid = fk.conrelid and i.indisvalid
        and ( (i.indkey[0] = any (fk.conkey) and i.indkey[0] <> fk.tid)
           or (i.indkey[0] = fk.tid and i.indnkeyatts > 1 and i.indkey[1] = any (fk.conkey) and i.indkey[1] <> fk.tid)
           or (i.indisunique and i.indpred is null
               and (select array_agg(u.k) from unnest(string_to_array(i.indkey::text, ' ')::int2[]) with ordinality u(k, n)
                     where u.n <= i.indnkeyatts) <@ fk.conkey) ))
 order by 1, 2;
```

## 9. Schema additions in this pass

| Change | Why |
|---|---|
| `tenants.receipt_counter integer not null default 0` | Sequential receipt numbers (§7.7) |
| `clients.code` gets `default ''` | Runtime inserts leave it empty; the trigger assigns it |
| `clients.search_key text not null default ''` + index `clients_tenant_search_idx (tenant_id, search_key)` | Arabic search (core `text.searchKey`), written by the API |
| `invitations.display_name text` | Invitee name in the team UI |
| `events.actor_user_id uuid`, `events.actor_role text` | Stamped by `app.emit_event`; the outbox processor trusts a type only when `actor_role` is one of its allowed roles (§7.8, §12) |
| `set_logs.deleted_at timestamptz` | Offline sync tombstone (last-write-wins needs one) |
| `exercises.based_on_id uuid`, `foods.based_on_id uuid` | A tenant's customised copy of a system item |
| `tasks.source_event_id` uuid → bigint | `events.id` is bigint; the old type could never hold an event id. The generated statement must read `ALTER TABLE "tasks" ALTER COLUMN "source_event_id" SET DATA TYPE bigint USING NULL::bigint;` (no data exists) |
| New table `tenant_hidden_items (tenant_id uuid not null, kind text not null, item_id uuid not null, hidden_by uuid, created_at timestamptz not null default now(), constraint tenant_hidden_items_pk primary key (tenant_id, kind, item_id), constraint tenant_hidden_items_kind_ck check (kind in ('exercise','food')), constraint tenant_hidden_items_tenant_fk foreign key (tenant_id) references tenants(id) on delete cascade)` | A tenant hides a system exercise or food without editing the shared row; the runtime cannot delete library rows (§3.3) |
| New table `public.message_revisions` (below) | Edited messages keep their history (T10, ATK-10) |
| New tables `app.audit_actions` and `app.event_types` (below) | Allow-lists that `app.audit` and `app.emit_event` check (T4) |
| Unique `push_subscriptions_tenant_endpoint_uq (tenant_id, endpoint)` replaces `push_subscriptions_endpoint_uq (endpoint)` | The same browser can subscribe in two tenants (§8.1) |
| Unique `client_uuid` indexes widened to `(tenant_id, client_id, client_uuid)`; messages to `(tenant_id, sender_user_id, client_uuid)` | One client cannot burn another's offline uuid (§8.1) |
| Index `audit_log_tenant_client_created_idx (tenant_id, client_id, created_at desc) where client_id is not null` | The staff "history of client X" page reads `audit_log` by client; without it the query walks the tenant's whole audit history (PERF-07) |
| Index `push_subscriptions_tenant_user_idx (tenant_id, user_id)` | Policy `T and ME(user_id)` and "my devices" lookups (PERF-08) |
| Index `notification_deliveries_tenant_user_idx (tenant_id, user_id, created_at desc)` | Same predicate on the highest-volume table (PERF-08) |
| The child-side indexes of §8.4 | Foreign key lookups |

No other column is added. Every state that is new for a text column is enforced by a CHECK, never by a new enum value
(drizzle's migrator runs all pending migrations in one transaction; a new enum value cannot be used in the run that adds it).

Placement: Drizzle schema changes (columns, `message_revisions`, indexes, foreign keys, CHECKs) land in the generated 0004.
The two `app.*` tables and their seeds are SQL in the custom 0006, because Drizzle does not manage schema `app`.

### 9.1 `message_revisions` (T10)

Append-only. Each row holds what a message said **before** the edit that happened at `revised_at`, so the current
text stays in `messages` and every earlier text is here. Written only by the definer trigger `messages_95_revision`
(function `app.message_revision()`, §7.4) when `body` or `attachments` change. The runtime has SELECT and nothing else
(§3.3), with the same visibility as the message (§5.2).

| Column | Type | Notes |
|---|---|---|
| id | uuid primary key default gen_random_uuid() | named `message_revisions_pkey` |
| tenant_id | uuid not null | named `message_revisions_tenant_fk` → tenants(id) on delete cascade |
| message_id | uuid not null | composite foreign key `message_revisions_message_fk` (tenant_id, message_id) → messages (tenant_id, id), cascade |
| client_id | uuid | copy of the message's `client_id`, null for internal threads; snapshot only; policies authorize through the parent message EXISTS (§5.2); no foreign key |
| body | text | the earlier body |
| attachments | jsonb not null default '[]' | the earlier attachments |
| revised_at | timestamptz not null default now() | when the earlier text was replaced |
| revised_by | uuid | `app.uid()` of the editor |

Use named Drizzle `primaryKey`, `check` and `foreignKey` definitions for these new-table constraints, including
`tenant_hidden_items_pk`, `tenant_hidden_items_kind_ck`, `tenant_hidden_items_tenant_fk`, `message_revisions_pkey`
and `message_revisions_tenant_fk`; catalog/error tests require these exact names.

Index `message_revisions_tenant_message_idx (tenant_id, message_id, revised_at)`. RLS is enabled
(`.enableRLS()`); the policies are in §5.2. The trigger inserts exactly these columns, in this order:
`(tenant_id, message_id, client_id, body, attachments, revised_at, revised_by)`.

### 9.2 `app.audit_actions` and `app.event_types` (T4)

Owned by the migration role, RLS enabled with no policy, and no privilege for any runtime or Supabase role. Only the
definer functions `app.audit` and `app.emit_event` read them. `roles` holds the membership roles (`owner`, `staff`,
`client`) that may record the action or emit the event; an unknown name or a caller role outside `roles` raises 42501.
`audit_actions.entity` is the table the audited row lives in, and `app.audit` derives the client from that row (§7.8).

Migration 0006, section "audit and outbox allow-lists":

```sql
create table if not exists app.audit_actions (
  action text primary key,
  entity text not null,
  roles text[] not null,
  constraint audit_actions_action_ck check (action ~ '^[a-z_]+[.][a-z_]+$'),
  constraint audit_actions_roles_ck check (cardinality(roles) > 0 and roles <@ array['owner', 'staff', 'client']::text[])
);
--> statement-breakpoint
create table if not exists app.event_types (
  type text primary key,
  roles text[] not null,
  constraint event_types_type_ck check (type ~ '^[a-z_]+[.][a-z_]+$'),
  constraint event_types_roles_ck check (cardinality(roles) > 0 and roles <@ array['owner', 'staff', 'client']::text[])
);
--> statement-breakpoint
alter table app.audit_actions enable row level security;
--> statement-breakpoint
alter table app.event_types enable row level security;
--> statement-breakpoint
revoke all on table app.audit_actions, app.event_types from public;
--> statement-breakpoint
insert into app.audit_actions (action, entity, roles) values
  ('program.publish',        'program_versions',        '{owner,staff}'),
  ('program.archive',        'program_versions',        '{owner,staff}'),
  ('nutrition_plan.publish', 'nutrition_plan_versions', '{owner,staff}'),
  ('nutrition_plan.archive', 'nutrition_plan_versions', '{owner,staff}'),
  ('form.publish',           'form_versions',           '{owner,staff}'),
  ('form.archive',           'form_versions',           '{owner,staff}'),
  ('payment.verify',         'payments',                '{owner,staff}'),
  ('payment.reject',         'payments',                '{owner,staff}'),
  ('payment.refund',         'payments',                '{owner,staff}'),
  ('subscription.extend',    'subscriptions',           '{owner,staff}'),
  ('subscription.freeze',    'subscriptions',           '{owner,staff}'),
  ('subscription.resume',    'subscriptions',           '{owner,staff}'),
  ('subscription.cancel',    'subscriptions',           '{owner,staff}'),
  ('subscription.suspend',   'subscriptions',           '{owner,staff}'),
  ('subscription.reinstate', 'subscriptions',           '{owner,staff}'),
  ('client.erase',           'clients',                 '{owner}'),
  ('checkin.submit',         'form_submissions',        '{client}'),
  ('checkin.review',         'form_submissions',        '{owner,staff}'),
  ('workout.complete',       'workout_sessions',        '{client}'),
  ('media.review',           'media',                   '{owner,staff}'),
  ('ai.approve',             'ai_requests',             '{owner,staff}'),
  ('ai.reject',              'ai_requests',             '{owner,staff}'),
  ('team.permissions',       'memberships',             '{owner}'),
  ('team.disable',           'memberships',             '{owner}')
on conflict (action) do update set entity = excluded.entity, roles = excluded.roles;
--> statement-breakpoint
insert into app.event_types (type, roles) values
  ('program.published',        '{owner,staff}'),
  ('nutrition_plan.published', '{owner,staff}'),
  ('form.published',           '{owner,staff}'),
  ('payment.submitted',        '{client}'),
  ('payment.verified',         '{owner,staff}'),
  ('payment.rejected',         '{owner,staff}'),
  ('payment.refunded',         '{owner,staff}'),
  ('subscription.extended',    '{owner,staff}'),
  ('subscription.frozen',      '{owner,staff}'),
  ('subscription.resumed',     '{owner,staff}'),
  ('subscription.cancelled',   '{owner,staff}'),
  ('checkin.submitted',        '{client}'),
  ('checkin.reviewed',         '{owner,staff}'),
  ('workout.completed',        '{client}'),
  ('message.sent',             '{owner,staff,client}'),
  ('media.uploaded',           '{owner,staff,client}'),
  ('media.reviewed',           '{owner,staff}'),
  ('ai.approved',              '{owner,staff}')
on conflict (type) do update set roles = excluded.roles;
--> statement-breakpoint
```

This is the canonical seed; later migrations may extend it. A role in `roles` is a necessary condition only: module permissions still apply
(`perm_transitions`, `require_perm` and `app.has_perm`, §6, and `requirePermission` in the API, §12). Whoever adds an API
action or an outbox event type adds its row in the same migration; the API test list checks that every name the code
passes to `app.audit` and `app.emit_event` exists in the seed.

## 10. Audit coverage

Existing `app.audit_row()` triggers stay (subscriptions, subscription_events, payments, client_entitlement_overrides,
memberships, staff_client_assignments, business_settings). `app.audit_row` (§7.8) reads the tenant from `tenant_id`
(from `id` for `tenants`), the client from `client_id` (from `id` for `clients`, so assigned staff can see the audit
rows of a client), and strips the columns named in its first trigger argument from both snapshots.

Added in 0006, as literal statements (`create or replace trigger` keeps the file re-runnable on PostgreSQL 14 and later):

- `<t>_audit AFTER INSERT OR UPDATE OR DELETE` on clients, client_notes, client_flags, packages, invitations, consents,
  programs, nutrition_plans, forms, ai_requests and media. The runtime has no DELETE on `client_flags` and `ai_requests`
  (§3.3), and media review decisions (approve, reject, `review_note`) now leave a trace (CV-07, ATK-11).
- Version tables get two triggers each, with the document stripped (`app.audit_row('document')`): `<t>_audit AFTER INSERT OR
  DELETE`, and `<t>_audit_update AFTER UPDATE OF status, published_at, superseded_at`. A draft autosave only rewrites
  `document` and `change_note`, so it writes no audit row; the document history is the version rows themselves
  (SQLX-08, S8, PERF-04).
- `tenants` gets two triggers so counter bumps are not audited: `tenants_audit AFTER INSERT OR DELETE` and
  `tenants_audit_update AFTER UPDATE OF name, slug, client_code_prefix, default_locale, timezone, currency, archived_at`.

The sole literal audit trigger DDL is §7.8.2. Execute it once in 0006; the inventory in §7.12 and the reasons below refer to those definitions.

Decisions behind the list:

- **Messages** have no `audit_log` trigger. Their edit history is `message_revisions` (§9.1), a soft delete keeps the
  row with `deleted_at`, and a body copy in `audit_log` would only duplicate it.
- **`message_revisions`**, `audit_log` and `events` are themselves history and are not audited.
- **The subscription ledger.** `subscription_events` stays a ledger the staff member declares (kind, dates, reason). It
  is not proof of what changed. `audit_log` is the record of changes: `subscriptions_audit` stores the before and after
  of every subscription row, and `subscription_events_audit` stores every ledger entry (T23).
- **Erasure and closure.** The new triggers fire for every row a cascade deletes and write the deleted row, personal data
  included, into `audit_log` with the client's id. `app.erase_client` and `app.close_tenant` (§7.1) must therefore
  delete the client's or tenant's `audit_log` and `events` rows as their last step, after the cascade; deleting them
  first would let the cascade write fresh snapshots after the cleanup. (Tested: deleting a client with flags, programs,
  media and AI requests writes one audit row per deleted table.)
- Which actions the API records semantically through `app.audit` is the allow-list of §9.2; row triggers record the
  change itself, the semantic entry records the intent.
## 11. Migrations and procedure

| # | Kind | Content |
|---|---|---|
| 0003_rls_role_and_helpers | custom | §4, verbatim: `check_function_bodies = on`, the global default revoke, the role, the identity helpers, `app.has_perm` |
| 0004_policies_off | generated with `DRIZZLE_NO_POLICIES=1`, then hand edits H1–H3 | Every schema change of §5 (enableRLS), §8, §9 (new tables `tenant_hidden_items` and `message_revisions`, new columns, unique targets, composite foreign keys, CHECKs, child-side indexes) — and the drop of all old policies |
| 0005_policies | generated, flag unset | Creates every policy of §5.2 |
| 0006_guards_and_grants | custom | §6, §7, §9.2 (allow-lists), §10 — and, as its last block, the privileges of this section |

Why two generated migrations: drizzle-kit prompts interactively ("created or renamed?") whenever one table both
loses and gains policies in the same diff, and a non-interactive shell cannot answer. With the policy helpers switched
off, 0004 only drops policies; with them on, 0005 only adds. `.enableRLS()` on every table stops 0004 from disabling
RLS on tables that temporarily have no policies. No state between 0004 and 0005 is ever visible, because the migrator
applies all pending files in one transaction (next section).

### 11.1 How drizzle applies these files (D2)

- The migrator (`drizzle-kit migrate`, which uses drizzle-orm's) opens **one transaction**, applies every pending file
  in journal order and commits at the end. One failing statement rolls back all of 0003–0006 and leaves the database at
  0002. So no statement may be one that cannot run inside a transaction block: `create index concurrently`, `vacuum`,
  `alter system`.
- A file is pending when its journal `when` is later than the newest applied one. The migrator compares timestamps, not
  file contents. Two consequences: never edit an applied migration (it is not run again), and never edit
  `_journal.json` by hand (an entry with an older `when` is skipped without a message). Custom migrations come only
  from `drizzle-kit generate --custom`.
- No enum value is used in the run that adds it. This design adds no enum value: a new state of a text column is a CHECK
  constraint (§15).
- Session settings persist across the files of one run, which is why 0003 starts with `set check_function_bodies = on`
  (C23): 0000 switches body checking off for its own session because its functions name tables that do not exist yet.
  Keep the setting on; it validates syntax and SQL-language bodies where applicable. PL/pgSQL statements may resolve
  names only when executed, and dynamic SQL resolves names at runtime. Successful migration does not prove every
  branch names valid columns: G/D/K/L/E/A/N execute every trigger call site and entity/head/library expansion,
  including service-only functions; C20/C23 check creation/order. 0006 repeats the setting for standalone runs.
- The Drizzle schema cannot express triggers, functions, grants or `on delete set null (col)` (D4). Each table
  definition that owns such an object carries a one-line comment that names the migration (`// triggers and grants:
  0006, docs/architecture/02 §6.3, §7`). After 0006, `drizzle-kit generate` reports no schema changes.
- Drizzle-kit copies the previous snapshot for a custom migration, so "no changes" proves only that the TypeScript schema
  equals the snapshot. It does not validate the SQL of 0003 or 0006. The chain is validated by the checks of step 7 and
  by C98/C99 (§13).

### 11.2 Hand edits of generated files (D3)

Complete list. The integrator re-applies it if 0004 is regenerated, and reads the SQL for anything else drizzle-kit wrote
that looks wrong before changing it.

| # | File | Edit | Why |
|---|---|---|---|
| H0 | 0000 (Supabase staging only) | Wrap `grant authenticated to dawlyy_app` in a DO block that runs it only when `exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = current_user::regrole and admin_option)` holds | On PG16+ the grant needs ADMIN OPTION on `authenticated`, which Supabase may not give `postgres`. Allowed because no deployed database has applied 0000 yet (and the migrator would not re-run it anyway) |
| H1 | 0004 | The `tasks.source_event_id` statement reads `ALTER TABLE "tasks" ALTER COLUMN "source_event_id" SET DATA TYPE bigint USING NULL::bigint;` | drizzle-kit writes `SET DATA TYPE` without `USING`; uuid to bigint has no implicit cast (§9; no data exists). This is the model for any later type change |
| H2 | 0004 | Move every `CREATE UNIQUE INDEX` that a new foreign key references above the first `ADD CONSTRAINT ... FOREIGN KEY` that needs it | drizzle-kit emits foreign keys before indexes (§8.1) |
| H3 | 0004 | After the last unique index, append the three `*_current_version_fk` statements of §8.2, with `ON DELETE set null ("current_version_id")` | Drizzle cannot express the PG15+ column list; the schema declares no foreign key on `current_version_id` |

The legacy foreign key `client_entitlement_overrides_subscription_id_subscriptions_id_fk` is 64 bytes long and lives in
the database as its 63-byte truncation. 0004 drops it by the generated 64-byte name, which Postgres truncates the same
way, so the statement works unchanged; `ceo_subscription_fk` replaces it (D1, §8.2). Every other name in this pass is at
most 63 bytes.

### 11.3 Procedure

From `packages/db`. `drizzle.config.ts` needs a URL in the environment even for `generate`. Commands are for Windows
PowerShell 5.1 or PowerShell 7: `NAME=value command` is a parse error there. Set a variable with `$env:NAME = 'value'`
and clear it with `Remove-Item Env:NAME -ErrorAction SilentlyContinue`. (In Git Bash, `NAME=value command` works as
usual.)

1. Custom migration 0003:

   ```powershell
   $env:DATABASE_URL_SERVICE = 'postgresql://postgres@127.0.0.1:54329/dawlyy_test'
   pnpm exec drizzle-kit generate --custom --name rls_role_and_helpers   # paste §4 into the new 0003 file
   ```

2. Make every TypeScript schema change. Then generate 0004 with the flag set, and clear the flag in a `finally` block
   so it cannot leak into step 3:

   ```powershell
   $env:DRIZZLE_NO_POLICIES = '1'
   try { pnpm exec drizzle-kit generate --name policies_off }
   finally { Remove-Item Env:DRIZZLE_NO_POLICIES -ErrorAction SilentlyContinue }
   ```

   Read the SQL. Apply hand edits H1–H3 of §11.2, and nothing else.
3. `if ($env:DRIZZLE_NO_POLICIES) { throw 'flag still set' }`, then `pnpm exec drizzle-kit generate --name policies`.
   0005 must contain only `CREATE POLICY` statements; this prints nothing when it does:

   ```powershell
   Get-Content (Get-ChildItem migrations\0005_*.sql).FullName |
     Where-Object { $_ -match '^\s*(CREATE|ALTER|DROP|INSERT|GRANT|REVOKE)\b' -and $_ -notmatch '^\s*CREATE POLICY\b' }
   ```

4. `pnpm exec drizzle-kit generate --custom --name guards_and_grants` and write 0006 in this order:
   1. the header: `set check_function_bodies = on;` and the global default revoke (below);
   2. the allow-list tables and their seed (§9.2), before any function that reads them;
   3. §6.2 and §7, in the order of those sections, each trigger after its function (§6.3 guard triggers, §7.12 inventory);
   4. audit coverage is explained in §10; its DDL has already run once from §7.8.2;
   5. **the privileges block of §11.4, last.** It runs after the last `create function`, because a function that is
      created after the block keeps whatever default grants it was created with (§3.4). It also needs the tables of
      `tenant_hidden_items` and `message_revisions`, which 0004 has already created: 0006 only **grants** on them.

   ```sql
   -- DAWLYY 0006: guards, definer functions, audit triggers and the privileges of dawlyy_rls.
   set check_function_bodies = on;
   --> statement-breakpoint
   -- Functions created from here on get no PUBLIC execute (global form; the in-schema form does nothing, §3.4).
   alter default privileges for role postgres revoke execute on functions from public;
   --> statement-breakpoint
   ```

5. `pnpm exec drizzle-kit generate` with the flag unset must report no changes (see the limit in §11.1).
6. Fresh database. Roles are cluster-wide and 0000 re-runs `grant authenticated to dawlyy_app`, so databases on one
   local cluster are migrated **one after the other**, never in parallel (PRIV-02):

   ```powershell
   & 'C:\Users\compuline\.pg0\installation\18.1.0\bin\psql.exe' -h 127.0.0.1 -p 54329 -U postgres -d postgres -c 'create database dawlyy_fresh'
   $env:DATABASE_URL_SERVICE = 'postgresql://postgres@127.0.0.1:54329/dawlyy_fresh'
   pnpm migrate
   Remove-Item Env:DATABASE_URL_SERVICE -ErrorAction SilentlyContinue
   ```

7. On the local fresh database run `pnpm test:db` from the root and inspect required catalogs. C23/C98 and
   `scripts/db-migration-check.ps1` (C99) run in the CI DB job only, using disposable databases as specified in §13.5.
   On hosted databases also run §12's audit queries and preserve their output.

Every migration runs as `postgres`, which owns every table and function (§3.2). A migration run by any other role is
wrong, whatever the target.

### 11.4 Migration 0006 privileges block (the last block of the file)

The block replaces the function privileges that 0000, 0002 and 0003 left behind and states the table privileges of §3.3
and the function list of §3.4 in one place. It is safe to run again.

```sql
-- 1. Supabase-facing roles get nothing on DAWLYY objects, now or in future. Skipped for roles that do not exist.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all tables in schema app from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke all on all sequences in schema app from %I', r);
      execute format('revoke all on all functions in schema public from %I', r);
      execute format('revoke all on all functions in schema app from %I', r);
      execute format('revoke all on schema app from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on tables from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on sequences from %I', r);
      execute format('alter default privileges for role postgres in schema public revoke all on functions from %I', r);
    end if;
  end loop;
end $$;
--> statement-breakpoint
-- 2. Best effort (PRIV-02): drop the runtime login's membership in `authenticated` when the migration role may. On
--    Supabase it may not (PG16+ needs ADMIN OPTION). Then the guarantee rests on `authenticated` holding no privilege
--    on any DAWLYY object, which step 1 and C05 enforce. This statement never fails the migration.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and pg_has_role('dawlyy_app', 'authenticated', 'member') then
    if exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = current_user::regrole and admin_option) then
      begin
        execute 'revoke authenticated from dawlyy_app';
      exception when insufficient_privilege then
        raise warning 'could not revoke authenticated from dawlyy_app (%); relying on authenticated holding no privilege', sqlerrm;
      end;
    else
      raise warning 'no ADMIN OPTION on authenticated: dawlyy_app stays a member; relying on authenticated holding no privilege';
    end if;
  end if;
end $$;
--> statement-breakpoint
-- 3. PUBLIC and the runtime login hold nothing, and nobody creates objects in the two schemas.
revoke all on all tables in schema public from public, dawlyy_app;
--> statement-breakpoint
revoke all on all sequences in schema public from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
revoke all on all functions in schema app from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
revoke create on schema public, app from public, dawlyy_app, dawlyy_rls;
--> statement-breakpoint
-- 4. Runtime role, tables (§3.3): SELECT everywhere (RLS filters rows), writes only where listed.
revoke all on all tables in schema public from dawlyy_rls;
--> statement-breakpoint
grant select on all tables in schema public to dawlyy_rls;
--> statement-breakpoint
grant insert, update on
  memberships, invitations, business_settings, user_preferences, consents, clients, client_notes, client_flags,
  tasks, ai_requests, packages, subscriptions, client_entitlement_overrides, payments, exercises, foods,
  programs, program_versions, nutrition_plans, nutrition_plan_versions, forms, form_versions, form_submissions,
  calendar_events, measurement_sets, progress_photo_sets, inbody_records, workout_sessions,
  set_logs, meal_logs, supplement_logs, conversations, messages, push_subscriptions, media
to dawlyy_rls;
--> statement-breakpoint
grant update on tenants, notifications to dawlyy_rls;
--> statement-breakpoint
grant insert on staff_client_assignments, subscription_events, tenant_hidden_items, idempotency_keys, metric_entries
to dawlyy_rls;
--> statement-breakpoint
grant delete on
  staff_client_assignments, invitations, user_preferences, client_notes, tasks, packages, tenant_hidden_items,
  programs, program_versions, nutrition_plans, nutrition_plan_versions, forms, form_versions, notifications,
  push_subscriptions, idempotency_keys, media
to dawlyy_rls;
--> statement-breakpoint
-- 5. Runtime role, functions (§3.4): the whole EXECUTE set, in one statement, after every create function.
grant execute on function
  app.uid(), app.membership(), app.membership_id(), app.tenant_id(), app.role(), app.client_id(),
  app.is_staff(), app.is_owner(), app.is_client(), app.sees_all_clients(),
  app.assigned_client_ids(), app.accessible_user_ids(),
  app.can_access_client(uuid), app.can_access_user(uuid), app.has_perm(text, text),
  app.guard_resolve(jsonb, text),
  app.audit(text, text, text, jsonb, jsonb, text, text), app.emit_event(text, text, text, jsonb),
  app.register_push(text, jsonb, text), app.advance_due(uuid), app.team_directory()
to dawlyy_rls;
--> statement-breakpoint
```

The step numbers are comments, not statements. The first statements of 0006 (`alter default privileges ...`, §11.3) and
the last block together give the §3.4 guarantee. Notes:

- The table lists follow §3.3 letter for letter (47 tables): insert and update on 35 tables, update only on `tenants`
  and `notifications`, insert only on five (`metric_entries` has no UPDATE, T24), delete on 17 (none on `memberships`,
  `exercises`, `foods`, `client_flags`, `ai_requests`), select only on `message_revisions`, `notification_deliveries`,
  `audit_log`, `events` and `job_runs`. C04 compares the catalog with the §3.3 table, not with this SQL.
- `tenant_hidden_items` and `message_revisions` exist when this block runs, because 0004 creates them. A grant on a table
  that a later migration creates would fail the whole run.
- `grant select on all tables in schema public` covers the two new tables; the allow-list tables
  `app.audit_actions` and `app.event_types` live in schema `app` and get no grant at all (§9.2).
- The function list contains no trigger function and no service-only function (`app.erase_client`,
  `app.close_tenant`, `app.next_client_code`, `app.next_receipt_no`, `app.entity_client`).

New tables never inherit grants: each migration that adds a table grants exactly what §3.3 would say for it, and each
migration that adds a function ends with `revoke all on function ... from public` and its explicit grants (§15).

### 11.5 Staging and cutover

- **Supabase staging (T3).** If 0000's `grant authenticated to dawlyy_app` fails there, apply H0 of §11.2 before the
  first migration. Check once with `select exists (select 1 from pg_auth_members where roleid = 'authenticated'::regrole and member = 'postgres'::regrole and admin_option)`.
  Whatever the answer, step 2 of §11.4 never fails: it warns, and C05 then proves that `authenticated` can do nothing.
- **Cutover (PRIV-08).** 0006 strips every privilege from `authenticated`, and the 0005 policies apply only to
  `dawlyy_rls`. An API build that still runs `SET LOCAL ROLE authenticated` gets "permission denied" on every table the
  moment the migration commits. Therefore migrate and deploy together, and never run 0003–0006 against an environment
  that serves traffic with the old build:
  1. back up (`pg_dump -Fc`), put the API in maintenance;
  2. `pnpm migrate`; on failure nothing has changed (single transaction), restore service and stop;
  3. deploy the build with the new `client.ts` (§14) and open the API;
  4. run the audit queries of §12 and the smoke subset of `pnpm test:db` (C05, C06, C14, I01);
  5. rollback after a successful migration is the backup, together with the old build; there are no down migrations.
- **First move of the shared local `dawlyy_test`** from 0002 to 0006 follows the same steps (dump first). C98 rehearses
  the move on a throwaway database.
## 12. Obligations outside the database

The database enforces what it can see: tenant, role, scope, state transitions and a few module permissions. The rest
is the job of the API and of the operator. Each row below names its test; a row without a test is a review item.

### 12.1 API and service obligations

| # | Obligation | Test |
|---|---|---|
| 1 | **Module permissions (E).** Implement `requirePermission(auth, module, action)` in `apps/web/src/server/require-permission.ts` as a thin web helper over `isAllowed`/`hasAction` from `@dawlyy/core/authz`. Read `auth.permissions` loaded by `getAuthContext` with the pinned membership and throw the web authorization error on refusal; perform no query. Core exports the pure primitives and no `requirePermission` helper. Every mutating route calls it before the first write. The owner passes every check. The database repeats only the `require_perm` and `perm_transitions` entries of §6.1 (through `app.has_perm`, which equals `isAllowed`, I11); every other module action is an API check only. | W01 |
| 2 | **Column projections (P, EXP-12).** Client-facing endpoints select through the `clientColumns` maps of `packages/db/src/schema` (explicit column objects, never `select *` and never a table object). They never return `clients.tags`, `clients.source`, `subscriptions.notes`, `payments.notes`, any `change_note`, any `created_by`, `programs.tags`, `nutrition_plans.tags` or `calendar_events.payload`. Client-facing by design: `payments.rejected_reason`, `media.review_note`, `form_submissions.coach_feedback` and `results`. A new table that holds a coach-internal column gets a `clientColumns` entry in the same change (§15). | C15, W02 |
| 3 | **Ids inside JSON** (`progress_photo_sets.poses[].mediaId`, `messages.attachments[].mediaId`, `meal_logs.free_entry.mediaIds`, the exercise ids of program documents). Resolve them with RLS-scoped queries in the caller's `withAuthTx`, never in a service transaction, so a planted foreign id resolves to nothing. | W03 |
| 4 | **Outbox processor.** Treat `events.payload` as a hint. Re-read the aggregate's current state before acting. Trust `actor_role` only as recorded by `app.emit_event`, and ignore an event whose `app.event_types` row does not list the recorded actor role. | W04 |
| 5 | **Publishing order.** One transaction: supersede the current published version, then publish the new one. The trigger `<versions>_90_pointers` sets and clears the head's `published_version_id` (§7.3.2); the API never writes it. A publish made by the service (an import, a scheduled job) sets `published_at` and `published_by` itself, because the stamps of the guard apply only to `dawlyy_rls` (§3.2, SQLX-07). | D-suite |
| 6 | **Notifications** are created by the service (outbox processor or cron), never under a user's transaction. The runtime role has no INSERT on `notifications` or `notification_deliveries`. | K-suite |
| 7 | **Erasure and closure.** API erasure/closure uses `withErasureTx` as a required calling convention, with a reason string. The functions remain service-only through EXECUTE ACLs and identity checks and establish `app.erasure` themselves as T1 requires. Ordinary service DELETE of frozen history without the flag is refused; invoking a service-only erasure function can deliberately establish the flag. The database does not identify the TypeScript wrapper. The API first captures Storage paths and all linked user ids, deletes the target Storage objects, calls `app.erase_client`/`app.close_tenant` through `withErasureTx`, then deletes each captured auth user with no remaining membership. Client prefix: `<tenant>/clients/<client>/`; closure prefix: `<tenant>/`. Record and retry failed stages before reporting completion. **Open legal question for counsel** (Law 151/2020 against tax retention of payment records): erasure deletes the client's payments by default. If counsel requires retention, anonymise the payment rows instead; this is a product decision, not a builder's. | D-suite, X-suite |
| 8 | **Semantic audit and events.** Call `app.audit` and `app.emit_event` in the same transaction as the change, with names from the allow-lists `app.audit_actions` and `app.event_types` (§9.2). An unlisted name, a wrong entity or a role that the list does not name fails with 42501. A new name is a migration that inserts one row. | A-suite |
| 9 | **Push registration.** Register a browser endpoint through `app.register_push(endpoint, keys, user_agent)` (§7.10.3), at login and when the browser subscribes; it removes the same endpoint from other users, which a plain upsert cannot do under RLS. The API keeps an allow-list of push-service hosts and rejects any other endpoint host before the call. Logout deletes the caller's own rows. Direct INSERT and UPDATE by the runtime stay allowed by the policy, but they cannot take over another user's row. | S-suite |
| 10 | **Check-in due times.** Before a submit, call `app.advance_due(submission_id)`; retry the submit once after `P0001` (§7.5.2). The function moves a `scheduled` check-in and its event to `due` once `due_at` has passed, and it is the only runtime path that does. An unknown or invisible id raises `P0002`. | K-suite |
| 11 | **Coach names for clients.** A client route reads the team through `app.team_directory()` (§7.10.2) and never queries `memberships` or `users` for other users. | W05 |
| 12 | **Offline sync (FL-15, T25).** For `set_logs`, `measurement_sets`, `progress_photo_sets`, `workout_sessions`, `meal_logs` and `supplement_logs`, use `INSERT ... ON CONFLICT (tenant_id, client_id, client_uuid) DO UPDATE SET <exactly the table's client_update columns of §6.3> WHERE excluded.client_updated_at is not null AND (<table>.client_updated_at is null OR <table>.client_updated_at < excluded.client_updated_at)`. Mutable sync requests supply non-null `client_updated_at`: the first timestamp may replace stored null; otherwise only strictly newer timestamps update. The SET list never contains `created_at`, `id`, `client_id` or an immutable snapshot column. Existing `form_submissions` synchronize with UPDATE, never conflict-update: look up the own-client row by `(tenant_id, client_id, client_uuid)` under RLS, then UPDATE exactly `client_update` columns with the same null-safe predicate, substituting the incoming parameter for `excluded.client_updated_at`. If absent, ordinary INSERT uses a permitted initial state. Catch concurrent `23505` inside a savepoint, look up the row and retry the guarded UPDATE once; never widen initial-state lists for retries. Messages dedupe creation with `INSERT ... ON CONFLICT (tenant_id, sender_user_id, client_uuid) DO NOTHING`, then re-read the own-sender row under RLS. Creation retries omit edit/delete/read times; author edits and own-side read marking use separate UPDATEs under §7.4. No message sync query names `client_updated_at` or a guard `client_update` list. A batch runs one statement per row inside a savepoint; 42501/P0001 marks that row rejected and allows later valid rows to commit. `metric_entries` uses `ON CONFLICT DO NOTHING` (no UPDATE, §3.3). | W06, K-suite |
| 13 | **No `ON CONFLICT` and no `MERGE` on `payments` or `clients` (PRIV-05, T6).** The BEFORE INSERT triggers that take a receipt number or a client code fire before conflict detection, so a conflicting upsert burns a counter value and leaves a gap. Dedupe by a `SELECT` first, or insert and catch `23505` inside a savepoint, which rolls the counter back with it (§7.7). | P-suite |
| 14 | **Clients created by assigned-scope staff.** The row is invisible to the inserting staff member until `clients_80_assign_creator` has assigned it, so `INSERT ... RETURNING` fails the SELECT policy. For `client_scope = 'assigned'` the API inserts without `RETURNING` and reads the row in the next statement (T20, §7.10.4). | T-suite |
| 15 | **Workout sessions.** The API computes `workout_sessions.summary` from the `set_logs` in a service transaction after the sync batch, and copies `planned_workout` from the program version itself, never from the request body (CV-04). The client may not write either column (§6.3). | K-suite, W07 |
| 16 | **No `sql.raw()`** with request data in `apps/web/src` or `packages/db/src`. Build SQL with the `sql` tag so every value is a parameter. | C13 |
| 17 | **Realtime.** `postgres_changes` would need table grants for `authenticated` and is not used. New-message pushes use private Broadcast channels authorised by a dedicated SECURITY DEFINER function (messaging wave; it joins the §3.4 list when it exists), or polling. | C05, C06 |
| 18 | **Storage.** Uploads use server-issued signed URLs. Tenant assets live in bucket `tenant-assets` under `<tenant>/assets/`, client media in `client-media` under `<tenant>/clients/<client>/`; the `media` CHECK of §8.3 enforces the shape. The bucket policies come with the media wave. | K-suite |

Core machine changes required by T12/T23/T28: add the payment machine, add subscription cancellation from pending
and suspended, and remove the stale owner-only publish shortcut comment. X01/X04/X10 compare those revised
contracts. Session/automationRun machines have no corresponding DB transition enforcement (X07); do not infer one.

Tests marked W test the obligations in this table in `apps/web` with the Hono app or worker; database tests alone
do not prove API behavior. W01 imports the web helper from `apps/web/src/server/require-permission.ts`.

### 12.2 Audit queries for every migrated database (PRIV-04)

Run these as `postgres` after each migration on staging and production, and keep the output with the release record.
Every query must return **zero rows** unless the comment says otherwise. They test the effective privilege through the
`has_*_privilege` functions, so a grant that arrives through `PUBLIC` or role membership is also caught. Roles that
do not exist on the target are skipped by the `join` on `pg_roles`.

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

Also run the C06 and C14 queries of §3.4 (the 21-function set, no `PUBLIC` or null ACL on any function) and the C09
cascade query of §3.3. Whether `dawlyy_app` is still a member of `authenticated` is **not** a failure (§3.1,
PRIV-02): Q3 and Q4 prove that the membership gives no access. On Supabase, also read (no pass or fail) the default
privileges that other owners keep in `public`:

```sql
select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl order by 1, 2, 3;
```

Rows for `supabase_admin` are expected. They bind only objects that `supabase_admin` creates, and Q2 proves it owns none
of ours.

### 12.3 Release steps that are not code (gated)

| Step | Who | Gate |
|---|---|---|
| Remove `public` from the Data API's exposed schemas (Supabase project settings), and keep Realtime `postgres_changes` off for DAWLYY tables, before go-live (§3.1) | Mohamed | It is an account setting: needs his explicit yes. Record the date in the release notes |
| Run the Q1–Q8 audit after every migration on staging and production | the integrator | Zero rows, Q8 one `true` row |
| Cutover order of §11.5 on any environment that serves traffic | the integrator | Backup first; maintenance mode for the migration |
| `pg_dump -Fc` before 0003–0006 on a shared database | the integrator | The dump is the rollback (there are no down migrations) |
## 13. Tests

These are implementation contracts, not examples. Put the case id in each Vitest title. Expand a parameterised case
into a separate test for each tuple, and include the table, actor, operation, column and starting state in its title.
Expected data comes from this design and the binding triage, entered by hand. Never derive expected permissions,
guard JSON, policy expressions, constraints or edges from the migration under test. A failed contract is a finding.

### 13.1 Suites and files

| Suite | File | Scope |
|---|---|---|
| C | `packages/db/test/security.catalog.test.ts` | Catalog, grants, source contracts and migration contracts |
| G | `packages/db/test/security.guard.test.ts` | Guard engine; G20/G21 data in `packages/db/test/guard-matrix.ts` |
| I | `packages/db/test/security.identity.test.ts` | Pool reuse, pins, scope helpers and permissions |
| T | `packages/db/test/security.team.test.ts` | Tenants, memberships, assignments, invitations and settings |
| L | `packages/db/test/security.library.test.ts` | Client records, notes, flags, exercises, foods and hiding |
| P | `packages/db/test/security.payments.test.ts` | Packages, subscriptions, ledger, overrides, payments and counters |
| D | `packages/db/test/security.documents.test.ts` | Heads, versions, pointers, publication, erasure and closure |
| M | `packages/db/test/security.messaging.test.ts` | Threads, messages, read state, counters and revisions |
| K | `packages/db/test/security.tracking.test.ts` | Metrics, measurements, photos, InBody, workout and nutrition logs; K12 submission regression |
| E | `packages/db/test/security.events.test.ts` | Calendar, submissions, check-ins, consents, AI, personal rows and push |
| A | `packages/db/test/security.audit.test.ts` | Semantic functions, row audit and outbox |
| S | `packages/db/test/security.matrix.test.ts` | Every policy and table; data in `packages/db/test/matrix.ts` |
| X | `packages/db/test/security.machines.test.ts` | Every ordered state pair, initial state and transition stamp |
| N | `packages/db/test/security.integrity.test.ts` | FK, CHECK, unique, index and deletion contracts |
| Z | `packages/db/test/security.escape.test.ts` | Role and DDL escapes from the runtime connection |

Keep `packages/db/test/rls.test.ts` and ids R1–R12. R1 expects `current_user = 'dawlyy_rls'` and
`session_user = 'dawlyy_app'`. Keep the other behaviours. Adapt fixture-sensitive assertions: R12's T2 id set becomes
`[clientC, clientD]`; R5 and R10 use private factory rows; R7's committed insert uses a private client and metric
baseline. R9 still uses `ua`, which has one membership. This preserves the regressions without shared mutations.

### 13.2 Fixtures

`buildFixture()` first calls `truncateAll()`. `SERVICE_TABLES` is
`tenants, audit_log, events, job_runs, idempotency_keys`. TRUNCATE CASCADE also empties the system library. Insert the
system exercise and food again **after** truncation. Each file owns its fixture lifecycle. Cleanup closes pools in a
`finally`. No test uses `.concurrent` on shared fixtures.

All contexts carry `permissions: StaffPermissions | null` (§14). `s1`, `s2`, `sx` and `o1t2` already exist; do not add
duplicate staff. Their baseline permission JSON has the stated `client_scope` and `modules: {}`. A test that needs
module grants creates a private membership/context with the factory, using the named actor as its role/scope model;
it never grants permissions by changing the shared membership. Below, “`s2` with billing manage”, for example, means
that private factory variant with `modules.billing = ['manage']`. A factory variant has its own user and membership.

| Exact fixture name | Rows and purpose |
|---|---|
| `t1`, `t2` | Tenant One and Tenant Two; distinct UUIDs and unique slugs; default code prefix `DW` |
| `o1`, `o2` | Active owners of T1 and T2 respectively; permissions null |
| `s1`, `s1MembershipId` | Active T1 staff, `client_scope = 'assigned'`; assignment to A only |
| `s2` | Active T1 staff, `client_scope = 'all'`; A and B are both accessible |
| `sx` | Disabled T1 staff, `client_scope = 'all'`; pin must not establish a tenant |
| `o1t2` | O1's **same user**, active T2 staff, `client_scope = 'all'`; proves pin-based tenant switching |
| `clientA`, `clientB`, `clientC`, `clientD` | Active clients A/B in T1 and C/D in T2. A is assigned to S1; B is unassigned. D supports the disabled membership without a cross-tenant FK violation. Generate all codes through `app.next_client_code` as service, then insert the supplied codes |
| `ua`, `ub`, `uc` | Active client memberships for A, B and C, with their own users; permissions null |
| `memBT2`, `ubT2` | Disabled T2 client membership for **B's user**, with `client_id = clientD`; `ubT2` pins `memBT2`, role client, permissions null |
| `packageT1`, `packageT2` | Packages in their respective tenants; set `is_public = true`, `archived_at = null`; schedule rules `{"checkins":[],"workouts":[]}`, duration 30 |
| `subA`, `subB`, `subC` | Active subscriptions of A/B/C to the package of their tenant; starts today, ends today + 30; matching package snapshots |
| `templateProgram`, `publishedVersion` | T1 program template with published v1 and non-null `published_at`/`published_by = o1.userId` |
| `copyProgram`, `copyVersion` | A's program copy of `templateProgram`; draft v1 |
| `noteA` | Coach-private note on A, author O1 |
| `metricA`, `metricB` | Weight entries A=80 kg, B=70 kg; source manual; distinct client UUIDs |
| `invOwnerStaff` | T1 pending staff invitation by O1, null client, token `inv-os-<suffix>`, expiry transaction time + 7 days |
| `invS1ClientA` | T1 pending client invitation for A by S1, permissions null, unique token, same expiry |
| `invO1ClientB` | T1 pending client invitation for B by O1, permissions null, unique token, same expiry |
| `payA`, `payB`, `payC` | Pending payments for A/subA, B/subB, C/subC; amount 100, currency EGP, method cash; all receipt, verification, refund and provider fields null |
| `convA`, `convB`, `convInternal`, `convC` | Client threads A/B/C; T1 internal thread has `kind = 'internal'`, client null; initial counters zero |
| `mediaA`, `mediaB`, `mediaC` | Client payment proofs A/B/C; kind file, purpose payment_proof, MIME image/jpeg, owner corresponding client user, review_state null, bucket `client-media`, path `<tenant>/clients/<client>/f-<suffix>.jpg` |
| `copyProgramA2`, `copyPubA`, `copyDraftA2` | A's second copy; published v1 and draft v2; distinct head from `copyProgram` |
| `copyProgramB`, `copyPubB` | B's copy with published v1 |
| `templateForm`, `templateFormPub`, `templateFormDraft` | T1 form template, form_kind checkin; published v1 and draft v2 |
| `copyFormB`, `copyFormBPub` | B's check-in form copy with published v1 |
| `planCopyA`, `planPubA`, `planCopyB`, `planPubB` | Client nutrition copies A/B, each with published v1 and matching client_id |
| `exerciseSystem`, `exerciseT1`, `exerciseT2` | One system exercise (tenant null) and one per tenant; unique slugs; valid required name/category/movement_pattern/difficulty |
| `foodSystem`, `foodT2` | One system food and one T2 food, with unique slugs, category and valid `per_100` JSON |
| `eventA`, `eventB` | Check-in calendar events for A/B, state due, source manual, rule_key null, due_at transaction time, local_date today, timezone Africa/Cairo |
| `notifA`, `deliveryA`, `notifB` | Notifications for A/B users; `deliveryA` points at notifA, user A, channel inapp |
| `consentA`, `consentB`, `consentS1` | Terms consent for A/B/S1 users in T1, version v1, locale en, not withdrawn |
| `taskT1`, `taskA` | T1 manual open tasks, respectively client null and A; source_event_id/dedupe_key/completion stamps null |

Service fixture inserts satisfy all CHECKs and every-role triggers, including version publication stamps. A test with
an invited membership builds it with the factory, status `invited`, instead of changing `sx` or `ubT2`. S01 builds
additional private rows for missing table/classes, including a private T1 food, archived/private packages, other
tenants' forms and versions, system job_runs, and each user's personal records.

`packages/db/test/factories.ts` builds valid rows and dependencies with fresh UUIDs, slugs, tokens, paths and offline
keys. It provides the proposed `mkPayment`, `mkVersion`, `mkSession` and table factories. A test that commits **any**
change builds its own affected rows, including parents whose counters, pointers, previews or audit rows will move.
It never changes a shared fixture row another test reads. Rejection-only statements may read shared rows; their
following positive control uses private rows. Assert receipts relative to a pre-read counter `n`, never to a global
`R-000001`. Use a fresh private tenant for zero-counter or million-boundary cases.

### 13.3 Helpers and error classes

Keep these helpers in `packages/db/test/helpers.ts`:

| Helper | Exact contract |
|---|---|
| `as(ctx, fn)` | Calls `withAuthTx(ctx, fn)` on the runtime pool; commits on return, rolls back on throw |
| `svc(fn, tenantId = null)` | Calls `withServiceTx(tenantId, 'security test', fn)`; arrangement and independent service re-reads |
| `q(tx, query)` | Executes a parameterised Drizzle SQL value and returns its row array |
| `one(tx, query)` | Same; throws a test error unless the result contains exactly one row |
| `expectCode(work, code)` | Requires a rejection; unwraps Drizzle `cause` to the PostgreSQL error and asserts the exact five-character SQLSTATE; never accepts success |
| `serviceRow(table, id)` | Service SELECT by UUID id; returns the whole row or undefined; use only for tables with a UUID `id` |
| `serviceRowWhere(table, whereSql)` | Service SELECT of whole rows by a parameterised predicate; returns a deterministically sorted array; supports composite/no-id keys and bigint audit/event ids without Number coercion |
| `countAs(ctx, query)` | Runs a `count(*) AS n` as that actor and returns its numeric count |
| `expectGuard(work, rule, column?)` | Requires PostgreSQL refusal. For a bare guard key, asserts `detail === 'guard:' + rule`. A `rule` beginning `rule:` asserts that exact schema-qualified detail (for example `rule:app.message_rules`); the helper performs no normalization. Asserts code 42501 for column/role/permission keys and P0001 for state keys. For special functions it first requires code in {42501,P0001}; the caller must then assert the one exact code specified by the case on the returned unwrapped error. If column is supplied, asserts `column_name === column` and a nonempty table_name; the caller asserts table_name equals its target table. Never accepts an RLS or privilege message |
| `expectRls(work)` | Requires 42501, message matching `/row-level security/i`, and no guard/rule detail. Never accepts a table/function/schema privilege refusal |
| `expectPrivilege(work)` | Requires 42501, a `permission denied` message naming the table, function, schema or parameter targeted by the case, and no guard/rule detail. Table cases must match `/permission denied for table/i` |
| `expectNoEffect(ctx, statement, table, whereSql)` | Reads the target set through service, runs one UPDATE or DELETE as ctx with `RETURNING 1`, asserts the returned array is exactly empty, then service re-reads by the **original** keys and asserts deep equality with the pre-image |

When a denied DDL command reports `must be owner of table`, Z05 asserts 42501 and that exact ownership class with
`expectCode`; it is not RLS. Read the driver fields `detail`, `table_name`, `column_name`, `constraint_name` on the
same unwrapped error as `code`, not on the outer Drizzle wrapper. For a special-trigger `23503`, `P0002`, `22023`
or `54000`, use `expectCode` and also assert `detail = 'rule:app.<function name>'`, and table/column when one column is at
fault. A special-trigger 42501/P0001 uses `expectGuard` with `rule:app.<function name>` and an exact code assertion.
`app.task_assignee_check` raises `23503`, `rule:app.task_assignee_check`, column `assignee_membership_id`;
`app.media_proof_rules` raises `P0001`, `rule:app.media_proof_rules`, column `deleted_at`, as defined solely in §7.11.

| Cause | Outcome | Assertion |
|---|---|---|
| INSERT or new-row WITH CHECK denial | 42501 | `expectRls` |
| UPDATE or DELETE whose old row is invisible to USING | Zero returned rows; no exception | `expectNoEffect` |
| Missing table/column/function/schema/parameter privilege | 42501 | `expectPrivilege` (Z05 ownership exception above) |
| Guard column, role, allowlist, equality, toggle, permission rule | 42501, `guard:<key>` | `expectGuard` |
| Guard transitions, client_transitions, editable_in, delete_when, monotonic | P0001, `guard:<key>` | `expectGuard` |
| Special trigger/function refusal | Exact code in the case; `rule:app.<function name>` | As above |
| Invisible/missing parent in a trigger lookup | 23503, rule detail | `expectCode`; do not call it RLS |
| Native FK / unique / CHECK violation | 23503 / 23505 / 23514 | `expectCode` plus exact constraint/index name |

For an existing unnamed CHECK or implicit primary key, find exactly one catalog constraint
by table, contype and the independently entered expression/key columns before executing the test, and retain its
actual conname for the error assertion. Missing/multiple matches fail setup. Do not invent a constraint name or accept
an unrelated 23514/23505. This is name resolution, not deriving the expected constraint expression from the database. New-table constraints
use the explicit §9 names, including `tenant_hidden_items_kind_ck`; no new-table name-discovery exception applies.

Every rejection also asserts the target's whole service pre-image is unchanged. For an INSERT, prove the proposed key
is absent and counts unchanged. Include affected parents, counters, pointers, revisions, audit and outbox rows where
the statement could change them. Take the service re-read after the failed transaction/savepoint has rolled back;
never query an aborted transaction. Identity sequences may have gaps; compare persisted rows, not sequence values.

Follow every rejection, **in the same test**, with the permitted variant for the same actor and assert exact stored
values. Change only the forbidden column, reference, state, tenant or grant that distinguishes the variants. For a
command forbidden for that actor on every row (metric UPDATE, history DELETE, DDL), the positive control is its
permitted counterpart: append/select, soft-delete, update/disable, or ordinary runtime SELECT. Do not invent an
allowed DELETE or widen a grant to make a control possible. For invalid pins/no pin, use own membership SELECT as the
identity-only control, or re-pin the actor's own active membership. Catalog tests compare data; they are not rejection
tests. RLS SELECT tests assert the complete allowed set as their positive control.

G and S04 use the N11 probe `dawlyy_probe.t`, owned by postgres, never a public table. Setup first drops a stale
`dawlyy_probe` schema, creates it, grants schema USAGE and table S/I/U/D to dawlyy_rls, enables RLS, installs the
restrictive tenant guard and a permissive policy, and attaches `app.guard_row` with the case's JSON. Use only columns
already named in §6 or the schema (id, tenant_id, client_id, created_by, created_at, updated_at, state, notes,
verified_at, verified_by, refund_amount, client_updated_at, deleted_at, completed_at, completed_by, unread_for_client).
Include amount (numeric), notes (text), state (text), nullable timestamp/UUID stamp columns and numeric counters as used
by G01–G19; these column names already exist in the schema. Each probe case owns its rows and trigger config. Drop the schema in `finally`, including
setup/test failures. C01/C03/C04/C12 inspect public only; app allow-list checks are explicit separate checks.

### 13.4 Cases

#### C — Catalog

- **C01** `svc`: query public ordinary/partitioned tables; their exact name set is the 47 rows of §3.3, each has `relrowsecurity = true` and `relforcerowsecurity = false`. Exclude extension-owned relations, not arbitrary extra tables.
- **C02** `svc`: enumerate `pg_policy`; each public policy has `polroles = ARRAY['dawlyy_rls'::regrole::oid]`, never OID 0/PUBLIC; the complete name/command/permissive/USING/WITH CHECK contract equals §5.2 after expanding `allow` command suffixes. The two app allow-list tables have no policies.
- **C03** `svc`: each of the 47 public tables has exactly one restrictive `<table>_tenant_guard`, FOR ALL; USING/WITH CHECK equal §5.2 including tenants, memberships and system-library exceptions. No extra restrictive policy.
- **C04** `svc`: compare every effective S/I/U/D privilege to §3.3, including negative cells. Test table privileges and `has_any_column_privilege` separately for SELECT/INSERT/UPDATE/REFERENCES; no REFERENCES/TRUNCATE/TRIGGER anywhere, no column-only write backdoor, no sequence USAGE/SELECT/UPDATE. `app.audit_actions` and `app.event_types` have no runtime privileges.
- **C05** `svc`: anon/authenticated/service_role when present, dawlyy_app and PUBLIC hold no DAWLYY table, column or sequence grant and no EXECUTE on non-extension functions in app/public. Inspect PUBLIC ACL entries, not a fictitious PUBLIC login. For every role dawlyy_app can become other than dawlyy_rls, assert the same effective denial. Use PG17-supported `pg_has_role(..., 'MEMBER')` and `'USAGE'` plus `pg_auth_members`; do not pass `member with admin option`.
- **C05b** `svc`: `has_schema_privilege` CREATE is false on public/app for dawlyy_app and dawlyy_rls, and PUBLIC has no CREATE ACL.
- **C06** `svc`: effective runtime EXECUTE set in app/public equals the 21 exact signatures of §3.4. Exclude only functions with a `pg_depend.deptype = 'e'` extension dependency. Trigger/service-only functions, old overloads taking a client id, and non-extension public RPC functions are absent.
- **C06b** `svc`: `aclexplode(coalesce(proacl, acldefault('f', proowner)))` over non-extension app/public functions has zero entries with grantee 0. This catches null ACLs and inherited PUBLIC execution.
- **C07** `svc`: every app SECURITY DEFINER function has `search_path = ''`, owner postgres equal to the owner of memberships and every table it touches; no runtime-owned function. Check SECURITY INVOKER versus DEFINER against the chosen function contract as well as the owner.
- **C08** `svc`: decode each guard's sole JSON argument; exact table/config set equals the hand-entered §6.3 golden, including version INSERT draft/published, payments with no client_transitions, conversations' trigger-owned columns and K25/E18 service-written columns immutable. Validate key shapes, columns and stamp tokens `uid|role|now|null`; editable_in is an array. No stamp_update column also occurs in immutable/set_once/update_to/monotonic. No transition column is unreachable for every permitted writer. Any permission operation key without its table grant fails the test. Entitlement overrides has no require_perm.delete and no DELETE grant; never grant DELETE to make a dead key reachable.
- **C08b** For each runtime-insertable guarded table, its permitted `o1`/staff/client factory actor inserts forged `created_at`/`updated_at = '2001-01-01'`; each existing server-time column equals `select now()` from that transaction. Message insertion gets the same assertion through M08. Client-claimed recorded_at/local_date/client_updated_at retain the sent values.
- **C09** `svc`: run the exact cascade query below and compare the complete set. Include SET NULL and SET DEFAULT in the query, not just CASCADE; expected pointer SET NULL edges are included with their column-list contracts in N01. No history-removing edge may be added.
- **C10** `svc`: compare every non-internal trigger with the §6.3/§7.12/§10 inventory, including retained audits; audit DDL is solely §7.8.2, and payments_60_refund_perm is required. Assert name, table, function signature, `tgenabled = 'O'`, ROW/timing/event tgtype bits, UPDATE column set, WHEN expression and ordered decoded tgargs. Guard JSON equals `test/guard-config.golden.ts`, entered by hand; other arguments are exact ordered strings. Assert trigger order separately within BEFORE and AFTER groups; do not call every BEFORE ROW tgtype 7 (7 is INSERT only). Old protect trigger names are gone.
- **C11** `svc`: both roles have super/create-role/create-db/replication/bypass/inherit false; dawlyy_app LOGIN true, dawlyy_rls false. Require dawlyy_app membership in dawlyy_rls and no route from either runtime role to additional effective DAWLYY privileges. Retained authenticated membership is permitted only under T3 and must pass C05 and §12.2 Q3/Q4; this is not an exact-one-membership assertion. Use PG17 MEMBER/USAGE and pg_auth_members, including admin_option, for membership inspection.
- **C12** `svc`: public table owners all equal postgres/memberships owner, never dawlyy_app, dawlyy_rls or supabase_admin; every public table has FORCE false. Apply equivalent owner checks to app allow-lists and non-extension functions/sequences used by definer code.
- **C13** Source scan `apps/web/src` and `packages/db/src`, excluding test files: reject `\bsql\s*\.\s*raw\b|\.unsafe\s*\(|sql\s*\[` and request-built SQL. Scan comments separately from executable syntax so examples cannot conceal a live use. No SQL is executed by this case.
- **C14** `svc`: global postgres function default ACL (`defaclnamespace = 0`, type f) exists and has no PUBLIC EXECUTE; each present Supabase role and dawlyy_app has no non-extension EXECUTE, and dawlyy_rls none outside §3.4. In a service transaction create a throwaway function inside dawlyy_probe, assert its effective runtime EXECUTE false, then roll back/drop in finally. Repeat after the last migration-created function, not before it.
- **C15** Source scan every client-facing Hono route reachable under `apps/web/src/api` and its query helpers: SELECT uses the exported `clientColumns` projection; reject select-all, a table object or an internal field from §12.1 row 2. Assert the projection keys exclude the exact internal list and retain rejected_reason/review_note/coach_feedback/results. Do not claim this is SQL column privacy; direct SQL is intentionally row-scoped only.
- **C16** Source/snapshot/catalog scan: UTF-8 byte length of every constraint/index/policy/trigger/function name is at most 63. Permit the one named legacy 64-byte FK only in snapshots before 0004; it is absent after replacement. Check functions too, although pg identifiers already truncate.
- **C17** `svc`: no public policy's qual/with_check mentions can_access_client or can_access_user. `assigned_client_ids` is stable, SECURITY DEFINER, `prorows = 100`; accessible_user_ids likewise with 600. Run §8.4's child-index query and require zero missing indexes; assert the named PERF-03/07/08 index columns, ordering and predicates.
- **C18** `svc`: compare type/default/nullability of every §9 addition, including receipt_counter integer/default 0/not null; clients.code/search_key text/default empty; invitation display_name text nullable; event actor UUID/text nullable; set_logs.deleted_at timestamptz nullable; library based_on_id UUID nullable; tasks.source_event_id bigint nullable. Compare both new public table keys and message_revisions columns/defaults to §9, including tenant_hidden_items_pk/tenant_hidden_items_kind_ck/tenant_hidden_items_tenant_fk and message_revisions_pkey/message_revisions_tenant_fk. Service insertion of `tasks.source_event_id = 5000000000` must round-trip exactly; there is deliberately no events FK on that column.
- **C19** `svc`/source scan: app allow-lists equal the §9.2 seed (action/entity/roles and type/roles), and all names called by API code occur there with compatible roles. Every listed audit entity is accepted by app.entity_client for a real factory row. App tables have RLS, no policies and no runtime grant. §7.8.3 points to this sole seed; nutrition_plan names, team actions, client checkin/workout audit actions and ai.approved must all match exactly.
- **C20** Source/migration contract: custom function and trigger SQL ends each complete statement with `--> statement-breakpoint`; 0006 ends with the grants block after all functions; tenant_hidden_items grants follow 0004 creation. Function signatures and trigger arguments resolve to §3.4/§7.12; no old overload remains.
- **C21** Source contract: `.env.example`, db README and client comments name dawlyy_rls and lazy DAWLYY_DB_POOL_MAX; PowerShell examples set `$env:NAME` and clear in finally. No shell-style `NAME=value command` is presented as PowerShell.
- **C22** Source/CI contract: root `test:db` invokes the db Vitest suite; the CI database job starts PostgreSQL 17, creates runtime/service URLs, applies 0000–0006, and runs test:db, the upgrade rehearsal and C99 serially. Configuration has `fileParallelism: false`; no conditional skip makes missing DATABASE_URL a green DB job.
- **C23** CI upgrade rehearsal (§13.5): copy the 0002 `dawlyy_test` state into a disposable database, apply pending 0003–0006 with the real migrator in one transaction, assert migration journal and C01–C12/C14/N01–N03. On an injected final-statement failure in a disposable copy, catalog and journal remain at 0002. Test fresh installation too, with check_function_bodies on from 0003. Do not modify the developer's shared dawlyy_test.
- **C24** Migration source contract: 0004 has `tasks.source_event_id ... SET DATA TYPE bigint USING NULL::bigint`, unique targets precede referencing FKs, and the three current pointer keys use column-list SET NULL. 0005 contains policies only; no pending file contains CREATE INDEX CONCURRENTLY/VACUUM/ALTER SYSTEM or uses a newly added enum in that run. Schema comments name the custom-migration owners; journal order is increasing and 0000–0002 are not rewritten except triage's documented staging H0 exception.
- **C98** Alias retained for §11: the upgrade portion of C23, executed once by the CI migration script; it is not a second migration against the same shared database.
- **C99** CI only: `scripts/db-migration-check.ps1` performs the rerun/catalog-diff/schema-generation contract of 13.5; it fails on any diff or generation change, and always drops its disposable database.

C09 query (bind the DELETE-granted table names entered from §3.3):

```sql
select child.relname as child, parent.relname as parent, c.confdeltype
from pg_constraint c
join pg_class child on child.oid = c.conrelid
join pg_class parent on parent.oid = c.confrelid
where c.contype = 'f' and c.confdeltype in ('c','n','d')
  and child.relnamespace = 'public'::regnamespace
  and parent.relnamespace = 'public'::regnamespace
  and parent.relname = any($1::text[])
order by child.relname, parent.relname, c.confdeltype;
```

Expected tuples `(child,parent,action)` are `(notification_deliveries,notifications,c)`,
`(program_versions,programs,c)`, `(nutrition_plan_versions,nutrition_plans,c)`, `(form_versions,forms,c)`,
`(programs,program_versions,n)`, `(nutrition_plans,nutrition_plan_versions,n)`, `(forms,form_versions,n)`.
The three `n` edges clear current_version_id only. Membership, exercise and food cascades are outside this runtime
map because those parents have no DELETE grant. N31/N35 still check their service behaviour.

#### G — Guard engine and per-table matrix

Each engine case uses a private probe row and actor `o1`, `s1` or `ua` as stated. Recreate only the probe trigger's
JSON between cases. `state`, permission and stamp checks must be reachable; arrange all earlier checks to pass.

- **G01** `o1`, `s1`, `ua`: change immutable tenant_id on a visible T1 probe row to t2; expectGuard immutable/tenant_id (42501), unchanged; change notes to `allowed` with the identity unchanged and assert that value.
- **G02** `o1`: set_once verified_at null → a fixed time stores that time; changing it or clearing it gives guard set_once/verified_at 42501; permitted control changes notes and preserves the first time. Repeating the identical value is allowed.
- **G03** `s1`, `ua`: with update_allow `[notes]`, update state gives guard update_allow/state 42501; notes=`allowed` stores exactly it. Owner allowlist behaviour is the N20 contract in G05.
- **G04** `ua`: client_update `[notes]` rejects state with guard client_update/state 42501; s1 with staff_update `[state]` rejects notes with guard staff_update/notes 42501; each then changes its permitted column and reads the exact value.
- **G05** `ua`: no client_update/update_allow gives fail-closed guard:client_update 42501 even on notes; reinstall client_update `[notes]` and prove ua stores `allowed`. `o1` may change notes with only staff_update present. With universal update_allow `[notes]`, o1 changing state gets 42501, guard:update_allow, table t, column state; changing notes succeeds. Immutable/set_once/update_to/monotonic/state rules still bind the owner.
- **G06** `o1`: insert_eq verified_at null rejects a supplied time (42501 insert_eq/verified_at); client_insert_eq state pending rejects ua's verified state (42501 client_insert_eq/state). Null/default variants insert and store null/pending respectively.
- **G07** `o1`, `s1`, `ua`: stamp_insert created_by uid overwrites a foreign uid; assert actor uid. `app.guard_resolve` resolves uid/role/now/null to exactly actor uid/DB role/transaction now/SQL null. For an unknown token use expectCode(P0001), then assert detail guard:stamp, column_name equal to the supplied spec key and absent table_name. Do not use expectGuard's table-requiring column assertion for this resolver error. After refusal the same actor resolves the valid four-token object.
- **G08** `ua`: with stamp_update updated_at now and client_update notes, stale supplied updated_at is overwritten, notes stores `allowed`. A deliberately conflicting immutable updated_at config refuses it with immutable/updated_at 42501; corrected config permits it. This pins the allowlist-only exemption.
- **G09** `o1`: editable_in state pending, cols amount: changing amount on verified gives editable_in/amount P0001; same actor changes amount on pending from 100 to 120. Two overlapping rules must both pass; JSON null is a valid OLD state. Changing state and amount together checks OLD state.
- **G10** `o1`: transitions state insert pending, edges pending→verified; insert rejected state and verified→pending give transitions/state P0001; pending insert and pending→verified store exact states. Same-state UPDATE is allowed without a self-edge.
- **G11** `ua`: client_transitions state insert pending, empty edges, with state in client_update; verified insert and pending→verified give client_transitions/state P0001; pending insert and same-state update store pending. This tests the engine key without restoring the dead payments key.
- **G12** `o1`: on_transition verified stamps verified_at now and verified_by uid on UPDATE and allowed INSERT; pending leaves them null. Forged stamp inputs on entry are overwritten; same-state notes edit preserves the first stamps. A forbidden reverse transition gives transitions/state P0001, followed by a legal edge on a fresh row.
- **G13** `ua`: on_set deleted_at stamps deleted_at now and completed_by uid; clearing through on_clear clears completed_by to null. Non-null→different-non-null gives on_clear/deleted_at 42501; after refusal clear then set and assert exact stamps. Exercise both on_set INSERT and UPDATE.
- **G14** `o1`: delete_when state pending refuses DELETE of verified (P0001 delete_when/state); pending row DELETE returns its key and service finds no row.
- **G15** `o1`, `s1`, `ua`: update_to unread_for_client 0 rejects 99 (42501 update_to/unread_for_client); reset 5→0 stores 0; no-op 5→5 preserves 5.
- **G16** `o1`, `s1`, `ua`: numeric refund_amount 20→10 or null and timestamp client_updated_at later→earlier or null each give monotonic/column P0001; equal and larger/newer values store exactly those values. Null→first value is allowed.
- **G17** `s1`: require_perm billing/create, edit, delete rejects the respective probe INSERT/UPDATE/DELETE with guard require_perm 42501; a private same-actor membership given the one needed action repeats it and stores/deletes the row. Owner passes without permission JSON; client follows client keys. Test `manage` expansion.
- **G18** `s1`: perm_transitions verified billing/verify rejects allowed insert-as-verified and pending→verified with perm_transitions/state 42501; adding verify to the private membership permits both and stamps attribution. Same-state verified notes edit does not require verify; owner passes.
- **G19** `svc`: immutable/insert_eq/transition/deletion guard configurations do not constrain service writes to the probe; values remain the supplied values, including server times. `ua` attempting the same forbidden immutable change gets 42501 immutable, then performs its legal notes edit. This is not a bypass of every-role version protection.
- **G20** Per-table UPDATE matrix, actors `o1`, permitted `s1`/`s2`, `ua`: for **every physical column of every guarded table**, build a private valid row in every relevant OLD state, attempt one changed column, and assert the exact first applicable rule and SQLSTATE from §6.1 and §7.12 trigger order; BEFORE specials named _10_/_20_/_40_ run first, payments_60_refund_perm follows payments_50_guard. Independently type table/role allowlists, immutable/set_once/update_to/monotonic/editable_in columns and expected special-trigger precedence in `test/guard-matrix.ts`. G05's owner contract applies: owner bypasses client_update/staff_update only; universal update_allow and immutable/set_once/update_to/monotonic/state rules still bind. Head published_version_id writes get 42501, rule:app.head_rules, column published_version_id before guard:immutable. The four service-written columns in K25/E18 get guard:immutable on UPDATE for every permitted runtime role. No UPDATE grant means expectPrivilege; an invisible target means expectNoEffect. A permitted cell must store the specified alternate and all stamps, **not** merely avoid a guard error. Use valid same-tenant/client alternate FK rows, valid enum labels and state-specific alternatives so native type/FK/CHECK failures do not count as permission success. A column with no semantically valid alternate is explicitly tagged and pinned by catalog plus its dedicated trigger/stamp case; do not accept arbitrary22xxx/23xxx/P0001. Every denied cell follows with a legal same-actor edit or read/append control.
- **G21** Per-table INSERT/stamp matrix: for each §6.3 insert_eq and client_insert_eq column, the table's permitted owner/staff/client actor spoofs **that one column**; assert the exact equality key/column and 42501 (or documented earlier special rule), absence and positive default variant. For each stamp_insert, stamp_update, on_set/on_clear/on_transition column assert the stored uid/role/now/null on each applicable event; cover universal clock stamps through C08b. Tables without runtime INSERT use expectPrivilege and their SELECT control, not a service insert pretending to test the guard.
- **G22** Matrix completeness: `svc` compares hand-entered coverage tuples `(table,key,column,operation,actor-class,old-state)` to every §6.3 contract tuple, including permission operation/state entries and delete_when. Exactly match all 40 guarded tables; no missing/extra tuple. G20 covers UPDATE cells; G21/X cover insert/stamp/edge cells. Removing a configured key, not just misspelling it, must fail C08/G22.
- **G23** `ua`: pin a membership belonging to another user, then INSERT a valid T1 dawlyy_probe.t row using empty guard config and a permissive probe INSERT policy so guard executes before RLS WITH CHECK. Assert 42501, guard:no_membership, table_name t and absent column_name; prove absence and unchanged counts. Own-membership SELECT is the identity-only control, then a correctly pinned INSERT succeeds.

#### I — Identity

- **I01** `ua`: closeDb, set DAWLYY_DB_POOL_MAX=1 **before the first new connection**; commit `as(ua, tx => q(tx, sql\`select 1\`))`. On the reused runtime backend assert current_setting membership placeholder is `''` before pinning, then withUserTx returns exactly `[ua.membershipId]`; app.membership/tenant_id/role/client_id are empty/null without a pin. Prove the backend pid is reused, repeat after DISCARD PLANS on that connection, and assert service pg_stat_activity count for dawlyy_app in this database is exactly 1 while it is open. Finally closeDb and restore the prior environment value (delete it if originally absent).
- **I02** O1's user with withUserTx: exact membership id set `{o1.membershipId,o1t2.membershipId}`; client/package/tenant counts each 0. Then as(o1) returns `{clientA,clientB}` and as(o1t2) returns `{clientC,clientD}`.
- **I03** `ua.userId` pinned to `o1.membershipId`: app.membership has zero rows, tenant_id null, clients/tenants count 0; correct ua pin returns tenant t1 and clientA. Bogus context role/tenant/permissions fields cannot change the helpers; the membership row decides them.
- **I04** `sx`, `ubT2`, and a factory status-invited membership: no app.membership row, no tenant-scoped rows. Exceptions are intentional: memberships_self still returns their own membership rows; system exercises/foods remain readable. Assert those exact exceptions, not “zero everywhere”. Active-pin controls return the corresponding tenant rows.
- **I05** `o1t2` then `o1` then `o1t2`: exact tenant/client id sets T2 `{C,D}`, T1 `{A,B}`, T2 `{C,D}`; no selection by oldest membership and no leaked pin between transactions.
- **I06** `o1`, `s1`, `s2`, `ua`, `sx`, unpinned O1: assert uid, membership_id, tenant_id, role, client_id, is_staff/is_owner/is_client as a full result tuple. Only owners/staff with active pins are staff; ua is client A. An unrelated user's pin returns null context with the caller uid preserved.
- **I07** Same actors: can_access_client(A/B/C/D/null/nonexistent UUID) returns `[true,true,false,false,false,false]` for o1/s2, `[true,false,false,false,false,false]` for s1/ua, all false for sx/unpinned. sees_all_clients true only o1/s2 here; assigned_client_ids exactly `{A}` for s1 and empty for the other shared actors. Add a private all-scope staff actor retaining an explicit assignment: the helper returns that assignment and ACCESS still admits all tenant clients. Owners, clients and unpinned/inactive callers return no ids.
- **I08** `o1/s2/s1/ua/sx` and unpinned: compare can_access_user on each fixture user with membership-derived accessible_user_ids. O1/S2 get all T1 member users; S1 gets T1 team users and A, excludes B; ua gets only A. A user shared across tenants is visible because it has a T1 membership, not because it belongs elsewhere. No T2-only user is present.
- **I09** `as(ua)` and withUserTx(ua.userId): current_user dawlyy_rls; statement_timeout 15s, lock_timeout 5s, idle_in_transaction_session_timeout 30s. A service transaction has its original settings and reason, not those forced values; local runtime limits disappear outside the transaction. No role-level timeout alteration.
- **I10** `svc` arranges a private assigned-staff dataset, then s1 model EXPLAINs scans of set_logs and consents: ACCESS uses the sees_all_clients InitPlan and uncorrelated assigned_client_ids/accessible_user_ids set subplans; no per-row can_access_* call. Compare exact visible ids too. Check plan structure/function call placement, not milliseconds or a planner-dependent scan type.
- **I11** Factory owner/staff actors: for every MODULES×ACTIONS pair and each PRESETS value, compare app.has_perm to core isAllowed/hasAction for the **staff** or owner row. Include absent modules, empty/null permissions, manage and explicit action. Unknown module/action false; disabled/unpinned/client always false. Core CLIENT_MATRIX gives clients API permissions and is deliberately not the expected value of the staff-only DB helper. Forging AuthContext.permissions alone never changes DB results.
- **I12** Isolated client-library unit/source contract: intercept the postgres connection factory, closeDb between creations, and assert connect() passes max1 for environment `1`, max10 when absent/empty/zero/negative/`1.5`/`1x`, and max3 for `3` set after module import. Assert prepare false. Restore module mocks, cached pools and environment in finally; this isolated test must not replace the driver used by I01. No database actor or SQLSTATE applies to these option assertions.

#### T — Team

- **T01** `s1`: insert owner/staff invitations or client invitation with non-null permissions gives expectRls; insert pending client invitation for assigned A with permissions null stores invited_by=s1 uid even if spoofed. Test each forbidden role separately with valid role/client CHECK inputs.
- **T02** `s1`: invitation for unassigned B gives expectRls; A variant inserts. Exact shared SELECT set contains invS1ClientA, excludes invOwnerStaff and invO1ClientB; s2 sees both client invitations but not invOwnerStaff; o1 sees all three.
- **T03** `s1` editing its own client invite: token_hash, role, client_id, invited_by, accepted_at, accepted_user_id changes each give immutable/column 42501; status pending→revoked stores revoked. `o1` gets the same immutability on its own factory invite.
- **T04** `s1` changes another inviter's client invitation: expectNoEffect; own pending→revoked variant stores revoked. Staff DELETE of any invitation gives expectNoEffect; owner DELETE of private pending invitation removes exactly it.
- **T05** `s1/o1`: pending→accepted gives transitions/status P0001; pending→expired stores expired. Non-null acceptance fields on INSERT give insert_eq/column 42501; null insert variant stores pending with null acceptance fields. Service acceptance may set accepted/user/time.
- **T06** `o1`: tenant name=`renamed` stores it; id/client_counter/receipt_counter/created_at changes each give immutable/column 42501; name control stores `allowed`. `s1` and `ua` UPDATE tenants gives expectNoEffect; same actor can SELECT exactly t1.
- **T07** `o1`: DELETE clients gives expectPrivilege; permitted create/read control returns generated code. `select app.next_client_code(t1)` and next_receipt_no(t1) give function expectPrivilege for ua/s1/o1; same actor can read its accessible rows without incrementing counters.
- **T08** `s1`: memberships SELECT includes T1 team and client A membership, excludes B/T2-only; assignments include its A assignment. ua sees exactly its own membership, no assignments. o1 sees all T1 memberships/assignments plus its own T2 membership through self-select, not other T2 rows.
- **T09** `s1/ua`: own display_name=`self`, phone=`01000000000`, locale=`en`, last_seen_at=fixed value store exactly; permissions/role/status edits give staff_update/client_update 42501. Updating another member gives expectNoEffect; repeat legal self edit.
- **T10** `o1`: sole active owner demotion or disable gives rule:app.keep_one_owner P0001 and leaves owner active; create a second owner then demote first to staff, exact remaining active-owner count 1. DELETE is expectPrivilege, never P0001, because memberships has no DELETE grant.
- **T11** Two private active owner contexts concurrently disable themselves, with barriers ensuring overlap: exactly one commits and one gets rule:app.keep_one_owner P0001; service count remains 1. Losing actor can still SELECT its active membership. Do not use a pool size of 1 for this test.
- **T12** `ua`: `app.team_directory()` returns exactly active T1 owner/staff users `{o1,s1,s2}`, columns only user_id/role/display_name; excludes sx, clients and T2-only users. Unpinned/disabled caller gets empty array, followed by valid-pin exact array.
- **T13** Assistant preset staff (`s1` factory variant): clients INSERT gives expectRls; after granting clients/create to that private membership, INSERT **without RETURNING** commits, next statement SELECT finds it and UPDATE phone stores the value. Assignment tuple equals tenant/new client/inserting membership/assigned_by uid. No shared actor is changed.
- **T14** Assigned-scope `s1` with clients/create: INSERT ... RETURNING id gives expectRls and no client/assignment/counter change; INSERT without RETURNING then SELECT returns generated code and assignment. All-scope s2 with create and owner o1 may RETURNING; neither gets an auto-assignment.
- **T15** `o1`: client INSERT with supplied code or membership_id gives insert_eq/column 42501; empty-code/null-membership variant stores `DW-<n+1 padded to at least six>`, created_by owner uid. Source/created timestamps are tested independently so no earlier rule masks this one.
- **T20** `o1`: on private non-owner membership, change user_id/client_id/tenant_id/id/created_at separately; immutable/column 42501, then update display_name=`allowed`. Keep role/client CHECK valid where possible; immutability must fire before CHECK.
- **T21** `o1`: change a private client membership's role to owner while client_id stays set; native 23514 memberships_role_client_ck; permitted role client with display_name edit stores `allowed`.
- **T22** `o1`: promote private active staff to owner, client_id null; row is owner and active. This adds the second owner for a private step-down test; it does not change shared s1/s2.
- **T23** `s1/s2`: membership INSERT gives expectRls; UPDATE other member gives expectNoEffect; **self** permissions UPDATE gives staff_update 42501 (self display_name is allowed). Membership DELETE by every runtime actor gives expectPrivilege. Assignment INSERT staff gives expectRls; DELETE staff gives expectNoEffect. Follow with own display_name/assignment SELECT controls; o1's allowed INSERT/DELETE assignment is separately asserted.
- **T24** `o1`: insert a private assignment with assigned_by=ub uid; stored assigned_by is o1 uid and created_at is transaction now. No runtime UPDATE privilege on assignments: expectPrivilege; read control returns exactly that tuple.
- **T25** `o1`: assign its private T1 staff membership to clientC gives native 23503 sca_client_fk, no assignment; same membership to private T1 client stores it. Separately a T2 membership under T1 gives sca_membership_fk 23503.
- **T26** `o1`: DELETE private staff membership, both with/without an assigned task, gives expectPrivilege and preserves membership, assignment and task. Disable instead, assert status disabled and history retained. Service-only cascade/task restriction is N31, not a runtime DELETE test.
- **T27** `s2`: business_settings INSERT expectRls and UPDATE existing expectNoEffect; SELECT returns T1 settings. `o1` inserts/updates private settings with spoofed updated_by; stored updated_by owner uid, updated_at now. tenant_id change gives immutable/tenant_id 42501, then valid settings edit stores exact JSON.
- **T28** `ua`: SELECT ub user_preferences gives empty set; UPDATE/DELETE ub's private row expectNoEffect; own preferences=`{"locale":"en"}` stores exactly it. Own tenant_id/user_id changes give immutable/column 42501; own DELETE removes exactly the private row. Owner has no special access to another user's preferences.
- **T29** `s2` with clients/create: creates private client, returns generated code; spoof code gives insert_eq/code 42501. `ua` may update own phone/profile, not status/tags/source/code (client_update for first three, immutable for code); B UPDATE expectNoEffect. ua client INSERT expectRls, DELETE expectPrivilege; repeat permitted own phone edit.
- **T30** `s1/s2/o1/ua`: can_access_user and accessible_user_ids must give the exact consent visibility sets of I08/K21. S1 excludes B but includes team/A; s2/o1 include B; ua only self. Foreign-user consent INSERT gives expectRls, then own valid consent INSERT stores its user id. This retains N15's helper-matrix id.
- **T31** `o1`: create clients in a private tenant at counter 999998; codes are DW-999999, DW-1000000, DW-1000001. A duplicate primary-key client INSERT caught/rolled back to savepoint gives 23505 and does not consume a code; next legal insert gets the next number.

#### L — Client records and library

- **L01** `s1`: client A SELECT/phone UPDATE works; B UPDATE expectNoEffect. s2 sees A/B; ua only A, uc no T1 rows. Actor's legal variant writes private assigned A phone exactly.
- **L02** `s1` inserts private note for A with author_user_id spoofed; stored author is s1 uid. ua INSERT expectRls and SELECT returns no notes; own client SELECT is its positive control. B note INSERT by s1 gives expectRls, followed by A insert.
- **L03** `s2` cannot edit/delete another staff author's accessible note: expectNoEffect; s2's own note edit body=`edited` stores it and DELETE removes it. Owner edits/deletes any private accessible note. author_user_id/client_id changes by author give immutable 42501, then legal body edit.
- **L04** `s1`: resolve private A flag using forged resolved_at: stored resolved_at now and resolved_by=s1 uid; clear resolved_at and assert both null. Direct resolved_by edit gives immutable 42501; replacing a non-null resolution time without clearing gives on_clear 42501. DELETE flag expectPrivilege; permitted resolve/reopen control. Clients cannot read/insert flags (empty SELECT/expectRls).
- **L05** `ua`: exact library SELECT includes exerciseSystem/exerciseT1 and foodSystem, excludes exerciseT2/foodT2; hidden tenant rows remain visible to SQL (hidden is a presentation flag). s2 changes private T1 exercise hidden true; ua UPDATE tenant item expectNoEffect; system-item UPDATE by any runtime actor expectNoEffect. Each actor's permitted SELECT/edit variant is asserted.
- **L06** `o1/s2`: runtime DELETE exercises/foods gives expectPrivilege; retirement through hidden=true stores true on private tenant rows; system retirement is a tenant_hidden_items INSERT. No runtime delete/cascade expectation from the old design survives.
- **L07** `s1`: exercises.based_on_id and foods.based_on_id INSERT/UPDATE each accept a system row or same-tenant private row; foreign-tenant reference gives 23503 rule:app.library_ref_check on that column. Unchanged-value UPDATE is allowed. All four paths service-re-read exact references.
- **L08** `s2` and service: exercise thumbnail to private client media, other-tenant asset or wrong purpose gives 23503 rule:app.exercise_thumbnail_check/thumbnail_media_id; same-tenant tenant-assets media with purpose exercise_demo or branding stores it. System exercise with any media thumbnail gives 23503; null thumbnail with video_url is allowed. Test INSERT and changed-column UPDATE.
- **L09** `s1`: insert tenant_hidden_items for exerciseSystem, stored hidden_by=s1 uid and created_at now; duplicate composite key gives 23505 tenant_hidden_items_pk, then same actor inserts foodSystem kind food. kind=`x` gives 23514 tenant_hidden_items_kind_ck, then valid kind variant. ua INSERT gives expectRls; ua SELECT returns both T1 hidden keys; s1 DELETE removes its private key. UPDATE is expectPrivilege.
- **L10** `s1`: insert/update private exercise or food with forged created_by stores uid on INSERT, immutable created_by/id/tenant_id/created_at changes give 42501; updated_at is stamped now. Legal name edit stores exact localized JSON. Exercise/food based_on checks run before guard and their expected class remains 23503.

#### P — Payments, subscriptions and catalogue

- **P01** `ua`: insert own pending payment amount=100/cash/EGP with notes/provider/provider_ref null; stored created_by ua, receipt/verification/refund null. Each spoofed client_insert_eq field (state, notes, provider, provider_ref) gives 42501 with that key/column; each insert_eq server field likewise. Repeat valid own insert after each refusal.
- **P02** `ua`: pending payment state→verified or rejected/refunded, notes/amount/currency/method edits each give client_update/column 42501; proof_media_id=private A proof, reference=`proof-1`, paid_at=fixed time store exactly. Verified own row edits affect zero rows (P27).
- **P03** `ua` inserts payment with client B gives expectRls; own client + B subscription/proof gives 23503 payments_subscription_fk/payments_proof_media_fk respectively; A references insert. `s1` updating a B payment gets expectNoEffect; private A reference edit is allowed.
- **P04** `o1`/s2 billing manage: on pending payment update amount 100→120, currency EGP→USD, method cash→other, reference/proof/paid_at store values; after verification each main money field change gives editable_in/column P0001. notes remains staff-editable after verification; change notes=`internal` as positive control.
- **P05** `o1`: payment id/tenant_id/client_id/created_by/created_at/verified_at/verified_by/receipt_no/refunded_at/provider/provider_ref are immutable on UPDATE; guard immutable/column 42501, then legal pending reference edit. Do not test these through a client allowlist that would mask their rule.
- **P06** `o1`: subscription_id null→subA stores subA, then subB or null gives set_once/subscription_id 42501; unchanged subA plus notes edit stores notes. Setting it first to B's subscription gives native 23503, followed by A.
- **P07** `o1`: verified amount100, refund_amount null→20 keeps state verified and stamps refunded_at=now; raise to60 preserves first refunded_at. Lower to10/null gives monotonic/refund_amount P0001. Set refund_amount100 **and** state refunded together stores full refund; receipt/counter remain unchanged.
- **P08** `o1`: verified→refunded with refund_amount20 or null gives 23514 payments_refund_state_ck; verified refund_amount100 without refunded state also gives 23514. Full100 + refunded is the legal variant. pending refund write gives editable_in/refund_amount P0001 before CHECK; verified variant20 succeeds.
- **P09** `o1`: pending rejection with rejected_reason=`unreadable` and state rejected stores both; reason on pending-only edit gives 23514 payments_rejected_reason_ck; changing reason after rejected gives editable_in/rejected_reason P0001. Legal control is pending→rejected with reason in one statement.
- **P10** `ua/o1`: DELETE payment gives expectPrivilege; permitted own pending proof update / owner verification control leaves a persisted payment. app.next_receipt_no call denied at runtime as function privilege, followed by accessible payment SELECT.
- **P11** `s2` assistant (billing view only): payment/subscription INSERT and subscription_events INSERT give require_perm 42501. Give same private actor billing create/edit respectively and repeat exact statement; it stores created_by/actor_user_id uid. Test each require_perm operation on payments, subscriptions, subscription_events, overrides and packages with only the requested action missing, plus manage expansion.
- **P12** `s2` coach preset: pending→verified/rejected and verified→refunded give perm_transitions/state 42501; add billing verify to same private actor and repeat, asserting stamps/receipt/refund. Business_manager preset permits all three. Owner passes without JSON. Check INSERT-as-verified separately in P23.
- **P13** `o1`: subscriptions price/currency/package_snapshot/package_id/client_id changes give immutable/column 42501; legal ends_on extension stores the exact date and audits before/after. A correction creates a separate subscription; no runtime DELETE.
- **P14** `s2` billing edit: append subscription_events with kind extension, days7 and spoofed actor_user_id; stored actor uid. This declaration alone does not alter subscriptions.ends_on/state. UPDATE/DELETE ledger gives expectPrivilege; another declared ledger insert is the allowed control.
- **P15** `s2` billing edit: insert private client_entitlement_overrides with revoked_at null, spoof created_by becomes uid; revoke with forged time stores now; clear/replace gives set_once 42501; override JSON edit gives update_allow 42501. DELETE is expectPrivilege under §3.3; require_perm.delete is absent; SELECT/revoke is the allowed control.
- **P16** `s2` packages manage: INSERT/UPDATE/DELETE unreferenced private package stores exact name/is_public/archived values then removes it; remove create/edit/delete one at a time on same private actor gives require_perm 42501 for that operation, then restore just that action and repeat. ua sees public unarchived packageT1, not private or archived variants; ua writes are expectRls on INSERT and expectNoEffect on UPDATE/DELETE.
- **P20** `s2` billing manage: read tenant receipt_counter=n, verify two private pending payments in order; receipts exactly R-(n+1), R-(n+2), width at least six; verified_at each transaction now, verified_by actor uid, counter n+2.
- **P21** Same actor: verify a private pending payment then deliberately throw to roll back the transaction; payment/counter/audit pre-images unchanged; next committed verification gets R-(n+1). Application throw is asserted as that test error, not mislabelled SQLSTATE.
- **P22** Two independent `withAuthTx` calls by s2 billing manage verify two private pending payments using Promise.all; both commit, receipts exact set `{R-(n+1),R-(n+2)}`, unique, counter n+2; no serial test pool override.
- **P23** `s2` with billing create but no verify: INSERT state verified with server fields null gives perm_transitions/state 42501; add verify and repeat: receipt R-(n+1), verified_by s2 uid, verified_at transaction now. Supplying forged verification/receipt fields instead gives insert_eq 42501, followed by null-input verified insertion. Client insert state verified remains client_insert_eq 42501.
- **P24** `svc`: set a second private payment's receipt_no to an existing same-tenant receipt; 23505 payments_tenant_receipt_uq and unchanged; distinct receipt succeeds. Same receipt text in a different tenant is allowed.
- **P25** `o1`: on verified amount100 set refund_amount101 or -1 or NaN from null, state remains verified; native 23514 payments_amount_ck. Legal partial20 stores verified/refund20/refunded_at now; use fresh row per rejected amount so monotonic does not mask CHECK.
- **P26** `o2` on a fresh private T2-model tenant: receipt counter starts0 and first verification R-000001; a separate T1-model tenant at n emits R-(n+1); both counters remain independent.
- **P27** `ua`: amount edit on own pending payment gives client_update/amount 42501 (CV-05); same actor may change reference=`pending-proof`. On a service-verified private payment, reference/amount UPDATE each gives expectNoEffect; another own pending reference edit is the allowed variant. Never assert client amount edits are allowed.
- **P28** `o1`: duplicate-id INSERT-as-verified inside a savepoint gives native 23505, rollback-to-savepoint restores counter/receipt/audit counts, next legal verification gets n+1. Parallel client-code equivalent is T31. No ON CONFLICT or MERGE is used to dedupe either table.
- **P29** `svc` private tenant counter999998: verify sequentially and assert R-999999/R-1000000/R-1000001; numbers do not truncate or collide. Unknown-tenant next_receipt_no/next_client_code calls give P0001 with rule:app.next_receipt_no / rule:app.next_client_code respectively; valid-tenant calls by service increment their own counters exactly once.
- **P30** Source contract over API/db callers: no payments/clients INSERT uses ON CONFLICT and no MERGE insert targets either table; the dedupe path uses SELECT first or a savepoint catching 23505. A text occurrence in a test documenting the hazard is not an application violation.
- **P31** Billing-edit-only staff coach cannot begin or increase a partial refund while state stays verified: 42501, rule:app.payment_refund_permission, table payments, column refund_amount. Add billing/verify to the same private actor and repeat the identical change; refund_amount/stamps are exact, receipt/counter unchanged. Business_manager and owner controls succeed. Existing monotonic/state/amount/receipt checks still apply; an unchanged refund with a legal notes edit needs only billing/edit.

#### D — Documents and erasure

Run every document-family case for `(programs,program_versions,program_id)`,
`(nutrition_plans,nutrition_plan_versions,plan_id)` and `(forms,form_versions,form_id)`.

- **D01** `ua`: own copies' version id set includes only published/superseded, excludes draft/in_review/approved/archived. Form template published/superseded versions are visible; program/nutrition templates are absent. s1 sees assigned A copies and all T1 templates, not B copies; s2/o1 see T1 only. Assert exact head/version sets, including a head with only drafts.
- **D02** `o1`: draft document/change_note edit stores exact JSON/text; same edit in in_review/approved/archived-never-published gives editable_in P0001, followed by draft variant. Published/ever-published content refusal is rule:app.protect_published_version P0001, including service code.
- **D03** `o1` and `svc`: every frozen document/version_no/published_at/published_by/tenant_id/client_id/head-key edit gives rule:app.protect_published_version P0001, unchanged; status published→superseded→archived is allowed with frozen content unchanged. Same-state status edits are allowed; archived reopening is never allowed.
- **D04** `o1`: version number≤current max on INSERT gives rule:app.version_rules P0001; max+1 stores that number. Publishing an older draft after a newer ever-published version gives rule:app.version_rules P0001; a newest private draft publishes and becomes the head pointer.
- **D05** `o1`: head kind/client_id/template_id changes give immutable 42501; legal name edit stores exact JSON. forms.form_kind is immutable. Runtime version head-key/client_id identity changes in draft give immutable 42501; frozen rows use D03's earlier special-rule error.
- **D06** `o1`: DELETE draft version returns it and removes it; DELETE in_review/approved/archived-never-published gives delete_when/status P0001, then private draft delete. Frozen version DELETE is rule:app.protect_published_version P0001 for runtime and service, irrespective of runtime `app.erasure=on`.
- **D07** `o1`: head with only drafts DELETE removes head and versions; head with in_review/approved/published/superseded/archived versions, including archived-never-published, gives rule:app.head_rules P0001. A fresh all-draft head is the permitted control. Service deleting a head with frozen versions without erasure still fails in protect_published_version.
- **D08** Two transactions as o1 create version3 of the same private head with existing v2: first holds the advisory lock, second waits, first commits then second gets rule:app.version_rules P0001; exactly one v3. Losing actor can append v4. Synchronise explicitly instead of relying on scheduling.
- **D09** `o1` and `svc`: INSERT draft version of a visible T1 head with tenant_id=t2/client_id=C spoofed stores the **head's** tenant and client (null for template, A for copy). ua inserting under templateProgram and s1 under copyProgramB each gives 23503 rule:app.version_rules because the head is invisible. s1 then inserts next draft under private assigned A head; ua's permitted control is SELECT its own published version, since clients have no version INSERT policy.
- **D10** `svc`: head INSERT/UPDATE published_version_id pointing at draft, another head or another tenant gives 23503 rule:app.head_rules; INSERT control leaves pointer null, UPDATE control points an existing private head at its published same-head version. `o1` attempting a non-null pointer INSERT, a value-changing UPDATE or clearing an existing pointer gives rule:app.head_rules 42501 before guard; legal runtime publish updates it indirectly. Same-value pointer UPDATE is a permitted no-op. Do not assert 23503 for the runtime immutable pointer path.
- **D11** `o1` and `svc`: current_version_id to another head/tenant gives 23503 rule:app.head_rules; own draft pointer stores id. DELETE that draft leaves current_version_id null and preserves head id. Superseding/archiving current published version clears published_version_id in the same transaction; publishing replacement sets it. No deferred trigger or COMMIT-time rejection exists.
- **D12** `o1`: replace publication in one transaction: supersede v1 (pointer null), publish v2 (pointer v2); commit exact statuses/pointer and client-visible set. Archiving v2 clears pointer immediately; head can remain readable under its own policy with null pointer.
- **D13** `svc`: service UPDATE or INSERT status published/superseded with published_at null gives 23514 `<versions table>_published_at_ck`; same actor sends non-null published_at and published_by and stores them. Runtime publication stamps these automatically.
- **D14** Two o1 transactions publish the same head's draft v2/v3, no existing published version; force v2 to commit first. v3 then gets 23505 `<versions table>_one_published_uq`; one published pointer=v2. After superseding v2, losing actor publishes v3. Ordinary draft edits do not acquire the publication advisory lock.
- **D15** `s2` lacking publish: draft→published gives perm_transitions/status 42501 for each module; grant only corresponding publish and repeat, pointer/stamps exact. Owner passes; staff with permission also takes direct draft→published. There is no owner-only shortcut.
- **D16** `o1` and publish-enabled s2: direct INSERT status published with null supplied stamps is allowed by T20, gets server stamps/pointer; INSERT in_review/approved/superseded/archived is transitions/status P0001. C08/G22 require draft and published in every literal version insert list; supplied non-null publication stamps still give guard:insert_eq 42501.
- **D17** `o1` and `svc`: superseded/ever-published archived→draft gives rule:app.protect_published_version P0001; archived-never-published→draft also gives that rule. Positive variant leaves archived unchanged and edits another private draft document.
- **D18** `svc` invokes app.entity_client on each allowlisted entity with a real UUID row: return that row's client, clients.id for clients, null for templates/tenant-wide rows. Unknown entity 42501, malformed UUID 22023, nonexistent/foreign-tenant UUID P0002, each with rule:app.entity_client detail; repeat same actor with valid entity/id. tenants uses exact pinned-tenant text and refuses a different id P0002.
- **D19** `o1/ua`: execute erase_client/close_tenant gives expectPrivilege(function), zero changes; legal SELECT control. Service transaction carrying a forged request uid reaches each function but gets rule:app.erase_client / rule:app.close_tenant 42501; identity-free service invocation is the allowed control on a private graph.
- **D20** `svc`: ordinary DELETE private client with frozen program/nutrition/form versions, without erasure, gives rule:app.protect_published_version P0001 and graph unchanged. `withErasureTx` + app.erase_client on the same graph deletes payments, subscriptions, media, sessions/logs, documents/versions, threads/messages/revisions, memberships/assignments and every linked user's tenant-keyed notifications/deliveries/push/preferences/idempotency rows. Include two distinct users linked to the one client, each with null-client notifications and idempotency responses; none of either user's tenant-keyed records survives. Compare every target's key set, other clients/tenants unchanged. No personal audit/outbox snapshots survive; exactly the final service client.erase row remains, client_id null, entity_id erased id, reason and returned deletion counts exact. The erased users' consents remain (retention exception), not “zero client rows everywhere”.
- **D21** Same service actor: repeat erase_client on removed id gives P0002 rule:app.erase_client; erasing a second private client works. Ordinary tenant DELETE without flag fails on frozen versions; withErasureTx/app.close_tenant deletes every row with that tenant_id, including no-FK audit/events/job_runs/idempotency rows **after** cascades; other tenant/system library unchanged. Unknown tenant closure P0002 followed by valid private closure.
- **D22** Runtime `o1`: set local app.erasure on then DELETE a frozen version gives P0001 rule:app.protect_published_version, and DELETE its non-draft head gives P0001 rule:app.head_rules; permitted all-draft delete works. Service withErasureTx observes app.erasure on, app.uid() null and the stored erasure: reason prefix; it sets no JWT identity. After commit a later service transaction does not retain the flag. Empty, whitespace-only and one/two-character withErasureTx reasons throw `withErasureTx needs a reason` before any callback/SQL runs; a valid reason executes SELECT and stores the prefix. Identity-free ordinary withServiceTx cannot DELETE frozen history without the flag, but may invoke the service-only erasure functions that deliberately establish it (§7.9).
- **D23** `s2`/service: for each head table, template_id pointing at a same-tenant client copy or foreign-tenant template gives 23503 rule:app.template_ref_check; same-tenant actual template reference stores it. Exercise INSERT and changed UPDATE under service (runtime template_id UPDATE is immutable). On programs/nutrition templates non-null subscription_id gives 23514 client_sub_ck; forms has no subscription_id.

#### M — Messaging

- **M01** `ua/ub/s1/s2/o1/o2`: assert exact conversation/message id sets for private A/B/internal/T2 rows. Clients see own thread only; s1 sees A+internal, s2/o1 A+B+internal, o2 T2. Internal messages have client_id null. No staff scope leak through internal policy.
- **M02** `ua` updates another sender's message body/attachments/deleted_at in own visible thread: rule:app.message_rules 42501, then marks own-side read marker. Author edits own body=`edited`/attachments and stores edited_at transaction now; sender/conversation/client/template/reply/offline identity changes each refuse rule:app.message_rules 42501.
- **M03** `ua/s1`: bulk mark own side read across authored and received messages with marker null succeeds; stamps now, other side unchanged. Forged later marker on an already-read message preserves first value silently; clear marker gives rule:app.message_rules 42501, then repeat marking preserves it. Setting the other side's marker gives same refusal, then own-side variant.
- **M04** `ua`: soft-delete own private message sets deleted_at; later body/attachments/delete-time change or undelete gives rule:app.message_rules 42501; permitted own-side read marker still stamps. Physical DELETE messages/conversations gives expectPrivilege, followed by soft-delete/reset control.
- **M05** `ua`: INSERT message into convB gives 23503 rule:app.message_rules/conversation_id, no message/counter/revision change; convA variant stores A client and sender ua.
- **M06** `ua`: INSERT into convInternal gives 23503 rule:app.message_rules/conversation_id; convA variant stores it.
- **M07** `s1`: INSERT into convB gives 23503 rule:app.message_rules/conversation_id; convA or private internal variant stores sender_role staff, sender uid s1, client A or null exactly.
- **M08** `ua/s1/o1`: INSERT with foreign sender_user_id/sender_role/client_id and future created_at is overwritten: stored user/role from pin, client from conversation, created_at transaction now. Non-null edited_at/deleted_at/read markers on INSERT each gives rule:app.message_rules 42501; null variant inserts with all four null. On empty and earlier-timestamp conversations, future created_at=2099-01-01 is replaced by transaction now and last_message_at becomes greatest(previous time, now), treating null as now; it never uses the forged future time or decreases.
- **M09** `ua/s2`: private conversation with counters0; ua message body=`client` yields unread_for_coach1/unread_for_client0 and preview/client time; coach reply yields1/1 and reply preview/time. Own-side reset to0 works; own-side increment/negative gives update_to 42501. ua changing coach counter/subject/archive gives client_update 42501; s2 changing client counter gives staff_update 42501. Staff subject/archive/coach reset store exact values. Every refusal has that actor's own-side reset control.
- **M10** `svc` inserts newer message then an older one in a private thread: preview/time stay on newer, counters increment by sender role. Author edits newest body→`corrected`: preview corrected, last_message_at unchanged. Delete newest: preview previous live body's first140 chars; delete last live message: preview null. Revisions preserve old bodies.
- **M11** `ua`: client conversation INSERT spoofs kind, subject or archived_at individually: 42501, guard:client_insert_eq, that column and table conversations. Spoof last_message_at, last_message_preview, unread_for_client or unread_for_coach individually: 42501, guard:insert_eq and that column. The BEFORE guard fires before the native kind CHECK. Legal client kind/A with subject/archive/preview/time null and both counters zero inserts on a fresh ua-model client with no thread. Foreign client gives expectRls, followed by own new-thread variant.
- **M12** `o1`: direct last_message_at/last_message_preview edit gives immutable/column 42501; unread_for_client or unread_for_coach=99/-1 gives update_to/column 42501; both reset to0 and subject/archive edits store exact values. Owner is not constrained by staff_update; it is constrained by immutable/update_to. The trigger-produced preview from M09 remains permitted.
- **M13** `ua` edits body and attachments on private own message: one revision per actual change, old body/attachments, tenant/client/message ids exact, revised_by uid, revised_at transaction now. Same-value UPDATE, read marking and soft-delete alone add no revision; attachment-only edit does. s1/internal revision has client_id null.
- **M14** `ua/s1/s2`: revisions visible exactly for messages each actor sees (own/assigned/internal); exact key sets. INSERT/UPDATE/DELETE revisions each expectPrivilege, then SELECT own permitted revision returns original snapshot. Re-read original revision and parent unchanged after each denial.
- **M15** `ua`: replying to message in another conversation gives 23503 messages_reply_fk, unchanged thread counts; replying within own conversation stores reply_to_id. UPDATE reply_to_id is rule:app.message_rules 42501 even if the FK would allow it; permitted body edit follows.
- **M16** `ua/s1/o1` on private visible authored messages: change id/tenant_id/conversation_id/client_id/sender_user_id/sender_role/template_key/reply_to_id/client_uuid/created_at one at a time, each gives 42501 rule:app.message_rules with that column/table. A supplied edited_at without body/attachments change is silently reset to OLD edited_at; a body/attachment change sets edited_at=transaction now. After each refusal author changes body to `allowed` and service verifies exact body/time/revision. M02/M03 cover non-author field denial and read-marker exceptions.

#### K — Tracking

- **K01** `ua`: INSERT set log with client_id=A but B session gives 23503 set_logs_session_fk; matching A session stores set_no1/reps10. s2 inserting client_id=B with A session gets the same FK error. ua inserting client_id=B instead gets expectRls, before native FK checks; repeat own A variant. s2's mismatched workout program/version/client gives 23503 workout_sessions_program_fk or workout_sessions_version_fk according to the single mismatched reference; matching private A tuple inserts. Re-read targets and parents on rejection.
- **K02** `ua`: start session on own draft/in_review version gives 23503 rule:app.visible_refs; own published/superseded version stores exact program/version IDs. Same client's other program with wrong version gives 23503 workout_sessions_version_fk even though both versions are visible. Null program with non-null version gives 23514 workout_sessions_program_pair_ck.
- **K03** `ua`: meal_logs and supplement_logs referencing own draft plan version give 23503 rule:app.visible_refs on INSERT and changed plan_version UPDATE; own published version stores it. B plan version as ua gives 23503 rule:app.visible_refs; as s2 on an A log it gives 23503 meal_logs_plan_version_fk or supplement_logs_plan_version_fk respectively. Unchanged reference with meal note or supplement taken edit is allowed.
- **K04** `ua`: metric correction of B's metric gives 23503 metric_entries_correction_fk; correction of private A metric inserts a **new** row with correction_of original id/value79.5; original complete row unchanged. Client-claimed source imported/device/form/ai_estimate on INSERT gives client_insert_eq/source 42501; manual variant stores manual.
- **K05** `ua/s2/o1`: metric_entries UPDATE (including value/unit/source/identity) and DELETE all give expectPrivilege; subsequent permitted manual append/SELECT is the positive control. Retry same `(tenant_id,client_id,client_uuid)` with ON CONFLICT DO NOTHING returns zero and preserves original; another client's same offline uuid is independent.
- **K06** `ua`: InBody raw_media_id=B gives 23503 inbody_records_media_fk; A media inserts. Client source!=manual gives guard:client_insert_eq/source 42501; normalized!={} on INSERT by any runtime role gives guard:insert_eq/normalized 42501. Manual/default normalized stores `{}`. After insertion source UPDATE by ua gives guard:client_update/source 42501; normalized UPDATE by any permitted runtime role gives guard:immutable/normalized 42501. Legal fields/note update stores exact JSON. Service importer may store normalized/source explicitly.
- **K07** `ua`: session INSERT summary non-null gives guard:insert_eq/summary 42501 for every runtime role; summary null insert is allowed. UPDATE summary gives guard:immutable/summary 42501; UPDATE planned_workout and program/version/snapshot ids gives immutable 42501. Allowed client_note edit stores text; service summary calculation stores exact supplied computed fixture JSON. Do not invent a DB validation of planned_workout JSON against the version; API performs that copy.
- **K08** `ua`: measurement taken_by=`staff` INSERT gives client_insert_eq 42501; `client` stores. Measurement values/note, photo poses/weight_kg/note updates store exact payloads; identity/uuid/created_at changes each immutable 42501, followed by allowed field edit. JSON-contained media ids are API validation, not FK protection.
- **K09** `ua`: set_logs INSERT/UPDATE exercise_id and substituted_for each reject exerciseT2 with 23503 rule:app.set_logs_library_check and store exerciseSystem/exerciseT1. Test both columns, both operations, and same-value updates. Native missing UUID FK case is additionally N04; a deleted exercise cannot orphan a log.
- **K10** `ua`: private set log tombstone deleted_at=fixed time plus newer client_updated_at stores both; physical DELETE expectPrivilege, followed by legal tombstone update. session_id/client_uuid/client_id/id change gives immutable 42501; legal reps12 update stores it.
- **K11** `ua`: replay set_log, measurement, photo, session, meal and supplement payloads from a second transaction with conflict target `(tenant_id,client_id,client_uuid)`, SET exactly client_update columns and §12.1 row 12's null-safe predicate. Stored null accepts the first non-null timestamp; strictly newer payload stores each concrete alternate; older/equal replay returns zero and preserves the whole row. Requests require non-null timestamps; direct decreasing/clearing timestamp UPDATE gives guard:monotonic P0001. Existing form_submissions use RLS lookup and guarded UPDATE, including newer answer saves on service-created scheduled/overdue rows; absent rows use permitted ordinary INSERT, with concurrent 23505 caught in a savepoint and one UPDATE retry. Client INSERT scheduled remains guard:client_transitions P0001 and overdue remains guard:transitions P0001; submitted answers remain immutable through guard:editable_in. Test stored null/equal/older/newer timestamps on that path too. A savepoint batch containing one immutable 42501 and one monotonic P0001 commits its later valid row. Messages dedupe creation with sender-based key and DO NOTHING, then re-read the own-sender row; retries omit edit/delete/read times and separate edits/read UPDATEs follow §7.4, never a client_updated_at predicate or guard client_update list.
- **K12** `ua`: submission on copyFormBPub gives 23503, rule:app.submission_rules, table form_submissions, column form_version_id; own templateFormPub variant stores templateForm id/checkin kind. `s2` submitting A answers against B's visible form copy gets 42501, rule:app.submission_rules, table form_submissions, column client_id. Invisible/missing versions get 23503 on form_version_id; visible unpublished versions get P0001 on form_version_id. Published template stamps form_id/form_kind despite wrong supplied values. Counts and target rows remain unchanged after refusal; own published-template submission is the control.
- **K13** `ua`: coach-owned requested A media accepts requested→uploaded with MIME image/heic/bytes2000, owner unchanged coach uid; ub UPDATE same row expectNoEffect. A coach-owned approved row is invisible to ua UPDATE (expectNoEffect); ua-owned approved row reaches editable_in and refuses bytes/metadata/uploaded_at/deleted_at with P0001. After each refusal ua completes its own private requested→uploaded variant; ub uses its own requested B row.
- **K14** `ua`: media MIME change while needs_resubmission/requested stores image/heic; uploaded/queued_for_review gives editable_in/mime_type P0001. Path/bucket/purpose/client/owner/kind UPDATE gives immutable 42501; request upload is allowed control. Review stamps are X03, path checks N05.
- **K15** `ua` on own proof review_state null: soft-delete while linked payment verified/rejected/refunded gives P0001 rule:app.media_proof_rules; pending linked payment permits deleted_at then second change/clear gives set_once 42501. Service gets the same every-role proof refusal under §7.11.3, with table media and column deleted_at; no current_user bypass exists. Erasure removes the payment/media graph through its dedicated delete path.
- **K20** `ua/s2/o1`: append-only metric regression alias with explicit UPDATE value79.5 and DELETE expectPrivilege; new correction row succeeds and service original value remains80. Keep N18's id with its T24-adjusted semantics; it is not a client_update guard test.
- **K21** `ua/s1/s2/o1/o2`: exact shared consents sets `{consentA}`, `{consentA,consentS1}`, all three for s2/o1, none of these for o2. Private ua own withdrawal forged time stores now; second different time or null gives set_once 42501. Other-user INSERT expectRls, DELETE expectPrivilege; permitted own insert/withdraw follows. Compare accessible_user_ids to I08.
- **K22** `s2/ua`: library-check call-site completeness regression: K09's two columns and L07's exercise/food based_on_id each have INSERT, changed UPDATE and unchanged UPDATE positive/foreign-reference negative tuples. No call site may disappear from coverage metadata.
- **K23** `s1`: tenant_hidden_items regression uses composite key `(t1,'exercise',exerciseSystem)`; hidden_by stamp, duplicate 23505, invalid-kind 23514, ua insert expectRls, tenant-member SELECT and staff DELETE all as L09. It does not remove system exercises from SQL SELECT.
- **K24** `svc`: §9 additions round-trip through C18; explicitly insert task source_event_id5000000000, set-log deleted_at and both library based_on_id fields. Default receipt_counter0/search_key empty and nullable invitation/event fields are asserted by stored values, not schema declaration alone.
- **K25** `ua/s2/o1`: on private accessible workout_sessions and inbody_records, UPDATE summary or normalized respectively gives 42501, guard:immutable, exact table/column. INSERT non-default summary/normalized gives guard:insert_eq 42501; default null/{} is legal. After each refusal the same actor edits client_note or fields/note. Service writes exact computed summary/normalized JSON and all roles read those stored values without being able to rewrite them.

#### E — Calendar, forms, consent, AI and personal rows

- **E01** `ua`: calendar INSERT expectRls; state scheduled/due/overdue→completed/skipped stores chosen terminal state and only its server timestamp (X06). Editing due_at/payload/source gives client_update or immutable 42501, then allowed own state update. B UPDATE expectNoEffect; own private event is control.
- **E02** `s1`: runtime calendar source package_rule/automation or rule_key supplied gives insert_eq 42501, no row; manual/null variant inserts. Service package_rule with valid subscription/rule stores both; missing rule/sub gives 23514 calendar_events_rule_ck. Reopening completed/skipped/cancelled to scheduled/due/overdue clears all three stamps.
- **E03** `ua`: private due submission answers/missing_required/client_updated_at store exact values; after submitted same answers edit gives editable_in P0001, then private due-row edit. coach_feedback/results insert non-null gives client_insert_eq 42501, UPDATE gives client_update 42501; staff may store both on an accessible submission.
- **E04** `ua/s2`: submit/review stamps submitted_at/reviewed_at now and reviewed_by actor uid; direct server stamp/id/form/event/subscription/offline identity changes give immutable 42501. Supplied insert stamp fields give insert_eq 42501; null-input legal variant stores stamps only on state entry. Calendar/client/subscription references must pass N04.
- **E05** `ua`: linked scheduled submission with event due_at≤transaction now: scheduled→submitted first gives transitions/state P0001 (the global machine runs before client_transitions); app.advance_due returns true, both scheduled rows become due, retry submit stores submitted/submitted_at now. Second function call returns false without changing reviewed/submitted state. Boundary due_at=now is included.
- **E06** `ua`: advance_due for B or nonexistent UUID gives P0002 rule:app.advance_due; same actor advances its due private row. Future event or no calendar link returns false and leaves rows unchanged; scheduled→submitted remains transitions/state P0001 until due. Unpinned caller gets rule:app.advance_due 42501; valid pin is the positive control. No other state may be manufactured.
- **E07** `ua`: private consent INSERT accepted_at forged stores now/withdrawn_at null; insert with withdrawal gives insert_eq 42501; changing accepted/kind/version/locale/user_id gives update_allow 42501; legitimate withdrawal works once. Staff cannot withdraw someone else's consent (expectNoEffect), then can read its own permitted consent. No DELETE grant.
- **E08** `s1`: private tasks insert source/source_event_id/dedupe_key or completion stamps supplied gives insert_eq 42501; manual/null/open variant stores created_by uid. client_id UPDATE immutable 42501; title edit stores `allowed`. Complete→open clears stamps, cancel/reopen stamps follow X08.
- **E09** `s2` and service: task assignee disabled sx, client ua membership or foreign-tenant membership gives 23503 rule:app.task_assignee_check; active T1 owner/staff succeeds. Once assigned then disabled, unchanged-assignee title edit still succeeds, preserving history. Assert table tasks and column assignee_membership_id; the sole SQL definition is §7.11.2.
- **E10** `s2`: AI INSERT state approved/rejected gives transitions/state P0001; draft insert stores created_by uid and approval stamps null. Draft→approved without ai/publish gives perm_transitions 42501; add permission, approve with exact stamps. output/model edit after approved/rejected gives editable_in P0001; draft output/model edit stores exact JSON/text. DELETE expectPrivilege, permitted reject/SELECT control.
- **E11** `ua`: notifB SELECT empty, UPDATE/DELETE expectNoEffect; notifA read_at=fixed time stores it; title/payload/user/client UPDATE gives update_allow 42501. INSERT notifications or notification_deliveries gives expectPrivilege, then read/mark own notification control. notification_deliveries SELECT exact own set, UPDATE/DELETE expectPrivilege.
- **E12** `ua`: own idempotency INSERT stores key/hash/status_code/response_body exactly; ub user_id INSERT gives expectRls, ub SELECT empty, DELETE expectNoEffect; own DELETE removes it. UPDATE even own gives expectPrivilege; SELECT/DELETE is the permitted control. Test owner has no other-user override.
- **E13** `ua`: register_push('https://push.example.test/e', {p256dh:'p',auth:'a'}, 'ua') returns UUID; stored tenant/user/keys/UA exact. Same actor re-register returns same id, updates keys, resets failed_at null; UA truncates to512. Missing pin gives 42501 rule:app.register_push; malformed/http/credentials/too-long endpoint or missing/non-object keys gives 22023 same rule; valid variant registers afterwards.
- **E14** `ua` then `ub`: same endpoint registration removes ua's row across all tenants and stores ub/T1 row; unrelated endpoints unchanged. `o1` then `o1t2` same endpoint retains **both** rows because user is same, distinct tenants; each is selectable only under its pin. Ordinary direct INSERT/ON CONFLICT cannot take another user's same-tenant row (expectRls on update path); function registration is the permitted same-actor takeover. Add overlapping different-user register_push calls in one tenant and across tenants: force order using the endpoint advisory lock, then assert only the last serialized user's endpoint rows survive with exact user_id/keys. Same-user registrations across tenants retain both rows.
- **E15** `ua`: own push keys/user_agent UPDATE stores values; endpoint/tenant/user/id/created_at and last_used_at/failed_at changes give 42501 guard:immutable with the exact column. Runtime INSERT pins last_used_at/failed_at null (non-null gets guard:insert_eq 42501). Other-user INSERT expectRls, UPDATE/DELETE expectNoEffect; own DELETE removes only own private row. Direct http INSERT gives 23514 push_subscriptions_endpoint_ck; valid https/default-times INSERT and keys edit are positive controls. Service/definer registration may reset failed_at.
- **E16** `s1/s2/o1/ua/o2`: job_runs SELECT exact tenant staff set; ua and wrong tenant see empty. INSERT/UPDATE/DELETE all expectPrivilege, followed by same actor's allowed tenant/personal SELECT. A global job_runs row with tenant_id null is invisible to every runtime actor.
- **E17** `ua` plus service writers: overlap advance_due with submission completion/cancellation and future event rescheduling on private linked rows. Hold submission/event locks in the documented submission-then-event order and prove advance_due waits, then reads committed state/time. Submitted/cancelled states survive; a future due_at leaves both rows unchanged and returns false. Conditional UPDATEs never overwrite terminal/rescheduled rows with due. Repeat a due scheduled pair as the same actor's positive control: both move due and return true. Use independent connections, not pool max1.
- **E18** `ua/s2/o1` on each actor's own private push subscription: UPDATE last_used_at or failed_at gives 42501, guard:immutable, table push_subscriptions and that column; INSERT non-null values gives guard:insert_eq 42501. Same-actor keys/user_agent edit succeeds after each refusal. The worker through service may store either time; app.register_push resets failed_at null without changing ownership. Other-user row visibility stays enforced.

#### A — Audit and outbox

- **A01** `ua/s1/o1`: direct INSERT audit_log/events gives expectPrivilege; UPDATE/DELETE any row also expectPrivilege; rows/counts unchanged. Same actor's permitted semantic event or accessible SELECT control follows; no INSERT policy can substitute for the missing grant.
- **A02** `o1` and s2 billing manage: app.audit('payment.verify','payments',private A payment id) stores tenant T1, client A, actor uid/DB role, exact supplied before/after/reason/request_id. app.emit_event('payment.verified','payments',id,{}) returns bigint id; service row has same tenant/client/actor and exact payload. Service reason does not replace runtime actor.
- **A03** `o1/s1/s2/ua`: exact audit row sets: owner all T1, s1 A-client rows only, s2 A/B rows only, clients none. Client creation audit client_id equals client row id; T1 non-client entries hidden from staff. Events owner only; same sets after adding T2 rows stay isolated.
- **A04** `o1`, s2 and `o1t2`: valid allowlisted audit/event call naming foreign-tenant payment returns P0002 rule:app.entity_client, not 42501 can_access_client; invented UUID same P0002. Same actor's own-tenant entity variant writes exactly one entry/event.
- **A05** `s1`: payment.verify/payment.verified targeting unassigned B gives 42501 rule:app.audit / rule:app.emit_event after entity resolution; private assigned A variant succeeds. No caller-supplied client-id overload exists (C06); do not call a removed signature and count42883 as security success.
- **A06** `ua`: staff-only payment.verify/payment.verified gives 42501 rule:app.audit / rule:app.emit_event; allowed own message.sent event writes actor_role client/client A. For audit, §9.2 client checkin.submit/workout.complete are permitted on private own entities; unknown name gives 42501, followed by such an allowed audit name. §7.8.3 uses the same canonical §9.2 seed.
- **A07** `ua`: message.sent event for internal/other-client message gives 42501 rule:app.emit_event after service entity resolution; own message variant succeeds. Unpinned O1 semantic function calls give 42501 respective rule; active own pin is control. Wrong audit action/entity pair gives 42501 rule:app.audit, then matching entity stores it.
- **A08** `o1`: event payload with `pg_column_size >16384` gives 54000 rule:app.emit_event; before/after separately >65536 gives 54000 rule:app.audit. Construct JSONB text and verify pg_column_size, not JavaScript string length; ≤limit variants persist exact JSON. Unknown aggregate 42501 rule:app.entity_client; malformed UUID 22023 same rule; use valid aggregate/id controls.
- **A09** `svc`: each app.audit_actions entity maps to app.entity_client using real factory rows; clients yields own id, tenant-wide yields null. Runtime direct access to either allow-list table gives expectPrivilege; owner semantic call is allowed control. Seed role CHECK rejects empty/unknown roles with 23514, valid seeded role array inserts in a rollback-only service transaction.
- **A10** `svc`: for each plain audited table in §10 (clients, client_notes, client_flags, packages, invitations, consents, programs, nutrition_plans, forms, ai_requests, media) INSERT/UPDATE/DELETE private valid rows yields exactly one row per event, action lowercase operation/entity exact table/entity_id row id/tenant correct. Three versions tables audit INSERT/DELETE and status-update only; tenants split tested below. Retained seven audit tables also get one legal event each (assignments no UPDATE privilege is a service path). On clients client_id=id; other client-bearing rows copy their client_id, tenant-wide rows null. For tables without id audit entity_id is null; use composite predicates, not serviceRow(uuid).
- **A11** `o1`: UPDATE private tenant name=`renamed` yields one tenants update audit with tenant_id=tenant.id, before old name/after renamed; no missing-tenant error. Tenant INSERT/DELETE service path uses tenant id too.
- **A12** `o1` creates private client then verifies private payment: client/receipt counters move once each but tenants audit row count delta0; clients/payments audits have expected rows. Counter-only updated_at stamping must not trigger the tenant column-specific audit.
- **A13** `o1`: UPDATE tenants SET name=name yields exactly one tenants update audit (SET-list behaviour), even though snapshots' name is equal. Version `SET status=status` likewise fires its column-specific audit; document-only autosave does not.
- **A14** `o1`: draft version document autosave emits zero version audits; publish/status change emits one with neither before nor after containing document, change_note retained as applicable. INSERT/DELETE version snapshots strip document too. A guard-rejected immutable update leaves audit/event persisted row counts unchanged; permitted legal update adds exactly the expected audit.
- **A15** `o1`: in one transaction legal payment change + semantic audit + event, then deliberate rollback, leaves all three pre-images/counts unchanged. Commit variant stores all three atomically. Do not assert rollback of identity sequence allocation.
- **A16** Source contract for the outbox processor: before side effects re-read aggregate state, and require recorded actor_role in event_types.roles; forged payload/obsolete state/role mismatch is ignored. This is a source/API contract in this DB section; Hono/worker behavioural tests belong to §12 W04 and are outside these DB suite files.

#### S — Complete policy matrix

`test/matrix.ts` contains hand-entered cases with `table`, `actor`, `command`, private factory, exact keys/predicate,
statement, expected ids/values/error layer, and `covers: ['policy:<exact pg_policy name>', ...]`. Use key tuples for
staff_client_assignments, business_settings, user_preferences, tenant_hidden_items and idempotency_keys; UUID ids
elsewhere and bigint text ids for audit/events. Every policy has an exact independent catalog-expression assertion
and coverage metadata. Every nonredundant authorization arm also has behavioral witness/refusal/control tuples.
For policies implied by another policy on the same command, record the implication instead of inventing a necessity
witness: `memberships_owner_select` is implied by `memberships_staff_select`, and
`staff_client_assignments_owner_select` by `staff_client_assignments_staff_select`. Test their owner-visible sets and
foreign-tenant denials, and keep their exact objects required by C02/S00. Use client/staff/owner/own/other/template/
internal classes to distinguish other arms; never delete or broaden policies to make coverage pass.

- **S00** `svc`: every public pg_policy name appears in at least one implemented matrix tuple's covers, no stale/nonexistent name; every §3.3 table has SELECT and each I/U/D outcome represented, including privilege denials. Compare expected exact policy set as well, so deletion of a policy cannot reduce the required coverage. Each §5.2 restrictive guard is covered by S02/S04 plus its table's positive SELECT. Every policy also has C02's independent exact expression assertion; implied owner SELECT policies record the implication and owner/foreign-tenant behavior, without a false necessity witness.
- **S01** All fixture actors `o1/s1/s2/sx/ua/ub/uc/o2/o1t2/ubT2`: SELECT each of the47 tables without application filtering; exact sorted key set equals the hand-entered matrix. Include A/B/T2/template/internal/system/other-user/archived/published/draft/private/public classes as applicable. Expected classes are those listed below, not copied from live policy output.
- **S02** `o2/o1t2`: sweep all tables for foreign tenant rows; normal `tenant_id IS DISTINCT FROM t2` returns none. Exceptions: tenants predicate id<>t2; exercises/foods predicate tenant_id IS NOT NULL AND tenant_id<>t2; memberships require zero foreign rows **whose user_id differs from actor** (own memberships may span tenants). Assert expected own foreign memberships separately. Null-tenant job_runs is still invisible; system library is expected.
- **S03** Every table, active actor `o1/s1/s2/ua/ub/uc/o2/o1t2` and I/U/D: use a valid private statement for the command and expect exactly stored values/returned keys, expectRls, expectPrivilege or expectNoEffect from the operation contract below. Add guard/special-rule cells for client/member self-edit columns and document head/version deletes, rather than weakening a native command to an arbitrary denial. Valid references and permission-enabled staff keep guards from masking policy tests. For INSERT, compare absence/count/counter pre-images; for UPDATE/DELETE use whole-row unchanged checks. Inactive pins' read isolation is I04/S01; G23 separately exercises the named guard:no_membership refusal on a probe INSERT.
- **S04** `o1/s1/ua` on probe: permissive USING(true)/CHECK(true) plus restrictive tenant guard; each sees exactly T1 probe keys, zero T2. T2 INSERT and tenant-moving UPDATE give expectRls; install empty guard JSON for this test so immutable cannot mask WITH CHECK. Same actor T1 INSERT/notes UPDATE returns exact key/value. Test memberships/library/tenants exceptional guard expressions through S01/S02 real tables.
- **S05** `svc`: policy vocabulary source has enableRLS on all tables, every policy goes through allow/tenantGuard and `DRIZZLE_NO_POLICIES` suppresses only policy definitions. Compare generated 0004/0005 contract in C24; no public table is left without its policies after migration.

S01's expected SELECT classes and S03's normal permitted writes are this independent contract. “Scoped staff” means
owner/all-scope for A/B, assigned staff for A only; “self” means same user and pinned tenant. Missing grant in §3.3
always means expectPrivilege, even for an invisible row. Granted but missing INSERT policy means expectRls; granted
but missing UPDATE/DELETE USING means expectNoEffect. A client/member self-edit permit still runs its exact guard.

| Tables | SELECT classes | Permitted runtime writes (subject to guard/state/ref checks) |
|---|---|---|
| tenants | pinned tenant | owner U |
| memberships | own user across tenants; owner all pinned tenant; staff pinned team and accessible clients | owner I/U; self U profile only; no D |
| staff_client_assignments | owner pinned all; staff own membership or accessible client | owner I/D; no U |
| invitations | owner all; staff own invites or accessible client-role invites | owner I/U/D; staff I client+null permissions+accessible, U own client invite only; no staff D |
| business_settings | all pinned members | owner I/U |
| user_preferences | self | self I/U/D |
| consents | self; owner all tenant member users; staff team+accessible clients | self I/U withdrawal only |
| clients | own client; scoped staff | staff with clients/create I, scoped staff U, client self U profile |
| client_notes | scoped staff | scoped staff I; author or owner U/D |
| client_flags | scoped staff | scoped staff I/U; no D |
| tasks | staff tenant-wide null-client rows and scoped client rows | same staff I/U/D |
| ai_requests | staff tenant-wide null-client rows and scoped client rows | same staff I/U, approval permission; no D |
| packages | staff all tenant; client public+unarchived | staff I/U/D with package action permission |
| subscriptions, client_entitlement_overrides | own client and scoped staff | scoped staff I/U with billing action permission; no D |
| subscription_events | own client and scoped staff | scoped staff I with billing/edit; no U/D |
| payments | own client and scoped staff | scoped staff I/U with billing permissions; own client I, U only OLD pending; no D |
| exercises, foods | system for all runtime identities; own tenant for active pin | staff own-tenant I/U, no system writes, no D |
| tenant_hidden_items | pinned tenant members | staff I/D; no U |
| programs, nutrition_plans | staff templates and scoped copies; clients own copies | staff templates/scoped copies I/U/D subject to head rule |
| forms | as above plus client T1 templates | as above |
| program_versions, nutrition_plan_versions | staff templates/scoped copies any state; client own copies published/superseded | staff I/U/D subject to guard/protection |
| form_versions | as above plus client template published/superseded | as above |
| metric_entries | own client and scoped staff | same I only |
| measurement_sets, progress_photo_sets, inbody_records, workout_sessions, set_logs, meal_logs, supplement_logs, form_submissions | own client and scoped staff | same I/U subject to client allowlists/visibility/states |
| calendar_events | own client and scoped staff | scoped staff I/U; own client U state only; no client I |
| conversations | staff internal or scoped client threads; client own thread | same I/U, guards decide fields |
| messages | staff internal or scoped client threads; client own thread | same I/U, special rules decide fields |
| message_revisions | exactly visible parent messages | none |
| notifications | self | self U read_at and D, no I; universal update_allow binds the owner too (G05/G20) |
| notification_deliveries | self | none |
| push_subscriptions | self | self I/U/D |
| idempotency_keys | self | self I/D |
| media | pinned tenant assets for every member; scoped staff client rows; own client rows | staff tenant asset I/U/D; scoped staff client I/U; client own I and U when uploader or OLD requested/needs_resubmission; no client-media D |
| audit_log | owner tenant all; staff non-null accessible client rows | none directly |
| events | owner pinned tenant only | none directly |
| job_runs | staff pinned tenant only | none |

#### X — Machines

Build fresh valid rows/heads per ordered pair. Flatten core `machines.<name>.transitions` to `(from,to)` sets and
compare the sets with independently entered DB contracts before executing each pair. Include same-state updates
(no transition check), every initial state, client edge subsets and attribution stamps. Assert refused rows unchanged
and then take a legal edge with the same actor on a private row. Arrange unrelated CHECKs and stamps to pass:
full-refund targets supply refund_amount=amount, rejected targets appropriate reason, and published/superseded sources
have non-null publication stamps. Native CHECK errors must not count as forbidden-edge success.

- **X01** `o1`: subscriptions vs machines.subscription, all7×7 pairs; expected19 distinct edges including pending→cancelled and suspended→cancelled from T23, inserts pending/active only. Forbidden edges/initials transitions/state P0001; legal edges store target exactly. Assert core has both added cancel edges and the created-active rationale, rather than retaining the old17-edge core.
- **X02** `s2` staff: form_submissions vs machines.checkin, all9×9 pairs,16 distinct edges; inserts scheduled/due/submitted. `ua` same valid own rows: inserts due/submitted and only due/overdue→submitted; other changed edges give transitions or client_transitions P0001 according to first failing machine. submitted/reviewed stamps exact; unrelated feedback fields absent from client statement.
- **X03** `o1/s2` and `ua`: mediaReview core edges plus null→uploaded tenant-asset edge (12 total), all nullable-state pairs. Staff inserts null/requested/uploaded; client same initial list, only null→uploaded, requested→uploaded, uploaded→processing/queued_for_review, processing→queued_for_review, needs_resubmission→uploaded. Use ua-owned rows for client edge checks so USING does not hide approved rows. Invalid global/client edge gets corresponding transitions/client_transitions P0001; approved/rejected/needs_resubmission stamp reviewer/time exactly. Tenant-asset null edge tested as staff, client null edge as own media.
- **X04** `o1` and permission-enabled s2: payments all4×4 pairs vs the T28-required core payment machine and §6.3: pending→verified, pending→rejected, verified→refunded only; initial pending/verified for staff/owner, pending only client (client_insert_eq). Other distinct pairs transitions/state P0001; client state UPDATE on pending gives client_update 42501, on non-pending expectNoEffect. Assert core exports the required payment machine; its present absence is a build finding.
- **X05** `o1/s1`: invitations all4×4 pairs, typed from §6.3 (no core machine); only pending→revoked/expired, insert pending. Other distinct pairs transitions/status P0001; staff requires own client invite. Service acceptance is intentionally outside runtime machine.
- **X06** `ua`: calendar_events all enum state pairs; six edges from scheduled/due/overdue to completed/skipped, all other changed edges client_transitions/state P0001. Staff calendar has no global transition key in §6.3: enumerated state changes are allowed, stamping target/clearing opposite stamps exactly. Compare core only if a calendar machine is added by the binding build, otherwise the typed §6.3 list is the oracle.
- **X07** `ua`: workout_sessions states are client-controlled under §6.3, which has no transitions key: completed→not_started stores not_started, and every enum pair is permitted subject to other column rules. Core machines.session remains an API machine; compare/document its edges without inventing DB rejection. job_runs likewise is service-written, with no runtime writes and no DB automationRun edge enforcement.
- **X08** `o1/s1`: tasks all4×4 pairs from §6.3: open↔snoozed; open/snoozed→done/cancelled; done/cancelled→open. Insert only open; illegal changed edges transitions P0001; done stamps completed_at/by, every reopen/open/snoozed/cancelled clears both.
- **X09** `o1` and s2 ai publish: ai_requests all3×3 pairs, draft→approved/rejected only, insert draft; other changed edges/initials transitions P0001. Approval stamps uid/time, draft editable output/model; approved is permission-gated for staff. There is no cancelled state in the agreed text contract.
- **X10** `o1` and publish-enabled s2: publish machine all6×6 pairs for each of the three version tables,11 distinct edges. Runtime initial draft **or published** under T20; other initials transitions P0001. Invalid frozen/backward/archived edges raise rule:app.protect_published_version P0001 first; other illegal edges guard:transitions P0001. Same-state updates preserve stamps; all legal edges store exact status/pointers/stamps. This replaces old F02 while preserving its publish-pair coverage.

#### N — Integrity

Native-integrity tests normally use `svc`, which bypasses runtime guard/RLS but still runs every-role triggers. Use
valid unrelated fields so the named constraint is first. Where a BEFORE trigger owns the relationship (version/head
inheritance, template or library lookup), assert that trigger's specific outcome and separately pin the FK definition;
do not disable triggers to manufacture a runtime failure mode.

- **N01** `svc`: hand-copy **every** §8.2 FK and retained tenant FK into expected `{table,name,definition}`; compare `pg_get_constraintdef` in deterministic qualification/whitespace form, plus child/parent columns, MATCH SIMPLE, delete/update actions, validation and non-deferrability. Per table, non-tenant FK set equals expected set plus retained schema keys; no leftover replaced single-column references. Pointer `confdelsetcols` equals just current_version_id; published_version_id deliberately has no FK. Includes both set-log exercise keys, tenant_hidden_items_tenant_fk, message_revisions_tenant_fk and message_revisions_message_fk, not the old58-key count.
- **N02** `svc`: exact unique-index/PK contract from §8.1 plus retained tenancy/money/idempotency unique keys in schema: name, table, ordered keys, uniqueness, predicate, valid/ready. Include all three one_published partial indexes, payments_tenant_receipt_uq, head-qualified targets, all nine widened offline keys and tenant_endpoint push key; old global endpoint and two-column offline keys absent.
- **N03** `svc`: every CHECK in §8.3 plus tenant_hidden_items_kind_ck and all four app allow-list CHECKs (audit_actions_action_ck, audit_actions_roles_ck, event_types_type_ck, event_types_roles_ck) has exact parsed expression and validation; compare full expected CHECK set on affected tables. Do not retain the old “nine CHECKs” assumption. No new CHECK on package/subscription price is inferred from payment money rules.
- **N04** `svc` and permitted runtime actor: expand one behaviour tuple per FK of §8.2, on INSERT and mutable-reference UPDATE where reachable. For tenant/client-bound references use a real foreign-tenant parent and same-tenant other-client parent for client-qualified keys; expect 23503 with the exact FK name when native, or the named earlier trigger. Matching tuple stores exact ids. Grouped trigger-owned/inherited cases resolve to D09/D10/D11/D23, K02/K03/K09/K12, L07/L08 and E09 with their exact codes. Explicit native tuples include memberships_client_fk, both sca keys, invitations/client_notes/client_flags/subscriptions client keys, subscriptions_package_fk (T1→packageT2), sub_events/ceo subscription+client keys, all payments references, measurement/photo/metric/InBody client+media+correction keys, calendar client/subscription/reschedule, submission event/subscription/client, messages_reply_fk (other conversation), revisions tenant/message, notifications client, delivery tenant/notification, task client/assignee, media client and ai client. For no-action parent deletion use N30–N35; retained tenant-id FKs reject nonexistent tenant and permit real tenant. No FK is covered only by a blanket `23503` caught from another column.
- **N05** `svc`: each §8.3 CHECK gets each false branch and a valid variant, expected 23514/name: all three kind/client heads; internal/client conversation equivalence; invite and membership client-role equivalence; package_rule missing rule or subscription; program/nutrition template subscription; session version-without-program; payment amount negative/NaN and refund range; full-refund iff state; reason only rejected; push https; three version published/superseded stamps. For media exercise both buckets/client-null equivalence and foreign tenant/client prefix, `.`, `..`, backslash, percent, control chars, doubled slash and trailing slash; valid `<t>/assets/f.jpg` and `<t>/clients/<c>/f.jpg` store exact paths. The function-specific endpoint validation is E13; native direct CHECK is E15.
- **N06** `svc`: for each unique rule protecting tenancy/money/offline replay, insert exact duplicate logical key with fresh id and expect 23505/exact index; then change only distinguishing tenant/client/user/head/version/slug/token/path/endpoint/dedupe key and assert insertion. Includes clients_tenant_code_uq, memberships_tenant_user_uq, staff_client_assignments_uq, invitations_token_hash_uq, library tenant slugs, all version head/no keys and one-published indexes, conversation tenant/client, notification user/dedupe, tasks tenant/dedupe, media bucket/path, personal composite keys, calendar sub/rule and receipt uniqueness. For redundant `(tenant_id,id)` target indexes the primary key may fire first: assert exact target-index catalog in N02 and primary-key refusal separately, not arbitrary unique names.
- **N07** `ua/ub`, with private same-tenant client graphs: reuse **same** client_uuid across clients for every widened client-key table; both inserts persist, same-client retry gives 23505 (metrics conflict-do-nothing exception K05). For messages reuse client_uuid across different senders (including internal staff); both persist, same sender replay 23505. Across tenants both persist. Assert exact index columns through N02 as well as behaviour.
- **N08** `svc`: subscription DELETE cascades subscription_events, entitlement overrides and calendar_events, but payments or program/nutrition copy references cause 23503 until those no-action references are absent; then cascade keys vanish exactly. Form-submission references to calendar event/subscription are no-action and block those deletes. Control uses a separate unreferenced private parent.
- **N09** `svc`: every non-tenant FK has a supporting valid child index per §8.4 and §15; compare named indexes and partial predicates, including set_logs exercise/substitution, revisions and pointer key support. Run the zero-row catalog query in C17; do not benchmark deletion time.
- **N30** `o1`: DELETE private package with a subscription gives 23503 subscriptions_package_fk, unchanged package/sub; DELETE an unreferenced private package removes it. Permission-enabled s2 repeats same behaviour.
- **N31** `o1`: DELETE membership gives expectPrivilege and disable works. `svc` DELETE private membership with assignment and no task cascades assignment; with assigned task gives 23503 tasks_assignee_fk and preserves both; deleting an unreferenced private membership is the service control.
- **N32** `svc`: DELETE private media proof referenced by payment gives 23503 payments_proof_media_fk; unreferenced private media DELETE removes it. Runtime o1/ua DELETE client-media gives expectNoEffect (DELETE grant exists on media but its DELETE policy is tenant-assets only), followed by allowed asset DELETE/own soft-delete.
- **N33** `o1`: DELETE private all-draft/no-version template with a client copy gives 23503 `<head>_template_fk`; unreferenced all-draft template DELETE cascades its draft versions. Ensure no frozen version masks the no-action FK; repeat all three families.
- **N34** `ua`: DELETE own private notification returns key, its delivery disappears by FK cascade; ub DELETE that row gives expectNoEffect before the legal own notification control. Other users' deliveries unchanged.
- **N35** `o1/s2`: exercise/food DELETE expectPrivilege, hidden retirement works. `svc`: deleting unlogged library parent with based_on copy sets copy.based_on_id null; a set_logs exercise_id/substituted_for reference blocks exercise deletion 23503 exact exercise/substitution FK, with copies/parent unchanged. Unreferenced exercise service DELETE is permitted.
- **N36** `o1/ua/s1`: physical DELETE clients/payments/messages/consents/conversations/metric_entries/client_flags/ai_requests gives expectPrivilege per table; same actor performs its permitted read/update/append/resolve control. Media is intentionally excluded and uses N32's policy-denial class.

#### Z — Escape

Each case uses the runtime login, not a postgres session with a simulated SET ROLE. Each refused statement has its own
transaction/savepoint. Re-read protected objects/rows through service, then prove a fresh valid `as(actor)` can SELECT
its exact allowed row set. Never leave RESET ROLE or failed DDL state on a pooled connection.

- **Z01** `o1` inside as: RESET ROLE gives current_user dawlyy_app; subsequent SELECT clients gives expectPrivilege(table), and UPDATE tenant also denied. Fresh as(o1) selects T1 clients exactly. RESET ROLE itself is permitted and must not be expected to throw.
- **Z02** `o1`: inspect authenticated membership. If SET LOCAL ROLE authenticated is permitted, assert current_user=authenticated and denial of every DAWLYY table/function operation; otherwise assert 42501 permission-to-set-role. Test every other reachable role outside dawlyy_rls for the same effective denial. No branch accepts access through authenticated. Finish either branch with a fresh successful dawlyy_rls transaction selecting t1.
- **Z03** `o1`: SET LOCAL ROLE postgres gives 42501 permission-to-set-role; valid runtime SELECT control; no ownership/ACL changes.
- **Z04** `o1`: SET LOCAL session_replication_role=replica gives 42501 parameter privilege denial; current setting stays origin, triggers remain enabled; allowed SELECT and ordinary guarded update work.
- **Z05** `o1`: ALTER TABLE clients DISABLE TRIGGER ALL gives 42501 ownership refusal (`must be owner of table clients`); catalog tgenabled/pre-image unchanged; ordinary phone edit on private accessible client is the control.
- **Z06** `o1`: CREATE TABLE public and CREATE FUNCTION app each give 42501 schema privilege denial; no object appears. Use names under the existing dawlyy_probe namespace for test-owned objects when needed; exercise forbidden public/app CREATE inside rollback-only transactions using a name already owned by the test contract, never leave debris. Valid runtime SELECT is the control.
- **Z07** A new postgres-js client using DATABASE_URL, outside every helper: SELECT clients and SELECT app.uid() each gives expectPrivilege(table/function); close in finally. Same login through as(ua) returns current_user dawlyy_rls, uid ua.userId, client id A exactly. Forgetting the helper fails loudly.

### 13.5 Running

Add the repository-root script `test:db` as `pnpm --filter @dawlyy/db exec vitest run`, using
`packages/db/vitest.config.ts`; the existing db package has test:rls but no general test script. Supply separate runtime DATABASE_URL and privileged DATABASE_URL_SERVICE. Keep
`fileParallelism: false`, Node environment, testTimeout30000 and hookTimeout60000. Fail clearly if the database is
missing; do not skip security suites. Files build and clean their own fixtures serially. Concurrent *transactions*
inside P22/T11/D08/D14 are intentional and require at least two runtime connections.

I01 closes the cached pools before setting DAWLYY_DB_POOL_MAX=1; connect() reads it lazily for a newly created pool,
not at module import. Check backend pid and the empty GUC placeholder to prove reuse. Close again before restoring
the environment. The identity suite finishes restoring the default/previous size before concurrency suites begin.
Pin max=1 only for I01. I12 asserts that invalid/nonpositive/noninteger values fall back to10 as §14 states;
`parseInt('1.5')` or `parseInt('1x')` is not validation of a positive-integer value.

The CI DB job (C22) uses a `postgres:17` service. Bootstrap the roles from the real migrations, create the disposable
database, migrate with DATABASE_URL_SERVICE, then run test:db. Run migration databases sequentially because roles are
cluster-wide. Use PG17-supported catalog operations; the ADMIN OPTION spelling in older prose/SQL must not turn a
green job into a PG18-only claim. The CI job also runs C23/C98 and C99, then always closes connections and drops its
disposable databases. It does not change a hosted Supabase account setting.

C23/C98 rehearse the **0002→0006 upgrade of dawlyy_test**, using a disposable copy of the 0002 schema/data and the
real migrator/journal. Assert preservation of existing valid rows, intended changed columns, full catalogs and final
0006 journal. Rehearse a fresh0000→0006 database too. On a separate disposable copy inject a final migration failure
and prove the all-pending transaction leaves schema/data/journal at0002. Never downgrade or truncate the developer's
shared dawlyy_test. C23 is a migration check, not a Vitest test that changes the database underneath another suite.

`scripts/db-migration-check.ps1` is C99 and runs **in CI only**. It creates `dawlyy_mig_<timestamp>`, applies0000–0006,
captures sorted policies/trigger args and enablement/FK-CHECK definitions/index definitions/role and object grants/
function ACLs and defaults, reruns0003 and0006 with ON_ERROR_STOP, captures again, and requires an empty diff. Exclude
unstable OIDs and row data, not ACL content. Use the complete object identity instead of OIDs in snapshots. Run
drizzle-kit generate with DRIZZLE_NO_POLICIES unset and require “No schema changes” and no generated artifact changes.
Restore environment, close connections and drop the database in finally. The rerun preserves custom args/audit
triggers and never leaves PUBLIC execute. C98 is its upgrade phase, not a separate Vitest file. Builders create the
script later; this section only specifies it.

### 13.6 Coverage

Each row is a binding triage decision. Grouped original-finding ids are aliases, not independent product rules.
The source-only checks below are tests of a written contract; they do not claim an API behaviour test ran. API-only
W01–W07 obligations remain with the Hono/worker tests and are explicitly identified where no DB case can prove them.

| Decision id | Cases |
|---|---|
| T1 (FL-01/02, C1/C19, S1) | D06–D07, D19–D22 (all linked users, identity-free wrapper, raw reason validation), A03/A10; Storage/auth deletion sequence and counsel decision are API/operator obligations |
| T2 (PRIV-01, C2) | C05–C07, C06b, C14, C20/C99, Z07 |
| T3 (PRIV-02) | C05/C11/C22/C23, Z02 (effective denial, retained authenticated membership allowed); H0 ADMIN OPTION review uses pg_auth_members |
| T4 (PRIV-03, ATK-01, C4) | C06/C19, D18, A01–A09/A15/A16 |
| T5 (PRIV-04) | C01–C07/C12/C14; no case for dashboard removal: gated release/account step |
| T6 (PRIV-05) | P28/P30, T31 |
| T7 (PRIV-06) | C01/C07/C12, I06 |
| T8 (PRIV-07) | I09 |
| T9 (PRIV-08) | C23/C98, Z07; maintenance/backup/deploy order has no case: release procedure |
| T10 (FL-03, C14, S2, ATK-10) | C08/C10, M01–M16, N01/N02/N04 |
| T11 (FL-04) | T09/T29, L01, G20 |
| T12 (FL-05/09, C6/C20, S5, ATK-12 payments) | P01–P12/P20–P29/P31, G09/G16, X04, N03/N05 |
| T13 (FL-06/07, ATK-16) | T10/T11/T20–T26, N31, C04/C09 |
| T14 (FL-08, ATK-05/17, C7/C8) | L05–L10, D23, N03–N05/N33/N35, C09 |
| T15 (FL-10/11, ATK-02, C18, FL-19 media) | K13–K15, X03, N03/N05 |
| T16 (FL-12, ATK-08, S10) | E13–E15/E18, N02/N05/N06, S01–S03; no DB case for host allow-list: W tests |
| T17 (ATK-03, C13) | C08b, G07/G08/G21, M08/M10, K11 |
| T18 (ATK-04, replaces S6) | K04/K06/K20/K25, G21; normalized uses universal insert_eq/immutable |
| T19 (ATK-06/11, FL-16, S3/S7) | L02–L04, E02/E08–E09, X06/X08, A10, G13/G21 |
| T20 (C16 permissions decision) | I11, T13–T15, P11/P12/P23/P31, D15/D16, E10, G17/G18, X04/X09/X10 |
| T21 (ATK-07) | E10, X09, G20/G21, A10 |
| T22 (C9/C10/C11/C15, FL-17, ATK-09, S8) | D01–D17 (published INSERT allowed; runtime pointer writes hit rule:app.head_rules first), K02, X10, A13/A14, N01/N04/N33 |
| T23 (FL-18, ATK-12 subscriptions) | P13/P14, X01, A10 |
| T24 (C5, ATK-13) | C04, K04/K05/K20, N07/N36, S03 |
| T25 (FL-15, C17, ATK-14) | K10/K11 (null-safe sync, existing submissions UPDATE, messages creation dedupe), M13, G16, N02/N06/N07 |
| T26 (FL-14, S11) | 13.2 fixture contract, C18, I04/I05, S01, K09/K22 |
| T27 (ATK-15) | C08, G08/G20/G22 |
| T28 (FL-19) | E05/E06/E17, X01–X10; replaces F02 with X10 |
| T29 (S4/S9, C3/C12/C20–C24) | C05/C17/C21–C24/C98, I07/I10, T31, P29, K09, N01/N09 |
| T30 (SQLX-12) | C08/C10/C20/C24/C99 |
| SQLX-01 | C06/C06b/C14/C20/C99 |
| SQLX-02 | D06/D19–D22 |
| SQLX-03 | I07, D18, A04/A05 |
| SQLX-04 | C08b, M08/M09/M10 |
| SQLX-05 | L06, N35, C04/C09 |
| SQLX-06 | K05/K20, C04 |
| SQLX-07 | D04/D13, N03/N05, X10 |
| SQLX-08 | C10, A13/A14 |
| SQLX-09 | G15/G20, M09/M12 |
| SQLX-10 | G13/G21, L04, E02/E08, X06/X08 |
| SQLX-11 | K13–K15, G20, N03/N05 |
| SQLX-12 | C10/C20/C24/C99 |
| PERF-01 | C17, I07/I10 (all-scope staff retain explicit assignment ids), S01/S02 |
| PERF-02 | C17, I08/I10, K21 |
| PERF-03 | C17, N01/N09 |
| PERF-04 | C10, A13/A14 |
| PERF-05 | C07/C10, K09/K22 |
| PERF-06 | no case: measurement/inlining deferred until after beta |
| PERF-07 | C17, N09 |
| PERF-08 | C17, N09 |
| CV-01 | I11, T13/T14, P11/P12/P15/P16/P23/P31, D15/D16, E10, G17/G18; requirePermission location/use outside DB is W01 |
| CV-02 | N03/N05, K14 |
| CV-03 | C06/C06b/C14/C99 |
| CV-04 | K05/K07/K20/K25, G20/G21; API summary/planned_workout derivation is W07 |
| CV-05 | P01/P02/P27, G20/G21 |
| CV-06 | L05–L10, D23, N33/N35 |
| CV-07 | C04, L04, E10, A10, N36 |
| CV-08 | C19, A04–A09/A16 |
| CV-09 | C15; actual Hono response projection behaviour is W02 |
| D1 | C16, N01/N02 |
| D2 | C20/C22–C24/C98/C99 |
| D3 | C24/C23/C99 |
| D4 | C10/C24/C99, N01, D11 |
| N1 | C06/C06b/C14/C20/C99 |
| N2 | 13.3 helper contract, G01–G23, all rejection cases with positive controls |
| N3 | 13.3 classification, S03, T23/T26, P27, M05–M07, N32 |
| N4 | S00–S05, C02/C03; implied owner SELECT policies keep exact catalog/coverage assertions and owner/foreign-tenant behavior |
| N5 | C08, G20–G22 |
| N6 | X01–X10, D15/D16 |
| N7 | N01–N09/N30–N36 |
| N8 | I07, A04–A08, D18 |
| N9 | C05/C11, Z01–Z07; Z02 checks effective denial in both SET ROLE branches |
| N10 | 13.2 factory contract, I04/I05, T02, S01, C18 |
| N11 | 13.3 probe lifecycle, G01–G23, S04 |
| N12 | D09/D10, M05–M08, K12 (visible other-client form: client_id; invisible/unpublished: form_version_id) |
| N13 | D10–D12/D17, N01; no deferred constraint trigger by decision |
| N14 | P20–P29, C08; P27 follows CV-05, no dead payments client_transitions |
| N15 | T20–T31, I08, N31; T26 follows no runtime membership DELETE |
| N16 | A10–A15, C10 |
| N17 | C09, N30–N36, D07/D11 |
| N18 | K05/K20–K24, K09, L07/L09, C18, I08 |
| N19 | C02/C04–C07/C10/C11/C13/C14/C16; C11 follows T3 effective privilege rather than exact-one membership |
| N20 | G05/G15/G20, K25/E18, M09/M12, C08 |
| N21 | I01/I02/I03/I04/I05/I12, 13.5 pool mechanics |
| N22 | C99 (CI only), C23/C98 |

## 14. Client library (`packages/db/src/client.ts`)

- `withAuthTx` and `withUserTx` run `SET LOCAL ROLE dawlyy_rls`, then set three transaction-local limits. `SET ROLE`
  does not apply the target role's `ALTER ROLE` defaults, so without them a runtime query has no timeout at all
  (PRIV-07). The limits are not set by `ALTER ROLE`, and they are not set in `withServiceTx` or `withErasureTx`, whose
  jobs, seeds and migrations may run long.

  ```ts
  async function limitRuntimeTx(tx: Tx) {
    await tx.execute(sql`set local statement_timeout = '15s'`);
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local idle_in_transaction_session_timeout = '30s'`);
  }
  // withAuthTx and withUserTx, after the set_config calls:
  //   await tx.execute(sql`set local role dawlyy_rls`);
  //   await limitRuntimeTx(tx);
  ```

  `withUserTx` pins no membership (§4): it may select the caller's own membership rows and shared system exercise/food
  rows with `tenant_id is null`, but no tenant-scoped rows. System reads neither establish membership nor permit writes.
- `AuthContext` gains `permissions: StaffPermissions | null` (CV-01): the membership's module permissions for staff,
  `null` for owners and clients. `getAuthContext` in `apps/web/src/server/auth.ts` fills it from the membership row, and
  every place that builds an `AuthContext` (fixtures, tests) passes it. It serves the API only, through the
  `requirePermission(auth, module, action)` helper in `apps/web/src/server/require-permission.ts` (§12); W01 imports
  that web helper and the core pure primitives. `withAuthTx` does not send it to the database: `app.has_perm` (§4) reads the
  pinned membership row itself, so a wrong value here can weaken an API check but cannot widen what the database allows.
- `withErasureTx(tenantId, reason, fn)` is `withServiceTx` plus the erasure flag. Erasure of a client and closure of a
  tenant run only through it (§7.9); the flag is honoured only when `current_user <> 'dawlyy_rls'`, so setting it from
  a runtime transaction does nothing. It sets no JWT identity and must leave `app.uid()` null; `withServiceTx`
  supplies only service reason/tenant settings. The service-only functions also establish the flag themselves;
  the wrapper is the API calling convention, not an additional database identity check.

  ```ts
  export async function withErasureTx<T>(tenantId: string, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!reason || reason.trim().length < 3) {
      throw new Error('withErasureTx needs a reason');
    }
    return withServiceTx(tenantId, `erasure: ${reason}`, async (tx) => {
      await tx.execute(sql`select set_config('app.erasure', 'on', true)`);
      return fn(tx);
    });
  }
  // erase one client:  withErasureTx(tenantId, `client ${clientId}`, (tx) => tx.execute(sql`select app.erase_client(${tenantId}, ${clientId})`))
  // close a tenant:    withErasureTx(tenantId, 'tenant closure', (tx) => tx.execute(sql`select app.close_tenant(${tenantId})`))
  ```

  The API first captures Storage paths and all linked user ids, deletes the target Storage objects, calls
  `app.erase_client`/`app.close_tenant` through `withErasureTx`, then deletes each captured auth user with no remaining
  membership. Client prefix: `<tenant>/clients/<client>/`; closure prefix: `<tenant>/`. Record and retry failed stages
  before reporting completion.
- `DAWLYY_DB_POOL_MAX` (default 10) sets the pool size so tests can force connection reuse (I01). It is read lazily
  **inside `connect()`**, when a pool is first created, not when the module loads: a test file imports `client.ts`
  before it sets the variable. `closeDb()` drops the pools, so the next call reads the variable again. A value that is
  not a decimal positive-integer string representing a safe integer falls back to 10.

  ```ts
  function connect(url: string): Pool {
    const raw = process.env.DAWLYY_DB_POOL_MAX ?? '';
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const max = Number.isSafeInteger(n) && n > 0 ? n : 10;
    return postgres(url, { max, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  }
  ```
- Doc comments, `.env.example` and `packages/db/README.md` describe `dawlyy_rls` instead of `authenticated`, name
  `DAWLYY_DB_POOL_MAX` as a test setting, and show environment variables the PowerShell way (`$env:NAME = 'value'`, then
  `Remove-Item Env:NAME` to clear it).
- Deploy `client.ts` together with migrations 0003–0006 (§11, cutover). The old `withAuthTx` runs `SET LOCAL ROLE
  authenticated`, which has no privileges once 0006 has run.

## 15. Adding a table later

1. `pgTable(...).enableRLS()`, a `tenantGuard`, and permissive policies only through `allow`. A policy never calls
   `app.can_access_client(<column>)` or `app.can_access_user(<column>)`; it uses `ACCESS(...)` (§5.1) and
   `app.accessible_user_ids()`.
2. Composite foreign keys for every reference to a tenant- or client-scoped parent. Every foreign key also gets a
   child-side index whose leading columns are the key's columns, in any order (a partial index is fine for a nullable
   column), listed in §8.4. Without it a parent delete or a cascade scans the tenant's whole partition.
3. Names: every constraint, index, policy, trigger and function name is at most 63 bytes (D1). Postgres truncates a
   longer name and prints only a NOTICE, which desynchronises the Drizzle snapshot. Give every object an explicit name
   and check it with `length(name) <= 63` before you commit.
4. In a custom migration (Drizzle cannot express triggers, functions or column-list actions such as `on delete set null
   (col)`; the table's Drizzle definition carries a one-line comment that points at the migration that owns them, D4):
   - the grants that the §3.3 row of the table gives it, and no DELETE on history, ledgers or anything a cascade would
     empty;
   - the guard config if the table is writable (§6.3), with the literal `create trigger` statement (§6.3, T30);
     `created_at` and `updated_at` are stamped by the engine on every runtime insert, so the config does not list them,
     and a time the client claims (`performed_at`, `recorded_at`, `local_date`) lives in its own column;
   - `require_perm` or `perm_transitions` when only staff with a module permission may write it or move its state (§6.1);
     every other module action stays an API check (§12);
   - an audit trigger if it holds money, identity, consent or published content;
   - every statement ends with `--> statement-breakpoint`. Drizzle runs all pending migrations in one transaction, so no
     statement may be `create index concurrently`, `vacuum` or `alter system`, and a new state of a text column is a
     CHECK constraint, never a new enum value used in the same run (D2).
5. Every new function ends with `revoke all on function app.f(args) from public;` and then lists its grants. A function
   the runtime role calls is added to the §3.4 list and to C06; a trigger function and a service-only function are
   granted to nobody. A SECURITY DEFINER function sets `search_path = ''` and belongs to `postgres`, which also owns the
   tables it reads, and no table ever gets `FORCE ROW LEVEL SECURITY` (§3.2). Hand edits of generated migrations are
   listed in §11, so the integrator can re-apply them (D3).
6. A table that clients can read and that holds coach-internal columns gets a `clientColumns` entry in
   `packages/db/src/schema` (the explicit column objects without the internal fields) and §12 lists its internal
   columns. Client routes select only through that map, and test C15 scans the client route files for it (CV-09).
7. Update the catalog test's expected tables, privilege matrix, cascade map, EXECUTE list and trigger list. Add the
   table's behaviour tests (§13) and run the child-side index and 63-byte name checks.

Helper overhead is 70-108 us per statement; measure after the beta before inlining.
