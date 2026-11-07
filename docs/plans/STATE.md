# DAWLYY build — state record

This is the single hand-off file. Any model or session that continues the build reads this file first,
then `docs/plans/2026-11-07-dawlyy-build-plan.md` (the contract), and does **not** re-plan.
Update this file at every meaningful transition: a wave finished, a decision taken, a failure found.

Last update: 2026-11-07 17:22 (Africa/Cairo), by Claude (Opus 5.5, max effort, ultracode on), session `4eebc630`.

## Objective

Ship the DAWLYY Online Coaching Operating System (spec v4, `docs/spec/DAWLYY_v4_spec.md`) as a web-first beta as fast as
possible: coach workspace + client PWA, Arabic-first with English, multi-tenant with database-enforced isolation, manual
payments in beta, native apps later. Mohamed's words: "build everything, then we test, then we fix, so we don't waste time."

## Approvals in force and their limits

Allowed without asking: installs inside the repo, builds, typecheck, tests, local Postgres start/stop on port 54329,
local commits on `main`, starting Codex builds, starting Sonnet workflows (max 3 agents at once), reading anything.

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
  role `dawlyy_app` (LOGIN NOINHERIT NOBYPASSRLS) does `SET LOCAL ROLE authenticated` inside the transaction. Server
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

6. `feat(core): program editing, subscription timeline, Arabic text and CSV import` (the commit after `b5a8f92`):
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

Workflow `wf_b4b8873f-a5f` (task `wik5q257l`, 16:00–17:12) finished: 8 Sonnet agents, 6 returned, 2 failed on API
timeouts (`audit:tenant`, `audit:definer`; re-run them). The two reviews are processed (commit 6). The returned audit
lenses (`exposure`, `scope`, `authority`, `history`) each used a scratch database `dawlyy_audit_<lens>` on the local
cluster, with SQL proofs in the scratchpad folder `audit\<lens>\`. Next: the main thread re-runs each proof, then fixes
and writes RLS tests. The `audit:scope` agent ran while the safety classifier was unavailable; check what it changed. Journal:
`C:\Users\compuline\.claude\projects\C--Users-compuline\4eebc630-63ac-41d5-ad16-887e467309f3\subagents\workflows\wf_b4b8873f-a5f\journal.jsonl`.
Resume after a crash: `Workflow({scriptPath: <the script under ...\workflows\scripts\>, resumeFromRunId: 'wf_b4b8873f-a5f'})`.

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
4. Security pass on the database layer: an adversarial audit workflow (Sonnet finders by lens, each proving findings
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
