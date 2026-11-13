# Batch R0c: the app layer of migration 0008 (archive, void and correct, client modules, numerals, red flags)

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R0 (R0a's app-layer consequences), R2a's module gate
(server half only), and R4c's server integration. Read its "Hard limits" section first.

R0a is done and in the working tree: read `packages/db/migrations/0008_reinvent_control.sql` in full (it is the
database truth for this batch), the schema files it changed (`packages/db/src/schema/{clients,programs,nutrition,
forms,packages,calendar,tracking,tenants,review}.ts`), `packages/core/src/types/client-modules.ts`, and
`packages/db/test/security.reinvent.test.ts` (shows exactly which writes the database allows and refuses).
Core modules you may use: `@dawlyy/core/safety` (`detectRedFlags`) and `@dawlyy/core/types`
(`ClientModules`, `resolveClientModules`, `DEFAULT_CLIENT_MODULES`, `CLIENT_MODULES`).

## Rules

Read `tools/codex_briefs/_common_web.md` and follow every rule in it, with these exceptions that this brief grants:
- you may edit `apps/web/src/api/index.ts`, but only to mount the new routers listed below;
- you may edit `packages/db/src/schema/tenants.ts`, but only to add `numerals?: 'latn' | 'arab'` to the
  `UserPreferences` type (no column, no migration);
- this batch has no UI: do not edit `apps/web/components/**`, `apps/web/app/**` or `apps/web/messages/**`.

The database is the authority. When the database refuses something (for example a client archiving, a void after 7
days, a direct `archived_by` write), do not work around it: map the refusal to the API error below and test it.
Never use `withServiceTx` in this batch. Archive, restore, void and approve audits are written by the 0008 triggers;
do not add `app.audit` calls for them.

## Files you may write

- `apps/web/src/server/**` (existing services and new files) and their `*.test.ts`.
- `apps/web/src/api/*.ts` routers and their `*.test.ts`; new routers `apps/web/src/api/red-flags.ts` and
  `apps/web/src/api/client-modules.ts` (or fold them into `settings.ts`, your choice; say which).
- `apps/web/src/api/index.ts` (mount only), `packages/db/src/schema/tenants.ts` (the one type line).

## What to build

### 1. Archive and restore, uniform across the library

Entities: clients, packages, programs, nutrition plans, forms, exercises (tenant-owned rows only).
- Each gets `POST /{id}/archive` and `POST /{id}/unarchive` (keep every existing route working: the clients pair
  exists, packages has archive only, forms archive through PATCH `archived`; keep the PATCH path and add the pair).
  Permission: `requirePermission(auth, <module>, 'edit')` with module `clients`, `packages`, `programs`,
  `nutrition`, `forms`, `exercises`. Both return the updated row (200). Archiving an archived row or restoring a
  live row is a no-op 200 (idempotent), not an error.
- A system exercise (`tenant_id` null) returns 422 `system_exercise_use_hide` and points the caller at the existing
  per-tenant hide.
- Clients keep their status rules (`setClientArchived` in `server/clients/service.ts`); only make it fit the new
  pair if it already does not.
- Every default list of these entities excludes archived rows. Each list accepts `archived=true` to return only
  archived rows (forms already do: make the others match, same query name, keyset pagination unchanged). Pickers
  that choose an entity for assignment (packages in client creation, programs and plans in assign flows) never
  offer archived rows.
- `calendar_events`: cancelling an event already exists through state `cancelled`; confirm the route returns the
  row with `cancelled_by` and that a cancelled event can be moved back to `scheduled` by staff with
  `calendar edit` (the trigger clears the stamps). Add tests; change code only if it does not work.

### 2. Void and correct (history-preserving)

Tables: `meal_logs`, `measurement_sets` (void and correct), `metric_entries` (void only; its correction path stays
`correction_of`), `workout_sessions` (void only; set logs stay attached).
- `POST /api/v1/meal-logs/{id}/void`, `/measurements/{id}/void`, `/metrics/{id}/void`,
  `/workout-sessions/{id}/void` with body `{ reason?: string (max 500) }` call
  `select app.void_entry('<table>', id, reason)` inside `withAuthTx`. Map SQLSTATE: `42501` -> 403
  `void_not_allowed` (covers another client's row, no permission and the 7-day window; the database does not say
  which, do not guess), `P0001` -> 409 `already_voided`. 200 returns `{ id, voidedAt }`.
- `POST /api/v1/meal-logs/{id}/correct` and `/measurements/{id}/correct` take the same body as the create route
  for that entity plus nothing else, insert the new row with `replaces_id = id` (one INSERT: the 0008 AFTER trigger
  voids the original in the same transaction) and return the new row (201). Map `42501` -> 403
  `void_not_allowed`, `23505` or `P0001` -> 409 `already_corrected`, `23503` -> 404 `not_found`.
- These routes mount `idempotentReplay` like the other mutating routes. Clients call them for their own rows; staff
  with `nutrition edit` (meal logs) or `tracking edit` (the others) for clients in their scope.
- Reads: every list and detail of these four tables returns `voidedAt` (and `replacesId` where the column exists),
  so history can show a voided row struck through. Every total, average, streak, adherence number, chart series,
  dashboard figure, timeline count and "last weigh-in" computed from them excludes voided rows. Grep every reader of
  `mealLogs`, `measurementSets`, `metricEntries` and `workoutSessions` under `apps/web/src/server/**` and decide each
  one; list them all in your answer with "excluded" or "shown as voided" (history lists show them; numbers never
  count them).
- Client-facing reads still go through `clientColumns`; if a `clientColumns` map lacks `voidedAt` or `replacesId`,
  select the extra column explicitly beside the map and report the gap (do not edit `packages/db`).

### 3. Client modules (server half)

- `GET /api/v1/settings/client-modules` (staff with `settings view`) returns the tenant's `client_modules`.
  `PUT` (owner only, the database enforces it; map its refusal to 403) validates the body with `ClientModules`
  (strict, all seven keys) and writes `business_settings.client_modules`.
- Per-client override: the existing client overrides mechanism (`EntitlementOverride` now has an optional
  `modules`, see `server/clients/*` and `server/subscriptions/*`). Make sure the existing override write path
  accepts and stores `modules` and the read path returns it; no new table.
- `getClientModules(tx, auth, clientId)` in `apps/web/src/server/client-modules.ts` returns
  `resolveClientModules(tenantModules, override?.modules)`.
- `requireClientModule(tx, auth, module)`: for a client caller, throws 403 `module_disabled` when the resolved
  module is off. Apply it to every client-side write of that module: workouts (workout session create, sync, patch,
  finish), nutrition (meal logs, supplements, water, corrections), checkins (submissions), progress_photos (photo
  upload), measurements (measurements and metrics writes), messages (client message send), payments (client
  payment proof or sale submission). Staff writes are not gated. Reads are not gated by the API in this batch (the UI
  hides them in R2a). Test one write per module, on and off.
- `GET /api/v1/me` (or the client bootstrap it already returns) includes the resolved `clientModules` for a client
  caller, so the UI can hide tabs.

### 4. Numerals preference

- `UserPreferences.numerals?: 'latn' | 'arab'` (the type line). `GET /api/v1/me` returns it; a
  `PUT /api/v1/me/preferences` (or the existing preferences write, if one exists: grep `userPreferences`) accepts
  `{ numerals }` and merges it into the caller's own `user_preferences` row (RLS: self only). Default absent means
  Western digits (`apps/web/src/lib/numbers.ts` `numeralPolicy` already reads it).

### 5. Red flags, server side (R4c integration)

- On every write of client free text, run `detectRedFlags(text)` and, for each match, call
  `select app.raise_red_flag(source, sourceId, category, matched)` in the same transaction, after the source row is
  inserted. Sources: a client's message in a client conversation (`message`), a check-in submission's free-text
  answers (`checkin`, joined text of the text-type answers), a meal log's `note` (`meal_note`). Truncate `matched` to
  200 characters. It never blocks or changes the write and never produces advice. If `raise_red_flag` raises, the
  write fails (it means the source is not the caller's: a bug, not a user error).
- `GET /api/v1/red-flags?status=open|handled&clientId=` (staff with `clients view`, keyset pagination, newest
  first) returns `{ id, clientId, source, sourceId, category, matched, status, handledBy, handledAt, createdAt }`.
  `POST /api/v1/red-flags/{id}/handle` (staff with `clients review` or `checkins review`) sets `status = 'handled'`
  (the trigger stamps who and when). Clients never reach either route (403).

## Tests

DB-backed route tests with `apps/web/src/test/api-harness.ts` for every new route and every changed list: archive and
restore per entity (owner, staff without the permission 403, client 403), archived filter, system exercise 422,
void and correct per table (own row, another client's row 403, older than 7 days 403 using a service-inserted row
with an old `created_at`, double void 409, voided row excluded from one total per table and present in its
history list), client modules (default all on, owner write, staff write 403, unknown key 400, per-client override,
one gated write per module on and off), numerals round trip, red flags (a pain message from a client creates one
open flag visible to staff, not to the client, handle stamps, repeat message on the same source does not duplicate).
Do not change an existing test's assertion; if a legacy test breaks because the database now refuses something, stop
and report it instead of editing the test.

## Answer

Files written; every new route with method, path, permission and error codes; the list of readers from section 2
with your decision for each; every gap in `clientColumns` or core you worked around; anything wrong in this brief.
