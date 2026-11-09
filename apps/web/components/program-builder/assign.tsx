'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/src/components/shell/empty-state';
import { programErrorKey, programRequest, ProgramRequestError } from './transport';

const clientsSchema = z.object({ items: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), displayName: z.string().nullable(), code: z.string() })), nextCursor: z.string().nullable() });
type Client = z.infer<typeof clientsSchema>['items'][number];

/** Task 4: accessible client search and private-copy assignment with explicit publication and replacement. */
export function AssignProgram({ id, canPublish, canEdit, published }: { id: string; canPublish: boolean; canEdit: boolean; published: boolean }) {
  const t = useTranslations('programs'); const [q, setQ] = useState(''); const [clients, setClients] = useState<Client[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null); const [startDate, setStartDate] = useState(''); const [publish, setPublish] = useState(canPublish); const [replace, setReplace] = useState(false); const [needsReplace, setNeedsReplace] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current; const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      void programRequest<unknown>(`/api/v1/programs/${id}/assignment-clients?${new URLSearchParams({ q, limit: '20' })}`, { signal: controller.signal })
        .then(raw => { if (generation.current !== token) return; const result = clientsSchema.parse(raw); setClients(result.items); setCursor(result.nextCursor); })
        .catch(error => { if (!controller.signal.aborted) setError(t(`errors.${programErrorKey(error)}`)); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, q, t]);
  async function more() {
    if (!cursor) return; const token = generation.current; setLoading(true);
    try { const result = clientsSchema.parse(await programRequest<unknown>(`/api/v1/programs/${id}/assignment-clients?${new URLSearchParams({ q, cursor, limit: '20' })}`)); if (generation.current === token) { setClients(old => [...old, ...result.items.filter(row => !old.some(value => value.id === row.id))]); setCursor(result.nextCursor); } }
    catch (error) { if (token === generation.current) setError(t(`errors.${programErrorKey(error)}`)); } finally { if (token === generation.current) setLoading(false); }
  }
  if (!published) return <EmptyState Icon={Users} title={t('errors.notPublished')} action={<Button asChild className="min-h-11"><Link href={`/coach/programs/${id}`}>{t('backToBuilder')}</Link></Button>} />;
  if (success) return <div role="status" className="grid gap-4 rounded-xl border bg-muted/30 p-5"><h2 className="text-lg font-semibold">{t('assignSuccess')}</h2><p>{t('assignSuccessDescription')}</p><Button asChild className="min-h-11 justify-self-start"><Link href={`/coach/programs/${success}`}>{t('openCopy')}</Link></Button><Button type="button" className="min-h-11 justify-self-start" variant="outline" onClick={() => { setSuccess(null); setClient(null); setReplace(false); setNeedsReplace(false); }}>{t('assignAnother')}</Button></div>;
  return <form className="grid min-w-0 max-w-xl gap-5 [overflow-wrap:anywhere]" onSubmit={async e => {
    e.preventDefault(); if (!client) return; setBusy(true); setError('');
    try {
      const response = await programRequest<{ head: { id: string } }>(`/api/v1/programs/${id}/assign`, { method: 'POST', body: { clientId: client.id, ...(startDate ? { startDate } : {}), publish, replace } }); setSuccess(response.head.id);
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); if (error instanceof ProgramRequestError && error.code === 'client_has_program') setNeedsReplace(true); } finally { setBusy(false); }
  }}>
    <label className="grid gap-2">{t('clientSearch')}<Input className="min-h-11" value={q} onChange={e => setQ(e.target.value)} placeholder={t('clientSearch')} /></label>
    {loading ? <p role="status">{t('loading')}</p> : null}
    {!loading && !clients.length && !error ? <EmptyState Icon={Users} title={t('noClients')} /> : null}
    <div className="grid max-h-72 min-w-0 gap-1 overflow-y-auto" role="group" aria-label={t('chooseClient')}>{clients.map(value => <Button className="h-auto min-h-11 justify-start whitespace-normal py-3 text-start" type="button" key={value.id} aria-pressed={client?.id === value.id} variant={client?.id === value.id ? 'default' : 'outline'} onClick={() => { setClient(value); setNeedsReplace(false); setReplace(false); setError(''); }}>{value.displayName || [value.firstName, value.lastName].filter(Boolean).join(' ')} · {value.code}</Button>)}</div>
    {cursor ? <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={() => void more()}>{t('loadMore')}</Button> : null}
    {client ? <p>{t('selectedClient', { name: client.displayName || client.firstName })}</p> : null}
    <label className="grid gap-2">{t('startDate')}<Input className="min-h-11" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
    <label className="flex min-h-11 items-center justify-between gap-3">{t('publishNow')}<Switch checked={publish} disabled={!canPublish || !canEdit} onCheckedChange={setPublish} /></label>
    {needsReplace ? <label className="flex min-h-11 items-center justify-between gap-3">{t('replaceExisting')}<Switch checked={replace} onCheckedChange={setReplace} /></label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <Button type="submit" className="min-h-11" disabled={busy || !client || (!publish && !canEdit) || (needsReplace && !replace)}>{busy ? t('assigning') : t('assign')}</Button>
  </form>;
}
