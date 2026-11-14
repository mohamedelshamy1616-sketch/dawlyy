# Batch R0a-2: teach the four inventory suites about migration 0008 (no loosening)

You finish wave R0, task R0a, of `docs/plans/2026-11-13-reinvent-build-plan.md`. R0a (your own earlier batch,
answer in `tools/.codex-answers/20261113-183607-r0a-reinvent-control.md`) wrote
`packages/db/migrations/0008_reinvent_control.sql`, the schema, `packages/db/test/security.reinvent.test.ts`,
`matrix.ts` and `guard-matrix.ts`. Claude reviewed it and ran it:

- `security.reinvent.test.ts` alone: 225 passed on a fresh scratch database.
- The full `test-db` (`python tools/run_db_tests.py`): 10,284 passed, 342 failed, every failure in four suites
  that pin exact inventories of the database. The full log is
  `.autopilot/jobs/20261113-230658-r0a-testdb.log` (read the `FAIL` blocks; each prints the expected-versus-received
  diff). Failures:
  - `security.catalog.test.ts`: C06 (dawlyy_rls EXECUTE signatures), C07 (definer list), C08 (guard JSON golden),
    C10 (trigger inventory), C24 (journal ends at idx 7).
  - `security.integrity.test.ts`: N01 (FK inventory), N02 (unique and PK inventory), N03 (CHECK inventory).
  - `security.matrix.test.ts`: does not compile; its exhaustive edit map has no recipes for `ai_drafts` and
    `red_flags`.
  - `security.guard.test.ts`: G20 (per-column update matrix: 168 `ai_drafts`, 66 `red_flags`, 24 `meal_logs`,
    24 `measurement_sets`, 9 `workout_sessions`, 4 each for `clients`, `programs`, `nutrition_plans`, `forms`,
    `packages`, `exercises`, 1 `business_settings` whose alternate value `{"alternate":true}` violates
    `business_settings_client_modules_ck`), G21 (insert and stamp contracts on the new tables) and G22 (counts 40
    `guard_row` triggers; there are now 42).

## Files you may write

Only these four: `packages/db/test/security.catalog.test.ts`, `packages/db/test/security.integrity.test.ts`,
`packages/db/test/security.matrix.test.ts`, `packages/db/test/security.guard.test.ts`. You may also make additive
fixes to `packages/db/test/guard-matrix.ts` and `packages/db/test/matrix.ts` if the guard or matrix engine needs a
property you left out. Do not edit the migration, the schema or `security.reinvent.test.ts`. If a failure shows a
real defect in 0008 (the database allows what the brief and the plan say it must refuse, or refuses what they say it
must allow), do NOT encode it in a golden: stop, and describe it in your answer with the evidence.

## Rules (read `tools/codex_briefs/_common_db.md` too; where it forbids editing these test files, this brief wins)

1. **Inventories gain the real new objects; nothing is removed or loosened.** Every existing expectation stays
   exactly as it is. You add the 0008 functions, definers, guard configs (copied from the 0008 trigger JSON
   character for character), triggers (name, function, `tgtype` bits, columns, WHEN), foreign keys, unique indexes,
   CHECK constraints and the journal idx 8. Each addition carries a short `// 0008:` comment naming the statement it
   pins.
2. **G20 and G21 expectations follow the new rules, not the old ones.** Where a new trigger changes the outcome
   for a column (for example `archived_by` is now stamped by `app.guard_archive`, `archived_at` needs `<module>
   edit`, a voided row refuses every update, `voided_*` and `replaces_id` refuse runtime writes, `ai_drafts`
   status only moves `draft -> rejected` at runtime, `red_flags` has no runtime INSERT and stamps `handled_*`), the
   test expects the new outcome, with the comment citing the 0008 section (A to F). Model it the way the engine
   already models other per-table rules (look at how it handles `packages.require_perm`, `client_update`,
   `editable_in`, `transitions`, `on_transition`); add a small engine feature only where no existing one fits, and
   explain it.
3. **Alternate values must be valid for the column's CHECK.** For `business_settings.client_modules` use a valid
   object with one module flipped (for example all seven keys with `messages: false`), not an arbitrary object.
4. **New-table setup**: G20/G21 need rows of `ai_drafts` and `red_flags` in each OLD state. Create them with the
   service connection (the trusted owner), the same way the suite builds other OLD states. `red_flags` rows come
   from the service insert, never a runtime insert.
5. G22's count becomes 42 because two `guard_row` triggers were added (`ai_drafts_50_guard`, `red_flags_50_guard`);
   keep the assertion that the table list equals the GUARDS keys.

## Acceptance (Claude runs it; you cannot)

`python tools/run_db_tests.py` exits 0: every suite green, including the four above, with no existing assertion
weakened. Claude diffs every changed line against this brief.

## Answer

Files changed; for each suite, what you added (counts per kind); every engine feature you added and why; every
place where you judged a failure to be a real defect in 0008 rather than a stale inventory, with the evidence.
