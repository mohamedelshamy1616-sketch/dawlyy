# Batch B — versioning, workout math, nutrition math

Modules: `packages/core/src/versioning/`, `packages/core/src/workout/`, `packages/core/src/nutrition/`. Tests: `packages/core/test/versioning.test.ts`, `workout.test.ts`, `nutrition.test.ts`.

## X4 — versioning (`src/versioning/index.ts`)

Spec §29: Draft → Review → Publish; published versions are immutable; an edit creates a new version. Types from `../types`: `PublishState`, `IsoDateTime`, `LocalizedText`, `ProgramDocument`, `NutritionDocument`, `FormDocument`.

```ts
export type VersionRecord<D = unknown> = {
  id: string;
  versionNo: number;
  status: PublishState;
  document: D;
  publishedAt?: IsoDateTime;
  changeNote?: string;
};

export type PublishResult<D> = {
  /** Row to insert (no id). status 'published', versionNo = max existing + 1 (1 when none). */
  newVersion: { versionNo: number; status: 'published'; document: D; publishedAt: IsoDateTime; changeNote?: string };
  /** Ids of versions that were 'published' and must become 'superseded'. */
  supersededIds: string[];
};

/** Throws VersioningError 'nothing_to_publish' when the draft document deep-equals the currently published document. */
export function publish<D>(versions: VersionRecord<D>[], draft: { document: D; changeNote?: string }, now: IsoDateTime): PublishResult<D>;

export function nextVersionNo(versions: Array<{ versionNo: number }>): number;
export function currentPublished<D>(versions: VersionRecord<D>[]): VersionRecord<D> | null;

export type DiffKind = 'added' | 'removed' | 'changed';
export type DiffEntry = {
  /** JSON-pointer-like path, arrays addressed by element id when present: phases[p1].weeks[w2].days[d3].workout.blocks[b1].items[i2].sets[2].reps */
  path: string;
  kind: DiffKind;
  label: LocalizedText;
  before?: unknown;
  after?: unknown;
};

export type DocumentFlavor = 'program' | 'nutrition' | 'form' | 'generic';

/**
 * Deep diff of two documents. Arrays whose elements have an `id` are matched by id (order changes are reported as
 * `changed` on the parent path with kind 'changed' and label "order"); other arrays are compared index by index.
 * Labels are human: segment words translated for known keys (phases المراحل, weeks الأسابيع, days الأيام, workout التمرين,
 * blocks الأقسام, items التمارين, sets المجموعات, reps العدات, load الوزن, restSec الراحة, meals الوجبات, options البدائل,
 * supplements المكملات, targets الأهداف, kcal السعرات, proteinG البروتين, carbsG الكارب, fatG الدهون, sections الأقسام,
 * questions الأسئلة, label العنوان, required إجباري), element ids replaced by the element's `name`/`label` when it has one.
 */
export function diffDocuments(before: unknown, after: unknown, opts?: { flavor?: DocumentFlavor }): DiffEntry[];

export function summarizeDiff(entries: DiffEntry[]): { added: number; removed: number; changed: number; paths: string[] };
```

Error class `VersioningError`, codes `nothing_to_publish`, `invalid_versions` (duplicate versionNo).

Acceptance tests: first publish → versionNo 1, no superseded; second publish → versionNo 2 and supersededIds = [v1.id]; publishing an unchanged document throws `nothing_to_publish`; duplicate versionNo throws `invalid_versions`; diff of a program where set 2 reps change from "8" to "10" yields one `changed` entry whose path ends in `sets[2].reps` and whose label.en contains "Reps"; adding a meal option yields one `added` entry; removing a question yields one `removed` entry; reordering items by id yields a single `changed` order entry on the parent; `summarizeDiff` counts match.

## X5 — workout (`src/workout/index.ts`)

Spec §19 (execution) and §25 (comparison with the last comparable session; Hevy/Strong-grade logging). Types from `../types`: `SessionState`, `IsoDate`, `WeightUnit`.

```ts
export type PerformedSet = {
  exerciseId: string;
  setNo: number;
  tag?: 'warmup' | 'working' | 'drop' | 'failure' | 'backoff' | 'amrap';
  reps?: number;
  load?: number;
  loadUnit?: WeightUnit;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  skipped: boolean;
};

export type SessionRecord = {
  id: string;
  workoutId?: string;
  localDate: IsoDate;
  state: SessionState;
  sets: PerformedSet[];
  activeSeconds?: number;
  /** Sets the plan asked for; used for completion %. */
  plannedSetCount?: number;
};

export type ExerciseTotals = { volume: number; reps: number; sets: number; completedSets: number; topLoad: number; est1RM: number };
export type SessionTotals = { volume: number; reps: number; sets: number; completedSets: number; byExercise: Record<string, ExerciseTotals> };

export const KG_PER_LB = 0.45359237;
export function convertLoad(value: number, from: WeightUnit, to: WeightUnit): number; // rounded to 2 decimals
/** Epley: load × (1 + reps/30). reps ≤ 0 → 0; reps 1 → load. */
export function estimate1RM(load: number, reps: number): number;
/** Warm-up sets and skipped sets are excluded from volume; volume = Σ load × reps in `unit`; duration/distance-only sets add 0 volume but count as sets. */
export function sessionVolume(sets: PerformedSet[], unit: WeightUnit): SessionTotals;
export function completionPct(session: SessionRecord): number; // completed non-warmup sets / plannedSetCount (or sets.length when plannedSetCount missing) × 100, rounded to whole percent

export type Delta = { current: number; previous: number | null; delta: number | null; pct: number | null };
export type ExerciseStatus = 'improved' | 'maintained' | 'regressed' | 'new' | 'missing';
export type Comparison = {
  comparable: boolean;
  reasons: Array<'no_previous' | 'different_workout' | 'previous_not_completed' | 'exercise_set_mismatch'>;
  volume: Delta;
  reps: Delta;
  topLoad: Delta;
  completionPct: Delta;
  durationSec: Delta;
  exercises: Array<{ exerciseId: string; volume: Delta; reps: Delta; topLoad: Delta; est1RM: Delta; status: ExerciseStatus }>;
};

/**
 * comparable = previous exists, same workoutId, previous.state in completed|partially_completed, and at least 50 % of
 * current exercises also appear in previous (else 'exercise_set_mismatch'). Deltas are still computed when not comparable
 * so the UI can show them greyed out. Exercise status: improved when est1RM or volume up > 2 %, regressed when down > 2 %,
 * else maintained; new when absent before; missing when present before only.
 */
export function compareSessions(current: SessionRecord, previous: SessionRecord | null, opts?: { unit?: WeightUnit }): Comparison;

/** Most recent session before current.localDate with the same workoutId and state completed|partially_completed. */
export function findLastComparable(current: SessionRecord, history: SessionRecord[]): SessionRecord | null;

/** Per-exercise history for the drawer: last `limit` sessions that contain the exercise, newest first, with their sets. */
export function exerciseHistory(exerciseId: string, history: SessionRecord[], limit?: number): Array<{ sessionId: string; localDate: IsoDate; sets: PerformedSet[]; totals: ExerciseTotals }>;
```

Error class `WorkoutError`, code `invalid_unit`.

Acceptance tests: estimate1RM(100, 1) = 100; estimate1RM(100, 10) ≈ 133.33; warm-up sets excluded from volume; lb sets converted when unit is kg; completionPct 3 of 4 planned → 75; compareSessions with no previous → comparable false, reasons ['no_previous'], deltas with previous null; comparable pair where volume rises 10 % → comparable true, exercises[0].status 'improved', volume.pct ≈ 10; previous abandoned → 'previous_not_completed'; findLastComparable skips a later-dated session and a different workout; exerciseHistory returns newest first and respects limit.

## X6 — nutrition (`src/nutrition/index.ts`)

Spec §15 (macros live while building, multiple options, household measures with approximate badge, substitutions) and §45 (household measures). Types from `../types`: `Macros`, `Measure`, `MeasureKind`, `HouseholdMeasure`, `RawOrCooked`, `MealItem`, `NutritionDocument`, `NutritionTargets`, `FoodSeed`.

```ts
export type FoodLike = {
  id: string;
  per100: Macros;              // per 100 g (or 100 ml for liquids)
  measures: HouseholdMeasure[]; // food-specific household measures
  rawOrCooked?: RawOrCooked;
  cookedYield?: number;         // cooked grams per 1 g raw, e.g. rice 2.8, chicken breast 0.7
};

export const DEFAULT_MEASURE_GRAMS: Readonly<Record<Exclude<MeasureKind, 'g' | 'ml' | 'custom'>, number>>;
// piece 100, cup 240, tbsp 15, tsp 5, slice 30, can 400, loaf 90 — generic fallbacks, always approx

export function round1(n: number): number;
export function scaleMacros(m: Macros, factor: number): Macros;      // rounded to 1 decimal
export function addMacros(...ms: Macros[]): Macros;
export function macrosForGrams(food: FoodLike, grams: number): Macros;

/**
 * Resolve a quantity to grams. g/ml exact (approx false). Other kinds: first a food measure matching kind (+label for
 * custom, + rawOrCooked when given), approx false; else DEFAULT_MEASURE_GRAMS with approx true and an `assumption`
 * text such as "1 cup ≈ 240 g"; custom with no matching food measure → throw NutritionError 'measure_unknown'.
 */
export function convertMeasure(food: FoodLike, quantity: number, measure: Measure, opts?: { rawOrCooked?: RawOrCooked }): { grams: number; approx: boolean; assumption?: string };

export function rawToCooked(food: FoodLike, gramsRaw: number): number;   // uses cookedYield, throws 'no_yield' when missing
export function cookedToRaw(food: FoodLike, gramsCooked: number): number;

export function itemMacros(food: FoodLike, item: MealItem): { macros: Macros; grams: number; approx: boolean };

export type PlanMacros = {
  total: Macros;                                   // default choice: first option of every meal
  perMeal: Array<{ mealId: string; chosenOptionId: string; options: Array<{ optionId: string; macros: Macros; approx: boolean }> }>;
  missingFoods: string[];                          // food ids not found in `foods`
};
export function sumMacros(doc: NutritionDocument, foods: ReadonlyMap<string, FoodLike>, opts?: { choose?: Record<string, string> }): PlanMacros;

export type Deviation = { kcalPct: number; proteinPct: number; carbsPct: number; fatPct: number };
/**
 * Grams of `to` that match `grams` of `from` on `rule` (protein | carbs | fat | kcal); reports the deviation of the other
 * macros in percent and whether every deviation is within tolerancePct (default 15). Throws 'zero_macro' when `to` has 0 of the rule macro.
 */
export function equivalentQuantity(from: FoodLike, to: FoodLike, grams: number, rule: 'protein' | 'carbs' | 'fat' | 'kcal', tolerancePct?: number): { grams: number; macros: Macros; deviation: Deviation; withinTolerance: boolean };

export function targetsDelta(targets: NutritionTargets, actual: Macros): { kcal: number; proteinG: number; carbsG: number; fatG: number; pct: Deviation };

/** Flags for the "reuse a plan from another client" conflict check (spec §15): allergens present in the plan, kcal mismatch > 10 %, protein below 1.2 g/kg when bodyweight is given. */
export function planConflicts(doc: NutritionDocument, profile: { allergies?: string[]; weightKg?: number; targets?: NutritionTargets }): Array<{ code: 'allergen' | 'kcal_mismatch' | 'protein_low'; detail: string }>;
```

Error class `NutritionError`, codes `measure_unknown`, `no_yield`, `zero_macro`.

Acceptance tests: 150 g chicken breast (per100 165/31/0/3.6) → 247.5 kcal, 46.5 g protein; 1 cup cooked rice with a food measure {cup → 160 g} → exact, approx false; 1 cup of a food without a cup measure → 240 g, approx true, assumption text present; custom measure with no match throws `measure_unknown`; `rawToCooked` with cookedYield 2.8 on 100 g → 280; `sumMacros` default picks first options and totals match hand-computed numbers; `choose` switches an option and changes the total; missingFoods lists unknown ids; `equivalentQuantity` chicken→eggs on protein returns grams within 1 % of the hand-computed value and flags fat deviation outside 15 %; `planConflicts` flags an allergen present in a meal item (match on food id list passed through `profile.allergies` as food ids or tags — document your choice in the answer).
