'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { itemMacros } from '@dawlyy/core/nutrition';
import type { Macros, Meal } from '@dawlyy/core/types';
import { foodMap, type NutritionFood } from '@/src/server/nutrition/helpers';
import { foodText } from './shared';
import { formatKcal, formatMacro, formatNumber, numberLocale } from '@/src/lib/numbers';

/** Task 6: the three statuses a client can log for a planned meal. */
export const MEAL_STATUSES = ['eaten', 'partial', 'skipped'] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];
const BADGE = { eaten: 'success', partial: 'warning', skipped: 'neutral' } as const;

/** Task 6: one planned meal for the client: pick an option, see household measures beside grams, log the status. */
export function ClientMealCard({ meal, foods, chosenOptionId, status, optionMacros, disabled, onChoose, onStatus }: {
  meal: Meal; foods: NutritionFood[]; chosenOptionId: string; status: MealStatus | undefined; optionMacros: Macros | undefined;
  disabled?: boolean; onChoose: (optionId: string) => void; onStatus: (status: MealStatus) => void;
}) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const o = { locale: numberLocale(locale) }; const n = { format: (value: number) => formatNumber(value, o) }; const map = foodMap(foods);
  const option = meal.options.find(o => o.id === chosenOptionId) ?? meal.options[0];
  const measureLabel = (item: NonNullable<typeof option>['items'][number]) => item.measure.kind === 'custom' ? foodText(item.measure.label, locale) : t(`measures.${item.measure.kind}`);
  return <Card padding={4}><VStack gap={3} width="100%" className="min-w-0">
    <HStack gap={2} justify="between" vAlign="center" wrap="wrap">
      <VStack gap={0.5} className="min-w-0"><Heading level={3} type="display-3" wordBreak="break-word">{foodText(meal.name, locale)}</Heading>{meal.timeHint ? <Text type="supporting" color="secondary">{foodText(meal.timeHint, locale)}</Text> : null}</VStack>
      {status ? <Badge variant={BADGE[status]} label={t(`client.status.${status}`)} /> : null}
    </HStack>
    {meal.options.length > 1 ? <SegmentedControl label={t('client.chooseOption')} value={option?.id ?? ''} layout="fill" isDisabled={disabled} onChange={onChoose}>
      {meal.options.map((o, index) => <SegmentedControlItem key={o.id} value={o.id} label={foodText(o.name, locale) || t('client.optionN', { value: n.format(index + 1) })} />)}
    </SegmentedControl> : null}
    <VStack gap={2} width="100%" as="ul">{option?.items.map(item => {
      const food = foods.find(f => f.id === item.foodId); const core = map.get(item.foodId); let grams: number | null = null; let approx = item.approx;
      try { if (core) { const computed = itemMacros(core, item); grams = computed.grams; approx = computed.approx; } } catch { /* An unresolvable measure shows the quantity only. */ }
      return <li key={item.id} className="min-w-0 list-none"><VStack gap={0.5}>
        <Text weight="semibold" wordBreak="break-word">{food ? foodText(food.name, locale) : t('errors.food_unknown')}</Text>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Text color="secondary">{`${n.format(item.quantity)} ${measureLabel(item)}`}{grams !== null && item.measure.kind !== 'g' ? ` · ${n.format(grams)} ${t('measures.g')}` : ''}</Text>
          {approx ? <Badge variant="neutral" label={t('foods.approx')} /> : null}
        </HStack>
      </VStack></li>;
    })}</VStack>
    {optionMacros ? <Text type="supporting" color="secondary">{t('client.optionMacros', { kcal: formatKcal(optionMacros.kcal, o), protein: formatMacro(optionMacros.proteinG, o), carbs: formatMacro(optionMacros.carbsG, o), fat: formatMacro(optionMacros.fatG, o) })}</Text> : null}
    <HStack gap={2} wrap="wrap">{MEAL_STATUSES.map(s => <Button key={s} size="lg" variant={status === s ? 'primary' : 'secondary'} isDisabled={disabled} label={t(`client.status.${s}`)} onClick={() => onStatus(s)} />)}</HStack>
  </VStack></Card>;
}
