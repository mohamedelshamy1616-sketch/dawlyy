## Your slice: B, API endpoints (ID prefix `RB-`)
Report file: `docs/qa/review-parts/B-api.md` (create the folder if needed).

Scope: every route file in `apps/web/src/api/` changed or added since `96ada68` (inbox, review, red-flags, history-controls, client-modules, activity, calendar, meal-logs, measurements, workout-sessions, conversations, programs, packages, me, media, photos, forms, nutrition, exercises, index.ts) plus the helpers they use (`requirePermission`, `requireActiveAccess`, `withAuthTx`/`withServiceTx`, idempotency, cursor pagination) and the related unit and API tests.

Questions to answer with evidence:
1. For every new or changed endpoint: authentication, permission, active-access, tenant and client scoping (can client A act on client B, staff outside their client scope, another tenant?), input validation (Zod), idempotency, and error codes. Make a table of endpoint, method, guard chain, verdict.
2. Module gate: when a coach hides a module (nutrition, etc.) does every read AND write route of that module return 403 for the client, including indirect routes (feeds, summaries, history, attachments)?
3. Review approve and send: stale-draft binding (input_hash recomputed server-side at approve?), double-approve, approve of another tenant's draft, message sent only once.
4. Red flags and safety detection routes: can a client suppress or forge a flag, can another tenant read it?
5. `withServiceTx` callers: anything running with service privileges that trusts request-controlled ids or tenant?
6. Client-facing reads: do they go through `clientColumns` (C15)? Any response leaking server-only fields, other clients' data, internal notes, or payment-verification fields?
7. Dev-login: confirm it cannot be reached when `NODE_ENV=production` (and that a test proves it).
