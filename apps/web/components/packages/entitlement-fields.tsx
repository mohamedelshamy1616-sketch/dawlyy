'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Field } from '@astryxdesign/core/Field';
import { Switch } from '@astryxdesign/core/Switch';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { FREQUENCIES, MEDIA_KINDS, type Entitlement } from '@dawlyy/core/types';

/** Task 3: shared flat entitlement controls, with no per-feature prices. */
export function EntitlementFields({ value, onChange, disabled = false, customIdentity = false }: {
  value: Entitlement; onChange(value: Entitlement): void; disabled?: boolean; customIdentity?: boolean;
}) {
  const t = useTranslations('packages');
  const id = useId();
  function set(patch: Partial<Entitlement>) { onChange({ ...value, ...patch }); }
  return <fieldset disabled={disabled} className="grid min-w-0 gap-4 rounded-xl border p-4">
    <legend className="max-w-full break-words ps-1 pe-1 font-semibold">{t(`entitlements.${value.key}`)}</legend>
    <Switch id={`${id}-enabled`} label={t('enabled')} value={value.enabled} onChange={enabled => set({ enabled })} className="min-h-11" labelPosition="start" labelSpacing="spread" isDisabled={disabled} />
    {value.key === 'custom' && customIdentity ? <TextInput label={t('customKey')} controlClassName="min-h-11" value={value.customKey ?? ''} onChange={customKey => set({ customKey })} {...{ required: value.enabled }} /> : null}
    <VStack gap={4} className="!grid min-w-0 sm:grid-cols-2 lg:grid-cols-4">
      <Field label={t('frequency')} inputID={`${id}-frequency`} className="min-w-0"><select id={`${id}-frequency`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" value={value.frequency ?? ''} onChange={event => set({ frequency: FREQUENCIES.find(item => item === event.target.value) })}>
        <option value="">{t('inherit')}</option>{FREQUENCIES.map(frequency => <option key={frequency} value={frequency}>{t(`frequencies.${frequency}`)}</option>)}
      </select></Field>
      {(['limit', 'durationDays', 'turnaroundHours'] as const).map(field => <Field key={field} label={t(field)} inputID={`${id}-${field}`} className="min-w-0">
        <input id={`${id}-${field}`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="number" min={field === 'limit' ? 0 : 1} step={1} value={value[field] ?? ''} onChange={event => set({ [field]: event.target.value === '' ? undefined : Number(event.target.value) })} />
      </Field>)}
    </VStack>
    <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-3">{t('more')}</summary>
      <VStack gap={4} className="!grid sm:grid-cols-2">{(['ar', 'en'] as const).map(locale => <TextInput key={locale} label={t(`note.${locale}`)} containerClassName="min-w-0"
        controlClassName="min-h-11" dir={locale === 'ar' ? 'rtl' : 'ltr'} value={value.note?.[locale] ?? ''} onChange={text => {
          const note = { ...value.note, [locale]: text };
          set({ note: note.ar?.trim() || note.en?.trim() ? note : undefined });
        }} />
      )}</VStack>
      <fieldset className="mt-3 flex flex-wrap gap-3"><legend>{t('mediaTypes')}</legend>{MEDIA_KINDS.map(kind => <CheckboxInput key={kind} label={t(`media.${kind}`)} className="min-h-11" isDisabled={disabled}
        value={value.mediaTypes?.includes(kind) ?? false} onChange={checked => {
          const mediaTypes = checked ? [...(value.mediaTypes ?? []), kind] : value.mediaTypes?.filter(item => item !== kind);
          set({ mediaTypes });
        }} />)}</fieldset>
    </details>
  </fieldset>;
}
