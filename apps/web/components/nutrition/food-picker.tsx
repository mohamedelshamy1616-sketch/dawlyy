'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { foodSearchScore, type NutritionFood } from '@/src/server/nutrition/helpers';
import { foodText, NutritionEmpty } from './shared';
import { nutritionRequest } from './transport';

/** Task 6: Arabic-folded picker with category chips and cursor continuation. */
export function FoodPicker({ onPick, disabled = false }: { onPick: (food: NutritionFood) => void; disabled?: boolean }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const [q, setQ] = useState(''); const [category, setCategory] = useState('');
  const [data, setData] = useState<{ items: NutritionFood[]; nextCursor: string | null }>({ items: [], nextCursor: null }); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => {
    setLoading(true); setError(false); void nutritionRequest<typeof data>(`/api/v1/foods?limit=100&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) { void e; setError(true); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, 250); return () => { clearTimeout(timer); controller.abort(); }; }, [q, category]);
  const categories = [...new Set(data.items.map(f => f.category))];
  return <div className="grid min-w-0 gap-3 rounded-xl border p-3"><Input className="min-h-11" aria-label={t('foods.search')} placeholder={t('foods.search')} value={q} onChange={e => setQ(e.target.value)} disabled={disabled} /><div className="flex flex-wrap gap-2"><Button className="min-h-11" variant={category ? 'outline' : 'secondary'} onClick={() => setCategory('')}>{t('common.all')}</Button>{categories.map(c => <Button className="min-h-11" key={c} variant={category === c ? 'secondary' : 'outline'} onClick={() => setCategory(c)}>{c}</Button>)}</div>{loading ? <p role="status">{t('common.loading')}</p> : error ? <p role="alert">{t('errors.request')}</p> : !data.items.length ? <NutritionEmpty /> : <div className="grid max-h-72 gap-2 overflow-y-auto">{[...data.items].sort((a, b) => q ? foodSearchScore(b, q) - foodSearchScore(a, q) : 0).map(food => <Button className="min-h-11 h-auto justify-start whitespace-normal text-start" variant="outline" disabled={disabled} key={food.id} onClick={() => onPick(food)}>{foodText(food.name, locale)}</Button>)}</div>}{data.nextCursor && <Button className="min-h-11" onClick={async () => { try { const next = await nutritionRequest<typeof data>(`/api/v1/foods?limit=100&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&cursor=${encodeURIComponent(data.nextCursor!)}`); setData({ items: [...data.items, ...next.items], nextCursor: next.nextCursor }); } catch { setError(true); } }}>{t('common.more')}</Button>}</div>;
}
