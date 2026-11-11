# Batch P4-T8: calendar, reminders, tracking, measurements, photos (build-plan Task 8)

Build the coach calendar, the calendar-event API, the due-events cron processor, the client tracking and progress
screens, measurement sets, and private progress photo sets with compare and timeline. Read build plan Task 8,
"Calendar and jobs", "Tracking", spec sections on calendar (generation, reminders), tracking cadence, measurements
and progress photos, doc section 12.1, section 5.2 rows for `calendar_events`, `metric_entries`, `measurement_sets`,
`photo_sets`, `media`, and `packages/db/src/schema/{calendar,tracking,ops}.ts`, `schema/enums.ts`.

Core already holds the logic: `packages/core/src/schedule` (cycle generation: Start Date + 7 and four per cycle,
weekly cadence config, reminder planning), `packages/core/src/state` (`transition('calendar_event'|..., from, event)`),
`packages/core/src/subscription`. Use them; do not rewrite schedule logic. Existing server code that writes events:
`apps/web/src/server/subscriptions/*` (read how it generates `calendar_events`; do not edit it).

## Files you may write (and nothing else)

- API: `apps/web/src/api/calendar.ts`, `metrics.ts`, `measurements.ts`, `photos.ts` (stubs exist, mounted), their tests
  (`*.test.ts`), and `apps/web/src/api/media.ts` plus `apps/web/src/server/storage/*` ONLY to add what OPEN_DECISIONS
  row 9 says: accept `purpose=form_answer` and video MIME types (T7's form runner uploads photos, videos and files
  through it) and `purpose=progress_photo`. Keep `payment_proof` behaviour and its tests unchanged.
- Cron: `apps/web/app/api/cron/due-events/route.ts` (secret header check from env `CRON_SECRET`; no secret set means
  403; uses `withServiceTx` with a reason string, every query filters by tenant explicitly).
- Services: `apps/web/src/server/calendar/*`, `apps/web/src/server/tracking/*` (+ `*.test.ts`).
- Components: `apps/web/components/calendar/*`, `apps/web/components/tracking/*`.
- Coach pages (each with `loading.tsx`): `apps/web/app/[locale]/coach/calendar/page.tsx` (day / week / month views,
  filters by client, event type, state), `coach/clients/[clientId]/tracking/page.tsx` (a client's entries, cadence
  config, measurements, photo timeline and compare).
- Client pages (each with `loading.tsx`): `apps/web/app/[locale]/app/tracking/page.tsx` (log weight, steps, water,
  sleep, mood and so on by the coach-configured cadence; missing-entry indicators), `app/progress/page.tsx`
  (charts-free for now: lists and deltas of weight, measurements; photo timeline; side-by-side compare of two dates).
- Messages: `apps/web/messages/{ar,en}/calendar.json` and `tracking.json` (registered, currently `{}`; you own them).

Other builders work at the same time on disjoint files: T10 coach dashboard (`api/dashboard.ts`, `api/tasks.ts`,
`app/[locale]/coach/page.tsx`), T11 settings and legal. T5, T6, T7 are committed. Do not edit their files.

## Contracts (fixed)

- Event types and the state machine are in core; reuse the exact strings. Completing an event stops its reminders
  (acceptance). A weekly weigh-in config generates no daily reminders (acceptance).
- Consent gate: before a client may create a photo set or upload `purpose=progress_photo` media, the client needs an
  active consent of kind `photos` (table `consents`: `accepted` true, `withdrawn_at` null, newest row of that kind).
  Write the check yourself in `apps/web/src/server/tracking/consent-gate.ts` (query the `consents` table; T11 owns
  recording consents and does not export a helper). Refusal is 403 `consent_required`.
- Photo and measurement data is health data: client reads use the `clientColumns` maps; coach-only columns never leak;
  media URLs are signed through the existing storage interface, never public.
- T7 uploads form-answer media through `media.ts`; keep its response shape unchanged.

## Routes (mutating routes use `idempotentReplay`; lists use cursor pagination)

`/calendar` (module `calendar`): `GET /` events by range `from`/`to`, `clientId`, `type`, `state`; `POST /` add manual
event; `PATCH /{id}` edit; `POST /{id}/skip`, `/{id}/reschedule`, `/{id}/cancel`, `/{id}/complete` (machine
transitions, 422 `illegal_transition`). Client `GET /calendar/mine` (own events, client projection).
`/metrics`: `GET /` own or a client's entries by `metricKey`, range; `POST /` log an entry (client uuid idempotency,
`source 'manual'`); `GET /cadence/{clientId}` and `PUT /cadence/{clientId}` (coach sets cadence per metric, e.g.
weigh-in weekdays). `/measurements`: sets with named values (waist, hip, chest, arm, thigh...), create, list, delta
against previous. `/photos`: photo sets (front/side/back slots) create, list, signed URLs, compare pair endpoint,
timeline, delete (soft). Errors 400, 401, 403, 404, 409, 422.

## Screens (360 px first, RTL-safe, targets at least 44 px)

Astryx for every new control (rule in the common brief). Calendar: month grid collapses to an agenda list at 360 px;
event chips use `status.*` words. Tracking: large numeric inputs, one card per metric, "missing" badge. Photo compare:
two selectable dates, stacked at 360 px and side by side from 768 px. Every route has loading and empty states.

## Tests (Claude runs them)

Pure: reminder planning wrapper, cadence-to-expected-entries, delta helpers. DB-backed (pattern of
`apps/web/src/api/programs.test.ts`): weekly cadence yields no daily reminders; completing an event cancels its
reminders; Start Date + 7 and four-per-cycle generation (assert through the existing generator); client A cannot read
client B's metrics, measurements or photos; a client without `photos` consent gets 403 `consent_required`; cron route
without the secret is 403 and with it processes due events once (second run changes nothing); media accepts
`form_answer` and `progress_photo` and still refuses unknown purposes; assigned-scope staff see only assigned clients'
events.

## Answer

Per the common rules. Also: the event type strings used, how reminders are planned and stopped, which service
transactions you used and why, and every message key group added.
