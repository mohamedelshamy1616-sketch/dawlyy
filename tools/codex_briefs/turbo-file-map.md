# Reinvention build: file ownership and three build batches

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`. This map covers all nine reinvention briefs,
including the unchanged R1b and the six briefs recovered from job `20261114-140240-turbo-briefs`.
These are build instructions, not evidence that an implementation or a gate has passed.

Before batch 1, Claude integrates R0a/R0a-2/R0c and R0b, plus the already-built R1a/R1c/R1d/R4a/R4c and their
exports. Confirm that the fresh full foundation gates pass; a STATE entry reporting running gates is not a pass.
Each builder starts from the preceding batch's integrated base in its own provisioned worktree, with
`node_modules` installed. No builder commits or pushes. No builder recreates R0c's archive, restore, void,
correction, client_modules, numeral-preference or red-flag endpoints.

## Reading the file column

The aliases below are literal path prefixes, not extra permissions:

- `W` = `apps/web`; `S` = `apps/web/src`; `C` = `apps/web/components`.
- `A` = `apps/web/app/[locale]`; `[locale]`, `[clientId]` and the other bracketed segments are literal folders.
- `M` = `apps/web/messages`; `I` = `tools/codex_briefs/integration`.
- Braces are finite expansion: `M/{ar,en}/activity.json` means exactly the two named files;
  `{page,loading}.tsx` means exactly page.tsx and loading.tsx. Expand every combination, without a glob.
- Only R1b retains its original folder permissions (`**`). Its `server/inbox` and `components/inbox` folders
  are new; its existing `shell/**` allowance is a legacy exception in the brief the owner said not to rewrite.
  No other task owns any direct file under that shell folder.
- The integration Markdown files are builder outputs. Paths in the hot-spot column are **patch targets**, not
  direct builder permissions. Claude applies these patches serially and retains preceding tasks' additions.

## All nine briefs

| Task / brief | Direct files (finite expansions above) | Hot-spot patches and other integration targets | Depends on: tasks merged and integrated first | Batch / merge order |
| --- | --- | --- | --- | --- |
| R1b — `r1b-inbox-nav.md` | `S/server/inbox/**` including its tests; `S/api/{inbox,inbox.test,index}.ts`; `S/components/shell/**` including `nav-reachability.test.ts`; `A/coach/page.tsx`; `A/coach/{library,money}/{page,loading}.tsx`; `C/inbox/**`; `M/{ar,en}/{nav,inbox,dashboard}.json` | Immutable legacy brief directly owns API index mount, shell/nav-items and nav/dashboard catalogs; it names no integration artifact. Registering inbox may require Claude's loader patch, or the brief's allowed nav-namespace fallback. No other builder changes these shared files. | Foundation baseline above. R1a ranking and R0c scoped reads/audits are ready. | **1 / 1** |
| R2a — `r2a-client-nav-today.md` | `C/app/client-tab-bar.tsx`; `A/app/layout.tsx`; `A/app/{today,plan,coach,me}/{page,loading}.tsx`; `C/client-today/{types,view-model,client-destinations}.ts`; `C/client-today/{today-view,today-actions,client-module-provider,client-hubs}.tsx`; `S/server/client-today/{page-data,coach}.ts`; `S/components/client-today/{view-model,navigation,components,actions}.test.ts`; `M/{ar,en}/clientToday.json`; `W/e2e/beta/r2a-client-start.spec.ts`; `I/r2a.md` | `I/r2a.md`: both locale loaders in `W/i18n/request.ts`; complete `S/components/shell/client-shell.tsx` import/mount/removal diff; any necessary compatibility metadata in `S/components/shell/nav-items.ts`. Shell patch follows R1b. Token requests only, for R5. | R1b; foundation baseline. Build against its merged shell; the client Today renderer/model must be available to R2c. | **2 / 2** |
| R2b — `r2b-client-corrections-quicklog.md` | `C/nutrition/{client-nutrition,client-log,client-history}.tsx`; `C/nutrition/types.ts`; `C/tracking/{tracking-screen,progress-panel}.tsx`; `C/tracking/contracts.ts`; `C/client-portal/history-view.tsx`; `A/app/nutrition/log/page.tsx`; `C/client-corrections/{entry-actions,meal-editor,measurement-editor}.tsx`; `C/client-quick-log/quick-log.tsx`; `S/lib/client-corrections/{types,eligibility,transport,quick-log,correction-actions}.ts`; `S/lib/client-corrections/{eligibility,transport,quick-log,correction-actions,components}.test.ts`; `M/{ar,en}/{clientCorrections,quickLog}.json`; `W/e2e/beta/r2b-corrections-quicklog.spec.ts`; `I/r2b.md` | `I/r2b.md`: `W/i18n/request.ts`; Quick log entry in `C/client-today/today-view.tsx`; createdAt typing/projection in `S/server/workout/{contracts,read}.ts`, with any exact affected fixture typing patch. No unvoid route or second undo implementation. | R1b, R2a **and R3a including its single toast mount**; foundation baseline. Imports R3a's exact hook; consumes R0c correction APIs. | **3 / 6** |
| R2c — `r2c-client-app-composer.md` | `A/coach/settings/client-app/{page,loading}.tsx`; `A/coach/clients/[clientId]/client-app/{page,loading}.tsx`; `C/client-app-composer/{composer,module-row,phone-preview}.tsx`; `C/client-app-composer/types.ts`; `S/lib/client-app-composer/{state,transport,preview}.ts`; `S/lib/client-app-composer/{state,transport,components}.test.ts`; `M/{ar,en}/clientAppComposer.json`; `W/e2e/beta/r2c-client-modules.spec.ts`; `I/r2c.md` | `I/r2c.md`: locale loaders; `A/coach/settings/page.tsx`; `A/coach/clients/[clientId]/page.tsx` scoped composer link; R1b route metadata if needed. Today renderer and API persistence remain read-only imports. | R1b, R2a; foundation baseline including R1c hub. Uses Today model/view and R0c existing override identity/payload contract. | **3 / 7** |
| R3a — `r3a-archive-undo-bulk.md` | `S/hooks/use-undoable-action.ts`; `S/lib/control/{undo-store,archive-transport,bulk-actions}.ts`; `S/lib/control/{undo-store,archive-transport,bulk-actions,control-components}.test.ts`; `C/control/{undo-toast,archive-controls,bulk-actions}.tsx`; `C/clients/client-list.tsx`; `C/program-builder/program-list.tsx`; `C/nutrition/{plans,foods}.tsx`; `C/form-builder/template-list.tsx`; `C/packages/{package-list,package-actions}.tsx`; `C/exercises/library.tsx`; `C/calendar/calendar-screen.tsx`; `A/coach/{clients,packages,nutrition,exercises}/page.tsx`; `M/{ar,en}/{archiveControls,controlUndo}.json`; `W/e2e/beta/r3a-archive-undo.spec.ts`; `I/r3a.md` | `I/r3a.md`: locale loaders; the **one** UndoToast mount in `A/layout.tsx`; `C/clients/client-detail.tsx` archive-control replacement; `C/nutrition/builder.tsx` archive-control replacement. Preserve hub review/activity slots and version controls. | R1b; foundation baseline including R1c. No build dependency on R2a/R3b/R4d siblings. Must integrate before R2b starts. | **2 / 3** |
| R3b — `r3b-activity-log.md` | `S/server/activity/{types,schemas,read,links,presentation}.ts`; `S/server/activity/{read,links,presentation,components}.test.ts`; `S/api/{activity,activity.test,activity.db.test}.ts`; `C/activity/{activity-log,version-detail}.tsx`; `A/coach/settings/activity/{page,loading}.tsx`; `A/coach/settings/activity/version/[kind]/[headId]/[versionNo]/{page,loading}.tsx`; `M/{ar,en}/activity.json`; `W/e2e/beta/r3b-activity-log.spec.ts`; `packages/db/test/security.activity-api.test.ts`; `I/r3b.md` | `I/r3b.md`: API index import/mount; locale loaders; client hub server page's existing activityLog slot; Settings hub link and R1b route metadata. Existing version reads/reverts are consumed unchanged. | R1b; foundation baseline including R1c. No build dependency on R2a/R3a/R4d or future R4b. Approval/history composition runs in P9. | **2 / 4** |
| R4b — `r4b-review-api-ui.md` | `S/server/review/{types,schemas,inputs,hash,preferences,service,proposals}.ts`; `S/server/review/{hash,inputs,approval,preferences,components}.test.ts`; `S/api/{review,review.test,review.db.test}.ts`; `C/review/{weekly-review-card,review-workspace,review-preferences}.tsx`; `A/coach/clients/[clientId]/review/{page,loading}.tsx`; `A/coach/settings/review/{page,loading}.tsx`; `M/{ar,en}/review.json`; `W/e2e/beta/r4b-review-approve.spec.ts`; `packages/db/test/security.review-api.test.ts`; `I/r4b.md` | `I/r4b.md`: API index root mount before clients router; locale loaders; client hub server page's reviewCard slot; actual R1b Inbox review action href; Settings hub and route metadata. Hash validation stays server-side; a stale approval returns 409 after committing stale status. | R1b, R4d; foundation baseline including R4a review exports, R1a attention, R4c safety and R1c hub. No build dependency on R2b/R2c/R5. | **3 / 8** |
| R4d — `r4d-ai-provider.md` | `S/server/ai/{types,none,config,prompt,anthropic,openrouter,index}.ts`; `S/server/ai/{config,providers,prompt,settings-component}.test.ts`; `C/ai-settings/provider-status.tsx`; `C/ai-settings/cost-table.ts`; `A/coach/settings/ai/{page,loading}.tsx`; `M/{ar,en}/aiProvider.json`; `W/e2e/beta/r4d-provider-off.spec.ts`; `I/r4d.md` | `I/r4d.md`: locale loaders; Settings hub link; R1b reachability metadata. No API/core mount. None is default; adapter tests use fake transport, and assert OpenRouter's exact deny-data-collection/no-fallback object. | R1b for actual navigation patch context; foundation baseline including R4a. No R4b dependency; exports the provider interface R4b consumes. | **2 / 5** |
| R5 — `r5-polish-proof.md` | `S/styles/tokens.css`; `W/app/globals.css`; `W/theme/dawlyy.theme.ts`; `S/lib/reinvent-proof/{manifest,manifest.test,tokens.test,formatting.test,components.test}.ts`; `W/e2e/screens.spec.ts`; `W/e2e/beta/r5-polish-proof.spec.ts`; `docs/qa/HOW_TO_TEST.md`; `I/r5.md` | `I/r5.md`: exact available-base numeral/empty-state and ar/en namespace fixes, inspected-surface evidence, any necessary R1d beta-gate selector patch. Prior owners' surfaces and catalogs remain read-only. Claude regenerates theme/built with the existing theme build command, then verifies parity; generated assets are not builder permissions. | R1b, R2a, R3a, R3b, R4d and foundation baseline. R2b/R2c/R4b are **contract-only concurrent inputs**, never imports/file-existence assertions in R5's own unit checks. Final audit and P9 proof wait for their integration. | **3 / 9** |

## Build batches and merge discipline

1. **Batch 1: R1b.** Review and merge it first. Settle its legacy direct hot-spot edits and namespace registration
   before creating the batch-2 bases. Every existing coach route remains reachable.
2. **Batch 2: R2a, R3a, R3b, R4d.** Their direct file sets are disjoint; build in separate worktrees from the
   integrated batch-1 base. Merge in order R2a -> R3a -> R3b -> R4d, applying each artifact serially and rerunning
   the appropriate integrated typecheck/owned tests. The shell mount, namespaces, undo toast and providers must
   be integrated before batch 3 starts. No sibling implementation is required for their own isolated checks.
3. **Batch 3: R2b, R2c, R4b, R5.** Direct file sets are disjoint; build from the integrated batch-2 base. R5 can
   prepare central tokens, test docs, the route inventory and P9 specs from the sibling contracts; it does not
   claim to inspect their unmerged implementations. Merge R2b -> R2c -> R4b -> R5. Claude then audits all three
   siblings for remaining token/numeral/state gaps, integrates concrete fixes and their token requests, and
   regenerates the theme before final screen proof. Re-anchor R5's exact B2-context patches without overwriting
   the B3 additions. This post-merge integration is part of P9 preparation, not a fourth build batch.

Four tasks in a batch are scheduling groups, not permission to exceed the repository's process budget. Dispatch
at most three builder jobs at once; a waiting fourth task can start in the next free slot of the same group.
Across all worktrees, coordinate at most three heavy Node processes total; each builder runs only its exact
typecheck and own new mocked Vitest files, sequentially, with one Vitest process. These docs-only brief writers
run none of those commands. Builders never run dev/build servers, Playwright, screenshots or database suites.

All patch artifacts can mention the same Settings hub, client hub, loader or navigation export. They are separate
files written concurrently; applying their contents is a serialized integrator action. Additive patches anchored
after `legal` must preserve every previously registered namespace in both locales. Keep reviewCard/activityLog,
the existing four hub tabs, and the single toast intact. Do not give a builder shared-file write permission to
resolve patch-context drift. No task needs to write core barrels or core package.json in these nine briefs.

## Overlap audit and minimal repair

The sole direct ownership collision in the resumed six briefs was `S/components/shell/client-shell.tsx` in R2a,
covered by R1b's immutable `shell/**` allowance. Removed it from R2a's direct list and made its import/mount/
removal diff an integration/r2a.md obligation, with the mounted-source assertion deferred until that patch is
applied. R2a's layout stays compatible with the original children-only shell signature. R1b remains unchanged.
No other existing brief was rewritten. New namespaces, integration artifacts, mocked/DB test files and e2e
specs are individually owned. After this repair there is no cross-task direct file collision, even across batches.

## P9 flow ownership and evidence still owed

- R4b: Inbox -> review -> approve/send, stale-hash refusal, client pain message -> coach flag, and measured
  equivalent-flow baseline/current duration for the 30% target. Missing baseline is not a passing claim.
- R3a: archive -> undo -> Archived filter -> restore, with bulk/calendar recovery. R3b separately owns scoped
  history/actor/item/version evidence and explicit revert-to-new-draft checks, using independent fixtures.
- R2c: hide nutrition -> no client entry points -> valid client write gets 403 module_disabled.
- R2a: client starts the live workout in at most two actions (one-tap target), and exactly one mounted tab bar.
- R2b: correct a meal -> Undo with zero mutation before expiry, committed correction history, and two-tap quick log.
- R5: client hub assignment in at most three taps; final cross-screen numeral/empty/error/touch-target proof;
  all screen routes in ar/en at 360/390/430/1366 plus Astryx 375/1440. R4d owns off-provider settings proof.

Specs are authored by their owners but run only in P9. DB-backed activity/review suites also run only in P9;
their mocked route tests cannot establish RLS isolation. Claude preserves the eight checks, runs complete
integration/security/browser gates and Astryx doctor, records actual screens and findings, and handles the
P9 review. These briefs do not authorize a completion stamp, hosted-model request or staging publish.
