# Batch P4-T10: coach dashboard, action queue, Client 360 timeline, tasks (build-plan Task 10)

Build the coach dashboard with attention counts that link into filtered queues, the tasks API (manual and system
tasks, snooze, complete), and the Client 360 timeline merging subscriptions, submissions, versions, sessions, metrics,
messages and payments, with private coach notes visually distinct. Read build plan Task 10, spec sections on the
dashboard and Client 360, doc section 12.1, section 5.2 rows for `tasks` and the tables the timeline reads, and
`packages/db/src/schema/{ops,clients,packages,tracking,forms,messaging,programs}.ts`.

## Files you may write (and nothing else)

- API: `apps/web/src/api/dashboard.ts`, `apps/web/src/api/tasks.ts` (stubs exist, mounted) and tests `dashboard.test.ts`,
  `tasks.test.ts`.
- Services: `apps/web/src/server/dashboard/*` (+ `*.test.ts`).
- Components: `apps/web/components/dashboard/*`.
- Pages (each with `loading.tsx`): `apps/web/app/[locale]/coach/page.tsx` (replace the current one),
  `apps/web/app/[locale]/coach/tasks/page.tsx`, `apps/web/app/[locale]/coach/clients/[clientId]/timeline/page.tsx`.
- Messages: `apps/web/messages/{ar,en}/dashboard.json` (registered, currently `{}`; you own them).

Do NOT write SQL views or migrations: `packages/db` is frozen. Compute every count with Drizzle queries or the `sql`
tag through `withAuthTx`, so RLS scopes them (assigned-scope staff then see only their clients' counts, which is the
acceptance). Do not edit the other task files: T8 (calendar, tracking), T11 (settings) and T9 (messaging, later) work
elsewhere. Tables that T8/T9 own may be read; link to their routes by path only (`/coach/calendar`,
`/coach/messages`, `/coach/checkins`, `/coach/billing`, `/coach/clients/<id>`).

## Routes

`/dashboard` (module `dashboard`): `GET /summary` returns counts: clients needing attention, overdue check-ins,
check-ins waiting for review, missing data (no weight in 14 days among active clients), subscriptions expiring within
14 days, pending payments, adherence decline (completed share of workout days over the last 7 days at least 30 points
below the previous 7). Each count carries a `href` to the filtered queue. `GET /queue/{kind}` returns the rows behind a
count (keyset pagination). `/tasks` (module `dashboard`): `GET /` filters `state`, `assigneeMembershipId`, `clientId`,
`dueBefore`; `POST /` create `{ title, detail?, priority, dueAt?, clientId?, assigneeMembershipId? }`; `PATCH /{id}`;
`POST /{id}/complete`; `POST /{id}/snooze` `{ until }`; `POST /{id}/reopen`. `dedupe_key` unique per tenant: system
tasks use `source = 'rule:<key>'`; a repeat insert with the same key is ignored without ON CONFLICT on `clients` or
`payments` (plain select-then-insert in the same transaction is fine for `tasks`). `GET /dashboard/timeline/{clientId}`
merges the client's events newest first with keyset pagination; coach-private notes carry `private: true`. Errors 400,
401, 403, 404, 409, 422. Clients get 403 on every route.

## Screens (360 px first, RTL-safe, targets at least 44 px)

Astryx for every new control (rule in the common brief). Dashboard: count cards in a responsive grid, each a link,
zero counts shown calmly (not hidden). Tasks: list with priority badge, due, quick complete and snooze (tomorrow, next
week). Timeline: a vertical feed with an icon per kind, time, one-line summary and a link to the source; private notes
in a tinted card with a "Only you can see this" label. Every route has loading and empty states.

## Tests (Claude runs them)

DB-backed (pattern of `apps/web/src/api/programs.test.ts`, harness `apps/web/src/test/api-harness.ts`): each summary
count equals a direct SQL count over the seeded fixture (the plan's acceptance, write the SQL in the test); assigned-
scope staff counts cover only assigned clients; a client gets 403; task create, snooze hides it from the default open
list until the time passes, complete and reopen; duplicate `dedupe_key` creates one task; timeline merges at least
subscription, payment and session rows in order and marks private notes.

## Answer

Per the common rules. Also: the definition used for each count, the tables read for the timeline, and every message key
group added.
