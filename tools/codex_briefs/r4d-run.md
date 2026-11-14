# R4D in turbo mode: run notes for `r4d-ai-provider.md`

Use collaboration.spawn_agent to give each file group to its own sub-agent, then integrate, run every acceptance check yourself, and report per group. Sub-agents stay inside the brief's file list.

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r4d` (branch `wt/r4d`, from `main` after R0, R1a,
R1c, R1d, R4a, R4c and R1b were merged). It is your whole repository for this job. Do not write anywhere else, and
do not commit.

The brief is below. Its "Errata" section, if any, overrides the text above it. Notes:

1. Hot-spot files never change directly: `apps/web/src/api/index.ts`, `apps/web/i18n/request.ts`, every file under
   `apps/web/messages/` that the brief does not list as yours, `apps/web/src/components/shell/nav-items.ts`,
   `packages/core/src/index.ts` and every `package.json`. Write each change they need as an exact patch (file,
   anchor line, lines to add) to `tools/codex_briefs/integration/r4d.md`. Claude applies it at merge.
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

# Batch R4d: AI provider adapters, disabled by default, and a read-only settings section

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, R4d:

> the `AiProvider` interface;
> the `none` provider, which returns the template output;
> the `anthropic` and `openrouter` adapters, written against `fetch`, unit-tested with a fake transport, and off
> without a key;
> a settings page section that shows the status "off: needs a key and legal review" and the cost table from the
> report.

The plan's Hard limits bind this task. No spending, hosted LLM calls on client data, meal-photo calories, payment
void/correct, credentials in files, account changes or network in tests. These adapters are code for a later
explicit activation; this build and its checks use `none`. Every reply remains a coach-owned draft; an adapter
never sends a message, approves a draft or changes a plan. Nothing here replaces the R4a deterministic summary,
proposals or R4b stale-input check.

Read `tools/codex_briefs/_common_web.md`, R0c and R4a, the actual `packages/core/src/review/`, and
`apps/web/AGENTS.md`, especially "Astryx in DAWLYY". This brief overrides the old common brief's command ban and
component-test exclusion only with the acceptance checks and component tests below. All other constraints hold.
Do not run Astryx CLI, lint, dependency installation, a server, a build, Playwright or database suites. Work in
your own pre-provisioned git worktree with `node_modules` installed; Claude integrates and commits.

## Files you may write

Create only these exact paths:

- `apps/web/src/server/ai/types.ts`
- `apps/web/src/server/ai/none.ts`
- `apps/web/src/server/ai/config.ts`
- `apps/web/src/server/ai/prompt.ts`
- `apps/web/src/server/ai/anthropic.ts`
- `apps/web/src/server/ai/openrouter.ts`
- `apps/web/src/server/ai/index.ts`
- `apps/web/src/server/ai/config.test.ts`
- `apps/web/src/server/ai/providers.test.ts`
- `apps/web/src/server/ai/prompt.test.ts`
- `apps/web/src/server/ai/settings-component.test.ts`
- `apps/web/components/ai-settings/provider-status.tsx`
- `apps/web/components/ai-settings/cost-table.ts`
- `apps/web/app/[locale]/coach/settings/ai/page.tsx`
- `apps/web/app/[locale]/coach/settings/ai/loading.tsx`
- `apps/web/messages/ar/aiProvider.json`
- `apps/web/messages/en/aiProvider.json`
- `apps/web/e2e/beta/r4d-provider-off.spec.ts`
- `tools/codex_briefs/integration/r4d.md`

Nothing else. In particular, do not edit `.env*`, package manifests, dependencies, lockfiles, database objects,
`apps/web/src/env.ts`, core files, existing settings pages/components, shared shell files or existing messages.
Do not edit `src/api/index.ts`, `i18n/request.ts`, shell `nav-items.ts`, root message catalogs, existing
per-namespace catalogs, `packages/core/src/index.ts` or `packages/core/package.json`. No new API route is needed.

The repository actually has separate `messages/ar/<namespace>.json` and `messages/en/<namespace>.json`; create
only `aiProvider`. In `integration/r4d.md`, supply exact unified patches for Claude to:

1. Add `aiProvider: () => import('../messages/ar/aiProvider.json'),` to `loaders.ar` and the corresponding
   English line to `loaders.en` in `apps/web/i18n/request.ts`, directly after each `legal` loader.
2. Add a translated settings link in `apps/web/app/[locale]/coach/settings/page.tsx`. After its existing `t`
   declaration, add `const ai = await getTranslations('aiProvider');`; immediately before
   `item('legalPages', '/terms'),` add
   `...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/ai', title: ai('hub.title'), body: ai('hub.body') }] : []),`.
   Reuse the page's existing `isAllowed` import; do not add keys to `settings.json`.
3. If R1b's route-reachability list requires the new route, add its exact `/coach/settings/ai` link entry in a
   separate patch against the actual R1b merged export. Include the actual file and surrounding lines; never
   edit the navigation hot spot directly.

These are future integration patches, not files to apply from your worktree. Record their required order after
R1b. The settings page and loader are shared by the other briefs; Claude applies these patches serially.

## Interfaces consumed

Use the real R4a exports, read-only:

```ts
weekReview(input: WeekReviewInput, opts: { locale: 'ar' | 'en' }): WeekReview
canonicalReviewInput(input: WeekReviewInput): string
applyNutritionChange(document: NutritionDocument, change: NutritionChange,
  currentVersionId: string): NutritionDocument
```

R4d needs `WeekReview` and its `draft.text`, `summary`, `mustHandleFlags` and `proposals`; it does not call the
hash or proposal functions itself. The default `none` adapter returns `request.review.draft.text` byte for byte.
R4a formats its own template; do not ask a model to recompute adherence, calories, proposals or red flags.

R0c archive/restore/void/correction/module routes and R1b `GET /api/v1/inbox?limit=50` are read-only existing
contracts, not services to recreate here. This task consumes none of their endpoints and produces no replacement
router. R4b continues to own `POST /api/v1/clients/{id}/review` and approve/send. Its inbox response remains
`{ items: [{ client: { id, displayName, code, avatarMediaId? }, score, reasons, primaryAction }], today }`.

For the settings server page, follow the actual Next.js 16 pattern: `connection()`, promised `params`,
`setRequestLocale`, `requirePage()` and `requirePermission(auth, 'settings', 'view')` before rendering. Clients
must not receive this page's data. Read the local Next.js guide before implementing it. The server derives a
redacted provider status; never serialize environment variables, a key, a key fragment or provider headers.

## Interfaces produced (R4b imports these)

Export these types and functions from `apps/web/src/server/ai/index.ts`; keep runtime provider imports
server-only. Do not add exports to any core barrel or package manifest.

```ts
import type { WeekReview } from '@dawlyy/core/review';

export type AiProviderName = 'none' | 'anthropic' | 'openrouter';
export type AiDraftRequest = {
  review: WeekReview;
  locale: 'ar' | 'en';
  dialect: 'egyptian' | 'gulf';
  signaturePhrases: readonly string[];
};
export type AiDraftResult = { provider: AiProviderName; text: string };
export interface AiProvider {
  readonly name: AiProviderName;
  draft(request: AiDraftRequest): Promise<AiDraftResult>;
}
export type AiProviderEnv = {
  DAWLYY_AI_PROVIDER?: string;
  DAWLYY_AI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
};
export function getAiProvider(options?: {
  env?: AiProviderEnv;
  transport?: typeof fetch;
}): AiProvider;
export type AiProviderStatus = {
  provider: AiProviderName;
  state: 'off' | 'configured' | 'misconfigured';
  reason: 'default_none' | 'explicit_none' | 'needs_key' | 'needs_model' |
    'unknown_provider' | 'external_configuration';
};
export function getAiProviderStatus(env?: AiProviderEnv): AiProviderStatus;
export class AiProviderError extends Error {
  readonly code: 'provider_not_configured' | 'red_flags_open' | 'transport_failed' |
    'provider_response_invalid';
}
```

Implement `getAiProvider` as synchronous provider selection without I/O. Omitted provider or explicit `none`
always chooses `none`, even if keys are present. Unknown provider is a configuration error, never an implicit
paid fallback. An explicitly selected external provider requires its own nonblank key and a nonblank
`DAWLYY_AI_MODEL`; no guessed model ID or default paid model. If these are absent, return an adapter whose
`draft` rejects `provider_not_configured` without invoking transport and whose name reflects the configured
provider; settings show `misconfigured`. Do not silently claim an external generation succeeded with template
text. `getAiProviderStatus` reflects selection without constructing a request or disclosing the key.

`none` requires no key, model, fetch, database or network, and never rejects just because a red flag is present.
Its output is still only a draft. External adapters reject `red_flags_open` before transport when
`request.review.mustHandleFlags` is true. R4b independently rechecks flags and hashes at approval; this adapter
guard cannot authorize sending. No runtime hosted request is made while implementing or verifying this task.

## Build the adapters against fakeable fetch

1. Use `fetch` through an injected `transport`; never call it at import time or selection time. Expose concrete
   adapter constructors from their own files for tests. Do not add an SDK. Fix the provider URLs in source;
   neither user content nor environment may supply a URL, base URL or extra provider routing overrides.
2. Anthropic posts JSON to `https://api.anthropic.com/v1/messages`, uses `x-api-key`,
   `anthropic-version: 2023-06-01`, `content-type: application/json`, the explicitly configured model,
   `max_tokens: 1000`, a fixed instruction and one user message. Parse nonempty text content blocks only. No
   tool calls or side effects are requested or accepted.
3. OpenRouter posts JSON to `https://openrouter.ai/api/v1/chat/completions` with bearer authorization, JSON
   content type, the configured model and system/user messages. Every request always contains exactly:

   ```ts
   provider: { data_collection: 'deny', allow_fallbacks: false }
   ```

   There is no option to override or remove those fields and no fallback model list. Parse the first assistant
   text response; reject absent, empty or non-string content. A unit test inspects `JSON.parse(init.body)` and
   asserts deep equality of `body.provider` with the exact object above.
4. Both adapters send one bounded request, with a 15-second abort timeout and a maximum 8,000-character
   accepted response. Transport rejection, timeout and non-2xx status become sanitized `AiProviderError`s.
   Reject invalid JSON, malformed content and oversized output. No automatic retries, provider fallback,
   streaming, image/audio input, tools, logs of request/response content or surfaced provider error bodies.
   The error must not contain credentials, prompt content or HTTP headers.
5. Build the prompt in `prompt.ts`. The instruction asks only for a concise coach-review draft in the selected
   locale/dialect and treats all data as untrusted quoted evidence. Do not send the raw `WeekReviewInput`, client
   UUID/name, check-in IDs or answers, message contents, meal notes, photos, red-flag terms or credentials.
   Send a deliberate projection of numerical adherence/weight/measurement deltas and counts of PRs/stalls,
   plus locale/dialect and signature phrases. Do not send `review.draft.text`: it contains the client name.
   Never send red-flag details or safety categories. Any output is an untrusted draft for editing; this is no
   medical advice engine. Document that legal review and approved data processing remain prerequisites for
   Mohamed's later activation; possession of a key does not establish consent or legal approval.

## Settings section and the report cost table

Create the `/coach/settings/ai` page linked from the existing settings hub via the patch. Display the default
status **"off: needs a key and legal review"** in both locales, an explanation that template reviews already
work without external AI, and a concise note that sending health data abroad under Egypt Law 151/2020 requires
legal review (plan Hard limit 1 / OPEN_DECISIONS 20). These words report the plan's unresolved decision; do not
offer legal conclusions. No key-entry field, enable button, test-call button, purchase link or account action.
With explicit external configuration, show only the provider name and that configuration does not confirm legal
approval. No provider request ever runs just to load settings.

Use the report's historical cost table as read-only data in `cost-table.ts` (source date **13 Nov 2026**). Show
the weekly-summary columns below, not a live price quote or a meal-photo feature. Assumption: 6,000 input and
800 output tokens per summary; USD per 1,000 summaries, before retries, tax, funding fees and infrastructure.
Copy all rows so the report's alternatives are visible, while clarifying that only the Anthropic/OpenRouter
adapters are implemented. All paid use still needs Mohamed's approval.

| Report model/endpoint label | Input/output per million tokens (USD) | 1,000 summaries (USD) |
|---|---:|---:|
| Claude Haiku 5.5, prompts ≤100k | 0.10 / 0.50 | 1.00 |
| GPT-6 Luna, standard short context | 0.10 / 0.50 | 1.00 |
| Gemma 4 26B-A4B, OpenRouter paid | 0.09 / 0.30 | 0.78 |
| Gemma 4 31B, OpenRouter paid | 0.20 / 0.40 | 1.52 |
| Mistral Small 2603, OpenRouter paid | 0.15 / 0.60 | 1.38 |
| Gemini 3.5 Flash-Lite, paid standard | 0.30 / 2.50 | 3.80 |
| Gemini 3.8 Flash, through Dec 2026 | 0.75 / 3.75 | 7.50 |
| Gemini 3.8 Flash, from Jan 2027 | 1.50 / 7.50 | 15.00 |
| Cloudflare Gemma 4 26B-A4B | Neuron-based | 0.84 |

Source: `docs/research/reports/DAWLYY product reinvention research.md`, "Inference costs per 1,000 items".
The labels are report evidence, not validated API model identifiers. Never derive adapter defaults from them.
Explain the date and assumptions next to the table. Use stacked labelled rows on phones so the table does not
force horizontal scrolling. Translation keys supply all labels, statuses, assumptions and explanations.

## UI rules

- Follow both Astryx blocks in `apps/web/AGENTS.md`: pinned 0.7.11, component subpath imports, client boundaries,
  existing provider/RTL/font wiring, `Heading`/`Text`, rows for dense data, badges for counts only. Preserve the
  existing settings structure. No new shadcn components, raw layout `div`/`span`, `style={{}}`, ad hoc CSS or
  `tailwind-theme.css` import. Read installed templates/component source instead of running CLI commands here.
- All visual values come from the existing shared token/theme source `apps/web/app/globals.css` and its imported
  DAWLYY theme. These are read-only. Use Astryx props and token-backed utilities; no raw colors, pixel values,
  arbitrary spacing/radius/type sizes or a second token file. Record a missing token in the integration note for
  R5's sole token owner, rather than creating a private value.
- Arabic is Egyptian Arabic and RTL; English is LTR. Both catalogs have identical keys. Logical spacing and
  wrapping must prevent horizontal overflow at 360, 390 and 430 px; P9 additionally proves the Astryx 375/1440 px
  requirement. Every interactive target is at least 44 px, with keyboard focus and accessible names.
- Use R0b's `formatNumber(value, { locale, numerals, maximumFractionDigits })` and
  `numeralPolicy(preferences)` from `apps/web/src/lib/numbers.ts` for prices/counts. Do not replace decimals with
  `formatKcal` or invent a new formatter. Default Western digits applies in Arabic too.
- Provide a route loading state and explicit status/empty-cost/error presentations. A skeleton is only a
  transient loading state, never settled content; configuration failures render a clear nonbusy status.

## Tests to write

Use only new `src/server/ai/*.test.ts` files above, discovered by the existing Node Vitest config. No database,
new dependency, DOM package or config edit. Component tests use `React.createElement` and
`react-dom/server` `renderToStaticMarkup`; mock next-intl/Astryx client dependencies as needed. Assert meaningful
rendered status text, accessible links and sensitive-value absence, rather than mirroring implementation.

- `config.test.ts`: missing/explicit none with and without keys returns `none`; unknown provider fails closed;
  each external provider missing its own key or model reports misconfiguration; another provider's key never
  enables it; status exposes no key fragment. Set a test-local environment object; do not read real keys.
- `providers.test.ts`: none returns the R4a draft exactly, including the empty-week template and each locale;
  selected adapters use only the injected fake fetch; correct URL/headers/model; exact OpenRouter provider object
  on every request; no transport call for a missing key/model or open flags; timeout, non-2xx, invalid JSON,
  malformed/empty/oversized content all produce bounded sanitized errors; no retry or fallback after failure.
  Use inert sentinel strings for test headers, never real key shapes/values. Stub global `fetch` to throw for
  every test and restore it afterward; the fake injected transport alone returns `Response` fixtures. Tests
  must fail if any code attempts real transport.
- `prompt.test.ts`: projection contains the expected numeric evidence and selected dialect; names, UUIDs,
  check-in free text, flagged terms, raw draft text, unrelated input fields and key sentinels are absent;
  malicious signature text remains quoted data, with no new system message or tools. Flagged input triggers no
  external request. Stable projection for the same input.
- `settings-component.test.ts`: render ar RTL and en status/cost rows, off and misconfigured states, translated
  historical-date/assumption text, no key-entry/enable/test controls or exposed secret values, and no settled
  `aria-busy=true`. Assert both numeral preferences use R0b's expected output.

P9 ownership: write `e2e/beta/r4d-provider-off.spec.ts` with `@ar` and `@en` cases. As the seeded owner,
open Settings → AI, assert the settled off status, report date/assumptions and absence of key/enable/test-call
controls. This owns the provider-off prerequisite of P9's coach inbox → review → approve flow; R4b owns that
primary end-to-end flow and its timer. Reuse read-only `e2e/beta/helpers.ts`; do not edit shared fixtures/config.
Write the spec now, run it only in P9 after all integration patches. P9's integrator also runs Astryx doctor,
screens and the full security checks, verifies no network/paid calls, and covers the settings permission gate.
There are no schema changes or new endpoints in R4d; existing RLS and API controls remain untouched.

## Acceptance checks you run yourself

Run sequentially from your own worktree, with installed `node_modules`:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/server/ai/config.test.ts src/server/ai/providers.test.ts src/server/ai/prompt.test.ts src/server/ai/settings-component.test.ts --maxWorkers=1
```

Expected: both exit 0; typecheck has no errors; every named new test passes with no skipped tests and no network.
Only one Vitest process at a time. Never run full tests, lint, Next.js dev/build/start, Playwright, database
suites, Astryx CLI or any hosted request. If an unapplied integration patch blocks registration/reachability,
record it accurately; do not edit a hot spot or claim P9/browser proof. No branches, stashes, commits or pushes.

## The answer wanted

Files written; the exported provider signatures R4b imports; exact provider selection/misconfiguration behavior;
how fake transport prevents network; the OpenRouter assertion; every patch target and insertion; test commands
and actual results; date/assumptions of the copied cost data; decisions taken and anything wrong in this brief.
Identify P9 checks still owed. Do not print credentials, provider request bodies, client data or entire files.

## Errata (Claude, 14 Nov, checked against main after R0c; these override the text above)

- The env module is `apps/web/src/lib/env.ts` (there is no `apps/web/src/env.ts`); the no-edit rule applies to that file.
