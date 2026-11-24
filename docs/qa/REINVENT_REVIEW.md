# Reinvention build: P9 review

Written 24 Nov 2026 by the autopilot worker (Claude Sonnet 5.5) after the Codex review of the reinvention build (P8, waves R0 to R5).

## How the review ran

- Three read-only Codex slices read the code, not the docs: A (database, `docs/qa/review-parts/A-db.md`), B (API, `B-api.md`) and C (core and web UI, `C-core-ui.md`). They found 22 issues: 4 + 9 + 9.
- I triaged each one against the code and the build plan (`docs/plans/2026-11-13-reinvent-build-plan.md`). Codex over-grades in-tenant issues; the "Triage" column is my own severity.
- Every fix came from a Codex read-only job (brief in `tools/codex_briefs/p9-fix-*.md`), was applied with `tools/apply_codex_patch.py`, and was gated by typecheck, the matching suites and a commit.
- No test, guard or RLS policy was weakened. Test edits are listed under "Test changes" with the sentence they follow.

## Findings

| ID | Reviewer severity | Triage | Finding | Status | Fix |
|---|---|---|---|---|---|
| RA-001 = RB-001 | critical | critical | Ordinary sync with a known UUID overwrote a logged meal or measurement, even after seven days. | fixed | `dc724fd` (sync cannot overwrite logged facts; corrections keep history) |
| RA-002 | critical | critical | The set history of a voided workout stayed writable. | fixed | `dc724fd` (voided workouts freeze their sets) |
| RA-003 = RB-008 | high / medium | medium | Approval re-checks its source hash and flags, then sends in a later statement; a concurrent client write is not caught. | accepted | OPEN_DECISIONS 27 |
| RA-004 | medium | low | Migration 0008 has no Drizzle snapshot. | accepted | OPEN_DECISIONS 30 |
| RB-002 | critical | high | The Inbox ignored source-module read permissions (payments, check-ins). | fixed | `641ecaa` |
| RB-003 | critical | high | Form archive and restore authorized `forms:edit` for every form kind. | fixed | `641ecaa` (module by form kind, in `guard_archive`) |
| RB-004 | critical | medium | A cached idempotent response is replayed for 24 hours after an assignment is revoked. It replays only the caller's own earlier response. | accepted | OPEN_DECISIONS 28 |
| RB-005 | high | by plan | A hidden module's data is still readable. The plan R2a says only that writes are refused. | accepted | OPEN_DECISIONS 26 |
| RB-006 | high | high | Generic `/metrics` wrote water or calories with the nutrition module off. | fixed | `641ecaa` (`metric-module.ts`) |
| RB-007 | high | high | A handled red flag hid later risky edits of the same source. | fixed | `a83a71d` |
| RB-009 | medium | low | A request-supplied message id could stand in for the review's sent-message binding. | accepted | OPEN_DECISIONS 29 |
| RC-001 | high | high | Approval could send prose the coach had not seen (another reviewer saved text in between). | fixed | 2a: saves and approvals carry the draft's text hash and answer 409 `draft_changed` |
| RC-002 | high | high | An old idempotency key could silently discard a new save. | fixed | `c788d18` (`mutation-attempts.ts`) |
| RC-003 | high | high | Common pain wording ("آلام", "painful") raised no safety flag. | fixed | 2a: lexicon terms added in normalized form |
| RC-004 | high | high | Both flat-weight calorie proposals were unreachable through the API (13-day window against a 14-day rule). | fixed | 2a: the review inputs carry one weight per day over a 21-day window (`rollingWeights`) |
| RC-005 | medium | medium | A deferred correction that failed after navigation vanished. | fixed | `c788d18` |
| RC-006 | medium | medium | "Same as yesterday" used today's revised portions. | fixed | `c788d18` (compares the plan document) |
| RC-007 | medium | medium | Disabling photos also hid measurements, and the reverse. | fixed | `c788d18` (entry shows while either module is on) |
| RC-008 | medium | medium | One client's unbounded weight history could fail the whole Inbox. | fixed | 2a: the Inbox reads the latest weight per local day in its window |
| RC-009 | medium | medium | Three acceptance tests could pass without exercising their claim (offline flush, Inbox to review, disabled workout). | fixed | `c788d18` (the review timing spec now submits a weekly check-in so the Inbox action exists and is required) |

Totals: 22 finding IDs, 16 fixed and 6 accepted with a recorded reason (RA-003, RB-008, RA-004, RB-004, RB-005, RB-009). No critical or high finding is open except RB-004 and RB-005, which are accepted; Mohamed can overrule either in OPEN_DECISIONS.

## Test changes (none weakened)

- `packages/db/test/security.guard.test.ts`: the G21 archive matrix resolves the archive module per form kind (`archiveModuleOf`). It follows the new `guard_archive` rule (RB-003). Refusals for staff without the module are still asserted.
- `apps/web/src/components/client-today/components.test.ts`: the Me hub hides Progress and Tracking only when both measurements and photos are off, and shows Progress when only photos are on. It follows RC-007 and the build plan R2a, "every module honours `client_modules`". `navigation.test.ts` covers the same rule.
- `apps/web/e2e/beta/r4b-review-approve.spec.ts`: the timing test now requires the Inbox action (RC-009). The A/B/A save test now follows RC-001: after a lost response the next save is refused with `draft_changed`, the editor adopts the stored draft, and the later saves must still use distinct idempotency keys (RC-002).
- Codex tests for RC-002, RC-005, RC-006, RC-007 and RC-009 changed assertions that matched the superseded behaviour; each cites its finding.

## Checks

All eight checks (typecheck, lint, build-web, test-core, test-db, test-web, e2e-ar, e2e-en) are run by `run_checks.py` on the committed tree. The result for the final commit is in the autopilot evidence file for that HEAD. The closing line below is true only while that evidence is green; it is removed if a check fails.

Reinvent build: complete
