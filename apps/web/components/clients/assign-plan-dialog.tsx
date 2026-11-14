'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize } from '@dawlyy/core/types';
import { z } from 'zod';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { useRouter } from '@/i18n/navigation';

export type PlanKind = 'program' | 'nutrition';

const listSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.object({ ar: z.string().optional(), en: z.string().optional() }).passthrough(),
    publishedVersionId: z.string().nullable().optional(),
    publishedVersionNo: z.number().nullable().optional(),
  }).passthrough()),
  nextCursor: z.string().nullable(),
});
type Template = { id: string; name: { ar?: string; en?: string } };
type ErrorKey = 'hasCurrent' | 'notPublished' | 'forbidden' | 'failed';

class RequestError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function request<T>(path: string, method: 'GET' | 'POST', body?: unknown, key?: string, signal?: AbortSignal): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Idempotency-Key', key ?? crypto.randomUUID());
  const response = await fetch(path, { method, headers, signal, cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string() }) }).safeParse(data);
    throw new RequestError(parsed.success ? parsed.data.error.code : 'request_failed');
  }
  return data as T;
}

/** Only published templates can be assigned; the API refuses the rest. */
function toTemplates(raw: z.infer<typeof listSchema>): Template[] {
  return raw.items.filter(row => row.publishedVersionId != null || row.publishedVersionNo != null).map(row => ({ id: row.id, name: row.name }));
}

function errorKey(error: unknown): ErrorKey {
  if (!(error instanceof RequestError)) return 'failed';
  switch (error.code) {
    case 'client_has_program': case 'client_has_plan': return 'hasCurrent';
    case 'template_not_published': return 'notPublished';
    case 'forbidden': return 'forbidden';
    default: return 'failed';
  }
}

/** The local calendar day as an ISO date, the start date a coach almost always wants. */
function today(): ISODateString {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` as ISODateString;
}

/**
 * R1c: assign a published library template to this client in one dialog.
 * Tap sequence from the client page: open dialog, pick a template, confirm (start date defaults to today).
 */
function AssignDialog({ kind, clientId, hasCurrent, canPublish, isOpen, onOpenChange }: {
  kind: PlanKind; clientId: string; hasCurrent: boolean; canPublish: boolean; isOpen: boolean; onOpenChange(open: boolean): void;
}) {
  const t = useTranslations('clients.hub.assign');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const base = kind === 'program' ? '/api/v1/programs' : '/api/v1/nutrition';
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Template[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [chosen, setChosen] = useState<Template | null>(null);
  const [startDate, setStartDate] = useState<ISODateString | undefined>(() => today());
  const [replace, setReplace] = useState(hasCurrent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const generation = useRef(0);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const listPath = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ kind: 'template', limit: '30', ...(q.trim() ? { q: q.trim() } : {}), ...extra })}`;

  useEffect(() => {
    if (!isOpen) return;
    const token = ++generation.current; const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setLoadError(false);
      void request<unknown>(`${base}?${new URLSearchParams({ kind: 'template', limit: '30', ...(q.trim() ? { q: q.trim() } : {}) })}`, 'GET', undefined, undefined, controller.signal)
        .then(raw => { if (generation.current !== token) return; const parsed = listSchema.parse(raw); setItems(toTemplates(parsed)); setCursor(parsed.nextCursor); })
        .catch(() => { if (!controller.signal.aborted) setLoadError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, q ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [base, q, isOpen]);

  async function more() {
    if (!cursor) return;
    const token = generation.current; setLoading(true);
    try {
      const parsed = listSchema.parse(await request<unknown>(listPath({ cursor }), 'GET'));
      if (generation.current === token) { setItems(old => [...old, ...toTemplates(parsed).filter(row => !old.some(known => known.id === row.id))]); setCursor(parsed.nextCursor); }
    } catch { if (generation.current === token) setLoadError(true); } finally { if (generation.current === token) setLoading(false); }
  }

  async function confirm() {
    if (!chosen || busy) return;
    setBusy(true); setError(null);
    const body = { clientId, ...(startDate ? { startDate } : {}), publish: canPublish, replace };
    const fingerprint = JSON.stringify([chosen.id, body]);
    const key = attempt.current?.fingerprint === fingerprint ? attempt.current.key : crypto.randomUUID();
    attempt.current = { fingerprint, key };
    try {
      const result = await request<{ head: { id: string } }>(`${base}/${chosen.id}/assign`, 'POST', body, key);
      attempt.current = null; setDone(result.head.id); router.refresh();
    } catch (caught) {
      const next = errorKey(caught);
      if (next === 'hasCurrent') setReplace(true);
      if (!(caught instanceof RequestError) || caught.code !== 'request_failed') attempt.current = null;
      setError(next);
    } finally { setBusy(false); }
  }

  const openHref = done ? `/coach/${kind === 'program' ? 'programs' : 'nutrition'}/${done}` : '';
  return <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" padding={4}>
    <DialogHeader title={t(`${kind}.title`)} subtitle={t(`${kind}.subtitle`)} onOpenChange={onOpenChange} />
    {done
      ? <VStack gap={3} paddingBlockStart={3} className="min-w-0">
        <Banner status="success" title={t('success')} description={t(`${kind}.successHint`)} collapsible={false} />
        <HStack gap={2} wrap="wrap" hAlign="end">
          <Button className="min-h-11" variant="primary" href={openHref} label={t('openCopy')} />
          <Button className="min-h-11" variant="secondary" label={t('close')} onClick={() => onOpenChange(false)} />
        </HStack>
      </VStack>
      : <VStack gap={3} paddingBlockStart={3} className="min-w-0 [overflow-wrap:anywhere]">
        <TextInput label={t('search')} controlClassName="min-h-11" type="search" hasClear value={q} onChange={setQ} />
        {loading ? <Text as="p" role="status" type="supporting">{t('loading')}</Text> : null}
        {!loading && !loadError && !items.length ? <Text as="p">{t(`${kind}.none`)}</Text> : null}
        {loadError ? <Text as="p" role="alert" className="!text-destructive">{t('errors.failed')}</Text> : null}
        <div role="group" aria-label={t(`${kind}.choose`)} className="grid max-h-72 min-w-0 gap-1 overflow-y-auto">
          {items.map(item => <Button key={item.id} type="button" className="h-auto min-h-11 min-w-11 justify-start whitespace-normal py-3 text-start" aria-pressed={chosen?.id === item.id} variant={chosen?.id === item.id ? 'primary' : 'secondary'} onClick={() => { setChosen(item); setError(null); }} label={localize(item.name, locale)} />)}
        </div>
        {cursor ? <Button type="button" variant="secondary" className="min-h-11" isDisabled={loading} onClick={() => void more()} label={t('loadMore')} /> : null}
        {chosen ? <VStack gap={3} className="min-w-0">
          <DateInput label={t('startDate')} controlClassName="min-h-11" value={startDate} onChange={setStartDate} nativePicker="always" />
          {replace ? <Banner status="warning" title={t(`${kind}.replaceWarning`)} collapsible={false} /> : null}
          {error ? <Banner status="error" title={t(`errors.${error}`)} collapsible={false} /> : null}
          <Button type="button" className="min-h-11" variant="primary" isLoading={busy} isDisabled={busy} onClick={() => void confirm()} label={t(replace ? 'confirmReplace' : 'confirm', { name: localize(chosen.name, locale) })} />
        </VStack> : null}
      </VStack>}
  </Dialog>;
}

/** R1c: button plus dialog. The dialog remounts on open so every opening starts clean (today's date, no selection). */
export function AssignPlanButton({ kind, clientId, hasCurrent, canPublish, variant = 'secondary' }: {
  kind: PlanKind; clientId: string; hasCurrent: boolean; canPublish: boolean; variant?: 'primary' | 'secondary';
}) {
  const t = useTranslations('clients.hub.assign');
  const [open, setOpen] = useState(false);
  return <>
    <Button className="min-h-11" variant={variant} onClick={() => setOpen(true)} label={t(`${kind}.button`)} />
    {open ? <AssignDialog key="assign" kind={kind} clientId={clientId} hasCurrent={hasCurrent} canPublish={canPublish} isOpen={open} onOpenChange={setOpen} /> : null}
  </>;
}
