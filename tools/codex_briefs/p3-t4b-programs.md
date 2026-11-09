# Batch P3-T4b: program builder, versions, publishing and assignment (build-plan Task 4, second half)

Build the program templates, the builder UI that edits a `ProgramDocument`, versioning (draft, review, publish), and
assigning a template to a client as a private copy. Read the build plan Task 4 and "Versioned documents", spec
section 29, doc section 12.1 (items 3, 5, 16), section 5.2 rows for `programs` and `program_versions`, section 6.1
"VERSION config" and the head rows, section 7.3 (`version_rules`, `head_rules`, `version_pointers`,
`protect_published_version`), and `packages/db/src/schema/programs.ts`. Core already holds the logic: read
`packages/core/src/program-edit` (the pure edit operations `applyProgramOp(s)`, `emptyProgram`, `validateProgram`,
`programStats`), `packages/core/src/versioning` (`publish`, `nextVersionNo`, `diffDocuments`, `summarizeDiff`) and
`packages/core/src/types` (`ProgramDocument`) before writing anything. The builder UI must apply edits only through
core ops so the server and client agree.

## Files you may write (and nothing else)

- `apps/web/src/api/programs.ts` (router; the stub exists and is mounted)
- `apps/web/src/server/programs/*.ts` (services, tests as `*.test.ts`)
- `apps/web/src/api/programs.test.ts`
- pages: `apps/web/app/[locale]/coach/programs/page.tsx`, `.../programs/loading.tsx`, `.../programs/new/page.tsx`,
  `.../programs/[programId]/page.tsx` (the builder), `.../programs/[programId]/history/page.tsx`,
  `.../programs/[programId]/assign/page.tsx` (+ `loading.tsx` beside each)
- `apps/web/components/program-builder/*` (new; client components)
- `apps/web/messages/ar/programs.json`, `apps/web/messages/en/programs.json` (currently `{}`)

Builder T4a owns the exercise library (`api/exercises.ts`, `coach/exercises/**`, `components/exercises/**`). Use its
list endpoint over HTTP for the picker: `GET /api/v1/exercises?q=&limit=&cursor=` returns
`{ items: [{ id, name, primaryMuscles, equipment, category, thumbnailUrl?, source, hidden }], nextCursor }`. Write a small
picker of your own inside `components/program-builder/` (do not import T4a's files; they may not exist when you
compile). Server-side, check exercise ids by reading the `exercises` table directly through RLS.

## Interfaces you consume

Core: `applyProgramOp`, `applyProgramOps`, `emptyProgram`, `validateProgram`, `programStats`, `findDay`
(`@dawlyy/core/program-edit`); `publish`, `nextVersionNo`, `currentPublished`, `diffDocuments`, `summarizeDiff`
(`@dawlyy/core/versioning`); `ProgramDocument` and `LocalizedText` (`@dawlyy/core/types`); `isAllowed`
(`@dawlyy/core/authz`). Tables `programs`, `programVersions`, `exercises`, `clients`, `subscriptions` (read-only, to
link a copy to the client's active subscription). `clientColumns.programs`, `.programVersions` for client-visible
projections (T5 owns `GET /me/program`; you do not build it).

## Routes (`/api/v1/programs`; mutating routes use `idempotentReplay`; lists use cursor pagination)

- `GET /`: templates and client copies; filters `kind` (`template`|`client`), `clientId`, `q` (name, Arabic-folded),
  `archived`; sort `(updated_at desc, id desc)`. Each item: head columns, `currentVersion` status and number, and
  `publishedVersionNo`. Permission `programs:view`.
- `POST /`: create a template `{ name, tags?, weeks?, trainingDays?: number[] }`. The server creates the head
  (`kind 'template'`, `client_id` null) and version 1 as `draft` with `emptyProgram(...)` (ids from `crypto.randomUUID`
  through the core `EditCtx`; read how the context is built), in one transaction; the head's `current_version_id` is
  set after (the trigger owns `published_version_id`, never write it). Permission `programs:create`.
- `GET /{id}`: head plus the draft/current version document (or the published one for read-only viewing), `programStats`
  and the issues list from `validateProgram` (with `knownExerciseIds` resolved through RLS).
- `PATCH /{id}`: rename, tags, archive/unarchive (`archived_at`). Permission `programs:edit`.
- `PUT /{id}/draft`: replace the working draft document `{ document, baseVersionNo, changeNote? }`. The server
  validates the document with the core Zod schema and `validateProgram`, and rejects with 409 `stale_draft` when
  `baseVersionNo` is not the current draft's number (optimistic concurrency, two tabs). It updates the existing draft
  row; if the current version is published, it first creates version N+1 as a new `draft` copy (a published version is
  immutable: any PATCH/PUT on a `published` or `superseded` version row is refused by the database; map that to 409
  `version_immutable`; never try to update a published row). Permission `programs:edit`.
- `POST /{id}/ops` `{ baseVersionNo, ops: ProgramOp[] }`: apply core ops to the draft server-side and save (used by the
  builder for small edits so client and server share one code path); returns the new document and `versionNo`.
- `POST /{id}/submit-review` and `/approve`: move the draft through the states of the publishing machine
  (`draft -> in_review -> approved`); only for tenants/roles the doc permits (read the `VERSION config`; solo owner may
  go `draft -> published` directly). Permission `programs:edit` for submit, `programs:publish` for approve.
- `POST /{id}/publish` `{ changeNote? }`: permission `programs:publish`. One transaction in the order of doc item 5:
  supersede the current published row, then publish the draft; the `_90_pointers` trigger updates the head. Validate with
  `validateProgram` first and refuse with 422 `program_invalid` and the issues in `details` when it has errors. A stale
  draft or a draft that equals the published document is 422 `nothing_to_publish`. Returns the published version.
- `GET /{id}/versions`: version history with `status`, `versionNo`, `changeNote`, `publishedAt`, `publishedBy` name
  (coach-facing only) and `summarizeDiff` against the previous version; `GET /{id}/versions/{versionNo}` returns one
  document; `GET /{id}/versions/{a}/diff/{b}` returns `diffDocuments` entries. Permission `programs:view`.
- `POST /{id}/revert` `{ toVersionNo, changeNote? }`: creates a NEW draft copying that version's document (never
  edits history).
- `POST /{id}/duplicate`: copy a template (new head, new version 1 draft, `name` suffixed). Permission `programs:create`.
- `POST /{id}/assign` `{ clientId, subscriptionId?, startDate?, publish?: boolean }`: permission `programs:publish` when
  `publish` is true, else `programs:edit`. Inserts a NEW head (`kind 'client'`, `client_id`, `template_id` = the
  template, `subscription_id` when given and when it belongs to that client) plus version 1 as a copy of the template's
  PUBLISHED document (422 `template_not_published` if none), `startDate` written into the copy's document. When
  `publish` is true it publishes the copy in the same transaction. The template and every other client's copy stay
  unchanged. Assigned-scope staff may assign only to clients they can access (RLS decides; test it). Re-assigning to a
  client who already has a published copy supersedes that copy's published version by a new version of the same head
  only if `replace: true`; otherwise 409 `client_has_program`.
- Client copies are edited with the same `/draft`, `/ops`, `/publish` routes on the copy's id.

## Pages (coach area, inside the existing coach shell)

- `/coach/programs`: tabs Templates and Client programs, search, cards with name, weeks, training days per week
  (`programStats`), status badge (`status.draft`, `status.published`), assigned-clients count for templates; empty state
  with a "create template" action; load more.
- `/coach/programs/new`: name, number of weeks, training weekdays, then lands in the builder.
- Builder `/coach/programs/[programId]`: phases, weeks, days as a navigable tree on `md+` and a stacked navigator on
  phones (week selector, day tabs); a day shows its workout blocks; add / reorder / remove blocks and items; per item
  the exercise picker, a set table (reps, load with unit, tempo, rest, RPE/RIR, notes), progression rule, coach note;
  supersets and circuits as block kinds; copy week, copy day, rest-day toggle (all via core ops). A sticky bar shows
  version number, status, unsaved indicator, `Save draft`, `Publish` (with a change-note dialog and the validation
  issues listed), and a read-only banner with "Create new draft" when the shown version is published. Autosave the draft
  with debounce through `/ops`; on 409 `stale_draft` show a reload prompt. No drag-and-drop dependency: use move
  up/down buttons (large targets); keyboard accessible.
- `/history`: versions list with diff summaries and a compare view (added/removed/changed paths) and a revert button.
- `/assign`: client picker (search), start date, publish-now switch, replace switch when needed; success card.
- Everything RTL-safe at 360 px; exercise names use the active locale with fallback.

## Tests (Claude runs them)

Pure: any helper you write (ctx building, payload mappers). DB-backed (harness): create template gives head + draft v1;
ops apply and return the new document; `PUT /draft` with a stale `baseVersionNo` is 409; publish supersedes the
previous published version and the head pointer follows (assert `published_version_id` via a read, never a write); PATCH
or PUT on a published version row is refused with 409 `version_immutable` (the plan's acceptance); publishing an
invalid document is 422; assign one template to clients A and B, edit A's copy and publish, assert the template and B's
copy unchanged (the plan's acceptance); assigned-scope staff cannot assign to an unassigned client; a client-role
caller gets 403 on every coach route and sees only own published copy rows through the client projection; revert makes
a new draft and leaves history intact; version history diff summary counts match `diffDocuments`.

## Answer

Per the common rules. Also: the exact core `EditCtx` you built, which publish states you allowed for the solo owner,
and every message key added.
