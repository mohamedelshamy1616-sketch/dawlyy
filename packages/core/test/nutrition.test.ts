import { describe, it, expect } from 'vitest';
import { MealItem, NutritionDocument } from '../src/types';
import {
  NutritionError, round1, scaleMacros, addMacros, macrosForGrams, convertMeasure,
  rawToCooked, cookedToRaw, itemMacros, sumMacros, equivalentQuantity, targetsDelta, planConflicts,
  type FoodLike,
} from '../src/nutrition';

const chicken: FoodLike = { id: 'chicken', per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 },
  measures: [], rawOrCooked: 'cooked', cookedYield: 0.7 };
const rice: FoodLike = { id: 'rice', per100: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  rawOrCooked: 'cooked', cookedYield: 2.8, measures: [{ measure: { kind: 'cup' }, grams: 160, rawOrCooked: 'cooked' }] };
const eggs: FoodLike = { id: 'eggs', per100: { kcal: 155, proteinG: 13, carbsG: 1.1, fatG: 11 }, measures: [] };
const foods = new Map([['chicken', chicken], ['rice', rice], ['eggs', eggs]]);
const item = (foodId: string, quantity = 100) => MealItem.parse({ id: `${foodId}-item`, foodId, quantity, measure: { kind: 'g' } });
const plan = () => NutritionDocument.parse({
  targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 }, allergens: ['dairy'],
  meals: [
    { id: 'lunch', name: { ar: 'الغدا', en: 'Lunch' }, options: [
      { id: 'chicken-rice', items: [item('chicken', 150), item('rice', 100)], macros: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 } },
      { id: 'eggs', items: [item('eggs', 100)] },
    ] },
    { id: 'dinner', name: { ar: 'العشا', en: 'Dinner' }, options: [{ id: 'chicken', items: [item('chicken', 100)] }] },
  ],
});

describe('macro arithmetic', () => {
  it('scales 150 grams of chicken and rounds to one decimal', () => {
    expect(macrosForGrams(chicken, 150)).toEqual({ kcal: 247.5, proteinG: 46.5, carbsG: 0, fatG: 5.4 });
    expect(round1(1.26)).toBe(1.3);
    expect(round1(-1.26)).toBe(-1.3);
    expect(scaleMacros({ kcal: 10, proteinG: 1, carbsG: 2, fatG: 3, fiberG: 1.5 }, 0.5))
      .toEqual({ kcal: 5, proteinG: 0.5, carbsG: 1, fatG: 1.5, fiberG: 0.8 });
  });

  it('sums fiber only when provided and supports an empty total', () => {
    expect(addMacros()).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(addMacros({ kcal: 10, proteinG: 1.1, carbsG: 2, fatG: 3, fiberG: 1 },
      { kcal: 20, proteinG: 2.2, carbsG: 3, fatG: 4 })).toEqual({ kcal: 30, proteinG: 3.3, carbsG: 5, fatG: 7, fiberG: 1 });
  });
});

describe('household measures and cooking yields', () => {
  it('resolves a matching cooked-rice cup exactly and scales the quantity', () => {
    expect(convertMeasure(rice, 1, { kind: 'cup' }, { rawOrCooked: 'cooked' })).toEqual({ grams: 160, approx: false });
    expect(convertMeasure(rice, 2, { kind: 'cup' }, { rawOrCooked: 'cooked' })).toEqual({ grams: 320, approx: false });
  });

  it('keeps grams and milliliters exact', () => {
    expect(convertMeasure(chicken, 150, { kind: 'g' })).toEqual({ grams: 150, approx: false });
    expect(convertMeasure(chicken, 250, { kind: 'ml' })).toEqual({ grams: 250, approx: false });
  });

  it('marks generic household measures approximate and explains the assumption', () => {
    const result = convertMeasure(chicken, 1, { kind: 'cup' });
    expect(result).toMatchObject({ grams: 240, approx: true });
    expect(result.assumption).toContain('240');
    expect(convertMeasure(chicken, 2, { kind: 'tbsp' }).grams).toBe(30);
    expect(convertMeasure(rice, 1, { kind: 'cup' }, { rawOrCooked: 'raw' }).approx).toBe(true);
  });

  it('matches custom labels and rejects unknown custom measures', () => {
    const food: FoodLike = { ...chicken, measures: [{ measure: { kind: 'custom', label: { ar: 'كف إيد', en: 'Palm' } }, grams: 90 }] };
    expect(convertMeasure(food, 2, { kind: 'custom', label: { en: 'Palm' } })).toEqual({ grams: 180, approx: false });
    expect(() => convertMeasure(food, 1, { kind: 'custom', label: { en: 'Handful' } })).toThrow(NutritionError);
    expect(() => convertMeasure(food, 1, { kind: 'custom' })).toThrow(expect.objectContaining({ code: 'measure_unknown' }));
  });

  it('converts both directions using the cooked-grams-per-raw-gram ratio', () => {
    expect(rawToCooked(rice, 100)).toBe(280);
    expect(cookedToRaw(rice, 280)).toBeCloseTo(100, 10);
    expect(rawToCooked(chicken, 100)).toBe(70);
    expect(() => rawToCooked(eggs, 100)).toThrow(expect.objectContaining({ code: 'no_yield' }));
    expect(() => cookedToRaw(eggs, 100)).toThrow(expect.objectContaining({ code: 'no_yield' }));
  });

  it('converts an item into the food macro weight basis and preserves displayed grams', () => {
    expect(itemMacros(rice, MealItem.parse({ ...item('rice'), quantity: 1, measure: { kind: 'cup' }, rawOrCooked: 'cooked' })))
      .toEqual({ grams: 160, approx: false, macros: { kcal: 208, proteinG: 4.3, carbsG: 44.8, fatG: 0.5 } });
    expect(itemMacros(rice, { ...item('rice'), rawOrCooked: 'raw' })).toEqual({ grams: 100, approx: false,
      macros: { kcal: 364, proteinG: 7.6, carbsG: 78.4, fatG: 0.8 } });
    const rawRice: FoodLike = { ...rice, rawOrCooked: 'raw' };
    expect(itemMacros(rawRice, { ...item('rice', 280), rawOrCooked: 'cooked' }).macros.kcal).toBe(130);
    expect(itemMacros(chicken, { ...item('chicken'), approx: true, grams: 999 }).approx).toBe(true);
    expect(itemMacros(chicken, { ...item('chicken'), grams: 999 }).grams).toBe(100);
  });
});

describe('plan totals and choices', () => {
  it('recomputes all options, defaults to each first option and ignores stored macros', () => {
    const doc = plan();
    const snapshot = structuredClone(doc);
    const result = sumMacros(doc, foods);
    expect(result.total).toEqual({ kcal: 542.5, proteinG: 80.2, carbsG: 28, fatG: 9.3 });
    expect(result.perMeal[0]?.chosenOptionId).toBe('chicken-rice');
    expect(result.perMeal[0]?.options[1]).toEqual({ optionId: 'eggs', macros: eggs.per100, approx: false });
    expect(result.missingFoods).toEqual([]);
    expect(doc).toEqual(snapshot);
  });

  it('switches choices and falls back to the first option for an unknown choice', () => {
    expect(sumMacros(plan(), foods, { choose: { lunch: 'eggs' } }).total)
      .toEqual({ kcal: 320, proteinG: 44, carbsG: 1.1, fatG: 14.6 });
    expect(sumMacros(plan(), foods, { choose: { lunch: 'missing' } }).perMeal[0]?.chosenOptionId).toBe('chicken-rice');
  });

  it('deduplicates missing foods across every option, including unselected options', () => {
    const result = sumMacros(plan(), new Map([['chicken', chicken]]));
    expect(result.missingFoods).toEqual(['rice', 'eggs']);
    expect(result.total.kcal).toBe(412.5);
  });

  it('propagates approximate items to their option and rejects invalid documents', () => {
    const doc = plan();
    const first = doc.meals[0]?.options[0]?.items[0];
    if (first) { first.measure = { kind: 'cup' }; first.quantity = 1; }
    expect(sumMacros(doc, foods).perMeal[0]?.options[0]?.approx).toBe(true);
    expect(() => sumMacros({ ...doc, meals: [] }, foods)).toThrow();
  });
});

describe('substitutions, target deltas and reuse conflicts', () => {
  it('matches chicken protein with eggs and detects the extra fat', () => {
    const result = equivalentQuantity(chicken, eggs, 150, 'protein');
    expect(result.grams).toBeCloseTo(357.6923, 3);
    expect(result.macros.proteinG).toBe(46.5);
    expect(result.deviation.fatPct).toBeGreaterThan(15);
    expect(result.deviation.carbsPct).toBe(Infinity);
    expect(result.withinTolerance).toBe(false);
    expect(equivalentQuantity(chicken, chicken, 150, 'kcal').withinTolerance).toBe(true);
    expect(equivalentQuantity(rice, rice, 100, 'carbs', 0).withinTolerance).toBe(true);
    expect(equivalentQuantity(eggs, eggs, 100, 'fat').grams).toBe(100);
  });

  it('rejects a zero rule macro in the replacement food and handles a zero starting quantity', () => {
    expect(() => equivalentQuantity(rice, chicken, 100, 'carbs')).toThrow(expect.objectContaining({ code: 'zero_macro' }));
    expect(equivalentQuantity(chicken, eggs, 0, 'protein')).toMatchObject({ grams: 0, withinTolerance: true,
      deviation: { kcalPct: 0, proteinPct: 0, carbsPct: 0, fatPct: 0 } });
  });

  it('returns signed actual-minus-target deltas and explicit zero-baseline percentages', () => {
    expect(targetsDelta({ kcal: 2000, proteinG: 100, carbsG: 200, fatG: 50 },
      { kcal: 2200, proteinG: 90, carbsG: 200, fatG: 60 })).toEqual({ kcal: 200, proteinG: -10, carbsG: 0, fatG: 10,
      pct: { kcalPct: 10, proteinPct: -10, carbsPct: 0, fatPct: 20 } });
    expect(targetsDelta({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, eggs.per100).pct.kcalPct).toBe(Infinity);
  });

  it('checks food ids in all options and explicit document allergen tags, without duplicates', () => {
    const result = planConflicts(plan(), { allergies: ['eggs', 'dairy', 'eggs', 'peanut'] });
    expect(result).toEqual([{ code: 'allergen', detail: 'eggs' }, { code: 'allergen', detail: 'dairy' }]);
  });

  it('flags greater than ten percent kcal mismatch and protein below 1.2 grams per kg', () => {
    const doc = plan();
    expect(planConflicts(doc, { targets: { ...doc.targets, kcal: 1500 }, weightKg: 130 }).map(c => c.code))
      .toEqual(['kcal_mismatch', 'protein_low']);
    expect(planConflicts({ ...doc, targets: { ...doc.targets, kcal: 2200, proteinG: 120 } },
      { targets: doc.targets, weightKg: 100 })).toEqual([]);
    expect(planConflicts(doc, {})).toEqual([]);
  });
});
