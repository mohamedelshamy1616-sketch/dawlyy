# Batch R4b: weekly review API, coach approval and the review workspace

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, R4b:

> `POST /api/v1/clients/{id}/review` builds the review from current data. It stores an `ai_drafts` row
> (`provider: none`) with the input hash.
> The coach edits the draft. "Approve and send" re-checks the hash, posts the message through the existing
> messages API, and audits. "Apply proposal" creates the draft version for the coach to publish.
> A stale draft shows "data changed, rebuild".
> The weekly review card sits in the client hub Week tab and in the Inbox row action "review".
> A timer in the e2e test records how long a coach's review takes, as evidence for the 30% promise against the
> current flow.

Read R0c, R1b, R4a and R4d's briefs; the actual core `attention/`, `review/`, `safety/`; schema `review.ts`;
migration 0008's `app.approve_ai_draft`; and security design sections 5.2, 9.2 and 12.1. All Hard limits bind:
no spending, hosted-model calls on client data, meal-photo calories, payment void/correct, secrets, remote/account
actions or weakened checks. Corrections retain history. Use existing RLS, guards and audit triggers unchanged.

Work in your own provisioned worktree with `node_modules` installed. Read `_common_web.md`; this brief overrides
its old command ban, message-namespace registration assumption and component-test exclusion only as described
below. Claude integrates and commits. No app servers, builds, lint, Astryx CLI, Playwright or database runs here.

## Files you may write

Create only these exact files:

- `apps/web/src/server/review/types.ts`
- `apps/web/src/server/review/schemas.ts`
- `apps/web/src/server/review/inputs.ts`
- `apps/web/src/server/review/hash.ts`
- `apps/web/src/server/review/preferences.ts`
- `apps/web/src/server/review/service.ts`
- `apps/web/src/server/review/proposals.ts`
- `apps/web/src/server/review/hash.test.ts`
- `apps/web/src/server/review/inputs.test.ts`
- `apps/web/src/server/review/approval.test.ts`
- `apps/web/src/server/review/preferences.test.ts`
- `apps/web/src/server/review/components.test.ts`
- `apps/web/src/api/review.ts`
- `apps/web/src/api/review.test.ts`
- `apps/web/src/api/review.db.test.ts`
- `apps/web/components/review/weekly-review-card.tsx`
- `apps/web/components/review/review-workspace.tsx`
- `apps/web/components/review/review-preferences.tsx`
- `apps/web/app/[locale]/coach/clients/[clientId]/review/page.tsx`
- `apps/web/app/[locale]/coach/clients/[clientId]/review/loading.tsx`
- `apps/web/app/[locale]/coach/settings/review/page.tsx`
- `apps/web/app/[locale]/coach/settings/review/loading.tsx`
- `apps/web/messages/ar/review.json`
- `apps/web/messages/en/review.json`
- `apps/web/e2e/beta/r4b-review-approve.spec.ts`
- `packages/db/test/security.review-api.test.ts`
- `tools/codex_briefs/integration/r4b.md`

Nothing else. Existing inbox/client-hub/settings files, core barrels/package.json, database schema/migrations,
API index, shell `nav-items.ts`, shared root/per-namespace catalogs and `i18n/request.ts` are read-only. Messages
actually live in independent `messages/ar/<namespace>.json` and `messages/en/<namespace>.json`; own only `review`.
Both `.db.test.ts` and the package database suite are written now and run only in P9, never in your acceptance.

## Interfaces consumed

Core contracts, with their actual signatures:

```ts
weekReview(input: WeekReviewInput, opts: { locale: 'ar' | 'en' }): WeekReview
canonicalReviewInput(input: WeekReviewInput): string
applyNutritionChange(document: NutritionDocument, change: NutritionChange,
  currentVersionId: string): NutritionDocument
rankAttention(clients: readonly AttentionInput[], opts: { today: IsoDate }): AttentionItem[]
detectRedFlags(text: string): RedFlagMatch[]
```

Use R4a's validated input and proposal types without modifying them. R4d exports:
`getAiProvider(options?: {env?: AiProviderEnv; transport?: typeof fetch}): AiProvider`, whose
`draft({review,locale,dialect,signaturePhrases}): Promise<{provider:'none'|'anthropic'|'openrouter';text:string}>`.
Default `none` returns the template verbatim. Tests force `none` and deny global network. Do not call external
adapters while building or checking; never let generated text replace deterministic numbers or proposals.

R1b's `GET /api/v1/inbox?limit=50` returns
`{items:[{client:{id,displayName,code,avatarMediaId?},score,reasons,primaryAction}],today}`. Its `review` action
must open `/coach/clients/{id}/review`. Reuse R1b's input-query decisions and the existing dashboard/workout/
tracking reads; do not recreate the inbox endpoint or change its response.

R0c provides `GET /api/v1/red-flags?status=open&clientId={id}` (paginated flag rows) and
`POST /api/v1/red-flags/{id}/handle` with no body, returning the handled row. Respect its `clients review` or
`checkins review` permission. Its archive/unarchive, void/correct, module configuration and client `module_disabled`
gates already exist: consume their effects in input reads; do not rebuild any of those routes. Voided rows never
contribute to totals, adherence or trends. Staff review writes are not client-module writes.

Use existing services inside the same authenticated transaction instead of HTTP loopback:

```ts
openConversation(tx: Tx, auth: AuthContext, requestedClientId: string | undefined)
sendMessage(tx: Tx, auth: AuthContext, conversationId: string,
  input: {body?: string;mediaIds?: string[];replyToId?: string;clientUuid: string})
notifyMessage(auth: AuthContext, conversation: {id:string;clientId:string|null},
  message: {id:string;body:string|null;attachments:readonly unknown[]}): Promise<number>
putNutritionDraft(tx: Tx, auth: AuthContext, id: string,
  body: {document: NutritionDocument;baseVersionNo:number;baseRevision?:string;changeNote?:string})
```

Read their real inferred return types rather than redeclaring them. Sending uses existing messages permissions,
events and idempotency. `notifyMessage` runs only after commit. The existing nutrition draft endpoint is
`PUT /api/v1/nutrition/{id}/draft` with that body; version diff is
`GET /api/v1/nutrition/{id}/versions/{a}/diff/{b}`. Published document edits append a draft; no automatic publish.

## Produced API and shared types

Export these contracts from your own `types.ts`/service files, never a core barrel:

```ts
type ReviewPreferences = {dialect:'egyptian'|'gulf';signaturePhrases:string[]};
type ReviewDraftDto = {
  id:string;clientId:string;status:'draft'|'approved'|'rejected'|'stale';
  provider:'none'|'anthropic'|'openrouter';inputVersion:string;createdAt:string;
  review:WeekReview;text:string;evidenceUnavailable:string[];
  proposalDraft:{planId:string;versionId:string;versionNo:number}|null;
};
loadReviewInputs(tx:Tx,auth:AuthContext,clientId:string,
  context:{period:{from:IsoDate;to:IsoDate};locale:'ar'|'en';coach:WeekReviewInput['coach']})
  :Promise<{input:WeekReviewInput;sourceRevision:string}>;
hashReviewInputs(input:WeekReviewInput,sourceRevision:string,locale:'ar'|'en'):string;
getLatestReview(tx:Tx,auth:AuthContext,clientId:string):Promise<ReviewDraftDto|null>;
```

Implement one OpenAPI router, authenticated and staff-only for every owned path. Use Zod 4 strict request schemas,
`idempotentReplay` on mutations, `ApiError` envelopes and `withAuthTx`; never `withServiceTx` or `sql.raw`.
Require `clients view` plus `checkins review` before reading review evidence. The target client must be visible
and in-scope; inaccessible client/draft returns 404, clients get 403, missing auth 401. Additional source module
permissions remain enforced: omit unauthorized optional evidence, never elevate scope to build a fuller review.

| Method/path (all below `/api/v1`) | Request | Success |
|---|---|---|
| GET `/clients/{clientId}/review` | no body | 200 `{draft:ReviewDraftDto|null}` |
| POST `/clients/{clientId}/review` | `{locale:'ar'|'en',period?:{from:IsoDate,to:IsoDate}}` | 201 `ReviewDraftDto` |
| PATCH `/clients/{clientId}/review/{draftId}` | `{text:string}` trimmed, 1..4000 | 200 `ReviewDraftDto` |
| POST `/clients/{clientId}/review/{draftId}/approve` | strict `{}` | 200 `{draftId,status:'approved',conversationId,messageId,notified:boolean}` |
| POST `/clients/{clientId}/review/{draftId}/proposal` | `{proposalCode:ProposalCode}` only | 201 `{planId,versionId,versionNo}`; 200 same result on replay |
| GET `/settings/review-preferences` | no body | 200 `ReviewPreferences` |
| PUT `/settings/review-preferences` | full `ReviewPreferences`, max 5 phrases, each 1..200 | 200 saved preferences |

Preferences require staff and `checkins review`; only the caller's preferences row is read/written. Store a
validated `preferences.review` JSON object, default Egyptian and empty phrases. The current UserPreferences type
does not name this key; use parameterized `jsonb_set`/JSON expressions to merge just it, retaining numerals,
channels and every other key. Read the unknown JSON key through validation. No shared type, guard or schema edit.
Self-only RLS and `user_preferences_50_guard` already permit updating preferences. Reject unknown request keys.

## Build, edits and the server-side stale binding

1. Default period: the client's local today and preceding 6 calendar days, inclusive. Accept only a validated
   period of 1..14 days through the core schema. Store its exact bounds, locale and original coach snapshot in
   server-owned draft body metadata. Approval reloads that fixed period and snapshot; a changing clock or another
   approver's name must not produce different inputs. `input_version` is `review-v1:{from}:{to}`; never rewrite it.
2. Load current authorized data into the real WeekReviewInput: completed nonvoided workouts against planned events
   for period and preceding equal period; meal-log days/totals; current and previous submitted check-ins with typed
   answers; nonvoided weight and measurement series; existing workout comparison PRs/stalls; open flags; current
   published nutrition version/targets; attention input/reasons. Reuse known readers and calculations. Missing
   information stays null/empty, never fabricated progress. Mark unavailable source modules separately in the DTO
   and hide their synthetic empty aggregates as unavailable evidence. Validate with `WeekReviewInput.parse`.
3. Build `sourceRevision` as canonical JSON of the source identity/version/timestamp markers that fed those
   inputs, sorted by table and id: include row ids, update/void state, relevant published version ids and current
   open flag ids/status. This catches a correction that happens to leave aggregate numbers equal. Include source
   permissions/projection so a later loss of access cannot approve a fuller old snapshot. Do not use row order.
   Bind published nutrition source version/document, not its mutable head updatedAt/currentVersionId or this
   review's own unpublished proposal version. Creating that proposal must not immediately stale its review.
4. SHA-256 server-side: `createHash('sha256').update(JSON.stringify({locale,canonical:
   canonicalReviewInput(input),sourceRevision})).digest('hex')`. Store it in `ai_drafts.input_hash`; store core
   result, draft text and protected context in `body`, `kind:'week_review'`, actual provider, status draft. The
   client never supplies input/hash/provider/source identity. No hosted call in this build.
5. PATCH locks the in-scope draft and changes text only while status draft; preserve context, computed summary,
   proposals, input hash/version/provider and any proposal result. Reject any attempt to edit server metadata.
   Non-draft edits return 409 `draft_not_editable`. Before returning any stored summary or text, including GET,
   check that the caller still holds the source module grants captured for that snapshot; otherwise return 403
   `review_evidence_not_allowed` without serializing the old fuller evidence. Never leak a summary before checking.
6. Approval locks the row `FOR UPDATE`, checks `checkins review` and `messages create`, reloads current evidence
   using its protected context, recomputes the hash independently, and calls
   `select app.approve_ai_draft(draftId, recomputedHash)` in that same authenticated transaction. NEVER compare a
   hash provided by the browser, pass stored inputHash as the current hash, or update approved/stale directly.
7. If the function returns `stale`, return a typed stale result from the transaction callback. Let `withAuthTx`
   COMMIT the status change, THEN map it in the route to 409 `review_stale`. Throwing inside the callback would
   roll back the stale mark and is incorrect. No message, notification or nutrition write may occur on this path.
8. Recheck open red flags server-side before sending or creating a proposal. Return 409 `red_flags_open` and show
   the handled flag controls, never advice. Handling changes inputs, so rebuild before approving. On matching
   inputs, approval plus `openConversation` and `sendMessage` is one transaction; a send failure rolls approval
   back. Use stable server `clientUuid = draftId`, never a fresh UUID on each click. Existing triggers audit the
   approval; do not double-audit or invent action names. Notify only after successful commit and report failure
   as `notified:false`, keeping the already-sent message recoverable.
9. An already-approved retry does not call the approval function or send a second message. Resolve its message
   by `(tenantId,senderUserId=approvedBy,clientUuid=draftId)` and expected client conversation; return the existing
   ids. This also handles a different in-scope coach retrying. Never trust a browser message id. A missing linked
   message is an integrity failure, not permission to send again. Rejected/stale drafts return 409.

The recomputation must read source data and approve/send without leaving its transaction. Test a source change
between build and approval and concurrent duplicate approval; record P9 concurrency evidence. Do not claim that
a draft-row lock locks all source tables, or alter shared transaction helpers to conceal that limitation.

## Proposals, card and editing UI

The proposal endpoint works on a draft review and rechecks hash, open flags, `nutrition edit` and current
published `fromVersionId`. Accept only a stored/recomputed matching core proposal code; ignore no client-supplied
targets/deltas. Lock nutrition using its existing advisory-lock convention. Refuse 409 `proposal_version_mismatch`
if published source changed, or 409 `nutrition_draft_exists` if another unpublished working version exists. Call
`applyNutritionChange` and `putNutritionDraft` with actual baseVersionNo/baseRevision; never overwrite a coach's
unpublished work, write a published document, call publish or change a program for a nutrition-only proposal.
Record resulting plan/version ids in draft body before approval; repeat returns the same draft. Once the review
is approved its body is immutable: link to an already-created proposal draft, or rebuild to propose new work.
Show the existing nutrition history/diff UI and the separate publish action. No proposal applies itself.

`WeeklyReviewCard({clientId,initial:ReviewDraftDto|null})` is a small Week-tab entry; `ReviewWorkspace` owns the
summary, editable text, explicit approve/send, stale/rebuild, handled flag actions and proposal draft controls.
The dedicated route also serves Inbox's review action. Settings provides dialect/signatures with save/error
states. Never send or build drafts automatically on mount; show empty week, no draft and unavailable evidence.

In `integration/r4b.md`, write exact unified patches with real surrounding lines for Claude, not prose hints:
add `import {router as reviewRouter} from './review';` and `app.route('/', reviewRouter);` BEFORE the existing
`app.route('/clients', clientsRouter);` in API index, with middleware restricted to owned paths; add both locale
`review` loader imports after `legal`; import WeeklyReviewCard in the client hub server page and pass
`reviewCard={<WeeklyReviewCard clientId={client.id} initial={null} />}` to its existing ClientDetail; the card
explicitly loads GET when opened, no draft mutation.
Patch the actual merged R1b review action href, Settings hub link using `getTranslations('review')`, and its
reachable route metadata if needed. Use existing `reviewCard` slot; never modify ClientDetail for a second slot.
R3b owns the activity slot separately. No hot-spot file is writable in this task.

## UI rules

Follow both Astryx blocks in `apps/web/AGENTS.md`, including pinned imports/client boundaries, existing RTL/fonts,
Heading/Text, token-backed layout props, rows for dense data, badges for counts only, and no new shadcn, raw
layout div/span, inline style or Tailwind theme bridge. Read installed templates/components instead of CLI runs.
Every visual value comes from read-only `app/globals.css`/imported DAWLYY theme; report missing tokens for R5.
Use next-intl `review` namespace, identical ar/en keys, Egyptian Arabic RTL and English LTR. All targets >=44 px,
keyboard accessible, and no horizontal overflow at 360, 390 or 430 px. P9 also proves Astryx 375/1440 px.
Use `formatNumber(value,{locale,numerals,maximumFractionDigits?})`, `formatKcal(value,{locale,numerals})`,
`formatMacro(value,{locale,numerals})` and `numeralPolicy(preferences)` from R0b `src/lib/numbers.ts`; no separate
number formatter or native-locale digit default. Draft text is editable prose: format generated numeric tokens
before editing, never blindly rewrite a coach's whole textarea on rerender. Provide loading/error/empty states;
settled success, stale and forbidden screens must not remain skeletons or `aria-busy=true`.

## Tests and P9 ownership

Own new Node Vitest tests only: hash cases for shuffled sources, changed answers/voids/published versions/flags
and equal aggregates with different source IDs; input projection excludes voided rows and missing permissions;
preferences JSON merge preserves numerals/channels and validates both dialects. Mock authenticated transactions,
services/provider transport for unit/API tests, not global authority assumptions. Component tests use React
createElement/renderToStaticMarkup with next-intl/Astryx mocks, no jsdom/testing-library/dependency/config edits.
Assert ar/en summary, empty week, edited text retained, explicit controls, stale rebuild, flag-blocked actions,
proposal draft/diff links and no settled skeleton. UI actions are additionally exercised in P9.

The REQUIRED approval test builds at hash A, changes current source to B, submits approve with a forged hash A
(strict body rejects it) and then valid `{}`: valid approval returns 409 `review_stale`, draft status is persisted
stale, and sendMessage/notifyMessage/proposal calls are zero. Test matching hash success, send rollback, double
click/concurrent retry single message, different approver retry, open flag block, missing/inaccessible draft,
no checkins/messages/nutrition permission, source permission lost before reading a stored draft, attempted
inputHash/provider edits, draft conflict and proposal replay. Test build -> proposal draft -> approve/send
succeeds while changing the published source instead returns stale. Own proposal metadata is excluded correctly.

Write `review.db.test.ts` with the real API harness for these boundary/isolation/stale-commit/rollback cases,
and `security.review-api.test.ts` for direct RLS/guard refusal: cross tenant/scope, client draft reads, direct
approval/stale edits, immutable hash/version/provider and audit stamps. Run these only in P9's test-web/test-db.

Write `e2e/beta/r4b-review-approve.spec.ts`, `@ar` and `@en`, using existing beta helpers read-only. Own P9 flows:
Inbox -> review -> edit -> approve/send -> client sees exactly that message; client sends a pain-term message ->
coach inbox red flag -> review blocks -> coach handles -> rebuild -> approval allowed. Include stale-input 409
from an intervening correction and no send. Record review elapsed milliseconds from opening client evidence to
successful send. Measure the legacy/manual route on equivalent seeded client data with the same start/end and
actions, attach baseline/current/ratio, and assert the 30% target only from an actual comparable baseline. If
the baseline is unavailable, report missing evidence; never fabricate or weaken timing proof. These specs and
screens run only in P9, together with Astryx doctor, all eight checks and adversarial review. Keep the existing
eight `tools/checks.json` entries; the named suites/specs join through existing discovery, no ninth check.

## Acceptance checks you run yourself

Run sequentially in your provisioned worktree; these are the only checks you may run:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/server/review/hash.test.ts src/server/review/inputs.test.ts src/server/review/approval.test.ts src/server/review/preferences.test.ts src/server/review/components.test.ts src/api/review.test.ts --maxWorkers=1
```

Expected: exit 0 for both, no TypeScript errors, all named unit/component/mock-route tests pass without skips,
DB connections or network. One Vitest process at a time. Never run DB-backed files/full suites, dev/start/build,
lint, Playwright or Astryx CLI. Record actual results and unapplied integration patches; browser/P9 proof is owed.

## The answer wanted

Files written; exact routes, request/response shapes and permissions; produced signatures; source/hash projection
and stale-commit behavior; message/proposal idempotency; preferences storage decision; exact integration patches;
unit-check results; P9 test ownership/timing evidence still owed; decisions taken and anything wrong in the brief.

## Errata (Claude, 14 Nov, checked against main after R0c; these override the text above)

- `app.approve_ai_draft` returns `'stale'` only on an input-hash mismatch. It raises SQLSTATE P0001 for a draft that is no longer `draft` and 42501 for no access. Map them with `server/postgres-code.ts`: P0001 to 409, 42501 to 403.
