# Brief: fix the four findings of the P7 pre-review (R1 to R4)

Findings come from a read-only Codex review on 12 Nov 2026 (saved in `docs/qa/p7-codex-prereview.md`; read it first).
Fix all four in code. No migration: `packages/db/migrations` and `packages/db/src/schema` are frozen; the security
suites assert them. Never weaken a test; add tests.

## R1 (high): concurrent retries with one Idempotency-Key both run the mutation

File: `apps/web/src/api/middleware/idempotency.ts` (`createIdempotentReplay`, `databaseStore`, `IdempotencyStore`).
Today: find, then `next()`, then save in three separate transactions. Two simultaneous requests with the same key both
miss, both run the handler (two refunds), the unique index only dedupes the saved row.

Table facts (do not change): `idempotency_keys(tenant_id, user_id, key, request_hash, status_code int not null,
response_body jsonb, created_at)`, unique `(tenant_id, user_id, key)`, RLS allows select, insert, delete only for the
caller's own rows, no UPDATE grant.

Design (follow it): reserve before the handler.
1. Before `next()`, insert a placeholder row in its own transaction with `status_code = 102`, `response_body = null`,
   the request hash, `ON CONFLICT DO NOTHING`, and check whether the insert won (returning the inserted row).
2. If the insert won, run the handler. After it, delete the placeholder and insert the final row (status, body) in one
   transaction. If the handler throws or the response is 5xx or non-JSON, delete the placeholder (so a retry can run)
   and rethrow or return as today.
3. If the insert lost, read the existing row. Same hash and a final status: replay as today. Same hash and status 102
   (in flight): answer 409 `idempotency_in_progress` with header `Retry-After: 1`, never run the handler. Different
   hash: 409 `idempotency_key_reused` as today. A placeholder older than 120 s is stale (the process died): delete it
   and try the reservation once more.
4. Keep the 24 h expiry and the existing store interface style so `idempotency.test.ts` still compiles; extend the
   in-memory test store in that test file with the new method(s) and keep every existing assertion.
5. Add tests in `idempotency.test.ts`: two simultaneous requests with one key run the handler once and the second
   gets 409 `idempotency_in_progress`; a handler error releases the key; a stale placeholder is taken over; the
   replayed final response is unchanged. Also a DB-backed case in `apps/web/src/api/payments.test.ts` or the existing
   DB test harness (`apps/web/src/test/api-harness.ts`) only if the harness already supports concurrent requests;
   otherwise skip it and say so.

## R2 (medium): a replay skips handler-level permission checks

Today a cached response is returned before any permission check, so a staff member who lost a module grant can
replay a cached 201. Fix: include an authorization fingerprint in what is compared on replay. Compute it from
`auth.role`, `auth.membershipId` (or the closest field of `AuthContext`), `auth.clientId` and, for staff, the
permissions object (stable JSON, sorted keys), hashed. Store it by mixing it into `request_hash`
(for example `sha256(requestHash + '|' + fingerprint)`), so no schema change is needed. A replay whose fingerprint
differs behaves like a reused key with a different request: 409 `idempotency_key_reused` (fail closed; the caller uses
a new key and the handler's own permission check runs). Test it. State in your answer that removing a staff
member's client assignment is not part of the fingerprint (it lives in `staff_client_assignments`) and is an accepted
residual risk, unless `AuthContext` already carries it.

## R3 (medium): Web Push is dispatched to a deactivated member

File: `apps/web/src/server/notify/process.ts`, function `dispatch`. When `member` is missing (no active membership of
`row.userId` in `row.tenantId`), the delivery must be cancelled before any send, for every channel:
`return { state: 'cancelled', error: 'recipient_inactive' }` right after the context is read (keep the existing
outcome shape and the existing `notification_missing` path). Add a test in the existing `process` test file
(`apps/web/src/server/notify/*.test.ts`, find it) with a stubbed push sender proving zero sends for an inactive
member and still one send for an active one.

## R4 (low): the dev-login module is listed in the production trace

`apps/web/.next/server/app/api/[[...route]]/route.js.nft.json` lists `src/server/dev-login.ts` and
`app/api/dev-login/route.dev.ts`; the executable route is absent in production, but the files travel with the
deployment trace. In `apps/web/next.config.ts` add `outputFileTracingExcludes` for the production build only
(read the Next.js 16 guide under `apps/web/node_modules/next/dist/docs` first; the key and glob format must be exact)
that excludes `**/dev-login*` and `**/route.dev.ts` from all routes. If `src/server/auth.ts` imports `dev-login.ts`
dynamically for the dev path, keep that working in development. If you cannot make the exclusion work without
guessing, leave `next.config.ts` unchanged and report exactly why.

## Files you may write

`apps/web/src/api/middleware/idempotency.ts`, `apps/web/src/api/middleware/idempotency.test.ts`,
`apps/web/src/server/notify/process.ts` and its test file, `apps/web/next.config.ts`, and one DB-backed test file
under `apps/web/src/api/` only as R1 item 5 allows. Nothing else.

## Limits

No pnpm, node, vitest, tsc, psql, git or network; never run git, never commit, never add dependencies, never print
env values. Check by reading; Claude runs typecheck and the suites. This brief replaces the common brief.

## Answer

Files written, what each fix does, residual risks, anything wrong in this brief. Under 40 lines.
