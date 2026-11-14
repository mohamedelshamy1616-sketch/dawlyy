# R2A in turbo mode: run notes for `r2a-client-nav-today.md`

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r2a` (branch `wt/r2a`, from `main` after R0, R1a,
R1c, R1d, R4a, R4c and R1b were merged). It is your whole repository for this job. Do not write anywhere else, and
do not commit.

The brief is below. Its "Errata" section, if any, overrides the text above it. Notes:

1. Hot-spot files never change directly: `apps/web/src/api/index.ts`, `apps/web/i18n/request.ts`, every file under
   `apps/web/messages/` that the brief does not list as yours, `apps/web/src/components/shell/nav-items.ts`,
   `packages/core/src/index.ts` and every `package.json`. Write each change they need as an exact patch (file,
   anchor line, lines to add) to `tools/codex_briefs/integration/r2a.md`. Claude applies it at merge.
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

# Batch R2a: client navigation and Today

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R2, R2a:

> Client tabs: Today, Plan, Coach and Me.
> Today has one lead card ("today's session" with Start, 1 tap to start). Below it come meals as rows with a
> one-tap "ate it" (logs the planned meal), then the check-in when due. No tiles.
> Every module honours `client_modules`. A hidden module disappears from tabs, Today and Me. The API refuses its
> writes with 403 `module_disabled`.

The Coach destination contains the existing conversation plus coach identity and the available response promise.
Me contains progress, history, check-ins, subscription and notifications. Preserve every existing deep link.

Read the plan's Hard limits, `apps/web/AGENTS.md` (including "Astryx in DAWLYY"),
`tools/codex_briefs/r0c-app-controls.md`, `r1b-inbox-nav.md`, `r0b-ui-fixes.md`, and `_common_web.md`.
This brief overrides the older common brief's command ban, absence of component tests, and broad file permissions:
the exact allowlist and acceptance commands below govern. Work in your own git worktree with `node_modules`
already installed. Do not commit, push, add dependencies, edit another task's files, or change configuration.

Hard limits: no paid API or hosted LLM call on client data; no meal-photo estimation; no payment void/correct;
no destructive rewrite of history; no weakening guards, RLS or tests. R0c already owns server module gates and
archive/void/correction endpoints. Consume them; do not implement them again. Every client-facing table read uses
`clientColumns`, authenticated transactions and existing entitlement checks. No `withServiceTx`.

## Files you may write

Modify exactly:

- `apps/web/components/app/client-tab-bar.tsx`
- `apps/web/app/[locale]/app/layout.tsx`
- `apps/web/app/[locale]/app/today/page.tsx`
- `apps/web/app/[locale]/app/today/loading.tsx`

Create exactly:

- `apps/web/app/[locale]/app/plan/page.tsx`
- `apps/web/app/[locale]/app/plan/loading.tsx`
- `apps/web/app/[locale]/app/coach/page.tsx`
- `apps/web/app/[locale]/app/coach/loading.tsx`
- `apps/web/app/[locale]/app/me/page.tsx`
- `apps/web/app/[locale]/app/me/loading.tsx`
- `apps/web/components/client-today/types.ts`
- `apps/web/components/client-today/view-model.ts`
- `apps/web/components/client-today/today-view.tsx`
- `apps/web/components/client-today/today-actions.tsx`
- `apps/web/components/client-today/client-module-provider.tsx`
- `apps/web/components/client-today/client-destinations.ts`
- `apps/web/components/client-today/client-hubs.tsx`
- `apps/web/src/server/client-today/page-data.ts`
- `apps/web/src/server/client-today/coach.ts`
- `apps/web/src/components/client-today/view-model.test.ts`
- `apps/web/src/components/client-today/navigation.test.ts`
- `apps/web/src/components/client-today/components.test.ts`
- `apps/web/src/components/client-today/actions.test.ts`
- `apps/web/messages/ar/clientToday.json`
- `apps/web/messages/en/clientToday.json`
- `apps/web/e2e/beta/r2a-client-start.spec.ts`
- `tools/codex_briefs/integration/r2a.md`

Nothing else. The existing `apps/web/app/[locale]/app/page.tsx` redirects to `/app/today`; keep that route.
Do not touch nutrition/history/tracking UI, coach lists, review cards, shared undo code or the R2c composer.
Treat `apps/web/src/api/index.ts`, `apps/web/src/components/shell/nav-items.ts`,
`packages/core/src/index.ts`, `packages/core/package.json`, all existing message namespace files,
`apps/web/i18n/request.ts`, `apps/web/app/[locale]/layout.tsx`, and
`apps/web/src/components/shell/client-shell.tsx` as read-only integration points. R1b owns the shell folder;
write the complete client-shell change described below only in integration/r2a.md for Claude to apply.

## Interfaces consumed

### R0c bootstrap and module resolution

- `GET /api/v1/me/app` has no request body and returns
  `{preferences,numerals:'latn'|'arab',clientModules?:ClientModules}` (`GET /api/v1/me` itself stays identity-only, `{userId,tenantId,membershipId,role,clientId?}`; two suites pin it.)
  For a client, `clientModules` is already resolved against tenant defaults and current overrides.
  The response is private/no-store. Require a valid client bootstrap before showing module content; an unknown
  or failed bootstrap must show translated loading/error with Retry, never a settled all-on flash.
- `getClientModules(tx: Tx, auth: AuthContext, clientId: string): Promise<ClientModules>` from
  `src/server/client-modules.ts` is the equivalent server bootstrap. Use it after `requirePage()` and inside
  `withAuthTx`. Do not call the staff-only `/settings/client-modules` from the client portal.
- Core exports from `@dawlyy/core/types`:
  `ClientModules` is a strict Zod object and its inferred type;
  `CLIENT_MODULES` is `['workouts','nutrition','checkins','progress_photos','measurements','messages','payments']`;
  `DEFAULT_CLIENT_MODULES` has all seven true;
  `resolveClientModules(tenant: ClientModules, override?: Partial<Record<ClientModule,boolean>>): ClientModules`.
  Defaults mean missing stored settings, not permission to treat a failed read as all-on.
- Existing module writes return `403 {error:{code:'module_disabled',message:string}}` when the module was
  disabled after initial render. Clear local busy state, show translated feedback and refresh the authenticated
  module bootstrap; do not retry automatically as an unrestricted write.

### Existing Today, workouts and meals

- `GET /api/v1/me/today?date=YYYY-MM-DD` returns `PortalToday` from
  `src/server/workout/contracts.ts`:
  `{date,workout:{state:'none'|'planned'|'active'|'done'|'rest',sessionId?,name?,dayLabel?,exerciseCount?},
  meals:{planName?,kcalTarget?,link:true}|null,checkins:[{eventId,title,dueAt,state}],intakePending,
  unreadMessages,subscription:{state,daysLeft?}}`.
  Server equivalent: `getToday(tx: Tx, auth: AuthContext, requestedDate?: string): Promise<PortalToday>`.
- `GET /api/v1/nutrition/me` returns the client's published nutrition snapshot, including
  `{head,version,foods,localDate,timezone,dayType,meals,targets,totals}`. Server equivalent:
  `myNutrition(tx: Tx, auth: AuthContext)`, whose serialized subset is `ClientNutrition` in
  `components/nutrition/types.ts`. It can return `head:null, version:null`.
- `GET /api/v1/meal-logs?date=YYYY-MM-DD&limit=200&cursor=...` returns
  `{items,nextCursor,activeCount,supplements,water,waterMl,localDate}`. Consume `voidedAt` and `replacesId` from
  the R0c rows: voided history rows never make a meal look eaten. Follow pagination before deciding a meal has
  no active log. Server equivalent: `listMealLogs(tx,auth,{date,limit?,cursor?})` from nutrition/logs.ts.
- `POST /api/v1/meal-logs` takes the strict create body
  `{clientUuid:uuid,localDate:YYYY-MM-DD,mealId?:string,optionId?:string,
  status:'eaten'|'skipped'|'partial',freeEntry?:{text:string,macros?:Macros},note?:string,
  clientUpdatedAt:ISODateTime}`. R2a sends the planned-meal subset, with `status:'eaten'`, actual selected option
  or first option, a stable action UUID, and `Idempotency-Key` using that UUID. Current create returns 200 with
  the row. No server-generated id, client id, plan version or tenant id in the body.
- Start from Today through `/app/workout/start`, which already resolves the target and automatically creates
  and caches the session. Continue an active session through `/app/workout/{sessionId}`. There must be no
  second confirmation tap. Existing `POST /api/v1/workout-sessions` takes
  `{clientUuid:uuid,programId:uuid,programVersionId:uuid,dayId:string,workoutId:string,
  localDate:YYYY-MM-DD,timezone:IANAZone}` and returns `SessionDetail`, including `session.id`.
  Reuse the existing StartWorkout/outbox behavior; do not add a second session-start mutation.
- Existing `GET /api/v1/me/program` returns `PortalProgram|null`; `/app/program` remains the full program view.
  `resolveProgramDay(document: ProgramDocument,startDate:string|undefined,today:string,
  completedDayIds:readonly string[])` is the existing pure server helper returning
  `{state:'none'|'rest'|'planned',day?,phaseId?,weekId?,weekIndex}`. Do not copy its scheduling logic into the UI.

R1b produces `GET /api/v1/inbox?limit=50` for staff, returning
`{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}`.
R2a does not call it from a client screen. Preserve its coach shell and routes; the client Coach tab must not
link to the staff Inbox or use staff data. R0c archive/restore/void/correct APIs are not called by this task.

### Coach identity and known gaps

`clientThreadPageData(auth: AuthContext): Promise<ThreadData|null>` already feeds `Thread` and returns only
the client's conversation header and messages. It does not return a coach profile. In the new coach.ts use
`tx.execute(sql\`select user_id, role, display_name from app.team_directory()\`)` inside `withAuthTx` to read
the existing approved public directory (security design §7.10.2); never widen `memberships` policy or select
private staff columns. Match the latest visible owner/staff message's `senderUserId` to this directory; when
there is no staff message and exactly one directory entry, that known coach can be shown. For multiple possible
coaches show the directory's actual public names as a team, not an invented assignment.

`getBusiness(tx,auth): Promise<BusinessView>` from settings/client-read.ts exposes business name and settings.
`settings.checkinReviewTurnaroundHours` is a check-in review promise: label it as such, never a chat response SLA.
For a real chat promise, `GET /api/v1/subscriptions/mine` returns
`{subscription,accessStatus}`; `subscription.packageSnapshot.entitlements` contains optional
`{key:'chat',enabled,turnaroundHours}`. In coach.ts use `mySubscription(tx,auth)` to choose the same own
subscription, then read only its own non-revoked clientEntitlementOverrides via `clientColumns`, global or
matching that subscription, ordered createdAt/id ascending. Use
`resolveEntitlements(packageEntitlements:PackageEntitlements,overrides:EntitlementOverride[],
opts?:{today?:IsoDate}):EffectiveEntitlement[]` from `@dawlyy/core/entitlements`, passing the tenant-local
today from `tenantToday(tx,auth.tenantId)`. Show `turnaroundHours` only for the enabled effective chat entitlement.
Do not call staff-only getSubscription. There is no stored public coach portrait; the effective chat promise
can also be absent. Render a named initials avatar (with translated accessible label) and a translated
"reply time not set" state when those are absent;
do not pass a business logo off as a portrait, use stock people, add a new profile setting, or bypass RLS. Report
the missing portrait source and any absent effective chat promise in the answer for Claude's decision.
Keep the rest of Coach functional.

## Interfaces produced

R2c must use the same pure Today view for its local preview. Export from client-today/types.ts:

```ts
export type ClientTodayModel = {
  date: string;
  locale: 'ar' | 'en';
  numerals: 'latn' | 'arab';
  modules: ClientModules;
  workout: PortalToday['workout'] | null;
  meals: Array<{
    id: string; name: LocalizedText; optionId: string | null;
    status: 'eaten' | 'partial' | 'skipped' | null;
  }>;
  checkins: PortalToday['checkins'];
  intakePending: boolean;
};
export type TodayLog = {
  mealId: string | null; optionId: string | null; status: string;
  voidedAt: string | null;
};
```

Export `buildClientTodayModel(input: {today: PortalToday; nutrition: ClientNutrition|null;
logs: readonly TodayLog[]; modules: ClientModules; locale:'ar'|'en'; numerals:'latn'|'arab'}): ClientTodayModel`
from view-model.ts. Pure, no fetch, DB, request context, clock or mutation; honor disabled modules in the
result itself. The adapter must explicitly normalize R0c row dates and missing nullable fields.

Export `ClientTodayView(props: {model:ClientTodayModel;preview?:boolean;
onLogMeal?:(mealId:string,optionId:string)=>void;busyMealId?:string|null}): React.JSX.Element`
from today-view.tsx. It uses next-intl for labels and the shared number formatter. With `preview:true`, all
navigation and mutation controls are inert, retain their visual arrangement, and are clearly labelled preview.
R2c supplies a synthetic `ClientTodayModel` and locally resolved switches; the view never fetches on mount.

Export `CLIENT_TABS` and `getClientDestinations(modules:ClientModules)` from client-destinations.ts for the
single tab component and its reachability tests. Today and Me stay; Plan is present only if workouts or nutrition
are on; Coach is present only when messages are on. Inside Plan independently hide disabled workout/nutrition
sections. Me independently hides measurements, progress photos, check-ins and payments/subscription entry points.
Keep notifications, locale, account/logout and permitted intake/assessment routes reachable. Workout history
belongs to workouts; nutrition history belongs to nutrition. A combined progress/tracking destination must not
expose a disabled photos or measurements section merely because another tracking module remains on.

`ClientModuleProvider`/`useClientModules` carry the validated resolved switches and numeral preference into
navigation/hubs. Initial props come from the authenticated server bootstrap. Refresh on return to foreground
and on module_disabled with `GET /api/v1/me/app`, retaining the last validated state while fetching. On an identity
change clear it; never cache cross-account settings in a shared storage key.

## Build steps

1. Establish the actual mount before editing. Today `app/[locale]/app/layout.tsx` mounts `ClientShell`, whose
   mobile bar is `NavLinks area="client"`. `components/app/client-tab-bar.tsx` has no imports elsewhere and is
   unmounted. Replace its stale seven-tab array with the authoritative `CLIENT_TABS`, mount that component from
   ClientShell for phone and desktop layouts, and remove the shell's two old client NavLinks mounts. There is
   exactly one client navigation implementation and one visible bar/rail at each breakpoint. Do not retain an
   alternate mounted tab bar. Preserve the existing auth gate, foreground outbox, sync status and safe-area inset.
   The ClientShell import/mount/removal changes are an exact integration/r2a.md patch against R1b's merged shell,
   applied by Claude after R1b; do not edit client-shell.tsx in this worktree. Keep app/layout.tsx compatible
   with its existing children-only signature, passing resolved modules through ClientModuleProvider.
2. Adapt app/layout's authenticated child boundary so the shell receives resolved modules before module links
   become visible. Keep streaming loading inside Suspense; do not promote request data into a cached layout.
   Read the installed Next.js App Router guide before changing layout or pages; `params` is a Promise.
3. Create Plan, Coach and Me as hubs over existing routes and components. Under Plan use published program and
   nutrition only. Under Coach reuse Thread and the safe coach data above. Me uses rows, not equal tile cards.
   A directly visited disabled-module destination from these hubs shows a translated unavailable state; existing
   direct routes remain server-authorized and R0c continues to block writes. No new read-security promise is made.
4. Replace the Today tile hierarchy with one workout lead card when workouts are enabled, planned meal rows when
   nutrition is enabled, then due check-ins when checkins is enabled. Done links to session history; rest and no
   plan states have useful copy. Do not invent a session on a rest day. Additional intake information is a compact
   row. Subscription warnings appear only with payments enabled. No hidden module leaves an empty placeholder.
5. One-tap ate-it logs a previously unlogged planned meal. Reuse an active choice where relevant; do not mutate an
   existing eaten/skipped/partial history record to implement a correction. For an existing active log show its
   status and link to R2b's history correction flow. A double click or transport retry reuses the same UUID and
   cannot create a second log. Wait for success before calling a row settled; failure keeps the prior state with
   Retry. Reuse existing nutrition transport where compatible, without editing it or adding offline assumptions.
6. Write integration/r2a.md as exact additions with anchors, not prose requesting another builder to guess. The
   namespace loader patch adds
   `clientToday: () => import('../messages/ar/clientToday.json'),` in `loaders.ar` and the corresponding `en`
   import in `loaders.en`, next to the current client loader. List any exact nav-items compatibility change
   separately; do not edit that hot spot. Include the full client-shell.tsx import and mount diff from step 1,
   preserving R1b's merged frame; Claude applies it only after R1b. No app/api/index or core barrel/package patch is needed. Claude applies
   patches serially before testing the integrated tree. The legacy CLIENT_NAV becomes compatibility metadata
   only; all mounted client navigation must use this task's exported destination model.

## UI rules

Carry the complete "Astryx in DAWLYY" rule from `apps/web/AGENTS.md`: Astryx 0.7.11 imports per component;
reuse existing screen frames and template structure; use client components for Astryx; `Heading`/`Text` for type;
layout via `VStack`, `HStack`, `Layout`, `AppShell`; no new shadcn, raw div/span, inline styles, arbitrary values,
`:root` Astryx palette overrides, or tailwind-theme.css import. Theme/provider wiring is already done.
Product copy lives in `clientToday` in both locales, with identical keys and Egyptian Arabic copy.

Use token-backed component props and utilities only. Every visual value comes from the existing
`apps/web/app/globals.css` token source/Astryx theme; these files remain read-only until R5 consolidates tokens.
If a needed token is absent, name the proposed token and exact declaration in integration/r2a.md for R5; do not
hardcode it. Minimum 44 px touch targets, logical spacing, safe-area bottom padding, keyboard focus and correct
aria-current. No horizontal overflow at 360, 390 or 430 px in `/ar` RTL or `/en` LTR; long names and Arabic labels
wrap. Preserve shared font and brand definitions.

All numbers use `src/lib/numbers.ts`: `formatNumber`, `formatMacro`, `formatKcal`, `numeralPolicy`, `numberLocale`.
Read numerals from bootstrap/preferences, default latn; no competing Intl.NumberFormat. Dates use the locale with
the chosen numberingSystem. Render a loading state, empty state, unavailable-module state and retryable error
for each hub. Skeleton is temporary only: a settled page must contain content, an explicit empty state or error.
The AGENTS 375/1440 px Astryx render proof and doctor check are integration/P9 obligations, not extra builder
commands under this brief's restricted acceptance allowance.

## Tests and acceptance checks the builder runs

Write tests only in the four new src/components/client-today/*.test.ts files listed above. Existing Vitest uses
node and includes only src/**/*.test.ts; no testing-library/jsdom is installed. Component tests use React
createElement and react-dom/server renderToStaticMarkup with controlled next-intl/navigation/Astryx mocks as
needed; exercise the real component output rather than reimplementing its logic in the test. Do not change
Vitest config or add dependencies.

- view-model: each of seven modules off; all off; default all on after valid stored defaults; voided logs do not
  count as eaten; active log chosen deterministically; empty plans and rest/done/active workouts; input immutable.
- navigation: exactly Today/Plan/Coach/Me when all on; no disabled-module targets; legacy routes mapped to the
  intended active tab; test the single tab component here and assert one mounted navigation source in P9 after
  Claude applies the client-shell integration patch; missing identity never flashes all modules.
- components: ar/en, long Arabic labels, accessible links and touch-target classes; workout lead card before meal
  rows before due check-in; empty/loading/error states; preview disables real actions; number preference reaches
  the shared formatter; hidden-module content absent from markup; safe coach initials/unset promise.
- actions: double submit/retry same UUID; correct planned-meal payload; failed writes preserve prior state;
  403 module_disabled requests a module refresh and does not retry the rejected write; existing workout start
  deep link requires one tap and continues the same active session. Mock transport: no test network or database.

Run these exact commands sequentially in the worktree root:

```powershell
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/components/client-today/view-model.test.ts src/components/client-today/navigation.test.ts src/components/client-today/components.test.ts src/components/client-today/actions.test.ts
```

Expected: typecheck exit 0; Vitest exit 0, four new files passing, no skipped tests, no network or database access.
Run one Vitest process at a time. Do not run lint, next dev, next build, pnpm dev, Playwright, DB suites, the full
web/core suite, or Astryx CLI checks. Claude runs integration gates. Report unrelated pre-existing type errors
without editing a file outside this allowlist.

Write, but do not run, `e2e/beta/r2a-client-start.spec.ts` for P9's
"client: start a workout in at most 2 actions". Use seeded authenticated client context and a published planned
day; from Today count the Start tap, wait through `/app/workout/start` into `/app/workout/{id}`, assert actual
live exercise/set content and one session, not a settled skeleton or transient redirect page. One tap is the
target; two is the maximum P9 gate. Repeat as separately tagged `@ar` and `@en` tests in the existing locale
projects; playwright.e2e.config.ts discovers e2e/beta and filters those tags, so no config patch is needed.
Add disabled-workouts
and long-name responsive assertions at 360/390/430 without owning R2c's module-toggle server flow. P9 alone
registers/runs this spec with e2e-ar/e2e-en and records 375/1440 Astryx proof.

## The answer wanted

Files written; the verified before/after navigation mount and legacy route map; exported Today view/model
signatures; exact payloads and module-gate handling; test commands/results; integration patch anchors; source
gaps for coach portrait and chat response promise; decisions taken and anything wrong in this brief. State
clearly that e2e/screens/DB checks were written or delegated to P9, not run by you.

## Errata (Claude, 14 Nov, checked against main after R0c; these override the text above)

- Meal-log list reads: `limit` is capped at 100 (`src/api/lib/pagination.ts`); `limit=200` is a 400. Use `limit=100` and follow `nextCursor`.
- `tenantToday(tx, tenantId)` returns `{ today, timezone }`; use `(await tenantToday(tx, auth.tenantId)).today`.
