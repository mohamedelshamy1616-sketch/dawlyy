# P7 diff review by Codex (read-only), range bd8d0dd..ea0f8d0, 12 Nov 2026

Raw answer from the bridge thread p7-diff. Its R1 to R4 are named D1 to D4 in the fix brief `tools/codex_briefs/p7-prefix-r1-r4b.md` to avoid a clash with the earlier pre-review R1 to R4.

I agree with the core fixes, but found regressions and unresolved flow risks. I ran `git log`, `git diff bd8d0dd..HEAD`, searches, and read-only, in-memory Node probes. No files changed or database tests ran.

1. **Regressions/risks:** detailed below. Grace remains inclusive and allowed (`packages/core/src/subscription/index.ts:213`). Paused subscriptions deliberately deny live access; the concern is interrupting previously started work. The migration preserves tenant isolation, locking and grants. The error-log projection excludes messages, parameters, stacks and cause objects (`apps/web/src/api/error-log.ts:11`); no concrete privacy bypass found.

2. **Other runtime request handling:** `apps/web/src/api/exercises.ts:48` clones the request; `apps/web/src/api/media.ts:95` reads its stream. Both run after global normalization (`apps/web/src/api/index.ts:65`), so they receive the rebuilt plain Request. An installed `NextRequest` probe returned **200**, with both parsing and cloning succeeding. No additional constructor-brand failure found. This does **not** verify execution inside the full Next.js runtime.

3. **Existing assertions:** this range is **not additions-only**. `packages/db/test/security.events.test.ts:252` replaces the cross-tenant single-survivor expectation with exactly two rows and both exact records. That changes required behavior; it does not loosen row-count or content checking. The same-tenant assertion remains. `security.catalog.test.ts:708` adds migration coverage; `:747` changes the exact journal expectation to include 7. Workout/nutrition assertions remain unchanged; only fixtures gained subscriptions. No assertion weakening, deletion, or new skips found.

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| R1 | Medium | Paused/expired demo clients opening free-meal entry now throw during page rendering, although logging remains allowed. Resolve the date without loading the gated current plan. | `apps/web/app/[locale]/app/nutrition/log/page.tsx:14`; `apps/web/src/server/nutrition/client.ts:19` |
| R2 | Medium—flow risk | Start while active, queue sets offline, then freeze/expire before reconnecting: sync returns 403 and retries without saving those sets. N1 explicitly requires this gate; clarify treatment of existing-session uploads. | `apps/web/src/server/workout/write.ts:140`; `apps/web/src/lib/outbox/flush.ts:37` |
| R3 | High | Schema-valid batches exceed the new ceiling and retry unchanged. Probe: 1,000 sets with 1,000-character notes → **1,226,024 bytes, 413**. Byte-bound client batches. A maximum-size CSV also exceeds the ceiling after JSON wrapping. | `apps/web/src/server/request-limits.ts:2`; `apps/web/src/server/workout/contracts.ts:25`; `apps/web/src/lib/outbox/flush.ts:34`; `apps/web/src/server/exercises/validation.ts:46` |
| R4 | Medium | Cross-tenant account switching retains the former user’s pushes **even after logout**: both logout implementations omit push cleanup. Implement the cleanup assumed by the documentation. | `packages/db/migrations/0007_push_tenant_scope.sql:28`; `apps/web/components/app/sign-out-button.tsx:13`; `apps/web/src/components/shell/sign-out-button.tsx:15`; `docs/plans/OPEN_DECISIONS.md:28` |
