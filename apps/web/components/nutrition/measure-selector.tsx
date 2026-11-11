'use client';
import { useLocale, useTranslations } from 'next-intl';
import type { Measure } from '@dawlyy/core/types';
import type { NutritionFood } from '@/src/server/nutrition/helpers';
import { foodText, selectClass } from './shared';

/** Task 6: each household label retains its exact custom-label identity for core conversion. */
export function MeasureSelector({ food, value, onChange, disabled }: { food: NutritionFood; value: Measure; onChange: (v: Measure) => void; disabled?: boolean }) {
  const t = useTranslations('nutrition'); const locale = useLocale();
  const measures: Measure[] = [{ kind: 'g' }, { kind: 'ml' }, ...food.measures.map(m => m.measure)];
  if (!measures.some(m => JSON.stringify(m) === JSON.stringify(value))) measures.push(value);
  return <select className={selectClass} disabled={disabled} aria-label={t('foods.measure')} value={measures.findIndex(m => JSON.stringify(m) === JSON.stringify(value))} onChange={e => { const m = measures[Number(e.target.value)]; if (m) onChange(m); }}>{measures.map((m, i) => <option key={i} value={i}>{m.kind === 'custom' ? foodText(m.label, locale) : t(`measures.${m.kind}`)}</option>)}</select>;
}
