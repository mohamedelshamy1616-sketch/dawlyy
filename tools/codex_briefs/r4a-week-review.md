# Batch R4a: `packages/core/src/review/`, the coach's weekly review assistant without paid AI

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R4, item R4a. Read it and its "Why this build" and
"Hard limits" sections. The promise: the coach finishes a client's weekly review at least 30% faster and controls
every message and plan change. Nothing here calls a model, the network or a clock. The output is a draft for the
coach to edit and approve; it never goes to the client by itself.

## Files you may write

- `packages/core/src/review/index.ts` (barrel) and other files inside `packages/core/src/review/`
  (suggested: `types.ts`, `summary.ts`, `templates.ts`, `proposals.ts`, `canonical.ts`).
- `packages/core/test/review.test.ts`.

Nothing else. Claude adds the `./review` export to `packages/core/package.json` and `src/index.ts` itself.

## Interfaces you consume (read them; do not edit them)

- `packages/core/src/attention/` (R1a): `AttentionItem`, `AttentionReason`, `ReasonCode`.
- `packages/core/src/safety/` (R4c): `RedFlagCategory` (the database also allows `other`; accept
  `RedFlagCategory | 'other'`).
- `packages/core/src/types/`: `IsoDate`, `LocalizedText`, `Macros`, `NutritionTargets`, `NutritionDocument`.
- `packages/core/src/workout/`: `ExerciseStatus` (`improved | maintained | regressed | new | missing`).

## What to build

### 1. Input (Zod 4 schema `WeekReviewInput`, exported with its type; `.parse` at the start, let `ZodError` escape)

- `client: { id: uuid; firstName: string (1..80); goal: 'lose' | 'gain' | 'maintain' | null }`
- `coach: { firstName: string (1..80); dialect: 'egyptian' | 'gulf'; signaturePhrases: string[] (max 5, each 1..200) }`
- `period: { from: IsoDate; to: IsoDate }` (inclusive, `from <= to`, at most 14 days: refine)
- `workouts: { planned: int>=0; done: int>=0; previousPlanned: int>=0; previousDone: int>=0 }`
  (this period and the period before it)
- `exercises: { exerciseId: uuid; name: LocalizedText; status: ExerciseStatus; topLoadKg: number | null;
  previousTopLoadKg: number | null; stalledSessions: int>=0 }[]` (max 100)
- `meals: { nutritionAssigned: boolean; daysLogged: int 0..14; daysInPeriod: int 1..14; avgKcal: number | null;
  targetKcal: number | null }`
- `checkin: { current: CheckinSnapshot | null; previous: CheckinSnapshot | null }` where
  `CheckinSnapshot = { submissionId: uuid; submittedOn: IsoDate; answers: { questionId: string; label: LocalizedText;
  kind: 'number' | 'scale' | 'text' | 'choice' | 'boolean'; value: number | string | boolean | string[] | null }[] }`
- `weights: { on: IsoDate; kg: number positive }[]` (non-voided, any order, max 60)
- `measurements: { on: IsoDate; values: Record<string, number> }[]` (non-voided, any order, max 30)
- `redFlags: { id: uuid; category: RedFlagCategory | 'other'; source: 'message' | 'checkin' | 'meal_note' }[]`
  (open flags only)
- `attention: AttentionItem | null`
- `nutrition: { versionId: uuid; targets: NutritionTargets } | null` (the published plan's targets)

### 2. `weekReview(input: WeekReviewInput, opts: { locale: 'ar' | 'en' }): WeekReview`

`WeekReview` (all numbers already rounded for display: percentages whole, kg to 1 decimal, kcal to the nearest 5,
grams whole):

- `summary.adherence.workouts: { done; planned; percent | null; previousPercent | null; change: 'up' | 'down' |
  'same' | null }` (null percent when planned is 0; clamp to 100; `same` within 5 points)
- `summary.adherence.meals: { daysLogged; daysInPeriod; percent; avgKcal | null; targetKcal | null }` or `null`
  when no nutrition is assigned
- `summary.checkin: { submittedOn | null; changes: { questionId; label; kind; current; previous; change: 'up' |
  'down' | 'same' | 'changed' | 'new' | 'missing' }[] }` (number and scale compare numerically; other kinds give
  `same` or `changed`; a question only in current is `new`, only in previous is `missing`; keep the current
  snapshot's question order, then the missing ones in the previous order)
- `summary.weight: { first: {on, kg} | null; last: {on, kg} | null; deltaKg | null; kgPerWeek | null; trend:
  'down' | 'up' | 'flat' | null }` (least-squares slope over at least 3 weigh-ins spanning at least 7 days, else
  `kgPerWeek` null; `flat` when |kgPerWeek| < 0.1; with fewer weigh-ins use last minus first for `deltaKg`)
- `summary.measurements: { key; first; last; delta }[]` for keys present in both the earliest and latest sets,
  sorted by key
- `summary.prs`: the exercises with status `improved` and a `topLoadKg` above `previousTopLoadKg`
  (`{exerciseId, name, topLoadKg, previousTopLoadKg}`)
- `summary.stalls`: exercises with `stalledSessions >= 3` or status `regressed` (`{exerciseId, name, status,
  stalledSessions}`)
- `summary.redFlags`: the input flags, categories deduplicated in a stable order
- `summary.attentionReasons`: `input.attention?.reasons ?? []`
- `mustHandleFlags: boolean` (true when any open red flag exists)
- `draft: { locale; dialect: 'egyptian' | 'gulf' | null; text: string }` (see 3)
- `proposals: Proposal[]` (see 4)

### 3. The draft reply (templates, no model)

- Template sets: `ar` Egyptian, `ar` Gulf, `en` (dialect `null` for `en`). Real coaching wording: warm, short,
  specific, the way an Egyptian or Gulf coach writes on WhatsApp. No medical or diet advice beyond what the numbers
  say. All template text lives in ONE exported constant `REVIEW_TEMPLATES` so a later task can edit the copy.
- Structure, in order, each line only when its data exists: greeting with the client's first name; workouts done
  of planned (praise at 80% or more, encouragement below 50%); meals logged days; weight trend relative to the goal;
  one line naming up to 2 PRs; one line naming up to 2 stalls; a closing question about the coming week; then the
  coach's signature phrases, one per line, in input order.
- Exercise names use the locale's `LocalizedText` value with a fallback to the other locale.
- Numbers in the text use Western digits (the app's default numeral policy; the UI converts when the user chose
  Arabic-Indic).
- When `mustHandleFlags` is true the draft text MUST NOT mention the flag, pain, pregnancy, medication or eating.
  It must not contain advice about them. Instead `draft.text` stays the normal draft and `WeekReview` carries
  `mustHandleFlags: true`; the UI blocks sending until the coach handles the flags. Add a test that, for every
  category, the draft text contains none of the safety lexicon terms (`detectRedFlags(draft.text)` returns `[]`).
- The same input always gives the same text.

### 4. Rule-based plan proposals

`Proposal = { code: ProposalCode; params: Record<string, number | string>; change: NutritionChange }`, with
`NutritionChange = { kind: 'nutrition_targets'; fromVersionId: uuid; deltaKcal: number; targets: NutritionTargets }`
(the new targets, already computed).

Rules, all requiring `nutrition !== null` and `mustHandleFlags === false` (no plan change while a red flag is open):

| code | when | change |
|---|---|---|
| `lower_kcal_flat` | goal `lose`, weight trend `flat` over a span of at least 14 days, workout percent >= 80 and meal percent >= 80 | kcal -100 |
| `raise_kcal_flat` | goal `gain`, the same flat and adherence condition | kcal +100 |
| `slow_loss_too_fast` | goal `lose` and kgPerWeek <= -1.0 (losing more than 1 kg a week) | kcal +100 |

- A kcal change of `d` also changes carbs by `d / 4` grams (rounded to whole grams, floor at 0); protein and fat
  stay. The new kcal is rounded to the nearest 5 and never below 1200 (if the floor stops the change, emit no
  proposal). If `dayTypes` exists on the document, Claude applies the same delta there in R4b: export
  `applyNutritionChange(document: NutritionDocument, change: NutritionChange, currentVersionId: string):
  NutritionDocument`, a pure function that returns a new document (input untouched, validated with
  `NutritionDocument.parse`) with `targets` and both `dayTypes` targets shifted by the same delta and carbs rule
  (same rounding and 1200 floor). It throws `ReviewError` with code `proposal_version_mismatch` when
  `currentVersionId !== change.fromVersionId` (the plan was republished since the review was built).
- At most one proposal per review (the first matching rule in table order).

### 5. Canonical input for the stale-draft binding

`canonicalReviewInput(input: WeekReviewInput): string`: a deterministic JSON string with object keys sorted
recursively, arrays of weights, measurements, exercises, red flags and check-in answers sorted by a stable key, so
that the same data in any order gives the same string, and any change of a value gives a different string. R4b hashes
it with SHA-256 server-side and stores the hash in `ai_drafts.input_hash`. Do not hash in core.

### Errors

`class ReviewError extends Error { code: 'proposal_version_mismatch' | 'invalid_period' }`.

## Tests (`packages/core/test/review.test.ts`)

Table-driven, at least 40 cases, each named. Include: an empty week (nothing planned, no check-in, no weights); each
summary part on its own; check-in changes of every kind including new and missing questions; weight trend with 2
weigh-ins, unsorted weigh-ins, and each trend; PR and stall detection; each template set produces its greeting and
the client's name; signature phrases appended in order; deterministic text; the no-safety-terms test above for each
flag category; each proposal rule at and just past its thresholds; no proposal while a flag is open or without
nutrition; the 1200 kcal floor; `applyNutritionChange` with and without `dayTypes`, input not mutated, version
mismatch throws; `canonicalReviewInput` equal for shuffled arrays and keys, different for one changed value; invalid
input (period longer than 14 days) throws `ZodError`.

## Answer

Files written; every export with its signature; the template keys; every threshold you had to interpret, with your
reading; anything wrong or missing in this brief.
