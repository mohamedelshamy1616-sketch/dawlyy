# Fix batch R0-fix1: two red families in the full test-db after R0a-2 and R0c

Context: R0a (migration 0008), R0a-2 (inventory suites) and R0c (app layer) are in the working tree, uncommitted.
Claude ran the full `python tools/run_db_tests.py`: 13,161 passed, 18 failed. Log:
`.autopilot/jobs/20261114-141007-r0a-testdb2.log` (read each `FAIL` block). Web `tsc --noEmit` is clean.
The briefs behind the work: `tools/codex_briefs/r0a-reinvent-control.md`, `r0a2-suite-inventories.md`,
`r0c-app-controls.md`. Read `tools/codex_briefs/_common_db.md` and `_common_web.md` for the house rules; this brief
lists the files you may edit, and that list wins over theirs.

## Failure 1: C15 (`security.catalog.test.ts`, "client-facing routes SELECT projections")

The scan reports 19 projections in R0c code (listed in the log). C15 is the guard that keeps coach-internal columns
out of client-facing reads: a client-facing route must select through a `clientColumns` map (in
`packages/db/src/client-columns.ts`), not through a spread plus extra columns or a local column object. Read the
C15 test and the scanner it uses before changing anything (LESSONS.md, 2026-11-12 C15 entry, explains how scope is
derived from the mounted routers and the fail-closed `requireStaffRole` marker).

Fix it the way C15 intends; never by changing C15 or its scanner:
- Add the client-safe history fields to the maps in `packages/db/src/client-columns.ts`: `voidedAt` on meal logs,
  measurement sets, metric entries and workout sessions; `replacesId` on meal logs and measurement sets;
  `clientModules` on business settings. Then select `clientColumns.<map>` directly in the R0c readers and delete the
  local `*HistoryColumns` objects (or make them plain aliases of the maps if the scanner accepts that; check).
- `calendarEvents.cancelledBy` is a staff user id, an internal attribution like `created_by`: drop it from the
  client-facing calendar read instead of adding it to the client map. Staff reads keep it.
- `apps/web/src/server/red-flags.ts` and its router are staff-only: make the router carry the fail-closed
  `requireStaffRole` marker the scanner recognises (see `apps/web/src/api/client-modules.ts` line 14 for the
  pattern), so the scan correctly treats it as non-client; do not weaken the scanner.
- `history-controls.ts:39` (the void readback) must also go through the map.
- If a `clientColumns` inventory test pins the maps' exact keys (search the db and web tests for it), add the new
  keys there with a `// 0008` comment; do not remove any.

## Failure 2: 17 cells `G20 packages ua UPDATE <column> OLD archived` (`security.guard.test.ts`)

Expected one returned row, received none. The `packages_client_select` policy (0005) shows a client only
`is_public and archived_at is null` packages, so an archived package is invisible to the client actor `ua`, and an
UPDATE through RLS affects zero rows. The database is right; the R0a-2 engine's expectation for the archived OLD
state is wrong for actors that cannot see archived rows. Fix the engine's visibility model for the archived state
(the same way it already models other invisible OLD rows), so these cells expect the zero-row outcome. Do not
change any expectation for actors that can see the row.

## Files you may edit

`packages/db/src/client-columns.ts`, `packages/db/test/security.guard.test.ts`, `packages/db/test/guard-matrix.ts`,
the R0c files under `apps/web/src/server/**` and `apps/web/src/api/**` named in the C15 output plus the red-flags
router, and any test that pins the `clientColumns` keys (additions only). Nothing else.

## Acceptance (Claude runs it)

`python tools/run_db_tests.py` exits 0, and `pnpm --filter @dawlyy/web exec tsc --noEmit -p tsconfig.json` exits 0.
You may run the web typecheck yourself once at the end if the sandbox allows it.

## Answer

Files changed; for C15, each of the 19 sites and how it now reads; the engine change for G20 and why it is not a
loosening; anything wrong in this brief.
