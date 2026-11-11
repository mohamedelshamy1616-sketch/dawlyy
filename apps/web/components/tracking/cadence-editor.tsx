'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Button } from '@astryxdesign/core/Button';
import type { TrackingCadence } from '@/src/server/tracking/cadence';
import { metricKinds } from '@/src/server/tracking/contracts';
import { dateValue, trackingRequest } from './contracts';

const units: Record<string, string> = { weight: 'kg', water: 'ml', steps: 'steps', sleep_hours: 'h', habit: 'count', cardio_minutes: 'min', calories_in: 'kcal', mood: 'score', energy: 'score', custom: 'count' };
/** Task 8: configure each metric independently, including weekly and selected weekday cadences. */
export function CadenceEditor({ clientId, initial, today, timezone, onSaved }: { clientId: string; initial: TrackingCadence | null; today: string; timezone: string; onSaved(): void }) {
  const t = useTranslations('tracking');
  const [config, setConfig] = useState<TrackingCadence>(initial ?? { startsOn: today, endsOn: new Date(Date.parse(today) + 28 * 86400000).toISOString().slice(0, 10), timezone, metrics: [] });
  const [metric, setMetric] = useState<typeof metricKinds[number]>('weight');
  const [customKey, setCustomKey] = useState('');
  const [error, setError] = useState(false);
  const measurementSettings: NonNullable<TrackingCadence['measurements']> = config.measurements ?? { rule: { enabled: false, everyDays: 28, firstAfterDays: 28, timeOfDay: '09:00', windowDays: 1 }, fields: [] };
  const photoSettings: NonNullable<TrackingCadence['progressPhotos']> = config.progressPhotos ?? { rule: { enabled: false, everyDays: 28, firstAfterDays: 28, timeOfDay: '09:00', windowDays: 1 }, poses: ['front', 'left', 'back'] };
  function editEvidence(kind: 'measurements' | 'progressPhotos', patch: Partial<typeof measurementSettings.rule>) {
    setConfig(kind === 'measurements' ? { ...config, measurements: { ...measurementSettings, rule: { ...measurementSettings.rule, ...patch } } } : { ...config, progressPhotos: { ...photoSettings, rule: { ...photoSettings.rule, ...patch } } });
  }
  function addMetric() {
    if (config.metrics.some(item => item.metric === metric && (item.metricKey ?? '') === customKey)) return;
    if ((metric === 'custom' || metric === 'habit') && !customKey.trim()) return;
    setConfig({ ...config, metrics: [...config.metrics, { metric, ...(customKey ? { metricKey: customKey } : {}), unit: units[metric] ?? 'count', cadence: { kind: 'none' }, timeOfDay: '07:00' }] });
  }
  return <VStack gap={4} className="min-w-0 max-w-full">
    <Heading level={2}>{t('cadence.title')}</Heading>
    <Text>{t('cadence.description')}</Text>
    <HStack gap={3} wrap="wrap">
      <DateInput label={t('cadence.startsOn')} value={dateValue(config.startsOn)} onChange={value => { if (value) setConfig({ ...config, startsOn: value }); }} controlClassName="min-h-11" />
      <DateInput label={t('cadence.endsOn')} value={dateValue(config.endsOn)} onChange={value => { if (value) setConfig({ ...config, endsOn: value }); }} controlClassName="min-h-11" />
      <TextInput label={t('timezone')} value={config.timezone} onChange={value => setConfig({ ...config, timezone: value })} controlClassName="min-h-11" />
    </HStack>
    {config.metrics.map((item, index) => <VStack key={`${item.metric}:${item.metricKey ?? ''}`} gap={3} className="min-w-0 border-b border-border pb-4">
      <Heading level={3}>{item.metricKey ?? t(`metrics.${item.metric}`)}</Heading>
      <Selector label={t('cadence.frequency')} value={item.cadence.kind} options={['none', 'daily_fasted', 'weekly', 'days_of_week', 'custom'].map(value => ({ value, label: t(`cadence.${value}`) }))} onChange={value => {
        const cadence: typeof item.cadence = value === 'weekly' ? { kind: 'weekly', day: 0 } : value === 'days_of_week' ? { kind: 'days_of_week', days: [0] } : value === 'custom' ? { kind: 'custom', dates: [today] } : value === 'daily_fasted' ? { kind: 'daily_fasted' } : { kind: 'none' };
        setConfig({ ...config, metrics: config.metrics.map((entry, n) => n === index ? { ...entry, cadence } : entry) });
      }} controlClassName="min-h-11" />
      {item.cadence.kind === 'weekly' || item.cadence.kind === 'days_of_week' ? <HStack gap={2} wrap="wrap">{Array.from({ length: 7 }, (_, day) => {
        const cadence = item.cadence;
        const selected = cadence.kind === 'weekly' ? cadence.day === day : cadence.kind === 'days_of_week' && cadence.days.includes(day);
        return <Button key={day} label={t(`weekdays.${day}`)} aria-pressed={selected} variant={selected ? 'primary' : 'secondary'} className="min-h-11 min-w-11" onClick={() => {
          const next = cadence.kind === 'weekly' ? { kind: 'weekly' as const, day } : { kind: 'days_of_week' as const, days: cadence.kind === 'days_of_week' ? selected ? cadence.days.filter(d => d !== day) : [...cadence.days, day] : [day] };
          setConfig({ ...config, metrics: config.metrics.map((entry, n) => n === index ? { ...entry, cadence: next } : entry) });
        }} />;
      })}</HStack> : null}
      {item.cadence.kind === 'custom' ? <TextInput label={t('cadence.customDates')} value={item.cadence.dates.join(', ')} onChange={value => setConfig({ ...config, metrics: config.metrics.map((entry, n) => n === index ? { ...entry, cadence: { kind: 'custom', dates: value.split(',').map(d => d.trim()) } } : entry) })} controlClassName="min-h-11" /> : null}
      <TextInput label={t('unit')} value={item.unit} onChange={value => setConfig({ ...config, metrics: config.metrics.map((entry, n) => n === index ? { ...entry, unit: value } : entry) })} controlClassName="min-h-11" />
      <TextInput label={t('cadence.timeOfDay')} value={item.timeOfDay} onChange={value => setConfig({ ...config, metrics: config.metrics.map((entry, n) => n === index ? { ...entry, timeOfDay: value } : entry) })} controlClassName="min-h-11" />
      <Button label={t('actions.remove')} className="min-h-11" variant="secondary" onClick={() => setConfig({ ...config, metrics: config.metrics.filter((_, n) => n !== index) })} />
    </VStack>)}
    <Selector label={t('metric')} value={metric} options={metricKinds.map(value => ({ value, label: t(`metrics.${value}`) }))} onChange={value => { const found = metricKinds.find(kind => kind === value); if (found) { setMetric(found); setCustomKey(''); } }} controlClassName="min-h-11" />
    {metric === 'habit' || metric === 'custom' ? <TextInput label={t('customKey')} value={customKey} onChange={setCustomKey} controlClassName="min-h-11" /> : null}
    {(['measurements', 'progressPhotos'] as const).map(kind => {
      const settings = kind === 'measurements' ? measurementSettings : photoSettings;
      return <VStack key={kind} gap={3} className="min-w-0 border-t border-border pt-4">
        <Heading level={3}>{t(kind === 'measurements' ? 'measurements.title' : 'photos.title')}</Heading>
        <Button label={t(settings.rule.enabled ? 'cadence.disable' : 'cadence.enable')} className="min-h-11" variant="secondary" aria-pressed={settings.rule.enabled} onClick={() => editEvidence(kind, { enabled: !settings.rule.enabled })} />
        <HStack gap={3} wrap="wrap"><NumberInput label={t('cadence.everyDays')} value={settings.rule.everyDays} onChange={value => editEvidence(kind, { everyDays: value })} min={1} max={366} step={1} controlClassName="min-h-11" /><NumberInput label={t('cadence.firstAfterDays')} value={settings.rule.firstAfterDays} onChange={value => editEvidence(kind, { firstAfterDays: value })} min={0} max={366} step={1} controlClassName="min-h-11" /></HStack>
        <TextInput label={t('cadence.timeOfDay')} value={settings.rule.timeOfDay} onChange={value => editEvidence(kind, { timeOfDay: value })} controlClassName="min-h-11" />
      </VStack>;
    })}
    <TextInput label={t('cadence.measurementFields')} value={measurementSettings.fields.map(field => field.type).join(', ')} onChange={value => setConfig({ ...config, measurements: { ...measurementSettings, fields: value.split(',').map(type => type.trim()).filter(Boolean).map(type => ({ type, unit: measurementSettings.fields.find(field => field.type === type)?.unit ?? 'cm' })) } })} controlClassName="min-h-11" />
    {measurementSettings.fields.map(field => <Selector key={field.type} label={field.type} value={field.unit} options={(['cm', 'in'] as const).map(unit => ({ value: unit, label: t(`units.${unit}`) }))} onChange={value => { if (value === 'cm' || value === 'in') setConfig({ ...config, measurements: { ...measurementSettings, fields: measurementSettings.fields.map(item => item.type === field.type ? { ...item, unit: value } : item) } }); }} controlClassName="min-h-11" />)}
    <Text>{t('cadence.requiredPoses')}</Text>
    <HStack gap={2} wrap="wrap">{(['front', 'left', 'right', 'back'] as const).map(pose => <Button key={pose} label={t(`photos.poses.${pose}`)} className="min-h-11" variant="secondary" aria-pressed={photoSettings.poses.includes(pose)} onClick={() => setConfig({ ...config, progressPhotos: { ...photoSettings, poses: photoSettings.poses.includes(pose) ? photoSettings.poses.filter(item => item !== pose) : [...photoSettings.poses, pose] } })} />)}</HStack>
    <HStack gap={3} wrap="wrap"><Button label={t('actions.addMetric')} className="min-h-11" variant="secondary" onClick={addMetric} /><Button label={t('actions.saveCadence')} className="min-h-11" clickAction={async () => { setError(false); try { await trackingRequest(`metrics/cadence/${clientId}`, 'PUT', config); onSaved(); } catch { setError(true); } }} /></HStack>
    {error ? <Text role="alert">{t('errors.validation_error')}</Text> : null}
  </VStack>;
}
