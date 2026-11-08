# Batch SEC-X3: security-test fixtures and helpers

## Files you may edit

- `packages/db/test/fixtures.ts`
- `packages/db/test/helpers.ts`

## Read first

The contract doc section 13 (tests: 13.2 fixtures, 13.3 helpers and error classes, 13.4 cases, 13.5 running) and
section 14 (client library), then the current `fixtures.ts`, `helpers.ts` and `rls.test.ts` (it uses the existing
exports), `packages/db/src/client.ts`, the schema files under `packages/db/src/schema/` and
`packages/core/src/authz/` (the real presets: coach, assistant, business_manager).

## Work

1. **Fixtures** (`fixtures.ts`), exactly as 13.2 specifies: every tenant, owner, staff member (each `client_scope`),
   client, membership (including the disabled ones), user in two tenants, client in T2 with a disabled client
   membership, published and draft versions, subscriptions, invitations, and staff memberships carrying the real
   presets from core for the module-permission tests, with the exact fixture names 13.2 uses. Factories that build
   fresh rows for tests that commit changes. `buildFixture` must work on an empty migrated database, and `truncateAll`
   must clear every table the fixture fills.
2. **Helpers** (`helpers.ts`), exactly as 13.3 specifies: acting as a member through `withAuthTx`, as the service
   through `withServiceTx`, as the erasure service through `withErasureTx`; `expectGuard(work, rule, column?)`,
   `expectRls(work)`, `expectPrivilege(work)`, `expectNoEffect(...)`, `expectCode`; service reads of a row; the probe
   schema helpers for `dawlyy_probe`. postgres-js exposes `code`, `detail`, `table_name` and `column_name` on its
   errors.
3. Keep every existing export working (`rls.test.ts` uses them). One-line comment on each fixture field and helper.

## Acceptance

- Every fixture name and helper name that 13.2-13.4 use exists with that exact spelling.
- No helper accepts a weaker outcome than its 13.3 definition (for example `expectGuard` checks the SQLSTATE, the
  detail string and, when given, the column).

Your final answer must list every exported name with its exact signature: fifteen suite writers code against that
list without seeing your files.
