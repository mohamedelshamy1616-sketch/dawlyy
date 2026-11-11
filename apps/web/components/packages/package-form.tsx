'use client';

import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Field } from '@astryxdesign/core/Field';
import { Heading } from '@astryxdesign/core/Heading';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ENTITLEMENT_KEYS, ScheduleRules, type Entitlement } from '@dawlyy/core/types';
import { z } from 'zod';
import { EntitlementFields } from './entitlement-fields';
import { useMutation } from '@/components/clients/use-mutation';
import { useRouter } from '@/i18n/navigation';
import type { CoachPackage } from '@/src/server/packages/service';

type Initial = Pick<CoachPackage, 'id' | 'name' | 'description' | 'price' | 'currency' | 'durationDays' | 'graceDays' | 'entitlements' | 'scheduleRules'>;

/** Task 3 / G7: flat package builder and complete entitlement matrix; no per-feature price controls. */
export function PackageForm({ initial, editable = true }: { initial?: Initial; editable?: boolean }) {
  const t = useTranslations('packages');
  const router = useRouter();
  const mutation = useMutation();
  const id = useId();
  const [name, setName] = useState(() => ({ ar: initial?.name.ar ?? '', en: initial?.name.en ?? '' }));
  const [description, setDescription] = useState(() => ({ ar: initial?.description?.ar ?? '', en: initial?.description?.en ?? '' }));
  const [currency, setCurrency] = useState(initial?.currency ?? 'EGP');
  const [invalid, setInvalid] = useState(false);
  const [rows, setRows] = useState<Entitlement[]>(() => {
    const existing = initial?.entitlements ?? [];
    return ENTITLEMENT_KEYS.flatMap(key => {
      const matching = existing.filter(row => row.key === key);
      return matching.length ? matching : [{ key, enabled: false }];
    });
  });
  const [schedule, setSchedule] = useState(() => initial?.scheduleRules ?? ScheduleRules.parse({}));
  // Native controls inside Field keep the existing min/max/step validation and form values.
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
      {(['ar', 'en'] as const).map(locale => <TextInput key={locale} label={t(`name.${locale}`)} htmlName={`name.${locale}`} containerClassName="min-w-0" controlClassName="min-h-11" dir={locale === 'ar' ? 'rtl' : 'ltr'} {...{ maxLength: 300 }} value={name[locale]} onChange={value => setName(previous => ({ ...previous, [locale]: value }))} />)}
      {(['ar', 'en'] as const).map(locale => <TextArea key={locale} label={t(`description.${locale}`)} htmlName={`description.${locale}`} containerClassName="min-w-0" controlClassName="min-h-24" dir={locale === 'ar' ? 'rtl' : 'ltr'} ref={element => { if (element) element.maxLength = 10000; }} value={description[locale]} onChange={value => setDescription(previous => ({ ...previous, [locale]: value }))} />)}
      <Field label={t('price')} inputID={`${id}-price`} className="min-w-0"><input id={`${id}-price`} name="price" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="number" min={0} max={9999999999.99} step="0.01" required defaultValue={initial?.price ?? 0} /></Field>
      <TextInput label={t('currency')} htmlName="currency" controlClassName="min-h-11" {...{ pattern: '[A-Z]{3}', maxLength: 3, required: true }} value={currency} onChange={setCurrency} />
      {(['durationDays', 'graceDays'] as const).map(field => <Field key={field} label={t(field)} inputID={`${id}-${field}`} className="min-w-0"><input id={`${id}-${field}`} name={field} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="number" min={field === 'durationDays' ? 1 : 0} max={36500} step={1} required defaultValue={initial?.[field] ?? (field === 'durationDays' ? 28 : 0)} /></Field>)}
    </fieldset>
    <Text type="supporting" as="p" display="block">{t('snapshotHint')}</Text>
    <section className="grid min-w-0 gap-4"><Heading level={2}>{t('entitlementMatrix')}</Heading>
      {rows.map((row, index) => <EntitlementFields key={`${row.key}:${index}`} value={row} customIdentity disabled={!editable || mutation.pending} onChange={value => setRows(previous => previous.map((item, i) => i === index ? value : item))} />)}
    </section>
    <details className="min-w-0 rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{t('schedule.title')}</summary>
      <fieldset disabled={!editable || mutation.pending} className="mt-3 grid min-w-0 gap-4 sm:grid-cols-2">
        <Switch label={t('schedule.weekly')} className="min-h-11" labelPosition="start" labelSpacing="spread" value={schedule.weeklyCheckin.enabled} isDisabled={!editable || mutation.pending} onChange={enabled => setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, enabled } }))} />
        {(['firstAfterDays', 'everyDays', 'cycleWeeks', 'windowDays', 'perCycle'] as const).map(field => <Field key={field} label={t(`schedule.${field}`)} inputID={`${id}-weekly-${field}`} className="min-w-0"><input id={`${id}-weekly-${field}`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="number" min={field === 'windowDays' ? 0 : 1} step={1} value={schedule.weeklyCheckin[field] ?? ''} required={field !== 'perCycle'} onChange={event => {
          const value = event.target.value === '' && field === 'perCycle' ? undefined : Number(event.target.value);
          setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, [field]: value } }));
        }} /></Field>)}
        <Field label={t('schedule.weeklyTime')} inputID={`${id}-weekly-time`} className="min-w-0"><input id={`${id}-weekly-time`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="time" required value={schedule.weeklyCheckin.timeOfDay} onChange={event => setSchedule(previous => ({ ...previous, weeklyCheckin: { ...previous.weeklyCheckin, timeOfDay: event.target.value } }))} /></Field>
        <Switch label={t('schedule.daily')} className="min-h-11" labelPosition="start" labelSpacing="spread" value={schedule.dailyCheckin.enabled} isDisabled={!editable || mutation.pending} onChange={enabled => setSchedule(previous => ({ ...previous, dailyCheckin: { ...previous.dailyCheckin, enabled } }))} />
        <Field label={t('schedule.dailyTime')} inputID={`${id}-daily-time`} className="min-w-0"><input id={`${id}-daily-time`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="time" required value={schedule.dailyCheckin.timeOfDay} onChange={event => setSchedule(previous => ({ ...previous, dailyCheckin: { ...previous.dailyCheckin, timeOfDay: event.target.value } }))} /></Field>
        <Switch label={t('schedule.technique')} className="min-h-11" labelPosition="start" labelSpacing="spread" value={schedule.techniqueReview.enabled} isDisabled={!editable || mutation.pending} onChange={enabled => setSchedule(previous => ({ ...previous, techniqueReview: { ...previous.techniqueReview, enabled } }))} />
        {(['firstWeeks', 'maxPerWeek'] as const).map(field => <Field key={field} label={t(`schedule.${field}`)} inputID={`${id}-technique-${field}`} className="min-w-0"><input id={`${id}-technique-${field}`} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="number" min={1} step={1} required value={schedule.techniqueReview[field]} onChange={event => setSchedule(previous => ({ ...previous, techniqueReview: { ...previous.techniqueReview, [field]: Number(event.target.value) } }))} /></Field>)}
      </fieldset>
    </details>
    {mutation.error || invalid ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t(`errors.${mutation.error ?? 'failed'}`)}</Text> : null}
    {mutation.saved ? <Text type="supporting" as="p" display="block" role="status" >{t('saved')}</Text> : null}
    {editable ? <Button type="submit" isDisabled={mutation.pending} className="min-h-11 w-full sm:w-fit" variant="primary" label={t(mutation.pending ? 'saving' : initial ? 'save' : 'add')} /> : <Text type="supporting" as="p" display="block">{t('readOnly')}</Text>}
  </form>;
}
