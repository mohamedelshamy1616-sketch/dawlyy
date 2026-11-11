'use client';

import { useId, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Field } from '@astryxdesign/core/Field';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { localize } from '@dawlyy/core/types';
import { z } from 'zod';
import { useMutation } from './use-mutation';
import { Link, useRouter } from '@/i18n/navigation';

type Initial = { id: string; firstName: string; lastName: string | null; displayName: string | null; phone: string | null; email: string | null; locale: string; tags: string[]; source: string | null; notes: string };

/** Task 3: new-client and profile forms; choosing a package continues into T3b's sale flow. */
export function ClientForm({ initial, packages = [], editable = true }: { initial?: Initial; packages?: { id: string; name: { ar?: string; en?: string } }[]; editable?: boolean }) {
  const t = useTranslations('clients');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const mutation = useMutation();
  const id = useId();
  const [values, setValues] = useState(() => ({ firstName: initial?.firstName ?? '', lastName: initial?.lastName ?? '', displayName: initial?.displayName ?? '', phone: initial?.phone ?? '', email: initial?.email ?? '', tags: initial?.tags.join(', ') ?? '', source: initial?.source ?? '', notes: initial?.notes ?? '' }));
  function setValue(field: keyof typeof values, value: string) { setValues(previous => ({ ...previous, [field]: value })); }
  const [localError, setLocalError] = useState(false);
  // Forward native validation attributes: Astryx's isRequired also adds text to the label.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLocalError(false);
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? '').trim();
    const body = { firstName: text('firstName'), lastName: text('lastName') || null, displayName: text('displayName') || null,
      phone: text('phone') || null, email: text('email') || null, locale: text('locale'), tags: text('tags').split(/[,،]/u).map(item => item.trim()).filter(Boolean),
      source: text('source') || null, ...(text('notes') !== (initial?.notes ?? '') ? { notes: text('notes') } : {}),
      ...(!initial && text('packageId') ? { packageId: text('packageId') } : {}) };
    const result = await mutation.send(initial ? `/api/v1/clients/${initial.id}` : '/api/v1/clients', initial ? 'PATCH' : 'POST', body);
    if (result === undefined) return;
    const parsed = z.object({ id: z.string().uuid() }).safeParse(result);
    if (!parsed.success) { setLocalError(true); return; }
    if (!initial) router.push(text('packageId') ? `/coach/billing/sell?clientId=${parsed.data.id}` : `/coach/clients/${parsed.data.id}`);
    router.refresh();
  }
  return <form onSubmit={submit} className="grid min-w-0 gap-5">
    <fieldset disabled={!editable || mutation.pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {(['firstName', 'lastName', 'displayName', 'phone', 'email'] as const).map(field => <TextInput key={field} label={t(`fields.${field}`)} htmlName={field} containerClassName="min-w-0" controlClassName="min-h-11 min-w-0"
        {...{ required: field === 'firstName', maxLength: field === 'displayName' ? 400 : field === 'email' ? 320 : 200 }} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} value={values[field]} onChange={value => setValue(field, value)} autoComplete={field === 'phone' ? 'tel' : field === 'email' ? 'email' : field === 'firstName' ? 'given-name' : field === 'lastName' ? 'family-name' : 'off'} />)}
      <Field label={t('fields.locale')} inputID={`${id}-locale`} className="min-w-0"><select id={`${id}-locale`} name="locale" defaultValue={initial?.locale ?? locale} className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start"><option value="ar">{t('languages.ar')}</option><option value="en">{t('languages.en')}</option></select></Field>
      <VStack gap={2} className="min-w-0"><TextInput label={t('fields.tags')} aria-label={`${t('fields.tags')} ${t('tagsHint')}`} htmlName="tags" controlClassName="min-h-11" value={values.tags} onChange={value => setValue('tags', value)} /><Text type="supporting">{t('tagsHint')}</Text></VStack>
      <TextInput label={t('fields.source')} htmlName="source" controlClassName="min-h-11" {...{ maxLength: 500 }} value={values.source} onChange={value => setValue('source', value)} />
      <VStack gap={2} className="min-w-0 sm:col-span-2"><TextArea label={t('fields.notes')} aria-label={`${t('fields.notes')} ${t('notesPrivate')}`} htmlName="notes" controlClassName="min-h-28 min-w-0" ref={element => { if (element) element.maxLength = 10000; }} value={values.notes} onChange={value => setValue('notes', value)} /><Text type="supporting">{t('notesPrivate')}</Text></VStack>
      {!initial && packages.length ? <Field label={t('fields.package')} inputID={`${id}-package`} className="min-w-0 sm:col-span-2"><select id={`${id}-package`} aria-label={`${t('fields.package')} ${t('saleHint')}`} name="packageId" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start"><option value="">{t('noPackage')}</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{localize(pkg.name, locale)}</option>)}</select><Text type="supporting">{t('saleHint')}</Text></Field> : null}
    </fieldset>
    {mutation.error || localError ? <Text type="supporting" as="p" display="block" role="alert" className="break-words !text-destructive">{t(`errors.${mutation.error ?? 'failed'}`)}</Text> : null}
    {mutation.duplicateId ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${mutation.duplicateId}`}>{t('openDuplicate')}</Link> : null}
    {mutation.saved ? <Text type="supporting" as="p" display="block" role="status" >{t('saved')}</Text> : null}
    {editable ? <Button type="submit" isDisabled={mutation.pending} className="min-h-11 w-full sm:w-fit" variant="primary" label={t(mutation.pending ? 'saving' : initial ? 'save' : 'add')} /> : <Text type="supporting" as="p" display="block">{t('readOnly')}</Text>}
  </form>;
}
