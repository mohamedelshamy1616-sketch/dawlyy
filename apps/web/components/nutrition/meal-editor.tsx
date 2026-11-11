'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { Meal, MealItem } from '@dawlyy/core/types';
import { itemMacros } from '@dawlyy/core/nutrition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { foodMap, type NutritionFood } from '@/src/server/nutrition/helpers';
import { BilingualField, Field, foodText, MacroBar, selectClass } from './shared';
import { MeasureSelector } from './measure-selector';

/** Task 6: meal/option edits use stable document ids; ordering has accessible move buttons. */
export function MealEditor({ meal, foods, disabled, onChange, onAddFood, onSwap }: { meal: Meal; foods: NutritionFood[]; disabled: boolean; onChange: (meal: Meal) => void; onAddFood: (optionId: string) => void; onSwap: (item: MealItem) => void }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }); const map = foodMap(foods);
  function edit(fn: (copy: Meal) => void) { const copy = structuredClone(meal); fn(copy); onChange(copy); }
  return <section className="grid min-w-0 gap-4 rounded-2xl border p-4"><BilingualField label={t('builder.mealName')} value={meal.name} disabled={disabled} onChange={name => onChange({ ...meal, name })} /><BilingualField label={t('builder.time')} value={meal.timeHint} disabled={disabled} onChange={timeHint => onChange({ ...meal, timeHint })} />
    {meal.options.map((option, oi) => <div key={option.id} className="grid min-w-0 gap-3 rounded-xl bg-muted/40 p-3"><BilingualField label={t('builder.optionName')} value={option.name} disabled={disabled} onChange={name => edit(copy => { copy.options[oi]!.name = name; })} /><div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={disabled || oi === 0} onClick={() => edit(copy => { [copy.options[oi - 1], copy.options[oi]] = [copy.options[oi]!, copy.options[oi - 1]!]; })}>{t('common.up')}</Button><Button className="min-h-11" variant="outline" disabled={disabled || oi === meal.options.length - 1} onClick={() => edit(copy => { [copy.options[oi + 1], copy.options[oi]] = [copy.options[oi]!, copy.options[oi + 1]!]; })}>{t('common.down')}</Button><Button className="min-h-11" variant="outline" disabled={disabled || meal.options.length === 1} onClick={() => edit(copy => { copy.options.splice(oi, 1); })}>{t('common.remove')}</Button></div>
      {option.items.map((item, ii) => {
        const food = foods.find(f => f.id === item.foodId); const coreFood = map.get(item.foodId); let computed: ReturnType<typeof itemMacros> | undefined;
        try { if (coreFood) computed = itemMacros(coreFood, item); } catch { /* Invalid measure is reported alongside the item and blocks save. */ }
        const change = (patch: Partial<MealItem>) => edit(copy => { Object.assign(copy.options[oi]!.items[ii]!, patch); });
        return <div key={item.id} className="grid min-w-0 gap-2 border-t pt-3"><strong>{food ? foodText(food.name, locale) : t('errors.food_unknown')}</strong><div className="grid min-w-0 grid-cols-2 gap-2"><Field label={t('foods.quantity')}><Input className="min-h-11 min-w-0" type="number" min="0.1" step="0.1" value={item.quantity} disabled={disabled} onChange={e => { const value = Number(e.target.value); if (value > 0) change({ quantity: value }); }} /></Field>{food && <Field label={t('foods.measure')}><MeasureSelector food={food} value={item.measure} disabled={disabled} onChange={measure => change({ measure, approx: false, grams: undefined })} /></Field>}</div>
          {food?.counterpartSlug && food.cookedYield && <Field label={t('foods.basis')}><select className={selectClass} disabled={disabled} value={item.rawOrCooked ?? food.rawOrCooked ?? 'raw'} onChange={e => change({ rawOrCooked: e.target.value === 'raw' ? 'raw' : 'cooked' })}><option value="raw">{t('foods.raw')}</option><option value="cooked">{t('foods.cooked')}</option></select></Field>}
          {computed ? <><p className="text-sm">{n.format(computed.grams)} {t('measures.g')}{computed.approx && <span className="ms-2 rounded-full bg-muted px-2 py-1">{t('foods.approx')}</span>}</p><MacroBar macros={computed.macros} /></> : <p role="alert">{t('errors.measure_unknown')}</p>}
          <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => onSwap(item)}>{t('builder.swap')}</Button><Button className="min-h-11" variant="outline" disabled={disabled || ii === 0} onClick={() => edit(copy => { const items = copy.options[oi]!.items; [items[ii - 1], items[ii]] = [items[ii]!, items[ii - 1]!]; })}>{t('common.up')}</Button><Button className="min-h-11" variant="outline" disabled={disabled || ii === option.items.length - 1} onClick={() => edit(copy => { const items = copy.options[oi]!.items; [items[ii + 1], items[ii]] = [items[ii]!, items[ii + 1]!]; })}>{t('common.down')}</Button><Button className="min-h-11" variant="outline" disabled={disabled || option.items.length === 1} onClick={() => edit(copy => { copy.options[oi]!.items.splice(ii, 1); })}>{t('common.remove')}</Button></div>
        </div>;
      })}<Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => onAddFood(option.id)}>{t('builder.addFood')}</Button></div>)}
    <Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => edit(copy => { const source = copy.options[0]; if (source) copy.options.push({ ...structuredClone(source), id: crypto.randomUUID(), items: source.items.map(i => ({ ...i, id: crypto.randomUUID() })) }); })}>{t('builder.addOption')}</Button>
  </section>;
}
