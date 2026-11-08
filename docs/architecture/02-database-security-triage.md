# Triage of the design review (binding decisions for revising 02-database-security-model.md)

Sources, all in this folder: `codex.md` (C1-C24), `claude-self-review.md` (S1-S11), `lens_<key>.json`
(PRIV-*, FL-*, ATK-*, and the lenses still to come). "Accept" means: apply the finding's own fix text from its
JSON file exactly, adjusted only to the real column names in `packages/db/src/schema/*.ts`. Where a decision
below differs from a finding's fix, the decision wins.

Decided 2026-11-07 20:30 by Claude (Opus 5.5). Mohamed's open product questions are taken at their stated
defaults (dashboard asks 2 and 6); the doc must say so in a short "Product defaults taken" list.

## T1 Erasure and tenant closure (FL-01, FL-02, C1, C19, S1)
- `protect_published_version` DELETE branch: FL-01's text (refuse unless `current_user <> 'dawlyy_rls'` and
  `current_setting('app.erasure', true) = 'on'`). Drop S1's `pg_trigger_depth()` idea.
- `withErasureTx` in client.ts (FL-01).
- `app.erase_client(p_tenant, p_client)` service-only (FL-02 text), plus `app.close_tenant(p_tenant)` the same way
  (erasure flag, delete audit_log/events/user-keyed rows of the tenant, then `delete from tenants`).
- `app.audit_row` uses cid = id for the `clients` table (C19).
- §12: the API deletes Storage objects under `<tenant>/clients/<client>/` and the auth user when the user has no other
  membership. Open legal question for counsel (Law 151/2020 vs tax retention of payment records): erasure deletes
  payments by default; if counsel requires retention, anonymise instead. Say this in §12.

## T2 Function privileges (PRIV-01, C2): accept PRIV-01 fixes 1-4.

## T3 Role membership (PRIV-02): accept. Also §11 staging note: if 0000's `grant authenticated to dawlyy_app` fails on
Supabase, guard it in a DO block; that is allowed because no deployed database has applied 0000 yet.

## T4 Audit and outbox forgery (PRIV-03, ATK-01, C4)
- New tables `app.audit_actions(action text primary key, entity text not null, roles text[] not null)` and
  `app.event_types(type text primary key, roles text[] not null)`, owned by postgres, no runtime privileges, seeded in
  0006 with the actions and event types the API needs (derive the list from the spec and core: publish of programs,
  nutrition plans and forms; payment verify, reject, refund; subscription extend, freeze, cancel; client erase;
  check-in submitted and reviewed; workout completed; message sent; and so on).
- `app.audit` and `app.emit_event`: unknown name or caller role not in `roles` -> 42501; tenant from the pin; client
  derived from the entity row through an allowlisted entity -> table map (drop `p_client_id`, C4); size caps from
  PRIV-03 (54000); `events.actor_role` recorded; the outbox processor ignores a type whose roles do not include the
  recorded actor role (§12).

## T5 Supabase leftovers (PRIV-04): accept. "Remove public from the exposed schemas" is a Supabase dashboard action that
needs Mohamed's yes: list it in §12 as a gated release step, not optional.

## T6 Counter gaps (PRIV-05): accept. Rule in §12: no ON CONFLICT or MERGE on payments or clients; dedupe by a select
first or by catching 23505 in a savepoint. Test P-xx from PRIV-05.

## T7 Owner equality, no FORCE RLS (PRIV-06): accept.

## T8 Timeouts (PRIV-07): in `withAuthTx` and `withUserTx` (not service): `set local statement_timeout = '15s'`,
`set local lock_timeout = '5s'`, `set local idle_in_transaction_session_timeout = '30s'`. No ALTER ROLE.

## T9 Cutover (PRIV-08): accept the §11 note.

## T10 Messages read state (FL-03, C14, S2, ATK-10)
- FL-03's `allowed` array. C14: preview recomputed on edit and delete; read markers stamped by the server (now()) and
  set once; new guard key `update_to` (unread counters may only be set to 0).
- S2: once `deleted_at` is set, the author can change nothing.
- ATK-10: new append-only table `message_revisions` (tenant_id, message_id, body, attachments, revised_at, revised_by),
  filled by a SECURITY DEFINER AFTER UPDATE trigger when body or attachments change; runtime SELECT only, with the same
  visibility as the message; no runtime INSERT, UPDATE or DELETE. Add it to §9, §5.2, §3.3, §8 and the M suite.

## T11 Self-edit (FL-04): accept, with only columns that exist in the schema.

## T12 Payments (FL-05, FL-09, C6, C20, S5, ATK-12 part)
- `subscription_id`: out of `editable_in`, into `set_once` (FL-05).
- `editable_in` becomes an array of rules (C6): main money columns only while the old state is pending;
  `refund_amount` only while the old state is verified; `rejected_reason` only while the old state is pending.
- Partial refunds stay `verified`; `refunded` means fully refunded (FL-09): CHECK
  `(state = 'refunded') = (refund_amount is not null and refund_amount = amount)`; `on_set` refund_amount ->
  refunded_at; `refund_amount` is cumulative and `monotonic` (C17's key, non-decreasing).
- CHECK `rejected_reason is null or state = 'rejected'`.
- S5: `notes` out of `client_update`; `notes: null` in `client_insert_eq`.
- C20: money CHECKs reject NaN.
- Staff transitions into verified, rejected or refunded need `app.has_perm('billing','verify')` (T20).

## T13 Owners and memberships (FL-06, FL-07, ATK-16): FL-06 trigger (runtime only) and FL-07 (no runtime DELETE on
memberships; remove staff = status 'disabled').

## T14 Library and templates (FL-08, ATK-05, ATK-17, C7, C8)
- FL-08: no runtime DELETE on exercises and foods; retire with `hidden` / `tenant_hidden_items`.
- Exercise thumbnails must be tenant assets (`client_id is null`, purpose in the demo/branding values that exist):
  trigger check in §7.6 (ATK-05, C7).
- `template_id` must point at a template (`kind = 'template'`, `client_id is null`): trigger check (C7, ATK-17).
- CHECK `client_id is not null or subscription_id is null` on the heads (C8; covers ATK-17's CHECK).

## T15 Media (FL-10, FL-11, ATK-02, C18, FL-19 media edge)
- FL-10 and FL-11: accept.
- One CHECK (ATK-02 + C18): `bucket in ('client-media','tenant-assets')`; `(client_id is null) = (bucket = 'tenant-assets')`;
  tenant assets under `<tenant>/assets/`, client media under `<tenant>/clients/<client>/`; no `.` or `..` segment; no
  backslash, `%` or control characters. Use the real bucket names if the schema or spec already fixes them.
- Document the extra `null -> uploaded` edge as the tenant-asset path (FL-19).

## T16 Push subscriptions (FL-12, ATK-08, S10)
- Unique `(tenant_id, endpoint)`; CHECK `endpoint ~ '^https://'`.
- `app.register_push(p_endpoint, p_keys, p_ua)` SECURITY DEFINER: deletes rows with that endpoint owned by other users
  (any tenant), then upserts the caller's row for the pinned tenant. Runtime gets EXECUTE; direct INSERT stays as the
  policy allows. §12: logout deletes the caller's rows; the API keeps a push-host allowlist.

## T17 Server time stamps (ATK-03, C13)
- Engine rule in `app.guard_row`: on a runtime INSERT, `created_at` and `updated_at` are set to now() when the table
  has them; no per-table config needed. `message_rules` stamps `created_at` on insert (messages have no guard).
- Client-claimed times stay in their own columns (performed_at, recorded_at, local_date and similar) and are not stamped.
- Catalog test C08b from ATK-03.

## T18 Provenance (ATK-04 supersedes S6): client inserts of metric_entries and inbody_records pin `source = 'manual'`
(and inbody `normalized` to its server default). Device and import paths are service or definer only.

## T19 Tasks, calendar, flags (ATK-06, FL-16, S3, S7, ATK-11)
- ATK-06: accept (tasks insert_eq source manual / source_event_id null / dedupe_key null; `client_id` immutable (S3);
  assignee must be an active owner or staff membership; task state edges from the enum; calendar insert_eq source
  manual and rule_key null for the runtime).
- FL-16: the `'null'` stamp token; reopening clears completion stamps (tasks, calendar_events, client_flags).
- client_flags: resolved_at/resolved_by are stamp-only (immutable to the runtime) and cleared on reopen (replaces S7);
  no runtime DELETE; audit trigger on client_flags (ATK-11).
- client_notes: update and delete only by the author or the owner (ATK-11 policy split).

## T20 Module permissions in the database (C16 and Mohamed's ask 2, default taken)
- New `app.has_perm(p_module text, p_action text) returns boolean`, SECURITY DEFINER, stable, search_path '': owner ->
  true; staff -> `permissions->'modules'->p_module` contains p_action or 'manage' (same rule as core `hasAction`);
  client or no pin -> false. EXECUTE to dawlyy_rls.
- New guard key `perm_transitions` `{"<to state>": ["<module>", "<action>"]}`, checked when `app.role() = 'staff'`, on
  UPDATE transitions and on INSERT states: versions entering `published` (programs/publish, nutrition/publish,
  forms/publish); payments entering verified, rejected or refunded (billing/verify); ai_requests entering approved
  (ai/publish).
- C16 resolved: draft -> published and insert-as-published are allowed for the owner and for staff with the publish
  permission. No owner-only shortcut in the database.
- Clients: the staff insert policy also needs `app.has_perm('clients','create')`. A SECURITY DEFINER AFTER INSERT trigger
  `clients_80_assign_creator` assigns the new client to the inserting staff membership when its client_scope is
  'assigned'. §12: for assigned-scope staff the API inserts without RETURNING and reads the row in the next statement.
- Everything else about module permissions stays in the API (`requirePermission`), as before.

## T21 ai_requests (ATK-07): state machine (insert only `draft`; draft -> approved and draft -> rejected, with the real
enum values); output and model editable only in draft; approval through T20's perm_transitions.

## T22 Versions and heads (C9, C10, C11, C15, FL-17, ATK-09, S8)
- C9: workout_sessions 4-column FK plus the `app.visible_refs()` trigger.
- C10: `published_version_id` maintained by a SECURITY DEFINER trigger on the versions tables and immutable to the
  runtime. `current_version_id` gets the head-qualified composite FK with `on delete set null (current_version_id)`
  (PG15+ column list; hand-edit it into the migration, because Drizzle cannot express it).
- FL-17 / ATK-09: archiving the published version clears `published_version_id` in the same transaction.
- C11: runtime head DELETE only when every version of the head is a draft.
- C15: `pg_advisory_xact_lock(hashtextextended(<head id>::text, 0))` in version_rules.
- S8: version audit triggers on INSERT, DELETE and UPDATE OF status, published_at, superseded_at only.

## T23 Subscriptions (FL-18, ATK-12 part)
- `price` and `currency` immutable (a correction is a new subscription).
- FL-18: cancel allowed from pending and suspended, in core (`packages/core/src/state/index.ts` + its tests) and in the
  DB edges. Insert states stay `pending` and `active`; document "created active when the payment is already verified"
  in a core comment.
- The subscription_events ledger stays staff-declared; audit_log is the record of changes (say so in §10).

## T24 metric_entries append-only (C5, ATK-13): runtime S I only; corrections insert a row with `correction_of`; retries
use ON CONFLICT DO NOTHING; test K says append-only.

## T25 Offline sync (FL-15, C17, ATK-14): FL-15's §12 rule; C17 `monotonic` key on client_updated_at; ATK-14 unique
indexes `(tenant_id, client_id, client_uuid)` (messages: `(tenant_id, sender_user_id, client_uuid)`), and the sync
ON CONFLICT targets follow them.

## T26 Fixtures (FL-14, S11): accept FL-14's §13 rewrite.

## T27 Doc and engine consistency (ATK-15): change the §6.1 stamp_update wording; C08 check that no column is both
stamp_update and immutable.

## T28 Machine drift (FL-19): payment machine in core; F02 generalised to publish, subscription, checkin, mediaReview and
payment. Check-ins submitted at `due_at` before the due processor ran: new `app.advance_due(p_id uuid)` SECURITY
DEFINER, which only flips scheduled -> due when `due_at <= now()` for a row the caller can see; the API calls it and
retries once on P0001.

## T29 Smaller accepted items
- S4: superseded by the PERF-01 addition below (that form did not parse); use PERF-01's ACCESS(c).
- S9 / C12: set_logs exercise FKs (single column, no action) with indexes.
- C3: can_access_client checks the client exists in the caller's tenant.
- C20: `lpad(n::text, greatest(6, length(n::text)), '0')`, and next_client_code in 0006 the same.
- C21 PowerShell env docs; C22 `test:db` script and CI db job (postgres:17 service); C23 `check_function_bodies = on`
  in 0003 and the dawlyy_test 0002 -> 0006 upgrade test; C24 catalog tests with `pg_has_role(..., 'MEMBER'/'USAGE')`,
  PG17 compatibility as a documented limitation covered by CI.

## Names fixed for every applier (use exactly these)
app.has_perm(p_module text, p_action text); guard keys perm_transitions, update_to, monotonic, editable_in (array form),
stamp token 'null'; app.sees_all_clients(); app.assigned_client_ids(); app.erase_client(p_tenant uuid, p_client uuid);
app.close_tenant(p_tenant uuid); withErasureTx(tenantId, reason, fn) in client.ts; setting app.erasure;
app.audit_actions; app.event_types; app.register_push(p_endpoint text, p_keys jsonb, p_ua text);
app.advance_due(p_id uuid); app.team_directory(); app.keep_one_owner() with trigger memberships_40_owner;
app.version_pointers() with triggers <versions table>_90_pointers; trigger clients_80_assign_creator
(function app.assign_creator()); table public.message_revisions with trigger messages_95_revision
(function app.message_revision()); app.visible_refs().

## Additions from lens_sqlexec (SQLX-*)
- SQLX-01 = T2. SQLX-02 = T1 (FL-01 text). SQLX-03: closed by C3 (can_access_client checks the tenant) and T4.
- SQLX-04 = T17, plus: `app.on_message_insert` sets the preview only when `c.last_message_at is null or
  new.created_at >= c.last_message_at`, and `last_message_at = greatest(coalesce(c.last_message_at, new.created_at), new.created_at)`.
- SQLX-05 = FL-08 (T14). SQLX-06: T24 stands (runtime S I only on metric_entries; no UPDATE at all).
- SQLX-07: accept. CHECK `status not in ('published','superseded') or published_at is not null` on the three version
  tables (§8.3); version_rules computes the newest published from status as well as published_at; service publishes set
  published_at and published_by explicitly (§12).
- SQLX-08 with S8: version audit triggers use `app.audit_row('document')` (strip argument) and fire on INSERT, DELETE and
  UPDATE OF status, published_at, superseded_at only.
- SQLX-09: closed by C14's `update_to` key (unread counters may only be set to 0) on conversations.
- SQLX-10 = FL-16 (T19).
- SQLX-11: accept. Media bytes, width, height, duration_sec, metadata, uploaded_at and deleted_at editable only while
  review_state is not approved/rejected (use SQLX-11's state list, checked against the real enum); plus the trigger that
  refuses soft-deleting a payment proof referenced by a payment that is not pending.
- SQLX-12 -> T30.
- The §11 grant on tenant_hidden_items must come after the table exists (0004); 0006 grants only.

## T30 Exact DDL for every trigger (SQLX-12)
§6.3 and §7 must give the literal `create trigger` statement for every trigger (names, timing, events, arguments,
argument order), and every SQL block meant for a migration ends each statement with `--> statement-breakpoint`. Use
SQLX-12's block as the base; check the argument order of version_rules, head_rules and protect_published_version against
the function bodies.

## Additions from lens_perf (PERF-*)
- PERF-01: accept, and it overrides S4's form in T29 (that form does not parse). `app.assigned_client_ids()` returns
  `setof uuid`, `rows 100`, `language sql stable security definer set search_path = ''`: the client ids assigned to the
  caller's staff membership, empty for every other caller. ACCESS(c) is
  `((select app.sees_all_clients()) or ${c} in (select app.assigned_client_ids()))`. No policy calls
  `app.can_access_client(<column>)`; that function stays only for single-value checks inside definer functions.
- PERF-02: accept. `app.accessible_user_ids()` (setof uuid, `rows 600`, PERF-02's body) replaces the per-row
  `app.can_access_user(user_id)` call in `consents_staff`: `T and STAFF and user_id in (select app.accessible_user_ids())`.
  can_access_user stays for single-value calls.
- PERF-03: accept. New §8.4 "Child-side indexes" with PERF-03's list, every column checked against
  `packages/db/src/schema/*.ts`; drop any index whose FK the triage removed and add one for every FK the triage adds
  (set_logs exercise FKs, message_revisions, version pointers).
- PERF-04 = SQLX-08 and S8 (strip argument, status-only audit on the version tables).
- PERF-05: accept. `app.set_logs_library_check()` (static, SECURITY DEFINER, plan-cached) on set_logs; the generic
  `app.library_ref_check` stays for exercises/foods `based_on_id` and the other low-volume tables.
- PERF-06: deferred. Not in this pass; §15 gets one line: "helper overhead is 70-108 us per statement; measure after the
  beta before inlining".
- PERF-07: accept (`audit_log_tenant_client_created_idx`, §9).
- PERF-08: accept (`push_subscriptions_tenant_user_idx`, `notification_deliveries_tenant_user_idx`, §9; check the
  columns in `packages/db/src/schema/messaging.ts`).

## Additions from lens_coverage (CV-*)
- CV-01: accept with T20, plus a new guard key `require_perm`: an object keyed by operation (`insert`, `update`,
  `delete`), each value `[module, action]`, checked with `app.has_perm` for `who = 'staff'` only (owners pass, clients
  follow their own keys). It covers the owner-controlled money and catalogue tables (spec line 42):
  payments `{"insert":["billing","create"],"update":["billing","edit"]}`;
  subscriptions `{"insert":["billing","create"],"update":["billing","edit"]}`;
  subscription_events `{"insert":["billing","edit"]}`;
  client_entitlement_overrides `{"insert":["billing","edit"],"update":["billing","edit"],"delete":["billing","edit"]}`;
  packages `{"insert":["packages","create"],"update":["packages","edit"],"delete":["packages","delete"]}`
  (packages.ts has no child tables).
  `perm_transitions` (T20) stays the key for state moves; CV-01's `perm_on` is the same idea and is not used.
  Every other module stays an API check (§12), now implementable: `AuthContext` gets
  `permissions: StaffPermissions | null`, `getAuthContext` fills it, and §12 names a thin `requirePermission` helper in
  apps/web over core `isAllowed`/`hasAction` (core exports no `requirePermission`). Tests: staff with billing view only
  cannot insert a payment; coach preset (billing without verify) cannot verify; business_manager can.
- CV-02 = T15 (T15's path layout `<tenant>/assets/...` and `<tenant>/clients/<client>/...` is binding; use CV-02's regex
  shape with `[.]` instead of a backslash).
- CV-03 = T2 and SQLX-01, plus catalog test C14: `pg_default_acl` holds a global (`defaclnamespace = 0`) entry for
  functions without PUBLIC execute, and `has_function_privilege('anon'|'authenticated'|'dawlyy_rls', oid, 'execute')` is
  false for every function in schemas app and public outside the §3.4 list.
- CV-04: metric_entries is T24 (no runtime UPDATE). workout_sessions: remove `summary` from `client_update`, add
  `"client_insert_eq":{"summary":null}`; the API computes `summary` from set_logs in a service transaction after the
  sync batch, and copies `planned_workout` from the program version itself, never from the request body (§12).
  §2 says `source` on tracking rows outside T18 is an unverified client claim.
- CV-05: accept with T12. payments `client_update` is `["proof_media_id","reference","paid_at"]`; `client_insert_eq`
  adds `"notes":null`. A client who typed a wrong amount submits a new pending payment. Staff `editable_in` unchanged.
- CV-06 = T14.
- CV-07: accept with T19 and T21. No runtime DELETE on client_flags or ai_requests (AI requests end in a rejected or
  cancelled state); §10 adds `<t>_audit` triggers on ai_requests, client_flags and media.
- CV-08 = T4 (the allow-list tables with roles replace CV-08's hard-coded list).
- CV-09: accept. packages/db exports a `clientColumns` map per table with the coach-internal columns left out
  (§12 list); client routes select only through it; test C15 scans apps/web/src/api client route files the same way C13
  does. §12 says this is the only control for column privacy.

Names added: app.assigned_client_ids() (setof uuid), app.accessible_user_ids(), app.set_logs_library_check(),
guard key require_perm, AuthContext.permissions, clientColumns.

## Drizzle constraints (D-*, salvaged from the drizzle lens, which died twice on the network; R2 re-checks the revised doc)
- D1: every constraint, index, policy, trigger and function name is at most 63 bytes. Postgres truncates longer names
  with only a NOTICE. The existing 64-byte FK `client_entitlement_overrides_subscription_id_subscriptions_id_fk` lives in
  the database as its 63-byte truncation; a DROP that uses the 64-byte name is truncated the same way and works. New
  catalog test C16: no name in the latest drizzle snapshot or in pg_constraint/pg_indexes/pg_policies/pg_trigger is
  longer than 63 bytes, except that one legacy FK until 0004 replaces it.
- D2: drizzle's migrator runs every pending migration in ONE transaction, and runs a migration only when its journal
  `when` is later than the newest applied one. So: no statement that cannot run inside a transaction block
  (`create index concurrently`, `vacuum`, `alter system`); no enum value used in the same run that adds it (the design
  adds none; new states on text columns use CHECK constraints); custom migrations come only from
  `drizzle-kit generate --custom`, and `_journal.json` is never edited by hand.
- D3: a column type change that drizzle-kit writes as `SET DATA TYPE` without `USING` is hand-edited (the doc's
  `tasks.source_event_id ... USING NULL::bigint` is the model). §11 lists every hand edit of a generated migration, so
  the integrator can re-apply it if the file is regenerated.
- D4: Drizzle cannot express `on delete set null (col)` column lists, trigger DDL or functions. Those go into a listed
  hand edit or into the custom migrations 0005/0006, and the Drizzle schema carries a one-line comment pointing at the
  migration that owns them. `drizzle-kit generate` after 0006 must report no schema changes.

## Additions from lens_tests (N-*)
Suite letters after this block (file `packages/db/test/security.<name>.test.ts`): C catalog, G guard (G20 matrix data
in `test/guard-matrix.ts`), I identity, T team, L library (client records and the exercise/food library), P payments,
D documents, M messaging, K tracking, E events (calendar, form submissions and check-ins, consents, AI requests,
personal rows, push), A audit, S matrix (N4), X machines (N6), N integrity (N7), Z escape (N9's suite, renamed from E
because E is the events suite).
- N1 = T2, SQLX-01 and CV-03, plus test C06b: no function in schema app or public (extension functions excluded) has a
  PUBLIC entry in `aclexplode(coalesce(proacl, acldefault('f', proowner)))`.
- N2: accept. Every raise in app.guard_row and in the section 7 trigger functions carries
  `detail = 'guard:<config key>'` (or `'rule:<function name>'` for section 7), plus `table` and `column` where one
  column is at fault. helpers.ts gets expectGuard(work, rule, column?), expectRls(work), expectPrivilege(work).
  Every rejection test is followed, in the same test, by the permitted variant for the same actor (positive control).
- N3: accept. helpers.ts gets expectNoEffect (zero rows with `returning`, row unchanged through the service), and §13
  gets the classification table: INSERT or new-row denial 42501 expectRls; UPDATE/DELETE of an invisible row 0 rows
  expectNoEffect; missing privilege 42501 expectPrivilege; guard 42501/P0001 with detail; invisible parent in a trigger
  lookup 23503. Each planned case says which class it is.
- N4: accept as suite S (`security.matrix.test.ts`, data in `test/matrix.ts`), with the S00 meta-test that every
  policy in pg_policy and every table of §3.3 is covered by at least one case.
- N5: accept as G20 (guard matrix per guarded table, column and role; expected allow lists typed by hand from §6.3).
- N6: accept as suite X; it replaces "F02 generalised" (T28). Machines: publish, subscription, checkin
  (form_submissions), mediaReview (media), payment, plus invitations and calendar_events where the core has a machine;
  otherwise the expected edges are typed from §6.3.
- N7: accept as suite N (FK contract by pg_get_constraintdef, unique indexes, CHECKs, behaviour cases).
- N8 = SQLX-03, C3 and T4; tests A04-A08 accepted.
- N9: accept as suite Z (ids Z01...), N9's cases E01-E07 renamed Z01-Z07.
- N10: accept the fixture additions (clientD in T2, the disabled client membership ubT2, the invitations, and the rows
  N10 lists), and the rule: a test that commits a change uses its own rows built by a factory, never a shared fixture
  row another test reads.
- N11: accept (probe table in schema `dawlyy_probe`, dropped in a finally).
- N12: accept (pin the SQLSTATEs N12 lists; stamped columns are asserted by value, not by an error).
- N13: covered by T22 (version_pointers keeps the head pointers; archiving clears them). Tests D10/D11 accepted; the
  deferred constraint trigger is not added.
- N14: accept tests P20-P25; remove config keys that can never fire (payments client_transitions); C08 flags a
  transitions key whose column no role may write.
- N15: accept tests T20-T26 (adjusted: no runtime DELETE on memberships, T13).
- N16: accept tests A10-A13.
- N17: accept C09's exact query, with the allowed cascade set recomputed from the revised §3.3 and §8.2 (exercises and
  foods are no longer runtime-deletable), and the delete behaviour cases.
- N18: accept, adjusted to T24: metric_entries UPDATE and DELETE by the runtime fail with expectPrivilege; corrections
  insert a row with correction_of. Consents (accessible_user_ids), every library-check call site, tenant_hidden_items
  and the §9 columns get cases.
- N19: accept every precision item.
- N20: accept in this form: any column only triggers or the service may write (conversations.last_message_at,
  last_message_preview, and every other trigger-owned column) is in that table's `immutable` list for the runtime;
  unread counters use `update_to` (0 only) for every runtime role, the owner included. §6.1 states that the owner is
  limited only by immutable, set_once, update_to, monotonic and the transition keys. Test M12 for the owner.
- N21: accept (I01 mechanics with closeDb and DAWLYY_DB_POOL_MAX read inside connect()).
- N22: accept as `scripts/db-migration-check.ps1` (C99), run in CI only.
