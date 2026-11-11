'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Button } from '@astryxdesign/core/Button';
import type { TrackingCadence } from '@/src/server/tracking/cadence';
import { expectedEntries } from '@/src/server/tracking/helpers';
import { localDateOf, zonedDueAt } from '@dawlyy/core/schedule';
import { trackingRequest, type ListPage, type MetricRow } from './contracts';

/** Task 8: one large numeric control per configured metric, showing only expected missing dates. */
export function MetricCard({ metric, config, date, entries, clientId, onSaved }: { metric: TrackingCadence['metrics'][number]; config: TrackingCadence; date: string; entries: MetricRow[]; clientId: string; onSaved(): void }) {
  const t = useTranslations('tracking'); const status = useTranslations('status');
  const [value, setValue] = useState<number | null>(null); const [error, setError] = useState(false);
  const [presence, setPresence] = useState<{ date: string; exists: boolean } | null>(null);
  const expected = expectedEntries(metric.cadence, config.startsOn, config.endsOn, config.timezone).includes(date);
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ clientId, metric: metric.metric, from: date, to: date, limit: '1' });
    if (metric.metricKey) query.set('metricKey', metric.metricKey);
    void trackingRequest<ListPage<MetricRow>>(`metrics?${query}`).then(result => { if (active) setPresence({ date, exists: result.items.length > 0 }); }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [clientId, date, metric.metric, metric.metricKey, entries]);
  const logged = presence?.date === date ? presence.exists : null;
  return <VStack gap={3} className="min-w-0 max-w-full rounded-xl border border-border p-4">
    <Heading level={3}>{metric.metricKey ?? t(`metrics.${metric.metric}`)}</Heading>
    <Text role="status">{logged === null ? t('checking') : logged ? status('complete') : expected ? t('missing') : t('notExpected')}</Text>
    <NumberInput label={t('value')} value={value} onChange={setValue} hasClear min={0} max={999999999} step={metric.metric === 'steps' ? 1 : 0.1} units={t.has(`units.${metric.unit}`) ? t(`units.${metric.unit}`) : metric.unit} size="lg" controlClassName="min-h-11 text-2xl" />
    <Button label={t('actions.log')} className="min-h-11" isDisabled={value === null} clickAction={async () => {
      if (value === null) return; setError(false);
      try {
        const now = new Date().toISOString();
        const recordedAt = localDateOf(now, config.timezone) === date ? now : zonedDueAt(date, metric.timeOfDay, config.timezone);
        await trackingRequest('metrics', 'POST', { clientId, metric: metric.metric, metricKey: metric.metricKey, value, unit: metric.unit, timezone: config.timezone, recordedAt, clientUuid: crypto.randomUUID() }); setValue(null); onSaved();
      } catch { setError(true); }
    }} />
    {error ? <Text role="alert">{t('errors.request_failed')}</Text> : null}
  </VStack>;
}
