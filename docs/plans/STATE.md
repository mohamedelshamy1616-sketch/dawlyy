# DAWLYY build — state record

This is the single hand-off file. Any model or session that continues the build reads this file first,
then `docs/plans/2026-11-07-dawlyy-build-plan.md` (the contract), and does **not** re-plan.
Update this file at every meaningful transition: a wave finished, a decision taken, a failure found.

Last update: 2026-11-09 17:55 (Africa/Cairo), by the autopilot worker (Claude Sonnet 5.5, start of P3).

## Autopilot worker log (newest first)

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
- Supabase project (URL, anon key, service key, DB password) into `apps/web/.env.local` and `packages/db/.env`; Vercel login; a yes for creating and pushing a private GitHub repo.
- Brand assets and domain; the first coach's real packages; Egyptian counsel for Law 151/2020 before real clients.

## Failures and gotchas already paid for

See memory `reference_pnpm12_nextjs16_scaffold_gotchas.md`. Short list: `pnpm approve-builds --all -y`; `pnpm add -D`
for scoped names; pin `typescript ^5.9.3`; Zod 4 `.prefault({})`; `pgPolicy` helper functions must exist before the
tables that reference them; Bash heredocs break under the rtk hook (use the Write tool); PowerShell 5.1 has no `&&`.
