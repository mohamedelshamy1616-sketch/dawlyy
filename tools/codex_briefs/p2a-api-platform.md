# Batch P2A: API platform pieces (pagination, idempotency replay, active access, router stubs)

You build the shared API plumbing that the wave-2 builders (Tasks 2 to 11) use, so that parallel builders never edit
the same file. Read `docs/plans/2026-11-07-dawlyy-build-plan.md` sections "Shared conventions / API" and the file lists
of Tasks 2 to 11, and `docs/architecture/02-database-security-model.md` section 12.1 (API obligations; read only that
section and section 14, the client library).

## Files you may write

- `apps/web/src/api/lib/pagination.ts` and `apps/web/src/api/lib/pagination.test.ts` (new)
- `apps/web/src/api/middleware/idempotency.ts` and `apps/web/src/api/middleware/idempotency.test.ts` (new test)
- `apps/web/src/api/middleware/access.ts` and `apps/web/src/api/middleware/access.test.ts` (new)
- one router stub per module, `apps/web/src/api/<module>.ts`, for exactly these modules: `auth`, `invitations`,
  `clients`, `packages`, `subscriptions`, `payments`, `exercises`, `programs`, `me`, `workout-sessions`,
  `nutrition`, `foods`, `meal-logs`, `forms`, `submissions`, `calendar`, `metrics`, `measurements`, `photos`,
  `conversations`, `notifications`, `dashboard`, `tasks`, `settings`, `team`, `media`
- `apps/web/src/api/index.ts` (mount the routers; keep everything it does today)

Write nothing else. Do not touch `apps/web/src/server/**` or `packages/**`: batch SEC-X2 is rewriting
`apps/web/src/server/auth.ts`, `packages/db/src/client.ts` and adding `apps/web/src/server/require-permission.ts`
(it may name it `permissions.ts`; import nothing from it).

## Interfaces you consume

- `withAuthTx(auth, fn)` and the types `AuthContext`, `Tx` from `@dawlyy/db`; the table objects from
  `@dawlyy/db/schema` (`idempotencyKeys`, `subscriptions`, `clientEntitlementOverrides`); `drizzle-orm` operators.
- `ApiError` and the helpers in `apps/web/src/api/errors.ts` (read it; add no new error class, use `new ApiError(...)`
  with the codes below if no helper fits).
- `AuthVariables` from `apps/web/src/api/middleware/auth.ts` (`c.get('auth')`).
- `packages/core/src/subscription` and `packages/core/src/entitlements` for access state, if they already expose what
  you need (read them first).

## Work

1. **Pagination** (`lib/pagination.ts`). `parseListQuery(query: { cursor?: string; limit?: string })` returns
   `{ limit, cursor }` with `limit` an integer 1..100, default 20; a bad limit or a cursor that does not decode is a
   400 `validation_error`. The cursor is opaque: base64url of a JSON `{ k: string | number, id: string }` (the sort
   key and the row id, for keyset pagination with a stable tie-breaker). Export `encodeCursor`, `decodeCursor`,
   `page(rows, limit, keyOf)` that takes `limit + 1` fetched rows and returns `{ items, nextCursor }` exactly in the
   shape of the plan (`nextCursor: string | null`), and a Zod schema `listQuerySchema` for OpenAPI routes plus a
   helper `pageSchema(itemSchema)`. Unit tests: round trip, limit bounds, garbage cursor, last page gives null.
2. **Idempotency replay** (`middleware/idempotency.ts`). Keep `idempotencyMiddleware` (reads the header) as it is.
   Add `idempotentReplay`, a middleware to mount after `requireAuthMiddleware` on mutating routes. With no key it
   does nothing. With a key it hashes the request (sha256 of method, path and the raw body), and inside
   `withAuthTx(auth, ...)` looks up `idempotency_keys` by `(tenant_id, user_id, key)` among rows newer than 24 hours.
   Same hash: return the stored status and JSON body without running the handler, with header
   `Idempotent-Replayed: true`. Different hash: 409 with code `idempotency_key_reused`. No row: run the handler, then
   store status and JSON body when the status is below 500 (insert with `on conflict do nothing`; RLS policy
   `idempotency_keys_self` admits only the caller's own rows). Keys longer than 200 characters are 400. Unit tests
   cover the hashing and the decision logic through an injected store interface, so they need no database; the
   middleware uses the real store built on `withAuthTx`.
3. **Active access** (`middleware/access.ts`). `requireActiveAccess`, mounted after auth on client routes that need
   a live subscription (spec section 30: expiry restricts access, never deletes history; Task 3 acceptance: an
   expired subscription blocks `/api/v1/me/program` with 403 `access_expired`, history endpoints still answer).
   Staff and owners pass. A client passes when they have a subscription in state `active` (or `grace` if the core
   state machine has it) whose window covers today in the tenant's time zone, read through `withAuthTx`; otherwise
   403 `access_expired` with `details: { state, endsOn }` of the latest subscription, or `{ state: null }` when none.
   Put the pure decision in an exported function `decideAccess(subscriptions, today)` with unit tests.
4. **Router stubs.** Each module file exports
   `export const router = new OpenAPIHono<ApiEnv>()` (import `ApiEnv` as a type from `./index`, or define the env type
   in a new `apps/web/src/api/env.ts` and import it from both, which avoids a cycle: prefer the second and add
   `env.ts` to your files) and no routes yet, with a one-line comment naming the build-plan task that fills it.
   Mount every router in `index.ts` under its path (`/auth`, `/invitations`, `/clients`, ..., `me` under `/me`, so
   take care that the existing `/me` route keeps working: move it into `me.ts`).
5. Keep `apps/web/src/api/health.test.ts` passing in substance (do not edit it).

## Acceptance you can check without running anything

- Every file above exists; no other file changed.
- No `sql.raw` anywhere (doc section 12.1 item 16); values go through the `sql` tag or drizzle operators.
- The OpenAPI document still serves `/health` and `/me`.

## Answer

List the files written, every export with its signature and one-line contract, the error codes used, anything in
this brief that is wrong or ambiguous against the real code, and what the wave-2 builders must know to use these.
