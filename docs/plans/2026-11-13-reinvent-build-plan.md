# DAWLYY reinvention build plan (P8 to P10)

Written 13 Nov 2026, 18:30 Cairo, by the attended Claude session (Opus 5.5). This plan is the contract for the
reinvention build, beside the original build plan `2026-11-07-dawlyy-build-plan.md`. That plan's Global
Constraints still apply to every task here.

## Approval

Mohamed approved this build on 13 Nov 2026 at about 18:15 Cairo. His words: "جمّع كل حاجة انت عايزها وابدأ الـ
build مرة واحدة، وبعد كده الـ test على كل حاجة، وبعد كده الـ publish على طول، وخليك حريص أوي ومركّز".

He left the choice of direction to Claude. The direction taken is A plus B from the UI audit, and he can override
it. His standing approval of the same day (APPROVALS.md item 8) covers everything except money.

"Publish" means the staging deploy at https://dawlyy.vercel.app. The attended session does it after P9, not the
worker (see P10).

## Why this build

The evidence is in `docs/research/reports/DAWLYY product reinvention research.md` and its notes folder. In short:
- Coaches' most repeated unmet need is one view of who needs them this week and why. Nobody owns it.
- Coaches accept AI that drafts for their approval. They reject AI that talks to clients unsupervised.
- No platform has an Arabic coach-side assistant.
- Reliability and trust beat feature count.
- DAWLYY today has 11 flat nav items, 7 equal dashboard tiles and an 11,030 px program editor. It also has no
  archive, undo or activity log outside programs, nutrition plans and forms.

**Thesis.** DAWLYY is for independent Arabic-speaking online coaches with about 20 to 100 clients. The promise is
that the coach finishes a client's weekly review at least 30% faster and controls every message and plan change.
Three capabilities deliver it:
1. One review inbox.
2. An Arabic review assistant that drafts for approval.
3. A client experience the coach composes, with recovery from every mistake.

## Hard limits for this build

1. **No money.** No paid API, no paid plan, no paid model call. Nothing in this build calls a hosted LLM on client
   data.
   - The AI provider interface ships with the `none` provider as the default.
   - The `anthropic` and `openrouter` adapters are written and unit-tested against a fake transport. They switch on
     only when Mohamed adds a key and sets `DAWLYY_AI_PROVIDER`.
   - Tests and CI never reach the network.
   - The OpenRouter adapter always sends `provider: {data_collection: "deny", allow_fallbacks: false}`. A test
     asserts this.
   - Egypt Law 151/2020 makes sending health data abroad a legal question (OPEN_DECISIONS 20). The UI says so in
     the settings page where the key would go.
2. **Meal-photo calories are not in this build.** They need a paid vision key, and accuracy on Egyptian dishes is
   unproven: independent tests show about a third under-count. P8 builds only a meal-log correction flow and a
   "quick log" (see R2). The photo experiment waits for his key and the 100-photo evaluation in the report.
3. **Payment void and correct are not built.** That is OPEN_DECISIONS 21. Everything else gets archive, restore
   and history-preserving corrections.
4. **Design.** Mohamed is a professional designer. Keep Astryx (`apps/web/AGENTS.md`).
   - Put every colour, type, radius and spacing decision in one token file
     (`apps/web/src/styles/tokens.css` or the existing Astryx theme file) so he can restyle in one place.
   - Do no decorative restyling beyond what the audit lists. The structure is what changes: navigation, hierarchy
     and flows.
5. **Security.**
   - Every new column, table, function and endpoint gets RLS and guard coverage in `test-db`, in the style of the
     existing security suites. New client-facing reads go through `clientColumns` (C15).
   - Archive is a column update that guard triggers allow only for staff with the module permission.
   - Corrections never update or delete the old row. They insert a new row that points back to it and mark the old
     one voided.
   - Audit rows for every archive, restore, void and approve go to the existing `audit_log`.
   - Never weaken an existing test, guard or policy.

## P8: the build (sonnet high main session; Codex builds; one high-effort Codex job at a time)

Run in waves. Inside a wave, tasks have disjoint file sets. Gate each task with typecheck and lint, then commit.
Re-run the screens job at the end of each wave.

### Wave R0: foundations

**R0a: migration `0008_reinvent_control.sql`, schema and suites** (Codex xhigh brief, Claude integrates).
- `archived_at timestamptz`, `archived_by uuid` on clients, exercises (tenant-owned rows; system exercises get the
  existing per-tenant hide), programs, nutrition plans, forms and packages. Packages already archive; add
  unarchive.
- Default list queries exclude archived rows. Each entity gets an "archived" listing.
- `calendar_events`: cancel with `cancelled_at`, `cancelled_by` (not delete).
- `meal_logs` and measurements (the body-metrics table in `tracking.ts`): add `voided_at`, `voided_by`,
  `void_reason` and `replaces_id`.
  - A correction inserts the new row with `replaces_id` set and voids the old row in one transaction.
  - The client may correct or void only their own rows, within 7 days. Staff may do it with the nutrition or
    tracking permission.
  - Voided rows are excluded from totals and charts, but stay visible in history.
- Workout sessions: void a junk session the same way. Its set logs stay attached.
- Tenant module settings: a `client_modules` jsonb on the tenant settings row. It stores the modules the coach
  shows the client: workouts, nutrition, check-ins, progress photos, measurements, messages and payments. Default
  all on. A per-client override goes through the existing client overrides mechanism. Validate with Zod in core.
- An `ai_drafts` table, bound to the exact inputs. Columns:
  - `tenant_id`, `client_id`, `kind`;
  - `input_hash`, `input_version` (the source version or check-in id it was built from);
  - `body` (jsonb), `provider` (`none` | `anthropic` | `openrouter`), `status` (`draft` | `approved` | `rejected` |
    `stale`);
  - `approved_by`, `approved_at`, `created_at`.

  Approving checks that `input_hash` still matches the current inputs. Otherwise the draft becomes `stale` and
  cannot be sent. Clients never read this table.
- `red_flags` table: `tenant_id`, `client_id`, `source` (message | check-in | meal note), `source_id`, `category`
  (pain_injury | eating_disorder | pregnancy | medication | other), `matched` (the term), `status` (open |
  handled), `handled_by`, `handled_at`. Staff only.
- A test-db suite `security.reinvent.test.ts` covers:
  - tenant isolation for every new column and table;
  - a client cannot archive;
  - a client cannot void another client's row;
  - a client cannot void after 7 days;
  - a client cannot read `ai_drafts` or `red_flags`;
  - a stale draft cannot be approved;
  - audit rows are written;
  - no update or delete path exists on a voided row.
- Apply it on a fresh scratch database. Run the full `test-db`.

**R0b: the shared fixes from the UI audit** (Sonnet builder):
1. Link the existing timeline page into the client page and remove the "coming soon" History tab.
2. Round macros to whole numbers and kcal to the nearest 5. Use one numeral policy, set per user (Arabic-Indic or
   Western, default Western digits in Arabic UI). Put it in one formatter in `packages/core` or `apps/web/src/lib`
   and use it everywhere.
3. Turn the sync status into a header dot. Show a card only when pending is above 0.
4. Translate the English strings left on Arabic screens ("hips", "kg" and every other one found by a grep of the
   ar messages against en). Fix the broken progress-photo image.
5. Make the screens spec fail when the settled state is a skeleton. Capture 360, 390 and 430 px plus the live
   workout screen.
6. Replace the "target muscle" fallback with the real muscle, or hide the line.

### Wave R1: the coach side (direction A, "coach command inbox")

**R1a: `packages/core/src/attention/`** (Codex high). A pure, deterministic ranking.
- Inputs: the client's last check-in time and status; workouts planned against done in the last 7 and 14 days;
  meal-log days in the last 7; the weight trend over 14 days; open red flags; payment pending; days left on the
  subscription; days since the coach's last message; unread client messages.
- Output: an ordered list of `{clientId, score, reasons: [{code, params}], primaryAction}`.
- Reasons are codes with params, so the UI renders them in ar and en. Examples: `checkin_waiting {days: 2}`,
  `weight_flat {days: 14}`, `adherence_drop {from: 90, to: 40}`, `payment_pending`, `subscription_ends {days: 3}`,
  `red_flag {category}`, `no_contact {days: 10}`.
- Weights live in one table in the module. Use table-driven unit tests with 30 or more cases, including ties and
  empty data.

**R1b: inbox API and coach navigation** (Sonnet builder):
- `GET /api/v1/inbox` returns the ranked list for the caller's scope. Assigned-scope staff see only their clients.
- Coach navigation goes from 11 destinations to 4. On phone it is a bottom bar; on desktop a rail.
  - **Inbox:** the ranked list, check-ins waiting, and messages merged.
  - **Clients.**
  - **Library:** programs, exercises, foods, forms and packages, each with an Archived filter.
  - **Money:** payments and renewals.
  - Settings, Calendar, Team, Notifications, Tasks, Assessments and Intake go under the profile menu. Every route
    that exists today stays reachable. A test asserts that every coach route is reachable from the nav or the menu.
- Inbox rows show the person, the single top reason, a status chip and one inline action (review, nudge, confirm).
  Rows sort by score.
- On desktop, a command palette (Ctrl+K) searches clients and actions.

**R1c: the client hub** (Sonnet builder). The coach's client page gets 4 tabs:
- **Week:** the timeline, plus this week's review card from R4.
- **Plan:** program and nutrition, with an Assign button, so assigning a program takes 3 taps or fewer from the
  client page.
- **Money:** subscription and payments.
- **Notes:** coach notes and the activity log from R3.

**R1d: the program editor on phone** (Sonnet builder).
- Collapse days and exercises into a compact list with inline edit.
- Cut the set row from about 9 controls to the essential 3 or 4, with the rest under "more".
- Target: the 390 px capture of the seeded program is under 3,000 px tall.

### Wave R2: the client side (direction B inside A's 4 tabs)

**R2a: client navigation and Today** (Sonnet builder):
- Client tabs: Today, Plan, Coach and Me.
  - **Coach:** chat with the coach's name, photo and reply promise.
  - **Me:** progress, history, check-ins, subscription and notifications.
- Today has one lead card ("today's session" with Start, 1 tap to start). Below it come meals as rows with a
  one-tap "ate it" (logs the planned meal), then the check-in when due. No tiles.
- Every module honours `client_modules`. A hidden module disappears from tabs, Today and Me. The API refuses its
  writes with 403 `module_disabled`.

**R2b: client corrections and quick log** (Sonnet builder):
- Edit or remove a meal log, a measurement or a junk workout within 7 days, through the correction endpoints from
  R0a.
- Each action shows an undo toast for about 6 seconds.
- Quick log: the planned meal as eaten, the same as yesterday, or a recent food. Each is 2 taps at most.

**R2c: coach composes the client app** (Sonnet builder). A settings page "تطبيق العميل" (Client app):
- toggles for the modules;
- a per-client override from the client hub;
- a live phone-frame preview of the client's Today.

### Wave R3: control everywhere

**R3a: archive, restore and the undo toast** (Sonnet builder):
- Every coach-owned list gets Archive in its row menu. A toast offers undo (the restore call) for 6 seconds. An
  Archived filter offers Restore.
- Bulk select on Clients and Library supports archive, restore, and assigning one program to many clients.
- Cancelling a calendar event works the same way.

**R3b: the activity log** (Sonnet builder). `GET /api/v1/activity?clientId=&entity=` reads `audit_log` for the
caller's scope.
- A per-client log appears in the client hub Notes tab. A business-wide log appears under Settings.
- Each row shows who, what, when, and a link to the item.
- Program, nutrition and form versions keep their revert. Add a "revert" link from the log row to the version.

### Wave R4: the review assistant, without paid AI

**R4a: `packages/core/src/review/`** (Codex high). A pure function `weekReview(inputs)` returns a structured
summary:
- adherence (workouts and meals), with numbers;
- the check-in answers, compared with last time;
- the weight and measurement trend;
- PRs or stalls;
- open red flags;
- what the attention module flagged.

It also returns a draft reply built from ar and en templates.
- Templates come in Egyptian and Gulf variants, and the coach chooses their dialect in settings.
- The coach's saved signature phrases go into the templates.

It also returns optional plan proposals as rule-based diffs, for example "weight flat 14 days and adherence above
80%: lower calories by 100".
- Each proposal is expressed as a nutrition or program draft version.
- The existing version diff shows it.
- Nothing applies without approval.

Use table-driven tests.

**R4b: review API and UI** (Sonnet builder):
- `POST /api/v1/clients/{id}/review` builds the review from current data. It stores an `ai_drafts` row
  (`provider: none`) with the input hash.
- The coach edits the draft. "Approve and send" re-checks the hash, posts the message through the existing
  messages API, and audits. "Apply proposal" creates the draft version for the coach to publish.
- A stale draft shows "data changed, rebuild".
- The weekly review card sits in the client hub Week tab and in the Inbox row action "review".
- A timer in the e2e test records how long a coach's review takes, as evidence for the 30% promise against the
  current flow.

**R4c: red-flag guard** (Codex medium for the lexicon and tests, then Sonnet integration):
- A lexicon module in `packages/core/src/safety/`.
  - It covers Arabic in Egyptian and Gulf spellings, with and without diacritics and common misspellings, plus
    English.
  - Categories are pain or injury, eating disorder, pregnancy and medication.
  - Matching runs on normalised text (alef, ya, ta-marbuta and tatweel normalisation). Use 80 or more test
    sentences, including false-positive guards ("ألم" inside other words).
- It runs on client messages, check-in free text and meal notes, server-side on write.
- A match creates a `red_flags` row and an Inbox reason. It never generates advice.
- The review draft for that client carries a note that the coach must handle the flag first.

**R4d: AI provider interface** (Codex high). `apps/web/src/server/ai/`:
- the `AiProvider` interface;
- the `none` provider, which returns the template output;
- the `anthropic` and `openrouter` adapters, written against `fetch`, unit-tested with a fake transport, and off
  without a key;
- a settings page section that shows the status "off: needs a key and legal review" and the cost table from the
  report.

There are no keys in the repo and no network in tests.

### Wave R5: polish and proof

- Token file consolidation (limit 4), the numeral policy everywhere, and empty states for every new list.
- HOW_TO_TEST.md in Egyptian Arabic, updated with every new flow:
  - inbox;
  - client hub;
  - archive with undo;
  - corrections;
  - review and approve;
  - red flag;
  - client modules;
  - quick log.
- Screens re-run at 360, 390 and 430 px and 1366 px, ar and en.

## P9: test everything and review (sonnet high; opus high for the review)

1. `tools/checks.json` keeps the 8 checks. The new suites join `test-core`, `test-db` and `test-web`.
2. New e2e flows join `e2e-ar` and `e2e-en`:
   - coach: inbox, then review, then approve and send;
   - coach: archive, then undo, then archived filter, then restore;
   - coach: assign a program from the client hub in 3 taps or fewer;
   - coach: hide nutrition, then the client no longer sees it and its write gets 403;
   - client: start a workout in at most 2 actions;
   - client: correct a meal log, then undo;
   - client: a message with a pain term, then a red flag in the coach's inbox.
3. Run `python AP/run_checks.py --project .` on a clean tree until all 8 checks exit 0.
4. The review (opus high via handoff, with up to 3 adversarial verifiers and a Codex second opinion through the
   bridge) covers:
   - the new migration;
   - the RLS and guards;
   - every new endpoint;
   - the stale-draft binding;
   - the module gate;
   - the correction window.
   Write `docs/qa/REINVENT_REVIEW.md` as a table `| ID | Severity | Finding | Evidence | Status |`. Fix every
   critical and high finding. Its last line is `Reinvent build: complete` only when none is open.
5. `done_check.py` requires `docs/qa/REINVENT_REVIEW.md` with that line (the config was updated 13 Nov). Then set
   DONE.

## P10: publish to staging (the attended session, not the worker)

The worker never touches Supabase or Vercel. After DONE:
1. The watchdog pushes `main` to GitHub. Mohamed's publish yes of 13 Nov covers this push.
2. The attended session:
   1. backs up the staging database;
   2. runs `staging.mjs migrate` for 0008 (APPROVALS.md item 8);
   3. checks that RLS is on for every table and that the policy count went up as expected;
   4. deploys the staging build (Vercel Git integration or a redeploy, whichever the project uses);
   5. runs the smoke list: `/ar`, `/en`, `/login` and `/signup` return 200, `/api/v1/me` returns 401 and
      dev-login returns 404.
3. Rollback: redeploy the previous deployment on Vercel. 0008 only adds columns and tables, so the old build keeps
   working on the new schema. Do not drop anything.

## Not in this build (each one is written in OPEN_DECISIONS or APPROVALS)

- Meal-photo calories: a paid key and a 100-photo Egyptian evaluation are needed first.
- Voice notes to plan: a paid speech-to-text service and a 30-clip test are needed first.
- Payment void and correct: OPEN_DECISIONS 21.
- Ramadan mode, prayer-time scheduling, women-only programs: inference only, so validate them first.
- Coach and client interviews: prepared in the report, run by Mohamed.
- Wearables and Apple Health sync.
