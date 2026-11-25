'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useClientModules } from '@/components/client-today/client-module-provider';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import { CadenceEditor } from './cadence-editor';
import { MetricCard } from './metric-card';
import { ProgressPanel } from './progress-panel';
import { dateValue, trackingRequest, type ListPage, type MetricRow, type MeasurementRow, type PhotoRow } from './contracts';

/** The pre-integration server page mapper still passes Date objects for voidedAt. */
type HistoryInput<Row> = Omit<Row, 'createdAt' | 'voidedAt'> & { createdAt?: string | Date | null; voidedAt?: string | Date | null };
function historyTimestamp(value: string | Date | null | undefined): string | null {
  return value instanceof Date ? Number.isFinite(value.getTime()) ? value.toISOString() : null : value ?? null;
}

/** Task 8: shared client tracking/progress and coach client-tracking surface, inside the existing shell. */
export function TrackingScreen({ clientId, mode, today, timezone, cadence, metrics: initialMetrics, measurements, photos }: { clientId: string; mode: 'tracking' | 'progress' | 'coach'; today: string; timezone: string; cadence: TrackingCadence | null; metrics: ListPage<HistoryInput<MetricRow>>; measurements: ListPage<HistoryInput<MeasurementRow>>; photos: ListPage<PhotoRow> }) {
  const t = useTranslations('tracking'); const corrections = useTranslations('clientCorrections'); const locale = useLocale(); const router = useRouter();
  const { modules, numerals } = useClientModules();
  const showMeasurements = mode === 'coach' || !!modules?.measurements; const showPhotos = mode === 'coach' || !!modules?.progress_photos;
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const pending = (id: string, active: boolean) => setPendingIds(current => { const next = new Set(current); if (active) next.add(id); else next.delete(id); return next; });
  const [date, setDate] = useState(today); const [metrics, setMetrics] = useState<ListPage<MetricRow>>(() => ({ ...initialMetrics, items: initialMetrics.items.map(row => ({ ...row, createdAt: historyTimestamp(row.createdAt), voidedAt: historyTimestamp(row.voidedAt) })) })); const [sets, setSets] = useState<ListPage<MeasurementRow>>(() => ({ ...measurements, items: measurements.items.map(row => ({ ...row, createdAt: historyTimestamp(row.createdAt), voidedAt: historyTimestamp(row.voidedAt) })) })); const [images, setImages] = useState(photos); const [error, setError] = useState(false);
  const title = t(mode === 'coach' ? 'coachTitle' : mode === 'progress' ? 'progressTitle' : 'title');
  const number = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale), numerals, maximumFractionDigits: 2 }) };
  const percent = new Intl.NumberFormat(locale, { numberingSystem: numerals, style: 'percent', maximumFractionDigits: 2 });
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: numerals }).format(new Date(`${value}T12:00:00Z`));
  const refresh = useCallback(async () => {
    setError(false);
    try {
      const suffix = `?clientId=${encodeURIComponent(clientId)}&limit=50`;
      if (showMeasurements) {
        const metricPage = await trackingRequest<ListPage<MetricRow>>(`metrics${suffix}`);
        const measurementPage = await trackingRequest<ListPage<MeasurementRow>>(`measurements${suffix}`);
        if (mounted.current) { setMetrics(metricPage); setSets(measurementPage); setPendingIds(current => new Set([...current].filter(id => !metricPage.items.some(row => row.id === id && row.voidedAt)))); }
      }
      if (showPhotos) { const photoPage = await trackingRequest<ListPage<PhotoRow>>(`photos${suffix}`); if (mounted.current) setImages(photoPage); }
      router.refresh();
    } catch { if (mounted.current) setError(true); }
  }, [clientId, showMeasurements, showPhotos, router]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  const currentMetrics = metrics.items.filter(item => !item.voidedAt && !pendingIds.has(item.id));
  const corrected = new Set(currentMetrics.flatMap(item => item.correctionOf ? [item.correctionOf] : []));
  const weights = currentMetrics.filter(item => item.metric === 'weight' && !corrected.has(item.id));
  const weight = weights[0]; const prior = weight ? weights.find(item => item.id !== weight.id && (item.unit === weight.unit || ['kg', 'lb'].includes(item.unit) && ['kg', 'lb'].includes(weight.unit))) : undefined;
  const baseline = weight && prior ? prior.value * (prior.unit === weight.unit ? 1 : weight.unit === 'kg' ? 0.45359237 : 1 / 0.45359237) : null;
  // Compare entries recorded in the current unit. Older pages may add more points.
  const trend = weights.filter(entry => entry.unit === weight?.unit).slice(0, 7).reverse();
  const low = Math.min(...trend.map(entry => entry.value));
  const high = Math.max(...trend.map(entry => entry.value));
  const points = trend.map((entry, index) => {
    const x = 3 + index * 122 / Math.max(1, trend.length - 1);
    const y = high === low ? 18 : 32 - (entry.value - low) * 28 / (high - low);
    return `${x},${y}`;
  }).join(' ');
  const delta = weight ? numericDelta(weight.value, baseline) : null;
  return <Layout content={<LayoutContent><VStack gap={6} className="min-w-0 max-w-full text-start">
    <PageHeader title={title} subtitle={t('subtitle')} />
    <HStack gap={3} wrap="wrap"><DateInput label={t('date')} value={dateValue(date)} onChange={value => { if (value) setDate(value); }} controlClassName="min-h-11" /><Button label={t('actions.refresh')} className="min-h-11" variant="secondary" clickAction={refresh} /></HStack>
    {mode === 'coach' ? <CadenceEditor clientId={clientId} initial={cadence} today={today} timezone={timezone} onSaved={() => { void refresh(); }} /> : null}
    {showMeasurements && mode !== 'progress' ? <>
      <Heading level={2}>{t('logTitle')}</Heading>
      {cadence && cadence.metrics.length ? <HStack gap={4} className="!grid grid-cols-1 md:grid-cols-2 min-w-0 max-w-full">{cadence.metrics.map(metric => <MetricCard key={`${metric.metric}:${metric.metricKey ?? ''}`} metric={metric} config={cadence} date={date} entries={currentMetrics} clientId={clientId} onSaved={() => { void refresh(); }} />)}</HStack> : <EmptyState Icon={Activity} title={t('empty.title')} description={t('empty.description')} />}
    </> : null}
    {mode !== 'tracking' ? <>
      {showMeasurements ? <><Heading level={2}>{t('weightProgress')}</Heading>
      {showMeasurements && trend.length > 1 && weight ? <figure className="m-0 grid gap-2 rounded-xl bg-card p-4 shadow-card-edge">
        <svg viewBox="0 0 128 36" aria-hidden="true" className="h-12 w-44 max-w-full text-brand rtl:-scale-x-100">
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <figcaption>{t('weightTrend', { count: number.format(trend.length), from: number.format(trend[0]!.value),
          to: number.format(weight.value), unit: t.has(`units.${weight.unit}`) ? t(`units.${weight.unit}`) : weight.unit })}</figcaption>
      </figure> : null}
      {weight && delta ? <Text>{number.format(weight.value)} {t.has(`units.${weight.unit}`) ? t(`units.${weight.unit}`) : weight.unit} · {t('delta', { absolute: delta.absolute === null ? t('noBaseline') : number.format(delta.absolute), percent: delta.percent === null ? t('noBaseline') : percent.format(delta.percent / 100) })}</Text> : <Text>{t('noWeights')}</Text>}</> : null}
      <ProgressPanel staffMode={mode === 'coach'} clientId={clientId} date={date} measurements={sets.items} photos={images.items} cadence={cadence} onSaved={() => { void refresh(); }} />
      <HStack gap={3} wrap="wrap">
        {showMeasurements && sets.nextCursor ? <Button label={t('actions.moreMeasurements')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<MeasurementRow>>(`measurements?clientId=${clientId}&cursor=${sets.nextCursor}`); if (mounted.current) setSets({ items: [...sets.items, ...next.items], nextCursor: next.nextCursor }); } catch { if (mounted.current) setError(true); } }} /> : null}
        {showPhotos && images.nextCursor ? <Button label={t('actions.morePhotos')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<PhotoRow>>(`photos?clientId=${clientId}&cursor=${images.nextCursor}`); if (mounted.current) setImages({ items: [...images.items, ...next.items], nextCursor: next.nextCursor }); } catch { if (mounted.current) setError(true); } }} /> : null}
      </HStack>
    </> : null}
    {showMeasurements ? <><Heading level={2}>{t('history')}</Heading>
    {metrics.items.length ? metrics.items.map(entry => <HStack key={entry.id} id={`metric-${entry.id}`} data-entry-id={entry.id} gap={3} wrap="wrap" className="min-w-0 border-b border-border pb-3"><Text className="break-words">{formatDate(entry.localDate)} · {entry.metricKey ?? t(`metrics.${entry.metric}`)} · {number.format(entry.value)} {t.has(`units.${entry.unit}`) ? t(`units.${entry.unit}`) : entry.unit}</Text>{entry.voidedAt ? <Text>{corrections('voided')}</Text> : pendingIds.has(entry.id) ? <Text>{corrections('pending')}</Text> : null}<EntryActions kind="metric" id={entry.id} createdAt={entry.createdAt} voidedAt={entry.voidedAt} onChanged={() => { void refresh(); }} onPendingChange={active => pending(entry.id, active)} /></HStack>) : <EmptyState Icon={Activity} title={t('historyEmpty')} />}
    {metrics.nextCursor ? <Button label={t('actions.more')} className="min-h-11" variant="secondary" clickAction={async () => { try { const next = await trackingRequest<ListPage<MetricRow>>(`metrics?clientId=${clientId}&cursor=${metrics.nextCursor}`); if (mounted.current) setMetrics({ items: [...metrics.items, ...next.items], nextCursor: next.nextCursor }); } catch { if (mounted.current) setError(true); } }} /> : null}
    </> : null}
    {error ? <Text role="alert">{t('errors.request_failed')}</Text> : null}
  </VStack></LayoutContent>} />;
}
