import { addMacros, itemMacros, sumMacros, targetsDelta, type FoodLike } from '@dawlyy/core/nutrition';
import { matchScore, searchKey } from '@dawlyy/core/text';
import type { HouseholdMeasure, Macros, NutritionDocument } from '@dawlyy/core/types';
import { draftDocumentSchema } from './schemas';

/** Task 6: portable food contract shared by client components and authenticated services. */
export type NutritionFood = { id: string; name: { ar?: string; en?: string }; aliases: string[]; slug: string; category: string; per100: Macros; measures: HouseholdMeasure[]; rawOrCooked?: string | null; cookedYield?: number | null; counterpartSlug?: string | null; source: string; brand?: string | null; hidden?: boolean; isSystem?: boolean };
/** Task 6: nullable DB attributes become optional core attributes without unsafe casts. */
export function foodMap(foods: readonly Pick<NutritionFood, 'id' | 'per100' | 'measures' | 'rawOrCooked' | 'cookedYield'>[]): Map<string, FoodLike> {
  return new Map(foods.map(food => [food.id, { id: food.id, per100: food.per100, measures: food.measures,
    ...(food.rawOrCooked === 'raw' || food.rawOrCooked === 'cooked' ? { rawOrCooked: food.rawOrCooked } : {}),
    ...(food.cookedYield == null ? {} : { cookedYield: food.cookedYield }) }]));
}
/** Task 6 / G5: core computes every item, option, selected-meal total and target delta. */
export function documentTotals(document: NutritionDocument, foods: readonly NutritionFood[], choose?: Record<string, string>) {
  const map = foodMap(foods);
  const totals = document.meals.length ? sumMacros(document, map, { choose }) : { total: addMacros(), perMeal: [], missingFoods: [] as string[] };
  const perMeal = totals.perMeal.map(meal => ({ ...meal, total: meal.options.find(option => option.optionId === meal.chosenOptionId)?.macros ?? addMacros() }));
  return { ...totals, perMeal, delta: targetsDelta(document.targets, totals.total) };
}
/** Task 6: validate drafts before any persistence; published documents also require the core minimum. */
export function validateDraft(value: unknown) { return draftDocumentSchema.safeParse(value); }
/** Task 6: search uses core Arabic folding and predictable exact/prefix/substring ranking. */
export function foodSearchScore(food: { name: { ar?: string; en?: string }; aliases: string[] }, query: string): number {
  return matchScore([food.name.ar, food.name.en, ...food.aliases], query);
}
/** Task 6: stable locale-independent folded name key for both ordering and cursors. */
export function foodSortKey(food: { name: { ar?: string; en?: string } }): string { return searchKey(food.name.ar?.trim() || food.name.en || ''); }
/** Task 6: replace cached client-supplied grams/macros with core computations when saving a valid draft. */
export function normalizeDocument(document: NutritionDocument, foods: readonly NutritionFood[]): NutritionDocument {
  const result = structuredClone(document); const map = foodMap(foods);
  for (const meal of result.meals) for (const option of meal.options) {
    const values: Macros[] = [];
    for (const item of option.items) {
      const food = map.get(item.foodId);
      if (!food) { delete item.grams; continue; }
      const computed = itemMacros(food, item); item.grams = computed.grams; item.approx = computed.approx; values.push(computed.macros);
    }
    option.macros = addMacros(...values);
  }
  return result;
}
