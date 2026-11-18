'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { LocalizedText } from '@dawlyy/core/types';
import { useRouter } from '@/i18n/navigation';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { MealEditor } from '@/components/client-corrections/meal-editor';
import type { MealHistoryRow } from '@/src/lib/client-corrections/types';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import { isIsoDay } from './date';
import { foodText } from './shared';
import { nutritionRequest } from './transport';
import { mealHistoryRow, type ClientNutrition, type DailyLogs } from './types';

/** Immutable originals remain readable, including voided/replaced rows. */
export function ClientNutritionHistory({ today, initial, mealNames, supplementNames }: { today: string; initial: DailyLogs; mealNames: Record<string, LocalizedText>; supplementNames: Record<string, LocalizedText> }) {
  const t = useTranslations('nutrition'); const c = useTranslations('clientCorrections'); const locale = useLocale();
  const modules = useClientModules(); const router = useRouter();
  const [date, setDate] = useState(initial.localDate); const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(false);
  const [plan, setPlan] = useState<ClientNutrition | null>(null); const [editing, setEditing] = useState<MealHistoryRow | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const mounted = useRef(false); const request = useRef(0); const selectedDate = useRef(date);
  useEffect(() => { selectedDate.current = date; }, [date]);
  const refresh = useCallback(async (chosenDate: string, more = false, cursor?: string | null) => {
    const generation = ++request.current; setLoading(true); setError(false);
    try {
      const next = await nutritionRequest<DailyLogs>(`/api/v1/meal-logs?date=${encodeURIComponent(chosenDate)}&limit=50${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (!mounted.current || generation !== request.current) return;
      setData(previous => more ? { ...next, items: [...previous.items, ...next.items.filter(row => !previous.items.some(old => old.id === row.id))] } : next);
    } catch { if (mounted.current && generation === request.current) setError(true); }
    finally { if (mounted.current && generation === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    nutritionRequest<ClientNutrition>('/api/v1/nutrition/me', { signal: controller.signal }).then(value => { if (mounted.current) setPlan(value); }).catch(() => { /* Free entry correction remains available without a plan. */ });
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(selectedDate.current); };
    document.addEventListener('visibilitychange', foreground);
    void refresh(selectedDate.current);
    return () => { mounted.current = false; controller.abort(); document.removeEventListener('visibilitychange', foreground); };
  }, [refresh]);
  const changed = () => { void refresh(selectedDate.current); router.refresh(); };
  const empty = !data.items.length && !data.supplements.length && data.waterMl === 0;
  const displayDate = new Intl.DateTimeFormat(locale, { numberingSystem: modules.numerals, year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${data.localDate}T12:00:00Z`));
  return <VStack gap={4} width="100%" className="min-w-0 max-w-full break-words">
    <DateInput controlClassName="min-h-11" label={t('client.pickDate')} value={isIsoDay(date) ? date : undefined} max={isIsoDay(today) ? today : undefined} onChange={value => { if (value) { setDate(value); void refresh(value); } }} />
    <Text type="supporting">{displayDate}</Text>
    {error ? <HStack gap={2} wrap="wrap"><Banner status="error" title={t('errors.request')} /><Button size="lg" className="min-h-11" label={c('retry')} onClick={() => void refresh(date)} /></HStack> : null}
    {loading ? <Text role="status">{t('common.loading')}</Text> : null}
    {!loading && !error && empty ? <VStack gap={1}><Heading level={2} type="display-3">{t('client.historyEmptyTitle')}</Heading><Text>{t('client.historyEmptyBody')}</Text></VStack> : null}
    <VStack gap={3} width="100%" as="ul">{data.items.map(log => {
      const row = mealHistoryRow(log, data.localDate); const replacement = data.items.find(item => item.replacesId === log.id);
      return <VStack key={log.id} as="li" gap={2} width="100%" className="min-w-0 max-w-full list-none break-words" id={`meal-${log.id}`} data-entry-id={log.id}>
        <Heading level={3} type="display-3" wordBreak="break-word">{log.mealId ? foodText(mealNames[log.mealId], locale) || t('client.mealUnknown') : t('client.offPlan')}</Heading>
        <Text>{log.status === 'eaten' || log.status === 'partial' || log.status === 'skipped' ? t(`client.status.${log.status}`) : log.status}</Text>
        {log.freeEntry?.text ? <Text wordBreak="break-word">{log.freeEntry.text}</Text> : null}
        {log.note ? <Text type="supporting" color="secondary" wordBreak="break-word">{log.note}</Text> : null}
        {pending[log.id] ? <Text role="status">{c('pending')}</Text> : null}
        {log.voidedAt || replacement ? <HStack gap={2} wrap="wrap"><Text>{replacement ? c('replaced') : c('voided')}</Text>{replacement ? <Button size="lg" variant="ghost" className="min-h-11" href={`#meal-${replacement.id}`} label={c('replacementLink')} /> : null}</HStack> : null}
        <EntryActions kind="meal" id={row.id} createdAt={row.createdAt} voidedAt={row.voidedAt ?? (replacement ? replacement.createdAt ?? 'replaced' : null)} onEdit={() => setEditing(row)} onChanged={changed} onPendingChange={value => setPending(previous => ({ ...previous, [row.id]: value }))} />
      </VStack>;
    })}</VStack>
    {data.nextCursor ? <Button size="lg" className="min-h-11" variant="secondary" isDisabled={loading} label={t('common.more')} onClick={() => void refresh(date, true, data.nextCursor)} /> : null}
    {data.supplements.length ? <VStack gap={1} width="100%"><Heading level={3} type="display-3">{t('supplements.title')}</Heading>{data.supplements.map(supplement => <Text key={supplement.clientUuid} wordBreak="break-word">{foodText(supplementNames[supplement.supplementId], locale) || t('client.supplementUnknown')} · {supplement.taken ? t('supplements.taken') : t('supplements.skipped')}</Text>)}</VStack> : null}
    {data.waterMl > 0 ? <Text weight="semibold">{t('client.waterTotal', { value: formatNumber(data.waterMl, { locale: numberLocale(locale), numerals: modules.numerals }) })}</Text> : null}
    <Button size="lg" variant="ghost" className="min-h-11" href="/app/nutrition" label={t('client.backToMeals')} />
    {editing ? <MealEditor row={editing} plan={plan} onClose={() => setEditing(null)} onChanged={changed} onPendingChange={value => setPending(previous => ({ ...previous, [editing.id]: value }))} /> : null}
  </VStack>;
}
