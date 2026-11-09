# Batch SEC-S2: security suites G, I, T, L, P and X

## Files you may write (new files; create nothing else)

- `packages/db/test/security.guard.test.ts` (suite G) and its data `packages/db/test/guard-matrix.ts` (G20/G21)
- `packages/db/test/security.identity.test.ts` (suite I)
- `packages/db/test/security.team.test.ts` (suite T)
- `packages/db/test/security.library.test.ts` (suite L)
- `packages/db/test/security.payments.test.ts` (suite P)
- `packages/db/test/security.machines.test.ts` (suite X)

Two other Codex batches write the other suites at the same time (S1: C, S, N, Z; S3: D, M, K, E, A).
Do not write their files. Do not edit `fixtures.ts`, `helpers.ts`, `factories.ts`, `rls.test.ts`, migrations,
schema, `vitest.config.ts` or any `package.json`. If you need a helper that does not exist, define it privately inside
your test file and list it in your answer.

## Read first

Doc `docs/architecture/02-database-security-model.md`, section 13 in full (13.1 suites and files, 13.2 fixtures,
13.3 helpers and error classes, 13.4 cases, 13.5 running, 13.6 coverage). Then, for your suites:
- G: section 13.4 "G - Guard engine and per-table matrix", with section 6 (6.1 config keys, 6.2 functions, 6.3
  per-table guard configs); the probe helpers `createProbe`, `withProbe`, `setProbeGuard`, `dropProbe` in helpers.ts;
- I: "I - Identity", with sections 4 and 14 (pool reuse, pins, `DAWLYY_DB_POOL_MAX`, I01 and I12 notes in 13.5);
- T: "T - Team", with 5.2 and 7.10;
- L: "L - Client records and library", with 5.2, 7.6 and 7.7;
- P: "P - Payments, subscriptions and catalogue", with 5.2, 6.3, 7.7 and 7.11.4;
- X: "X - Machines", with 6.3 and the core state machines in `packages/core/src/machines*` (read the core exports).
Then the existing test support: `packages/db/test/helpers.ts`, `fixtures.ts`, `factories.ts`, `rls.test.ts` (the
established style), and `packages/db/src/client.ts` (`withAuthTx`, `withServiceTx`, `withErasureTx`).

## Rules from section 13 that bind every test

- These are contracts, not examples. Put the case id (for example `G03`) at the start of each Vitest title.
  Expand a parameterised case into one test per tuple; the title names the table, actor, operation, column and starting
  state.
- **Expected data comes from the doc, entered by hand.** Never read expected permissions, guard JSON, policy
  expressions, constraints or edges from the migration files or from the database under test. Catalog tests compare the
  live catalog against hand-written expected tables taken from the doc (for example C04 compares grants with the 3.3
  table, not with the 11.4 SQL). `matrix.ts` is that hand-written data for suite S.
- Each file owns its fixture lifecycle (`buildFixture()` in `beforeAll`, cleanup that closes pools in a `finally` or
  `afterAll`). No `.concurrent` on shared fixtures. A test that commits a change builds its own private rows with the
  factories; it never changes a shared fixture row another test reads.
- Use the 13.3 helpers (`expectGuard`, `expectRls`, `expectPrivilege`, `expectNoEffect`, `expectCode`) so a failure
  names the layer that refused. A rejection must be asserted at the layer the doc names, not just "it threw".
- Fail clearly if the database is missing; never skip a security test. `it.skip`, `it.todo`, conditional skips and
  empty test bodies are not allowed. A case that truly needs CI-only infrastructure (C23/C98/C99, section 13.5) is
  covered by `scripts/db-migration-check.ps1`, not by a skipped test; say so in a comment.
- Each suite meets the coverage rule of 13.6 that applies to it (for example the S00 meta-test that every policy and
  every table appears in `matrix.ts`).

## Acceptance (checks you can run yourself by reading)

- Every case id listed in 13.4 for G, I, T, L, P and X appears in a test title in its file, at least once.
- Imports resolve to files that exist and names those files export (check `helpers.ts`, `fixtures.ts`, `factories.ts`,
  `src/client.ts`).
- No expected value is computed from the migrations or from a catalog query of the database under test.
- TypeScript strict, no `any`, no unused imports.

In your answer list: files written; per file, the case ids covered and their test counts; every case you could not
express and why; private helpers you defined; every place where the doc was ambiguous and the reading you took.
