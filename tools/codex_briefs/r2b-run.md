# R2B in turbo mode: run notes for `r2b-client-corrections-quicklog.md`

Use collaboration.spawn_agent to give each file group to its own sub-agent, then integrate, run every acceptance check yourself, and report per group. Sub-agents stay inside the brief's file list.

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r2b` (branch `wt/r2b`, from `main` after R0, R1a, R1c, R1d, R4a, R4c, R1b, R2a, R3a and R3b were merged (R2b imports the merged R3a undo hook)). It is your whole repository for this job. Do not write anywhere else, and
do not commit.

The brief is below. Its "Errata" section, if any, overrides the text above it. Notes:

1. Hot-spot files never change directly: `apps/web/src/api/index.ts`, `apps/web/i18n/request.ts`, every file under
   `apps/web/messages/` that the brief does not list as yours, `apps/web/src/components/shell/nav-items.ts`,
   `packages/core/src/index.ts` and every `package.json`. Write each change they need as an exact patch (file,
   anchor line, lines to add) to `tools/codex_briefs/integration/r2b.md`. Claude applies it at merge.
2. R1b is merged: `GET /api/v1/inbox`, the coach shell (`apps/web/src/components/shell/`), `/coach/library` and
   `/coach/money` hubs with their link lists in `apps/web/src/components/shell/hub-links.ts`, and the
   `nav-reachability.test.ts` that every new static coach page must satisfy (add the link to the patch file if the
   hub or menu list must change).
3. `GET /api/v1/me` is identity-only; preferences, numerals and client modules come from `GET /api/v1/me/app`.
4. A new staff-only router must carry the fail-closed `requireStaffRole` marker (see `apps/web/src/api/red-flags.ts`)
   or C15 treats it as client-facing. Client-facing reads select `clientColumns` maps. Never change a scanner,
   guard or existing test assertion.
5. Postgres returns `timestamptz` and `date` as text inside raw `sql` fragments; convert before comparing.

Checks you may run yourself, one at a time: `pnpm --filter @dawlyy/web exec tsc --noEmit -p tsconfig.json`, and
vitest only on your new non-DB test files. DB-backed tests and e2e specs: write them, Claude runs them. Never run a
dev server, a build, Playwright or the database suites.

---

# Batch R2b: client corrections, deferred undo and two-tap quick logging

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, R2b:

> Edit or remove a meal log, a measurement or a junk workout within 7 days, through the correction endpoints from
> R0a.
> Each action shows an undo toast for about 6 seconds.
> Quick log: the planned meal as eaten, the same as yesterday, or a recent food. Each is 2 taps at most.

R0c supplies those endpoints. R3a supplies the **one shared** undo hook and toast; this task imports them.
R0a/R0b/R0c, R1b, R2a and R3a must be merged with their integration patches before this builder starts.
Read those briefs, the plan's Hard limits, `apps/web/AGENTS.md` including "Astryx in DAWLYY", and the actual
nutrition/tracking/workout code below. Do not recreate endpoints, module gates, audit helpers or offline queues.

All Hard limits bind: no paid APIs or hosted LLM calls, meal-photo estimation, payment void/correct, deletion
or rewriting of old history, weakened guards/RLS/tests, credentials, account actions or dependencies. No
`withServiceTx`. Server reads use existing authenticated helpers and `clientColumns`; UI never authorizes a write.
The own-worktree acceptance commands below override `_common_web.md`'s older command ban and component-test
exclusion; its broad file permissions do not apply. Claude integrates and commits; the builder never commits.

## Files the builder may write

Modify exactly:

- `apps/web/components/nutrition/client-nutrition.tsx`
- `apps/web/components/nutrition/client-log.tsx`
- `apps/web/components/nutrition/client-history.tsx`
- `apps/web/components/nutrition/types.ts`
- `apps/web/components/tracking/tracking-screen.tsx`
- `apps/web/components/tracking/progress-panel.tsx`
- `apps/web/components/tracking/contracts.ts`
- `apps/web/components/client-portal/history-view.tsx`
- `apps/web/app/[locale]/app/nutrition/log/page.tsx`

Create exactly:

- `apps/web/components/client-corrections/entry-actions.tsx`
- `apps/web/components/client-corrections/meal-editor.tsx`
- `apps/web/components/client-corrections/measurement-editor.tsx`
- `apps/web/components/client-quick-log/quick-log.tsx`
- `apps/web/src/lib/client-corrections/types.ts`
- `apps/web/src/lib/client-corrections/eligibility.ts`
- `apps/web/src/lib/client-corrections/transport.ts`
- `apps/web/src/lib/client-corrections/quick-log.ts`
- `apps/web/src/lib/client-corrections/correction-actions.ts`
- `apps/web/src/lib/client-corrections/eligibility.test.ts`
- `apps/web/src/lib/client-corrections/transport.test.ts`
- `apps/web/src/lib/client-corrections/quick-log.test.ts`
- `apps/web/src/lib/client-corrections/correction-actions.test.ts`
- `apps/web/src/lib/client-corrections/components.test.ts`
- `apps/web/messages/ar/clientCorrections.json`
- `apps/web/messages/en/clientCorrections.json`
- `apps/web/messages/ar/quickLog.json`
- `apps/web/messages/en/quickLog.json`
- `apps/web/e2e/beta/r2b-corrections-quicklog.spec.ts`
- `tools/codex_briefs/integration/r2b.md`

Nothing else. Existing API/server/core files, navigation, token files, all existing message catalogs and the
R2a Today files are read-only. In particular do not write `src/api/index.ts`, `shell/nav-items.ts`,
`packages/core/src/index.ts`, `packages/core/package.json`, `i18n/request.ts` or shared undo files. Put exact
integration diffs in the one task-owned Markdown artifact; Claude applies them, not this builder.
Messages actually use independent ar/en namespace files: own only `clientCorrections` and `quickLog`.

## Interfaces consumed

R0c mutations use same-origin authentication and `{error:{code,message,details?}}` failures. Send a stable
`Idempotency-Key` per intended mutation; reuse it and the same body/UUID on transport retry.

| Method and full path | Body | Success |
|---|---|---|
| `POST /api/v1/meal-logs/{id}/correct` | `MealWrite` below, a fresh `clientUuid` | 201, new row including `replacesId=id` |
| `POST /api/v1/measurements/{id}/correct` | `MeasurementWrite` below, a fresh `clientUuid` | 201, new row including `replacesId=id` |
| `POST /api/v1/meal-logs/{id}/void` | `{reason?:string}` (max 500), send `{}` if absent | 200 `{id,voidedAt}` |
| `POST /api/v1/measurements/{id}/void` | same | 200 `{id,voidedAt}` |
| `POST /api/v1/metrics/{id}/void` | same | 200 `{id,voidedAt}` |
| `POST /api/v1/workout-sessions/{id}/void` | same | 200 `{id,voidedAt}` |
| `POST /api/v1/meal-logs` | `MealWrite`, a new UUID for a new meal | 200, saved row |

```ts
type MealWrite = {
  clientUuid: string; localDate: string; mealId?: string; optionId?: string;
  status: 'eaten' | 'skipped' | 'partial';
  freeEntry?: { text: string; macros?: Macros }; note?: string; clientUpdatedAt: string;
}; // strict mealLogSchema: mealId or freeEntry required; no clientId/foodId/replacesId accepted
type MeasurementWrite = {
  clientId?: string; localDate: string; clientUuid: string; clientUpdatedAt: string;
  values: Array<{type:string;value:number;unit:'cm'|'in';side?:'left'|'right'}>;
}; // 1..50 distinct type/side pairs, positive value <=10000, strict measurementInput
```

Use create-route schemas read-only from `src/server/nutrition/schemas.ts` and `tracking/contracts.ts` as the
contract; do not import server-only implementation into client bundles. Meal free text is 1..4000 trimmed
characters, note max 4000, UUIDs valid, localDate ISO and clientUpdatedAt an offset ISO timestamp.
Meal/measurement corrections insert a new row and atomically void their original; old rows are immutable.
Scalar metric corrections keep their existing `POST /api/v1/metrics` with `correctionOf` contract: do not invent
`/metrics/{id}/correct`. Junk workouts have void only: never replace/delete their sets or add workout edit.

403 `void_not_allowed` intentionally does not disclose ownership, permission or time-window cause. Render one
generic translated refusal; do not guess. Double void returns 409 `already_voided`; correction conflicts return
409 `already_corrected`; a missing correction reference is 404 `not_found`; invalid planned IDs can return
422 `meal_unknown`. Refresh authoritative history after a conflict. `403 module_disabled` refreshes
`GET /api/v1/me/app` and the route, clears pending UI and never retries through an unrestricted path.

R0c bootstrap is `GET /api/v1/me/app` →
`{preferences,numerals,clientModules?:ClientModules}` (`GET /api/v1/me` itself stays identity-only, `{userId,tenantId,membershipId,role,clientId?}`; two suites pin it.)
`ClientModules` keys are workouts, nutrition, checkins, progress_photos, measurements, messages, payments.
Use R2a's client module context; nutrition actions disappear when nutrition is off, workout actions when workouts
is off, metric/measurement actions when measurements is off. A combined progress screen must independently hide
photo and measurement sections; preserve R2a's module decisions. Staff permissions remain enforced by R0c.

History reads are existing `GET /api/v1/meal-logs?date=YYYY-MM-DD&limit=50&cursor=`,
`/measurements?from=&to=&limit=50&cursor=`, `/metrics?from=&to=&limit=50&cursor=` and
`/workout-sessions?limit=50&cursor=`; keep their keyset `{items,nextCursor}` shapes. Meal envelope also carries
`localDate`, supplements and `waterMl`. Server timestamps serialize to ISO strings. R0c includes `voidedAt`,
and `replacesId` for meals/measurement sets; keep these fields in the UI types instead of dropping them.
Rows' `createdAt` controls the window, never backdated `localDate` or clientUpdatedAt. Workout's present portable
mapper drops createdAt: the precise integration patch below adds it without altering an endpoint's behavior.

Quick log reads `GET /api/v1/nutrition/me` → existing `ClientNutrition` projection with the current published
document/foods/localDate/timezone, and the date-scoped meal history above. No client access to the coach foods
list: `/api/v1/foods/by-ids?ids=...` resolves only foods in the caller's current published plan and returns
`{items}`. Do not expand its visibility to support shortcuts. A missing/expired plan leaves free-entry/history
available according to existing server access rules; it does not authorize a private plan read.

R1b's staff-only `GET /api/v1/inbox?limit=50` →
`{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}` is not called by client
UI. Corrections affect its next ordinary read; do not reimplement ranking or edit Inbox files.
Read-only core helpers: `addDays(date:IsoDate,days:number):IsoDate` for yesterday/recent dates;
`itemMacros(food:FoodLike,item:MealItem):{macros:Macros;grams:number;approx:boolean}` for an actual saved portion;
`localize(text:LocalizedText|null|undefined,locale:Locale):string`. Import their existing subpath exports.
No new core export is needed.

## Interfaces produced and shared undo consumption

Export `MealHistoryRow`/`MeasurementHistoryRow` from this task's types.ts with existing public fields plus
`createdAt:string|null`, `voidedAt:string|null` and `replacesId:string|null`. Unknown timestamps are null, never
manufactured from localDate. Extend the existing `DailyLogs`, `MetricRow` and `MeasurementRow` public UI types
to retain these fields; measurements retain original `values` as well as their derived `deltas`.

Export `EntryActions({kind,id,createdAt,voidedAt,onEdit?,onChanged})`, where kind is
`'meal'|'measurement'|'metric'|'workout'`, onEdit is optional and onChanged is `() => void`.
Export `ClientQuickLog({localDate,plan,recent,onLogged?})`, with plan `ClientNutrition|null`, recent
`readonly MealHistoryRow[]`, and onLogged `() => void`. Export `buildQuickLogChoices(...)` as a pure helper
whose inputs are those props plus locale; each result has a stable key, translated label parameters and an
exact `MealWrite` factory receiving a new UUID/timestamp. No fetch, clock or UUID allocation inside that helper.

Import `useUndoableAction`, `UndoableAction<T>` and `UndoResult<T>` from R3a's
`apps/web/src/hooks/use-undoable-action.ts`. Its fixed public API is:

```ts
useUndoableAction(): {
  run<T>(action: UndoableAction<T>): Promise<UndoResult<T>>;
  undo(): Promise<void>; flush(): Promise<void>; state: UndoState | null;
}
// Use this branch of UndoableAction<T>:
// {mode:'deferred';label:string;commit:()=>Promise<T>;rollback?:never;
//  onCommitted?:(value:T)=>void;onUndone?:()=>void;onError?:(error:unknown)=>void}
// UndoResult<T> is {status:'committed';value:T}|{status:'undone'}|{status:'failed';error:unknown}.
```

Save/remove changes only the optimistic local display, then calls `run` in deferred mode. The shared store
shows its single toast immediately and calls commit exactly once after **6000 ms** or explicit flush. Undo
before expiry restores the captured view and makes **zero mutation requests**. Do not call a server correction
first and then try to restore it: R0c has no unvoid endpoint. Never update void flags, resurrect a UUID, implement
a private timer/toast, or mount another UndoToast. Quick-log creation itself uses stable idempotency and clear
feedback; existing correction/void actions always use the shared hook.

The store flushes the prior pending action before a replacement, survives SPA unmount, and cancels an uncommitted
deferred action on full pagehide without a last-second request. Respect those R3a semantics. Components must not
set state after unmount; refresh on next mount/foreground. A deferred network failure restores the captured UI,
keeps the user's edit for retry and refreshes history. Retrying a possibly committed mutation uses its original
UUID/key, not a second correction. After success show saved state from the returned new row; do not promise Undo
after the window has closed. All original rows remain visible as voided history with a replacement link.

## Build behavior

1. Add Edit/Remove in meal history and measurement history and Remove junk session in workout history/detail.
   Scalar history may offer Remove through its existing void route; leave its correctionOf editor intact.
   Only nonvoided own rows are candidates. `eligibility.ts` takes createdAt, now and voidedAt explicitly: use the
   7×24-hour createdAt window as a UI hint, test its boundary against 0008, and let the server decide at commit.
   For absent/invalid timestamps show a clear unavailable action, never claim an old row is editable. Server 403
   is still possible if the window expires during the toast. Remove requests include an optional reason, max 500.
2. Edit opens an Astryx dialog with the existing values. Meal choices refer to the current published plan; if
   the historic planned meal no longer exists, allow an explicitly labelled free-entry replacement using the
   client's edited text, or cancel. Never quietly substitute a different meal. Save makes a NEW UUID and one
   correction call; original createdAt and content stay unchanged. Measurement correction preserves every
   unedited type/side value, rejects duplicate pairs and zero/invalid values, and replaces the set atomically.
3. Remove the existing meal-status path that reuses a saved log's UUID to overwrite history: first logging may
   use `/meal-logs`, but changing an existing saved status/option uses deferred `/correct`. Unsent entries in
   the existing offline queue are not server history: do not correct a row that has no server id. Keep queued
   status visible and direct the user to sync first. Corrections/voids require connectivity and never enter an
   unbounded offline queue whose delayed retry could cross the seven-day limit.
4. Exclude voided/pending-removed rows from current eaten statuses, local totals, latest weigh-in and charts.
   Preserve them in history with translated Voided/Replaced text and a link to the replacement when known.
   A voided workout detail keeps its set logs readable; its summary must not read as current counted progress.
   Do not add a generic delete path for payments, photos or other data while touching these screens.
5. The quick-log page presents rows, not tiles. From Today, tap Quick log, then tap a concrete labelled row to
   save: at most two taps for planned-as-eaten, yesterday's meal or a recent food. All labels state what and
   which portion will be logged. No extra mandatory dialog for these shortcuts; free-text entry stays available
   as the existing alternative. Disable double submit and show per-row saving/saved/error state.
6. Fetch yesterday and at most the previous seven local dates through existing date-scoped reads (first 50 rows
   per date; follow cursors only on explicit More). State that visible shortcuts use those loaded recent rows.
   Exclude voided/superseded records. Yesterday's planned entry is offered only if meal/option still exists in
   the current plan; free entries reuse their actual text/macros with a new date/UUID. A recent-food row comes
   from a food and portion actually referenced by a loaded planned log that still resolves in the current plan.
   Log it as `freeEntry:{text,macros?}` computed from the known portion, never an invented top-level foodId.
   Do not infer a food or macros from free text, estimate from a photo, or silently reuse a removed option.
7. Change nutrition/log/page to load existing authenticated context and optional current plan/history using
   read-only services and serialize public dates. Keep its present free-entry route usable when no shortcuts
   exist. Existing loading.tsx remains untouched; the component has explicit empty/loading/retry states.

## Exact integration patch artifact

Write complete unified diffs in `tools/codex_briefs/integration/r2b.md`, with real merged-base context, imports
and props. The builder does not apply them:

- In `apps/web/i18n/request.ts` immediately after each `clientToday` loader add the corresponding
  `clientCorrections: () => import('../messages/ar/clientCorrections.json'),` and
  `quickLog: () => import('../messages/ar/quickLog.json'),`; use `../messages/en/` in the en loader.
- In R2a's `components/client-today/today-view.tsx`, use the `quickLog` namespace for one navigation button to
  `/app/nutrition/log` immediately after the planned meal rows and before check-ins, only when nutrition is on.
  Include the actual Astryx Button import and precise JSX in the diff. In preview mode render the same control
  inert, with no live navigation. Do not change ClientTodayModel or its shared preview signature.
- In `apps/web/src/server/workout/contracts.ts` add `createdAt: string` to `PortalSession` after `clientUuid`.
  In `apps/web/src/server/workout/read.ts`'s existing `sessionProjection` return object add
  `createdAt: row.createdAt.toISOString(),` immediately after `clientUuid: row.clientUuid,`. The selected public
  workoutHistoryColumns already includes clientColumns.workoutSessions.createdAt: no new DB read/policy or
  endpoint is required. Update any exact fixture typing affected only in a further explicit patch, never weaken
  assertions or change runtime business rules. This supplies the real window timestamp omitted by the mapper.

All other shared files are read-only. Report any missing visual token for R5's sole token owner, with semantic
name and affected component, without creating a private token or editing globals.css.

## UI rules

Carry the complete Astryx in DAWLYY rules: pinned 0.7.11 per-component imports, client children where needed,
existing frames/provider/RTL/fonts, Astryx Heading/Text and VStack/HStack/layout, dense data as rows, badges
only for counts. No new shadcn, raw layout div/span, inline style, arbitrary value, CSS override or Tailwind
bridge. Read installed templates/component source instead of running CLI commands outside the allowance.
All visual values come from `apps/web/app/globals.css` and the existing DAWLYY theme, read-only until R5.
Copy is next-intl in the two owned namespace pairs, equal ar/en keys, plain Egyptian Arabic, translated units.
Arabic RTL and English LTR must wrap long food names/reasons without horizontal overflow at 360, 390 and 430 px.
Every target is at least 44 px; dialogs preserve keyboard focus and announce validation. Dates use active locale
and saved numbering system. Numbers use R0b's `formatNumber(value,{locale,numerals,maximumFractionDigits?})`,
`formatKcal`, `formatMacro`, and `numeralPolicy` from `src/lib/numbers.ts`; default latn even in ar.
Every list/dialog has loading, settled-empty, disabled, failure/retry and success states. Skeletons are transient
only. Browser/375/1440 Astryx proof and doctor are P9 integration obligations, not builder commands.

## Tests and acceptance the builder runs

Write the five new tests listed above; existing Vitest discovers only src/**/*.test.ts in a Node environment.
Use fake transport, deterministic timestamps/UUIDs and fake timers where useful. For component tests use
React.createElement plus react-dom/server renderToStaticMarkup with next-intl/Astryx/navigation context mocks;
no jsdom/testing-library, dependencies or config edits. Test real output and client-visible behavior:

- eligibility: at/inside/outside 7-day threshold matching 0008, invalid/missing/future timestamps, voided rows;
  localDate cannot extend the window. 403 remains a generic refusal, and a late expiry restores optimistic UI.
- transport: exact correction/void/create bodies and paths, keys stable on retry, fresh UUID for replacement,
  error envelope mapping, module_disabled refresh without retry, no invented unvoid or direct old-row update.
- quick-log: each shortcut produces a valid MealWrite with current localDate/new UUID; voided history omitted;
  removed meal/option unavailable; portion/macros use core; absent plan/recent data yields useful empty state;
  no guessed free-text foods, duplicate click or cross-client cache use. Test two-action entry sequence.
- correction-actions: every saved edit/remove delegates mode deferred to R3a run; before commit transport has
  zero calls, Undo restores the captured display, expiry commit makes one correct request, replacement action
  flushes the first, retries preserve identity, failures preserve edited form data. Combine the actual shared
  store where its exported testable API permits; do not duplicate its timer implementation in production.
- components: ar/en, both numeral preferences, settled empty/error views, accessible named Edit/Remove/Save,
  hidden module actions absent, void/replacement history retained, numeric totals omit voided rows. Verify
  queued unsaved rows cannot be corrected and settled markup has no aria-busy skeleton.

Run sequentially from a pre-provisioned own git worktree with node_modules installed:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/lib/client-corrections/eligibility.test.ts src/lib/client-corrections/transport.test.ts src/lib/client-corrections/quick-log.test.ts src/lib/client-corrections/correction-actions.test.ts src/lib/client-corrections/components.test.ts
```

Expected: both exit 0, typecheck has no errors, exactly those five new files pass with no skipped tests, no
network/database. One Vitest process at a time. Never run lint, Astryx CLI, full suites, Next dev/build/start,
pnpm dev, Playwright or database suites. Report unapplied integration/type gaps; do not edit outside ownership.

Write `e2e/beta/r2b-corrections-quicklog.spec.ts` for P9 only, with separately tagged @ar/@en cases. Seed an own
meal within the window; edit it, save, see the shared Undo toast, click Undo before 6000 ms, then reload and
assert original content/history and zero correction requests. A second case waits for expiry and proves one new
row replaces the voided original, counts exclude the original, and duplicate retry cannot create another row.
Add planned/yesterday/recent-food shortcuts with <=2 actions and the old-row refusal. Reuse read-only beta
helpers; existing e2e-ar/en discovery requires no config edit. Do not run this spec now. R0a/R0c already own
database guard/window/isolation tests; P9 reruns them and validates the mapper addition and module gates.

## The answer wanted

Files written; exact imports/interfaces consumed; payload/idempotency and six-second deferred-undo decisions;
how existing queued writes differ from saved history; quick-log recency/portion choices; integration diffs and
createdAt projection gap; permitted commands and actual results; P9 evidence still owed; decisions taken and
anything wrong in this brief. Do not claim unrun browser/database proof or paste whole files.

## Errata (Claude, 14 Nov, checked against main after R0c; these override the text above)

- A missing or foreign correction original returns 403 `void_not_allowed` (`server/nutrition/logs.ts` `correctMeal`, `server/tracking/entries.ts` `correctMeasurements`), not 404 `not_found`. Test and handle 403.
- There is no `workoutHistoryColumns`. The workout list selects `clientColumns.workoutSessions` (`server/workout/read.ts`), which already has `createdAt`.
