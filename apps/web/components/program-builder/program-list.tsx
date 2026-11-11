'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import type { ProgramGrants, ProgramListData } from './types';
import { programErrorKey, programRequest } from './transport';
import { ProgramStatus } from './status';

/** Task 4: template and private-copy directory with search, archive filters and cursor loading. */
export function ProgramList({ initial, filters, grants }: { initial: ProgramListData; filters: { kind?: string; clientId?: string; q?: string; archived?: string }; grants: ProgramGrants }) {
  const t = useTranslations('programs'); const locale = useLocale(); const router = useRouter();
  const [data, setData] = useState(initial); const [q, setQ] = useState(filters.q ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const kind = filters.kind === 'client' ? 'client' : 'template';
  function url(next: Record<string, string>) { return `/coach/programs?${new URLSearchParams({ kind, q: filters.q ?? '', archived: filters.archived ?? 'false', ...((next.kind ?? kind) === 'client' && filters.clientId ? { clientId: filters.clientId } : {}), ...next })}`; }
  async function more() {
    if (!data.nextCursor) return; setBusy(true); setError('');
    try {
      const result = await programRequest<ProgramListData>(`/api/v1/programs?${new URLSearchParams({ kind, q: filters.q ?? '', archived: filters.archived ?? 'false', ...(filters.clientId ? { clientId: filters.clientId } : {}), cursor: data.nextCursor })}`);
      setData(old => ({ items: [...old.items, ...result.items.filter(item => !old.items.some(row => row.id === item.id))], nextCursor: result.nextCursor }));
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  async function mutate(id: string, action: 'duplicate' | 'archive', archived: boolean) {
    setBusy(true); setError('');
    try {
      if (action === 'duplicate') {
        const result = await programRequest<{ head: { id: string } }>(`/api/v1/programs/${id}/duplicate`, { method: 'POST' });
        router.push(`/coach/programs/${result.head.id}`);
      } else {
        await programRequest(`/api/v1/programs/${id}`, { method: 'PATCH', body: { archived: !archived } });
        router.refresh();
      }
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  return <Grid gap={5} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <HStack gap={2} wrap="wrap" className="items-center">
      <Button className="min-h-11 min-w-11" variant={kind === 'template' ? 'primary' : 'secondary'} href={url({ kind: 'template' })} aria-current={kind === 'template' ? 'page' : undefined} label={t('templates')} />
      <Button className="min-h-11 min-w-11" variant={kind === 'client' ? 'primary' : 'secondary'} href={url({ kind: 'client' })} aria-current={kind === 'client' ? 'page' : undefined} label={t('clientPrograms')} />
      {grants.create ? <Button className="min-h-11 min-w-11" href="/coach/programs/new" label={t('createTemplate')} /> : null}
    </HStack>
    <form onSubmit={e => { e.preventDefault(); router.push(url({ q })); }} className="flex min-w-0 flex-wrap gap-2">
      <TextInput label={t('search')} isLabelHidden containerClassName="min-w-0 flex-1 basis-40" controlClassName="min-h-11" aria-label={t('search')} placeholder={t('search')} value={q} onChange={setQ} />
      <Button className="min-h-11 min-w-11" type="submit" label={t('searchAction')} />
      <Button className="min-h-11 min-w-11" variant="secondary" href={url({ archived: filters.archived === 'true' ? 'false' : 'true' })} label={filters.archived === 'true' ? t('showActive') : t('showArchived')} />
    </form>
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    {!data.items.length ? <EmptyState Icon={ClipboardList} title={t('emptyTitle')} description={t('emptyDescription')} action={grants.create ? <Button className="min-h-11 min-w-11" href="/coach/programs/new" label={t('createTemplate')} /> : undefined} /> : null}
    <Grid gap={4} className="min-w-0 lg:grid-cols-2">
      {data.items.map(item => <Card key={item.id} className="min-w-0 max-w-full"><VStack gap={4} className="min-w-0">
        <HStack gap={2} wrap="wrap" className="min-w-0 items-center"><Link className="min-h-11 min-w-0 flex-1 break-words text-lg font-semibold hover:underline" href={`/coach/programs/${item.id}`}>{locale === 'ar' ? item.name.ar || item.name.en : item.name.en || item.name.ar}</Link><ProgramStatus status={item.currentVersion?.status ?? 'draft'} /></HStack>
        {item.stats ? <Text as="p" className="text-sm text-muted-foreground">{t('cardStats', { weeks: new Intl.NumberFormat(locale).format(item.stats.weeks), days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.stats.trainingDays / Math.max(1, item.stats.weeks)) })}</Text> : null}
        {kind === 'template' ? <Text as="p" className="text-sm">{t('assignedCount', { count: item.assignedClientsCount })}</Text> : null}
        <HStack gap={2} wrap="wrap">
          <Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${item.id}/history`} label={t('history')} />
          {kind === 'template' && (grants.edit || grants.publish) ? <Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${item.id}/assign`} label={t('assign')} /> : null}
          {kind === 'template' && grants.create ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => void mutate(item.id, 'duplicate', !!item.archivedAt)} label={t('duplicate')} /> : null}
          {grants.edit ? <Button className="min-h-11 min-w-11" variant="ghost" isDisabled={busy} onClick={() => void mutate(item.id, 'archive', !!item.archivedAt)} label={item.archivedAt ? t('unarchive') : t('archive')} /> : null}
        </HStack>
      </VStack></Card>)}
    </Grid>
    {data.nextCursor ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => void more()} label={busy ? t('loading') : t('loadMore')} /> : null}
  </Grid>;
}
