# Brief: reconcile the exercise import receipt with the new idempotency reservation

## Problem (measured)

After the R1 fix, `apps/web/src/api/middleware/idempotency.ts` inserts a placeholder row (`status_code` 102) into
`idempotency_keys` BEFORE the handler runs, and its request hash is `sha256(plainHash + '|' + authorizationFingerprint)`.
`POST /exercises/import/commit` keeps its own atomic receipt in the same table:
`apps/web/src/api/exercises.ts` (router middleware `importHashes`, route `/import/commit`) passes
`{ key, requestHash: <plain hashIdempotencyRequest> }` to `commitExerciseImport`
(`apps/web/src/server/exercises/service.ts` around line 200), which reads the row for the key. It now finds the
middleware's placeholder with a different hash and throws 409. Four tests in `apps/web/src/api/exercises.test.ts` fail
with 409 (replay on commit, duplicates, overlapping first requests, the 2,001 rows refusal). The tests are right.

## Fix (follow it)

1. In `idempotency.ts` export a function `idempotencyRequestHash(auth, method, path, body)` that returns exactly the
   hash the middleware computes (plain request hash mixed with the authorization fingerprint); the middleware itself
   must call it so there is one definition.
2. In `exercises.ts` compute `importHashes` with that function (it has `c.get('auth')` there; the router middleware that
   fills `importHashes` runs after the auth middleware, check the order and keep it).
3. In `commitExerciseImport`: a stored row whose `status === 102` and `hash === replay.requestHash` is this request's
   own reservation, not a receipt: treat it as "no receipt yet" (do the import). A row with status 102 and a different
   hash stays a 409. After the import, delete every row of `replayScope` (it is the caller's own key) and insert the
   200 receipt as today, in the same transaction. The middleware's later `save` then finds no matching placeholder and
   leaves the receipt alone (its `removed.length === 0` branch); keep that behaviour and do not change the middleware's
   reservation logic.
4. Keep every existing assertion in `exercises.test.ts` and `idempotency.test.ts`. Add one test in
   `idempotency.test.ts` or `exercises.test.ts`: a commit replay with the same key returns the stored receipt and
   inserts nothing twice, and a commit with a reused key and a different body is still 409 `idempotency_key_reused`.

## Files you may write

`apps/web/src/api/middleware/idempotency.ts`, `apps/web/src/api/exercises.ts`, `apps/web/src/server/exercises/service.ts`,
`apps/web/src/api/exercises.test.ts`, `apps/web/src/api/middleware/idempotency.test.ts`. Nothing else.

## Limits

No pnpm, node, vitest, tsc, psql, git or network; never run git, never commit, never add dependencies. Check by reading.
This brief replaces the common brief. Answer: files written and what changed, under 20 lines.
