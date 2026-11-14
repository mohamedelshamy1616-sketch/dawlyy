# Brief vs main endpoint audit (read-only, 2026-11-14)

Checked: r2a, r2b, r2c, r3a, r3b, r4b, r4d, r5 against apps/web/src/api/*.ts, src/server/**, packages/core, packages/db.
Everything not listed below matched (archive/unarchive pairs, void/correct paths and bodies, red-flags, client-modules, overrides, revert/versions, packages archived=1/true semantics, numbers.ts signatures, core exports).

## Mismatches (fix the brief)

1. r2a line 105: meal-logs read uses `limit=200`.
   Code: `listQuerySchema` caps limit at 100; 200 returns 400 validation_error (apps/web/src/api/lib/pagination.ts:~36, used by listMealLogs server/nutrition/logs.ts:65).
   Fix: change `limit=200` to `limit=100` and keep following `nextCursor`.

2. r2b lines 101-102: "a missing correction reference is 404 `not_found`".
   Code: both correct paths return 403 `void_not_allowed` when the original row is missing or foreign (server/nutrition/logs.ts:78 correctMeal; server/tracking/entries.ts:78 correctMeasurements). 404 only comes from a 23503 race or an empty RETURNING.
   Fix: say "a missing or foreign original returns 403 `void_not_allowed` (404 only on a rare FK race)"; drop the 404 expectation from tests.

3. r2b line 229: "selected public `workoutHistoryColumns` already includes createdAt".
   Code: no symbol `workoutHistoryColumns` exists anywhere. The list query selects `clientColumns.workoutSessions` (server/workout/read.ts:~97), and that map does include `createdAt` (packages/db/src/client-columns.ts:462). `sessionProjection` (read.ts:24) takes `Omit<workoutSessions.$inferSelect,...>` so `row.createdAt` is available.
   Fix: replace `workoutHistoryColumns` with `clientColumns.workoutSessions`. The anchor "after `clientUuid: row.clientUuid,`" is still correct (it follows `voidedAt:` and `id:` on the same line).

4. r4d line 51: forbids editing `apps/web/src/env.ts`.
   Code: that path does not exist; the env module is `apps/web/src/lib/env.ts`.
   Fix: change the path to `apps/web/src/lib/env.ts`.

## Wording that could mislead a builder (low severity)

5. r2a lines 149-150: "tenant-local today from `tenantToday(tx, auth.tenantId)`".
   Actual return is `{ today, timezone }` (server/subscriptions/client-read.ts:10), not a string. Fix: "`(await tenantToday(...)).today`".

6. r3a lines 92-93 (and its forms row): archive/restore of forms requires `forms edit` for every form kind.
   Code: `setLibraryArchived` (server/archive.ts:~11) calls `requirePermission(auth, entity, 'edit')` with entity `forms` even for checkin/assessment forms, whereas r3b (and server/forms/read.ts formModule) uses `checkins`/`assessments` for those. A UI grant derived from formModule would show Archive to a staff member the server then 403s.
   Fix: state that archive/restore of any form kind is gated by `forms edit`, and the row control must use that grant.

7. r3a line 85-86 "Both mutation calls ... are idempotent" and "return the updated row": true, with one nuance. Clients unarchive sets status `inactive` (not the previous status) and archive sets status `archived` (server/clients/service.ts:141-150). Undo of a client archive therefore does not restore the prior status (e.g. active). Fix: add a note that client restore always lands on `inactive`.

8. r4b step 7/8: `app.approve_ai_draft` raises P0001 for a non-draft row and 42501 for no access (0008 migration:324-345); only a hash mismatch returns the text `'stale'`. The brief's 409s for approved/rejected/stale are route-level pre-checks; the builder must map P0001 and 42501 itself (to 409 / 403). Fix: add this sentence.

## Verified OK (spot list)
POST /meal-logs 200 + Idempotency-Key; POST /workout-sessions 200 (requireActiveAccess); /me/today, /me/program, /nutrition/me, /foods/by-ids shapes; PortalToday type; getToday/resolveProgramDay signatures; void body strict `{reason?<=500}` -> `{id,voidedAt}`; module gate order (403 module_disabled precedes body validation on meal-logs); programs/nutrition/forms revert bodies and 2000/4000 caps; calendar cancel/restore, state=cancelled; assign body defaults and 409 client_has_program; listProgramAssignmentClients `{items,nextCursor}`; formModule/requireFormPermission; audit_log columns and owner/staff RLS; red-flags GET/handle; sendMessage/openConversation/notifyMessage/putNutritionDraft signatures; core weekReview/canonicalReviewInput/applyNutritionChange/detectRedFlags/rankAttention/isAllowed/localize/ClientModules/resolveClientModules/entitlementId/localDateOf/addDays/itemMacros; numbers.ts (formatNumber/Kcal/Macro/Nutrient, numeralPolicy, numberLocale); settings page anchors (`legalPages`, `t`, `isAllowed`); i18n `legal` loader anchors.

## Could not verify
- `GET /api/v1/inbox` (max 200, response shape): not on main; produced by R1b (r2a/r2c/r3a/r3b/r4b/r4d/r5 all cite it).
- `useUndoableAction`, `UndoToast`, `ArchiveRowControl`, `ClientTodayModel`, `ClientModuleProvider`, `getClientDestinations`: produced by R3a/R2a, not on main.
- r4b: that `app.guard_row` on ai_drafts lets the definer function move draft -> approved/stale (guard edges list only draft->rejected, 0008:322); assumed bypassed for definer functions, not traced.
- r2a: `app.team_directory()` columns (user_id, role, display_name) verified in 0006:1685; grant to dawlyy_rls verified. Messages `senderUserId` match to directory not traced.
- r2c: `getClient(tx,auth,id)` returning name/timezone not read in detail.
- r3b: that 0008 registers audit action codes for archive/restore/cancel/restore (not read).
