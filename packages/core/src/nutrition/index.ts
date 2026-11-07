import { MealItem, NutritionDocument } from '../types';
import type { Macros, Measure, MeasureKind, HouseholdMeasure, RawOrCooked, NutritionTargets } from '../types';

export class NutritionError extends Error {
  constructor(public readonly code: 'measure_unknown' | 'no_yield' | 'zero_macro') {
    super(code);
    this.name = 'NutritionError';
  }
}

export type FoodLike = {
  id: string;
  per100: Macros;
  measures: HouseholdMeasure[];
  rawOrCooked?: RawOrCooked;
  /** Cooked grams per one gram raw (the Batch B contract). */
  cookedYield?: number;
};

export const DEFAULT_MEASURE_GRAMS: Readonly<Record<Exclude<MeasureKind, 'g' | 'ml' | 'custom'>, number>> = Object.freeze({
  piece: 100, cup: 240, tbsp: 15, tsp: 5, slice: 30, can: 400, loaf: 90,
});

export function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: round1(m.kcal * factor), proteinG: round1(m.proteinG * factor),
    carbsG: round1(m.carbsG * factor), fatG: round1(m.fatG * factor),
    ...(m.fiberG === undefined ? {} : { fiberG: round1(m.fiberG * factor) }) };
}

export function addMacros(...ms: Macros[]): Macros {
  const total: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const m of ms) {
    total.kcal += m.kcal;
    total.proteinG += m.proteinG;
    total.carbsG += m.carbsG;
    total.fatG += m.fatG;
    if (m.fiberG !== undefined) total.fiberG = (total.fiberG ?? 0) + m.fiberG;
  }
  return scaleMacros(total, 1);
}

export function macrosForGrams(food: FoodLike, grams: number): Macros {
  return scaleMacros(food.per100, grams / 100);
}

function matchingLabel(a: Measure['label'], b: Measure['label']): boolean {
  if (!a || !b) return false;
  return (['ar', 'en'] as const).some(locale => {
    const left = a[locale]?.trim().toLowerCase();
    const right = b[locale]?.trim().toLowerCase();
    return !!left && !!right && left === right;
  });
}

export function convertMeasure(food: FoodLike, quantity: number, measure: Measure, opts?: { rawOrCooked?: RawOrCooked }): {
  grams: number; approx: boolean; assumption?: string;
} {
  if (measure.kind === 'g' || measure.kind === 'ml') return { grams: quantity, approx: false };
  const specific = food.measures.find(candidate => candidate.measure.kind === measure.kind
    && (measure.kind !== 'custom' || matchingLabel(candidate.measure.label, measure.label))
    && (opts?.rawOrCooked === undefined || candidate.rawOrCooked === opts.rawOrCooked));
  if (specific) return { grams: quantity * specific.grams, approx: false };
  if (measure.kind === 'custom') throw new NutritionError('measure_unknown');
  // spec §§16–17,45: generic household measures must expose their assumption.
  const grams = DEFAULT_MEASURE_GRAMS[measure.kind];
  return { grams: quantity * grams, approx: true, assumption: `1 ${measure.kind} ≈ ${grams} g` };
}

function yieldRatio(food: FoodLike): number {
  if (food.cookedYield === undefined || !Number.isFinite(food.cookedYield) || food.cookedYield <= 0) {
    throw new NutritionError('no_yield');
  }
  return food.cookedYield;
}

export function rawToCooked(food: FoodLike, gramsRaw: number): number {
  return gramsRaw * yieldRatio(food);
}

export function cookedToRaw(food: FoodLike, gramsCooked: number): number {
  return gramsCooked / yieldRatio(food);
}

function resolvedItemMacros(food: FoodLike, item: MealItem): { macros: Macros; grams: number; approx: boolean } {
  const resolved = convertMeasure(food, item.quantity, item.measure, { rawOrCooked: item.rawOrCooked });
  let macroGrams = resolved.grams;
  // The measure describes the served weight; nutrition values use the food's raw/cooked basis.
  if (item.rawOrCooked && food.rawOrCooked && item.rawOrCooked !== food.rawOrCooked) {
    macroGrams = item.rawOrCooked === 'raw' ? rawToCooked(food, macroGrams) : cookedToRaw(food, macroGrams);
  }
  return { macros: macrosForGrams(food, macroGrams), grams: resolved.grams, approx: item.approx || resolved.approx };
}

export function itemMacros(food: FoodLike, item: MealItem): { macros: Macros; grams: number; approx: boolean } {
  return resolvedItemMacros(food, MealItem.parse(item));
}

export type PlanMacros = {
  total: Macros;
  perMeal: Array<{ mealId: string; chosenOptionId: string; options: Array<{ optionId: string; macros: Macros; approx: boolean }> }>;
  missingFoods: string[];
};

export function sumMacros(doc: NutritionDocument, foods: ReadonlyMap<string, FoodLike>, opts?: { choose?: Record<string, string> }): PlanMacros {
  const document = NutritionDocument.parse(doc);
  const missingFoods = new Set<string>();
  const chosenMacros: Macros[] = [];
  const perMeal = document.meals.map(meal => {
    const options = meal.options.map(option => {
      let approx = false;
      const macros: Macros[] = [];
      for (const item of option.items) {
        const food = foods.get(item.foodId);
        if (!food) {
          missingFoods.add(item.foodId);
          continue;
        }
        const resolved = resolvedItemMacros(food, item);
        macros.push(resolved.macros);
        approx ||= resolved.approx;
      }
      return { optionId: option.id, macros: addMacros(...macros), approx };
    });
    const choice = opts?.choose && Object.hasOwn(opts.choose, meal.id) ? opts.choose[meal.id] : undefined;
    // The schema guarantees at least one option; unknown saved choices fall back to the first.
    const chosen = options.find(option => option.optionId === choice) ?? options[0]!;
    chosenMacros.push(chosen.macros);
    return { mealId: meal.id, chosenOptionId: chosen.optionId, options };
  });
  return { total: addMacros(...chosenMacros), perMeal, missingFoods: [...missingFoods] };
}

export type Deviation = { kcalPct: number; proteinPct: number; carbsPct: number; fatPct: number };

/** Signed percentages; a nonzero value against zero has an infinite deviation. */
function percent(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : actual > 0 ? Infinity : -Infinity;
  return (actual - expected) / expected * 100;
}

function deviations(expected: Macros, actual: Macros): Deviation {
  return { kcalPct: percent(actual.kcal, expected.kcal), proteinPct: percent(actual.proteinG, expected.proteinG),
    carbsPct: percent(actual.carbsG, expected.carbsG), fatPct: percent(actual.fatG, expected.fatG) };
}

export function equivalentQuantity(from: FoodLike, to: FoodLike, grams: number, rule: 'protein' | 'carbs' | 'fat' | 'kcal', tolerancePct = 15): {
  grams: number; macros: Macros; deviation: Deviation; withinTolerance: boolean;
} {
  const macroKeys = { protein: 'proteinG', carbs: 'carbsG', fat: 'fatG', kcal: 'kcal' } as const;
  const key = macroKeys[rule];
  if (to.per100[key] === 0) throw new NutritionError('zero_macro');
  const equivalentGrams = grams * from.per100[key] / to.per100[key];
  const macros = macrosForGrams(to, equivalentGrams);
  const deviation = deviations(macrosForGrams(from, grams), macros);
  const deviationKeys = { protein: 'proteinPct', carbs: 'carbsPct', fat: 'fatPct', kcal: 'kcalPct' } as const;
  const withinTolerance = (Object.keys(deviation) as Array<keyof Deviation>)
    .filter(deviationKey => deviationKey !== deviationKeys[rule])
    .every(deviationKey => Math.abs(deviation[deviationKey]) <= tolerancePct);
  return { grams: equivalentGrams, macros, deviation, withinTolerance };
}

export function targetsDelta(targets: NutritionTargets, actual: Macros): {
  kcal: number; proteinG: number; carbsG: number; fatG: number; pct: Deviation;
} {
  return { kcal: round1(actual.kcal - targets.kcal), proteinG: round1(actual.proteinG - targets.proteinG),
    carbsG: round1(actual.carbsG - targets.carbsG), fatG: round1(actual.fatG - targets.fatG),
    pct: deviations(targets, actual) };
}

export function planConflicts(doc: NutritionDocument, profile: { allergies?: string[]; weightKg?: number; targets?: NutritionTargets }): Array<{
  code: 'allergen' | 'kcal_mismatch' | 'protein_low'; detail: string;
}> {
  const document = NutritionDocument.parse(doc);
  const conflicts: Array<{ code: 'allergen' | 'kcal_mismatch' | 'protein_low'; detail: string }> = [];
  // No food catalog is available here: allergies are exact food ids or explicit document allergen tags.
  const allergens = new Set([...document.allergens,
    ...document.meals.flatMap(meal => meal.options.flatMap(option => option.items.map(item => item.foodId)))]);
  for (const allergy of new Set(profile.allergies ?? [])) {
    if (allergens.has(allergy)) conflicts.push({ code: 'allergen', detail: allergy });
  }
  // Use declared plan targets; actual meal macros cannot be recomputed without foods.
  if (profile.targets && Math.abs(percent(document.targets.kcal, profile.targets.kcal)) > 10) {
    conflicts.push({ code: 'kcal_mismatch', detail: `${document.targets.kcal} / ${profile.targets.kcal} kcal` });
  }
  if (profile.weightKg !== undefined && document.targets.proteinG < profile.weightKg * 1.2) {
    conflicts.push({ code: 'protein_low', detail: `${document.targets.proteinG} / ${round1(profile.weightKg * 1.2)} g` });
  }
  return conflicts;
}
