# R3B in turbo mode: run notes for `r3b-activity-log.md`

Use collaboration.spawn_agent to give each file group to its own sub-agent, then integrate, run every acceptance check yourself, and report per group. Sub-agents stay inside the brief's file list.

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r3b` (branch `wt/r3b`, from `main` after R0, R1a,
R1c, R1d, R4a, R4c and R1b were merged). It is your whole repository for this job. Do not write anywhere else, and
do not commit.

The brief is below. Its "Errata" section, if any, overrides the text above it. Notes:

1. Hot-spot files never change directly: `apps/web/src/api/index.ts`, `apps/web/i18n/request.ts`, every file under
   `apps/web/messages/` that the brief does not list as yours, `apps/web/src/components/shell/nav-items.ts`,
   `packages/core/src/index.ts` and every `package.json`. Write each change they need as an exact patch (file,
   anchor line, lines to add) to `tools/codex_briefs/integration/r3b.md`. Claude applies it at merge.
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

# Task R3b: a scoped activity log and links to immutable versions

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R3, R3b:

> `GET /api/v1/activity?clientId=&entity=` reads `audit_log` for the caller's scope.
> - A per-client log appears in the client hub Notes tab. A business-wide log appears under Settings.
> - Each row shows who, what, when, and a link to the item.
> - Program, nutrition and form versions keep their revert. Add a "revert" link from the log row to the version.

Read that plan's Hard limits and P9, `apps/web/AGENTS.md` including **Astryx in DAWLYY**, R0c/R1b/R4a,
`packages/db/src/schema/ops.ts`, the audit RLS in migration 0006, and the current version readers/revert
services. R0a/R0b/R0c/R1b/R1c must be integrated first. Do not depend on concurrent R3a/R2c/R4b work.

All Hard limits bind this task: no spending, hosted LLM call on client data, meal-photo estimation or payment
void/correct. Preserve Astryx, token ownership, immutable history, RLS, guards, audits and `clientColumns`.
Never weaken a test or policy. No dependency, schema, migration, credential, account, commit or push action.
R0c owns archive/restore/void/correct/module endpoints and audit creation; this task is a read-only audit
projection plus links into existing version operations. Do not create another audit or revert service.

This brief overrides older `_common_web.md` command/test restrictions only with the exact acceptance below.
The builder uses its own pre-provisioned git worktree with `node_modules` installed; Claude reviews and commits.

## Files the builder may write

Create exactly:

- `apps/web/src/server/activity/types.ts`
- `apps/web/src/server/activity/schemas.ts`
- `apps/web/src/server/activity/read.ts`
- `apps/web/src/server/activity/links.ts`
- `apps/web/src/server/activity/presentation.ts`
- `apps/web/src/server/activity/read.test.ts`
- `apps/web/src/server/activity/links.test.ts`
- `apps/web/src/server/activity/presentation.test.ts`
- `apps/web/src/server/activity/components.test.ts`
- `apps/web/src/api/activity.ts`
- `apps/web/src/api/activity.test.ts`
- `apps/web/src/api/activity.db.test.ts`
- `apps/web/components/activity/activity-log.tsx`
- `apps/web/components/activity/version-detail.tsx`
- `apps/web/app/[locale]/coach/settings/activity/page.tsx`
- `apps/web/app/[locale]/coach/settings/activity/loading.tsx`
- `apps/web/app/[locale]/coach/settings/activity/version/[kind]/[headId]/[versionNo]/page.tsx`
- `apps/web/app/[locale]/coach/settings/activity/version/[kind]/[headId]/[versionNo]/loading.tsx`
- `apps/web/messages/ar/activity.json`
- `apps/web/messages/en/activity.json`
- `apps/web/e2e/beta/r3b-activity-log.spec.ts`
- `packages/db/test/security.activity-api.test.ts`
- `tools/codex_briefs/integration/r3b.md`

Nothing else. Every existing file, including hub/settings pages, client-detail, version histories, shell files,
`src/api/index.ts`, `i18n/request.ts`, existing message namespace files, token sources, core barrels and package
manifests, is read-only. Use the existing `ClientDetail.activityLog?: React.ReactNode` slot; do not modify its
props or layout. Messages are independent `messages/ar/<namespace>.json` and `messages/en/<namespace>.json`;
own only `activity`. Exact integration patches belong in `integration/r3b.md` for Claude to apply serially.
DB-backed tests and the e2e spec are written now and run only in P9.

## Interfaces consumed

- Authenticated reads use `requirePage()` for pages, the existing API auth middleware and staff-role marker,
  `requirePermission(auth, 'clients', 'view')`, and `withAuthTx(auth, callback)`. Read their actual types from
  `src/server/auth.ts`/`db.ts`; never use `withServiceTx`, service credentials or an HTTP loopback.
- `auditLog` in `@dawlyy/db/schema` has `id` (Postgres bigint), `tenantId`, `actorUserId`, `actorRole`, `action`,
  `entity`, `entityId` (text), `clientId`, `before`, `after`, `reason`, `requestId`, `createdAt`. Its RLS grants
  the owner all tenant rows; staff only rows with a non-null accessible client. A staff caller with all-client
  scope still does not get tenant-template/null-client audit rows. Preserve this asymmetry and label the
  staff-wide view as their accessible activity; do not invent an audit permission or broaden policies.
- Core, read-only: `isAllowed(m: MembershipLike, module: Module, action: Action, opts?:
  {clientId?: string;assignedClientIds?: readonly string[]}): boolean` from `@dawlyy/core/authz`, and
  `localize(text: LocalizedText | undefined | null, locale: Locale): string` from `@dawlyy/core/types`.
  This task does not call `weekReview`, `rankAttention` or `detectRedFlags`, or produce a core export.
- R0b `src/lib/numbers.ts`: `formatNumber(value,{locale,numerals?,maximumFractionDigits?})`,
  `formatKcal(value,{locale,numerals?})`, `formatMacro(value,{locale,numerals?})`, and
  `numeralPolicy(preferences): 'latn'|'arab'`. Use its chosen policy for counts/version numbers; Arabic defaults
  to Western digits. Dates use the tenant timezone and the same explicit numeral policy, never server-zone math.
- R0c mutation paths already write their own audit rows: `POST /api/v1/{clients|programs|nutrition|forms|packages|
  exercises}/{id}/archive` and `/unarchive`, `POST /api/v1/calendar/{id}/cancel` and `/restore`, and existing
  void/correct paths. The log reads their results; it calls none of these mutations. It consumes no module
  configuration endpoint and creates none. Clients remain forbidden from the new activity API.
- R1b `GET /api/v1/inbox?limit=50` returns
  `{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}` for staff scope.
  This task does not modify, rerank or call it; Settings is reached through R1b's profile menu. Record its new
  static Settings activity route in R1b's actual exported reachability metadata through an integration patch.

Existing version operations, not new endpoints:

| Kind | Exact version read | Explicit revert mutation |
|---|---|---|
| program | `GET /api/v1/programs/{headId}/versions/{versionNo}` | `POST /api/v1/programs/{headId}/revert` |
| nutrition | `GET /api/v1/nutrition/{headId}/versions/{versionNo}` | `POST /api/v1/nutrition/{headId}/revert` |
| form | `GET /api/v1/forms/{headId}/versions/{versionNo}` | `POST /api/v1/forms/{headId}/revert` |

All three mutation bodies are strict `{toVersionNo:number,changeNote?:string}`, return 201 with existing service
results, and require the corresponding module `edit`; reads require its `view`. For forms use the real
`formModule(kind: string): 'forms'|'checkins'|'assessments'` and
`requireFormPermission(auth:AuthContext,kind:string,action:Action):void` from `server/forms/read.ts`:
checkin uses `checkins`, assessment uses `assessments`, and intake uses `forms`. Do not authorize every form
under `forms` alone. Use the real route schemas and
inferred responses, not a guessed common DTO. Each revert creates a fresh draft and never publishes it. Reuse
the current idempotency request convention, one key per intended action, retained on retry. No automatic revert
on navigation. Program and nutrition history pages already exist; form has a version API but no equivalent
history page in the current tree. The owned dynamic version page provides an exact-version destination for
all three without rewriting their existing builders or histories.

## Produced API and component contracts

Export task-local types and these interfaces; no package/barrel registration change:

```ts
type ActivityQuery = {clientId?:string;entity?:string;limit?:string;cursor?:string};
type ActivityItem = {
  id:string;createdAt:string;clientId:string|null;
  actor:{userId:string|null;displayName:string|null;role:string|null};
  action:string;entity:string;entityId:string|null;
  href:string|null;
  version:{kind:'program'|'nutrition'|'form';headId:string;versionNo:number;href:string;canRevert:boolean}|null;
};
type ActivityPage = {items:ActivityItem[];nextCursor:string|null};
listActivity(tx:Tx,auth:AuthContext,query:ActivityQuery):Promise<ActivityPage>;
ActivityLog(props:{clientId?:string;initial?:ActivityPage}):React.JSX.Element;
```

`GET /api/v1/activity?clientId={uuid}&entity={allowlisted-table}&limit=50&cursor={opaque}` has no body and
returns 200 `ActivityPage`, private/no-store. Missing auth: 401; client role or missing `clients view`: 403;
invalid/unknown query keys, malformed UUID/entity/cursor/limit: 400 using the standard error envelope.
Require staff-role and permission before queries. `limit` is an integer string from 1..100, default 50.
An explicit inaccessible/nonexistent client returns 404 after an RLS-scoped existence check, even if it has
no activity. A visible client with no audit rows returns an empty page. An archived accessible client retains
history access; do not require an active subscription or force an active-only client-list lookup.

For the business view, RLS continues to scope the result and each source entity's module `view` permission
further narrows it. Define one fixed entity registry mapping real audit table names to module, safe destination
and optional version resolver; never interpolate table names from a request. Include the actual audit producers
for clients, exercises, programs/versions, nutrition plans/versions, forms/versions/submissions, packages,
subscriptions/events/payments, calendar, meals, measurements/metrics/workouts, messages, AI drafts and red flags.
Use the matching existing read permission; AI review evidence also requires `checkins review`, and red-flag
metadata requires its existing staff read grant. Unknown entities are excluded until explicitly registered;
document every current producer excluded for lack of a safe supported projection. Unknown action codes on a
known visible entity render a localized generic “updated item” message, never raw untrusted copy.

SQL filters by tenant, optional client/entity, authorized entity set and descending `(created_at,id)` before
pagination. Fetch `limit+1` and create `nextCursor` from the last returned row only when another authorized
row exists. Cursor carries the exact timestamp plus decimal bigint id and filter identity; reject reuse with
different filters. It grants no authority: every page reapplies caller scope/RLS and permissions. Preserve
Postgres timestamp precision in the cursor and cast audit IDs to text in SQL; never round bigint IDs through
JavaScript numbers or order same-time rows lexicographically. Parameterize all SQL, including cursor values.
Equal-time pages cannot duplicate/skip rows; newer inserts do not shift later keyset pages.

Select only the DTO metadata. Never serialize `before`, `after`, raw `reason`, `requestId`, drafts, messages,
medical text, payment details, emails, tokens or deleted user records. Actor names may come only from existing
RLS-visible profile reads with an explicit safe projection; inaccessible/deleted actors use localized role or
system fallbacks. No service-role lookup to fill a name. Any internal use of safe version metadata from an audit
payload must validate only the needed identifier/number and must not expose the payload. Prefer joining the
version entity ID to its real RLS-visible version/head rows; do not trust a browser/audit JSON href or head ID.
Resolve actor/entity/version data in set-based batches, not one query per row.

Destination URLs are locale-relative allowlisted internal routes built from validated IDs. Use existing detail
routes when available, preserving access checks and archive/history semantics. For records lacking a surviving
detail route, keep the row with `href:null` and translated “item unavailable”; do not invent a working link,
drop history or issue a mutation. Version DTO links are
`/coach/settings/activity/version/{program|nutrition|form}/{headId}/{versionNo}`. Resolve actual version
table IDs to real head/version numbers; a missing/inaccessible version yields no version action. `canRevert`
requires the source module's `edit` grant, never mere audit visibility. All final endpoints independently enforce
permissions. Persisted entity IDs are text; validate before embedding in a route and escape all displayed text.

## UI and integration work

The Settings activity page uses the actual Next.js 16 server-page pattern (`connection()`, promised params,
`setRequestLocale`, `requirePage`, staff/permission check) and an authenticated initial page read. Read the local
Next.js guides before implementation. The client Notes slot renders `<ActivityLog clientId={client.id} />`;
loading it performs a GET only. A global log offers an allowlisted entity filter, scoped explanation, empty
state and Load more. Changing filters clears the cursor and rows; failed pagination preserves already loaded
rows with an explicit Retry. Ignore stale responses from a prior client/filter and deduplicate appended IDs.

Each row shows a localized action, actor fallback/name, timestamp in tenant timezone, item link if available
and a version action when applicable. Archive, restore, void, correction and approval have distinct wording.
Example Arabic keys: title “سجل النشاط”, empty “لسه مفيش نشاط هنا”, systemActor “النظام”,
revertLink “راجع النسخة دي”, confirmRevert “اعمل مسودة من النسخة دي”. These labels belong in next-intl,
with matching English keys. Never print raw table/action codes as the finished label.

The dynamic version page validates kind, UUID and positive versionNo and loads the existing version reader
under authenticated scope and source module `view` (form permission follows its actual formKind). Show immutable version metadata/document preview using
existing safe document types, a builder/history backlink, and an explicit confirmation action only with `edit`.
The confirmation describes a new draft and includes an optional change note capped by that kind's existing
schema (program/form 2000, nutrition 4000). Invoke only the existing revert POST. On 201 navigate to the existing
builder (`/coach/programs/{id}`, `/coach/nutrition/{id}`, or the formKind-selected
`/coach/intake/{id}`, `/coach/checkins/{id}`, `/coach/assessments/{id}`), showing the fresh draft;
never publish or overwrite a frozen version. Keep server errors visible, disable duplicate submits and do not
claim a reverted published plan. Unknown/deleted/inaccessible versions show the normal 404 or translated error.

Write complete unified patches with actual merged-base context in `integration/r3b.md`:

1. API index: import `router as activityRouter` from `./activity` and mount
   `app.route('/activity', activityRouter)` alongside the other authenticated routers. Router middleware is
   restricted to its own path; it cannot capture unrelated requests. Follow the existing staff-role marker.
2. `i18n/request.ts`: add `activity: () => import('../messages/ar/activity.json'),` immediately after its `legal`
   loader, and the equivalent English line. Add no keys to someone else's namespace.
3. Client hub server page: add the ActivityLog import and its `activityLog={<ActivityLog clientId={client.id} />}`
   prop to the existing ClientDetail. Preserve every existing prop, including concurrent reviewCard additions.
4. Settings hub: add `const activity = await getTranslations('activity');` and a localized item pointing to
   `/coach/settings/activity`, gated by staff role and `clients view`, immediately before the legalPages item.
   Keep its existing settings items and other tasks' additions. Add actual R1b reachability metadata for that
   static route with real surrounding export lines; dynamic version routes are reached from log actions.

Do not apply patches from this worktree. Claude applies other tasks' settings/loader/hub patches serially and
regenerates context where needed; shared targets are not builder ownership overlaps.

Follow both Astryx blocks: pinned per-component imports, client boundaries, existing provider/RTL/fonts,
Heading/Text and token-backed layout props; dense activity is rows, not a stack of cards. No new shadcn,
raw layout div/span, inline styles, new CSS imports/@apply, arbitrary values or Tailwind theme bridge.
Use read-only `app/globals.css`/imported Astryx theme as the visual token source and report missing tokens to
R5. Arabic RTL and English LTR, keyboard-operable controls and live loading/error feedback, targets at least
44 px, no horizontal overflow at 360/390/430 px. Use shared numerals for every count/version, localized dates
with explicit tenant timezone/numeral preference, and wrapping long actor labels. Provide initial loading,
empty, filtered-empty, forbidden, unavailable-item and retry states. A settled screen is never a skeleton or
`aria-busy=true`. P9 additionally proves Astryx's 375/1440 px and both locales without console errors.

## Tests and P9 ownership

Write named Node Vitest unit and mocked-route cases: no auth/client role/missing permission, strict query
validation, known/unknown entity filters, scope passed into authenticated reads, inaccessible client 404,
accessible empty/archived client, no service transaction, safe DTO stripping all payload/reason/request data,
actor fallbacks, source permission filtering, owner versus staff null-client behavior, stable equal-time
pagination, IDs above Number.MAX_SAFE_INTEGER, timestamp precision, filter/cursor mismatch, limit boundaries,
and new insert between pages. Test generated internal links reject unsafe text IDs/JSON URLs, all three version
resolvers, inaccessible/deleted versions and edit-grant-only revert visibility. Mocked tests prove application
decisions; they do not establish RLS security.

Component tests use React createElement/renderToStaticMarkup with next-intl/Astryx mocks in the existing Node
environment, without jsdom/testing-library/config/dependency changes. Assert matching ar/en actions, actor/time/
item link, loading and empty states, no settled skeleton, explicit version confirmation and no automatic
mutation. Unit-test pure presentation/filter/cursor functions with injected dates/preferences.

Write `src/api/activity.db.test.ts` against the existing API harness: real owner/staff/client requests, scoped
client and null-client row visibility, pagination, permission filters and safe response projection after actual
archive/restore/correction operations. Write `packages/db/test/security.activity-api.test.ts` using existing
security harness conventions to assert tenant isolation, assigned-client limits, staff null-client refusal,
client denial and unchanged append-only UPDATE/DELETE refusals. New API uses existing audit schema/policies;
do not alter grants/policies or existing security assertions. These DB files run only in P9.

Write `e2e/beta/r3b-activity-log.spec.ts` with existing beta helpers read-only and `@ar`/`@en`. This task owns
the activity/history evidence attached to P9's coach archive -> undo -> Archived -> restore flow: after R3a's
flow, open client hub Notes and Settings activity, verify actor/action/time/item links and ordered archive/
restore history. R3a retains the mutation-flow ownership and its own spec. R3b also verifies a program,
nutrition and form version log link opens the exact immutable version, explicit revert creates a fresh draft,
old version remains unchanged, and an assigned staff caller cannot see another client's row. Use separate
seeded fixtures, no dependency on another spec's run order. Record that R4b's approval audit row is visible
when the composed P9 scenario is run; do not depend on R4b for this worktree's unit checks. These specs run
only in P9, together with screens, Astryx doctor and full eight-check integration; no ninth check is added.

## Acceptance checks the builder runs itself

Run only these, sequentially in the provisioned worktree:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/server/activity/read.test.ts src/server/activity/links.test.ts src/server/activity/presentation.test.ts src/server/activity/components.test.ts src/api/activity.test.ts --maxWorkers=1
```

Expected: both exit 0, no type errors, every named unit/component/mocked-route test passes without skips,
network or database connections. Use one Vitest process at a time. Do not run DB-backed files, full suites,
lint, Astryx CLI, Playwright, next dev/start/build or a database migrator. Report actual results and unapplied
integration patches; P9 owes browser, real RLS/guard and composed-flow evidence.

## The answer wanted

Files written; produced functions/components and the GET contract; permissions, safe fields, cursor and entity
registry decisions; version destinations and existing revert payloads; exact integration patches; named test
coverage and actual allowed-check results; P9 evidence still owed; every unsupported audit producer or missing
token/contract issue. Do not claim business-wide staff visibility, executed browser proof or policy coverage
from mocks.

## Resume note (15 Nov 2026, 15:55)

Two earlier runs of this brief stopped at the ChatGPT plan limit. They left these files in the worktree, all
unreviewed and untested:

- `apps/web/src/server/activity/types.ts`, `schemas.ts`, `read.ts`, `links.ts`, `presentation.ts`
- `apps/web/src/server/activity/read.test.ts`, `links.test.ts`, `presentation.test.ts`, `components.test.ts`
- `apps/web/src/api/activity.ts`, `apps/web/src/api/activity.test.ts`
- `apps/web/messages/ar/activity.json`, `apps/web/messages/en/activity.json`
- `tools/codex_briefs/integration/r3b.md`

Keep them. Read each one against this brief and the code it uses, finish or fix it, and do not rewrite a file
that is already right. These are still missing; build them:

- `apps/web/src/api/activity.db.test.ts`
- `apps/web/components/activity/activity-log.tsx`, `apps/web/components/activity/version-detail.tsx`
- `apps/web/app/[locale]/coach/settings/activity/page.tsx` and `loading.tsx`
- `apps/web/app/[locale]/coach/settings/activity/version/[kind]/[headId]/[versionNo]/page.tsx` and `loading.tsx`
- `apps/web/e2e/beta/r3b-activity-log.spec.ts`
- `packages/db/test/security.activity-api.test.ts`

The permission helpers live in `packages/core/src/authz/index.ts` (there is no `authz/types.ts`). Start with the
missing files, so a third limit leaves the most work done. Report which existing files you changed and why.
