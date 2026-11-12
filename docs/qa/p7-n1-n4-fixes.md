P7 N1 to N4 fixes - 12 November 2026

Implemented all four fixes. Verification is not fully green: the read-only legacy tests contain one expectation that contradicts N2 and eight web cases whose fixtures have no subscription. All 52 new regression tests pass. No commit or push was made.

**Behavior and scope**

- N1: workout start, workout sync and GET /nutrition/me now run requireActiveAccess after authentication and before replay. The same existing decideAccess logic runs inside startSession, syncWorkout and myNutrition under the caller's RLS transaction. Active/grace access, inclusive dates, tenant-local today and the latest-subscription denial details are preserved. The API matrix covers pending, active, grace, expired, suspended, absent and cancelled subscriptions against start, sync, current nutrition and actual retained workout history. It also tests direct services, replay after expiry and retained nutrition history.
- Nutrition history now obtains its date and labels from logged versions, without calling the gated current-plan reader or returning current instructions or targets. Private reference validation for meal/supplement writes preserves their previous behavior. decideAccess supplies a subscription-wide decision; it defines no separate route-specific policy. Only the three requested live operations received a new gate; workout patch/finish and existing logging rules were not extended.
- N2: new migration 0007_push_tenant_scope replaces app.register_push and adds tenant_id = tid to its DELETE. Existing endpoint validation, advisory locking, same-tenant handover, search_path and privileges remain. Tenant A registering tenant B's endpoint leaves B's row unchanged. Applied migrations 0000 through 0006 are untouched.
- N3: unexpected API errors log only name, SQLSTATE code, generated request ID, route template and status. No error object, message, parameters, cause text or stack reaches console.error. A real failed PostgreSQL/Drizzle insert verifies that its private marker is absent from every console.error argument and the response.
- N4: the original request stream is bounded before cloning, parsing or idempotency reservation. Oversized Content-Length is rejected before reading; actual streamed bytes are counted and the source is cancelled at overflow, including a falsely small Content-Length. Shared constants specify 1 MiB for JSON and the existing 8 MiB for binary media uploads. Exact-limit JSON, ordinary replay and uploads above the JSON limit are covered.

**Existing tests**

Only the two additive catalog-list updates authorized by N2 were made: C20 includes the new migration tag, and C24 appends journal index 7. A comparison against HEAD verified those are the only changes to existing test files. No existing assertion was removed or loosened. Existing fixtures were left unchanged.

**Files changed**

- `apps/web/app/[locale]/app/nutrition/history/page.tsx`
- `apps/web/src/api/access-live.test.ts`
- `apps/web/src/api/env.ts`
- `apps/web/src/api/error-log.ts`
- `apps/web/src/api/error-privacy.test.ts`
- `apps/web/src/api/errors.ts`
- `apps/web/src/api/index.ts`
- `apps/web/src/api/middleware/access.ts`
- `apps/web/src/api/middleware/body-limit.test.ts`
- `apps/web/src/api/middleware/body-limit.ts`
- `apps/web/src/api/middleware/idempotency.ts`
- `apps/web/src/api/nutrition.client.ts`
- `apps/web/src/api/workout-sessions.ts`
- `apps/web/src/server/access.ts`
- `apps/web/src/server/nutrition/client.ts`
- `apps/web/src/server/nutrition/history.ts`
- `apps/web/src/server/nutrition/logs.ts`
- `apps/web/src/server/request-limits.ts`
- `apps/web/src/server/storage/index.ts`
- `apps/web/src/server/workout/write.ts`
- `docs/qa/p7-n1-n4-fixes.md`
- `packages/db/migrations/0007_push_tenant_scope.sql`
- `packages/db/migrations/meta/_journal.json`
- `packages/db/test/security.catalog.test.ts`
- `packages/db/test/security.push-tenant.test.ts`
- `tools/__pycache__/run_db_tests.cpython-311.pyc`

**Commands and decisive output**

The commands below ran one heavy job at a time. Logs are in .work. Native configuration loading and the thread pool avoid this sandbox's Vite `spawn EPERM` failures.

| Command | Last decisive output / result |
| --- | --- |
| `pnpm --filter @dawlyy/web typecheck` | `Typecheck passed (exit 0).` |
| Targeted ESLint command below | `1 problem (0 errors, 1 warning)`; exit 0. The unused `_event` warning already existed in workout/write.ts. |
| `python tools/run_db_tests.py --web --reuse-db src/api/access-live.test.ts --configLoader native --pool threads` | `Tests 39 passed (39)`; exit 0, after correcting publication timestamps in the new history fixture. |
| `python tools/run_db_tests.py --reuse-db test/security.catalog.test.ts test/security.push-tenant.test.ts test/security.guard.test.ts --configLoader native --pool threads` | `Test Files 3 passed (3)` / `Tests 5541 passed (5541)`; exit 0. |
| `python tools/run_db_tests.py` | `migrations applied successfully!` then `Cluster is not running.` / preparation step exit 1. |
| `python tools/run_db_tests.py --reuse-db seed --configLoader native --pool threads` | `Tests 7 passed (7)`; exit 0. |
| `python tools/run_db_tests.py --reuse-db test/ --configLoader native --pool threads` | `Test Files 1 failed / 16 passed (17)` / `Tests 1 failed / 11792 passed (11793)`; exit 1. |
| `python tools/run_db_tests.py --web` | `migrations applied successfully!` then `Cluster is not running.` / preparation step exit 1. |
| `python tools/run_db_tests.py --web --reuse-db --configLoader native --pool threads` | `Test Files 2 failed / 66 passed (68)` / `Tests 8 failed / 521 passed (529)`; exit 1. |
| `git diff --check` | No whitespace errors; exit 0. |

The full run confirms `security.guard.test.ts` 5429/5429, `security.matrix.test.ts` 1788/1788, `security.catalog.test.ts` 110/110 and the new push suite 2/2. The new web suites pass 39 access/history + 10 body-limit + 1 error-privacy tests.

The exact targeted ESLint invocation (PowerShell expanded the changed/new paths into the same argument list) was:

```powershell
pnpm --dir apps/web exec eslint 'app/[locale]/app/nutrition/history/page.tsx' 'src/api/access-live.test.ts' 'src/api/env.ts' 'src/api/error-log.ts' 'src/api/error-privacy.test.ts' 'src/api/errors.ts' 'src/api/index.ts' 'src/api/middleware/access.ts' 'src/api/middleware/body-limit.test.ts' 'src/api/middleware/body-limit.ts' 'src/api/middleware/idempotency.ts' 'src/api/nutrition.client.ts' 'src/api/workout-sessions.ts' 'src/server/access.ts' 'src/server/nutrition/client.ts' 'src/server/nutrition/history.ts' 'src/server/nutrition/logs.ts' 'src/server/request-limits.ts' 'src/server/storage/index.ts' 'src/server/workout/write.ts'
```

Other narrow runs before the final full runs:

```powershell
python tools/run_db_tests.py --web --reuse-db src/api/access-live.test.ts src/api/error-privacy.test.ts src/api/middleware/body-limit.test.ts src/api/middleware/access.test.ts src/api/middleware/idempotency.test.ts src/server/storage/index.test.ts src/server/storage/tracking.test.ts --configLoader native --pool threads
python tools/run_db_tests.py --reuse-db test/security.push-tenant.test.ts test/security.catalog.test.ts test/security.events.test.ts test/security.matrix.test.ts --configLoader native --pool threads
python tools/run_db_tests.py --web --reuse-db src/api/access-live.test.ts src/api/error-privacy.test.ts src/api/middleware/body-limit.test.ts src/api/middleware/access.test.ts src/api/middleware/idempotency.test.ts src/api/workout-sessions.test.ts src/api/nutrition.test.ts src/api/meal-logs.test.ts src/api/media.test.ts src/api/health.test.ts src/server/storage/index.test.ts src/server/storage/tracking.test.ts src/server/workout/logic.test.ts src/server/nutrition/helpers.test.ts src/server/nutrition/retry.test.ts --configLoader native --pool threads
```

Their decisive results were respectively 97 passed; 2047 passed / 2 failed; and 125 passed / 10 failed. The intermediate C15 projection failure was fixed using clientColumns, without changing its test. The two failures in the new history fixture were missing publication timestamps and were corrected in that new file; its subsequent run passed 39/39. The remaining failures are the nine legacy cases listed below. The initial regression runs also reproduced all four original bugs before their fixes.

**Remaining failures and unverified behavior**

- `packages/db/test/security.events.test.ts:252`, E14 ua/uc overlapping endpoint: expects exactly the second tenant's row. N2 requires both tenant rows to survive. The original assertion remains intact.
- All six cases in `apps/web/src/api/workout-sessions.test.ts` create clients through workoutFixture without subscriptions, then expect workout start/sync to succeed. They now receive the intended 403 access_expired before reaching their downstream assertions.
- Two cases in `apps/web/src/api/nutrition.test.ts` (current-plan reads at lines 73 and 137) also have membership-only fixtures. One expects 200; the other parses the denied response as a nutrition plan. They require reviewer fixture updates to exercise their intended downstream behavior under active access.
- The standard full commands could not complete their preparation: tools/local_pg.ps1 uses pg_ctl's process probe, which reports no running cluster in this restricted session, while pg_isready and real database requests succeed. No runner, process guard or role preparation code was changed. Each standard command successfully rebuilt and migrated its scratch database through 0007 first. Scratch helper `.work/p7-db-step.py` then ran the original system seed under the same scratch database URLs, followed by the full suites with --reuse-db, native config loading and threads. Both seeds inserted 210 exercises and 371 foods. The role password reset step was not run; the existing runtime credentials successfully ran all tests.
- The full suites remain red until the reviewer resolves the conflicting legacy expectation and seeds active subscriptions in the affected fixtures. No production build, browser test or hosted verification was run for this task.
- Importing the runner for scratch preparation generated the untracked tools/__pycache__/run_db_tests.cpython-311.pyc. Automatic approval review rejected deleting that generated cache as blocked by policy. It was left untracked and must not be included in the implementation commit.

Final evidence: [.work result codes](../../.work/p7-n-final-results.json), [DB full log](../../.work/p7-n-full-db-tests.log), [web full log](../../.work/p7-n-full-web-tests.log), [seed test log](../../.work/p7-n-full-db-seed-tests.log), [guard/catalog narrow log](../../.work/p7-n-db-catalog-guard.log), [access/history log](../../.work/p7-n-access-history.log), [typecheck log](../../.work/p7-n-tsc-final.log), [lint log](../../.work/p7-n-eslint.log).
