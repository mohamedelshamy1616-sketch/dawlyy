'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { z } from 'zod';
import { localize } from '@dawlyy/core/types';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMutation } from './use-mutation';

type Initial = { id: string; firstName: string; lastName: string | null; displayName: string | null; phone: string | null; email: string | null; locale: string; tags: string[]; source: string | null; notes: string };

/** Task 3: new-client and profile forms; choosing a package continues into T3b's sale flow. */
export function ClientForm({ initial, packages = [], editable = true }: { initial?: Initial; packages?: { id: string; name: { ar?: string; en?: string } }[]; editable?: boolean }) {
  const t = useTranslations('clients');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const mutation = useMutation();
  const [localError, setLocalError] = useState(false);
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
      {(['firstName', 'lastName', 'displayName', 'phone', 'email'] as const).map(field => <label key={field} className="grid min-w-0 gap-2 text-sm font-medium">{t(`fields.${field}`)}
        <Input name={field} className="min-h-11 min-w-0" required={field === 'firstName'} maxLength={field === 'displayName' ? 400 : field === 'email' ? 320 : 200} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} defaultValue={initial?.[field] ?? ''} autoComplete={field === 'phone' ? 'tel' : field === 'email' ? 'email' : field === 'firstName' ? 'given-name' : field === 'lastName' ? 'family-name' : 'off'} />
      </label>)}
      <label className="grid min-w-0 gap-2 text-sm font-medium">{t('fields.locale')}<select name="locale" defaultValue={initial?.locale ?? locale} className="min-h-11 rounded-lg border bg-background px-3 text-start"><option value="ar">{t('languages.ar')}</option><option value="en">{t('languages.en')}</option></select></label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">{t('fields.tags')}<Input name="tags" className="min-h-11" defaultValue={initial?.tags.join(', ') ?? ''} /><span className="text-xs text-muted-foreground">{t('tagsHint')}</span></label>
      <label className="grid min-w-0 gap-2 text-sm font-medium">{t('fields.source')}<Input name="source" className="min-h-11" maxLength={500} defaultValue={initial?.source ?? ''} /></label>
      <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">{t('fields.notes')}<Textarea name="notes" className="min-h-28 min-w-0" maxLength={10000} defaultValue={initial?.notes ?? ''} /><span className="text-xs text-muted-foreground">{t('notesPrivate')}</span></label>
      {!initial && packages.length ? <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">{t('fields.package')}<select name="packageId" className="min-h-11 w-full min-w-0 rounded-lg border bg-background px-3 text-start"><option value="">{t('noPackage')}</option>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{localize(pkg.name, locale)}</option>)}</select><span className="text-xs text-muted-foreground">{t('saleHint')}</span></label> : null}
    </fieldset>
    {mutation.error || localError ? <p role="alert" className="break-words text-sm text-destructive">{t(`errors.${mutation.error ?? 'failed'}`)}</p> : null}
    {mutation.duplicateId ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${mutation.duplicateId}`}>{t('openDuplicate')}</Link> : null}
    {mutation.saved ? <p role="status" className="text-sm">{t('saved')}</p> : null}
    {editable ? <Button type="submit" disabled={mutation.pending} className="min-h-11 w-full sm:w-fit">{t(mutation.pending ? 'saving' : initial ? 'save' : 'add')}</Button> : <p className="text-sm text-muted-foreground">{t('readOnly')}</p>}
  </form>;
}
