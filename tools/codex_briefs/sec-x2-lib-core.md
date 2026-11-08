# Batch SEC-X2: client library, API permission plumbing and the core state machines

## Files you may edit

- `packages/db/src/client.ts`
- a new `packages/db/src/client-columns.ts`, and its export line in `packages/db/src/index.ts`
- `apps/web/src/server/auth.ts`
- a new `apps/web/src/server/permissions.ts` and a new unit test `apps/web/src/server/permissions.test.ts`
- `packages/core/src/state/index.ts` and `packages/core/test/state.test.ts` (add cases; never weaken existing ones)
- `packages/core/src/types/states.ts`, only if a new state constant is required

## Read first

The contract doc sections 3 (roles: why the runtime runs as `dawlyy_rls`), 6.3 (the payments and subscriptions rules
and transition edges), 12 (API obligations: `requirePermission`, `clientColumns`, `withErasureTx`, sync and payment
rules) and 14 (client library), plus `packages/core/src/authz/` (presets, `isAllowed`, `hasAction`),
`apps/web/src/api/errors.ts`, and the existing `packages/db/test/fixtures.ts` and `helpers.ts`, which use the client
exports.

## Work

1. **`client.ts`**, exactly as section 14 says: `withAuthTx` and `withUserTx` run `set local role dawlyy_rls` and set
   the request settings the doc lists; the `SET LOCAL statement_timeout`, `lock_timeout` and
   `idle_in_transaction_session_timeout` values of the doc; `withServiceTx` with its reason argument; `withErasureTx`
   setting `app.erasure`; `DAWLYY_DB_POOL_MAX` read inside `connect()` when a pool is first created, not at import;
   `closeDb()` dropping the pools so the next call reads the variable again. Keep every export that
   `packages/db/test/fixtures.ts` and `helpers.ts` use working; if a signature must change, give the old and the new
   form in your answer.
2. **`client-columns.ts`**: the `clientColumns` map section 12 describes: per table, the columns a client may receive,
   leaving out every coach-internal column the doc names. It is the only control for column privacy, so be complete.
3. **`auth.ts`**: `AuthContext.permissions` (`StaffPermissions | null`, from `@dawlyy/core` authz) and
   `getAuthContext` filling it from the membership.
4. **`permissions.ts`**: the thin `requirePermission(ctx, module, action)` helper over core `hasAction`/`isAllowed`
   that section 12 names, throwing the existing API error type for 403. Its unit test covers owner, coach, assistant,
   business_manager and client contexts (written, not run).
5. **Core machines** (`packages/core/src/state/index.ts`): in the exported `machines` table, the payment state machine
   (states and allowed transitions exactly as the doc's payments rules give them, refunds and rejection included) and
   the subscription cancel edges from `pending` and `suspended` (comment: a subscription is created active when its
   payment is already verified). Every machine's transitions stay readable as plain data from `machines`, because the
   security suite X compares each machine with the database transitions. If the doc's transition config and a core
   machine disagree, report both edge lists as a deviation; do not edit the doc. Add the test cases to
   `packages/core/test/state.test.ts`.

## Acceptance

- The runtime transactions never run without `set local role dawlyy_rls`; the service path never sets it.
- `clientColumns` lists, for every table a client can read, only the client-visible columns of section 12.
- `machines.payment` exists with exactly the doc's edges; existing machines keep their shape.

## Running at the same time as SEC-X3

Batch SEC-X3 rewrites `packages/db/test/fixtures.ts` and `helpers.ts` while you work, coding against the doc section 14
signatures (`withAuthTx(ctx, fn)`, `withUserTx(userId, fn)`, `withServiceTx(tenantId, reason, fn)`,
`withErasureTx(tenantId, reason, fn)`, `AuthContext`, `Tx`). Export exactly those names.
