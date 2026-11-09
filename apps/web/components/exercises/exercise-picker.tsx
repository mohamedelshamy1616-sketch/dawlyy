'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dumbbell } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { ExerciseListItem } from '@/src/server/exercises/service';
import { exerciseRequest } from './http';

/** Task 4 / T4b: public picker item mirrors GET /api/v1/exercises. */
export type PickerExercise = ExerciseListItem;

/** Task 4 / T4b: debounced, keyboard-accessible picker suitable for a mobile Sheet. */
export function ExercisePicker({ onSelect }: { onSelect(exercise: PickerExercise): void }) {
  const t = useTranslations('exercises');
  const locale = useLocale();
  const id = useId();
  const [q, setQ] = useState('');
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [items, setItems] = useState<PickerExercise[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true); setError(false);
      exerciseRequest<{ items: PickerExercise[]; nextCursor: string | null }>(`?${new URLSearchParams({ q, limit: '30' })}`, { signal: controller.signal })
        .then((result) => { setItems(result.items); setCursor(result.nextCursor); setResolvedQuery(q); })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, retry]);
  async function more() {
    if (!cursor || resolvedQuery !== q) return;
    const current = generation.current;
    setBusy(true); setError(false);
    try {
      const result = await exerciseRequest<{ items: PickerExercise[]; nextCursor: string | null }>(`?${new URLSearchParams({ q, limit: '30', cursor })}`);
      if (current === generation.current) { setItems((previous) => [...previous, ...result.items]); setCursor(result.nextCursor); }
    } catch { if (current === generation.current) setError(true); } finally { if (current === generation.current) setBusy(false); }
  }
  return <div className="flex min-w-0 max-w-full flex-col gap-3">
    <label htmlFor={id}>{t('search')}</label>
    <Input id={id} value={q} onChange={(event) => { setQ(event.target.value); setCursor(null); }} className="min-h-11" />
    <div role="status" aria-live="polite">{busy ? t('loading') : null}</div>
    {error ? <div role="alert">{t('errors.request')}<Button type="button" className="min-h-11" onClick={() => setRetry((value) => value + 1)}>{t('retry')}</Button></div> : null}
    {!busy && !error && !items.length ? <EmptyState Icon={Dumbbell} title={t('noResults')} description={t('noResultsBody')} /> : null}
    <ul className="max-h-[60dvh] min-w-0 overflow-y-auto" aria-label={t('picker')} aria-busy={busy}>
      {items.map((exercise) => <li key={exercise.id}><Button type="button" variant="ghost" disabled={busy || resolvedQuery !== q} className="h-auto min-h-11 w-full justify-start whitespace-normal text-start" onClick={() => onSelect(exercise)}>
        <span className="min-w-0 break-words">{(locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar)}<span className="block text-xs text-muted-foreground">{exercise.primaryMuscles.join(' · ')}</span></span>
      </Button></li>)}
    </ul>
    {cursor && resolvedQuery === q ? <Button type="button" className="min-h-11" variant="outline" disabled={busy} onClick={more}>{t('loadMore')}</Button> : null}
  </div>;
}
