'use client';
import { Card } from '@astryxdesign/core/Card';
import { Selector } from '@astryxdesign/core/Selector';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useLocale, useTranslations } from 'next-intl';
import type { Meal, MealItem } from '@dawlyy/core/types';
import { itemMacros } from '@dawlyy/core/nutrition';
import { Button } from '@astryxdesign/core/Button';
import { foodMap, type NutritionFood } from '@/src/server/nutrition/helpers';
import { BilingualField, Field, foodText, MacroBar, NutritionNumberInput } from './shared';
import { MeasureSelector } from './measure-selector';
import { formatNumber, numberLocale } from '@/src/lib/numbers';

/** Task 6: meal/option edits use stable document ids; ordering has accessible move buttons. */
export function MealEditor({ meal, foods, disabled, onChange, onAddFood, onSwap }: { meal: Meal; foods: NutritionFood[]; disabled: boolean; onChange: (meal: Meal) => void; onAddFood: (optionId: string) => void; onSwap: (item: MealItem) => void }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale) }) }; const map = foodMap(foods);
  function edit(fn: (copy: Meal) => void) { const copy = structuredClone(meal); fn(copy); onChange(copy); }
  return <Card padding={4}><VStack as="section" gap={4} className="min-w-0"><BilingualField label={t('builder.mealName')} value={meal.name} disabled={disabled} onChange={name => onChange({ ...meal, name })} /><BilingualField label={t('builder.time')} value={meal.timeHint} disabled={disabled} onChange={timeHint => onChange({ ...meal, timeHint })} />
    {meal.options.map((option, oi) => <VStack gap={3} key={option.id} className="min-w-0 rounded-xl bg-muted/40 p-3"><BilingualField label={t('builder.optionName')} value={option.name} disabled={disabled} onChange={name => edit(copy => { copy.options[oi]!.name = name; })} /><HStack gap={2} wrap="wrap"><Button className="min-h-11" variant="secondary" isDisabled={disabled || oi === 0} onClick={() => edit(copy => { [copy.options[oi - 1], copy.options[oi]] = [copy.options[oi]!, copy.options[oi - 1]!]; })} label={t('common.up')} /><Button className="min-h-11" variant="secondary" isDisabled={disabled || oi === meal.options.length - 1} onClick={() => edit(copy => { [copy.options[oi + 1], copy.options[oi]] = [copy.options[oi]!, copy.options[oi + 1]!]; })} label={t('common.down')} /><Button className="min-h-11" variant="secondary" isDisabled={disabled || meal.options.length === 1} onClick={() => edit(copy => { copy.options.splice(oi, 1); })} label={t('common.remove')} /></HStack>
      {option.items.map((item, ii) => {
        const food = foods.find(f => f.id === item.foodId); const coreFood = map.get(item.foodId); let computed: ReturnType<typeof itemMacros> | undefined;
        try { if (coreFood) computed = itemMacros(coreFood, item); } catch { /* Invalid measure is reported alongside the item and blocks save. */ }
        const change = (patch: Partial<MealItem>) => edit(copy => { Object.assign(copy.options[oi]!.items[ii]!, patch); });
        return <VStack gap={2} key={item.id} className="min-w-0 border-t pt-3"><strong>{food ? foodText(food.name, locale) : t('errors.food_unknown')}</strong><Grid gap={2} className="min-w-0 grid-cols-2!"><NutritionNumberInput label={t('foods.quantity')} className="min-h-11 min-w-0" min="0.1" step="0.1" value={item.quantity} disabled={disabled} onChange={e => { const value = Number(e.target.value); if (value > 0) change({ quantity: value }); }} />{food && <Field label={t('foods.measure')}><MeasureSelector food={food} value={item.measure} disabled={disabled} onChange={measure => change({ measure, approx: false, grams: undefined })} /></Field>}</Grid>
          {food?.counterpartSlug && food.cookedYield && <Selector label={t('foods.basis')} controlClassName="min-h-11" containerClassName="min-w-0" isDisabled={disabled} value={item.rawOrCooked ?? food.rawOrCooked ?? 'raw'} onChange={value => change({ rawOrCooked: value === 'raw' ? 'raw' : 'cooked' })} options={[{ value: 'raw', label: t('foods.raw') }, { value: 'cooked', label: t('foods.cooked') }]} />}
          {computed ? <><Text as="p" className="text-sm">{n.format(computed.grams)} {t('measures.g')}{computed.approx && <Text className="ms-2 rounded-full bg-muted px-2 py-1">{t('foods.approx')}</Text>}</Text><MacroBar macros={computed.macros} /></> : <Text as="p" role="alert">{t('errors.measure_unknown')}</Text>}
          <HStack gap={2} wrap="wrap"><Button className="min-h-11" variant="secondary" isDisabled={disabled} onClick={() => onSwap(item)} label={t('builder.swap')} /><Button className="min-h-11" variant="secondary" isDisabled={disabled || ii === 0} onClick={() => edit(copy => { const items = copy.options[oi]!.items; [items[ii - 1], items[ii]] = [items[ii]!, items[ii - 1]!]; })} label={t('common.up')} /><Button className="min-h-11" variant="secondary" isDisabled={disabled || ii === option.items.length - 1} onClick={() => edit(copy => { const items = copy.options[oi]!.items; [items[ii + 1], items[ii]] = [items[ii]!, items[ii + 1]!]; })} label={t('common.down')} /><Button className="min-h-11" variant="secondary" isDisabled={disabled || option.items.length === 1} onClick={() => edit(copy => { copy.options[oi]!.items.splice(ii, 1); })} label={t('common.remove')} /></HStack>
        </VStack>;
      })}<Button className="min-h-11" variant="secondary" isDisabled={disabled} onClick={() => onAddFood(option.id)} label={t('builder.addFood')} /></VStack>)}
    <Button className="min-h-11" variant="secondary" isDisabled={disabled} onClick={() => edit(copy => { const source = copy.options[0]; if (source) copy.options.push({ ...structuredClone(source), id: crypto.randomUUID(), items: source.items.map(i => ({ ...i, id: crypto.randomUUID() })) }); })} label={t('builder.addOption')} />
  </VStack></Card>;
}
