# P7 fixes N1 to N4 (from docs/qa/p7-codex-final.md)

Read `docs/plans/BUILDER_BRIEF.md` first. Tests already in the repo are read-only; add new tests, never edit or delete an existing assertion. No commit, no push.

## N1 (high): `requireActiveAccess` is defined but mounted nowhere
`apps/web/src/api/middleware/access.ts:41`. An active membership with a suspended, expired or absent subscription can still start or sync workouts and read current nutrition.
- Mount the guard on the live routes: workout session start and sync, and the current nutrition plan. Use the existing `decideAccess` rules (grace keeps access; read-only history stays readable for expired and cancelled clients). Do not invent new rules; if `decideAccess` does not cover a route, say so in the report.
- Also enforce it in the shared server services that the web pages call, so a page cannot bypass the API.
- Order: after auth, before the idempotency replay (a replayed response must not leak past a lapsed subscription).
- Tests: per state (pending, active, grace, expired, suspended, absent) x (start workout, sync, current nutrition, history read), through the real API harness.

## N2 (medium): `app.register_push` deletes other users' endpoints across tenants
`packages/db/migrations/0006_guards_and_grants.sql:1722`: `delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid` has no tenant predicate.
- Do NOT edit the applied migration. Add the next numbered migration that replaces the function: delete only rows in the caller's own tenant (`tenant_id = tid`); an endpoint that exists in another tenant is left alone (the unique key is per tenant and endpoint, so both rows can coexist).
- Add a db security test: tenant A registers B's endpoint, B's row is still there. Keep every existing guard-matrix and catalog test green (the policy and function catalogs may need the new migration listed; update them only by adding, and say so).

## N3 (medium): database errors log private query parameters
`apps/web/src/api/index.ts:142`: `console.error('Unhandled API error', err)` logs the whole error; drizzle puts the bound parameters (client health notes) in message and properties.
- Log only an allowlist: error name, SQLSTATE `code`, request id, route and status. Never message, params, cause or stack text from a database error.
- Test: a failed insert whose parameter contains a marker string; assert the marker is absent from everything written to console.error.

## N4 (medium): idempotency buffers unbounded bodies
`apps/web/src/api/middleware/idempotency.ts:127`: `await c.req.raw.clone().arrayBuffer()` before any size limit.
- Enforce a streaming byte ceiling before cloning or parsing: reject with 413 when `Content-Length` exceeds the route class limit, and stop reading a stream that passes it. Use the existing media limit for upload routes and a small JSON limit (for example 1 MiB) for the rest; keep the constants in one place.
- Test: oversized body with and without `Content-Length` returns 413 and never reaches the handler; a normal request still replays correctly.

## Report
Files changed, commands run with last decisive lines, anything unverified. Run only the narrow suites for the files you touched, then one full `python tools/run_db_tests.py` and `--web` at the end.
