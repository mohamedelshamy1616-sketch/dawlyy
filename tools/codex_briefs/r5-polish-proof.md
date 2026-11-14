# Batch R5: shared tokens, numeral and empty-state polish, and honest proof

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R5:

> Token file consolidation (limit 4), the numeral policy everywhere, and empty states for every new list.
> HOW_TO_TEST.md in Egyptian Arabic, updated with every new flow:
> inbox;
> client hub;
> archive with undo;
> corrections;
> review and approve;
> red flag;
> client modules;
> quick log.
> Screens re-run at 360, 390 and 430 px and 1366 px, ar and en.

The parenthetical "limit 4" refers to Hard limit 4 (design), not permission to create four token files.
Keep Astryx, the approved structure and current brand; this is consolidation and completion of missing states,
not a decorative redesign. Read the complete plan, `apps/web/AGENTS.md` including **Astryx in DAWLYY**,
`docs/plans/LESSONS.md` screen/build notes, the R0b/R0c/R1b/R4a briefs, and all nine briefs in
`turbo-file-map.md`. Read the existing formatter, theme source, globals, screen spec, beta helpers and testing
guide before editing. `_common_web.md` is background; this brief's exact allowlist and acceptance limits govern.

All Hard limits bind: no paid or hosted-model calls on client data, meal-photo calorie estimation, payment
void/correct, keys, account actions, lost history, weakened tests/guards/RLS or new dependencies. Preserve
clientColumns, authenticated reads and module/entitlement gates. No server/API/database/core implementation is
authorized here. Claude reviews, integrates and commits; the builder does not commit or push.

## Dependencies and worktree boundary

Start in a provisioned worktree with `node_modules` installed after R0a/R0b/R0c/R1a/R1c/R1d/R4a/R4c and
R1b/R2a/R3a/R3b/R4d are merged with their integration patches. R2b/R2c/R4b may build concurrently in batch 3.
Read their approved briefs to document corrections/quick log, composer and review, but do not import, inspect
for existence, or assert on their forthcoming new files during this builder's checks. Their final numeral,
token and empty-state audits happen with Claude after all batch-3 outputs merge. Do not invent patches against
source that does not exist yet. The P9 browser spec may name their future stable routes and flows, because it
is written now and runs only later. Batch 1 is R1b; batch 2 is R2a/R3a/R3b/R4d; batch 3 is R2b/R2c/R4b/R5.

## Files you may write

Create exactly:

- `apps/web/src/styles/tokens.css`
- `apps/web/src/lib/reinvent-proof/manifest.ts`
- `apps/web/src/lib/reinvent-proof/manifest.test.ts`
- `apps/web/src/lib/reinvent-proof/tokens.test.ts`
- `apps/web/src/lib/reinvent-proof/formatting.test.ts`
- `apps/web/src/lib/reinvent-proof/components.test.ts`
- `apps/web/e2e/beta/r5-polish-proof.spec.ts`
- `tools/codex_briefs/integration/r5.md`

Modify exactly:

- `apps/web/app/globals.css`
- `apps/web/theme/dawlyy.theme.ts`
- `apps/web/e2e/screens.spec.ts`
- `docs/qa/HOW_TO_TEST.md`

Nothing else. In particular, no configuration, dependency, package/core, API/server, existing message catalog,
shell/navigation, prior task component or prior task test is directly writable. `apps/web/src/api/index.ts`,
`apps/web/i18n/request.ts`, `apps/web/src/components/shell/nav-items.ts`, `packages/core/src/index.ts` and
`packages/core/package.json` are read-only hot spots. The actual message organization is
`messages/ar/<namespace>.json` and `messages/en/<namespace>.json`; this task creates no namespace. Put any
necessary label changes in exact patches to the appropriate owning namespace inside `integration/r5.md`.
Generated `apps/web/theme/built/dawlyy.js`, `.css` and `.d.ts` remain read-only: do not hand-edit generated output.
No screenshot images, generated report or `REINVENT_REVIEW.md` is authored as evidence by this builder.

## Interfaces consumed

R0b owns `apps/web/src/lib/numbers.ts`, read-only. Reuse its actual exports:

```ts
type NumberLocale = 'ar' | 'en';
type NumeralSystem = 'latn' | 'arab';
type NumberOptions = { locale: NumberLocale; numerals?: NumeralSystem };
formatNumber(value: number | null | undefined,
  opts: NumberOptions & { maximumFractionDigits?: number }): string
formatMacro(value: number | null | undefined, opts: NumberOptions): string
formatKcal(value: number | null | undefined, opts: NumberOptions): string
formatNutrient(key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG',
  value: number | null | undefined, opts: NumberOptions): string
numeralPolicy(preferences: unknown): NumeralSystem
numberLocale(locale: string): NumberLocale
```

Western digits are the default in both locales. Macro grams round to whole numbers, kcal to the nearest 5,
other numeric values use their meaningful precision. Missing/invalid numbers render the shared en dash, not
zero, NaN or an empty string. Count formatting is display-only: do not change stored values, UUIDs, ISO dates,
API payloads, input parsing, review hashes or proposals. Date display must honor the selected numberingSystem
and explicit tenant/client timezone; a date formatter is not a replacement number formatter.

R0c/R1b consume contracts for this proof, not endpoints to build:

| Method/path | Request | Existing result used by proof |
| --- | --- | --- |
| `GET /api/v1/me/app` | None | User preferences/numerals and resolved clientModules for the authenticated client |
| `GET /api/v1/settings/client-modules` | None | Raw seven-boolean ClientModules for staff with settings view |
| `PUT /api/v1/settings/client-modules` | Full strict map: workouts, nutrition, checkins, progress_photos, measurements, messages, payments | Owner saves defaults; disabled client writes return 403 module_disabled |
| `GET /api/v1/inbox?limit=50` | None | Staff-scoped `{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}` |
| `POST /api/v1/clients/{id}/archive`, `/unarchive` | No body; distinct Idempotency-Key for each intended mutation | Updated row, 200; GET clients?archived=true is archived-only |
| `GET /api/v1/red-flags?status=open&clientId={id}` | None | Scoped paginated staff-only flags; clients cannot read them |
| `POST /api/v1/red-flags/{id}/handle` | No body | Handled row, stamps supplied by the server |

All other archive entities, void/correct payloads and their seven-day boundary remain exactly the R0c/R2b/R3a
contracts. Do not add aliases or reversible mutations for payment rows. R3a is the only undo implementation:
`useUndoableAction` from `src/hooks/use-undoable-action.ts` and `UndoToast()` from
`components/control/undo-toast.tsx`. Preserve its one shared mount, six-second pending window, immediate archive
rollback versus delayed irreversible void/correct behavior, idempotency and failure feedback. R2b imports it.

Consumed pure core functions, read-only:

```ts
resolveClientModules(tenant: ClientModules,
  override?: Partial<Record<ClientModule, boolean>>): ClientModules
weekReview(input: WeekReviewInput, opts: {locale: 'ar' | 'en'}): WeekReview
canonicalReviewInput(input: WeekReviewInput): string
```

No new core export is produced. Formatting must leave canonical inputs and server stale-hash checks unchanged.
R4b approval still rechecks server inputs, returns 409 for stale drafts, handles red flags before sending, and
sends only after coach approval. R4d remains provider none, off without a key/legal review, with zero external
model requests. These are assertions to preserve in proof and manual instructions, not services to rewrite.

## Implementation

1. **Consolidate visual decisions in the token source.** Today `app/globals.css` contains the Tailwind semantic
   aliases, light/dark app colors/radius/brand values, focus-ring measurements and font mappings; the installed
   `theme/dawlyy.theme.ts` separately hardcodes equivalent teal hex values. Create `src/styles/tokens.css` as the
   single owner-editable source for DAWLYY visual decisions. Move existing `@theme inline` aliases and their
   app-owned custom property declarations there without changing their values or dark behavior. Include font
   stacks, focus-ring thickness/offset and the documented new semantic token requests from prior integration
   artifacts. Use existing Astryx/Tailwind scales for ordinary spacing and type; add a semantic token only where
   no existing token expresses the approved requirement (for example minimum touch target 2.75rem).
   Keep third-party imports, custom variant and existing base resets in globals; add the tokens stylesheet import
   while preserving CSS import ordering and `layers.css`. Replace the focus utility's literal measurements with
   references. Keep font mapping rules for `[data-astryx-theme]` and RTL, using the centralized font values.
   No per-page token files, duplicated declarations or raw visual literals in components.
2. **Bridge the existing Astryx theme.** Keep `defineTheme({extends:neutralTheme,...})`, its name, existing
   provider and pinned 0.7.11. Replace DAWLYY color literals in the source theme with CSS variable references to
   the canonical source, including light/dark and selected inset treatment. Use distinct app variable names
   such as `--dawlyy-selected-inset` to avoid a circular `--color-accent -> --accent -> --color-accent` alias.
   Put raw DAWLYY palette choices solely in tokens.css; existing `--brand*` may remain compatibility aliases.
   Never set Astryx `--color-*` variables on :root. The old app's `--color-*` Tailwind aliases must keep their
   established meaning; do not import tailwind-theme.css. If the installed theme API cannot accept these aliases,
   record the exact rejected interface and supply a compatible exact integration patch rather than duplicate
   values or hand-edit generated assets. Claude must rebuild the tracked generated theme using the existing
   package theme:build command after merge, then verify source/generated parity; this is outside builder checks.
3. **Finish actual numeral and state polish through exact integration patches.** On the B2 merged tree inspect
   Inbox, Library/Money hubs, Today/Plan/Coach/Me, archive lists/bulk controls/UndoToast, activity log and provider
   settings. Inspect their concrete JSX, actual formatter options and actual namespace
   keys, not just imports. For each uncovered number, pass the authenticated user's numeral choice through the
   existing shared formatter. For every new list supply a translated explicit empty state with a meaningful
   next action where allowed, a temporary loading state, retryable error state, and no settled skeleton.
   Distinguish no plan, no data, filtered-no-results, module disabled, no permission and provider off; do not
   convert a failed request into an empty list or all-on module default. Keep dense data as rows. Write complete
   unified diffs with real context/imports/labels to integration/r5.md for every discrepancy found. Do not
   directly edit the prior owners' files. An already-correct surface needs an inspected evidence entry, not a
   gratuitous patch. Pending R2b/R2c/R4b final inspections and their additional token requests are Claude's
   explicit follow-up, not asserted complete.
4. **Produce a reusable proof inventory.** `manifest.ts` exports the following typed constant and pure helpers.
   Use locale-free stable routes and a caller-supplied client id; do not read process env, clock, cookies or DB.

   ```ts
   export type ReinventProofRoute = {
     id: string; area: 'coach' | 'app'; path: string;
     owner: 'r1b' | 'r2a' | 'r2b' | 'r2c' | 'r3a' | 'r3b' | 'r4b' | 'r4d';
     state: 'content' | 'empty' | 'loading' | 'error' | 'unavailable';
   };
   export const REINVENT_PROOF_WIDTHS: readonly number[]; // 360,390,430,1366,375,1440
   export function reinventProofRoutes(clientId: string): readonly ReinventProofRoute[];
   export function proofScreenName(input: {
     role: 'owner' | 'client'; routeId: string; locale: 'ar' | 'en'; width: number;
   }): string;
   ```

   Validate only what this test utility needs (nonempty safe route-id, allowed locale/width and UUID client id);
   throw descriptive Error for invalid proof arguments. No app domain errors or public endpoint is introduced.
   Inventory the concrete merged R3b/settings route and all new R1b/R2a/R2c/R4b/R4d routes from their briefs,
   plus existing history/log routes for the upcoming R2b flow. State rows identify the fixture state required by
   the proof; they do not create five copies of every normal screenshot. Include at least one empty and one
   refused/retryable state per new list, with the responsible spec/fixture documented in integration/r5.md.
   No R2b/R2c/R4b source import or build-time file assertion. This inventory is proof infrastructure, not app navigation.
5. **Update screen capture without weakening it.** Extend `e2e/screens.spec.ts` to cover new static routes plus
   known seeded detail routes using the inventory, retaining all current routes. Add 375 and 1440 to the required
   360/390/430/1366 widths so Astryx's separate proof is covered too. Keep role-aware login, real locale/direction,
   final-URL assertions, console/page-error checks, fonts-ready, overflow tolerance at most one pixel and current
   diagnostic timeouts. Preserve the live `/app/workout/start -> /app/workout/{id}` expectation. A settled page
   must show its intended content or explicit empty/error state and have no settled aria-busy/skeleton marker.
   Record requested/final route, locale, role, width, saved image and assertion result. A captured failed page
   remains FAIL; a filtered run cannot rewrite the complete index; missing shots cannot become PASS. Do not
   delete old images, increase tolerances, mask meaningful busy markers or manufacture updated screenshots.
6. **Update HOW_TO_TEST in Egyptian Arabic.** Preserve accurate local start/login guidance and existing useful
   coverage. Replace the stale dashboard/client navigation and screenshot widths with actual merged labels and
   routes, describing each new flow as actor, start route, actions, expected visible result and recovery. Cover
   all eight quoted flows plus business/client activity, version revert links, numeral preference in ar/en,
   all-modules-off, stale review rebuild, and off provider/no-key/legal status. Explain six-second undo and the
   seven-day correction window, immutable history, no payment correction and template-based human approval.
   Do not promise a coach portrait/reply SLA unless stored, publish AI claims, add keys or ask a person to send
   a message to a real client. Local seeded identities only. State browser evidence is pending P9 until actually
   recorded; retain real old evidence dates. The existing guide already distinguishes local preview and remote
   services; do not claim production release or replace review evidence with the guide.

## UI rules

Carry all **Astryx in DAWLYY** rules: pinned 0.7.11, per-component subpath imports, client boundaries, current
provider/reset/layers/RTL wiring, Inter/Plex Arabic fonts, Heading/Text, and layout components such as VStack,
HStack/Layout/AppShell. Keep existing frames and template structure; new shadcn controls, raw layout div/span,
inline style, arbitrary Tailwind values, private component CSS, :root Astryx palette overrides and the
tailwind-theme bridge are forbidden. Layout constants in tests are measurements, not product style literals.
Product labels stay in the proper ar/en namespace with identical keys and Egyptian Arabic coaching wording.
Every visual decision resolves to centralized DAWLYY tokens or the inherited design-system scale.

Support ar RTL and en LTR, logical spacing, wrapping long names/text and keyboard focus. All actions need at
least 44 px targets. No horizontal overflow at 360/390/430 px; additionally prove 1366 and Astryx 375/1440.
Format all display counts/macros/kcal with the user's shared numeral policy. Every new list needs loading,
empty and error states; skeletons are temporary only. Shared undo remains one mount. Do not change semantics,
permission gates or API payloads while polishing labels and number display.

## Tests and acceptance checks the builder runs itself

Only these commands are allowed, sequentially, with one Vitest process:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/lib/reinvent-proof/manifest.test.ts src/lib/reinvent-proof/tokens.test.ts src/lib/reinvent-proof/formatting.test.ts src/lib/reinvent-proof/components.test.ts --maxWorkers=1
```

Expected: both exit 0; no type errors; all cases in precisely those four new tests pass without skips, network
or database. No lint, package install, full tests, core/database suites, Astryx CLI/theme build/doctor,
Playwright, screenshots, next dev/build/start or pnpm dev. Existing config includes src/**/*.test.ts in Node.
Use import {describe,it,expect} from vitest. Component tests use React.createElement and react-dom/server
renderToStaticMarkup, with narrowly scoped Astryx/next-intl/navigation mocks, without jsdom/Testing Library.
Patches to read-only files are unapplied in this worktree: report that limitation, and do not claim these checks
validate the patched integrated tree or browser layout. Claude reruns the relevant checks after applying them.

- `manifest.test.ts`: exact required widths/no duplicates, deterministic names/routes, all new stable route
  ids represented, locale/role identity in filenames, UUID validation and traversal/unsupported-width rejection;
  pending R2b/R2c/R4b flows represented by stable route strings only. No file-existence scans of their pending implementations.
- `tokens.test.ts`: read only the two authored CSS files/theme source using node:fs. Check one canonical
  DAWLYY brand/font/radius source, no duplicated app token definitions in globals, required existing aliases,
  preserved dark mappings, no :root Astryx color override and no tailwind-theme import. Add explicit semantic
  assertions for the actual consolidation; do not snapshot whole stylesheets or assert irrelevant formatting.
  Do not demand generated theme parity before Claude's rebuild; that is an explicit P9 integration obligation.
- `formatting.test.ts`: real shared formatter calls with ar/en and both numeral choices; representative Inbox
  counts, review percent/kg, kcal 2083 -> 2085, macro 31.7 -> 32, missing values and negative-zero behavior.
  More than formatter arithmetic, render actual merged Today or bulk-count output with explicit numeral
  preferences and assert the output passed through that formatter. Do not create a second formatter in tests.
- `components.test.ts`: render real B2 components (including ClientTodayView's all-modules-off/empty meal/rest
  states and the activity list's empty view) with injected fixture state and locale messages. Check translated
  state/action labels, absent disabled-module content, no settled aria-busy and correct shared numeral output.
  Test error/loading branches separately; do not mark server markup as touch-target/overflow/interactive proof.
  If a needed state is currently inaccessible, record an exact patch rather than fake a component in the test.

## P9 e2e and proof ownership

Write `apps/web/e2e/beta/r5-polish-proof.spec.ts` now; run **only in P9**. Use existing read-only beta helpers
and the `@ar`/`@en` title tags for `playwright.e2e.config.ts`. Do not edit fixtures, config or tools/checks.json.
Load new namespaces directly for test labels rather than expanding helpers.ts. Use seeded identities and local
routes, block any hosted LLM transport and never invoke real email/Push/remote accounts.

R5 owns cross-screen visual/state/numeral proof, not a duplicate implementation of another task's mutation
journey. Record ownership explicitly: R4b owns Inbox -> review -> approve/send and client pain term -> coach red
flag; R3a owns archive -> undo -> Archived -> restore; R2c owns hide nutrition -> absent client UI -> 403 write;
R2a owns client Start; R2b owns correct meal -> undo and quick log; R3b owns activity visibility/version links.
R5 additionally owns P9's **coach: assign a program from the client hub in 3 taps or fewer**, for R1c's already
implemented hub. Author this full flow in r5-polish-proof.spec.ts: begin on the client's scoped hub with an
eligible published program prepared, count each click/tap after arrival (including opening Plan if needed),
select/confirm through the real UI, and assert the new assignment appears for that client. Assert the actual
total is at most three; do not exclude an inconvenient action, use API assignment as a UI shortcut, or weaken
the bound. If the implemented flow exceeds it, report the exact path/actions and supply the concrete B2-context
integration patch. Keep fixture setup outside the measured action sequence. R1d's required exercise/More
selector update in the old beta gate is a separate exact integration patch if still needed; no direct edit.

The new R5 spec visits the actual new routes in both locales at all six widths, checks browserHealth, settled
content, no overflow and visible interactive target rectangles at least 44 x 44 CSS pixels (excluding genuinely
noninteractive text). Include representative explicit empty and retryable error states via narrowly scoped
same-origin fixture responses; assertions for these are labelled synthetic states, not API security evidence.
Check both numeral preferences through the existing preference UI/API flow, restore the original preference
in cleanup and verify real counts/macros on at least Today and review. Ensure pending/loading transitions are
eventually settled, not captured as successful final state. Do not swallow console errors. Capture/attach the
actual screen state and result; the established screens spec remains the full-route artifact producer.

Claude's final integration applies exact patches serially, audits pending R2b/R2c/R4b, rebuilds the theme, runs Astryx
doctor and the existing eight P9 checks on an unchanged tree, then runs the screen job and records current
artifacts. No ninth check, blanket test skip, relaxed assertion or DONE/REINVENT_REVIEW completion line from
this builder. Keep R4b's actual equivalent-flow baseline/current review duration and ratio; only measured
evidence can substantiate the 30% promise. Missing baseline remains missing evidence. P10 publish is separate.

## Integration artifact and answer wanted

`integration/r5.md` must contain an inspected-surface table (exact path, state/numeral/token observation and
required patch or already-correct evidence), complete exact unified patches against the B2 merged base for
all required previous-owner fixes, and the serial application order after the earlier task artifacts. List
each namespace patch with both locales and real surrounding context. Use no globs, placeholder patches,
invented imports or guessed future R2b/R2c/R4b source. Record token requests satisfied, concrete source-theme rebuild
obligation, pending batch-3 final audits and P9/browser checks still owed. If no hot-spot change is needed, say so;
do not create an API/core/nav patch merely because those files appear on the general hot-spot list.

Answer briefly: files written, every exported manifest helper and its contract, token decisions and patches,
documented flows, cases authored, exact commands actually run/results, generated-theme/P9 proof outstanding,
and anything missing or wrong in this brief. Do not paste full files or claim screenshots/tests you did not run.
