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
import { ArchivedEmpty, ArchivedFilter, ArchiveRowControl, useReloadOnUndoSettle } from '@/components/control/archive-controls';
import { AssignClientsToTemplate, BulkBar, BulkRowCheckbox, BulkSelectAll, useBulkSelection } from '@/components/control/bulk-actions';
import { listUrl } from '@/src/lib/control/archive-transport';
import type { BulkItem } from '@/src/lib/control/bulk-actions';

/** Task 4: template and private-copy directory with search, archive filters and cursor loading. */
export function ProgramList({ initial, filters, grants }: { initial: ProgramListData; filters: { kind?: string; clientId?: string; q?: string; archived?: string }; grants: ProgramGrants }) {
  const t = useTranslations('programs'); const locale = useLocale(); const router = useRouter();
  const [data, setData] = useState(initial); const [q, setQ] = useState(filters.q ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const kind = filters.kind === 'client' ? 'client' : 'template';
  const archivedView = filters.archived === 'true';
  const itemName = (item: ProgramListData['items'][number]) => (locale === 'ar' ? item.name.ar || item.name.en : item.name.en || item.name.ar) ?? '';
  const bulkItems: BulkItem[] = data.items.map(item => ({ id: item.id, name: itemName(item), archived: !!item.archivedAt, canEdit: grants.edit }));
  const selection = useBulkSelection(bulkItems, JSON.stringify([kind, filters.q ?? '', archivedView, filters.clientId ?? '']));
  function url(next: Record<string, string>) { return `/coach/programs?${new URLSearchParams({ kind, q: filters.q ?? '', archived: filters.archived ?? 'false', ...((next.kind ?? kind) === 'client' && filters.clientId ? { clientId: filters.clientId } : {}), ...next })}`; }
  async function more() {
    if (!data.nextCursor) return; setBusy(true); setError('');
    try {
      const result = await programRequest<ProgramListData>(`/api/v1/programs?${new URLSearchParams({ kind, q: filters.q ?? '', archived: filters.archived ?? 'false', ...(filters.clientId ? { clientId: filters.clientId } : {}), cursor: data.nextCursor })}`);
      setData(old => ({ items: [...old.items, ...result.items.filter(item => !old.items.some(row => row.id === item.id))], nextCursor: result.nextCursor }));
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  async function duplicate(id: string) {
    setBusy(true); setError('');
    try {
      const result = await programRequest<{ head: { id: string } }>(`/api/v1/programs/${id}/duplicate`, { method: 'POST' });
      router.push(`/coach/programs/${result.head.id}`);
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  /* After an archive, restore or undo: refetch page one of this view (a restored row leaves an archived-only list). */
  async function reload() {
    try { setData(await programRequest<ProgramListData>(listUrl('programs', { kind, q: filters.q, clientId: kind === 'client' ? filters.clientId : undefined }, archivedView))); setError(''); }
    catch (error) { setError(t(`errors.${programErrorKey(error)}`)); }
  }
  useReloadOnUndoSettle(() => void reload());
  return <Grid gap={5} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <HStack gap={2} wrap="wrap" className="items-center">
      <Button className="min-h-11 min-w-11" variant={kind === 'template' ? 'primary' : 'secondary'} href={url({ kind: 'template' })} aria-current={kind === 'template' ? 'page' : undefined} label={t('templates')} />
      <Button className="min-h-11 min-w-11" variant={kind === 'client' ? 'primary' : 'secondary'} href={url({ kind: 'client' })} aria-current={kind === 'client' ? 'page' : undefined} label={t('clientPrograms')} />
      {grants.create ? <Button className="min-h-11 min-w-11" href="/coach/programs/new" label={t('createTemplate')} /> : null}
    </HStack>
    <form onSubmit={e => { e.preventDefault(); router.push(url({ q })); }} className="flex min-w-0 flex-wrap gap-2">
      <TextInput label={t('search')} isLabelHidden containerClassName="min-w-0 flex-1 basis-40" controlClassName="min-h-11" aria-label={t('search')} placeholder={t('search')} value={q} onChange={setQ} />
      <Button className="min-h-11 min-w-11" type="submit" label={t('searchAction')} />
    </form>
    <ArchivedFilter archived={archivedView} hrefFor={archived => url({ archived: String(archived) })} />
    {grants.edit && data.items.length ? <BulkSelectAll items={bulkItems} selected={selection.selected} onChange={all => (all ? selection.selectAll() : selection.clear())} /> : null}
    <BulkBar entity="programs" items={bulkItems} selected={selection.selected} archivedView={archivedView} onSelectionChange={selection.set} onChanged={() => void reload()} />
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    {!data.items.length && archivedView ? <ArchivedEmpty /> : null}
    {!data.items.length && !archivedView ? <EmptyState Icon={ClipboardList} title={t('emptyTitle')} description={t('emptyDescription')} action={grants.create ? <Button className="min-h-11 min-w-11" href="/coach/programs/new" label={t('createTemplate')} /> : undefined} /> : null}
    <Grid gap={4} className="min-w-0 lg:grid-cols-2">
      {data.items.map(item => <Card key={item.id} className="min-w-0 max-w-full"><VStack gap={4} className="min-w-0">
        <HStack gap={2} wrap="wrap" className="min-w-0 items-center">{grants.edit ? <BulkRowCheckbox item={bulkItems.find(row => row.id === item.id)!} selected={selection.selected.has(item.id)} onToggle={() => selection.toggle(item.id)} /> : null}<Link className="min-h-11 min-w-0 flex-1 break-words text-lg font-semibold hover:underline" href={`/coach/programs/${item.id}`}>{locale === 'ar' ? item.name.ar || item.name.en : item.name.en || item.name.ar}</Link><ProgramStatus status={item.currentVersion?.status ?? 'draft'} /></HStack>
        {item.stats ? <Text as="p" className="text-sm text-muted-foreground">{t('cardStats', { weeks: new Intl.NumberFormat(locale).format(item.stats.weeks), days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.stats.trainingDays / Math.max(1, item.stats.weeks)) })}</Text> : null}
        {kind === 'template' ? <Text as="p" className="text-sm">{t('assignedCount', { count: item.assignedClientsCount })}</Text> : null}
        <HStack gap={2} wrap="wrap">
          <Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${item.id}/history`} label={t('history')} />
          {kind === 'template' && (grants.edit || grants.publish) ? <Button className="min-h-11 min-w-11" variant="secondary" href={`/coach/programs/${item.id}/assign`} label={t('assign')} /> : null}
          {kind === 'template' && grants.create ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => void duplicate(item.id)} label={t('duplicate')} /> : null}
          <ArchiveRowControl entity="programs" id={item.id} archived={!!item.archivedAt} canEdit={grants.edit} itemLabel={itemName(item)} onChanged={() => void reload()} />
        </HStack>
        {kind === 'template' && item.publishedVersionNo !== null && !item.archivedAt && (grants.edit || grants.publish) ? <AssignClientsToTemplate programId={item.id} grants={{ edit: grants.edit, publish: grants.publish }} /> : null}
      </VStack></Card>)}
    </Grid>
    {data.nextCursor ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => void more()} label={busy ? t('loading') : t('loadMore')} /> : null}
  </Grid>;
}
