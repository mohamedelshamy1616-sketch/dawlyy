'use client';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { foodSearchScore, type NutritionFood } from '@/src/server/nutrition/helpers';
import { foodText, NutritionEmpty, NutritionTextInput as TextInput } from './shared';
import { nutritionRequest } from './transport';

/** Task 6: Arabic-folded picker with category chips and cursor continuation. */
export function FoodPicker({ onPick, disabled = false }: { onPick: (food: NutritionFood) => void; disabled?: boolean }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const [q, setQ] = useState(''); const [category, setCategory] = useState('');
  const [data, setData] = useState<{ items: NutritionFood[]; nextCursor: string | null }>({ items: [], nextCursor: null }); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => {
    setLoading(true); setError(false); void nutritionRequest<typeof data>(`/api/v1/foods?limit=100&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) { void e; setError(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [q, category]);
  const categories = [...new Set(data.items.map(f => f.category))];
  return <Card padding={3} className="min-w-0"><VStack gap={3}><TextInput label={t('foods.search')} isLabelHidden containerClassName="min-w-0 flex-1" controlClassName="min-h-11" aria-label={t('foods.search')} placeholder={t('foods.search')} value={q} onChange={(_, e) => setQ(e.target.value)} isDisabled={disabled} /><HStack gap={2} wrap="wrap"><Button className="min-h-11" variant={category ? 'secondary' : 'primary'} onClick={() => setCategory('')} label={t('common.all')} />{categories.map(c => <Button className="min-h-11" key={c} variant={category === c ? 'primary' : 'secondary'} onClick={() => setCategory(c)} label={c} />)}</HStack>{loading ? <Text as="p" role="status">{t('common.loading')}</Text> : error ? <Text as="p" role="alert">{t('errors.request')}</Text> : !data.items.length ? <NutritionEmpty /> : <VStack gap={2} className="max-h-72 overflow-y-auto">{[...data.items].sort((a, b) => q ? foodSearchScore(b, q) - foodSearchScore(a, q) : 0).map(food => <Button className="min-h-11 h-auto! justify-start! whitespace-normal! text-start" variant="secondary" isDisabled={disabled} key={food.id} onClick={() => onPick(food)} label={foodText(food.name, locale)} />)}</VStack>}{data.nextCursor && <Button variant="primary" className="min-h-11" onClick={async () => { try { const next = await nutritionRequest<typeof data>(`/api/v1/foods?limit=100&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&cursor=${encodeURIComponent(data.nextCursor!)}`); setData({ items: [...data.items, ...next.items], nextCursor: next.nextCursor }); } catch { setError(true); } }} label={t('common.more')} />}</VStack></Card>;
}
