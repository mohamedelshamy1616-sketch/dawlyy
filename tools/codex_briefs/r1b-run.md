# R1b in turbo mode: run notes for `r1b-inbox-nav.md`

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r1b` (branch `wt/r1b`, from `main` at the R0
commits). It is your whole repository for this job. Do not write anywhere else, and do not commit.

The brief is below, unchanged. Follow it, plus these five notes about what landed after it was written:

1. R0c is merged. The red-flag reads live in `apps/web/src/server/red-flags-inbox.ts` (`listRedFlags`). For the
   inbox, count open flags per client with one set-based query of your own in `server/inbox/`. Do not import
   `red-flags-inbox.ts` into a client-facing module.
2. C15 (`packages/db/test/security.catalog.test.ts`) scans every router mounted in `api/index.ts`. The inbox router
   is staff-only, so it must carry the same fail-closed `requireStaffRole` marker that
   `apps/web/src/api/client-modules.ts` and `apps/web/src/api/red-flags.ts` use. Without it, the scan treats the
   router as client-facing and fails on its column objects. Do not change the scanner.
3. Do not change `GET /api/v1/me`; two suites pin its exact response. The client app settings live at
   `GET /api/v1/me/app`.
4. Postgres returns `timestamptz` and `date` as text inside raw `sql` fragments (LESSONS 2026-11-12). Convert
   before you compare, and give DB-backed test assertions the type the code really returns.
5. Hot spots: this brief alone may edit `apps/web/src/api/index.ts` (the inbox mount only) and
   `apps/web/src/components/shell/**`. If registering the `inbox` namespace needs `apps/web/i18n/request.ts`, do
   not edit it. Write the exact patch (file, anchor line, lines to add) to
   `tools/codex_briefs/integration/r1b.md`, and keep the keys in `inbox.json` so Claude applies the loader patch
   at merge. That is the turbo-mode rule and it replaces the brief's "put them in nav" fallback.

Checks you may run yourself, one at a time: `pnpm --filter @dawlyy/web exec tsc --noEmit -p tsconfig.json`, and
vitest only on your new non-DB test files (`pnpm --filter @dawlyy/web exec vitest run <file>`). The DB-backed
`inbox.test.ts` needs the local database: write it, but Claude runs it. Never run a dev server, a build,
Playwright or the database suites.

---

# Batch R1b: the coach inbox (API and page) and the 4-destination coach navigation

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R1, item R1b, and its "Why this build" section (the
coach's most repeated unmet need is one view of who needs them this week and why). Background on the current
navigation (11 flat items, 7 equal dashboard tiles): `docs/research/research_notes/DAWLYY product reinvention
research/dawlyy_ui_audit_vs_best.md` (search "nav", "dashboard", line ~257).

Read `tools/codex_briefs/_common_web.md` and follow every rule in it, with these exceptions that this brief grants:
you may edit `apps/web/src/api/index.ts` (only to mount the inbox router) and `apps/web/src/components/shell/**`
(the navigation is this task).

## Inputs already built (read them; do not edit them)

- `packages/core/src/attention/` (`rankAttention`, `AttentionInput`, `AttentionItem`, reason codes and params).
- Migration 0008 (`packages/db/migrations/0008_reinvent_control.sql`): `red_flags` (staff-only, open or handled),
  void columns (`voided_at`) on `meal_logs`, `metric_entries`, `measurement_sets`, `workout_sessions`.
- `apps/web/src/server/red-flags.ts` and `apps/web/src/api/red-flags.ts` (task R0c: list and handle red flags).
- The existing dashboard reads: `apps/web/src/server/dashboard/queue.ts`, `logic.ts`, `timeline.ts`; they already
  compute check-ins waiting, unread messages, pending payments and ending subscriptions. Reuse their queries.

## Files you may write

- `apps/web/src/server/inbox/**` (new) and tests beside it; `apps/web/src/api/inbox.ts` (new) and
  `apps/web/src/api/inbox.test.ts`; `apps/web/src/api/index.ts` (mount only).
- `apps/web/src/components/shell/**` (nav items, links, mobile menu, coach shell, a new bottom bar, a new profile
  menu, a new command palette).
- `apps/web/app/[locale]/coach/page.tsx` (becomes the Inbox), a new `apps/web/app/[locale]/coach/library/page.tsx`
  (and `loading.tsx`), a new `apps/web/app/[locale]/coach/money/page.tsx` (and `loading.tsx`).
- New components under `apps/web/components/inbox/**`.
- `apps/web/messages/{ar,en}/nav.json`, `apps/web/messages/{ar,en}/inbox.json` (new namespace: if registering it
  needs `apps/web/i18n/request.ts`, do not edit that file; put the keys in an existing namespace you own, `nav`, and
  say so) and `apps/web/messages/{ar,en}/dashboard.json`.
- One test file `apps/web/src/components/shell/nav-reachability.test.ts`.

Nothing else. Do not edit `apps/web/components/clients/**` or `apps/web/components/program-builder/**` (other tasks).

## 1. `GET /api/v1/inbox`

- Staff only (`requirePermission(auth, 'clients', 'view')`; clients get 403). Scope: the caller's accessible
  clients only (RLS already limits assigned-scope staff; never use `withServiceTx`). Active clients only (not
  archived, status active).
- Build one `AttentionInput` per client with set-based queries (a fixed number of queries for the whole list, never
  one query per client), for `today` = the tenant's local date:
  - `lastCheckin`: the latest form submission (status `waiting_review` when it is submitted or waiting for coach and
    not reviewed) and the next due check-in date;
  - `workouts`: planned and done in the last 7 and 14 days (planned from the calendar events or the program schedule
    the dashboard already uses; done = finished workout sessions, **excluding voided sessions**);
  - `mealLogDays7` (excluding voided meal logs) and `nutritionAssigned` (a published plan assigned);
  - `weights14` from weight metric entries (excluding voided), `goal` from the client profile if stored (else null);
  - `openRedFlags` from `red_flags` with status `open`;
  - `paymentPending`, `subscriptionEndsOn`, `lastCoachMessageOn`, `unreadFromClient`.
- Call `rankAttention` and return `{ items: [{ client: { id, displayName, code, avatarMediaId? }, score, reasons,
  primaryAction }], today }`, sorted as `rankAttention` returns. Optional `?limit=` (default 50, max 200).
- Tests (DB-backed, the harness in `apps/web/src/test/api-harness.ts`): a client with a waiting check-in ranks above
  one with only `no_contact`; an open red flag ranks first; a voided workout session does not count as done; an
  assigned-scope staff member sees only assigned clients; a client caller gets 403; archived clients are absent.

## 2. Coach navigation: 4 destinations

- Primary: **Inbox** (`/coach`), **Clients** (`/coach/clients`), **Library** (`/coach/library`), **Money**
  (`/coach/money`). On phones a bottom bar with these 4 (fixed, safe-area padding, 44 px targets, labels under
  icons); on `md` and up a narrow rail with the same 4 plus the wordmark.
- A profile menu (the avatar or name button in the header) holds: Settings, Calendar, Team, Notifications, Tasks,
  Assessments, Intake, Check-ins, Messages, the locale switch and sign out. Every route under
  `apps/web/app/[locale]/coach/` that exists today stays reachable from the bar, the rail, the menu or the Library
  and Money hubs.
- `/coach/library`: a hub listing Programs, Exercises, Foods, Forms, Packages, Nutrition plans, each a card link to
  its existing list (which has, or gets from task R0c, an `?archived=true` filter; add a second link "Archived" to
  each that opens the list with that query).
- `/coach/money`: a hub with Payments (the existing billing pages) and Renewals (subscriptions ending soon, from the
  dashboard's existing query), linking to the existing routes.
- `nav-reachability.test.ts`: lists every `page.tsx` under `apps/web/app/[locale]/coach/` without a dynamic segment
  (read the file system in the test) and asserts each path is the href of a primary item, a profile menu item, or a
  Library or Money hub link (export those link lists from the shell and hub modules so the test can import them).
- Desktop command palette (Ctrl+K or Cmd+K): a dialog that searches clients by name or code (an existing clients
  list route with `q`) and the navigation actions above; Enter opens the result. Astryx dialog; no new dependency.

## 3. The Inbox page (`/coach`)

- Server Component: `requirePage()`, then the inbox service through `withAuthTx`. A row per item: the client's
  name, the top reason rendered from its code and params (ar and en messages for every reason code and every
  red-flag category, with ICU plurals for days and counts), a status chip, and one inline action button by
  `primaryAction`: `review` opens the client's latest check-in review, `reply` opens the conversation,
  `confirm_payment` opens the payment, `renew` opens the client's subscription, `handle_flag` opens the client page,
  `nudge` opens the conversation. The other reasons appear as a short secondary line.
- The old count cards and queues stay reachable: keep `?queue=<kind>` working on this page and add a small "all
  queues" link row under the list.
- Empty state when nothing needs attention. Loading state. 360 px RTL without horizontal scroll.

## Answer

Files written; the inbox query plan (how many queries, which tables, how voided rows are excluded); the final
navigation map (bar, rail, menu, hubs) with every coach route and where it lives; anything you could not do.
