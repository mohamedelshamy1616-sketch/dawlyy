# Brief: C15 client-facing scope and projections (security test C15, the last red test)

## Goal

Make test C15 in `packages/db/test/security.catalog.test.ts` (the `it('C15 ...')` block, plus the `querySources`
helper at the top of that file) pass **honestly**: it must keep failing for a real client-reachable leak, and the code
must change where the code is genuinely non-compliant. Do not make it green by deleting assertions.

## Binding text

Security model `docs/architecture/02-database-security-model.md`:
- Line 4061 (section 12.1 row 2): client-facing endpoints select through the `clientColumns` maps of
  `packages/db/src/client-columns.ts` (explicit column objects, never `select *`, never a table object). They never
  return `clients.tags`, `clients.source`, `subscriptions.notes`, `payments.notes`, any `change_note`, any
  `created_by`, `programs.tags`, `nutrition_plans.tags` or `calendar_events.payload`.
- Line 4351 (C15): source scan every client-facing Hono route reachable under `apps/web/src/api` and its query
  helpers; SELECT uses the exported `clientColumns` projection; reject select-all, a table object or an internal
  field from 12.1 row 2. Assert the projection keys exclude the exact internal list and retain
  rejected_reason / review_note / coach_feedback / results.
- Lines 4963-4966: a table clients can read and that holds coach-internal columns gets a `clientColumns` entry.

## What we measured (read these first)

- `.work/tmp/c15_by_route.txt`: per route file, the number of non-compliant select sites in its import closure.
  `.work/tmp/c15_violations.txt`: the 137 sites the current test finds.
- Today the test treats every `apps/web/src/api` file whose text matches `/\bclient\b|isClient|clientColumns|clientOnly/`
  as client-facing (nearly all), follows imports of whole files, and demands each `.select(arg)` argument text match
  `/^clientColumns\.[A-Za-z]+$/`.
- Staff services refuse clients inside each function (`requirePermission`, `CLIENT_MATRIX` in
  `packages/core/src/authz/index.ts` has no clients, packages, settings or team module); a few routers deny the client
  role for the whole router (programs, dashboard, tasks, team, exercises, invitations after its public handlers).
- A read-only review (Codex, 12 Nov, thread in agent-bridge) found no client response that returns a listed internal
  column today. It found: (a) the scanner resolves `@/src/x` to `apps/web/src/src/x` (the alias `@/*` maps to
  `apps/web/*`, see `apps/web/tsconfig.json`), so those files were never scanned; (b) `server/forms/read.ts:136`
  selects ids from `calendar_events.payload` (a forbidden column) for a client-reachable path and strips them at
  line 139; (c) `server/settings/service.ts:25,29,76` select without map provenance; (d) mixed routers (forms,
  submissions, nutrition, foods, meal-logs, media, invitations, subscriptions, payments, calendar, conversations,
  notifications, settings) serve staff and clients from one file, so whole-file import traversal cannot separate them.

## Design (decided; follow it)

1. **Scanner correctness.** Resolve `@/src/x` and `@/x` through the `@/* -> apps/web/*` alias, `@dawlyy/db` and
   `@dawlyy/db/<sub>`, and relative imports. An import of a local module that cannot be resolved makes the test fail
   (fail closed), except type-only imports and imports of node or npm packages.
2. **Scope, fail closed.** Roots are the routers mounted in `apps/web/src/api/index.ts` (parse its `app.route(...)`
   calls). A router is **staff-only** only when its file has, before the first handler registration
   (`router.openapi`, `router.get`, `router.post`, ...), a `router.use('*', requireStaffRole)` call, where
   `requireStaffRole` is a new shared middleware you add in `apps/web/src/api/middleware/auth.ts` (or a new
   `staff-only.ts` beside it): it throws `forbidden()` when `c.get('auth').role === 'client'`, otherwise calls `next()`.
   The test recognises exactly that identifier imported from that module. Every other mounted router is
   **client-facing**, and its whole import closure (api, server and `packages/db/src` files, minus type-only imports and
   minus the staff-only routers' closures unless a client-facing file also imports them) is scanned.
   A router file that is mounted but cannot be classified counts as client-facing. New route files cannot escape.
3. **Mount `requireStaffRole`** (after `requireAuthMiddleware`) on every router that has no client-reachable handler:
   verify each handler of each router before you mount it, by reading it. Expected staff-only: clients, packages,
   exercises, programs, dashboard, tasks, team. Replace the existing ad-hoc client-deny blocks in those routers with it
   (same behaviour, 403 `forbidden`). Existing tests in `apps/web/src/api/*.test.ts` must still hold: do not edit them,
   except to add a case asserting a client gets 403.
4. **Split mixed routers.** For each remaining mixed router, move the client-reachable handlers into a separate
   client router file (for example `forms.client.ts`) that imports only client-only modules, and keep the staff
   handlers in the original router with `requireStaffRole`. In `index.ts`, mount the client router first and then the
   staff router on the same base path. Public paths, methods, request and response shapes, status codes and
   idempotency behaviour must not change. Move shared helpers so client-facing files never import a staff module:
   create `server/<area>/client-read.ts` modules (the repo already has `server/nutrition/client.ts`,
   `server/workout/portal.ts`, `server/forms/submissions.ts`) and have staff modules import from them, not the other
   way round. Where one function serves both audiences, give the client path its own function.
   If a router is too entangled to split safely, say so in your answer instead of guessing; leave it client-facing
   and list the remaining violations.
5. **Projections.** In client-facing files every `select`, `selectDistinct`, `selectDistinctOn` argument must be one of:
   `clientColumns.<table>`; an object literal whose every property is a `clientColumns.<table>.<column>` member or
   `...clientColumns.<table>` spread (plus `sql<...>` expressions that read only members of `clientColumns` maps);
   a local const whose initialiser is one of the above (the scanner follows a same-file const). Table objects,
   `getTableColumns(...)`, spreads of table objects, aliases of raw tables (`c.timezone` where `c` is a raw table
   alias), `select()` with no argument and relational `findFirst`/`findMany` stay forbidden. Convert the code
   (`clients.timezone` becomes `clientColumns.clients.timezone`); if a needed table or column is missing from
   `packages/db/src/client-columns.ts`, add it there only when it is not a listed internal column, and say so.
   The forbidden-column and required-key assertions in the test stay exactly as they are.
6. **`calendar_events.payload`** (`server/forms/read.ts:136`): find another way to resolve the attached form for a
   client (for example a column that already carries it, or resolve the attachment through the staff-only path and
   store the result in a client-visible column through an existing server write). If no compliant way exists without
   a schema change, do not touch the schema: leave that read as is, add a failing-closed note in your answer and list
   it as an open decision. Never allow-list it in the test.
7. **Prove the test is not weaker.** Add a second, in-file unit block in the same test file that runs the new scanner
   over small in-memory source strings (inject the source reader) and asserts it FLAGS: a table object, `select()`,
   `getTableColumns(x)`, `{ id: clients.id }`, `{ tags: clientColumns.clients.tags }`-style internal field access
   (the projection key check), `.findMany()`, an unresolved local import, a router with no `requireStaffRole`; and
   accepts the allowed forms. Keep the existing C15 assertions in place.

## Files you may write

`packages/db/test/security.catalog.test.ts` (the C15 block and `querySources` only), `packages/db/src/client-columns.ts`,
`apps/web/src/api/**` (non-test files, plus new test cases only where item 3 says), `apps/web/src/server/**`
(non-test files). Write nothing else. Do not touch migrations, `packages/db/src/schema`, core, docs, or any other test.

## You cannot run anything

No pnpm, node, vitest, tsc, psql, git or network. Check by reading: after each router change, re-read the handler
list and compare method, path and response shape against the router's test file in `apps/web/src/api/<name>.test.ts`.
Claude runs `python tools/run_db_tests.py --reuse-db test/security.catalog.test.ts`, typecheck and the web API suite.

## Answer

List: files written; for each mounted router, the class (staff-only or client-facing) and why; routers you could not
split and the remaining violations; every ambiguity you resolved; anything wrong in this brief. Keep it under 80 lines.
