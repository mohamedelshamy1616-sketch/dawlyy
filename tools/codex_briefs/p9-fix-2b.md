Review report: `docs/qa/review-parts/C-core-ui.md` (read the rows named below for the full scenario and evidence). Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`. Hard rules as in `tools/codex_briefs/p9-fix-1.md`: never weaken a test, guard or check; a test that asserts the old behaviour of a finding may change only to the new behaviour, with the justification in your prose; earlier fix edits (F1 to F6, RC-001 which changes the review approve request) may already be applied, so read current files.

Do ONLY these findings (client-side and e2e). Everything else is a separate job.

## RC-002 (high): an old idempotency key silently discards a new save
`apps/web/src/lib/client-app-composer/transport.ts:76-97` and `apps/web/components/review/review-workspace.tsx:88` keep an idempotency key per payload signature. Scenario: save A (commits, response lost), save B succeeds, save A again reuses A's old key and the server replays A's cached response, so B stays in place while the UI says A saved. Fix: a key belongs to one attempt. Keep it for an immediate retry of the SAME unresolved attempt; when any other save succeeds or a different payload is submitted, drop every unresolved key of that resource so a later A gets a fresh key. Apply the same rule in both places and anywhere else the same signature-keyed pattern exists in `apps/web/src/lib` (search for it). Add tests: A committed with lost response, then B committed, then A again: the third request carries a new key and the final state is A.

## RC-005 (medium): deferred correction failures vanish after navigation
`apps/web/src/lib/client-corrections/correction-actions.ts:21` suppresses the failure callbacks when the component that scheduled the correction unmounted, and `apps/web/src/lib/control/undo-store.ts:91` clears the failed action. Keep the outcome app-wide: a failed deferred commit must leave a visible failure with a Retry (original key and body) that survives navigation (for example a toast or banner rendered by the store's host component), and a late successful commit must still invalidate the affected view caches. Mounted checks stay only around local component state. Add a test where the component unmounts and the commit then fails and then succeeds.

## RC-006 (medium): "same as yesterday" uses today's portions
`apps/web/src/lib/client-corrections/quick-log.ts:55-68` resolves yesterday's meal/option IDs against the CURRENT published document, so a republished meal with the same IDs but different quantities is logged with today's quantities. Resolve from yesterday's recorded plan version when it can be read from the data the quick log already has; when yesterday's version cannot be resolved or its option differs from the current one, offer the shortcut only if the portions are identical, otherwise omit it. Add a test with unchanged IDs and changed quantities that proves no wrong-portion shortcut is offered.

## RC-007 (medium): hiding photos also hides measurements and the other way round
`apps/web/components/client-today/client-destinations.ts:54` requires both `measurements` and `progress_photos` for both Me-hub links. Show each destination when either module is on, as `components/tracking/tracking-screen.tsx:35` already supports separate visibility. Update `apps/web/src/components/client-today/navigation.test.ts:69` to the new rule (both mixed configurations reachable, both off hidden).

## RC-009 (medium): acceptance tests that no longer exercise their claim
Restore real assertions, without lowering any bar:
- `apps/web/e2e/offline-workout.spec.ts:79`: compare with the baseline (`git show 96ada68:apps/web/e2e/offline-workout.spec.ts`) and make the test again attempt the named double flush (replay a captured pending batch, or two flush triggers while the first is in flight) and assert exactly one server record.
- `apps/web/e2e/beta/r4b-review-approve.spec.ts:73` and `:118`: the Inbox review action must be REQUIRED (fail if missing), no fallback to direct navigation.
- `apps/web/e2e/beta/r2a-client-start.spec.ts:87-101`: actually POST a workout write with the module disabled (use the page's authenticated request context and a valid body) and assert 403 `module_disabled`.
You cannot run Playwright; write the code carefully against the existing helpers in the same files.

## Answer
Patches in the apply_patch format, then prose: decisions, tests added or changed (and justification), anything you think is wrong in this brief.
