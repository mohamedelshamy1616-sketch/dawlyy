# Batch R0a: migration 0008_reinvent_control, its Drizzle schema, and the security suite

You build the database layer of the DAWLYY reinvention build (wave R0, task R0a). DAWLYY is an online coaching
operating system for fitness coaches in Egypt (Arabic and English, multi-tenant SaaS on Postgres with row-level
security). Claude is the integrator: it reviews your diff, applies the migration on a fresh scratch database, runs
typecheck and the full database test suite, and only then commits. You never run anything.

## The contract

- `docs/plans/2026-11-13-reinvent-build-plan.md`, section "Wave R0", item R0a, and the "Hard limits", item 5
  (Security). Read both in full. This brief settles the open design points below; where the plan and this brief
  differ, this brief wins.
- `docs/architecture/02-database-security-model.md` is the binding security design of the existing schema (428 KB:
  read by section, `grep -n '^#'` first). New objects follow its conventions: §5.1 policy vocabulary, §6.2 to §6.3
  guard triggers, §7.8 audit, §11.4 privileges.

## Files you may write (and nothing else)

- `packages/db/migrations/0008_reinvent_control.sql` (new; you write all of it).
- `packages/db/migrations/meta/_journal.json`: append exactly one entry
  `{"idx": 8, "version": "7", "when": 1794600000000, "tag": "0008_reinvent_control", "breakpoints": true}`.
  Change nothing else in that file. Do not create a snapshot (0007 has none either).
- Drizzle schema files under `packages/db/src/schema/`: `clients.ts`, `programs.ts`, `nutrition.ts`, `forms.ts`,
  `packages.ts`, `calendar.ts`, `tracking.ts`, `tenants.ts`, `index.ts`, and one new file `review.ts` for the two
  new tables. Add columns, tables and policies only; do not change existing columns or policies.
- `packages/core/src/types/client-modules.ts` (new) and `packages/core/src/types/entitlements.ts` (add one optional
  field, see C below), plus the existing barrel file of `packages/core/src/types/` if one exports the siblings.
- `packages/db/test/security.reinvent.test.ts` (new).
- `packages/db/test/fixtures.ts`, `packages/db/test/helpers.ts`, `packages/db/test/matrix.ts`,
  `packages/db/test/guard-matrix.ts`: only to ADD entries or helpers the new objects need (for example a row of the
  new tables in a table inventory the catalog suite checks). Never remove or loosen an existing entry, assertion or
  expectation. In your answer, list every change to these four files, each with the sentence of this brief or of the
  plan it follows.
- Existing behaviour you must keep (found by grep before this brief): the clients API archives with
  `requirePermission('clients', 'edit')` and sets `status = 'archived'` together with `archived_at` (and
  `status = 'inactive'`, `archived_at = null` on unarchive) in `apps/web/src/server/clients/service.ts`; packages,
  programs, forms and nutrition plans archive by setting `archived_at` in their services. The database does not
  couple `clients.status` to `archived_at`; leave that to the service.

## Hard limits (these replace the shared common rules for this batch)

- Do not run `pnpm`, `npm`, `npx`, `node`, `vitest`, `tsc`, `drizzle-kit`, `psql`, `git` or any network command.
- Do not edit `package.json`, lockfiles, `tsconfig*.json`, `vitest.config.ts`, migrations 0000 to 0007, any
  snapshot, `docs/`, `.env*`, `apps/`, or any file not listed above. Do not add dependencies.
- Never create, alter or drop a role or a role membership. Grants on new objects go to `dawlyy_rls` (and the service
  role exactly as §11.4 and migration 0006 do for comparable tables). Nothing is granted to `anon`,
  `authenticated` or `public`.
- Never weaken an existing test, guard, policy, CHECK or grant. Do not edit `app.guard_row()`; add new trigger
  functions instead.
- TypeScript strict with `noUncheckedIndexedAccess`, ESM, named exports, no `any`, LF line endings. Follow the
  neighbouring files. Put a short comment on each new export naming the plan item (`// reinvent R0a`).
- Every object name at most 63 bytes. Separate every SQL statement with `--> statement-breakpoint` on its own line.
  Nothing that cannot run inside a transaction. Start the file the way 0007 does (`set check_function_bodies = on;`
  and the default-privileges revoke). Functions are `security definer` only where this brief says so, always with
  `set search_path = ''` and fully qualified names, and get `revoke all ... from public` then an explicit grant.

## Read first

1. Migration `0006_guards_and_grants.sql`: `app.guard_row()` (line ~112) and its config keys, the per-table
   `*_50_guard` triggers (lines ~355 to 520), `app.audit_row()` and the `*_audit` triggers (line ~1312), the
   privileges block at the end. Migration `0007_push_tenant_scope.sql` for the style of a later migration.
2. Migration `0003_rls_role_and_helpers.sql`: `app.tenant_id()`, `app.uid()`, `app.role()`, `app.client_id()`,
   `app.is_staff()`, `app.has_perm(module, action)` (its module and action allow-lists), `app.can_access_client()`.
3. `packages/db/src/schema/_rls.ts` (the `T`, `STAFF`, `OWNER`, `CLIENT`, `ACCESS`, `OWN`, `ME`, `allow`,
   `tenantGuard` vocabulary) and the schema files you extend.
4. The test helpers and two suites to copy the style from: `test/helpers.ts` (`as`, `q`, `serviceRow`),
   `test/fixtures.ts` (`buildPrivateFixture`, `truncateAll`, the actors it returns and their permissions),
   `test/security.push-tenant.test.ts` (small), `test/security.tracking.test.ts` and `test/security.audit.test.ts`.
5. `test/security.catalog.test.ts` and `test/matrix.ts`: they assert properties of EVERY table, function and policy
   in the database (RLS on, forced, policy names, grants, guard triggers present, audit coverage...). Your new
   tables, columns and functions must satisfy every one of those suites as they stand. If a suite enumerates tables
   from a hand list, add the new tables to that list with the properties they really have.

## What 0008 builds

### A. Archive and restore

1. Add `archived_by uuid` to `clients`, `programs`, `nutrition_plans`, `forms` and `packages` (each already has
   `archived_at timestamptz`). Add both `archived_at timestamptz` and `archived_by uuid` to `exercises`.
2. One new trigger function `app.guard_archive()` (not security definer), attached as a `*_55_archive` trigger
   `before insert or update` on each of the six tables, with trigger arguments naming the permission module. For
   runtime callers only (`current_user = 'dawlyy_rls'`, the same trust rule as `guard_row`):
   - On insert, `archived_at` and `archived_by` must be null.
   - `archived_by` is never written directly: the trigger stamps it to `app.uid()` when `archived_at` goes from
     null to a value, and back to null when `archived_at` goes back to null (restore). Any other change to
     `archived_by` is refused. `archived_at` cannot go from one value to another (clear it first).
   - Changing `archived_at` (archive or restore) is refused for a client, and for staff without
     `app.has_perm(<module>, 'edit')`. The owner passes. Modules: clients `clients`, programs `programs`,
     nutrition_plans `nutrition`, forms `forms`, packages `packages`, exercises `exercises`.
   - Exercises: only tenant-owned rows (`tenant_id` not null) can be archived. A system exercise (null
     `tenant_id`) keeps the existing per-tenant hide in `tenant_hidden_items`; refuse `archived_at` on it.
   - Errors use errcode `42501` (permission) or `P0001` (rule), with `detail = 'guard:archive'` and the
     table and column set, like `guard_row` does.
3. Existing guard configs: check whether any `*_50_guard` config lists `archived_at` as immutable, or whether the
   clients guard lets a client change it (`client_update`). If a config would block the staff archive path, say so
   in your answer; do not edit 0006. Packages already archive through an update guarded by `packages edit`; restore
   (`archived_at` back to null) must now also work.
4. Audit: `clients`, `programs`, `nutrition_plans`, `forms` and `packages` already have `*_audit` triggers on every
   update, so archive and restore are audited already; confirm it in the suite. Add
   `exercises_audit after update of archived_at on public.exercises ... execute function app.audit_row()` (archive
   and restore of tenant exercises only; do not audit every exercise edit).

### B. Calendar cancel, corrections and voids

1. `calendar_events`: add `cancelled_by uuid`. Today `cancelled_at` is stamped by the `on_transition` block of
   `calendar_events_50_guard` when `state` enters `cancelled`. Recreate that one trigger in 0008
   (`drop trigger if exists ...; create trigger ...`) with the IDENTICAL JSON config plus: `cancelled_by` in
   `immutable` and in `insert_eq` (null), and `on_transition` stamps `cancelled_by: "uid"` for `cancelled` and
   `cancelled_by: "null"` for every other state. Copy the existing JSON character for character and change only that;
   list the exact diff in your answer. Add `calendar_events_audit after update of state` with `app.audit_row()`.
   Do not add a delete policy.
2. Void columns on four tables: `meal_logs`, `metric_entries`, `measurement_sets`, `workout_sessions`. Add
   `voided_at timestamptz`, `voided_by uuid`, `void_reason text` (CHECK length at most 500). Add `replaces_id uuid`
   to `meal_logs` and `measurement_sets`, with a composite foreign key on `(tenant_id, client_id, replaces_id)` to
   the same table's `(tenant_id, client_id, id)` (add the unique index it needs, the way `metric_entries` already
   has `metric_entries_tenant_client_id_uq`), `on delete no action`, and a partial unique index so one row is
   replaced at most once.
   `metric_entries` is different and keeps its existing behaviour exactly: it already has an append-only
   `correction_of` pointer, and the existing tests K04 and K20 in `test/security.tracking.test.ts` pin that a
   correction insert leaves the original row unchanged and that several actors may correct. So `metric_entries`
   gets the three void columns and the void rule below, but NO `replaces_id`, no new unique index on
   `correction_of`, and no automatic void on correction (reads take the latest correction; that is app work).
   `workout_sessions` gets no replaces pointer: a junk session is only voided; its `set_logs` stay attached and
   unchanged.
3. The void rule, enforced in the database:
   - A row's void columns change only through `app.void_entry(p_table text, p_id uuid, p_reason text)` or through a
     correction insert (below). Runtime callers cannot set `voided_at`, `voided_by` or `void_reason` directly, on
     insert or update. Add a `*_45_void` trigger (new function `app.guard_void()`, not security definer) on the
     four tables that refuses for `current_user = 'dawlyy_rls'`: setting the void columns on insert; changing them
     on update; ANY update of a row whose `voided_at` is not null; ANY delete of a voided row. (Existing policies
     give clients and staff no delete on these tables; keep it that way.)
   - `app.void_entry` is `security definer`, granted to `dawlyy_rls`. `p_table` must be one of the four table
     names (else `22023`). It locks the row (`for update`) in the caller's pinned tenant (`app.tenant_id()`), and
     refuses (`42501`) unless the caller is either the client who owns the row (`client_id = app.client_id()`) and
     the row's `created_at` is within 7 days of `now()`, or staff with `app.can_access_client(client_id)` and the
     permission `nutrition edit` for `meal_logs` or `tracking edit` for the other three (the owner passes the
     permission). It refuses (`P0001`) a row already voided. Then it sets `voided_at = now()`,
     `voided_by = app.uid()`, `void_reason = left(p_reason, 500)`. Because it runs as the owner role, the
     `_45_void` trigger lets it through; make sure no other trigger on those tables blocks it either (read every
     trigger on them in 0006).
   - A correction is an INSERT of the new row with `replaces_id` set (`meal_logs` and `measurement_sets` only). A
     new trigger function `app.apply_correction()`, security INVOKER, attached as `*_46_correct` `after insert` on
     those two tables, runs when `replaces_id` is not null:
     - for a runtime caller (`current_user = 'dawlyy_rls'`) it calls
       `app.void_entry(tg_table_name, new.replaces_id, 'corrected')`, so exactly the same caller, window and
       already-voided checks apply, and a refusal aborts the insert;
     - for a trusted caller (service transactions, seeds, fixtures: any other `current_user`, the same trust rule
       as `guard_row`) it voids the replaced row directly (`voided_at = now()`, `voided_by = app.uid()` which may be
       null, `void_reason = 'corrected'`) and still refuses (`P0001`) if it is already voided.
     The insert and the void happen in one statement, so they commit or fail together. A new row may not point at
     a row of another client (the composite FK already ensures it; test it).
   - Audit: `*_void_audit after update of voided_at` on the four tables with `app.audit_row()`.
   - Voided rows stay readable through the existing select policies (history). Excluding them from totals and charts
     is app work in a later task; do not add views.

### C. Client modules

1. `business_settings`: add `client_modules jsonb not null default` the object with all seven keys true:
   `{"workouts":true,"nutrition":true,"checkins":true,"progress_photos":true,"measurements":true,"messages":true,"payments":true}`,
   with a CHECK that it is a JSON object whose keys are only those seven and whose values are booleans. Existing
   policies (owner writes, members read) stay. The row's existing guard already stamps `updated_by` and
   `updated_at`.
2. Core: `packages/core/src/types/client-modules.ts` exports `CLIENT_MODULES` (the seven keys, as a readonly
   tuple), `ClientModule` (the union type), `ClientModules` (Zod 4 schema: a strict object of the seven booleans)
   and its type, `DEFAULT_CLIENT_MODULES` (all true), and
   `resolveClientModules(tenant: ClientModules, override?: Partial<Record<ClientModule, boolean>>): ClientModules`
   (override keys win). Follow the style of `entitlements.ts` (it uses Zod 4 and `z.infer`).
3. Per-client override: add an optional `modules` field (a partial record of the seven booleans, strict keys) to
   the `EntitlementOverride` schema in `entitlements.ts`, so the existing `client_entitlement_overrides` rows carry
   it. Do not change any other field.

### D. `ai_drafts` (new table, in `review.ts`)

Columns: `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null` (FK tenants, cascade), `client_id uuid
not null` (composite FK to `clients (tenant_id, id)`, cascade), `kind text not null` (CHECK in `('week_review')`),
`input_hash text not null` (CHECK `~ '^[0-9a-f]{64}$'`), `input_version text not null` (CHECK length 1 to 200),
`body jsonb not null` (CHECK object), `provider text not null default 'none'` (CHECK in `('none','anthropic',
'openrouter')`), `status text not null default 'draft'` (CHECK in `('draft','approved','rejected','stale')`),
`approved_by uuid`, `approved_at timestamptz`, `created_by uuid`, `created_at timestamptz not null default now()`,
`updated_at timestamptz`. Index `(tenant_id, client_id, created_at desc)`.

- RLS: tenant guard; staff with `ACCESS(client_id)` may select, insert and update. No client policy at all (clients
  never read it). No delete policy.
- Guard (`ai_drafts_50_guard` with `app.guard_row` config) for direct runtime writes: `stamp_insert`
  `created_by: uid`; `insert_eq` status `draft`, `approved_by` null, `approved_at` null; `immutable` id, tenant_id,
  client_id, kind, input_hash, input_version, provider, created_by, created_at, approved_by, approved_at;
  `stamp_update` updated_at; a `transitions` machine on `status` whose ONLY edge is `draft->rejected`;
  `editable_in` so `body` changes only while `status` is `draft`. A direct runtime UPDATE to `approved` or `stale`
  is therefore refused: approval and staleness happen only inside the function below.
- `app.approve_ai_draft(p_id uuid, p_current_hash text) returns text`, `security definer`, granted to
  `dawlyy_rls`. Because the guard trusts definer callers, the function does every check itself: the draft is in the
  caller's pinned tenant; the caller is staff (`app.is_staff()`) with `app.can_access_client(client_id)` and
  `app.has_perm('checkins', 'review')` (the owner passes), else `42501`; it locks the row; if `status` is not
  `draft`, raise `P0001`; if `p_current_hash is distinct from input_hash`, set `status = 'stale'` and return
  `'stale'` (no raise, so the stale mark commits); else set `status = 'approved'`, `approved_by = app.uid()`,
  `approved_at = now()`, `updated_at = now()` and return `'approved'`. The application computes the current hash;
  the database guarantees that a draft whose inputs changed can never become approved.
- Audit: `ai_drafts_audit after insert or update of status` with `app.audit_row()`.

### E. `red_flags` (new table, in `review.ts`)

Columns: `id uuid pk`, `tenant_id`, `client_id` (same FKs as `ai_drafts`), `source text not null` (CHECK in
`('message','checkin','meal_note')`), `source_id uuid not null`, `category text not null` (CHECK in
`('pain_injury','eating_disorder','pregnancy','medication','other')`), `matched text not null` (CHECK length 1 to
200), `status text not null default 'open'` (CHECK in `('open','handled')`), `handled_by uuid`,
`handled_at timestamptz`, `created_at timestamptz not null default now()`. Unique
`(tenant_id, source, source_id, category)` so one source raises one flag per category. Index
`(tenant_id, status, created_at desc)`.

- RLS: tenant guard; staff with `ACCESS(client_id)` may select and update. No insert policy, no delete policy, no
  client policy.
- Guard: everything immutable except `status`, `handled_by`, `handled_at`; `transitions` on status with edge
  `open->handled` only; `on_transition` stamps `handled_by: uid`, `handled_at: now` for `handled`.
- Insert only through `app.raise_red_flag(p_source text, p_source_id uuid, p_category text, p_matched text)
  returns uuid`, `security definer`, granted to `dawlyy_rls`. It derives `tenant_id` from `app.tenant_id()` and
  `client_id` from the source row, and refuses (`42501`) unless the source row exists in the caller's tenant and
  the caller wrote it or may see it: for `message`, a row of `public.messages` in a conversation of that client
  whose sender is the caller, or the caller is staff with access to the client; for `checkin`, a
  `public.form_submissions` row of that client; for `meal_note`, a `public.meal_logs` row of that client. Read the
  real column names of those tables in the schema files (do not guess). A client can only raise flags on their own
  rows. On a duplicate it returns the existing id (`on conflict ... do nothing` then select). Validate
  `p_source` and `p_category` (`22023`).
- Audit: `red_flags_audit after insert or update of status` with `app.audit_row()`.

### F. Privileges

Follow the 0006 privileges block for comparable tables: `revoke all` on the two new tables from `public`, `anon`,
`authenticated`; grant `select, insert, update` on `ai_drafts` and `select, update` on `red_flags` to `dawlyy_rls`;
grant the service role what 0006 grants it on comparable tables. Grant the new columns nothing special (table
grants cover them). Every new function: `revoke all ... from public`, then `grant execute ... to dawlyy_rls` for
`void_entry`, `approve_ai_draft`, `raise_red_flag`. Trigger functions get no execute grant.

## The suite: `packages/db/test/security.reinvent.test.ts`

Use the existing fixtures and helpers (two tenants, owner, staff with limited permissions and assigned scope,
clients). Build any extra rows through the service helpers the other suites use. Cover at least, each as its own
`it`:

1. Tenant isolation: an actor of tenant A cannot select, update or archive tenant B's rows on each of the six
   archive tables, cannot void B's rows, cannot read or update B's `ai_drafts` and `red_flags`.
2. Archive: owner archives and restores a client, a program, a nutrition plan, a form, a package and a tenant
   exercise; `archived_by` is stamped and cleared; a client cannot archive their own client row; staff without the
   module `edit` permission cannot; staff with it can; `archived_by` cannot be written directly; a system exercise
   cannot be archived; an `audit_log` row exists for each archive and restore.
3. Calendar: cancelling stamps `cancelled_by`; it cannot be written directly; audit row present.
4. Void and correct, per table (meal_logs, metric_entries, measurement_sets, workout_sessions): the owning client
   voids its own row within 7 days; cannot void another client's row (same tenant); cannot void a row older than
   7 days (make it old with a service update of `created_at`); staff without `nutrition edit` / `tracking edit`
   cannot; staff with it can, but only for an accessible client; a voided row refuses every runtime update and
   delete; the void columns cannot be set directly on insert or update; for `meal_logs` and `measurement_sets`, a
   correction insert voids the old row with `void_reason = 'corrected'` in the same statement, a second correction
   of the same row fails, a correction pointing at another client's row fails, a client correction of a row older
   than 7 days fails and leaves no new row, and a service-transaction correction works; for `metric_entries`, a
   `correction_of` insert still leaves the original unchanged; the set logs of a voided workout session are
   unchanged; an audit row exists for each void.
5. `ai_drafts`: a client cannot select it (zero rows) or insert; staff outside their assigned scope cannot see it
   or approve it; `approve_ai_draft` with the matching hash approves and stamps; with a different hash it returns
   `stale` and the row is `stale`; a direct runtime `update ... set status = 'approved'` (and `'stale'`) is refused
   for owner and staff; a stale, rejected or approved draft cannot be approved again or have its body edited;
   `input_hash`, `approved_by` and `approved_at` cannot be written directly; staff without `checkins review` cannot
   approve; audit rows exist.
6. `red_flags`: a client cannot select it; `raise_red_flag` from the client on their own message works and returns
   the same id on a repeat; on a source id that is not theirs it fails; staff marks a flag handled and it stamps;
   handled cannot go back to open; nobody can delete; audit rows exist.
7. `client_modules`: the default is all seven true; the CHECK refuses an unknown key and a non-boolean value; a
   client and a staff member cannot update it; the owner can.

Assert on the Postgres error code and, where the guard sets it, the `detail` (as the other suites do). Do not mock
the database.

## Acceptance (checks you can do by reading)

- Every new table has RLS enabled and forced the way 0006 does it, a tenant guard, the policies above and no
  others, a guard trigger, an audit trigger and the grants above; the Drizzle schema declares the same columns,
  indexes, foreign keys, checks and policies (so a later `drizzle-kit generate` would see no drift on them).
- Every function and trigger in 0008 is created after the objects it reads; trigger names follow the
  `<table>_<NN>_<purpose>` pattern; nothing mentions `anon` or `authenticated` except revokes.
- The `calendar_events_50_guard` JSON differs from 0006's only by the `cancelled_by` additions.
- `security.catalog.test.ts` and `matrix.ts` expectations hold for the new objects.

## Your answer

List: the files written; the 0008 outline (statement count per section A to F); every exported TypeScript name with
its signature; each place where this brief did not fit the real schema or the existing suites and what you did
(take the reading safer for tenant and client isolation); any existing guard config or test you expect to break
because of the new archive or void rules, with the reason; anything you could not do.
