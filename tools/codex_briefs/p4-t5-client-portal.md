# Batch P4-T5: client portal (Today, My Program, offline workout session, history) (build-plan Task 5)

Build the client side of training: the Today screen, the program view, the workout session screen that works offline,
the history screens, and the API behind them. The client is a coach's customer using a phone, often in a gym with bad
signal, in Arabic (RTL) or English. Read build plan Task 5 and "Offline outbox (client PWA)", spec sections 29 to 33
(workout logging, comparison, history), doc section 12.1 (items 10, 12, 15), section 5.2 rows for `workout_sessions`
and `set_logs`, section 6 and 7 for their guard triggers, and `packages/db/src/schema/tracking.ts`
(`workoutSessions`, `setLogs`, `SET_TAGS`). Also read `docs/product/COMPETITOR_GAPS.md` rows G2 and G3, which
this task owns (G4, the coach comment on a single set, is finished by T9; leave room for it): each row needs a visible
behaviour you build and a test or e2e step that proves it.

Core already holds the logic. Read `packages/core/src/workout` (`compareSessions`, `findLastComparable`,
`exerciseHistory`, `sessionVolume`, `completionPct`, `estimate1RM`, `convertLoad`, types `PerformedSet`,
`SessionRecord`), `packages/core/src/state` (`transition('session', from, event)`), `packages/core/src/program-edit`
(`findDay`, `programStats`) and `packages/core/src/types` (`ProgramDocument`, `Workout`). Use them; do not re-derive.

## Files you may write (and nothing else)

- API: `apps/web/src/api/me.ts` (keep the existing `GET /me` route exactly; add the new routes under it),
  `apps/web/src/api/workout-sessions.ts` (router stub exists and is mounted), and their tests
  `apps/web/src/api/me.test.ts`, `apps/web/src/api/workout-sessions.test.ts`.
- Services: `apps/web/src/server/workout/*.ts` (+ `*.test.ts`).
- Client pages (inside `apps/web/app/[locale]/app/`; each with a `loading.tsx` beside it): `today/page.tsx` (exists as an
  empty state: replace it), `program/page.tsx`, `program/[weekId]/page.tsx` is NOT needed (use a client-side week
  selector), `workout/[sessionId]/page.tsx`, `workout/start/page.tsx` (route that creates or resumes today's session
  then redirects), `history/page.tsx`, `history/[sessionId]/page.tsx`, `history/exercise/[exerciseId]/page.tsx`,
  and `apps/web/app/[locale]/app/layout.tsx` (only to mount the two runtime components below; keep `AuthGate`, the shell
  and the Suspense as they are).
- Components: `apps/web/components/client-portal/*` (new dir; client components for the workout screen, rest timer,
  set row, history drawer, finish summary, week selector, today cards, "unsynced" badge, sync button).
- Offline: `apps/web/src/lib/outbox/*` (Dexie database `dawlyy-outbox`, queue, flush, hooks, tests for the pure parts),
  `apps/web/public/sw.js` (a hand-written service worker; **do not add Serwist or any dependency**), and
  `apps/web/components/client-portal/client-runtime.tsx` (registers the worker and starts the flusher).
- `apps/web/e2e/offline-workout.spec.ts` (the plan's Playwright offline test; Claude runs it later in P6, so write it
  against the dev login described in `apps/web/e2e/screens.spec.ts`; you cannot run it).
- `docs/qa/ios-pwa.md` (the manual iOS Safari checklist the plan asks for; plain English).
- Messages: `apps/web/messages/ar/workout.json`, `apps/web/messages/en/workout.json` (registered, currently `{}`), and
  `apps/web/messages/ar/client.json`, `apps/web/messages/en/client.json` (you own them; keep every existing key).

Other builders work at the same time: T6 owns `/app/nutrition/**` and `api/nutrition.ts`, `api/foods.ts`,
`api/meal-logs.ts`; T7 owns `/app/checkins/**`, `/app/intake/**`, `/app/assessment/**`, `api/forms.ts`,
`api/submissions.ts`. T9, T8 and T10 come later. Do not touch their files. Link to their routes as plain locale-aware
links; they may 404 until built.

## Cross-task contracts (fixed; other briefs rely on them)

- Today links: nutrition card to `/app/nutrition`; a due check-in card to `/app/checkins/<calendarEventId>`; an
  outstanding intake card to `/app/intake`; messages to `/app/messages`; water and steps cards to `/app/tracking`
  (T8, may 404). Today only reads for these cards (below); it never writes them.
- `GET /api/v1/me/program` returns the client's own published program copy (see below). T4b already wrote the program
  tables and the `ProgramDocument` shape; read `apps/web/src/server/programs/` to see how documents are stored.
- Exercise names and media come from `exercises` (readable by the client through RLS and the `clientColumns.exercises`
  map). Check `clientColumns` for what a client may select; never select a coach-internal column.

## Routes (all under `/api/v1`; authenticated; mutating routes use `idempotentReplay`)

`/me` (role `client` only for the portal routes; a coach calling them gets 403):
- `GET /me/today?date=YYYY-MM-DD`: the cards for the client's local day. The server resolves the client's timezone
  (the `clients` row or the tenant default; read how T3a/T3b store it) and the `date` default. Returns
  `{ date, workout: { state: 'none'|'planned'|'active'|'done'|'rest', sessionId?, name?, dayLabel?, exerciseCount? },
  meals: { planName?, kcalTarget?, link: true } | null, checkins: [{ eventId, title, dueAt, state }],
  intakePending: boolean, unreadMessages: number, subscription: { state, daysLeft? } }`. Workout planning: find the
  client's published program copy, compute which program day is today from `startDate` and the document, and mark
  rest days. If the copy has no `startDate`, use the first training day not yet completed. Put the day-resolution
  logic in a pure function `resolveProgramDay(doc, startDate, today, completedDayIds)` in `server/workout/` with unit
  tests (rest days, before start, after end, skipped days).
- `GET /me/program`: `{ programId, name, versionNo, document (client projection), startDate?, progress: { weeksTotal,
  currentWeekIndex } } | null`. Only the published version of the client's own copy.

`/workout-sessions`:
- `POST /` create-or-resume a session `{ clientUuid, programId, programVersionId, dayId, workoutId, localDate,
  timezone }`: upsert by `(tenant, client, clientUuid)`; copies the planned workout from the published version into
  `planned_workout`; state `not_started`. Returns the session plus `lastComparable` (from `findLastComparable`) with
  the previous sets per exercise, so the screen can show last time before logging (gap G2).
- `POST /sync`: the outbox flush. Body `{ sessions: [...], sets: [...] }` where each record carries `clientUuid` and
  `clientUpdatedAt`. One transaction: upsert sessions, then set logs. Set logs are last-write-wins by
  `clientUpdatedAt` (keep the newer row; ignore an older one; never create a duplicate for the same `clientUuid`);
  session `state` is server-authoritative and moves only through `transition('session', ...)`, an illegal move is
  ignored for that record and reported in `rejected: [{ clientUuid, reason }]`, not a 4xx for the whole batch.
  A set whose session does not exist yet is queued within the same batch; one whose session belongs to another
  client is rejected. Returns `{ accepted, rejected, serverTime }`. Do not use `ON CONFLICT` on `clients`/`payments`;
  `ON CONFLICT` on `set_logs` and `workout_sessions` by their unique client-uuid index is fine, but read doc 12.1 and the
  guard triggers first (some columns are write-once).
- `PATCH /{id}` pause, resume, notes, mood, pain note, `rpeOverall` (state changes via `transition`).
- `POST /{id}/finish` `{ outcome: 'completed'|'partially_completed'|'abandoned', endedAt, activeSeconds, ... }`:
  computes `summary` with `compareSessions` against the last comparable session (volume, reps, load, completion
  deltas, and the "not comparable" flag when the planned work differs), stores it, returns it.
- `GET /` history list for the caller (clients: own; coach: needs `clientId` and permission `clients:view`), keyset
  pagination `(local_date desc, id desc)`, `from`/`to` filters.
- `GET /{id}` one session with its sets (client projection: no coach notes).
- `GET /exercise-history/{exerciseId}`: the last 5 sessions' sets for that exercise (`exerciseHistory`), for the
  history drawer (gap G3).
Errors: 400 validation, 401, 403, 404, 409 `session_conflict`, 422 `illegal_transition`. A coach (staff/owner) may
read sessions of clients they can access; they cannot create or finish a client's session.

## Screens (client area, inside the existing client shell; 360 px first; RTL-safe; touch targets at least 44 px)

- **Today**: a vertical card list (workout with a primary "Start workout"/"Continue" button, meals, check-in due,
  intake, messages, subscription state banner when expiring). Empty and rest-day states are friendly, never blank.
- **My Program**: phase and week selector, day tabs, each day lists its blocks and exercises with planned sets; tap an
  exercise for video/cues/muscles; read-only.
- **Workout** `/app/workout/[sessionId]`: header with session timer (pause/resume), the planned blocks as a vertical
  list; each exercise shows video thumbnail, cues, planned sets as rows, "last time" values from `lastComparable`
  (gap G2), and inputs for actual reps, load (kg/lb per the client's unit preference), RPE, RIR, set tag
  (warmup/working/drop/failure/amrap/backoff from `SET_TAGS`), a pain flag and note, and Skip / Modify-substitute.
  Completing a set starts the **rest timer** (default from the plan's `restSec`) with ±15 s buttons and a vibration
  at zero when supported. An "exercise history" drawer shows the last 5 sessions (gap G3). The Finish button shows
  the summary: volume, reps, load, completion percent and deltas, the "not comparable" notice, and a congratulating
  message. Every input writes to the Dexie outbox first (instant, works offline), then the flusher syncs.
- **History**: list of finished sessions with date, name, volume, completion; detail with sets; per-exercise history
  page with a simple trend (a table plus a lightweight inline SVG sparkline written by hand, no chart dependency).
- A persistent "unsynced: N" badge with a "Sync now" button wherever the client portal shows (mount it in the
  runtime component or inside the pages; the shell is not yours).
- Everything labelled through next-intl; numbers and dates through `Intl` with the active locale.

## Offline outbox (build plan "Offline outbox (client PWA)"; iOS has no background sync)

Dexie database `dawlyy-outbox`, one per signed-in user id (name it `dawlyy-outbox-<userId>` or key every row by
`userId`); tables `sessions`, `setLogs`, `metrics` (the last one is for T8; create the table, no UI). Each record has
`clientUuid` (`crypto.randomUUID()`), `clientUpdatedAt` (ISO), `payload`, `syncState`, `attempts`. Flush on app open,
on `online`, on `visibilitychange` to visible, on a 30 s interval while visible, and on the manual button; only when
the signed-in user equals the outbox owner (compare `GET /me` userId; if different, do not flush and do not show the
other user's data). A flush sends `POST /workout-sessions/sync` with a fresh `Idempotency-Key`; success marks rows
synced; a network error keeps them and backs off; a rejected record is kept with the reason and shown in the badge.
The session screen must open and work from the outbox alone when the server is unreachable (it reads the planned
workout cached in the outbox at session creation). `public/sw.js` caches the app shell and the navigated `/app/*`
pages with a network-first strategy, never caches `/api/*` responses that carry personal data except `GET /me/program`
and `GET /me/today`, and is versioned. Register it only in production builds or when `NEXT_PUBLIC_ENABLE_SW=1`
(so `next dev` is not disturbed). Pure parts (queue ordering, merge, backoff, owner check) get Vitest unit tests with
a fake in-memory store (the Vitest environment is node; use `fake-indexeddb` only if it is already a dependency,
otherwise abstract the store behind a small interface and test the logic against an in-memory implementation).

## Tests (Claude runs them)

Pure: `resolveProgramDay`; outbox queue/merge/backoff/owner check; set-log LWW merge helper; summary mapper.
DB-backed (harness `apps/web/src/test/api-harness.ts`; read it and `apps/web/src/api/programs.test.ts`): sync twice
with the same batch creates no duplicate sets (acceptance); an older `clientUpdatedAt` does not overwrite a newer row;
a session cannot go `completed -> active`; client A cannot read, sync into, or finish client B's session (RLS); a coach
cannot create a session; `finish` stores a summary whose volume equals `sessionVolume`; `GET /me/program` returns only
the published copy and nothing from a draft; `GET /me/today` marks a rest day; a staff member with assigned scope reads
only assigned clients' history. The Playwright spec: sign in as the demo client, start a session, go offline
(`context.setOffline(true)`), log 3 sets, go online, assert exactly 3 `set_logs` rows via the history API, force a
double flush, assert still 3.

## Answer

Per the common rules. Also: the exact shape of `GET /me/today` and `GET /me/program`, the outbox record types, which
columns you found write-once or server-owned on `workout_sessions`/`set_logs`, and every message key added.
