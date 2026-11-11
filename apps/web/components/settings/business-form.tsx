'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import type { BusinessView } from '@/src/server/settings/service';
import { errorKey, settingsRequest } from './request';

const ZONES = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Beirut', 'Asia/Amman', 'Africa/Casablanca', 'Africa/Tunis', 'Europe/London', 'Europe/Paris', 'UTC'];

const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);

/** Task 11: business settings form. Everyone in the business reads it; only the owner can save. */
export function BusinessForm({ initial, canEdit }: { initial: BusinessView; canEdit: boolean }) {
  const t = useTranslations('settings.business');
  const s = useTranslations('settings.shared');
  const [name, setName] = useState(initial.name);
  const [locale, setLocale] = useState(initial.defaultLocale);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [weight, setWeight] = useState<string>(initial.settings.units.weight);
  const [length, setLength] = useState<string>(initial.settings.units.length);
  const [categories, setCategories] = useState(initial.settings.exerciseCategories.join('\n'));
  const [measurements, setMeasurements] = useState(initial.settings.measurementTemplate.join('\n'));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: true } | { ok: false; code: string } | null>(null);

  const zoneOptions = (ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES])
    .map((zone) => ({ value: zone, label: ZONES.includes(zone) ? t(`tz.${zone}`) : zone }));

  async function save() {
    setBusy(true); setResult(null);
    try {
      await settingsRequest('PUT', '/settings/business', {
        name: name.trim(), defaultLocale: locale, timezone, units: { weight, length },
        exerciseCategories: lines(categories), measurementTemplate: lines(measurements),
      });
      setResult({ ok: true });
    } catch (error) {
      setResult({ ok: false, code: errorKey(error) });
    } finally { setBusy(false); }
  }

  const disabled = !canEdit || busy;
  return (
    <VStack gap={4} className="min-w-0 max-w-full">
      {canEdit ? null : <Banner status="info" title={s('readOnly')} collapsible={false} />}
      <TextInput label={t('name')} value={name} onChange={setName} isDisabled={disabled} controlClassName="min-h-11" />
      <Selector label={t('defaultLocale')} value={locale} isDisabled={disabled} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
        options={[{ value: 'ar', label: t('localeAr') }, { value: 'en', label: t('localeEn') }]} onChange={(value) => setLocale(String(value))} />
      <Selector label={t('timezone')} value={timezone} isDisabled={disabled} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
        options={zoneOptions} onChange={(value) => setTimezone(String(value))} />
      <Selector label={t('weightUnit')} value={weight} isDisabled={disabled} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
        options={[{ value: 'kg', label: t('kg') }, { value: 'lb', label: t('lb') }]} onChange={(value) => setWeight(String(value))} />
      <Selector label={t('lengthUnit')} value={length} isDisabled={disabled} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full"
        options={[{ value: 'cm', label: t('cm') }, { value: 'in', label: t('in') }]} onChange={(value) => setLength(String(value))} />
      <TextArea label={t('exerciseCategories')} description={t('exerciseCategoriesHint')} value={categories} onChange={setCategories} isDisabled={disabled} />
      <TextArea label={t('measurementTemplate')} description={t('measurementTemplateHint')} value={measurements} onChange={setMeasurements} isDisabled={disabled} />
      {result?.ok ? <Text role="status">{s('saved')}</Text> : null}
      {result && !result.ok ? <Banner status="error" title={s(`errors.${result.code}`)} collapsible={false} /> : null}
      {canEdit ? <Button label={busy ? s('saving') : s('save')} variant="primary" className="min-h-11" isDisabled={busy || !name.trim()} onClick={() => void save()} /> : null}
    </VStack>
  );
}
