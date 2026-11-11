'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { z } from 'zod';
import { isIsoDay } from './date';
import { ConflictList, type ReuseConflict } from './conflict-list';
import { NutritionRequestError, nutritionRequest } from './transport';

const clientsSchema = z.object({ items: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string().nullable(), displayName: z.string().nullable(), code: z.string() })), nextCursor: z.string().nullable() });
type Client = z.infer<typeof clientsSchema>['items'][number];
const conflictsSchema = z.object({ conflicts: z.array(z.object({ code: z.string(), detail: z.string() })) });
const clientName = (c: Client) => c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ');

/** Task 6: reuse flow. Pick a client, read the conflict flags from /reuse-check (writes nothing), then copy the published template. */
export function AssignNutrition({ id, canPublish, canEdit, published }: { id: string; canPublish: boolean; canEdit: boolean; published: boolean }) {
  const t = useTranslations('nutrition'); const [q, setQ] = useState(''); const [clients, setClients] = useState<Client[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null); const [conflicts, setConflicts] = useState<ReuseConflict[] | null>(null); const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [publish, setPublish] = useState(canPublish); const [replace, setReplace] = useState(false); const [needsReplace, setNeedsReplace] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [copyId, setCopyId] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current; const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      void nutritionRequest<unknown>(`/api/v1/nutrition/${id}/assignment-clients?${new URLSearchParams({ q, limit: '20' })}`, { signal: controller.signal })
        .then(raw => { if (generation.current !== token) return; const result = clientsSchema.parse(raw); setClients(result.items); setCursor(result.nextCursor); })
        .catch(() => { if (!controller.signal.aborted) setError(t('errors.request')); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [id, q, t]);
  async function more() {
    if (!cursor) return; const token = generation.current; setLoading(true);
    try { const result = clientsSchema.parse(await nutritionRequest<unknown>(`/api/v1/nutrition/${id}/assignment-clients?${new URLSearchParams({ q, cursor, limit: '20' })}`)); if (generation.current === token) { setClients(old => [...old, ...result.items.filter(row => !old.some(v => v.id === row.id))]); setCursor(result.nextCursor); } }
    catch { if (token === generation.current) setError(t('errors.request')); } finally { if (token === generation.current) setLoading(false); }
  }
  async function choose(value: Client) {
    setClient(value); setNeedsReplace(false); setReplace(false); setError(''); setConflicts(null);
    try { setConflicts(conflictsSchema.parse(await nutritionRequest<unknown>('/api/v1/nutrition/reuse-check', { method: 'POST', body: { planId: id, clientId: value.id } })).conflicts); }
    catch { setError(t('errors.request')); }
  }
  async function submit() {
    if (!client) return; setBusy(true); setError('');
    try {
      const response = await nutritionRequest<{ head: { id: string } }>(`/api/v1/nutrition/${id}/assign`, { method: 'POST', body: { clientId: client.id, ...(startDate ? { startDate } : {}), publish, replace } });
      setCopyId(response.head.id);
    } catch (e) {
      if (e instanceof NutritionRequestError && e.code === 'client_has_plan') { setNeedsReplace(true); setError(t('assign.clientHasPlan')); }
      else if (e instanceof NutritionRequestError && e.code === 'template_not_published') setError(t('assign.notPublished'));
      else setError(t('errors.request'));
    } finally { setBusy(false); }
  }
  if (!published) return <EmptyState icon={<Users aria-hidden />} title={t('assign.notPublished')} actions={<Button size="lg" variant="primary" href={`/coach/nutrition/${id}`} label={t('assign.backToBuilder')} />} />;
  if (copyId) return <VStack gap={3} width="100%"><Banner status="success" title={t('assign.success')} description={t('assign.successHint')} />
    <HStack gap={2} wrap="wrap"><Button size="lg" variant="primary" href={`/coach/nutrition/${copyId}`} label={t('assign.openCopy')} />
      <Button size="lg" variant="secondary" label={t('assign.another')} onClick={() => { setCopyId(null); setClient(null); setConflicts(null); setReplace(false); setNeedsReplace(false); }} /></HStack></VStack>;
  return <VStack gap={4} width="100%" className="min-w-0 max-w-xl [overflow-wrap:anywhere]">
    <TextInput label={t('assign.clientSearch')} value={q} onChange={setQ} type="search" hasClear />
    {loading ? <Text color="secondary">{t('common.loading')}</Text> : null}
    {!loading && !clients.length && !error ? <EmptyState isCompact icon={<Users aria-hidden />} title={t('assign.noClients')} /> : null}
    <VStack gap={1} width="100%" isScrollable className="max-h-72" role="group" aria-label={t('assign.chooseClient')}>{clients.map(value => <Button key={value.id} size="lg" width="100%" variant={client?.id === value.id ? 'primary' : 'secondary'} label={`${clientName(value)} · ${value.code}`} onClick={() => void choose(value)} />)}</VStack>
    {cursor ? <Button size="lg" variant="secondary" isDisabled={loading} label={t('common.more')} onClick={() => void more()} /> : null}
    {client ? <VStack gap={3} width="100%">
      <Heading level={3} type="display-3" wordBreak="break-word">{t('assign.selected', { name: clientName(client) })}</Heading>
      <Text color="secondary">{t('assign.conflictsTitle')}</Text>
      {conflicts ? <ConflictList conflicts={conflicts} /> : <Text color="secondary">{t('common.loading')}</Text>}
      <DateInput label={t('assign.startDate')} value={isIsoDay(startDate) ? startDate : undefined} onChange={setStartDate} isOptional hasClear />
      <Switch label={t('assign.publishNow')} value={publish} isDisabled={!canPublish || !canEdit} onChange={setPublish} />
      {needsReplace ? <Switch label={t('assign.replaceExisting')} value={replace} onChange={setReplace} /> : null}
    </VStack> : null}
    {error ? <Banner status="error" title={error} /> : null}
    <Button size="lg" variant="primary" label={busy ? t('assign.assigning') : t('assign.submit')} isLoading={busy} isDisabled={!client || conflicts === null || (!publish && !canEdit) || (needsReplace && !replace)} onClick={() => void submit()} />
  </VStack>;
}
