# Brief: bring the nine legacy tests in line with the N1 and N2 fixes

Context: `docs/qa/p7-n1-n4-fixes.md` (read it first). The previous Codex job fixed N1 to N4 and left nine existing
tests red for reasons that are NOT product bugs. Claude, the reviewer, has decided how each is resolved. Change only
what is listed; every other assertion in these files stays exactly as it is.

## 1. `packages/db/test/security.events.test.ts`, the E14 case `ua/uc` (the `across` loop iteration)

Decision (OPEN_DECISIONS item 18, 12 Nov 2026, from the attended session's P7 review N2): `app.register_push` now
deletes rows of other users only inside the caller's pinned tenant (migration `0007_push_tenant_scope.sql`).
Security model section 7.10.3 said "in any tenant"; that sentence is the specification defect.
- In the `across === true` iteration the final expectation changes: the first actor's row (tenant of `f.ua`, keys
  `first`) now survives and the second actor's row (tenant of `f.uc`, keys `last`) exists beside it, so the expected
  rows are two, ordered by tenant id or compared as a set (use `expect.arrayContaining` with `toHaveLength(2)`, or
  sort both sides). The `across === false` iteration (ua/ub, same tenant) keeps its exact current expectation.
- The advisory-lock part of the test (the second call waits until the first releases) stays unchanged.
- Add a one-line comment above the changed expectation: `// N2 (docs/plans/OPEN_DECISIONS.md item 18): handover is tenant-scoped.`

## 2. `docs/architecture/02-database-security-model.md` section 7.10.3 (around line 2995)

Change `(in any tenant)` to `(in the caller's pinned tenant; a device shared across tenants keeps one row per tenant, and logout
deletes the caller's own rows)`, and update the function body shown in the SQL block of that section to carry the
same `tenant_id = tid` predicate in its DELETE, matching `packages/db/migrations/0007_push_tenant_scope.sql`. Change
nothing else in that file. If a second place states the cross-tenant delete (grep `register_push` and `any tenant`),
update it the same way and list it in your answer.

## 3. Fixtures without a subscription: `apps/web/src/api/workout-sessions.test.ts` (all six cases) and `apps/web/src/api/nutrition.test.ts` (the current-plan reads near lines 73 and 137)

The new `requireActiveAccess` gate (N1) correctly refuses members with no covering subscription. These fixtures create
clients with a membership only, then expect workout start, sync and the current nutrition plan to work. Give those
fixtures' clients an active subscription that covers today in the tenant's local date (use the same helper or insert
the new tests in `apps/web/src/api/access-live.test.ts` use; if the shared harness `apps/web/src/test/api-harness.ts`
needs a small helper, add it there without changing existing exports). Do not change any expectation in those two
files, do not add skips, and do not touch `access-live.test.ts`.

## Files you may write

`packages/db/test/security.events.test.ts`, `docs/architecture/02-database-security-model.md`,
`apps/web/src/api/workout-sessions.test.ts`, `apps/web/src/api/nutrition.test.ts`, `apps/web/src/test/api-harness.ts`
(additive only). Nothing else.

## Limits

No pnpm, node, vitest, tsc, psql, git or network from you; never run git, never commit. Check by reading. Claude runs
the suites. This brief replaces the common brief.

## Answer

Files written, what changed in each, and any other test you believe depends on the old cross-tenant rule. Under 25 lines.
