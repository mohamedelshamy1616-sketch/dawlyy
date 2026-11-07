import { z } from 'zod';
import { Id, LocalizedText, Macros, Measure } from './common';

/** Spec §15 (nutrition/diet builder) and §16 (supplements). */

export const RAW_COOKED = ['raw', 'cooked'] as const;
export const RawOrCooked = z.enum(RAW_COOKED);
export type RawOrCooked = z.infer<typeof RawOrCooked>;

export const NutritionTargets = Macros.extend({
  waterMl: z.number().nonnegative().optional(),
  steps: z.number().int().nonnegative().optional(),
});
export type NutritionTargets = z.infer<typeof NutritionTargets>;

export const MealItem = z.object({
  id: Id,
  foodId: Id,
  quantity: z.number().positive(),
  measure: Measure,
  rawOrCooked: RawOrCooked.optional(),
  /** True when the measure is a household estimate rather than a weighed amount. */
  approx: z.boolean().default(false),
  /** Grams the quantity resolves to; computed by core, stored for display. */
  grams: z.number().positive().optional(),
  note: LocalizedText.optional(),
});
export type MealItem = z.infer<typeof MealItem>;

export const MealOption = z.object({
  id: Id,
  name: LocalizedText.optional(),
  items: z.array(MealItem).min(1),
  /** Computed by `sumMacros`; stored for display and diff. */
  macros: Macros.optional(),
});
export type MealOption = z.infer<typeof MealOption>;

export const Meal = z.object({
  id: Id,
  name: LocalizedText,
  /** e.g. "08:00" or "بعد التمرين" */
  timeHint: LocalizedText.optional(),
  options: z.array(MealOption).min(1),
});
export type Meal = z.infer<typeof Meal>;

export const SUPPLEMENT_TIMINGS = ['with_meal', 'before_sleep', 'during_training', 'pre_workout', 'post_workout', 'wake_up', 'custom'] as const;
export const SupplementTiming = z.enum(SUPPLEMENT_TIMINGS);

export const Supplement = z.object({
  id: Id,
  name: LocalizedText,
  dose: z.number().positive(),
  unit: z.string().min(1).max(16),
  timing: SupplementTiming,
  mealId: Id.optional(),
  note: LocalizedText.optional(),
});
export type Supplement = z.infer<typeof Supplement>;

export const FreeMealRule = z.object({
  perWeek: z.number().int().nonnegative(),
  note: LocalizedText.optional(),
});

/** The immutable payload stored in `nutrition_plan_versions.document`. */
export const NutritionDocument = z.object({
  schemaVersion: z.literal(1).default(1),
  targets: NutritionTargets,
  /** Optional different targets for training vs rest days. */
  dayTypes: z
    .object({
      training: NutritionTargets,
      rest: NutritionTargets,
    })
    .optional(),
  meals: z.array(Meal).min(1),
  supplements: z.array(Supplement).default([]),
  freeMealRule: FreeMealRule.optional(),
  instructions: LocalizedText.optional(),
  allergens: z.array(z.string()).default([]),
});
export type NutritionDocument = z.infer<typeof NutritionDocument>;

/** Household measure definition for a food, e.g. one cup of cooked rice = 160 g. */
export const HouseholdMeasure = z.object({
  measure: Measure,
  grams: z.number().positive(),
  rawOrCooked: RawOrCooked.optional(),
});
export type HouseholdMeasure = z.infer<typeof HouseholdMeasure>;

export const FOOD_SOURCES = ['db', 'label', 'estimate', 'coach'] as const;

/** Spec §15: food library entry (seed and coach-created share the shape). */
export const FoodSeed = z.object({
  slug: z.string().min(1),
  name: LocalizedText,
  aliases: z.array(z.string()).default([]),
  category: z.string().min(1),
  /** Macros per 100 g (or per 100 ml for liquids). */
  per100: Macros,
  micronutrients: z.record(z.string(), z.number()).optional(),
  rawOrCooked: RawOrCooked.optional(),
  /** Slug of the raw/cooked counterpart when both exist. */
  counterpartSlug: z.string().optional(),
  /** Cooked grams per 100 g raw (e.g. rice 2.5–3). */
  cookedYield: z.number().positive().optional(),
  measures: z.array(HouseholdMeasure).default([]),
  source: z.enum(FOOD_SOURCES).default('estimate'),
  brand: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type FoodSeed = z.infer<typeof FoodSeed>;
