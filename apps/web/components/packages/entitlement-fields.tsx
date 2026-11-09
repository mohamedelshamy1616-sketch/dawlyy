'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { FREQUENCIES, MEDIA_KINDS, type Entitlement } from '@dawlyy/core/types';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** Task 3: shared flat entitlement controls, with no per-feature prices. */
export function EntitlementFields({ value, onChange, disabled = false, customIdentity = false }: {
  value: Entitlement; onChange(value: Entitlement): void; disabled?: boolean; customIdentity?: boolean;
}) {
  const t = useTranslations('packages');
  const id = useId();
  function set(patch: Partial<Entitlement>) { onChange({ ...value, ...patch }); }
  return <fieldset disabled={disabled} className="grid min-w-0 gap-4 rounded-xl border p-4">
    <legend className="max-w-full break-words px-1 font-semibold">{t(`entitlements.${value.key}`)}</legend>
    <label className="flex min-h-11 items-center justify-between gap-4" htmlFor={`${id}-enabled`}>
      {t('enabled')}<Switch id={`${id}-enabled`} checked={value.enabled} onCheckedChange={enabled => set({ enabled })} className="min-h-11 min-w-11" />
    </label>
    {value.key === 'custom' && customIdentity ? <label className="grid gap-2">{t('customKey')}<Input className="min-h-11" value={value.customKey ?? ''} onChange={event => set({ customKey: event.target.value })} required={value.enabled} /></label> : null}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid min-w-0 gap-2">{t('frequency')}<select className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-start" value={value.frequency ?? ''} onChange={event => set({ frequency: FREQUENCIES.find(item => item === event.target.value) })}>
        <option value="">{t('inherit')}</option>{FREQUENCIES.map(frequency => <option key={frequency} value={frequency}>{t(`frequencies.${frequency}`)}</option>)}
      </select></label>
      {(['limit', 'durationDays', 'turnaroundHours'] as const).map(field => <label key={field} className="grid min-w-0 gap-2">{t(field)}
        <Input className="min-h-11 min-w-0" type="number" min={field === 'limit' ? 0 : 1} step={1} value={value[field] ?? ''} onChange={event => set({ [field]: event.target.value === '' ? undefined : Number(event.target.value) })} />
      </label>)}
    </div>
    <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-3">{t('more')}</summary>
      <div className="grid gap-4 sm:grid-cols-2">{(['ar', 'en'] as const).map(locale => <label key={locale} className="grid min-w-0 gap-2">{t(`note.${locale}`)}
        <Input className="min-h-11" dir={locale === 'ar' ? 'rtl' : 'ltr'} value={value.note?.[locale] ?? ''} onChange={event => {
          const note = { ...value.note, [locale]: event.target.value };
          set({ note: note.ar?.trim() || note.en?.trim() ? note : undefined });
        }} />
      </label>)}</div>
      <fieldset className="mt-3 flex flex-wrap gap-3"><legend>{t('mediaTypes')}</legend>{MEDIA_KINDS.map(kind => <label key={kind} className="flex min-h-11 items-center gap-2">
        <input type="checkbox" className="size-5" checked={value.mediaTypes?.includes(kind) ?? false} onChange={event => {
          const mediaTypes = event.target.checked ? [...(value.mediaTypes ?? []), kind] : value.mediaTypes?.filter(item => item !== kind);
          set({ mediaTypes });
        }} />{t(`media.${kind}`)}
      </label>)}</fieldset>
    </details>
  </fieldset>;
}
