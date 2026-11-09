# Batch P4-T6: nutrition builder, foods, supplements, client nutrition (build-plan Task 6)

Build the food library screens, the nutrition plan builder (a versioned `NutritionDocument`), reuse of a plan for
another client with conflict flags, and the client's nutrition screen (choose an option per meal, log meals, water,
supplements). Egyptian and Gulf foods, household measures (cup, spoon, piece, loaf) next to grams, in Arabic and
English. Read build plan Task 6, "Versioned documents" and `NutritionDocument`, spec sections on nutrition, doc
section 12.1, section 5.2 rows for `foods`, `nutrition_plans`, `nutrition_plan_versions`, `meal_logs`,
`supplement_logs`, section 6.1 "VERSION config", section 7 (`version_rules`, `head_rules`, `version_pointers`,
`protect_published_version`) and `packages/db/src/schema/nutrition.ts`. `docs/product/COMPETITOR_GAPS.md` row G5 is
yours: the foods seed loads with Arabic names and household measures, and a diet total equals the per-measure sums.

Core already holds the logic: read `packages/core/src/nutrition` (`macrosForGrams`, `convertMeasure`, `itemMacros`,
`sumMacros`, `targetsDelta`, `equivalentQuantity`, `planConflicts`, `rawToCooked`, `cookedToRaw`, `scaleMacros`,
`addMacros`, `FoodLike`), `packages/core/src/versioning` (`publish`, `nextVersionNo`, `diffDocuments`, `summarizeDiff`),
`packages/core/src/types` (`NutritionDocument`, `MealItem`, `Macros`, `HouseholdMeasure`), `packages/core/src/text`
(Arabic folding for search) and `packages/core/src/authz`. Totals shown on screen MUST come from these functions (the
plan's acceptance: macro totals equal the core computation; substitution returns equivalent grams within tolerance).
Study how T4b built the versioned-document routes and builder and follow the same shape:
`apps/web/src/api/programs.ts`, `apps/web/src/server/programs/*`, `apps/web/components/program-builder/*`,
`apps/web/app/[locale]/coach/programs/**`, `apps/web/messages/en/programs.json`. Reuse the pattern, not the files
(do not import from them; copy what you need into your own directories).

## Files you may write (and nothing else)

- API: `apps/web/src/api/nutrition.ts`, `apps/web/src/api/foods.ts`, `apps/web/src/api/meal-logs.ts` (stubs exist and
  are mounted) and tests `nutrition.test.ts`, `foods.test.ts`, `meal-logs.test.ts` beside them.
- Services: `apps/web/src/server/nutrition/*.ts` (+ `*.test.ts`).
- Coach pages (inside `apps/web/app/[locale]/coach/`, each with `loading.tsx`): `nutrition/page.tsx` (plans list),
  `nutrition/new/page.tsx`, `nutrition/[planId]/page.tsx` (builder), `nutrition/[planId]/history/page.tsx`,
  `nutrition/[planId]/assign/page.tsx`, `foods/page.tsx` (library), `foods/new/page.tsx`, `foods/[foodId]/page.tsx`.
- Client pages (inside `apps/web/app/[locale]/app/`, with `loading.tsx`): `nutrition/page.tsx` (today's meals),
  `nutrition/log/page.tsx` (free-text or photo-less quick entry), `nutrition/history/page.tsx`.
- Components: `apps/web/components/nutrition/*` (new dir: diet builder, meal/option editor, food picker with Arabic-folded
  search, measure selector, macro bar, supplement list, client meal card, water counter, conflict list).
- Messages: `apps/web/messages/ar/nutrition.json` and `apps/web/messages/en/nutrition.json` (registered, currently
  `{}`; you own them; the namespace holds coach and client strings, grouped by screen).

Other builders work at the same time: T5 owns `/app/today`, `/app/program`, `/app/workout/**`, `/app/history/**`,
`api/me.ts`, `api/workout-sessions.ts`; T7 owns forms. T8 (later) owns the `metrics` router. Do not touch their files.
Today (T5) links to `/app/nutrition`; make that route work as the client's meal screen.

## Interfaces you consume

Tables: `foods` (system rows have `tenant_id` null and are readable by everyone in the tenant; a tenant may add
rows and may hide system rows through `tenant_hidden_items`, read how T4a did that for exercises in
`apps/web/src/server/exercises/*`), `nutritionPlans`, `nutritionPlanVersions`, `mealLogs`, `supplementLogs`,
`metricEntries` (water), `clients` (allergies are in the client profile JSON: read `schema/clients.ts`),
`subscriptions` (read-only, to link a copy). Client-visible projections: `clientColumns.nutritionPlans`,
`.nutritionPlanVersions`, `.foods` (use them for every client-facing select). Seed: `packages/db/seed/foods/*.json`
(300 foods; read the shape and how `packages/db/seed/load.ts` loads them; you do not edit the seed).

## Routes (mutating routes use `idempotentReplay`; lists use cursor pagination)

`/foods` (permission module `foods`: view/edit; clients may read via the picker endpoint only):
- `GET /` list/search `q` (Arabic-folded name and aliases), `category`, `source`, `includeHidden`; items carry
  `{ id, slug, name, category, per100, rawOrCooked, measures, source, brand, hidden, isSystem }`. Sort
  `(name folded asc, id)`; keyset cursor. Clients (role `client`) get the same list shape through `clientColumns.foods`
  but only for foods referenced by their published plan (`GET /foods/by-ids?ids=` accepts up to 100 ids).
- `POST /` create a tenant food (source `coach`), `PATCH /{id}` edit a tenant food, `POST /{id}/clone` copy a system
  food into the tenant to customise it (sets `based_on_id`), `POST /{id}/hide` and `/unhide` (system foods via the
  hidden-items table). System foods are never edited.
`/nutrition` (module `nutrition`: view/create/edit/publish/manage as in `packages/core/src/authz`):
- `GET /` list templates and client copies (`kind`, `clientId`, `q`, `archived`), items with current status and
  published version number; `POST /` create a template `{ name, tags?, targets? }` with version 1 draft (an empty
  `NutritionDocument` with sensible targets); `GET /{id}` head plus the draft/current document, live `sumMacros`
  totals, per-meal totals and `targetsDelta`; `PATCH /{id}` rename, tags, archive.
- `PUT /{id}/draft` `{ document, baseVersionNo, changeNote? }` with optimistic concurrency (409 `stale_draft`);
  validate with the core Zod schema; edits to a published version create version N+1 as a new draft (a published row
  is immutable: map the database refusal to 409 `version_immutable`).
- `POST /{id}/publish` `{ changeNote? }` (permission `nutrition:publish`; supersede the current published row, then
  publish the draft in one transaction in the order of doc item 5; 422 `nothing_to_publish` when equal, 422
  `plan_invalid` when macro targets are missing or an item references an unknown or hidden food).
- `GET /{id}/versions`, `GET /{id}/versions/{versionNo}`, `GET /{id}/versions/{a}/diff/{b}`, `POST /{id}/revert`
  (new draft from an old version), `POST /{id}/duplicate`.
- `POST /{id}/assign` `{ clientId, subscriptionId?, publish?: boolean, replace?: boolean }`: copy the template's
  published document into a new client head (`kind 'client'`) as in T4b; 422 `template_not_published`; 409
  `client_has_plan` unless `replace`.
- `POST /reuse-check` `{ planId, clientId }`: runs `planConflicts` against the target client's profile (allergies,
  weight, targets) and returns the conflict flags (allergy, schedule, macro mismatch) without writing anything.
- `POST /substitute` `{ foodId, toFoodId, grams, rule }`: calls `equivalentQuantity`; returns equivalent grams within
  the tolerance (used by the builder's "swap food" action and by the client).
- `GET /me`: the client's own published plan version (client projection) with the foods it needs, today's day type
  (training or rest from the program, default training if unknown), and the meals with options. Role `client` only.
`/meal-logs` (client writes own; coach reads accessible clients; idempotent by `clientUuid`):
- `POST /` `{ clientUuid, localDate, mealId, optionId?, status 'eaten'|'skipped'|'partial', freeEntry?, note?,
  clientUpdatedAt }` upsert by `(tenant, client, clientUuid)`; `GET /?date=` own logs for a day (coach: needs
  `clientId` and `nutrition:view`); `POST /supplements` log a supplement taken or skipped (`supplement_logs`);
  `POST /water` `{ clientUuid, amountMl, localDate }` inserts a `metric_entries` row with metric `water` (insert only;
  read the metric key rules in `schema/tracking.ts`; the metrics router belongs to T8, you write through your own
  service). Same guard rules as other client writes: server-owned columns never come from the body.
Errors: 400, 401, 403, 404, 409, 422 as in the plan. Assigned-scope staff reach only assigned clients' plans (RLS).

## Screens (360 px first, RTL-safe, touch targets at least 44 px, Arabic names with English fallback)

- **Coach `/coach/nutrition`**: Templates and Client plans tabs, search, cards with name, kcal target, status badge,
  assigned-clients count; empty state with "create template".
- **Builder `/coach/nutrition/[planId]`**: targets (kcal, protein, carbs, fat, water, steps; optional training and rest
  day targets), meals list with name and time hint, several options per meal, items with a food picker (Arabic-folded
  search over system plus tenant foods, category chips), quantity plus measure selector (g, ml, piece, cup, tbsp, tsp,
  slice, can, loaf, custom label) with an "approximate" badge when `approx`, raw/cooked toggle for foods that have a
  counterpart, per-option and per-meal macros and a sticky totals bar with deltas to the targets (all from core),
  supplements grouped by timing, free-meal rule, instructions, "swap food" (uses `/substitute`), move up/down buttons
  instead of drag-and-drop, autosave with debounce, a sticky bar (version, status, unsaved indicator, Publish with a
  change-note dialog and the validation issues), a read-only banner with "Create new draft" when the shown version is
  published. Reuse flow in `/assign`: pick a client, show the conflict flags from `/reuse-check`, start date, publish now.
- **Coach `/coach/foods`**: library table/cards with search and category chips, macros per 100 g and household
  measures, "customise" (clone), hide/unhide, create food form (name ar/en, category, per-100 macros, measures list).
- **Client `/app/nutrition`**: today's meals; choose one option per meal; mark eaten/skipped/partial; household
  measure shown beside grams; running totals against targets; supplements checklist by timing (taken/skipped); a water
  counter with quick-add buttons (250 ml, 500 ml); a quick free-text entry for an off-plan meal. Writes are sent
  with client UUIDs so a repeat does not duplicate; if the browser is offline show a clear "saved on this phone,
  will sync" message and retry on reconnect (a tiny in-page retry queue in `components/nutrition/`; the shared outbox
  belongs to T5 and may not exist, do not import it).
- Every route has a loading and an empty state (no blank page).

## Tests (Claude runs them)

Pure: the document-to-totals mapper (totals equal `sumMacros`/`itemMacros` for the Egyptian sample foods in the
seed), measure conversion, the draft validator, the food search ranking helper. DB-backed (harness
`apps/web/src/test/api-harness.ts`; copy the pattern of `apps/web/src/api/programs.test.ts`): create template gives
head and draft v1; stale draft is 409; publish supersedes and the head pointer follows; a PUT on a published version is
refused (`version_immutable`); assign template to clients A and B, edit A's copy, template and B unchanged; client A
cannot read client B's plan or meal logs (RLS); a client cannot call coach routes (403); meal-log upsert twice with the
same `clientUuid` yields one row; a system food cannot be edited, a clone can; hidden system foods vanish from the
tenant list; `/substitute` returns grams within tolerance; the seed loads at least 300 foods with Arabic names and
non-empty measures (a read-only count query); a diet total equals the sum of per-measure item totals (gap G5).

## Answer

Per the common rules. Also: the routes' response shapes for `GET /nutrition/me` and `GET /foods`, how hidden system
foods are stored, which `metric_entries` columns water needs, and every message key group added.
