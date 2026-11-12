# P7 final-review fixes N5 to N7 (from the Claude review of HEAD 5a8e75a, 12 Nov 2026)

Read `docs/plans/BUILDER_BRIEF.md` first; its hard rules apply. Existing tests are read-only: add new test files or new
cases, never edit or delete an existing assertion. No commit, no push, no migration, no new dependency.

Files you may write: `apps/web/src/api/me.ts`, `apps/web/src/server/workout/portal.ts`,
`apps/web/app/[locale]/app/program/page.tsx`, `apps/web/app/[locale]/app/nutrition/page.tsx`,
`apps/web/app/[locale]/app/workout/start/page.tsx`, `apps/web/components/client-portal/*` (a new access-expired
component may go here), `apps/web/src/api/conversations.ts`, `apps/web/messages/{ar,en}/workout.json` and
`apps/web/messages/{ar,en}/nutrition.json` (new keys only, same keys in both locales, plain Egyptian Arabic in ar),
and new test files under `apps/web/src/api/` named `p7-n5-*.test.ts` or `p7-n7-*.test.ts`. Write nothing else.

Reuse what exists: `assertActiveAccess`, `checkActiveAccess` (`apps/web/src/server/access.ts`), `requireActiveAccess`
(`apps/web/src/api/middleware/access.ts`), `safeErrorMetadata` (`apps/web/src/api/error-log.ts`), the client
subscription page `/app/subscription` (renewal instructions live there), and the test helpers used by
`apps/web/src/api/access-live.test.ts` and `p7-access-regression.test.ts` (copy their subscription fixture approach).

## N5 (high): the current program is readable without active access

Build plan, Task 3 acceptance (`docs/plans/2026-11-07-dawlyy-build-plan.md` line 214): "expired subscription blocks
`/api/v1/me/program` with 403 `access_expired` but history endpoints still return data". Spec section 30: on expiry,
restrict active coaching content while retaining history. Today `GET /api/v1/me/program` (`apps/web/src/api/me.ts`)
and the page `/app/program` (`getPortalProgram` in `apps/web/src/server/workout/portal.ts`) return the full published
program document to a client whose subscription is expired, suspended, cancelled, pending, paused, or absent. N1 gated
workout start, workout sync and current nutrition, but not this.

- Mount `requireActiveAccess` on `GET /me/program` after auth (same order as `GET /nutrition/me`). Also call
  `assertActiveAccess` inside `getPortalProgram`, so a page cannot bypass it. Owners and staff are unaffected.
- `GET /me` and `GET /me/today` stay ungated (Today carries the subscription status the client needs to renew).
  Do not change `getToday`'s output shape.
- Workout history, session detail and exercise history stay ungated.
- Tests (new file): for each state pending, active, grace, paused, expired, suspended, cancelled and no subscription,
  `GET /api/v1/me/program` answers 200 only for active and grace; the rest answer 403 `access_expired`. History
  (`GET /api/v1/workout-sessions`) still answers 200 for an expired client. A direct `getPortalProgram` call for an
  expired client throws the same 403.

## N6 (medium): client pages throw instead of showing the access state

`/app/nutrition` (`page.tsx` calls `myNutrition`, gated since N1) and `/app/program` (gated by N5) throw an
`ApiError` 403 during server rendering for a client without access, so the client sees an error page. There is no
`error.tsx` in this route group. Spec section 30: "Client sees subscription end date, remaining days/countdown, access
status and renewal instructions".

- In these two pages, call `checkActiveAccess` first (inside the same `withAuthTx`); when access is denied, render a
  small access-expired state instead of the gated content: a title, one sentence, and a link to `/app/subscription`.
  Use Astryx components as the existing portal components do (`apps/web/AGENTS.md`, "Astryx in DAWLYY"), 44 px
  touch targets, RTL-safe. Do not catch and swallow other errors.
- `/app/workout/start`: when access is denied and there is no existing session for today, render the same state
  instead of offering a start that the API will refuse. An existing session for today still redirects as now.
- The nutrition history and free-meal log pages stay as they are (D1).
- Tests: a server-side test that calls the page's data path is not required; cover the decision with the API and
  service tests above. Run `node apps/web/scripts/check-messages.mjs` after adding keys.

## N7 (medium): one remaining raw error message in a log

`apps/web/src/api/conversations.ts:60` logs `failure.message` when the post-commit notification fails. A Drizzle or
postgres error message embeds the failed query and its parameters, which here include message text (private client
health content). This is the same class as N3.

- Log only `safeErrorMetadata(failure, requestId, route, status)` (or the same allowlisted fields), never the message.
- Test (new file): force the notification step to fail with an error whose message contains a private marker; assert
  the marker is absent from every `console.error` argument and that the message itself was still saved (the request
  still succeeds as today).

## Run and report

Run `pnpm --filter @dawlyy/web typecheck`, eslint on the touched files, the new test files and the existing
`me.test.ts`, `access-live.test.ts`, `p7-access-regression.test.ts`, `conversations.test.ts`, `workout-sessions.test.ts`
and `nutrition.test.ts` through `python tools/run_db_tests.py --web --reuse-db <files>` (start Postgres first with
`powershell -File tools/local_pg.ps1 -Action start` if it is down), then one full `python tools/run_db_tests.py --web`.
Do not run e2e or a full DB suite. If an existing test fails because it read the program of a client without a
subscription, do not edit it: report it with the file, the test name and the failing assertion.

Report: files changed, each command with its last decisive output lines, anything you could not verify, and anything
in this brief you think is wrong.
