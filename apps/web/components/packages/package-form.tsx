'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { ENTITLEMENT_KEYS, ScheduleRules, type Entitlement } from '@dawlyy/core/types';
import type { CoachPackage } from '@/src/server/packages/service';
import { useRouter } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useMutation } from '@/components/clients/use-mutation';
import { EntitlementFields } from './entitlement-fields';

type Initial = Pick<CoachPackage, 'id' | 'name' | 'description' | 'price' | 'currency' | 'durationDays' | 'graceDays' | 'entitlements' | 'scheduleRules'>;

/** Task 3 / G7: flat package builder and complete entitlement matrix; no per-feature price controls. */
export function PackageForm({ initial, editable = true }: { initial?: Initial; editable?: boolean }) {
  const t = useTranslations('packages');
  const router = useRouter();
  const mutation = useMutation();
  const [invalid, setInvalid] = useState(false);
  const [rows, setRows] = useState<Entitlement[]>(() => {
    const existing = initial?.entitlements ?? [];
    return ENTITLEMENT_KEYS.flatMap(key => {
      const matching = existing.filter(row => row.key === key);
      return matching.length ? matching : [{ key, enabled: false }];
    });
  });
  const [schedule, setSchedule] = useState(() => initial?.scheduleRules ?? ScheduleRules.parse({}));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setInvalid(false);
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const description = { ar: text('description.ar'), en: text('description.en') };
    const result = await mutation.send(initial ? `/api/v1/packages/${initial.id}` : '/api/v1/packages', initial ? 'PATCH' : 'POST', {
      name: { ar: text('name.ar'), en: text('name.en') }, description: description.ar || description.en ? description : null,
      priceAmount: Number(text('price')), currency: text('currency'), durationDays: Number(text('durationDays')), graceDays: Number(text('graceDays')),
      entitlements: rows.filter(row => row.key !== 'custom' || row.enabled || row.customKey?.trim()), scheduleRules: schedule,
    });
    if (result === undefined) return;
    const parsed = z.object({ id: z.string().uuid() }).safeParse(result);
    if (!parsed.success) { setInvalid(true); return; }
    if (!initial) router.push(`/coach/packages/${parsed.data.id}`);
    router.refresh();
  }
  return <form onSubmit={submit} className="grid min-w-0 gap-6">
    <fieldset disabled={!editable || mutation.pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {(['ar', 'en'] as const).map(locale => <label key={locale} className="grid min-w-0 gap-2 text-sm font-medium">{t(`name.${locale}`)}<Input name={`name.${locale}`} className="min-h-11" dir={locale === 'ar' ? 'rtl' : 'ltr'} maxLength={300} defaultValue={initial?.name[locale] ?? ''} /></label>)}
      {(['ar', 'en'] as const).map(locale => <label key={locale} className="grid min-w-0 gap-2 text-sm font-medium">{t(`description.${locale}`)}<Textarea name={`description.${locale}`} className="min-h-24" dir={locale === 'ar' ? 'rtl' : 'ltr'} maxLength={10000} defaultValue={initial?.description?.[locale] ?? ''} /></label>)}
      <label className="grid min-w-0 gap-2 text-sm font-medium">{t('price')}<Input name="price" className="min-h-11" type="number" min={0} max={9999999999.99} step="0.01" required defaultValue={initial?.price ?? 0} /></label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">{t('currency')}<Input name="currency" className="min-h-11" pattern="[A-Z]{3}" maxLength={3} required defaultValue={initial?.currency ?? 'EGP'} /></label>
      {(['durationDays', 'graceDays'] as const).map(field => <label key={field} className="grid min-w-0 gap-2 text-sm font-medium">{t(field)}<Input name={field} className="min-h-11" type="number" min={field === 'durationDays' ? 1 : 0} max={36500} step={1} required defaultValue={initial?.[field] ?? (field === 'durationDays' ? 28 : 0)} /></label>)}
    </fieldset>
    <p className="text-sm text-muted-foreground">{t('snapshotHint')}</p>
    <section className="grid min-w-0 gap-4"><h2 className="text-lg font-semibold">{t('entitlementMatrix')}</h2>
      {rows.map((row, index) => <EntitlementFields key={`${row.key}:${index}`} value={row} customIdentity disabled={!editable || mutation.pending} onChange={value => setRows(previous => previous.map((item, i) => i === index ? value : item))} />)}
    </section>
    <details className="min-w-0 rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t('schedule.title')}</summary>
      <fieldset disabled={!editable || mutation.pending} className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="flex min-h-11 items-center justify-between gap-3">{t('schedule.weekly')}<Switch className="min-h-11 min-w-11" checked={schedule.weeklyCheckin.enabled} onCheckedChange={enabled => setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, enabled } }))} /></label>
        {(['firstAfterDays', 'everyDays', 'cycleWeeks', 'windowDays', 'perCycle'] as const).map(field => <label key={field} className="grid min-w-0 gap-2 text-sm">{t(`schedule.${field}`)}<Input className="min-h-11" type="number" min={field === 'windowDays' ? 0 : 1} step={1} value={schedule.weeklyCheckin[field] ?? ''} required={field !== 'perCycle'} onChange={event => {
          const value = event.target.value === '' && field === 'perCycle' ? undefined : Number(event.target.value);
          setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, [field]: value } }));
        }} /></label>)}
        <label className="grid min-w-0 gap-2 text-sm">{t('schedule.weeklyTime')}<Input className="min-h-11" type="time" required value={schedule.weeklyCheckin.timeOfDay} onChange={event => setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, timeOfDay: event.target.value } }))} /></label>
        <label className="flex min-h-11 items-center justify-between gap-3">{t('schedule.daily')}<Switch className="min-h-11 min-w-11" checked={schedule.dailyCheckin.enabled} onCheckedChange={enabled => setSchedule(previous => ({ ...previous, dailyCheckin: { ...previous.dailyCheckin, enabled } }))} /></label>
        <label className="grid min-w-0 gap-2 text-sm">{t('schedule.dailyTime')}<Input className="min-h-11" type="time" required value={schedule.dailyCheckin.timeOfDay} onChange={event => setSchedule(previous => ({ ...previous, dailyCheckin: { ...previous.dailyCheckin, timeOfDay: event.target.value } }))} /></label>
        <label className="flex min-h-11 items-center justify-between gap-3">{t('schedule.technique')}<Switch className="min-h-11 min-w-11" checked={schedule.techniqueReview.enabled} onCheckedChange={enabled => setSchedule(previous => ({ ...previous, techniqueReview: { ...previous.techniqueReview, enabled } }))} /></label>
        {(['firstWeeks', 'maxPerWeek'] as const).map(field => <label key={field} className="grid min-w-0 gap-2 text-sm">{t(`schedule.${field}`)}<Input className="min-h-11" type="number" min={1} step={1} required value={schedule.techniqueReview[field]} onChange={event => setSchedule(previous => ({ ...previous, techniqueReview: { ...previous.techniqueReview, [field]: Number(event.target.value) } }))} /></label>)}
      </fieldset>
    </details>
    {mutation.error || invalid ? <p role="alert" className="text-sm text-destructive">{t(`errors.${mutation.error ?? 'failed'}`)}</p> : null}
    {mutation.saved ? <p role="status" className="text-sm">{t('saved')}</p> : null}
    {editable ? <Button type="submit" disabled={mutation.pending} className="min-h-11 w-full sm:w-fit">{t(mutation.pending ? 'saving' : initial ? 'save' : 'add')}</Button> : <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
  </form>;
}
