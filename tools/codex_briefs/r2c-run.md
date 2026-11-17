# R2C in turbo mode: run notes for `r2c-client-app-composer.md`

Use collaboration.spawn_agent to give each file group to its own sub-agent, then integrate, run every acceptance check yourself, and report per group. Sub-agents stay inside the brief's file list.

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r2c` (branch `wt/r2c`, from `main` after R0, R1a, R1c, R1d, R4a, R4c, R1b, R2a, R3a and R3b were merged). It is your whole repository for this job. Do not write anywhere else, and
do not commit.

The brief is below. Its "Errata" section, if any, overrides the text above it. Notes:

1. Hot-spot files never change directly: `apps/web/src/api/index.ts`, `apps/web/i18n/request.ts`, every file under
   `apps/web/messages/` that the brief does not list as yours, `apps/web/src/components/shell/nav-items.ts`,
   `packages/core/src/index.ts` and every `package.json`. Write each change they need as an exact patch (file,
   anchor line, lines to add) to `tools/codex_briefs/integration/r2c.md`. Claude applies it at merge.
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

# Task R2c: the coach composes the client app

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R2, item R2c:

> A settings page "تطبيق العميل" (Client app):
> - toggles for the modules;
> - a per-client override from the client hub;
> - a live phone-frame preview of the client's Today.

Also preserve R2a's contract: "Every module honours `client_modules`. A hidden module disappears from tabs,
Today and Me. The API refuses its writes with 403 `module_disabled`." This task builds the configuration UI;
R0c already owns persistence and the write gate, and R2a owns the client shell and Today renderer.

Read the plan's Hard limits, `apps/web/AGENTS.md` including **Astryx in DAWLYY**, the R0c/R1b briefs, and
`tools/codex_briefs/r2a-client-nav-today.md`. Read the actual core module schema, `server/client-modules.ts`,
`api/client-modules.ts`, `api/clients.ts`, `server/clients/service.ts`, `server/packages/schemas.ts` and the
entitlement resolver before implementing. R0a/R0b/R0c/R1b/R1c and R2a, including their integration patches,
must be merged first. This task belongs to the second build batch.

All Hard limits bind this task: no spending, paid API or hosted LLM requests on client data; no meal-photo
calorie feature; no payment void/correct; no decorative restyling or private token source; preserve history,
RLS, `clientColumns`, guards and audits. Never weaken a test or policy. No schema, account, credential,
dependency or package changes. Claude reviews and commits; the builder never commits or pushes.

## Files the builder may write

Create exactly these files; no existing file is directly writable:

- `apps/web/app/[locale]/coach/settings/client-app/page.tsx`
- `apps/web/app/[locale]/coach/settings/client-app/loading.tsx`
- `apps/web/app/[locale]/coach/clients/[clientId]/client-app/page.tsx`
- `apps/web/app/[locale]/coach/clients/[clientId]/client-app/loading.tsx`
- `apps/web/components/client-app-composer/composer.tsx`
- `apps/web/components/client-app-composer/module-row.tsx`
- `apps/web/components/client-app-composer/phone-preview.tsx`
- `apps/web/components/client-app-composer/types.ts`
- `apps/web/src/lib/client-app-composer/state.ts`
- `apps/web/src/lib/client-app-composer/transport.ts`
- `apps/web/src/lib/client-app-composer/preview.ts`
- `apps/web/src/lib/client-app-composer/state.test.ts`
- `apps/web/src/lib/client-app-composer/transport.test.ts`
- `apps/web/src/lib/client-app-composer/components.test.ts`
- `apps/web/messages/ar/clientAppComposer.json`
- `apps/web/messages/en/clientAppComposer.json`
- `apps/web/e2e/beta/r2c-client-modules.spec.ts`
- `tools/codex_briefs/integration/r2c.md`

Nothing else. Existing client-hub pages/components, `override-editor.tsx`, settings hub, all API/server/core
files, R2a's Today components, shell navigation, token files and existing message namespaces are read-only.
In particular, do not edit `src/api/index.ts`, `i18n/request.ts`, `src/components/shell/nav-items.ts`, root
catalogs, `packages/core/src/index.ts` or `packages/core/package.json`. Write complete exact integration patches
to the named artifact for Claude; never apply them from the worktree. The repository uses independent
`messages/ar/<namespace>.json` and `messages/en/<namespace>.json`; create only `clientAppComposer`.

## Interfaces consumed

### Tenant defaults and the existing override API

The seven exact module keys are `workouts`, `nutrition`, `checkins`, `progress_photos`, `measurements`,
`messages`, `payments`. `ClientModules` is a strict seven-boolean object from `@dawlyy/core/types`;
`DEFAULT_CLIENT_MODULES` sets every key to true. Never rename `checkins` to `check-ins` in JSON.

| Method and path | Request | Success and permission |
|---|---|---|
| `GET /api/v1/settings/client-modules` | No body | 200, raw `ClientModules`; staff with `settings view` |
| `PUT /api/v1/settings/client-modules` | Complete strict `ClientModules`, all seven keys | 200, saved raw map; owner only (`settings edit` and RLS also apply) |
| `GET /api/v1/clients/{clientId}/overrides` | No body | 200 `{packageId, entitlements, overrides, resolved}`; `clients edit`, caller's accessible client |
| `PUT /api/v1/clients/{clientId}/overrides/{key}` | `{enabled:true, modules:Partial<ClientModules>}` for this screen | 200, the same overrides response; `clients edit` **and** `billing edit` |
| `DELETE /api/v1/clients/{clientId}/overrides/{key}` | No body | 200, the same overrides response; `clients edit` **and** `billing edit` |
| `GET /api/v1/me/app` | No body | Client bootstrap `{preferences,numerals,clientModules?}` includes resolved `clientModules` and the user's numeral preference |

Use `key = 'custom:client_app'`, encoded as `custom%3Aclient_app` in the path. The server's existing
`keyIdentity` derives `{key:'custom', customKey:'client_app'}`; do not send either identity field in the body.
The actual `overrideBodySchema` is `Entitlement.omit({key:true,customKey:true}).extend({modules:
ClientModules.partial().optional()}).strict()`, so `enabled` is required. A body containing only `modules`
is invalid. This reserved custom identity is supported by `entitlementDisplay`/`resolveEntitlements`, including
when the package has no matching custom entitlement. It never changes `workout_program`, `chat`,
`nutrition_plan` or another access entitlement. Do not claim that a visible module grants package access.

The PUT revokes previous live rows of this identity and appends one new immutable override; DELETE revokes it.
Neither deletes history. Saving every override as false still sends `enabled:true`: that flag keeps this
configuration record valid, while `modules` determines module visibility. Do not use `enabled:false` to mean
inherit. The explicit Reset to defaults action uses DELETE. If all seven selections are Inherit, reset this
identity instead of appending an empty row. Preserve unrelated overrides and their fields.

The existing responses retain full override rows including `override`, `createdAt`, `id`, `revokedAt` and
subscription association. Adapt dates at the server-to-client boundary. `getClientOverrides` selects applicable
global/current-subscription rows; do not choose a different subscription in this UI. `getClientModules` ignores
expired rows using the client's local date, then merges all remaining `override.modules` maps in ascending
`createdAt,id` order: the newest defined boolean wins, including explicit false.

Other entitlement identities can already contain module overrides. Show their effective inherited result and a
translated notice that another saved override applies; resetting `custom:client_app` must not claim to remove
those rows. For an unsaved Save preview, remove the old composer identity, merge other applicable rows in their
existing order, then apply the local partial last: a successful PUT will append it last. For a Reset preview,
remove the composer identity and show the result from remaining rows. After Save or Reset, refresh the
authoritative data and effective switches; another newer override may change the result. Do not silently rewrite
unrelated rows or promise that a stale preview is the final configuration.

Mutation requests use `Idempotency-Key`; keep a key for a retry of the same intended payload, and generate a new
key when the payload changes. The shared error envelope is `{error:{code,message,details?}}`. Show 400 validation
errors, 401 expiry, 403 refusal and scoped 404 without a success toast or falsely saved state. Do not bypass a
403 by calling a different endpoint. No archive, restore, void or correction endpoint is needed in this task;
those remain R0c contracts, and R3a/R2b own their UI.

### Server page reads and core functions

Use `connection()`, promised `params`, `setRequestLocale`, `requirePage()` and `withAuthTx(auth,fn)` in the
same style as the neighboring Next.js 16 pages; read the installed Next.js guide first. Reject client-role
callers. Tenant page: require `settings view`; derive `canSave` from `auth.role === 'owner'`. Per-client page:
validate the UUID and require `settings view`, `clients view` and `clients edit` before the scoped reads;
`canSave` additionally requires `billing edit`. A staff member missing the write grant sees an explicit
read-only view. The API remains authoritative on every mutation.

Existing read-only service signatures are:

```ts
getTenantClientModules(tx: Tx, auth: AuthContext): Promise<ClientModules>
getClientModules(tx: Tx, auth: AuthContext, clientId: string): Promise<ClientModules>
getClientOverrides(tx: Tx, auth: AuthContext, clientId: string): Promise<{
  packageId: string | null; entitlements: PackageEntitlements;
  overrides: /* the inferred existing override-row array */ unknown[];
  resolved: /* existing entitlementDisplay result */ unknown[];
}>
```

The last shape documents the wire fields, not an instruction to replace the real inferred types with
`unknown[]`. Import or infer the actual service return type with `Awaited<ReturnType<typeof getClientOverrides>>`;
the browser component receives only the fields it needs. Use scoped `getClient(tx,auth,clientId)` to obtain
the client name/timezone. No `withServiceTx`, raw database connection, new API or RLS change is authorized.

Consumed core signatures:

```ts
resolveClientModules(tenant: ClientModules,
  override?: Partial<Record<ClientModule, boolean>>): ClientModules
localDateOf(instant: IsoDateTime, timezone: string): IsoDate
entitlementId(e: {key: EntitlementKey; customKey?: string}): string
```

`resolveClientModules` supplies module semantics; do not copy its validation/default rules. Pass a server-derived
client-local `today` into the pure expiry adapter instead of reading a clock during rendering. Preserve API/RLS
scope and existing package entitlement enforcement. No new endpoint/table/function/column is produced, so R0c's
module/override isolation and guard suites remain the database evidence, rerun by the integrator in P9.

R1b's existing staff Inbox is `GET /api/v1/inbox?limit=50` (max 200), returning
`{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}`. This composer does
not fetch or modify it. Preserve R1b's four coach destinations and all existing routes; the new settings route
becomes reachable through the settings hub and the per-client route through that client's hub.

### R2a's live preview renderer

Import `ClientTodayModel` from `components/client-today/types.ts` and `ClientTodayView` from
`components/client-today/today-view.tsx`; do not copy the Today JSX, tab bar, data loader or meal logging logic.
Its exact renderer interface is:

```ts
ClientTodayView(props: {
  model: ClientTodayModel; preview?: boolean;
  onLogMeal?: (mealId: string, optionId: string) => void;
  busyMealId?: string | null;
}): React.JSX.Element
```

`ClientTodayModel` contains `date`, `locale`, `numerals`, `modules`, `workout` (`PortalToday['workout']|null`),
`meals` (`{id,name:LocalizedText,optionId:string|null,status:'eaten'|'partial'|'skipped'|null}[]`),
`checkins` (`PortalToday['checkins']`) and `intakePending`. Supply a typed, synthetic planned-workout/meal/check-in
example in the active locale, with locally resolved modules. Pass `preview:true`; all links/mutations are inert
and the frame is clearly labelled Preview. Never fetch a real client's nutrition/workout data to populate this
configuration example or attach `onLogMeal`. Neither toggling nor rendering the preview makes a request.

## Interfaces produced and implementation

Export `ClientAppComposer` from `composer.tsx`, accepting a discriminated tenant/client seed in `types.ts` with
`tenantModules`, authoritative effective modules, locale, numerals, `canSave`, and, in client mode, `clientId`,
client-local `today`, and the minimal ordered override-row projection. Export `ModuleChoice = 'inherit'|'on'|'off'`
and `ComposerSelection = Record<ClientModule,ModuleChoice>`. Tenant mode has only on/off; client mode presents
Inherit/Show/Hide for each module, with inherited/current effective values stated in translated text.

Export these pure helpers from `state.ts`: `selectionToPartial(selection:ComposerSelection):Partial<ClientModules>`
and `resolveComposerPreview(input:{tenant:ClientModules;rows:readonly ComposerOverrideRow[];today:IsoDate;
selection:ComposerSelection;intent:'save'|'reset'}):ClientModules`. Define `ComposerOverrideRow` exactly as
`{id:string;createdAt:string;override:EntitlementOverride}` after the server filters revoked/inapplicable rows.
Expiry, chronological sorting and dedicated-identity replacement follow the API behavior above.
`preview.ts` exports `makeComposerPreview(modules:ClientModules,locale:'ar'|'en',numerals:'latn'|'arab'):
ClientTodayModel` with a fixed example date and no clock/I/O. `transport.ts` owns only the existing request
contracts, taking injected fetch for tests; no generic API client or new endpoint.

Show the settings title "تطبيق العميل" / "Client app". Keep module choices as compact labelled rows, with the
phone preview beside them on desktop and below on phones. The tenant view states that defaults apply unless a
client override wins. The client view shows Inherit plus explicit choices and a Reset action scoped to this
composer identity. Module visibility and package access remain distinct; hiding payments never voids a payment.
Changes stay local until Save. Disable duplicate saves, show pending status, retain unsaved choices on refusal,
and only mark saved after an authoritative successful response. After a transport failure with unknown outcome,
offer retry with its original key and refresh before claiming a result. A successful save updates the saved
baseline and refreshes the preview from current data. A reset refreshes inherited effective values.

## Integration patch artifact

Write complete unified diffs with real merged-base context to `tools/codex_briefs/integration/r2c.md`. Include
every import/line and insertion; Claude applies them serially after the second batch, not the builder.

1. `apps/web/i18n/request.ts`: immediately after each `legal` loader add
   `clientAppComposer: () => import('../messages/ar/clientAppComposer.json'),` in ar and the corresponding
   `../messages/en/clientAppComposer.json` line in en. Do not edit other namespaces.
2. `apps/web/app/[locale]/coach/settings/page.tsx`: after its existing `t` declaration add
   `const clientApp = await getTranslations('clientAppComposer');`. Before `item('legalPages', '/terms'),`, add
   `...(isAllowed(auth, 'settings', 'view') ? [{href:'/coach/settings/client-app',
   title:clientApp('hub.title'),body:clientApp('hub.body')}] : []),`. Preserve other settings entries.
3. `apps/web/app/[locale]/coach/clients/[clientId]/page.tsx`: add
   `const clientApp = await getTranslations('clientAppComposer');` beside the existing translations. Immediately
   after the existing Back-to-clients `Link`, insert a `Link` to
   `` `/coach/clients/${client.id}/client-app` `` with `className="inline-flex min-h-11 items-center underline"`
   and `clientApp('hub.clientLink')`. Render it only when `isAllowed(auth,'settings','view')`,
   `isAllowed(auth,'clients','view')` and `isAllowed(auth,'clients','edit')` all pass. Reuse existing imports.
   Keep the R4b reviewCard and R3b activityLog integrations and R1c tabs intact.
4. If R1b's exported route-reachability metadata requires a new entry, supply the actual exact
   `/coach/settings/client-app` link entry at its merged export with translated namespace references. Do not
   directly edit `nav-items.ts`, existing catalogs or its test. Dynamic client routes remain reachable via the
   scoped hub link. Record missing semantic token requests for R5, without adding a local token file.

## UI rules

Carry every **Astryx in DAWLYY** rule: pinned 0.7.11, subpath component imports, client boundaries, existing
provider/RTL/fonts, `Heading`/`Text`, layout components, rows for dense data, badges for counts only. Reuse an
existing settings frame or installed template source; no new shadcn component, raw layout `div`/`span`, inline
style, arbitrary visual value, private CSS or `tailwind-theme.css` import. Existing token/theme source
`apps/web/app/globals.css` and the imported DAWLYY theme are read-only; every color/type/radius/spacing/frame
value comes from their tokens. R5 owns consolidation and any missing semantic tokens.

Both Arabic (plain Egyptian Arabic, RTL) and English work. All visible strings, including preview examples,
inheritance/provenance, errors and accessible names, come from the new namespace with identical ar/en keys.
Every touch target is at least 44 px; switch labels, radio options, Save/Reset and links have keyboard focus.
Use logical spacing, wrapping and a responsive frame; no horizontal overflow at 360, 390 or 430 px. R0b's
`formatNumber(value,{locale,numerals,maximumFractionDigits})`, `formatKcal`, `formatMacro` and
`numeralPolicy(preferences)` from `src/lib/numbers.ts` format every number. Default numerals are Western in
Arabic too. Provide route loading, read-only, error/retry, unsaved and all-modules-off settled states; an empty
preview explains that no Today modules are enabled. No skeleton is a settled state.

## Tests and acceptance checks the builder runs

Work in your own git worktree with `node_modules` installed. This brief overrides `_common_web.md`'s old command
ban/component-test exclusion only for these checks. Run sequentially, with one Vitest process at a time:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/lib/client-app-composer/state.test.ts src/lib/client-app-composer/transport.test.ts src/lib/client-app-composer/components.test.ts --maxWorkers=1
```

Expected: both exit 0, no type errors, every case in exactly these three new tests passes without skips,
database access or network. Do not run lint, Astryx CLI/doctor, package installation, full tests, database
suites, `next dev`, `next build`, `next start`, `pnpm dev`, Playwright or screenshots. No commits or pushes.
If an unapplied integration patch prevents registration, record that fact rather than editing a hot spot or
claiming browser proof. Claude performs integration, Astryx doctor, complete database suites and P9 checks.

- `state.test.ts`: all-on default, every one of the seven false values, inherit versus explicit false,
  strict unknown-key rejection, valid dedicated custom identity through the real core resolver, older/newer
  override precedence, expiresOn boundary in the supplied client-local day, unrelated overrides retained,
  composer Save moves its partial last, Reset removes only its identity, no mutation of inputs, all-off preview,
  deterministic synthetic Today model and hidden modules absent from its content.
- `transport.test.ts`: exact tenant GET/PUT and client GET/PUT/DELETE paths, encoded custom key, all seven
  tenant keys, enabled:true on client PUT, no forbidden identity fields or delete body, retry idempotency,
  changed-payload new key, 400/401/403/404 and indeterminate outcome retain pending decisions. Inject fake fetch
  and stub global fetch to throw so an accidental real request fails the test.
- `components.test.ts`: existing Vitest is Node with `src/**/*.test.ts` only. Use React.createElement and
  `react-dom/server` renderToStaticMarkup with locale/Astryx context mocks; no jsdom, Testing Library, dependency
  or config changes. Render tenant/client and read-only views in ar/en; assert labelled seven controls,
  inherit/current effective text, Save/Reset grants, preview=true/inert behavior, all-off empty state, translated
  errors, no settled aria-busy and formatter output for both numeral choices. Test interaction state through
  pure helpers; do not mistake server markup for browser overflow proof.

Write `apps/web/e2e/beta/r2c-client-modules.spec.ts` now; **run only in P9**. Each locale case has its `@ar` or
`@en` title tag for the existing projects and reuses `helpers.ts` without editing fixtures/config. This owns P9's
exact flow **coach: hide nutrition, then the client no longer sees it and its write gets 403**. Owner turns off
nutrition, saves, then the client's fresh/foreground-refreshed `/app/today`, Plan, Me and tab links have no
nutrition content. Submit a valid own `POST /api/v1/meal-logs` payload through that client's authenticated request
and assert 403 `module_disabled`, not a validation failure. Restore defaults in fixture cleanup. Also cover a
scoped client override enabling nutrition against an off tenant default, Reset returning to inherited off,
another client's settings unaffected, staff read-only controls, unsaved preview making zero mutations, and all
off/360/390/430 px settled states. Existing client read access is not claimed to be newly forbidden: R0c gates
writes, and R2a hides entry points. No paid feature, real message or hosted LLM call is involved.

## The answer wanted

Files written; exact consumed routes/payloads and produced composer helpers; the dedicated custom identity and
other-override precedence decisions; permission/read-only behavior; every integration patch and insertion;
test commands actually run and their results; unresolved token/API mismatches, anything wrong in this brief,
and P9/browser/database proof still owed. Do not paste complete files or claim checks that were not run.

## Errata 2 (Claude, 17 Nov, from a read-only audit of the merged code; overrides the text above)

- `src/components/shell/nav-reachability.test.ts` fails unless `/coach/settings/client-app` is reachable from a nav list. The integration patch `integration/r2c.md` must therefore also give: an entry `{ key: 'clientApp', href: '/coach/settings/client-app', Icon: Settings }` for `nav-items.ts` (or the hub-links list) and the matching `coach.clientApp` key in `messages/{ar,en}/nav.json`, both as patch text only. Read how the existing `activity` entry is handled and follow it.
- `ClientTodayView` in preview mode renders its own `h1`; render the preview so the page keeps a single `h1` (demote it or pass the heading down).
- Idempotency hashes method, path and body: use a new key whenever the payload changes.
