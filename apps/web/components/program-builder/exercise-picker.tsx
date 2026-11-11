'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dumbbell } from 'lucide-react';
import { z } from 'zod';
import { EmptyState } from '@/src/components/shell/empty-state';
import { programRequest } from './transport';

const resultSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.object({ ar: z.string().optional(), en: z.string().optional() }), primaryMuscles: z.array(z.string()), equipment: z.array(z.string()), category: z.string(), hidden: z.boolean(), source: z.string() })), nextCursor: z.string().nullable() });
type Exercise = z.infer<typeof resultSchema>['items'][number];

/** Task 4b: independent HTTP exercise picker, consuming T4a's published list endpoint only. */
export function ExercisePicker({ onPick, disabled = false }: { onPick: (exercise: Exercise) => void; disabled?: boolean }) {
  const t = useTranslations('programs'); const locale = useLocale();
  const [q, setQ] = useState(''); const [items, setItems] = useState<Exercise[]>([]);
  const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(true); const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const timer = setTimeout(() => {
      setBusy(true); setFailed(false);
      void programRequest<unknown>(`/api/v1/exercises?${new URLSearchParams({ q, limit: '20' })}`, { signal: controller.signal })
        .then(raw => { if (generation.current !== token) return; const result = resultSchema.parse(raw); setItems(result.items); setCursor(result.nextCursor); })
        .catch(() => { if (!controller.signal.aborted && generation.current === token) setFailed(true); })
        .finally(() => { if (!controller.signal.aborted && generation.current === token) setBusy(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q]);
  async function more() {
    if (!cursor || busy) return;
    const token = generation.current; setBusy(true); setFailed(false);
    const controller = new AbortController(); active.current = controller;
    try {
      const result = resultSchema.parse(await programRequest<unknown>(`/api/v1/exercises?${new URLSearchParams({ q, limit: '20', cursor })}`, { signal: controller.signal }));
      if (token === generation.current) { setItems(old => [...old, ...result.items.filter(row => !old.some(item => item.id === row.id))]); setCursor(result.nextCursor); }
    } catch { if (!controller.signal.aborted && token === generation.current) setFailed(true); }
    finally { if (!controller.signal.aborted && token === generation.current) setBusy(false); }
  }
  const visible = items.filter(item => !item.hidden);
  return <Grid gap={3} className="min-w-0 max-w-full">
    <TextInput label={t('exerciseSearch')} isLabelHidden aria-label={t('exerciseSearch')} placeholder={t('exerciseSearch')} value={q} onChange={setQ} controlClassName="min-h-11" />
    <VStack aria-live="polite">{busy ? <Text as="p">{t('loading')}</Text> : failed ? <Text as="p" role="alert">{t('errors.requestFailed')}</Text> : null}</VStack>
    {!busy && !failed && !visible.length ? <EmptyState Icon={Dumbbell} title={t('noExercises')} description={t('exerciseSearchHint')} /> : null}
    <Grid gap={1} className="max-h-72 min-w-0 overflow-y-auto">
      {visible.map(item => <Button key={item.id} type="button" variant="secondary" isDisabled={disabled || busy} onClick={() => onPick(item)} className="h-auto min-h-11 min-w-11 max-w-full justify-start whitespace-normal py-3 text-start [overflow-wrap:anywhere]" label={(locale === 'ar' ? item.name.ar || item.name.en : item.name.en || item.name.ar) || ''} />)}
    </Grid>
    {cursor ? <Button type="button" variant="secondary" className="min-h-11 min-w-11" isDisabled={busy} onClick={() => void more()} label={t('loadMore')} /> : null}
  </Grid>;
}
