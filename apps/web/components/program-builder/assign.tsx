'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Switch } from '@astryxdesign/core/Switch';
import type { ISODateString } from '@astryxdesign/core/Calendar';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { z } from 'zod';
import { EmptyState } from '@/src/components/shell/empty-state';
import { programErrorKey, programRequest, ProgramRequestError } from './transport';

const clientsSchema = z.object({ items: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), displayName: z.string().nullable(), code: z.string() })), nextCursor: z.string().nullable() });
type Client = z.infer<typeof clientsSchema>['items'][number];

/** Task 4: accessible client search and private-copy assignment with explicit publication and replacement. */
export function AssignProgram({ id, canPublish, canEdit, published }: { id: string; canPublish: boolean; canEdit: boolean; published: boolean }) {
  const t = useTranslations('programs'); const [q, setQ] = useState(''); const [clients, setClients] = useState<Client[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null); const [startDate, setStartDate] = useState<ISODateString>(); const [publish, setPublish] = useState(canPublish); const [replace, setReplace] = useState(false); const [needsReplace, setNeedsReplace] = useState(false);
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
  if (!published) return <EmptyState Icon={Users} title={t('errors.notPublished')} action={<Button className="min-h-11 min-w-11" href={`/coach/programs/${id}`} label={t('backToBuilder')} />} />;
  if (success) return <Grid gap={4} role="status" className="rounded-xl border bg-muted/30 p-5"><Heading level={2} className="text-lg font-semibold">{t('assignSuccess')}</Heading><Text as="p">{t('assignSuccessDescription')}</Text><Button className="min-h-11 min-w-11 justify-self-start" href={`/coach/programs/${success}`} label={t('openCopy')} /><Button type="button" className="min-h-11 min-w-11 justify-self-start" variant="secondary" onClick={() => { setSuccess(null); setClient(null); setReplace(false); setNeedsReplace(false); }} label={t('assignAnother')} /></Grid>;
  return <form className="grid min-w-0 max-w-xl gap-5 [overflow-wrap:anywhere]" onSubmit={async e => {
    e.preventDefault(); if (!client) return; setBusy(true); setError('');
    try {
      const response = await programRequest<{ head: { id: string } }>(`/api/v1/programs/${id}/assign`, { method: 'POST', body: { clientId: client.id, ...(startDate ? { startDate } : {}), publish, replace } }); setSuccess(response.head.id);
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); if (error instanceof ProgramRequestError && error.code === 'client_has_program') setNeedsReplace(true); } finally { setBusy(false); }
  }}>
    <VStack className="grid gap-2"><TextInput label={t('clientSearch')} controlClassName="min-h-11" value={q} onChange={value => setQ(value)} placeholder={t('clientSearch')} /></VStack>
    {loading ? <Text as="p" role="status">{t('loading')}</Text> : null}
    {!loading && !clients.length && !error ? <EmptyState Icon={Users} title={t('noClients')} /> : null}
    <Grid gap={1} className="max-h-72 min-w-0 overflow-y-auto" role="group" aria-label={t('chooseClient')}>{clients.map(value => <Button className="h-auto min-h-11 min-w-11 justify-start whitespace-normal py-3 text-start" type="button" key={value.id} aria-pressed={client?.id === value.id} variant={client?.id === value.id ? 'primary' : 'secondary'} onClick={() => { setClient(value); setNeedsReplace(false); setReplace(false); setError(''); }} label={`${value.displayName || [value.firstName, value.lastName].filter(Boolean).join(' ')} · ${value.code}`} />)}</Grid>
    {cursor ? <Button type="button" variant="secondary" className="min-h-11 min-w-11" isDisabled={loading} onClick={() => void more()} label={t('loadMore')} /> : null}
    {client ? <Text as="p">{t('selectedClient', { name: client.displayName || client.firstName })}</Text> : null}
    <VStack className="grid gap-2"><DateInput label={t('startDate')} controlClassName="min-h-11" value={startDate} onChange={setStartDate} nativePicker="always" /></VStack>
    <Switch className="min-h-11" label={t('publishNow')} labelPosition="start" labelSpacing="spread" value={publish} isDisabled={!canPublish || !canEdit} onChange={setPublish} />
    {needsReplace ? <Switch className="min-h-11" label={t('replaceExisting')} labelPosition="start" labelSpacing="spread" value={replace} onChange={setReplace} /> : null}
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    <Button type="submit" className="min-h-11 min-w-11" isDisabled={busy || !client || (!publish && !canEdit) || (needsReplace && !replace)} label={busy ? t('assigning') : t('assign')} />
  </form>;
}
