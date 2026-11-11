'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { DateInput } from '@astryxdesign/core/DateInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { LocalizedText } from '@dawlyy/core/types';
import { isIsoDay } from './date';
import { foodText } from './shared';
import { nutritionRequest } from './transport';
import type { DailyLogs } from './types';

const BADGE = { eaten: 'success', partial: 'warning', skipped: 'neutral' } as const;
/** Task 6: day-by-day log history for the client; meal names come from the published plan. */
export function ClientNutritionHistory({ today, initial, mealNames, supplementNames }: { today: string; initial: DailyLogs; mealNames: Record<string, LocalizedText>; supplementNames: Record<string, LocalizedText> }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale);
  const [date, setDate] = useState(initial.localDate); const [data, setData] = useState(initial); const [loading, setLoading] = useState(false); const [error, setError] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const controller = new AbortController();
    // The date picker drives this fetch; loading is part of that transition.
    setLoading(true); setError(false);
    nutritionRequest<DailyLogs>(`/api/v1/meal-logs?date=${encodeURIComponent(date)}&limit=100`, { signal: controller.signal })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date]);
  const empty = !data.items.length && !data.supplements.length && data.waterMl === 0;
  return <VStack gap={4} width="100%" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <DateInput label={t('client.pickDate')} value={isIsoDay(date) ? date : undefined} max={isIsoDay(today) ? today : undefined} onChange={v => { if (v) setDate(v); }} />
    {error ? <Banner status="error" title={t('errors.request')} /> : null}
    {loading ? <Text color="secondary">{t('common.loading')}</Text> : null}
    {!loading && !error && empty ? <EmptyState icon={<History aria-hidden />} title={t('client.historyEmptyTitle')} description={t('client.historyEmptyBody')} /> : null}
    {data.items.map(log => <Card key={log.id} padding={4}><VStack gap={1} width="100%">
      <HStack gap={2} wrap="wrap" vAlign="center">
        <Heading level={3} type="display-3" wordBreak="break-word">{log.mealId ? foodText(mealNames[log.mealId], locale) || t('client.mealUnknown') : t('client.offPlan')}</Heading>
        <Badge variant={log.status === 'eaten' || log.status === 'partial' || log.status === 'skipped' ? BADGE[log.status] : 'neutral'} label={log.status === 'eaten' || log.status === 'partial' || log.status === 'skipped' ? t(`client.status.${log.status}`) : log.status} />
      </HStack>
      {log.freeEntry?.text ? <Text wordBreak="break-word">{log.freeEntry.text}</Text> : null}
      {log.note ? <Text type="supporting" color="secondary" wordBreak="break-word">{log.note}</Text> : null}
    </VStack></Card>)}
    {data.supplements.length ? <Card padding={4}><VStack gap={1} width="100%">
      <Heading level={3} type="display-3">{t('supplements.title')}</Heading>
      {data.supplements.map(s => <Text key={s.clientUuid} wordBreak="break-word">{foodText(supplementNames[s.supplementId], locale) || t('client.supplementUnknown')} · {s.taken ? t('supplements.taken') : t('supplements.skipped')}</Text>)}
    </VStack></Card> : null}
    {data.waterMl > 0 ? <Card padding={4}><Text weight="semibold">{t('client.waterTotal', { value: n.format(data.waterMl) })}</Text></Card> : null}
    <Button size="lg" variant="ghost" href="/app/nutrition" label={t('client.backToMeals')} />
  </VStack>;
}
