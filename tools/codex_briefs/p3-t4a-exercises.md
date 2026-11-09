# Batch P3-T4a: exercise library and CSV import (build-plan Task 4, first half)

Build the exercise library (browse, search, create, customise, hide) and the CSV import. Read the build plan Task 4,
doc section 12.1 (items 2, 3, 16), section 5.2 and 6.1/6.3 rows for `exercises` and `tenant_hidden_items`, section 7
for `app.library_ref_check` and `app.exercise_thumbnail_check`, `packages/db/src/schema/programs.ts` (the `exercises`
table: `source`, `hidden`, `based_on_id`, `tenant_id` null for system rows), `packages/core/src/csv` and
`packages/core/src/text`, and the seed in `packages/db/seed/` (the system library has 210 exercises).

## Files you may write (and nothing else)

- `apps/web/src/api/exercises.ts` (router; the stub exists and is mounted)
- `apps/web/src/server/exercises/*.ts` (services, projections, import pipeline; tests as `*.test.ts`)
- `apps/web/src/api/exercises.test.ts`
- pages: `apps/web/app/[locale]/coach/exercises/page.tsx`, `.../exercises/loading.tsx`, `.../exercises/new/page.tsx`,
  `.../exercises/[exerciseId]/page.tsx`, `.../exercises/import/page.tsx` (+ `loading.tsx` beside each)
- `apps/web/components/exercises/*` (new; includes a reusable `ExercisePicker` client component that T4b may use later)
- `apps/web/messages/ar/exercises.json`, `apps/web/messages/en/exercises.json` (currently `{}`)

Builder T4b owns programs (`coach/programs/**`, `api/programs.ts`). It fetches your list endpoint over HTTP and reads
the `exercises` table directly; do not import from its files and do not create files there.

## Interfaces you consume

Core: `parseCsv`, `suggestMapping`, `mapExerciseRows`, `missingRequiredMappings`, `exerciseImportTemplate`, `toCsv`,
`EXERCISE_IMPORT_FIELDS` (`@dawlyy/core/csv`); `searchKey`, `matchScore` (`@dawlyy/core/text`); the exercise Zod
types and `LocalizedText` (`@dawlyy/core/types`). Tables `exercises`, `tenantHiddenItems`, `businessSettings`
(`exercise_categories`), `media` (thumbnail). `clientColumns.exercises` for client-visible projections (clients read
exercises through their program in T5; this task's routes are coach routes).

## Routes (`/api/v1/exercises`; mutating routes use `idempotentReplay`; lists use cursor pagination)

- `GET /`: query `q` (Arabic-folded match over name, aliases, muscles via `searchKey`/`matchScore`), `category`,
  `muscle`, `equipment`, `pattern`, `difficulty`, `source` (`system`|`coach`), `includeHidden` (default off),
  `limit`, `cursor`. Returns system rows (tenant null) plus the tenant's rows, minus items in `tenant_hidden_items`
  for this tenant unless `includeHidden`. Stable sort `(name_key asc, id asc)`; the cursor carries both. Each item
  includes `hidden: boolean` computed for this tenant and `editable: boolean` (only coach-owned rows). Permission
  `exercises:view` for staff; owners pass. This is also the endpoint T4b's picker uses: keep the item shape small
  (`id, name, primaryMuscles, equipment, category, thumbnailUrl?, source, hidden`).
- `GET /{id}`: full detail including cues, mistakes, contraindications, progressions/regressions, alternatives, tags,
  `video_url`, thumbnail. 404 when not visible.
- `POST /`: create a coach exercise (`source` is forced to `coach` by the server, `tenant_id` from auth; never from the
  body). Validate with the core Zod types; `video_url` must be an `https:` URL (reject `javascript:`, `data:`, others)
  and, if given, from a short allow-list of video hosts configurable in one constant (YouTube, Vimeo, own storage).
  Permission `exercises:create`.
- `PATCH /{id}`: coach-owned rows only (system rows give 403 `system_item_readonly`; point the client to `customise`).
  Permission `exercises:edit`.
- `POST /{id}/customise`: copy a system exercise into a coach row with `based_on_id` set (`app.library_ref_check` rules
  apply: read it), and hide the original for this tenant (`tenant_hidden_items`), in one transaction. Returns the copy.
- `POST /{id}/hide` and `POST /{id}/unhide`: insert or delete `tenant_hidden_items` rows for system exercises; for a
  coach-owned exercise set `hidden` instead. Hiding never deletes (programs may reference the exercise). Permission
  `exercises:edit`.
- `POST /{id}/archive` is NOT needed; there is no delete route (the runtime has no DELETE privilege on library rows).
- Settings of categories: `GET /categories` returns `business_settings.exercise_categories` merged with the distinct
  categories in use; `PUT /categories` (owner only) replaces the configured list.
- CSV import:
  - `GET /import/template` returns the CSV template text (`exerciseImportTemplate()`), `text/csv`.
  - `POST /import/preview` `{ csv: string (max 1 MB), mapping?: ColumnMapping }`: parse, suggest a mapping when none
    is given, report `missingRequiredMappings`, and return per-row results `{ row, status: 'ok'|'duplicate'|'error',
    errors[], normalized? }` plus counts. Duplicate detection: same `searchKey(name)` among the tenant's visible
    exercises (system and coach) or earlier in the same file. URL validation as above. Writes nothing.
  - `POST /import/commit` `{ csv, mapping, onDuplicate: 'skip'|'import_anyway' }`: re-runs the preview server-side
    (never trusts a client's preview), inserts the `ok` rows (and duplicates only when asked) in batches of 100 inside
    one transaction, caps at 2,000 rows (422 `import_too_large`), and returns `{ inserted, skipped, errors }`. Key the
    request with an `Idempotency-Key`; a replay must not insert twice (the middleware stores the response). Permission
    `exercises:create`.

## Pages (coach area, inside the existing coach shell; reuse patterns from `coach/page.tsx`)

- `/coach/exercises`: search box and category tabs (from `GET /categories`; scrollable on phones), filter sheet (muscle,
  equipment, pattern, difficulty, source), grid of cards with thumbnail, name in the active locale (fallback to the
  other), muscles, a "system" or "mine" badge and a hidden badge; empty and no-results states; load more.
- `/coach/exercises/new` and `/{id}`: one form component for create and edit (all fields of the plan, cues and
  mistakes as repeatable rows, localized name fields for ar and en); for system rows a read-only view with
  "Customise" and "Hide" buttons.
- `/coach/exercises/import`: a 4-step wizard (upload file or paste, map columns, preview with row errors, confirm),
  with the template download link and a result summary.
- `ExercisePicker`: a searchable list (debounced fetch of `GET /exercises`) with `onSelect(exercise)`; accessible, 44 px
  rows, works in a Sheet on phones.

## Tests (Claude runs them)

Pure: mapping suggestion on Arabic and English headers, URL allow-list, duplicate detection with Arabic folding, row
error reporting for a bad file. DB-backed (harness): list returns system plus tenant rows and no other tenant's rows;
hide/unhide for tenant A leaves tenant B's list unchanged; customise creates a copy with `based_on_id` and hides the
original; PATCH on a system row is 403; `source` and `tenant_id` in a create body are ignored or rejected; import
preview writes nothing; commit inserts N rows, a replay with the same `Idempotency-Key` inserts none; a file of 2,001
rows is refused; staff without `exercises:create` get 403; a client-role caller gets 403 on every coach route.

## Answer

Per the common rules. Also list message keys added and any exercise column the brief named wrongly.
