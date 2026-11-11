import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FoodSeed, type NutritionDocument } from '@dawlyy/core/types';
import { addMacros, convertMeasure, itemMacros, sumMacros } from '@dawlyy/core/nutrition';
import { documentTotals, foodMap, foodSearchScore, validateDraft } from './helpers';

const seedDir = fileURLToPath(new URL('../../../../../packages/db/seed/foods/', import.meta.url));
const seeds = readdirSync(seedDir).filter(name => name.endsWith('.json')).flatMap(name => FoodSeed.array().parse(JSON.parse(readFileSync(`${seedDir}/${name}`, 'utf8'))));
const foods = seeds.map((food, index) => ({ ...food, id: `food-${index}` }));
const sample = foods.find(food => food.slug === 'koshary')!;
const document: NutritionDocument = { schemaVersion: 1, targets: { kcal: 2000, proteinG: 120, carbsG: 250, fatG: 60 }, meals: [{ id: 'meal', name: { en: 'Lunch' }, options: [{ id: 'option', items: [{ id: 'item', foodId: sample.id, quantity: 2, measure: { kind: 'cup' }, approx: false }] }] }], supplements: [], allergens: [] };

describe('Task 6 / G5 nutrition document computations', () => {
  it('keeps all regional seed foods bilingual with household measures', () => {
    expect(foods.length).toBeGreaterThanOrEqual(300);
    for (const food of foods) { expect(food.name.ar?.trim()).toBeTruthy(); expect(food.measures.length).toBeGreaterThan(0); }
  });
  it('totals equal core sums and the per-measure item totals', () => {
    const map = foodMap(foods);
    const totals = documentTotals(document, foods);
    expect(totals.total).toEqual(sumMacros(document, map).total);
    expect(totals.total).toEqual(addMacros(...document.meals.flatMap(meal => meal.options[0]!.items.map(item => itemMacros(map.get(item.foodId)!, item).macros))));
    expect(convertMeasure(map.get(sample.id)!, 2, { kind: 'cup' }).grams).toBe(500);
    expect(totals.total.kcal).toBe(750);
  });
  it('accepts empty drafts but rejects duplicate meal/item ids and unknown custom measures', () => {
    expect(validateDraft({ ...document, meals: [] }).success).toBe(true);
    expect(validateDraft({ ...document, meals: [...document.meals, ...document.meals] }).success).toBe(false);
    const copy = structuredClone(document); copy.meals[0]!.options[0]!.items[0]!.measure = { kind: 'custom' };
    expect(validateDraft(copy).success).toBe(false);
  });
  it('folds Arabic diacritics and ranks exact names above alias prefixes', () => {
    expect(foodSearchScore({ name: { ar: 'أَرُزّ' }, aliases: [] }, 'ارز')).toBe(100);
    expect(foodSearchScore({ name: { en: 'Rice bowl' }, aliases: ['rice'] }, 'rice')).toBeGreaterThan(foodSearchScore({ name: { en: 'Rice bowl' }, aliases: [] }, 'rice'));
  });
});
