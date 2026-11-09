# Batch P4-T7: forms engine, intake, check-ins, assessments (build-plan Task 7)

Build one form builder and one form runner for `FormDocument`, used for intake forms, check-in templates and
assessment templates; the coach actions (send, skip, mark known, customise for one client); the client screens to fill
them; the check-in review queue; and assessment results with coach review. Read build plan Task 7, "Versioned
documents" and `FormDocument`, "States" (check-in machine), spec sections 12 (intake), 17 (check-ins), 18
(assessments), doc section 12.1, section 5.2 rows for `forms`, `form_versions`, `form_submissions`, `calendar_events`,
section 6.1 "VERSION config", section 7 (`version_rules`, `head_rules`, `version_pointers`), and
`packages/db/src/schema/forms.ts`, `schema/calendar.ts`, `schema/enums.ts` (`formKind`, `checkinState`). Row G9 of
`docs/product/COMPETITOR_GAPS.md` is partly yours: a client submits a check-in with photos and measurements and the
coach sees it in the review queue.

Core already holds the logic: read `packages/core/src/forms` (`evaluateVisibility`, `validateAnswers`,
`validateDocument`, `completion`, `metricAnswers`, `questionsById`), `packages/core/src/state`
(`transition('checkin', from, event)`, `eventsFrom`), `packages/core/src/versioning`, `packages/core/src/types`
(`FormDocument`, `Question`, `Answers`) and `packages/core/src/authz` (modules `forms`, `checkins`, `assessments`).
Use them; the runner must hide questions with `evaluateVisibility` and a hidden required question is not required (the
plan's acceptance). Follow the shape T4b used for versioned documents: `apps/web/src/api/programs.ts`,
`apps/web/src/server/programs/*`, `apps/web/components/program-builder/*`, `apps/web/app/[locale]/coach/programs/**`
(reuse the pattern; do not import those files).

## Files you may write (and nothing else)

- API: `apps/web/src/api/forms.ts`, `apps/web/src/api/submissions.ts` (stubs exist and are mounted) and tests
  `forms.test.ts`, `submissions.test.ts`.
- Services: `apps/web/src/server/forms/*.ts` (+ `*.test.ts`).
- Components: `apps/web/components/form-builder/*` and `apps/web/components/form-runner/*` (new dirs; the runner is a
  client component with local draft autosave to `localStorage` per submission id).
- Coach pages (inside `apps/web/app/[locale]/coach/`, each with `loading.tsx`): `intake/page.tsx` (templates),
  `intake/[formId]/page.tsx` (builder), `checkins/page.tsx` (hub: Review queue tab and Templates tab, links to intake
  and assessments), `checkins/[formId]/page.tsx` (template builder), `checkins/review/[submissionId]/page.tsx`,
  `assessments/page.tsx`, `assessments/[formId]/page.tsx` (template builder), `assessments/review/[submissionId]/page.tsx`.
- Client pages (inside `apps/web/app/[locale]/app/`, each with `loading.tsx`): `intake/page.tsx`,
  `checkins/page.tsx` (list: due, upcoming, past), `checkins/[eventId]/page.tsx` (runner for a calendar event),
  `assessment/page.tsx` (list) and `assessment/[eventId]/page.tsx` (runner).
- Messages: `apps/web/messages/ar/forms.json` and `apps/web/messages/en/forms.json` (registered, currently `{}`; you own
  them; coach and client strings grouped by screen).

Other builders work at the same time: T5 owns `/app/today`, `/app/program`, `/app/workout/**`, `/app/history/**`,
`api/me.ts`, `api/workout-sessions.ts`; T6 owns nutrition and foods. T8 (later) owns the calendar API and media
upload UI. The upload API for photos and videos already exists: read `apps/web/src/api/media.ts` and
`apps/web/src/server/storage/*`; use it over HTTP from the runner for `photo`, `video` and `file` questions (an
answer stores the media id). Do not edit those files.

## Cross-task contracts (fixed)

- Client check-in route: `/app/checkins/<calendarEventId>`; Today (T5) links there for a due `checkin` event. The
  calendar event types are `checkin`, `assessment` and `intake` (read `packages/core/src/schedule` and
  `apps/web/src/server/subscriptions/` for the exact `type` strings and how events carry the form: the event `payload`
  holds `formId`, read how the schedule generator writes it; if no form is attached use the tenant's default template
  of that kind, `forms.is_default`).
- Intake route: `/app/intake`. Intake is per client, not per event: one submission per client and intake form
  version (a repeat edit creates a new draft version of that submission only while the coach has not marked it
  reviewed).

## Routes (mutating routes use `idempotentReplay`; lists use cursor pagination)

`/forms` (modules `forms`, `checkins`, `assessments` by `formKind`; owners always pass):
- `GET /` list templates and client copies filtered by `kind` (`template`|`client`), `formKind`
  (`intake`|`checkin`|`assessment`), `clientId`, `q`, `archived`; items carry head columns, current status and
  published version number. `POST /` create a template `{ name, formKind, tags? }` with version 1 draft (an empty
  `FormDocument` with one section). `GET /{id}` head plus draft/current document and `validateDocument` issues.
  `PATCH /{id}` rename/archive/set default (`is_default`, one default per kind).
- `PUT /{id}/draft` `{ document, baseVersionNo, changeNote? }` (409 `stale_draft`; edits to a published version create
  N+1 as a new draft; a published or superseded row is immutable, map the database refusal to 409
  `version_immutable`). `POST /{id}/publish` (supersede then publish in one transaction in the order of doc item 5;
  422 `form_invalid` with `validateDocument` issues; 422 `nothing_to_publish`). `GET /{id}/versions`,
  `GET /{id}/versions/{n}`, `POST /{id}/revert`, `POST /{id}/duplicate`.
- Coach actions per client: `POST /{id}/customize` `{ clientId }` creates a client copy (`kind 'client'`, version 1
  copied from the published template) so one client's questions can change without touching the template.
  `POST /send` `{ clientId, formId, dueAt?, formKind }` creates the calendar event (`source 'manual'`; in a service
  transaction only if the table's runtime policy forbids it for staff: read doc section 5.2 and
  `schema/calendar.ts` first, filter by tenant, reason string `forms.send`). `POST /skip` `{ eventId, reason }` marks
  an event skipped through `transition('checkin', ...)`. `POST /mark-known` `{ clientId, formId, answers }` records
  known answers as a coach-entered submission for intake (so the client is not asked again).
- Client reads: `GET /forms/for-client/{eventId}` returns the form version to render (the version pinned on the event
  or the current published one; client projection; never coach-only fields), already-saved answers and the
  visibility result.
`/submissions`:
- `GET /` coach review queue: `state` (default `waiting_for_coach`), `formKind`, `clientId`, keyset `(submitted_at
  desc, id desc)`; permission `checkins:view` or `assessments:view`. `GET /{id}` one submission with the form version
  document and answers (coach).
- `PUT /{id}/answers` (client, own): save partial answers (draft, state stays `due`/`overdue`/`scheduled->due`),
  recompute `missing_required` with `validateAnswers` + `evaluateVisibility` (hidden questions are never required).
  Upsert by `(tenant, client, clientUuid)`. Server-owned columns never come from the body.
- `POST /{id}/submit` (client, own): requires no missing required fields (422 `missing_required` with the question ids),
  stores `form_version_id` (the pinned version, never the latest), moves state through `transition('checkin', ...)`
  to `submitted` then `waiting_for_coach`, completes the calendar event, copies metric answers
  (`metricAnswers`) into `metric_entries` (e.g. weight) through a service function that inserts with source
  `manual`, and returns the submission. Editing the template afterwards never changes the stored version.
- `POST /{id}/review` (coach with `checkins:review` or `assessments:review`): `{ coachFeedback?, results?, outcome:
  'reviewed'|'needs_resubmission' }` moves `waiting_for_coach -> reviewed` via the machine; `results` holds per-test
  scores for assessments; the client sees `coachFeedback` only.
- Idempotency: submitting twice with the same `Idempotency-Key` returns the first response; a second submit of an
  already submitted submission is 409 `already_submitted`.
Errors: 400, 401, 403, 404, 409, 422 as in the plan.

## Screens (360 px first, RTL-safe, touch targets at least 44 px)

- **Builder** (shared component): sections and questions tree; add/remove/move up-down (no drag-and-drop dependency);
  per question: type selector (the 12 types), label (ar/en), help, required, options editor, scale min/max, and a
  `visibleIf` editor (pick a question earlier in the form, operator, value) that shows a plain-language summary; a
  preview pane rendering the runner; the version sticky bar as in the program builder (status, unsaved indicator,
  Publish with change note and issues list, read-only banner with "Create new draft").
- **Runner** (shared component): one section per step on phones with a progress bar from `completion`, questions
  appear and disappear live through `evaluateVisibility`, per-type inputs (scale as large buttons, yes/no toggles,
  photo/video/file pickers calling the media API, date/time pickers), inline error text, "Save and continue later",
  "Submit". Arabic and English labels follow the active locale with fallback.
- **Coach hub `/coach/checkins`**: Review queue (cards: client, form, submitted time, flags such as missing
  photos), Templates tab, "Send check-in" action. **Review page**: answers rendered read-only in the form's order
  with media thumbnails, feedback box, Reviewed / Ask to resubmit buttons, and for assessments a results table with
  per-test score fields. Intake and assessment hubs are similar and simpler.
- **Client**: `/app/checkins` lists due (primary button), upcoming and past with status words from `status.*` (fixed
  vocabulary: Due, Overdue, Waiting for Coach, Reviewed...); `/app/intake` and `/app/assessment` likewise.
- Every route has a loading and an empty state.

## Tests (Claude runs them)

Pure: the answer-to-metric mapper, the visibility summary text builder, the draft validator wrapper, the cursor helper.
DB-backed (harness `apps/web/src/test/api-harness.ts`; copy the pattern of `apps/web/src/api/programs.test.ts`):
create template, edit draft, publish (supersede and pointer); publish an invalid form is 422; **edit the template
after a submission and the submission's `form_version_id` is unchanged and still resolves the old document** (plan
acceptance); **a question hidden by `visibleIf` that is `required` does not block submit** (plan acceptance); a missing
required visible question blocks submit with 422; submit moves `due -> submitted -> waiting_for_coach` and completes the
event; double submit is 409 or an idempotent replay; client A cannot read, answer or submit client B's submission
(RLS); a client cannot call coach routes (403); review moves `waiting_for_coach -> reviewed` and the client sees the
feedback; assigned-scope staff review only assigned clients' submissions; `mark-known` records a coach-entered intake;
`customize` makes a private copy and leaves the template unchanged; weight answers create a `metric_entries` row.

## Answer

Per the common rules. Also: how you found the form for a calendar event, which service transactions you used and why,
the metric keys mapped from answers, and every message key group added.
