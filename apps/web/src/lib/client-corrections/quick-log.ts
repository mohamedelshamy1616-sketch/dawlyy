import { addDays } from '@dawlyy/core/schedule';
import { itemMacros, type FoodLike } from '@dawlyy/core/nutrition';
import { localize, type Locale, type MealOption } from '@dawlyy/core/types';
import type { ClientNutrition } from '@/components/nutrition/types';
import { formatNumber, type NumeralSystem } from '@/src/lib/numbers';
import ar from '@/messages/ar/quickLog.json';
import en from '@/messages/en/quickLog.json';
import type { MealHistoryRow, MealWrite } from './types';

export type QuickLogChoice = {
  key: string; kind: 'planned' | 'yesterday' | 'recentFood';
  labelKey: 'planned' | 'yesterday' | 'recentFood'; labelParams: { name: string; portion: string };
  create: (clientUuid: string, clientUpdatedAt: string) => MealWrite;
};
export type QuickLogInput = { localDate: string; plan: ClientNutrition | null; recent: readonly MealHistoryRow[]; locale: Locale; numerals?: NumeralSystem };

/** Pure: no clock, UUID allocation, request or cached account data. */
export function buildQuickLogChoices({ localDate, plan, recent, locale, numerals = 'latn' }: QuickLogInput): QuickLogChoice[] {
  const copy = locale === 'ar' ? ar : en;
  const options = { locale, numerals };
  const meals = plan?.version?.document.meals ?? [];
  const foods = new Map(plan?.foods.map(food => [food.id, food]) ?? []);
  const choices: QuickLogChoice[] = [];
  const seen = new Set<string>();
  const append = (choice: QuickLogChoice) => { if (!seen.has(choice.key)) { seen.add(choice.key); choices.push(choice); } };
  const base = (clientUuid: string, clientUpdatedAt: string) => ({ clientUuid, clientUpdatedAt, localDate, status: 'eaten' as const });
  function portions(option: MealOption) {
    return option.items.map(item => {
      const food = foods.get(item.foodId); if (!food) return null;
      const resolved: FoodLike = { id: food.id, per100: food.per100, measures: food.measures,
        ...(food.rawOrCooked === 'raw' || food.rawOrCooked === 'cooked' ? { rawOrCooked: food.rawOrCooked } : {}),
        ...(food.cookedYield == null ? {} : { cookedYield: food.cookedYield }) };
      try {
        const computed = itemMacros(resolved, item);
        const unit = item.measure.kind === 'custom' ? localize(item.measure.label, locale) || copy.units.custom : copy.units[item.measure.kind];
        const portion = `${formatNumber(item.quantity, options)} ${unit}`;
        return { item, food, computed, name: localize(food.name, locale) || copy.unknownFood, portion };
      } catch { return null; }
    });
  }
  function optionLabel(option: MealOption): string | null {
    const values = portions(option); if (values.some(value => value === null)) return null;
    return values.map(value => `${value!.name} ${value!.portion}`).join(' + ');
  }
  for (const meal of meals) for (const option of meal.options) {
    const portion = optionLabel(option); if (!portion) continue;
    append({ key: `planned:${meal.id}:${option.id}`, kind: 'planned', labelKey: 'planned',
      labelParams: { name: localize(meal.name, locale) || copy.unknownMeal, portion },
      create: (uuid, at) => ({ ...base(uuid, at), mealId: meal.id, optionId: option.id }) });
  }
  const superseded = new Set(recent.flatMap(row => row.replacesId ? [row.replacesId] : []));
  const yesterday = addDays(localDate, -1); const oldest = addDays(localDate, -7);
  const rows = recent.filter(row => !row.voidedAt && !superseded.has(row.id) && row.status === 'eaten' && row.localDate >= oldest && row.localDate <= yesterday);
  for (const row of rows) {
    const meal = meals.find(value => value.id === row.mealId);
    const option = meal?.options.find(value => value.id === row.optionId);
    if (row.localDate === yesterday) {
      if (!row.mealId && row.freeEntry?.text?.trim()) {
        const freeEntry = { text: row.freeEntry.text.trim(), ...(row.freeEntry.macros ? { macros: { ...row.freeEntry.macros } } : {}) };
        append({ key: `yesterday:${row.id}`, kind: 'yesterday', labelKey: 'yesterday', labelParams: { name: freeEntry.text, portion: copy.recordedPortion },
          create: (uuid, at) => ({ ...base(uuid, at), freeEntry: structuredClone(freeEntry), ...(row.note ? { note: row.note } : {}) }) });
      } else if (meal && option) {
        const portion = optionLabel(option);
        if (portion) append({ key: `yesterday:${row.id}`, kind: 'yesterday', labelKey: 'yesterday', labelParams: { name: localize(meal.name, locale) || copy.unknownMeal, portion },
          create: (uuid, at) => ({ ...base(uuid, at), mealId: meal.id, optionId: option.id, ...(row.note ? { note: row.note } : {}) }) });
      }
    }
    // Changed plan versions cannot prove the historical portion. Never guess it from the text.
    const versionId = (row as MealHistoryRow & { planVersionId?: string | null }).planVersionId;
    if (!option || !versionId || versionId !== plan?.version?.id) continue;
    for (const value of portions(option)) {
      if (!value) continue;
      const portion = `${formatNumber(value.computed.grams, options)} ${copy.grams}`;
      const text = `${value.name} — ${portion}`;
      append({ key: `recent-food:${value.food.id}:${value.computed.grams}:${JSON.stringify(value.computed.macros)}`, kind: 'recentFood', labelKey: 'recentFood',
        labelParams: { name: value.name, portion }, create: (uuid, at) => ({ ...base(uuid, at), freeEntry: { text, macros: { ...value.computed.macros } } }) });
    }
  }
  return choices;
}

/** One controller per mounted account/date. Failed sends keep the same immutable operation for retry. */
export function createQuickLogRunner<Operation, Value>({ make, send }: { make: (choice: QuickLogChoice) => Operation; send: (operation: Operation) => Promise<Value> }) {
  const operations = new Map<string, Operation>(); const saved = new Set<string>(); let busy = false;
  return {
    forget(key: string) { operations.delete(key); },
    async submit(choice: QuickLogChoice): Promise<{ status: 'busy' | 'saved' }> {
      if (saved.has(choice.key)) return { status: 'saved' };
      if (busy) return { status: 'busy' };
      busy = true;
      try {
        let operation = operations.get(choice.key);
        if (!operation) { operation = make(choice); operations.set(choice.key, operation); }
        await send(operation); saved.add(choice.key); operations.delete(choice.key);
        return { status: 'saved' };
      } finally { busy = false; }
    },
  };
}
