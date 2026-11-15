# DAWLYY build — state record

This is the single hand-off file. Any model or session that continues the build reads this file first,
then `docs/plans/2026-11-07-dawlyy-build-plan.md` (the contract), and does **not** re-plan.
Update this file at every meaningful transition: a wave finished, a decision taken, a failure found.

Last update: 2026-11-15 15:50 (Africa/Cairo), by the autopilot worker (Claude Opus 5.5): P8 batch 2.

## Autopilot worker log (newest first)

### 15 Nov 15:50, R2a and R3a merged, main green; R3b paused at the Codex limit (back 20:13)

- New worker session after a reboot (15:07). Weekly Claude usage 86%, so this session only reviews, gates,
  commits and runs Codex (playbook 85% rule): no Sonnet builders, no own code beyond integration fixes.
- R2a: the merge (6f8be56) had left its integration fixes uncommitted with 3 tsc errors in two tests. Fixed with a
  typed provider view (LESSONS 15 Nov) and committed fb0eed6: web tsc 0, lint 0 errors, client-today 109/109.
- R3a: merged with its six integration patches and its 3 lint errors fixed (setState moved from two fetch effects
  into the handlers that drive them; the test children prop). Committed 1325a96. Gates on main: web tsc 0, lint
  0 errors (25 warnings), test-web on a fresh database 94/94 files, 908/908 tests (job
  `20261115-154334-main-testweb-r3a-2`). The first run timed out two untouched DB suites in setup under boot load;
  they passed alone, then the full rerun passed.
- Worktrees r2a and r3a deregistered; their folders stay on disk with build output only (long paths).
- R3b: Codex job `20261115-151025-r3b-3` (resume note added to `r3b-run.md`) hit the ChatGPT plan limit after 21
  minutes, "try again at 8:13 PM". Its files stay in `../dawlyy-wt-r3b`: the activity route and its test, the
  activity messages, `src/server/activity/`, and `integration/r3b.md`. Nothing is reviewed yet.
- **Next (from 20:15):** relaunch `r3b-run.md` with the same flags (one Codex job at a time, OPEN_DECISIONS 24);
  its resume note already tells it to keep and re-verify what is in the worktree. When it ends, review, gate and
  commit in the worktree, merge into main with `integration/r3b.md`, gate main (tsc, lint, test-web). Then R4d
  (`r4d-run.md`, worktree `../dawlyy-wt-r4d` is ready), then the remaining batch per `turbo-file-map.md`.

### 14 Nov 22:58, batch 2 relaunched on Codex (R2a, R3a, R3b); R4d worktree prepared

- New worker session after the Claude 5-hour reset (22:20). The four run briefs gained the multi-agent sentence
  the playbook requires; committed 8cb51ed.
- Codex jobs `20261114-225529-r2a-2`, `20261114-225531-r3a-2`, `20261114-225531-r3b-2` (gpt-6.1-sol, fast, max,
  multi-agent), each in its clean worktree at 3a29992. codex_build writes its log only when Codex exits, so
  progress shows as changed files in the worktrees.
- `../dawlyy-wt-r4d` (branch `wt/r4d` at 3a29992) created with `packages/db/.env`; dependency setup running in the
  worktree as a background shell command.
- **Next:** review, gate and commit each job in its worktree as it lands; merge R2a, R3a, R3b, R4d into main in
  that order, applying `tools/codex_briefs/integration/<task>.md`; typecheck and lint on main after each merge.
  Launch R4d (`r4d-run.md`, same flags) in the first free Codex slot.

### 14 Nov 18:35, batch 1 done: R1b merged (3a29992), main green; batch 2 starting

- R1b built by Codex (xhigh, multi-agent) in worktree wt/r1b; reviewed by Claude; inbox loader patch applied at
  merge. Worktree gates: web tsc 0, lint 0 errors, unit 6/6, `inbox.test.ts` 5/5, catalog (C15) 113/113. Commit
  41ff78e, merged as 3a29992. Main gate after the merge: typecheck 0, lint 0 errors, test-web 86 files 728/728
  (job `20261114-182629-main-gate-r1b`).
- Briefs committed 28ec248. A read-only Sonnet audit of every endpoint the briefs consume found 8 mismatches with
  main (verified, then appended as errata to r2a, r2b, r3a, r4b, r4d; `/me/app` fixed in r2a, r2b, r2c, r5).
  R3a also owns the archived=true forwarding on the Exercises, Foods, Nutrition and Packages pages.
- Worktree runs need `packages/db/.env` (gitignored) copied in for the DB runner. `git worktree remove` left
  `../dawlyy-wt-r1b` on disk (Windows long paths in node_modules); it is deregistered and holds only build output.
- **Next:** batch 2 per `turbo-file-map.md`: R2a, R3a, R3b now (worktrees made, setup running), R4d in the next
  free slot; run briefs `tools/codex_briefs/<task>-run.md`. Merge order R2a, R3a, R3b, R4d.

### 14 Nov 17:57, R0 committed: R0a e8f1a08 and R0c 0c9e34d; next R1b in a worktree when Codex is back

- r0-fix1 finished (Sonnet builder, resumed): C15 fixed through the clientColumns maps and the `requireStaffRole`
  marker; G20 engine models that a client cannot see an archived package. Full test-db 13,179/13,179
  (`20261114-173212-r0-testdb3`), committed with 0008 as e8f1a08.
- R0c gates first gave 4 test-web failures and 2 lint errors. Root cause: R0c had extended `GET /me`, whose
  minimal response `access.test.ts` and `api-harness.test.ts` pin. `/me` is restored unchanged; preferences,
  numerals and client modules moved to the new `GET /api/v1/me/app` (R2a's client app reads it). The history
  test helper now converts text timestamps (LESSONS 12 Nov); two `module` variables renamed. No existing test
  changed. Then test-web 715/715, web tsc 0, lint 0 errors. Committed 0c9e34d.
- A Codex job from the attended session (`20261114-175041-turbo-briefs-rest`) is writing r3b, r5 and
  turbo-file-map; leave those brief files alone until it ends.
- **Next:** after the Codex limit (18:41): R1b (`r1b-inbox-nav.md`) in `../dawlyy-wt-r1b` per turbo mode; review
  the attended briefs; then the R2/R3/R4b/R4d/R5 batches.

### 14 Nov 14:55, WAITING for the 5-hour reset (84%); R0-fix1 not done

- The Sonnet builder for `r0-fix1.md` was stopped twice by worker session restarts. It left 7 added lines in
  `packages/db/src/client-columns.ts` (keep them); nothing else of the fix is done.
- The 5-hour Claude window is at 84% (resets 17:20), above the 80% brake; Codex is at its plan limit until 18:41.
- **Next run:** finish `r0-fix1.md` (Codex after 18:41, a Sonnet high builder before it), then the full gate and
  the R0a, R0a-2 and R0c commits.

### 14 Nov 14:40, R1c committed; R0a-2 and R0c done; one fix round left; Codex at its plan limit until 18:41

- The two Codex jobs of 13 Nov were killed at 23:45 when the machine stopped. Relaunched with resume briefs
  (`*-resume.md`); both finished (`20261114-134045-r0a2b`, `-r0cb`).
- **R1c committed** (`de681b5`): the client hub (Week, Plan, Money, Notes; assign a program in 3 taps).
- **Gates.** Web `tsc --noEmit`: exit 0 with R0c in the tree. Full `test-db`: 13,161 passed, 18 failed
  (job `20261114-141007-r0a-testdb2`):
  - C15: 19 R0c projections spread `clientColumns` plus extra columns, and the staff-only red-flags router lacks
    the `requireStaffRole` marker. Fix: add `voidedAt`, `replacesId`, `clientModules` to the maps in
    `packages/db/src/client-columns.ts`, drop the staff id `cancelledBy` from the client calendar read, mark the
    router. C15 and its scanner stay unchanged.
  - 17 cells `G20 packages ua UPDATE * OLD archived`: RLS correctly hides archived packages from clients
    (`packages_client_select ... archived_at is null`); the R0a-2 engine expected a row. Fix the engine's model.
- **Codex hit its ChatGPT plan limit** at about 14:25 (reset "6:41 PM"). The attended session's `turbo-briefs`
  job wrote six briefs (`r2a`, `r2b`, `r2c`, `r3a`, `r4b`, `r4d`) and stopped before `r3b`, `r5` and
  `turbo-file-map.md`. The fix brief `tools/codex_briefs/r0-fix1.md` went to a Sonnet high builder instead.
- **Next.** When the builder returns: full `test-db`, web tsc, lint, `test-web`, then commit R0a with R0a-2 and
  R0c. Then R1b in a worktree on Codex after 18:41, and the missing briefs (`r3b`, `r5`, file map).

### 13 Nov 23:55, R4a and R1d committed; R0a-2 and R0c on Codex

- **R4a committed** (`d3d333c`): `packages/core/src/review/`. Core gate: 18 files, 935 tests passed.
- **R1d committed** (`f772963`): the compact program editor (collapsed exercise rows, a 3-field set row, "More"
  per set, collapsed block settings). Not measured yet: the screens job at the end of the wave gives the 390 px
  height (target under 3,000 px).
- **P9 follow-up from R1d.** `apps/web/e2e/beta/beta-gate.spec.ts` lines 255-263 must open the new exercise row
  and each set's "More" before Remove set. The set label is now built with Western digits (R0b numeral policy), so
  the spec's `new Intl.NumberFormat(locale)` for the set number must become the app formatter. These follow plan
  R1d and R0b item 2.
- **R0a full test-db:** 10,284 passed, 342 failed, all in inventory suites (catalog C06, C07, C08, C10, C24;
  integrity N01 to N03; matrix compile; guard G20 to G22). No behaviour suite regressed. Codex R0a-2
  (`r0a2-suite-inventories.md`, xhigh, job `20261113-232957-r0a2`) updates the four suites without loosening.
- **Running:** Codex R0a-2 and R0c (`20261113-231910-r0c`).

### 13 Nov 23:20, R1a and R4c committed; R0a in its full test-db; R4a and R0c on Codex

- **R1a and R4c committed** (`8422cd4`): the attention ranking and the red-flag lexicon, with the `./attention`
  and `./safety` exports. Evidence: core typecheck exit 0, core vitest 17 files, 803 tests passed.
- **R0a reviewed.** The migration matches the brief; the permission modules it uses (`clients`, `programs`,
  `nutrition`, `forms`, `packages`, `exercises`, `tracking`, `checkins review`) all exist in `MODULES`.
  `security.reinvent.test.ts` alone: 225 tests passed on a fresh scratch database (job `20261113-230255-r0a-db`).
  The full `test-db` is running (job `20261113-230658-r0a-testdb`). Codex said three legacy suites need additive
  inventory updates: `security.catalog.test.ts` (C06, C07, C08, C10, C24), `security.guard.test.ts` (G22 counts 40
  guards, now 42; new-table setup) and `security.matrix.test.ts` (the exhaustive edit map). Those are inventory
  pins, not behaviour: update them to the real new objects, never loosen an assertion.
- Review note for P9: the `ai_drafts` staff insert policy has no permission check (any in-scope staff can create a
  draft; approval still needs `checkins review`). Low severity; record it in REINVENT_REVIEW.
- **Running on Codex:** R4a (`r4a-week-review.md`, high, job `20261113-231409-r4a`, writes only
  `packages/core/src/review/**`) and R0c (`r0c-app-controls.md`, high, `--common none`, job
  `20261113-231910-r0c`, writes `apps/web/src/server/**`, `apps/web/src/api/**`, one type line in `tenants.ts`).
  R0c also carries the server half of R2a (the `module_disabled` gate) and of R4c (raising red flags on write), so
  R2a and R4c's integration are UI-only later.
- **Next.** Finish R0a (the three suite updates, full test-db green, commit). Then review R4a and R0c. R1b to R1d
  are UI builders and wait for R0c, because R1b's inbox API lives in `apps/web/src/api`.

### 13 Nov 18:58, the attended session launched R1a and R4c on Codex (do not relaunch them)

- Mohamed asked for Codex's full power, so the playbook now allows up to 3 Codex jobs at once on disjoint files.
- The attended session started two jobs beside R0a:
  - `20261113-185800-r1a`: `r1a-attention.md`, effort high. It writes only `packages/core/src/attention/**` and
    `packages/core/test/attention.test.ts`.
  - `20261113-185800-r4c`: `r4c-safety-lexicon.md`, effort medium. It writes only `packages/core/src/safety/**` and
    `packages/core/test/safety.test.ts`.
- Their file sets are disjoint from R0a and from each other.
- Review, gate and commit them like your own jobs. Add the `./attention` and `./safety` exports yourself, as the
  briefs say.
- Next free Codex slot: write and launch the R4a (`review/`) brief, then the R4d (`server/ai/`) brief after R0c.

### 13 Nov 18:50, wave R0 running: R0a on Codex xhigh, R0b on a Sonnet builder

**Running.**
- R0a: Codex xhigh job `20261113-183606-r0a`. Brief: `tools/codex_briefs/r0a-reinvent-control.md`, run with
  `--common none` because `_common_db.md` forbids editing migrations.
- R0b: a Sonnet medium builder. Brief: `tools/codex_briefs/r0b-ui-fixes.md`. It may not touch `packages/`,
  `src/api` or `src/server`.

**R0a covers only the database layer.** It writes migration 0008, the Drizzle schema, the core `ClientModules`
type and `security.reinvent.test.ts`. The plan's R0a also implies app-layer work that R2b and R3a need:
- default lists exclude archived rows;
- archived listings for every entity;
- package unarchive;
- the void and correction endpoints, with voided rows left out of totals and charts;
- the `client_modules` settings read and write;
- storing the per-user numeral choice (`UserPreferences.numerals`) and its settings toggle.

These become task **R0c** (files: `apps/web/src/server/**`, `apps/web/src/api/**`, their tests). It starts after
R0a is committed and after R0b, so the file sets stay disjoint.

**Design decisions in the R0a brief.** Each one takes the reading that is safer for isolation.
- Archive and restore need `<module> edit`. That is the permission the clients and packages archive paths already
  use. A new trigger, `app.guard_archive`, enforces it and stamps `archived_by`; `guard_row` is not edited.
- Voids go only through `app.void_entry` (security definer). The 7-day window counts from `created_at`, the server
  clock. A voided row refuses every runtime update and delete.
- Corrections with an automatic void apply to `meal_logs` and `measurement_sets` (new `replaces_id`).
- `metric_entries` keeps its existing append-only `correction_of` behaviour. Tests K04 and K20 in
  `security.tracking.test.ts` pin that a correction leaves the original unchanged. It only gains void.
- `ai_drafts` reach `approved` or `stale` only through `app.approve_ai_draft` (security definer, with its own
  tenant, access and `checkins review` checks). A direct UPDATE to `approved` is refused (advisor finding).
- `red_flags` are inserted only through `app.raise_red_flag`, which checks that the source row is the caller's or
  visible to them.

**Note for P10.** The plan's rollback premise ("0008 only adds columns and tables") no longer fully holds. 0008
also adds triggers that refuse writes the old build never makes: direct `archived_by`, void columns, updates of
voided rows. So the old build should still run on the new schema. The P10 session must confirm this with a smoke
test after a rollback, not assume it.

**Next.** Review R0a: answer file, diff, apply on a scratch database, full `test-db`, then a filtered `test-web`
on the clients, packages, programs, tracking and calendar suites. Then review and commit R0b. Then start R1a
(Codex high) and R0c.

### 13 Nov 18:40, the reinvention build starts: P8 wave R0 (written by the attended session)

**What happened.** The private beta reached DONE on 12 Nov. Mohamed then judged the app ordinary. On 13 Nov the
attended session ran seven research tracks:
- the report: `docs/research/reports/DAWLYY product reinvention research.md`;
- the notes: `docs/research/research_notes/DAWLYY product reinvention research/`;
- Codex's critique: `docs/plans/REINVENT_CODEX_PROMPT.md`.

Mohamed approved the build and delegated the direction, so the direction is A+B (decision 23).

**The new contract.** It is `docs/plans/2026-11-13-reinvent-build-plan.md`, and the playbook now has P8 to P10.
Its hard limits:
- no paid AI and no LLM network calls;
- no meal photo;
- no payment void;
- corrections preserve history;
- new RLS coverage;
- one token file.

The decisions taken for this build are 20 to 23 in OPEN_DECISIONS.md.

**The DONE gate.** `.autopilot/config.json` now also requires `docs/qa/REINVENT_REVIEW.md` ending in
`Reinvent build: complete`, with no open critical or high row. `done_check.py` fails on HEAD as intended.

**Next action.**
1. Start wave R0. Launch R0a (the 0008 migration, schema and `security.reinvent.test.ts`) as the one Codex xhigh
   job.
2. In parallel, start R0b (the shared UI fixes) on a Sonnet builder.
3. Then run R1a (the attention module) on Codex after R0a returns.

### 11 Nov 14:05, T12b and T12c in; screens job needs a smaller scope

- T12c committed `cf84e8c` (vercel.json, env examples, LAUNCH_RUNBOOK, RESTORE_DRILL; OPEN_DECISIONS 11 to 13). T12b (Codex, 498-line beta-gate spec in `apps/web/e2e/beta/`, own config `playwright.e2e.config.ts`) is written but not yet run; its answer lists the GAPs: no client-invite control (invitation API used), dev login refuses identities without a demo membership (step 2 blocked), first meal through the draft API, weekly check-in sent manually because core emits `weekly_checkin` while the runner reads `checkin`, second payment recorded through the API, a freeze must elapse before an extension.
- Screens: `screens5` to `screens8` all hit the 1-hour single-test cap or a Turbopack panic. Cause: `next dev` compiling about 55 routes on a RAM-starved machine is too slow for one 284-shot test. Decision: stop running the full screens job after every task. Run it once at the end of P5, after the Astryx polish, split per role and locale, or on a production build with a different login path. The 205 shots of `screens7` stay as the baseline of the pre-polish state.
- A production-style check is still owed: the dev log reports "Next.js encountered runtime data during prerendering" for `app/[locale]/layout.tsx` (`NextIntlClientProvider`) and the `[locale]` pages. `next build` (check `build-web`) must be run; it may fail on this.
- Next: tsc/eslint on the e2e files, a `next build` run with `DAWLYY_DIST_DIR=.next-build`, Astryx theme builder, polish builders, T12b fixes and a first run.

### 11 Nov 11:40, T12a (demo seed) committed 87517af; screens run restarted

- Codex T12a reviewed. Evidence on fresh scratch database `dawlyy_t12`: migrations 0000 to last applied, system seed 210 exercises and 371 foods, `seed/demo.ts` ran, a second run left every table count unchanged, `demo-reset.ts` then reseed restored 1 tenant, 8 clients, 10 payments, 192 set logs; db `tsc` exit 0; `seed/demo.test.ts` 7/7 (vitest now also discovers `seed/**/*.test.ts`). Upgrade path from the old 3-client seed (`dawlyy_t12b`, old demo.ts at 41a5016 then the new one) also works: 8 clients, 10 payments, 7 programs.
- Demo logins are now 10 (owner, staff, 8 clients; see `docs/qa/HOW_TO_TEST.md`, rewritten in Egyptian Arabic for the current state).
- Screens job: `screens5` hit the 1-hour test cap and its cold dev compiles gave false FAIL rows; `screens6` died because the dev server did not answer in 180 s. Fixes: warm-up pass visits every route once per role before capturing, webServer timeout 600 s. `screens7` is running (dev server in `.next-screens`; Mohamed's own `next dev` on :3200 PID 28080 holds `.next`, never touch it).
- Codex `p5-t12c` (vercel.json, env examples, LAUNCH_RUNBOOK, RESTORE_DRILL) is running, effort medium.
- Next: review screens7 (fix real FAIL rows), review t12c, then Astryx theme builder and polish builders (briefs `tools/codex_briefs/p5-astryx-*.md`), then T12b Playwright beta-gate suites.

### 11 Nov 10:20, T8 committed (da7cf91); wave 4 complete (T5 to T11)

- Codex T8 (45 files) reviewed and integrated. Fixes: `FileInput` has no `className` (wrapped in a div); a raw `Date` bound in a `sql` template in `processor.ts` (now ISO string cast to `timestamptz`); four T8 tests imported `./index` before `test/api-harness`, so the Supabase mock was never applied (500 `cookies called outside a request scope`); `access.test.ts` mocked `@dawlyy/db` whole, which broke once T6 read `clientColumns` at module scope (now a partial mock, assertions untouched); vitest `testTimeout`/`hookTimeout` 30 s because a cold import of the router tree takes about 10 s.
- The cron route `app/api/cron/due-events` now also runs `processDeliveries({ tenantId })` after `processDueEvents`, so queued reminders are sent (log-only email, no push without keys).
- Evidence: web `tsc` exit 0, eslint clean on touched files, check-messages 2219 keys per locale in parity, full web vitest on `dawlyy_p1gate`: 60 files, 380/380 passed.
- Not proved: render at 360 px and RTL, 44 px targets and Astryx proof for T5 to T11 (screens job), production form uploads still lack an upload-completion hook that stamps `uploaded_at` (Codex note).
- Usage at 10:00: 5-hour 6%, weekly 48%. Next: client nav-items (tracking, checkins), screens job, HOW_TO_TEST, Astryx polish wave, then T12 (P5).

### 11 Nov 05:35, T9 committed; waiting for Codex T8

- T9 `0396309` (messaging, notification center, delivery processor): vitest 5 files 36/36 (my rerun), eslint clean, parity 2219 keys. Notifications are written by a service transaction after the message commits (runtime role has no INSERT on `notifications`). Email is log-only and push cancelled without keys. `064e4d8` adds the missing `push` and `notificationclick` handlers to `public/sw.js` (node --check only).
- Open for T8 integration: nothing calls `processDeliveries` yet (the T8 cron route `app/api/cron/due-events` should call it); the `message_attachment` media purpose is not added.
- Usage jumped to 5-hour 98% (weekly 48%): the brake (80%) holds, no new builder. Codex job `20261111-045317-p4-t8` keeps running (zero Claude usage). On wake: review T8 (files listed in its brief), whole-project `tsc`, eslint, vitest, check-messages, commit; then client nav-items (tracking, checkins), screens job, HOW_TO_TEST, Astryx polish.

### 11 Nov 05:25, T10 and T11 committed; T8 (Codex) and T9 (Sonnet) building

- T10 `5355600` (dashboard, tasks, Client 360 timeline): vitest 3 files 18/18 (my rerun), eslint clean, messages parity. Builder notes: no audit/event names exist for tasks in doc 9.2 so none are called; system tasks go through the service-only `createSystemTask`; count hrefs are `/coach?queue=<kind>` (no filtered queue pages exist); timeline links to `/coach/programs/<id>` assume that route exists.
- T11 `92ecc75` (settings, team, consents, legal): vitest 4 files 27/27 (my rerun), eslint clean, parity. Gaps: no logo upload (needs a branding upload API), staff client assignments not editable, legal text is a draft for counsel. Reactivation is audited as `team.disable`.
- Not yet proved for T5, T6, T7, T10, T11: render at 360 px / RTL / 44 px targets and the Astryx proof (screens job). Whole-project `tsc` and `check-messages` must be re-run once T8 and T9 land.
- Usage: 5-hour 66%, weekly 45% at 05:25. No new builder starts at 80%.

### 11 Nov 04:55, T5 committed, wave 4 started (speed mode: 3 tasks at once)

- T5 committed `5eb4f52` after fixes: a raw `Date` bound inside `setWhere` (postgres.js refuses it; now an ISO string cast to `timestamptz`), `app.audit`/`app.emit_event` entity ids are `text` (the `::uuid` casts failed with "function does not exist"), and two test type errors. Evidence: web `tsc` exit 0, vitest `dawlyy_p1gate` me.test + workout-sessions.test 9/9, eslint 0 errors (4 unused-var warnings), check-messages 1431 keys per locale. Not run: offline Playwright spec, iOS device check, RTL render at 360 px (screens job).
- `eeccfaf`: briefs `p4-t8-calendar-tracking.md`, `p4-t10-dashboard.md`, `p4-t11-settings-team.md`; six empty message namespaces registered (calendar, tracking, messaging, dashboard, settings, legal).
- Running: Codex job `20261111-045317-p4-t8` (effort high), Sonnet builders T10 and T11 (effort medium, no commits). T9 messaging is briefed when one slot frees.
- Usage at start of this run: 5-hour 9%, weekly 40%.

### 11 Nov 04:00, resume after the attended Astryx session: T5 T6 T7 finished in round 3

- Playbook sha256 matched (402b9468...). Usage at start: 5-hour 30%, weekly 19% (usage.json: 16% / 30%). The six Codex jobs of 9-10 Nov all failed on the ChatGPT usage limit; their partial files (3265 lines, untracked) are what the tree holds.
- Fixed the one typecheck error (`api/me.ts` TS2345): the per-route validation hook was replaced by the `defaultHook` on the router, as every other router does. Web `tsc` exit 0 afterwards.
- Missing after the partial runs: every page, all `workout`/`nutrition`/`forms` messages, `public/sw.js`, the builder UI for forms, `me.test.ts`, `workout-sessions.test.ts`, the offline e2e spec and `docs/qa/ios-pwa.md`. Addenda listing exactly this: `tools/codex_briefs/p4r3-addendum-t5/t6/t7.md`.
- 04:10: T6 done and committed `3909459` (Sonnet builder). Evidence: vitest `dawlyy_p1gate` 5 files 16/16 (rerun by me), check-messages 1431 keys per locale none missing, builder's eslint exit 0. Builder fixed two real bugs (food clone returned 400 for every system food; substitute test used zero-kcal water). Known gaps: older Codex-written nutrition components still use shadcn (Astryx polish wave), no render check at 360 px/RTL yet (screens job), touch targets not verified at 44 px.
- 04:20: T7 done and committed `0fb5381` (Sonnet builder). Evidence: vitest `dawlyy_p1gate` 5 files 31/31 (rerun by me), check-messages 1431 keys none missing, builder's eslint exit 0, SSR smoke render in en/ar. Four product gaps went to OPEN_DECISIONS 7-10 (submit stops at `submitted`, no resubmit edge, form uploads wait for T8, no skip/mark-known buttons).
- Launched: Codex job `20261111-034558-p4r3-t5` (effort high, one Codex job only) and two Sonnet builders (T6 nutrition, T7 forms), disjoint files, no commits by builders. I review and commit per task.

### 10 Nov 15:58, T5 T6 T7 relaunched after Codex hit its usage limit

- The three jobs of 9 Nov (`20261109-213624-p4-t5/t6/t7`) all failed with exit 1 about 5.5 minutes in. The logs end with "You've hit your usage limit ... try again at 10:52 PM". Partial files were left in `apps/web/src/server/{workout,nutrition,forms}/` (13 files, untracked, not reviewed).
- Relaunched at 15:57 with the same briefs plus `tools/codex_briefs/_common_web_resume.md` (the web common rules plus a notice to read the partial files first and finish the brief). Started directly with `codex_build.py` as background Bash tasks, effort high, timeout 5400 s.
- Why not `job.py`: it now fails with `SyntaxError: unterminated string literal (worker_guard.py, line 106)`. The file is `C:/Users/compuline/.claude/autopilot/hooks/worker_guard.py`, last written 9 Nov 22:26 (right after the `fix-git-sync` Codex job), so a fix to the autopilot broke it. It is outside the repo and the playbook forbids editing it. Mohamed or an attended session must repair it; `worker_guard.py.bak-r5` (22:25) is the version before the break. Until then `job.py start` is unusable, and the guard hook itself may be failing open.
- 10 Nov 18:29 (resume): the 15:57 relaunch died when that session ended (background Bash tasks do not survive a turn end; no answer files were written). `worker_guard.py` was repaired in the meantime, so `job.py start` works again. Relaunched as detached jobs `20261110-182902-p4r2-t5`, `20261110-182909-p4r2-t6`, `20261110-182909-p4r2-t7` (same briefs plus `_common_web_resume.md`, effort high, timeout 5400 s). The playbook sha256 is now `6961e4d9...`; it adds: at weekly 85% or more only review, gates and commits, and re-run the screens job at the end of every wave. Usage at resume: 5-hour 7%, weekly 3%.
- Session usage at start: weekly 100%, 5-hour 82%. Only cheap work (Codex jobs, review by reading, gates) until the reset on Tue 06:00.

### 9 Nov 21:40, P4 wave 3 launched: T5, T6, T7 Codex jobs running

- Commit `f299b2e`: briefs `tools/codex_briefs/p4-t5-client-portal.md`, `p4-t6-nutrition.md`, `p4-t7-forms.md` (use with
  `--common _common_web.md`) and three new registered message namespaces (`workout` for T5, `nutrition` for T6, `forms` for
  T7; T5 also owns `client.json`). Evidence: check-messages 769 keys per locale none missing, web tsc exit 0.
- Jobs started 21:36 (effort high, timeout 5400 s): `20261109-213624-p4-t5`, `-p4-t6`, `-p4-t7`. All running after 1 min with
  no usage-limit text in the logs.
- Contracts fixed in the briefs: Today (T5) links to `/app/nutrition` (T6), `/app/checkins/<calendarEventId>` and `/app/intake` (T7);
  T5 builds the Dexie outbox, a hand-written `public/sw.js` (no Serwist, no new dependency) and `POST /workout-sessions/sync`;
  T6 writes water through `metric_entries` (T8 owns the metrics router later); T7 finds the form from the calendar event
  payload and falls back to the tenant default template. G4 (coach comment on a set) is left to T9.
- **Next (the session that resumes when the jobs end):** for each job read `tools/.codex-answers/*p4-t*.md`, `git status --short`,
  diff every touched file, then `pnpm --filter @dawlyy/web typecheck`, `lint`, tests via
  `.work/tmp/run_with_db.py dawlyy_p1gate <cmd>` (start Postgres first: `tools/local_pg.ps1 -Action start`), then
  `node apps/web/scripts/check-messages.mjs`. Fix small things, commit per task with explicit paths. Add coach nav links for
  intake and assessments if T7 left them out (nav-items.ts is the integrator's). Then wave 4: briefs for T8 calendar and
  tracking, T9 messaging, T10 coach dashboard and Client 360, T11 settings and team.

### 9 Nov 21:45, P3 closed (wave 2 committed); handoff to P4 (sonnet high, fresh)

- Commits: `1e496df` T4a exercises, `d9e9b57` T4b programs (after `fef64a1` T2, `2535301` T3b, `4f8ec88` T3a, `5fe39c6` nav).
  Codex jobs T4a and T4b ended exit 0 after about 1.5 h.
- Evidence: web typecheck exit 0, lint 0 errors, `vitest run` of the T4 files on `dawlyy_p1gate` 42/42 with no skips
  (T2, T3a and T3b: 76/76 earlier), `check-messages.mjs` 766 keys per locale, none missing. Postgres had stopped twice
  (`ECONNREFUSED 127.0.0.1:54329`); `tools/local_pg.ps1 -Action start` fixes it, check it before any DB test.
- T4a known deviation: the `exercises` table has no `name_key`, so the list scans scoped metadata and paginates in memory
  (fine for 210 rows; revisit at scale). T4b added `baseRevision` (optimistic concurrency on the draft row), `replace`
  on assign, and `GET /programs/{id}/assignment-clients`. The reusable `ExercisePicker` is in
  `apps/web/components/exercises/exercise-picker.tsx`; the program builder has its own picker.
- Dashboard rows updated (T2, T3, T4 done; T5 client portal now).
- **What the next session (P4, sonnet high) does first:** wave 3 = T5 client portal (Today, My Program, offline workout
  session, history; needs `GET /me/program` and the program API of T4b), T6 nutrition (builder, foods, client view; the
  300-food seed exists in `packages/db/seed`), T7 forms engine (intake, check-ins, assessments). Read build plan Tasks
  5-7, `COMPETITOR_GAPS.md` rows G2, G3, G4, G5, G9, doc section 12.1 items 10, 12, 15 and the core modules
  `workout`, `nutrition`, `forms`. Write one brief each in the format of `tools/codex_briefs/p3-t4b-programs.md` with
  `--common tools/codex_briefs/_common_web.md` (disjoint files; pre-register new message namespaces in
  `apps/web/i18n/request.ts` with empty `{}` files first, as done for P3, and pre-decide shared routes). Launch the three
  as `job.py` jobs, effort high, then review each (answer file, diff, typecheck, lint, tests via
  `.work/tmp/run_with_db.py dawlyy_p1gate`, check-messages), fix small things yourself, commit per task. Then wave 4
  (T8 calendar and tracking, T9 messaging, T10 coach dashboard and Client 360, T11 settings and team) the same way.
  T5 needs the service-worker and Dexie outbox files (`apps/web/app/sw.ts`, `src/lib/outbox/*`): list them in the brief.

### 9 Nov 20:00, T2, T3a, T3b reviewed and committed; T4a and T4b running

- Commits: `fef64a1` T2 auth, `2535301` T3b billing, `4f8ec88` T3a clients and packages, plus the coach nav links to
  Exercises and Packages. Codex jobs T3b, T3a, T2 ended exit 0 (about 1.5 h).
- Evidence on the three together: web typecheck exit 0, lint 0 errors, `vitest run` of their 16 test files on
  `dawlyy_p1gate` 76/76, no skips; `check-messages.mjs` 435 then 436 keys per locale, none missing.
- Review fix: both `api/clients.ts` and `api/packages.ts` had a missing `}` on the `errorResponse` constant (parse
  error). Fixed; no test or check changed.
- Reviewed by hand: invitation accept (user lock, row lock, status and expiry, one service transaction, tokens hashed).
  The full security review of bootstrap, accept and the T3b service transactions is for P7.
- Facts from the answers other tasks need: receipts are assigned by the DB at verification (not at insert); payment
  verify, reject and refund need `billing:verify` AND `billing:edit`; override writes need `clients:edit` AND
  `billing:edit`; the payment method enum value is `bank_transfer`; freeze start dates are stored as versioned JSON
  in `subscription_events.reason`; `syncSubscriptionCalendar(tenantId, subscriptionId, reason)` and
  `sweepSubscriptions(tenantId, today)` (`apps/web/src/server/subscriptions/`) are ready for the T8 cron. Unarchive
  returns a client to `inactive`. Known gap (T3a): assigned-scope staff cannot see duplicate clients hidden by RLS, so
  `duplicate_client` is checked only within their view. Calendar generation runs after the money commit; a failure
  needs `syncSubscriptionCalendar` to repair it.
- Postgres had stopped; restarted with `tools/local_pg.ps1 -Action start`.
- Running: `20261109-192055-t4a`, `20261109-192056-t4b` (since 19:21). Next: review, typecheck, lint, tests, commit per
  task; then P4 (T5, T6, T7 in parallel, then T8-T11) with briefs written the same way (`_common_web.md`).

### 9 Nov 17:55, Codex back; T3b, T3a, T2 running

- Jobs started 17:51 (effort high, `--common _common_web.md`): `20261109-175144-t3b`, `20261109-175145-t3a`,
  `20261109-175146-t2`. All still running after 90 s (no usage-limit error). T4a and T4b start when a slot frees.
- Next: on each job end, read the answer in `tools/.codex-answers/*p3-<brief>*.md`, `git status --short`, review diffs,
  typecheck, lint, tests, check-messages, commit per task with explicit paths.

### 9 Nov 14:25, P3 briefs written; waiting for Codex (back at 17:48)

- `20eb32d` five Codex briefs for wave 2 plus the shared rules `tools/codex_briefs/_common_web.md` (use it with
  `--common`): `p3-t2-auth.md`, `p3-t3a-clients-packages.md`, `p3-t3b-billing.md`, `p3-t4a-exercises.md`,
  `p3-t4b-programs.md`. Files are disjoint; the cross-task route contracts are written into each brief
  (`/coach/billing/sell?clientId=`, `/coach/clients/<id>/subscription`, `GET /api/v1/exercises` item shape).
- Shared files were handled up front so builders never collide: six message namespaces (`onboarding`, `clients`,
  `packages`, `billing`, `exercises`, `programs`) are registered in `apps/web/i18n/request.ts` with empty `{}` ar/en
  files. Builders may not edit `request.ts`, the shell, `nav-items.ts`, `api/index.ts` or the middleware; nav links to
  `/coach/packages` and `/coach/exercises` are added by the integrator (the worker) after review.
- Evidence: web typecheck exit 0; `check-messages.mjs` 101 keys per locale, none missing.
- Design facts the briefs rely on (found while writing them): there is no DB function for sign-up or invitation
  acceptance, so T2 uses `withServiceTx` for both (reviewed in P7); runtime inserts into `calendar_events` must be
  `source = manual`, so T3b writes package-rule events in a service transaction (`syncSubscriptionCalendar`).
- Probe at 14:16 (job `20261109-141618-t2`): Codex still answers "usage limit, try again at 5:48 PM". Nothing changed in the
  tree. Per the playbook I do not start a Sonnet writer while waiting (usage 5h 67%, week 82%).
- **Next (the session that starts after 17:48):** launch up to 3 jobs, effort high, each
  `python tools/codex_build.py tools/codex_briefs/<brief>.md --common tools/codex_briefs/_common_web.md --effort high`
  via `job.py start --timeout 5400`: first T3b, T3a, T2; then T4a, T4b when a slot frees. Review each answer and diff,
  run `pnpm --filter @dawlyy/web typecheck`, `lint`, `vitest run` for its files (DB tests need
  `.work/tmp/run_with_db.py dawlyy_p1gate <cmd>`), `node apps/web/scripts/check-messages.mjs`, commit per task with
  explicit paths. Then add nav links and handle P4.

### 9 Nov 14:00, P1 closed; handoff to P3 (sonnet high, fresh)

- `fac4fc0` the 15 security suites (doc §13.1 files, `matrix.ts`, `guard-matrix.ts`) and `scripts/db-migration-check.ps1`
  (C99, CI only). S3 exited 0; S1 and S2 stopped on the Codex usage limit after writing every file (no answer files).
  `.work/tmp/case_cov.py`: no §13.4 case id missing in any suite (N15/N18/N20 are triage tags, not N cases). No skip,
  todo, skipIf, runIf or only. Integration fixes were types only (no assertion changed).
- P1 gate met: `pnpm -r --workspace-concurrency=1 typecheck` exit 0 (core, db, web); migrations 0000-0006 and both seeds on
  fresh `dawlyy_p1gate` (2fe149b). P2 and P2.5 were already done. Dashboard rows updated (P1, P2, P2.5 done; T2 now).
- Known for P6: (1) K11 expects `set_logs.client_updated_at` to store null; the column is NOT NULL. Decide from the doc
  which is wrong; never weaken the test. (2) Dev server "runtime data during prerendering" on `/[locale]/app/today` and
  `/[locale]/app/[...rest]`; check with `next build`. (3) A16 tests only the W04 contract text; no outbox worker yet.
- **Codex is unavailable until 17:48 Cairo on 9 Nov** (its usage limit, from the S1/S2 logs).
- **What the next session (P3, sonnet high) does first:** read the playbook (P3 section and the 9 Nov "Codex builds"
  rule), the build plan's T2, T3a, T3b, T4a and T4b file sets, and `docs/product/COMPETITOR_GAPS.md` rows they own.
  Write one Codex brief per task (format of `tools/codex_briefs/p2a-api-platform.md` with `_common.md`; disjoint files;
  apply freeze answers S14 and S32 as in OPEN_DECISIONS rows 3-4). After 17:48 run up to 3 as `job.py` jobs, effort
  high; set WAITING with `wait_until` 17:50 until then. Review each answer and diff, gate typecheck and lint, commit
  per task. `dawlyy_p1gate` is a migrated, seeded scratch database for any manual check
  (`.work/tmp/run_with_db.py dawlyy_p1gate <cmd>`).

### 9 Nov 13:35, migrations 0003-0006 committed; P2.5 gate met

- `2fe149b` migrations 0003-0006. Codex M6 (job `20261109-124834-m6`) found 0003 equal to doc §4, applied H1-H3 to
  0004 (20 unique indexes moved above their FKs) and wrote 0006 (277 statements, 34 functions, 93 triggers, §11.4 block
  last; it reports no deviation). Evidence on fresh `dawlyy_p1gate`: migrate exit 0; 287 policies all `TO dawlyy_rls`;
  RLS on 47/47 tables; 100 user triggers; no table grant to `anon`/`authenticated`; no `app` function executable by
  PUBLIC; 0003 and 0006 re-run in one transaction with ON_ERROR_STOP exit 0; library seed 210/371; demo seed 5
  memberships, codes DW-000001..3; `drizzle-kit generate` "No schema changes". Upgrade rehearsal on a copy of
  `dawlyy_test` (0002 with data) to 0006: exit 0, both seeds load; the copy was dropped. The local migrator warns "no
  ADMIN OPTION on authenticated" (doc §11.4 step 2, expected locally).
- `20e4ebe` P2.5 screenshots: 64/64 in `docs/qa/screens/` (job `20261109-131220-screens3`, 1 passed, no overflow).
  `@playwright/test` pinned to 1.63.0 (browser build 1243 is installed; 1.65 wanted 1254). `getSessionUser` awaits
  `connection()` before the dev-session clock read; `devIndicators: false` (the badge covered the phone nav).
- Known for P6 `build-web`: the dev server still logs "runtime data during prerendering" for `/[locale]/app/today` and
  `/[locale]/app/[...rest]` (the client area only; `AuthGate` is already inside Suspense). Pages render. Check with
  `next build` in P6.
- `dawlyy_p1gate` (migrated, seeded) stays for the suite runs. `.work/tmp/run_with_db.py <db> <cmd>` runs a command with
  the `.env` URLs pointed at another database, without printing them.
- Running: Codex S1, S2 (since 12:48) and S3 (since 13:00). Next: review each suite answer and diff, `pnpm --filter
  @dawlyy/db typecheck`, commit the P1 gate; then hand off fresh to P3 (sonnet high) per the playbook.

### 9 Nov 13:20, P1 step 3 moved to Codex; P2.5 files committed

- Workflow `wf_c9f6c478-525` died with its session (limit). It wrote no suite file and no report. Its migrations
  integrator left, uncommitted: `0003_rls_role_and_helpers.sql` (8.3 KB, from doc §4) and `0004_policies_off.sql`
  (47.7 KB, generated with `DRIZZLE_NO_POLICIES=1`; 119 `DROP POLICY`, the new tables and columns). Hand edits H1-H3
  of doc §11.2 were NOT applied (no `USING` on `source_event_id`, no `*_current_version_fk`, unique indexes after FKs).
- This session generated `0005_policies.sql` (287 `CREATE POLICY`, no other statement; the §11.3 step 3 filter prints
  nothing) and the empty custom `0006_guards_and_grants.sql`, with their snapshots and journal entries. Uncommitted
  until the P1 gate.
- Per the playbook (9 Nov, Codex builds), no workflow was re-run. Four Codex briefs, effort xhigh:
  `sec-m6-migrations.md` (check 0003 against §4, apply H1-H3 to 0004, write 0006 in the §11.3 step 4 order),
  `sec-s1-catalog-matrix.md` (suites C, S + `matrix.ts`, N, Z, and `scripts/db-migration-check.ps1`),
  `sec-s2-guard-team-payments.md` (G + `guard-matrix.ts`, I, T, L, P, X), `sec-s3-documents-events.md` (D, M, K, E, A).
  Running since 12:48: jobs `20261109-124834-m6`, `20261109-124835-s1`, `20261109-124835-s2`. S3 starts when one ends
  (3 Codex jobs at most).
- Committed `5932ed2`: Codex P2.5 (job `20261109-051355-p25`) demo seed, `tools/start_preview.ps1`, Playwright config
  and `e2e/screens.spec.ts`, first `docs/qa/HOW_TO_TEST.md`, plus the four briefs. Review fixes: package schedule rules
  from `ScheduleRules.parse({})` (typecheck failed on the fixture literal); the seed prints the Postgres code and
  message on failure. Evidence: db typecheck 0, web typecheck 0. Codex said the system library has 12 exercises and 12
  foods; that counted files: it has 210 exercises and 371 foods (`.work/tmp/count_seed.py`).
- Screenshot choice: the spec runs `next dev` on port 3210 under Playwright `webServer`, because the dev login (needed
  for signed-in screens) is excluded from production builds. Recorded in OPEN_DECISIONS.
- Root `test:db` script added (doc §13.5).
- Next: when M6 ends, review its diff, migrate a fresh scratch database 0000-0006, run the seed and demo seed; when
  the suites end, review them and typecheck. Then the P1 gate and commit, then the P2.5 screenshots.

### 9 Nov 05:05, P2b committed; P1 suite workflow re-launched

- The session that started workflow `wf_1dc10d5f-405` ended (5-hour limit at 01:20, then API connection failures until
  04:51). The workflow died with it: no suite file and no report exist. Its only output is an empty custom
  migration `packages/db/migrations/0003_rls_role_and_helpers.sql` (53 bytes, the drizzle-kit placeholder), its
  snapshot and a journal entry, all left uncommitted for the integrator to fill.
- Codex P2b (job `20261109-001905-p2b`, exit 0) reviewed and committed as `807e52e`. Review: dev login is gated by
  `NODE_ENV !== 'production'`, `DAWLYY_DEV_LOGIN=1` and a secret of at least 32 characters; the HMAC cookie is
  compared in constant time; dev sessions resolve through `withUserTx` like Supabase sessions; `route.dev.ts` is
  outside production `pageExtensions`. Evidence: `pnpm --filter @dawlyy/web typecheck` exit 0;
  `check-messages.mjs` 95 keys per locale, none missing; `vitest run src/server/dev-login.test.ts` 20/20.
- Local Postgres was down; started with `tools/local_pg.ps1 -Action start`.
- Running: workflow `wf_c9f6c478-525` (fresh run of `b_build2_wf.js` with `args.codexPaths`, the 15 suites and
  `docSha` 549ee55b...). Never resume it to re-run one agent (hard rule 6).
- Next: when it ends, read `.work/kit/build/*.md`, check the P1 gate (typecheck, migrations 0000-0006 on a fresh
  scratch database, seed loader) and commit. Meanwhile, P2.5 work that touches no file of the workflow.

### 9 Nov 00:30, P1 step 3 running; P2 and P2.5 partly done

- Committed: `ed53598` P2.5 app shell (Sonnet builder, report `.work/kit/build/p25-shell.md`); `c5902be` Codex X2
  (client library on `dawlyy_rls`, `withErasureTx`, `AuthContext.permissions`, `require-permission.ts` renamed from
  the brief name to the doc 12.1 name, `machines.payment`); `6d69b4b` Codex P2a (pagination, idempotency replay,
  `requireActiveAccess`, 26 router stubs, `env.ts`); `71d7dec` Codex X3 (doc 13.2 fixtures, factories, 13.3 helpers;
  two UUID-type fixes and a `test/factories.ts` facade added in review).
- Evidence at 00:20: core typecheck 0 and vitest 564/564; web typecheck 0 and `vitest run src/server src/api` 67/67;
  `tsc --noEmit -p packages/db/tsconfig.json` 0.
- Running: workflow `wf_1dc10d5f-405` (`.work/kit/design-review/b_build2_wf.js`, now taking `args.codexPaths`;
  15 Sonnet suite writers, then the migrations integrator, then the typecheck integrator, which must not edit
  `apps/web/src/server/auth.ts` or `dev-login*`). Reports land in `.work/kit/build/`. Never resume it to re-run
  one failed agent (hard rule 6).
- Running: Codex P2b (job `20261109-001905-p2b`, brief `tools/codex_briefs/p2b-dev-login-session.md`): dev-only
  login (cookie HMAC, `route.dev.ts` excluded from production by `pageExtensions`), `getSessionUser`,
  `getAuthContext(headers)`, onboarding redirect, per-namespace message files, `check-no-dev-login.mjs`, the API test
  harness.
- Open choice for P2.5 screenshots: the production build has no dev login, so signed-in screens need the dev server
  under Playwright `webServer`. Decide when writing `e2e/screens.spec.ts`.
- Next: review P2b and commit; when the workflow ends, read its reports, check the gate (typecheck, migrations
  0000-0006 on a fresh scratch database, seed loader), commit, then the P2 demo seed and P2.5 screenshots.

### 8 Nov 23:55, P1 steps 1-2

- Codex X1 reviewed and committed as `3b24864`. Evidence: a `getTableConfig` dump of every schema table gives 47
  tables, 287 policies (240 permissive, 47 restrictive guards) and 103 foreign keys. Every policy name of doc §5.2
  plus one `<table>_tenant_guard` per table is present, with no extras, and each command matches its suffix
  (script `.work/tmp/cmp.py`). `_rls.ts` matches doc §5.1. `pnpm --filter @dawlyy/db typecheck` exits 0. The
  pre-existing `test/fixtures.ts` changes and the new `test/helpers.ts` went into the same commit.
- The X2 and X3 briefs were checked against the fixed doc (section numbers 3, 6.3, 12, 13.2-13.5 and 14 all match)
  and given a note that the two run at the same time and code against the doc §14 signatures.
- Running: Codex X2 (job `20261108-234930-x2`) and X3 (job `20261108-234930-x3`), effort xhigh, started 23:49.
- Prepared: `.work/kit/build/args_base.json` holds `docSha` 549ee55b... and the 15 suites of doc §13.1 for
  `b_build2_wf.js`; the Codex answers x1, x2 and x3 are added when X2 and X3 finish.
- Next: review X2 and X3 (answer files, diffs, `pnpm --filter @dawlyy/db typecheck`), commit, then run
  `b_build2_wf.js` (15 Sonnet suite writers, the migrations integrator, the typecheck integrator).
- Also running since 23:53, on disjoint files: Codex P2a (job `20261108-235307-p2a`, brief
  `tools/codex_briefs/p2a-api-platform.md`: pagination, idempotency replay, `requireActiveAccess`, router stubs) and
  a Sonnet builder for the P2.5 app shell, branded loading states and the `/ar/login` RTL fix (report to
  `.work/kit/build/p25-shell.md`).
- Known brief gap: doc §12.1 item 1 names `apps/web/src/server/require-permission.ts`; the X2 brief says
  `permissions.ts`. Rename during the X2 review if Codex followed the brief.
- Disk: 16.1 GB free on C: at 23:45 (was 1.1 GB on 8 Nov morning).
- The guard hook fails with `ValueError` on a Bash command containing an unbalanced apostrophe (for example
  "doc's" in a heredoc); write such text with the Edit or Write tool.

## 8 Nov 2026: autopilot setup (read this first)

Written 07:00 Cairo by the setup session (Claude Opus 5.5, session 4eebc630). From the autopilot launch on, this
repo is worked by the autopilot worker under `docs/plans/AUTOPILOT_MASTER_PROMPT.md`. Never resume session 4eebc630.

What happened since 7 Nov 23:30:
- The revised security design was joined into `docs/architecture/02-database-security-model.md` (428 KB), with the
  triage in `docs/architecture/02-database-security-triage.md`. The R2 verification workflow died on the 5-hour
  usage limit. Codex then reviewed the doc (`tools/.codex-answers/20261108-002748-codex_doc_review_brief.*`) and
  fixed it (`20261108-042819-codex_fix_brief.*`). Codex changed SQL in sections 3.4, 4, 6.2-6.3, 7.4, 7.5.2, 7.8.3,
  7.9, 7.10.3, 7.11.4, 8.2, 9.2, 10 and 11.4. That SQL is not probed yet: it is the first P6 probe target. Its two
  open questions are rows 1-2 of `docs/plans/OPEN_DECISIONS.md` (safe defaults taken).
- Fable 5.1 now needs paid usage credits (API error `model_requires_usage_credits`, 8 Nov 02:47Z). Opus and Sonnet
  do all Claude work.
- Codex X1 (`tools/codex_briefs/sec-x1-schema.md` with `_common_db.md`, effort xhigh) ran 06:15-06:50 and exited 0.
  It rewrote `packages/db/src/schema/_rls.ts` and the schema files (git diff at 06:55: 15 files, +1045/-404).
  Its answer is the newest `tools/.codex-answers/*sec-x1-schema*.md`. NOT reviewed yet. `packages/db/test/fixtures.ts`
  (modified) and `packages/db/test/helpers.ts` (new) were already on disk before X1 started: review them with X1.
- `tools/codex_build.py` now kills the whole process tree on timeout, keeps stderr, and takes `--common none`.
- The scratchpad of session 4eebc630 is copied to `.work/kit/` (paths rewritten).
- The autopilot is built in `C:/Users/compuline/.claude/autopilot` (SPEC.md; 188 tests pass). Repo glue: `CLAUDE.md`,
  `.autopilot/config.json`, `docs/plans/AUTOPILOT_MASTER_PROMPT.md`, `APPROVALS.md`, `OPEN_DECISIONS.md`,
  `tools/checks.json`, `tools/dashboard/`, `.claude/skills/dawlyy-dashboard/`, and `.gitignore` entries for
  `.autopilot/`, `.work/` and `tools/dashboard/*.json`.
- At about 06:55 the 5-hour usage window ran out (resets 09:20 Cairo). Three Sonnet reviewers of the autopilot code
  died mid-review; whatever they saved is in `C:/Users/compuline/.claude/autopilot/review/`.
- Disk: C: had 1.1 GB free (APPROVALS item 1). Mohamed's Claude login expires around 10 Nov: it must be renewed
  (`/login`), or every autopilot run fails.

Setup steps left (the setup session continues after 09:20, see `C:/Users/compuline/.claude/autopilot/SETUP_STATUS.md`):
finish the reviews and fix confirmed findings; rehearse on the sandbox through the scheduled-task path; install the
task "Claude Autopilot - DAWLYY"; launch the worker on opus high in phase P1.

The worker's first action (P1 step 1): review Codex X1's diff against its brief and the doc. Then update sec-x2 and
sec-x3 and run them as job.py jobs, then `.work/kit/design-review/b_build2_wf.js`.

## Objective

Ship the DAWLYY Online Coaching Operating System (spec v4, `docs/spec/DAWLYY_v4_spec.md`) as a web-first beta as fast as
possible: coach workspace + client PWA, Arabic-first with English, multi-tenant with database-enforced isolation, manual
payments in beta, native apps later. Mohamed's words: "build everything, then we test, then we fix, so we don't waste time."

## Approvals in force and their limits

Allowed without asking: installs inside the repo, builds, typecheck, tests, local Postgres start/stop on port 54329,
local commits on `main`, starting Codex builds, starting Sonnet workflows, reading anything. Mohamed, 2026-11-07 19:20: "use as many agents
as you can and get the job done" (replaces the old 3-agent cap; the machine still allows at most 3 heavy node
processes such as vitest, tsc, drizzle-kit or the migrator at once).

Needs a specific yes from Mohamed naming the action: `git push`, creating the GitHub repo, any Vercel/Supabase
account action, deleting or moving any of his data (Apple MobileSync backups etc.), credential changes, anything that
sends a message to a real person, anything that spends money.

Never weaken a test, guard or policy to get green. A red test that reports a real regression stays red until the code is fixed.

## Decisions taken (do not reopen)

- Stack: pnpm 12 workspace; Next.js 16.4.5 App Router (`proxy.ts`, not middleware); Hono + `@hono/zod-openapi` mounted
  at `/api/v1` inside Next; `packages/core` pure domain (Zod 4); Supabase Postgres + Drizzle 0.45 with `pgPolicy` RLS;
  Supabase Auth via `@supabase/ssr`; next-intl (ar default); Tailwind v4 + shadcn (logical utilities only); Dexie
  offline outbox; Resend; Web Push; Vitest 5; Playwright; persisted due events + Vercel Cron. No Turborepo, no Inngest
  (Codex review, `docs/architecture/01-codex-review-of-stack.md`).
- Database access: only through `withAuthTx` / `withUserTx` / `withServiceTx` in `packages/db/src/client.ts`. Runtime
  role `dawlyy_app` (LOGIN NOINHERIT NOBYPASSRLS) does `SET LOCAL ROLE authenticated` inside the transaction
  (the security pass changes this to `SET LOCAL ROLE dawlyy_rls`; contract: `docs/architecture/02-database-security-model.md`). Server
  Components use the same boundary as API handlers. No cosmetic RLS: isolation tests must prove tenant and
  client-vs-client separation.
- Build team: Claude integrates, reviews, commits. Codex (ChatGPT subscription, zero Claude usage) builds pure modules
  from briefs via `python tools\codex_build.py tools\codex_briefs\<brief>.md`. Sonnet workflow agents build web, db
  harness, seeds. freellmapi (127.0.0.1:3391) was unusable on 2026-11-07 (every strong model 502/503); do not plan around it.
- Model economy: the main thread should run on the cheapest model that can do the current step. Build waves and
  integration: Sonnet. Security review of auth/RLS before beta and any judgement call on isolation: Opus or stronger.
  Mohamed picks the main model in the `/model` menu; a session cannot switch itself.
- Machine limits: 15.4 GB RAM, commit charge runs at 25–26 GB of a 28 GB limit because C: is nearly full. Run at most
  3 heavy node processes at once; run your own typecheck/test commands one at a time; never start `pnpm dev` or
  `pnpm build` from an agent. See memory `reference_wsh_memory_error_disk_full.md`.

## Repository state

Repo: `C:\Users\compuline\Desktop\dawlyy`, branch `main`, local only (no remote).

Commits:
1. `0e99890` scaffold: workspace, `apps/web` (create-next-app 16.4.5), `packages/core` types, `packages/db` schema + RLS policies + client.
2. `2e34d6e` Codex build runner, core batch briefs, `withUserTx`.
3. `92ce305` `feat(core): domain modules` — all eight core modules + 180 tests, root index re-exports everything.
   Repo-local git identity was set to the author of the first two commits (Mohamed) because PowerShell git had none.

Evidence for commit 3 (2026-11-07 ~15:00): `pnpm --filter @dawlyy/core typecheck` exit 0; `pnpm --filter @dawlyy/core test`
9 files, 180 tests passed.
4. `adb5a30` `feat(web)`: Next.js foundation (next-intl ar default, proxy.ts, Hono /api/v1 with /health /me /docs, auth
   context, shadcn RTL, route shells, manifest, CI).
5. `b5a8f92` `feat(db)`: migrations 0000/0001/0002 (migrations/ is the only source; sql/ copies and a stray stub removed),
   RLS harness (12 tests), tools/local_pg.ps1, 210 exercises + 371 foods seeds, validator, idempotent seed loader.
   Includes the documentHeadPolicies fix (templates were readable by every client of the tenant).

Evidence for commits 4-5 (16:24): `pnpm -r --workspace-concurrency=1 typecheck` exit 0 (core, db, web); web lint exit 0;
web test 2/2; `seed/validate.ts` errors=0; `test:rls` 12/12; seed run twice on dawlyy_test: inserted 210/371 then
updated 210/371, counts stable.

6. `026872d` `feat(core): program editing, subscription timeline, Arabic text and CSV import`:
   Codex D (`program-edit`, `subscription`) and Codex E (`text`, `csv`) with the integrator's fixes, the fixes from the
   adversarial D review, the review suites promoted to `test/program-edit.contract.test.ts` and
   `test/subscription.contract.test.ts`, the four new exports, the `ExerciseSeed.primaryMuscles` relaxation, this file
   and the two briefs.

Evidence for commit 6 (17:20): core 15 files / 559 tests passed (`vitest run --maxWorkers=1`); core typecheck (src + test)
exit 0; db typecheck exit 0. Web does not import core yet.

Fixes from the D review (`wf_b4b8873f-a5f`, review:subscription and review:program-edit, 13 failing tests out of 182):
- subscription S16: a freeze shift rebuilt the time from the stored dueAt, so an event that started on a DST-gap day
  (Cairo 2026-04-24 00:30 does not exist, becomes 01:30) carried 01:30 to its new date. Shifts now rebuild from the
  rule's clock time (`timeOfDayFor` + `zonedDueAt`, exported from `schedule`).
- S22: a package_rule row without a ruleKey went to `cancel`; it now stays `untouched` (Codex's test updated).
  Migration 0003 must add `CHECK (source <> 'package_rule' OR rule_key IS NOT NULL)` on calendar_events.
- S45: `accessStatus` / `dueTransition` returned NaN counters ("باقي NaN يوم") for malformed dates; they now throw
  `SubscriptionError('invalid_timeline')` for a bad date or an unknown state.
- S57/S58: malformed freezes or timeline threw TypeError; now `invalid_freeze` / `invalid_timeline`.
- S60 (decision): a freeze whose length overflows the calendar is `invalid_freeze`, not `invalid_timeline`.
- program-edit Q03: `day.copyTo` onto itself is a no-op (it used to re-id the day's workout, orphaning ids that logs refer to).
- Q04: `day.copyTo` without a `toDayIds` list throws `invalid_op` (was a silent no-op).
- Q05: patches accept only the keys of each op's patch type; `{ id }`, `{ kind }` on a day, nested children throw `invalid_op`.
- Q07: an empty workout is reported once (`empty_workout`), not again as `empty_block` for its only block.
- Decisions documented on `ProgramOp` / `applyProgramOp` (reading kept, tests pin it): Q01 move `toIndex` must be a
  finite integer (±Infinity is `index_out_of_range`; JSON cannot carry Infinity); Q02 `day.swap` moves the day note
  with kind and workout; Q06 a document with duplicate ids is corrupt input (ops throw `invalid_op`, validateProgram
  reports `duplicate_id`, the API must reject such documents where they enter).

Open product questions from the review (current behaviour pinned by passing tests, decide before wave 3 wires freezes):
- S14: a freeze that is not a multiple of 7 days moves weekday weigh-ins (`weekly` / `days_of_week`) to another
  weekday, because every event on or after the freeze shifts by its length. Recommended: weekday cadences keep their
  weekday (regenerate them over the extended range and skip the frozen days); day-count cadences keep shifting.
- S32: a retroactive freeze (fromDate before today) leaves an overdue open check-in inside the frozen window, because
  reconcile never touches past rows. Recommended: the freeze endpoint cancels open rows inside the frozen window.

Integrator fixes to Codex E (all with tests): invisible Unicode Cf characters (bidi marks, ZWJ/ZWNJ, BOM) stripped in
`foldArabic` and emails; phones: `(+20)`, `201012345678` (wa.me form), `+20 010…` trunk zero, +20 numbers validated as
Egyptian (landlines kept, `+200…` rejected); CSV: Excel blank rows skipped (rowNumber unchanged), trailing empty cells no
longer warn, short lists split on commas but cues/mistakes do not, library slugs never reused and `row-<n>` slugs never
used as identity (update mode could overwrite an unrelated Arabic-only exercise), `toCsv` neutralises spreadsheet
formulas by default (CSV injection), `/live/` and youtube-nocookie links, a few movement and Egyptian difficulty words.
Product decision: primary muscles are optional for coach exercises and imports (`ExerciseSeed.primaryMuscles`
`.default([])`; the system seed validator still requires one); difficulty stays required but the import takes
`defaultDifficulty`, and `missingRequiredMappings` now reports `difficulty`.

Codex contract notes worth knowing when wiring the API (from the batch answers):
- entitlements: custom keys require `customKey`; usage windows are inclusive local days; expiry filtering only when `opts.today` is passed.
- schedule: rules without a clock field (technique review, program review) use 09:00 local; renewal reminders 10:00; cycle payloads are 1-based.
- versioning: `publish` validates every historical document with Zod on each call (fine for beta volumes); `node:util` was removed by review.
- nutrition: `planConflicts` matches allergies against meal-item food ids or `doc.allergens` tags (no food catalog in core); `cookedYield` is cooked grams per raw gram.
- authz: `StaffPermissions` is a local mirror of the JSON column shape `{ client_scope, modules, preset? }`.

## In flight right now

Security pass on the database layer (next action 4):
- DONE: adversarial audit `wf_b4b8873f-a5f` — 51 findings, clustered A–P (Data API exposure through `authenticated`,
  the `app.membership()` cast crash after a local `set_config`, payments self-verification, invitation escalation,
  published-version bypass, client-writable server columns, internal-message leaks, audit/outbox forgery, over-broad
  staff reads, 74 cross-tenant/cross-client reference pairs, client-code and history deletion). Compact list:
  scratchpad `auditindings_compact.md`; proofs in `audit\<lens>\`.
- DONE 19:15: the fix as a binding design, `docs/architecture/02-database-security-model.md` (role `dawlyy_rls`, policy
  and privilege matrices, JSON-configured guard trigger, special triggers, composite FKs, migrations 0003–0006, tests).
- RUNNING 19:24: design review `wf_ebcf30c7-985` (task `wmn15f0mc`): 8 Sonnet lenses (sqlexec, coverage, flows, drizzle,
  privileges, attacker, tests, perf), each with its own scratch DB `dawlyy_review_<lens>`; plus a Codex consult through
  the bridge (output in scratchpad `design-review\codex.md`). Claude holds the bridge edit lock until 2026-11-08 05:19.
- 20:30 progress: privileges (8 findings), flows (19) and attacker (17) returned; coverage and drizzle died on API
  network timeouts and were re-run as one-lens workflows (`wf_616c693d-fe8`, `wf_29c94dee-97b`, scripts built by
  scratchpad `design-review\make_rerun_wf.py`); sqlexec, tests and perf still running. Lens results are saved as
  scratchpad `design-review\lens_<key>.json`. Binding triage decisions so far: scratchpad `design-review\triage.md`
  (T1–T29; copy into `docs/architecture/` with the revised doc). Product defaults taken there: staff may publish,
  verify payments, approve AI output and create clients only with the matching module permission, enforced in the DB by
  `app.has_perm`; assigned-scope staff are auto-assigned the clients they create; freeze answers S14/S32 as recommended.
- 21:00 progress: sqlexec (12), perf (8) and coverage (9) returned and are triaged (triage.md now also has the
  SQLX, PERF, CV and D blocks; 73 lens findings plus Codex C1-C24 and Claude S1-S11). The drizzle lens died twice on
  the network (ECONNRESET); its probes were salvaged into the D1-D4 constraints (63-byte names, single-transaction
  migrator, hand edits listed, Drizzle-inexpressible objects in 0005/0006), and R2 re-checks Drizzle on the revised
  doc. The tests lens re-run (`wf_eaa6307b-0a6`) is still running. Revision R1 `wf_4f2975a7-426` (task `w4ya6zqbc`)
  runs 5 Sonnet appliers on scratchpad `design-review\rev\g1..g5` (g1 also owns g7); g6 (sections 11-13) runs after
  the tests lens lands, with the same script and `args.groups = ["g6"]`. Then `python sections.py join`, then R2.
- 21:40 progress: the tests lens returned (22 findings N1-N22, triaged as the "lens_tests" block: layer-marked
  raises, expectGuard/expectRls/expectPrivilege/expectNoEffect, new suites S matrix, X machines, N integrity, Z escape).
  R1 g2 died on the network and was re-run (`wf_5826e253-2b9`); g6 runs as `wf_b3b47fb7-7ba`; after g3/g4 finish,
  scratchpad `design-review\patch_g34_wf.js` applies N2/N14/N20 to sections 6-7. Prepared and parse-checked, not yet
  run: `r2_verify_wf.js` (SQL build + 2 probe agents + consistency + triage coverage + Drizzle, then one fixer and a
  recheck), `b_build_wf.js` (vocab -> 3 schema agents, client-lib, core machines, fixtures -> suite writers from
  `args.suites`, then migrations integrator and typecheck integrator; fail-closed on missing reports; template
  fingerprint as the database comment) and `b_run_wf.js` (one vitest process per round, triage per failing suite,
  one product fixer, skeptic audit of test changes; max 3 rounds). Codex reviewed the build plan (bridge thread
  `2026-11-07-213125-dawlyy-read-only-plan-review-attached`); its 12 points are folded into `b_build_wf.js`.
- 23:30 progress: R1 returned g1, g3 and g5. Three appliers died on the network, but their work was on disk:
  g2's second attempt finished section 4-5 text, tests and `rev/g2.log.md` and dropped its database before it could
  report; g4 rewrote section 7 and ran probes 1-5 (kit in scratchpad `g4work`), then died before probe6 and its log;
  g6 wrote section 11 (`g6work/part11.md`) and 12 (`g6work/part12.md`), then died at the start of 13 (ENOTFOUND, the
  internet itself was down; its retry died at once). Running now: workflow `wf_c78dc308-438`
  (`design-review/finish_patch_wf.js`: finish:g4 re-runs the probes and writes the g4 log, patch:g3 applies N2/N14/N20,
  then patch:g4 applies N2/N12/N13/N20) and Codex writing section 13 (`design-review/codex_s13_brief.md`, run with
  `python tools/codex_build.py <brief> --common none --cwd <scratchpad>/g6work`; output `g6work/part13.md` and
  `part13.log.md`). `tools/codex_build.py` gained `--common` ('none' skips the core rules). Every workflow script's
  retry now also catches a rejected agent() call (`safeAgent`). Next: assemble g6 from part11+12+13, join, copy the
  triage into the repo, R2. Mohamed (23:20) lowers the effort from max to high and wants Codex to do more of the
  build: in B-build Codex takes core machines, client lib, Drizzle schema files and the security suites; Sonnet keeps
  psql, migrations, typecheck and test runs; Claude reviews and tests everything before a commit.
- Status dashboard for Mohamed (asked 19:50): https://claude.ai/artifact/JkbMzpKAkRbVpN4zKFdwVT. Data source of truth:
  scratchpad `dashboard\build.py` (edit, run, upload the changed JSON as an asset, update `datasets/<id>`). Update it
  at every step change.
- NEXT: fix the design from the review, then the build workflow (implementers by schema-file group, one test writer per
  suite, one integrator for the migrations, run-and-fix by suite with at most 3 heavy processes, then red-team lenses
  on cloned databases), then review, full checks and commit.
- Gotcha paid for: do not resume a workflow to re-run single failed agents. Resume replays only the longest unchanged
  prefix of agent calls and re-runs everything after the first changed one; a resume re-ran `audit:authority` and wiped
  `dawlyy_audit_authority` (0 tables). Re-run one agent with a fresh small workflow instead.
- Gotcha: roles and role memberships are cluster-wide. Migration 0000 grants `authenticated` to `dawlyy_app` and 0006
  revokes it, so a database migrated only to 0002 changes what every other database on the cluster sees.

Done and committed: wave 1 (`wf_5e877eef-b0f`), see commits 4-5. Its earlier notes, kept for reference:

Workflow `wf_5e877eef-b0f` (task `w6yqo74jh`), three Sonnet builders then one Sonnet verifier. Journal:
`C:\Users\compuline\.claude\projects\C--Users-compuline\4eebc630-63ac-41d5-ad16-887e467309f3\subagents\workflows\wf_5e877eef-b0f\journal.jsonl`.

- `build:web-foundation` — `apps/web`: next-intl, `proxy.ts`, Hono entry at `app/api/[[...route]]/route.ts`, Supabase
  auth context + `requireAuth`, shadcn RTL, route shells, manifest, CI. Already visible on disk: `apps/web/i18n/`,
  `apps/web/messages/`, `apps/web/proxy.ts`, `apps/web/src/`, `apps/web/components/`, `apps/web/lib/`, modified
  `next.config.ts`, `package.json`, `globals.css`, deleted default `layout.tsx`/`page.tsx`/svgs.
- `build:rls-harness` — `tools/local_pg.ps1` (+ `.md`) for a pg0 18.1 cluster on port 54329; split of
  `packages/db/sql/0001_app_helpers.sql` into `0000_app_schema.sql` (with `set check_function_bodies = off`) and
  `0002_app_post_tables.sql`; `packages/db/test/rls.test.ts` cases R1–R12; `packages/db/README.md`.
- `build:seed-data` — `packages/db/seed/exercises/*.json` (≥200), `seed/foods/*.json` (≥300), `validate.ts`, `index.ts`, `docs/glossary.md`.

Uncommitted files on disk that belong to those agents must not be committed until their reports are read and verified.

`build:web-foundation` finished at ~15:00 with A1–A6 claimed green (web typecheck, lint, 2 tests, `pnpm -r typecheck`,
no physical Tailwind classes, 55 ar/en keys in parity). Not yet run: `next build` (cacheComponents + cookie-reading
layouts wrapped in Suspense; if the build rejects it, drop `cacheComponents`).

Codex batches launched 15:20 (main thread now Opus 5.5 at max effort, ultracode on, by Mohamed's choice):
- D (`tools/codex_briefs/core-batch-d.md`): `program-edit` (ProgramOp reducer for the builder UI) and `subscription`
  (timeline with extensions/freezes, `buildSubscriptionSchedule`, `reconcileSchedule` with reopen, `accessStatus` countdown, `dueTransition`).
- E (`tools/codex_briefs/core-batch-e.md`): `text` (Arabic folding, search keys, Egyptian phone E.164, client code parsing, slugify)
  and `csv` (RFC 4180 parser, Arabic/English header mapping, exercise row mapping with duplicates and URL checks, template).

## Review findings waiting for the security pass (found 2026-11-07 by the Opus review, not yet fixed)

1. Every policy targets the Supabase `authenticated` role, which the Supabase Data API (PostgREST) also uses with the
   public anon key. A signed-in client could query tables directly and bypass every API rule that RLS does not encode.
   Planned fix: a dedicated NOLOGIN role (`dawlyy_rls`) for policies and `SET LOCAL ROLE`, all privileges revoked from
   `anon`/`authenticated` on schema public (plus default privileges), tests that assert both.
2. `payments` client update policy lets a client set `state = 'verified'`, receipt and refund fields on their own row.
3. Client-writable tables (`calendar_events`, `form_submissions`, `workout_sessions`, `set_logs`, `metric_entries`,
   `meal_logs`, …) let the client change server-authoritative columns. Planned fix: a generic `app.protect_columns`
   BEFORE UPDATE trigger with a per-table allowlist for non-staff callers, and tighter insert checks.
4. `memberships_staff_select` shows assigned-scope staff every client membership (names, emails, phones).
5. `invitations_staff_all` lets any staff member create an invitation with role `owner` or `staff` (privilege escalation on acceptance).
6. Staff `for all` policies allow DELETE on history tables (payments, subscription events, versions, submissions); spec §30 says history is never deleted.
7. `audit_log_member_insert` and `events_member_insert` let any member forge audit rows and outbox events.

## Next actions, in order

1. DONE 16:24: wave 1 verified and committed (commits 4-5).
2. Smoke test `pnpm dev` by hand (not from an agent) when commit charge is below 24 GB: `/ar` and `/en` render, `/api/v1/health` answers, `/docs` shows OpenAPI.
3. DONE 17:20: D review processed, core committed (commit 6).
4. IN PROGRESS (see In flight): security pass on the database layer: an adversarial audit workflow (Sonnet finders by lens, each proving findings
   with SQL against a scratch database on the local cluster), then fixes and new RLS tests by the main thread.
5. Platform prep by the main thread before wave 2, so parallel builders never edit the same file:
   `getSessionUser` / `getAuthContext(headers)` / onboarding redirect; `requirePermission` guard; cursor pagination;
   idempotency replay; `requireActiveAccess`; router stubs mounted in `src/api/index.ts`; per-namespace message files;
   a DB-backed API test harness (fake Supabase auth via vi.mock, local cluster); schema additions
   (`clients.search_key`, per-tenant hidden system exercises, receipt counter, `invitations.display_name`).
6. Wave 2 workflow (Sonnet builders, at most 3 at once, each followed by an adversarial review and a fix pass):
   T2 auth/onboarding/invitations; T3a clients + packages + overrides; T3b subscriptions, payments, extensions,
   calendar generation, storage; T4a exercise library + CSV import; T4b program builder + versions + assignment.
7. Waves 3–4: Tasks 5–7, then 8–11, then 12 (demo seed, Playwright, staging, beta gate). Before the beta gate an
   Opus-or-stronger security review of auth, RLS policies and `withServiceTx` callers.
8. Keep `memory/project_dawlyy_coaching_os.md` and this file current.

## Waiting on Mohamed

- Disk: a yes to delete or move the Apple MobileSync backups (221 GB) and `.cache\huggingface` (5 GB); until then the machine stays memory-starved.
- Supabase project (URL, anon key, service key, DB password) into `apps/web/.env.local` and `packages/db/.env`; Vercel login. (GitHub: done 8 Nov, private repo, the watchdog pushes.)
- Brand assets and domain; the first coach's real packages; Egyptian counsel for Law 151/2020 before real clients.

## Failures and gotchas already paid for

See memory `reference_pnpm12_nextjs16_scaffold_gotchas.md`. Short list: `pnpm approve-builds --all -y`; `pnpm add -D`
for scoped names; pin `typescript ^5.9.3`; Zod 4 `.prefault({})`; `pgPolicy` helper functions must exist before the
tables that reference them; Bash heredocs break under the rtk hook (use the Write tool); PowerShell 5.1 has no `&&`.

## 11 Nov 2026 20:10 (Cairo): beta-gate e2e green in ar and en; Astryx polish started

- Commit `6be4c4d`: e2e helper and selector fixes. Evidence: job `e2e-ar12` 10 passed (2.7 min), job `e2e-en1` 10 passed (2.3 min), both against the local cluster with the dev login.
- The e2e server runs `next dev`, so its log shows dev-only instant-navigation warnings ("uncached data" on `/login`, `coach/packages/new`, `coach/packages/[packageId]`, `coach/clients/new`; "instant navigation" on several `/app/*` pages). They do not fail a test, and `build-web2` exited 0 earlier. Not fixed; revisit only if `build-web` turns red.
- `apps/web/tsconfig.json` is rewritten by Next with extra dist dirs. It is left uncommitted on purpose; decide before the final `run_checks.py` (the tree must be clean).
- Started job `20261111-200726-polish-abcd`: Codex Astryx polish groups A to D in sequence (`.work/tmp/run_polish.py`, effort high). Next: review each group's diff, run typecheck and lint, commit per group, rerun the screens job.

## 12 Nov 2026 00:20 (Cairo): Astryx polish done, beta-gate green in ar and en on the polished UI

- Polish A to D (Codex, one job at a time): commits `5419be3` (auth, login, shell), `16251c0` (program builder, exercises), `e9b0f2f` (billing, clients, packages), `be204cb` (nutrition), `a3c3e35` (eslint ignores generated dist dirs; it had linted 70,150 problems in `.next-*`). Two Codex mistakes fixed by me: the module path is `@astryxdesign/core/TextArea` (case matters), and `TextInput` needs a `TextInputType` cast.
- Gates on the combined tree: typecheck exit 0 (`tc-polish3`), lint 0 errors, 4 old warnings (`lint-polish2`).
- e2e: `e2e-ar-polish12` 10 passed (4.8 min, commit `c7b5705`), `e2e-en-polish1` 10 passed (5.7 min). It took twelve runs because of four separate causes, each read from a trace before the next run:
  1. Postgres on 54329 died twice (postgres child exit `0xC000026B`). `tools/run_e2e.py` now starts it when `pg_isready` fails.
  2. Slow `next dev` first-visit compiles on a disk-starved PC (10 to 15 s per route; one migrate took 10 min). Playwright `expect` timeout 45 s, `actionTimeout` 60 s; assertions unchanged.
  3. Astryx controls: file field is a button plus a hidden input with the same label, buttons and file fields add `status` live regions, required fields add a suffix to the accessible name. The spec uses `#sale-proof[type=file]`, a `status` filtered by text, and `labelPrefix()` for test 05's text fields.
  4. The spec cached `today` for the whole run and a run crossed midnight in Cairo: now taken at the assign step.
- `tools/run_e2e.py` also takes extra Playwright args, `--reuse-db` (debug only; skips the 10 min migrate) and a `screens` target.
- Not changed: dev-only "uncached data" and "instant navigation" log lines from `next dev`; `build-web` is the judge for those.
- Next: screens job `screens9` (fresh database), commit `docs/qa/screens/`, restore `apps/web/tsconfig.json` (Next rewrites it), then `python AP/run_checks.py --project .` on a clean tree, then the remaining P5 items (HOW_TO_TEST.md update, LAUNCH_RUNBOOK, vercel.json) and P6/P7.

## 12 Nov 2026 02:50 (Cairo): screens green 284 of 284; next is the full run_checks

- Commit `e5540f6`: screens spec gained `SCREENS_ONLY` and failure messages with url and busy element HTML; `playwright.config.ts` waits are longer (nav 240 s, expect 45 s, action 60 s); `run_e2e.py screens [--only parts]`. Job `screens14`: 1 passed (8.5 min), `index.md` says "Captured 284 of 284", 0 FAIL rows.
- Unexplained and not hidden: `client-app-workout-start-ar-1366` failed its `aria-busy` check once (screens11) and `client-app-workout-start-ar-390` once (screens9). It passed alone (`screens-only1`, 31 s), as all four start screens (`screens-only2`, 32 s), and in the full `screens14`. The failing screenshot showed the rendered session page after the start page redirected into `/app/workout/<id>`. The sync button is not the cause (`isDisabled` does not set `aria-busy`). Cause unproven; if it comes back the message now prints the busy element's HTML. Beta-gate test 06 (start and finish a workout) passes in ar and en.
- `5cc4044`: `apps/web/tsconfig.json` committed in Next's own format, so builds no longer dirty the tree.
- Next: `run_checks.py` as one job (typecheck, lint, build-web, test-core, test-db, test-web, e2e-ar, e2e-en); then docs/plans/STAGING_SETUP.md (approved free tiers, see APPROVALS item 3, files only), FINAL_REVIEW.md, P6, P7.

## 12 Nov 2026 05:35 (Cairo): P6 security suites first run, 307 failures down to 1; handoff to opus for C15

- Commit `e289b24` and the one after it: `tools/run_db_tests.py` builds `dawlyy_sec` (UTC) fresh and runs the seed test, `rls.test.ts` and all 15 security suites (11,797 tests); `--web` builds `dawlyy_web` and runs the web API suite (381 passed). `test-db` and `test-web` in `tools/checks.json` now call it (the old `test:rls` check covered 12 tests; `test-web` had failed only because no database URL was set).
- Families fixed, each read from the first error, no assertion loosened (details in LESSONS.md): drizzle returns timestamptz as text (helper `q` converts by result column OID), raw `savepoint` through `tx.execute`, array params, supplement_logs `taken`, in_review to approved to published, forms template heads visible to clients (D09 42501), enum vocabulary order (X05), `= default` on identity keys (Z02), stale R1 (`dawlyy_rls`) and R12 (clientD), S04 for clients needs `client_update`, set_logs null timestamp (OPEN_DECISIONS 15). Source fixes: `sql.raw` removed from dashboard queries, the stale root example config file and db README, CI gained a postgres:17 database job.
- Last full run `20261112-050152-dbtests7`: only C15 red (plus seed/demo.test.ts, which the runner's `test` filter matched twice; the filter is now `test/`).
- C15 (`security.catalog.test.ts`): it treats every file reachable from an `apps/web/src/api` route that mentions the word client as client-facing and demands `select(clientColumns.<table>)`. 137 select sites in 22 files violate it (`.work/tmp/c15_violations.txt`), mostly staff services (clients, team, forms, programs, nutrition, messaging). Opus decides: refactor the client-reachable services, or classify client-facing endpoints precisely, per security model section 12.1 row 2. Do not weaken it without the doc.
- Next: C15, then `run_checks.py` on a clean tree, P6 probes and red team, P7 FINAL_REVIEW.md.

## 12 Nov 2026 06:10 (Cairo): C15 analysis (sonnet; weekly 85 percent so opus was downgraded)

- Measured per route file with `.work/tmp/c15_roots.ts` (throwaway, untracked): C15's root set is every `apps/web/src/api` file that mentions the word `client`, which is nearly all of them, and the scan follows imports of whole files. Result in `.work/tmp/c15_by_route.txt`. Staff-only routes (programs, dashboard, tasks, team, invitations) deny the client role at the router, yet their services are flagged. Client-reachable code (`me.ts`, `workout/portal.ts`, `media.ts`, `nutrition/client.ts`, `forms` and `nutrition` client branches, messaging, notifications, tracking) is flagged too, mostly for narrow selects such as `select({ timezone: clients.timezone })` that name no internal column.
- Doc C15 (security model line 4351) says: scan every client-facing Hono route reachable under `apps/web/src/api` and its query helpers; SELECT uses the exported `clientColumns` projection; reject select-all, a table object or an internal field from 12.1 row 2. So the doc scopes the scan to client-facing routes; the test's word-match scope is wider than the doc, but scope alone does not make it green (client-only code such as `workout/portal.ts` also fails on narrow selects).
- Client reachability is decided per function, not per file: staff services call `requirePermission` inside each function and `CLIENT_MATRIX` has no clients, packages, settings or team module. A Codex read-only review (bridge thread 2026-11-12-054426) found no client response returning a listed internal column today, one scanner bug (`@/src/x` resolved to `apps/web/src/src/x`, so those files were never scanned) and one non-compliant read (`server/forms/read.ts:136` selects ids from `calendar_events.payload`, strips them at 139).
- Decision (see OPEN_DECISIONS 16): do not weaken C15. Fail-closed scope from the mounted routers, a `requireStaffRole` marker, split mixed routers, projections must be `clientColumns` members. Built by Codex from `tools/codex_briefs/c15-client-scope.md`; Claude reviews, then runs the C15 suite, typecheck and the web API suite.

## 12 Nov 2026 07:15 (Cairo): C15 green, all DB and web suites green

- Commit `7686c71`. Codex job `c15-scope2` (brief `tools/codex_briefs/c15-client-scope.md`) rewrote the C15 scanner and split the mixed routers; job `c15-payload` (brief `c15-payload-refs.md`) moved the two form ids of `calendar_events.payload` into derived entries of `clientColumns.calendarEvents`. Decisions 16 and 17 in OPEN_DECISIONS.md; decision 17 is flagged for the P7 review.
- Review: read the scanner and its negative cases, the auth, dev-login, bootstrap and idempotency diffs (mechanical, no behaviour change), the router mounts (client routers mounted before the staff routers on the same base path) and the answer files. Not read line by line: the 20 new `*.client.ts` and `client-read.ts` files; the 382 passing web API tests cover their behaviour.
- Evidence: `pnpm -r --workspace-concurrency=1 typecheck` exit 0; `python tools/run_db_tests.py` 16 files, 11,791 tests passed; `--web` 60 files, 382 passed; security.catalog 110 passed.
- Not yet run on this HEAD: lint, build-web, test-core, e2e-ar, e2e-en (run_checks.py). The router split changes mounts, so e2e is the real proof for the client routes.
- Next: commit this block, then `run_checks.py` on a clean tree as a job (never edit the repo while it runs), then P6 probes and red team, then P7 (waits for the weekly reset, Tue 06:00; weekly is at 85 percent, so Codex-only builds until then).

## 12 Nov 2026 07:35 (Cairo): first full run_checks on the C15 commit: 7 of 8 green

- `run_checks` on `b4d32a5` (job checks-c15): typecheck, lint, build-web, test-core, test-db (759 s), test-web, e2e-en green; e2e-ar red once. Cause read from the log: step 5 `locator.fill` on the nutrition assign search box, Timeout 20000ms. `beta-gate.spec.ts` set the contexts' default timeout to 20 s, below the config's 60 s, and `next dev` compiles routes on first visit. A traced rerun of e2e-ar alone (job e2e-ar-trace) passed 10 of 10.
- Fix: the contexts' default timeout is 60 s. No assertion changed. Next: a fresh `run_checks` on the clean tree.

## 12 Nov 2026 08:10 (Cairo): all 8 required checks green on 54831a6; P7 pre-review by Codex

- `run_checks` job checks-c15b on clean HEAD `54831a6`: typecheck, lint, build-web, test-core, test-db (760 s), test-web, e2e-ar (347 s), e2e-en (227 s) all exit 0. `done_check.py` now reports only `docs/qa/FINAL_REVIEW.md` missing (a P7 deliverable).
- P6 probe kits (`.work/kit/g3_work`, `g4work`, `design-review/r2`) were built on scratch databases from the design document's SQL snippets, not from the real migrations; their cases live on in the 15 security suites that run against the migrated schema (11,791 tests). I did not re-run the kits.
- Weekly usage is 86 percent, so P7 (opus xhigh) waits for the weekly reset on Tue 06:00. Meanwhile Codex pre-reviewed the riskiest code read-only: `docs/qa/p7-codex-prereview.md`. R1 (high): concurrent retries with one Idempotency-Key both run the mutation (Codex's probe: two refunds, both 201). R2 medium: replay skips permission checks. R3 medium: Web Push still sent to a deactivated member. R4 low: dev-login files in the production trace. Dev-login, the router split, `withServiceTx` callers and cron routes were found sound.
- Fix brief `tools/codex_briefs/p7-prefix-r1-r4.md` (no migration): reserve the key before the handler with a placeholder row, 409 while in flight; authorization fingerprint mixed into the request hash; cancel deliveries for inactive members; exclude dev-login from the production trace. Codex builds, Claude reviews and runs the suites.

## 12 Nov 2026 08:30 (Cairo): P7 pre-review R1 to R4 fixed

- Codex jobs p7fix and p7fix2 (briefs `p7-prefix-r1-r4.md`, `p7-exercise-receipt.md`). R1: the idempotency middleware reserves the key with a 102 placeholder before the handler (409 `idempotency_in_progress` with `Retry-After: 1` while in flight, stale placeholders over 120 s taken over, key released on throw, 5xx or non-JSON), final response saved in one transaction. R2: an authorization fingerprint (role, membership id, client id, staff permissions) is mixed into the request hash; a changed fingerprint is 409 `idempotency_key_reused`. R3: `notify/process.ts` cancels a delivery with `recipient_inactive` when the user has no active membership, before any send. R4: `outputFileTracingExcludes` for `**/dev-login*` and `**/route.dev.ts` in production builds (check the trace after the next build). The exercise import receipt now recognises the middleware's own placeholder.
- Behaviour changes to know: a thrown 4xx error now releases the key instead of caching the 4xx response; a staff member's client-assignment removal is not part of the fingerprint (accepted residual, `staff_client_assignments` lives outside `AuthContext`); a duplicate is still possible if a mutation commits but the receipt save fails, or a handler runs over 120 s.
- Evidence: typecheck exit 0, `run_db_tests.py --web` 61 files, 400 tests passed (was 382; new cases for the concurrent refund, the replay fingerprint, the in-progress 409, push to an inactive member).
- Next: fresh `run_checks.py` on the clean tree, then check `apps/web/.next/server/app/api/[[...route]]/route.js.nft.json` for dev-login; then wait for the weekly reset (Tue 06:00) for P7 (FINAL_REVIEW.md).

## 12 Nov 2026 09:25 (Cairo): round 2 pre-review S1, S3, S4 fixed; S2 open

- Codex job p7fix3 (brief `p7-prefix-s1-s4.md`). S1: `requireSameOrigin` runs first on `/api/v1`; for non-GET methods a foreign `Origin` is 403 `cross_origin`, and without `Origin` a `Sec-Fetch-Site` of same-site or cross-site is 403 (allowed origins: the request origin, `DAWLYY_ALLOWED_ORIGINS`, `NEXT_PUBLIC_APP_URL`). S3: invitation preview limited to 30 requests per minute per address, in memory (per instance, a partial control on a serverless host). S4: push endpoints must be https on port 443 at a known provider (fcm.googleapis.com, push.services.mozilla.com, notify.windows.com, push.apple.com); registration answers 422 `invalid_endpoint`, a stored refused endpoint is retired through the expired-subscription path with no network call.
- My two edits on top: plain-http endpoints keep the old code `invalid_push_endpoint` (an existing assertion pins it), and the notifications test fixture host is now `fcm.googleapis.com` because S4 forbids `push.example.test`. No assertion was loosened; the registration unit test derives the expected code from the same rule.
- S2 (hosted upload signatures bind neither size nor MIME) stays open until the hosted bucket carries MIME and size limits; to be recorded in LAUNCH_RUNBOOK and FINAL_REVIEW as accepted until hosted.
- Evidence: typecheck exit 0; `run_db_tests.py --web` 65 files, 479 tests passed (400 before).

## 12 Nov 2026 10:00 (Cairo): run_checks on e5d6351: 7 of 8 green, test-web red on a race

- typecheck, lint, build-web, test-core, test-db, e2e-ar, e2e-en green (the same-origin guard works in the real browser runs). `test-web` failed once: `exercises.test.ts` "does not insert twice when first import requests overlap" expected two identical 200s; since the reservation fix the second overlapping request is either a replayed 200 or 409 `idempotency_in_progress`. Not a product bug: that is the designed R1 outcome.
- Test change, citing pre-review R1 (`docs/qa/p7-codex-prereview.md`): the winner answers 200, a loser is 200 (identical) or 409 `idempotency_in_progress`, exactly one row is inserted, and a retry after both settle replays the 200 receipt. Four consecutive runs of the file passed (16 of 16 each).
- Next: fresh `run_checks.py` on the clean tree; then wait for the weekly reset (Tue 06:00) for P7.

## 12 Nov 2026 10:35 (Cairo): P6 complete, all 8 required checks green on 50f6207; P7 waits for the weekly reset

- `run_checks.py` (job checks-p7fix4) on clean HEAD `50f6207`: typecheck 26 s, lint 45 s, build-web 33 s, test-core 28 s, test-db 1,084 s, test-web 81 s, e2e-ar 350 s, e2e-en 340 s, all exit 0. Evidence file exists for that HEAD. `done_check.py` reports one thing missing: `docs/qa/FINAL_REVIEW.md`.
- Since the C15 closure this session: C15 scanner and router split (7686c71), e2e timeout (54831a6), pre-review R1 to R4 (b306b28: idempotency reservation, replay fingerprint, push to inactive members, dev-login out of the production trace), S1, S3, S4 (4f227e4: same-origin guard, invitation preview throttle, push endpoint allowlist), runbook note for S2, race-proof import test (50f6207). Pre-review tables: `docs/qa/p7-codex-prereview.md` (two Codex rounds, read-only).
- P7 (opus xhigh) waits for the weekly reset: weekly usage is 88 percent and resets Tue 17 Nov 06:00 Cairo. Do not run P7 on sonnet; a review of this size would also use most of the remaining week. Codex reviews cost no Claude usage; more rounds can run any time.
- First actions of the P7 session (fresh, opus xhigh): (1) re-verify R1 to R4 and S1 to S4 against the code and write them into `docs/qa/FINAL_REVIEW.md` with status (R1, R2, R3, R4, S1, S3, S4 fixed; S2 accepted until hosted, runbook open notes); (2) review the code, not the docs, of auth, RLS policies, guard triggers, `withServiceTx` callers (Codex listed them all in round 1) and the dev-only login; up to 3 opus high verifiers; (3) read the 20 new `*.client.ts` and `client-read.ts` files from the C15 split line by line (not yet read by Claude); (4) review OPEN_DECISIONS 16 and 17 (the two `calendar_events.payload` form ids as derived entries of `clientColumns.calendarEvents`); (5) refresh `docs/qa/HOW_TO_TEST.md` and APPROVALS.md budget total; (6) commit, `run_checks.py` on the clean final HEAD, `done_check.py`, then DONE and one PushNotification.

## 12 Nov 2026 13:30 (Cairo): P7 final-review findings N1 to N4 fixed

- Source: `docs/qa/p7-codex-final.md` (Codex read-only, verified by the attended session). Codex jobs p7n (brief `p7-prefix-n1-n4.md`, report `docs/qa/p7-n1-n4-fixes.md`) and p7n2 (brief `p7-n-legacy-tests.md`).
- N1 high: `requireActiveAccess` is now mounted on workout start, workout sync and `GET /nutrition/me`, after auth and before the idempotency replay; the same `decideAccess` check runs inside the shared services (`server/access.ts`) so pages cannot bypass it; nutrition history no longer calls the gated current-plan reader. N2: migration `0007_push_tenant_scope.sql` limits push handover to the caller's tenant (OPEN_DECISIONS 18; section 7.10.3 and the E14 across-tenant case updated to match). N3: unexpected API errors log only name, SQLSTATE, request id, route and status. N4: request bodies are bounded while streaming before clone or parse (1 MiB JSON, 8 MiB for the local media upload route), 413 `payload_too_large`.
- Tests: 52 new regression tests (access matrix per state, error privacy with a real failed insert, body limits, push tenant isolation). Existing tests were only extended: C20 and C24 gained migration 0007, E14 across-tenant follows decision 18, the workout and nutrition web fixtures now carry an active subscription. No assertion removed or loosened.
- Evidence: `pnpm -r --workspace-concurrency=1 typecheck` exit 0; `run_db_tests.py --web` 68 files, 529 passed; `run_db_tests.py` 17 files, 11,793 passed.
- Next: HANDOFF to opus, effort high, fresh, no verifiers (plan in state.json): adjudicate `p7-codex-prereview.md` (R1 to R4, S1 to S4), `p7-codex-final.md` (N1 to N4) and these fixes into `docs/qa/FINAL_REVIEW.md`. Then sonnet refreshes HOW_TO_TEST, APPROVALS (Budget total), LAUNCH_RUNBOOK, OPEN_DECISIONS, runs `run_checks.py` on a clean HEAD and `done_check.py`.

## 12 Nov 2026 16:25 (Cairo): NextRequest break fixed (ea0f8d0), diff review follow-ups D1 to D4 built and green

- `run_checks` on `e043399`: six checks green, e2e-ar and e2e-en red. Cause from a local stack print: the N4 body limit did `new Request(request, { body })`; under Next the incoming request is a NextRequest and undici throws "Cannot read private member #state", so every mutation with a body answered 500. Fix `ea0f8d0` rebuilds the request from url, method, headers, body and signal; the regression test wraps a real Request in a Proxy and fails on the old code.
- `checks-e2e` on `ea0f8d0`: e2e-ar passed; e2e-en timed out in test 05 under machine load (both runs took about three times longer while a Codex review ran). Not rerun; the one full `run_checks` on the final HEAD decides.
- Codex diff review (`docs/qa/p7-codex-diff.md`) found D3 high (body ceiling refused schema-valid sync batches and CSV imports), D1 free-meal page throws for paused or expired clients, D2 offline sets lost when access lapses, D4 push rows kept after logout. Codex job p7d (brief `p7-prefix-r1-r4b.md`) built the fixes: route-specific body ceilings in `request-limits.ts`, byte-bounded outbox batches that split on 413, `assertWorkoutSyncAccess` (an existing session started inside the access window may sync after expiry; a new session stays blocked), `nutritionLogContext`, `DELETE /api/v1/notifications/push-subscriptions` called by both sign-out buttons, timestamps bounded to 64 characters. Decision 19 in OPEN_DECISIONS.md. No existing test assertion changed (all test files are new).
- Evidence: `pnpm -r --workspace-concurrency=1 typecheck` exit 0; `run_db_tests.py --web` 74 files, 554 passed (was 68, 529); `run_db_tests.py` 17 files, 11,793 passed.
- Next: HANDOFF to opus (high, fresh) for P7: adjudicate `p7-codex-final.md`, `p7-codex-diff.md` and bd8d0dd..HEAD, review the new D2 access window and the new DELETE push endpoint, write `docs/qa/FINAL_REVIEW.md`, fix critical and high. Then one full `run_checks` on the final clean HEAD, `done_check`, DONE.

## 12 Nov 2026 19:35 (Cairo): P7 judgement; FINAL_REVIEW.md written, three new findings N5 to N7 sent to Codex

- Opus high adjudicated R1 to R4, S1 to S4, N1 to N4, the NextRequest break (row NR1), D1 to D4, C15 and decision 17 against the code into `docs/qa/FINAL_REVIEW.md`. All earlier rows hold: fixed, except S2 and decision 17 accepted. The test changes in bd8d0dd..5a8e75a were re-diffed: four files changed, all additive or following decision 18; no assertion loosened.
- New: N5 high, `GET /api/v1/me/program` and `/app/program` serve the full program without active access (build plan line 214 requires 403 `access_expired`); N6 medium, `/app/nutrition` throws for clients without access and `/app/workout/start` offers a refused start (spec section 30 wants the access state and renewal instructions); N7 medium, `api/conversations.ts:60` logs a raw error message (N3 class). R4 checked on the 14:25 production trace: only the checker script matches.
- Codex job `20261112-192405-p7n5` (brief `tools/codex_briefs/p7-final-n5-n7.md`, effort xhigh, `--common none`) is building N5 to N7. LAUNCH_RUNBOOK step 10 now lists the D3 per-route body ceilings and that they apply before auth.
- Next: review the p7n5 diff and answer, gates (typecheck, lint, the named web suites, full `--web`), set N5 to N7 to fixed in FINAL_REVIEW.md, update HOW_TO_TEST line 58 (expired client now sees the access state) plus one line for decision 19, commit, then HANDOFF to sonnet medium for the single full `run_checks.py` on the frozen HEAD.

## 12 Nov 2026 20:40 (Cairo): N5 to N7 fixed (3f3a9e9); FINAL_REVIEW has no open row; frozen for the final run_checks

- Codex job p7n5 (brief `p7-final-n5-n7.md`, xhigh) built N5 to N7; reviewed by me: diff within the brief's file list, the component uses the locale-aware Astryx `LinkProvider`. One existing test (`me.test.ts`, own published copy) failed 403 because its client had no subscription; I gave that one test an active subscription citing N5 and changed no assertion (the Today test still expects state none).
- Evidence on the tree of `3f3a9e9`: `pnpm -r --workspace-concurrency=1 typecheck` exit 0; `pnpm -r lint` exit 0 (0 errors, 18 warnings); check-messages 2227 keys per locale; `run_db_tests.py --web` 76 files, 576 passed. DB suites were not rerun: no `packages/db` change since 5a8e75a (17 files, 11,793 passed).
- `docs/qa/FINAL_REVIEW.md`: 20 fixed, 2 accepted (S2, decision 17), none open. HOW_TO_TEST line 58 now describes the access-expired pages, plus one line for decision 19.
- Next: HANDOFF to sonnet medium, fresh. HEAD is frozen: no commit after the docs commit that follows this block. Run exactly ONE `python C:/Users/compuline/.claude/autopilot/run_checks.py --project .` as a job with nothing else running (machine idle; e2e-en once timed out under load), then `done_check.py`, then DONE and one PushNotification.
