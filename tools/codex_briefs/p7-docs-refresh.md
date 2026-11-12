# Batch P7-docs: refresh the four owner-facing docs against the current code

No code changes. You edit only documentation so it matches what the repository does at HEAD (`b2c4b9f`).
Read `docs/plans/BUILDER_BRIEF.md` first. Do not run pnpm, node, psql, git or any network command.

## What changed since these docs were last written

Read these for the facts (do not invent any): `docs/qa/p7-codex-prereview.md` (R1 to R4, S1 to S4),
`docs/qa/p7-codex-final.md` (N1 to N4), `docs/qa/p7-n1-n4-fixes.md`, the 12 Nov blocks at the end of
`docs/plans/STATE.md`, `packages/db/migrations/meta/_journal.json`, `packages/db/migrations/0007_push_tenant_scope.sql`,
and `docs/plans/OPEN_DECISIONS.md` entries 16 to 18 if present. Summary of behaviour changes:

- Migration `0007_push_tenant_scope` now exists (journal now ends at 0007): push handover is limited to the caller's tenant.
- A client without an active subscription is refused (`requireActiveAccess`) for workout start, workout sync and the current
  nutrition plan (`GET /nutrition/me`); nutrition history stays readable.
- Mutations on `/api/v1` refuse a foreign `Origin` (403 `cross_origin`).
- Idempotency keys are reserved before the handler; a concurrent retry gets 409 `idempotency_in_progress`.
- Push endpoints must be https on port 443 at a known provider; unexpected API errors log only name, SQLSTATE, request id,
  route and status; request bodies are bounded (1 MiB JSON, 8 MiB for the local media upload route), 413 `payload_too_large`.
- Free tiers of Supabase, Vercel and Resend were approved for the beta on 12 Nov 2026 (see APPROVALS.md section 3 near the end).

## Files you may write (and nothing else)

1. `docs/qa/HOW_TO_TEST.md`: plain Egyptian Arabic, the same structure and tone as now. Verify every command and demo login
   against `tools/start_preview.ps1`, `apps/web/e2e/` and the seed before keeping it. Add a short item to "what to try":
   a client whose subscription is not active is refused for workouts and the current nutrition plan (show where to see the
   message in the app if the UI shows one; otherwise say it appears as an error). Keep the bug-report section. Mark the
   "not ready or temporary" list so it matches reality (check the code, do not copy old claims).
2. `docs/plans/APPROVALS.md`: keep the heading `## Budget total` exactly once. The file currently has a stray section
   "## 3. Free tiers ..." after the budget section: merge it into the numbered list in order (renumber if you must, keeping
   items that are already marked done). Every pending item states the exact action, why, the cost and what it unblocks.
   Prices stay marked "check before paying"; read amounts from `docs/plans/BUDGET.md`, never invent a price.
3. `docs/plans/LAUNCH_RUNBOOK.md`: add migration `0007_push_tenant_scope` to the journal order list and any step that names
   "the last migration"; add the S2 open note if missing (hosted upload signatures bind neither size nor MIME until the
   bucket carries limits); add the same-origin guard to the hosted checks (env var `DAWLYY_ALLOWED_ORIGINS`, name only);
   note the in-memory rate limiter is per instance. Do not remove any existing step.
4. `docs/plans/OPEN_DECISIONS.md`: make sure decisions 16, 17 and 18 are present and accurate against
   `docs/qa/p7-n1-n4-fixes.md`; remove nothing else.

## Rules

Plain, short sentences in English files; plain Egyptian Arabic in HOW_TO_TEST.md. No secrets, no env values. Keep LF line
endings. Do not edit any file not listed. If a statement in an existing doc is false against the code, fix it and list it
in your answer.

## The answer

Files changed, each factual correction you made (old claim, new claim, evidence file:line), and anything you could not verify.
