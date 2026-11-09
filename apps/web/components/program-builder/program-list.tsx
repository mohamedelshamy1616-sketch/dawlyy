'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ClipboardList } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild className="min-h-11" variant={kind === 'template' ? 'default' : 'outline'}><Link href={url({ kind: 'template' })} aria-current={kind === 'template' ? 'page' : undefined}>{t('templates')}</Link></Button>
      <Button asChild className="min-h-11" variant={kind === 'client' ? 'default' : 'outline'}><Link href={url({ kind: 'client' })} aria-current={kind === 'client' ? 'page' : undefined}>{t('clientPrograms')}</Link></Button>
      {grants.create ? <Button asChild className="min-h-11"><Link href="/coach/programs/new">{t('createTemplate')}</Link></Button> : null}
    </div>
    <form onSubmit={e => { e.preventDefault(); router.push(url({ q })); }} className="flex min-w-0 flex-wrap gap-2">
      <Input className="min-h-11 min-w-0 flex-1 basis-40" aria-label={t('search')} placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} />
      <Button className="min-h-11" type="submit">{t('searchAction')}</Button>
      <Button asChild className="min-h-11" variant="outline"><Link href={url({ archived: filters.archived === 'true' ? 'false' : 'true' })}>{filters.archived === 'true' ? t('showActive') : t('showArchived')}</Link></Button>
    </form>
    {error ? <p role="alert">{error}</p> : null}
    {!data.items.length ? <EmptyState Icon={ClipboardList} title={t('emptyTitle')} description={t('emptyDescription')} action={grants.create ? <Button asChild className="min-h-11"><Link href="/coach/programs/new">{t('createTemplate')}</Link></Button> : undefined} /> : null}
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {data.items.map(item => <Card key={item.id} className="min-w-0 max-w-full"><CardContent className="grid min-w-0 gap-4 pt-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><Link className="min-h-11 min-w-0 flex-1 break-words text-lg font-semibold hover:underline" href={`/coach/programs/${item.id}`}>{locale === 'ar' ? item.name.ar || item.name.en : item.name.en || item.name.ar}</Link><ProgramStatus status={item.currentVersion?.status ?? 'draft'} /></div>
        {item.stats ? <p className="text-sm text-muted-foreground">{t('cardStats', { weeks: new Intl.NumberFormat(locale).format(item.stats.weeks), days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.stats.trainingDays / Math.max(1, item.stats.weeks)) })}</p> : null}
        {kind === 'template' ? <p className="text-sm">{t('assignedCount', { count: item.assignedClientsCount })}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11" variant="outline"><Link href={`/coach/programs/${item.id}/history`}>{t('history')}</Link></Button>
          {kind === 'template' && (grants.edit || grants.publish) ? <Button asChild className="min-h-11" variant="outline"><Link href={`/coach/programs/${item.id}/assign`}>{t('assign')}</Link></Button> : null}
          {kind === 'template' && grants.create ? <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void mutate(item.id, 'duplicate', !!item.archivedAt)}>{t('duplicate')}</Button> : null}
          {grants.edit ? <Button className="min-h-11" variant="ghost" disabled={busy} onClick={() => void mutate(item.id, 'archive', !!item.archivedAt)}>{item.archivedAt ? t('unarchive') : t('archive')}</Button> : null}
        </div>
      </CardContent></Card>)}
    </div>
    {data.nextCursor ? <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => void more()}>{busy ? t('loading') : t('loadMore')}</Button> : null}
  </div>;
}
