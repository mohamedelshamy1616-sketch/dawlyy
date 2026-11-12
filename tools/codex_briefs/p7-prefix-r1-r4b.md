# P7 follow-up fixes D1 to D4 (from docs/qa/p7-codex-diff.md, findings R1 to R4 of the diff review)

Read `docs/plans/BUILDER_BRIEF.md` first. Existing tests are read-only: add tests, never edit or delete an existing assertion. No commit, no push. These are regressions or gaps left by the N1 to N4 fixes in `b2c4b9f`.

## D3 (high, do first): the new body ceiling rejects schema-valid requests
`apps/web/src/server/request-limits.ts:2`. Probe: 1,000 sets with 1,000-character notes is 1,226,024 bytes and gets 413; the outbox then retries the same batch forever (`apps/web/src/lib/outbox/flush.ts:34`). A maximum-size CSV import also exceeds the ceiling after JSON wrapping (`apps/web/src/server/exercises/validation.ts:46`).
- The server limit for a route class must be at least the largest body its own schema accepts. Derive the JSON ceiling from the contracts (or set per-route limits for workout sync and CSV import) and keep all constants in `request-limits.ts`.
- The client must never build a batch the server will refuse: byte-bound the outbox batches in `flush.ts` (split by encoded size, not only by count), and on a 413 split the batch and retry instead of retrying it unchanged.
- Tests: the largest schema-valid sync batch and the largest valid CSV import are accepted; one byte over the limit is 413; the outbox splits an oversized queue into accepted batches.

## D1 (medium): free-meal entry page throws for paused or expired clients
`apps/web/app/[locale]/app/nutrition/log/page.tsx:14` calls the gated current-plan loader (`apps/web/src/server/nutrition/client.ts:19`) only to resolve the date. Logging a free meal stays allowed for those clients.
- Resolve the date without loading the gated plan. The page renders for paused and expired clients; the current plan itself stays gated.
- Test: paused and expired clients open the page and log a free meal; they still cannot read the current plan.

## D2 (medium): sets queued offline are lost when the subscription lapses before reconnect
`apps/web/src/server/workout/write.ts:140`: a session started while access was active, sets queued offline, subscription frozen or expired before reconnect: sync returns 403 and the outbox retries without ever saving.
- Rule: a sync for an EXISTING session is accepted when that session was started while the client had access (compare the session start with the access window). Starting a NEW session stays blocked. No new access rules beyond this one.
- On a final 403 the outbox must stop retrying and keep the sets visible to the user as not uploaded, never drop them silently.
- Record the rule in `docs/plans/OPEN_DECISIONS.md` as a new item marked "decided by Claude 12 Nov, Mohamed can change".
- Tests: started-while-active then expired: sync accepted; start after expiry: 403; outbox stops after a final 403.

## D4 (medium): logout leaves the previous user's push subscription on a shared device
`packages/db/migrations/0007_push_tenant_scope.sql:28` now keeps rows of other tenants, and both sign-out buttons (`apps/web/components/app/sign-out-button.tsx:13`, `apps/web/src/components/shell/sign-out-button.tsx:15`) skip push cleanup, although `docs/plans/OPEN_DECISIONS.md:28` assumes it.
- On sign-out, unsubscribe this browser's push subscription and delete the caller's own row for that endpoint through the existing API (own rows only, RLS as usual), before the session ends. A failure must not block sign-out.
- Test: after sign-out the caller's row for that endpoint is gone; another user's rows are untouched.

## Report
Files changed, commands run with their last decisive lines, anything unverified. Run only the narrow suites for the files you touched, then one full `python tools/run_db_tests.py` and `--web` at the end. Do not run e2e: the final `run_checks` does that once.
