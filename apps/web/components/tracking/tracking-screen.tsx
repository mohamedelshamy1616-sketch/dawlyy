'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Activity } from 'lucide-react';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Button } from '@astryxdesign/core/Button';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { TrackingCadence } from '@/src/server/tracking/cadence';
import { numericDelta } from '@/src/server/tracking/helpers';
import { CadenceEditor } from './cadence-editor';
import { MetricCard } from './metric-card';
import { ProgressPanel } from './progress-panel';
import { dateValue, trackingRequest, type ListPage, type MetricRow, type MeasurementRow, type PhotoRow } from './contracts';

/** Task 8: shared client tracking/progress and coach client-tracking surface, inside the existing shell. */
export function TrackingScreen({ clientId, mode, today, timezone, cadence, metrics: initialMetrics, measurements, photos }: { clientId: string; mode: 'tracking' | 'progress' | 'coach'; today: string; timezone: string; cadence: TrackingCadence | null; metrics: ListPage<MetricRow>; measurements: ListPage<MeasurementRow>; photos: ListPage<PhotoRow> }) {
  const t = useTranslations('tracking'); const locale = useLocale(); const router = useRouter();
  const [date, setDate] = useState(today); const [metrics, setMetrics] = useState(initialMetrics); const [sets, setSets] = useState(measurements); const [images, setImages] = useState(photos); const [error, setError] = useState(false);
  const title = t(mode === 'coach' ? 'coachTitle' : mode === 'progress' ? 'progressTitle' : 'title');
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  async function refresh() {
    setError(false);
    try {
      const suffix = `?clientId=${clientId}&limit=100`;
      setMetrics(await trackingRequest(`metrics${suffix}`)); setSets(await trackingRequest(`measurements${suffix}`)); setImages(await trackingRequest(`photos${suffix}`)); router.refresh();
    } catch { setError(true); }
  }
  const corrected = new Set(metrics.items.flatMap(item => item.correctionOf ? [item.correctionOf] : []));
  const weights = metrics.items.filter(item => item.metric === 'weight' && !corrected.has(item.id));
  const weight = weights[0]; const prior = weight ? weights.find(item => item.id !== weight.id && (item.unit === weight.unit || ['kg', 'lb'].includes(item.unit) && ['kg', 'lb'].includes(weight.unit))) : undefined;
  const baseline = weight && prior ? prior.value * (prior.unit === weight.unit ? 1 : weight.unit === 'kg' ? 0.45359237 : 1 / 0.45359237) : null;
  const delta = weight ? numericDelta(weight.value, baseline) : null;
  return <Layout content={<LayoutContent><VStack gap={6} className="min-w-0 max-w-full text-start">
    <PageHeader title={title} subtitle={t('subtitle')} />
    <HStack gap={3} wrap="wrap"><DateInput label={t('date')} value={dateValue(date)} onChange={value => { if (value) setDate(value); }} controlClassName="min-h-11" /><Button label={t('actions.refresh')} className="min-h-11" variant="secondary" clickAction={refresh} /></HStack>
    {mode === 'coach' ? <CadenceEditor clientId={clientId} initial={cadence} today={today} timezone={timezone} onSaved={() => { void refresh(); }} /> : null}
    {mode !== 'progress' ? <>
      <Heading level={2}>{t('logTitle')}</Heading>
      {cadence && cadence.metrics.length ? <HStack gap={4} className="!grid grid-cols-1 md:grid-cols-2 min-w-0 max-w-full">{cadence.metrics.map(metric => <MetricCard key={`${metric.metric}:${metric.metricKey ?? ''}`} metric={metric} config={cadence} date={date} entries={metrics.items} clientId={clientId} onSaved={() => { void refresh(); }} />)}</HStack> : <EmptyState Icon={Activity} title={t('empty.title')} description={t('empty.description')} />}
    </> : null}
    {mode !== 'tracking' ? <>
      <Heading level={2}>{t('weightProgress')}</Heading>
      {weight && delta ? <Text>{number.format(weight.value)} {t.has(`units.${weight.unit}`) ? t(`units.${weight.unit}`) : weight.unit} · {t('delta', { absolute: delta.absolute === null ? t('noBaseline') : number.format(delta.absolute), percent: delta.percent === null ? t('noBaseline') : percent.format(delta.percent / 100) })}</Text> : <Text>{t('noWeights')}</Text>}
      <ProgressPanel clientId={clientId} date={date} measurements={sets.items} photos={images.items} cadence={cadence} onSaved={() => { void refresh(); }} />
      <HStack gap={3} wrap="wrap">
        {sets.nextCursor ? <Button label={t('actions.moreMeasurements')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<MeasurementRow>>(`measurements?clientId=${clientId}&cursor=${sets.nextCursor}`); setSets({ items: [...sets.items, ...next.items], nextCursor: next.nextCursor }); } catch { setError(true); } }} /> : null}
        {images.nextCursor ? <Button label={t('actions.morePhotos')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<PhotoRow>>(`photos?clientId=${clientId}&cursor=${images.nextCursor}`); setImages({ items: [...images.items, ...next.items], nextCursor: next.nextCursor }); } catch { setError(true); } }} /> : null}
      </HStack>
    </> : null}
    <Heading level={2}>{t('history')}</Heading>
    {metrics.items.length ? metrics.items.map(entry => <HStack key={entry.id} gap={3} wrap="wrap" className="min-w-0 border-b border-border pb-3"><Text className="break-words">{formatDate(entry.localDate)} · {entry.metricKey ?? t(`metrics.${entry.metric}`)} · {number.format(entry.value)} {t.has(`units.${entry.unit}`) ? t(`units.${entry.unit}`) : entry.unit}</Text></HStack>) : <EmptyState Icon={Activity} title={t('historyEmpty')} />}
    {metrics.nextCursor ? <Button label={t('actions.more')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<MetricRow>>(`metrics?clientId=${clientId}&cursor=${metrics.nextCursor}`); setMetrics({ items: [...metrics.items, ...next.items], nextCursor: next.nextCursor }); } catch { setError(true); } }} /> : null}
    {error ? <Text role="alert">{t('errors.request_failed')}</Text> : null}
  </VStack></LayoutContent>} />;
}
