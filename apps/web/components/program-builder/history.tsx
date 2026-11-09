'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import type { DiffEntry } from '@dawlyy/core/versioning';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/src/components/shell/empty-state';
import { ProgramStatus } from './status';
import { programErrorKey, programRequest } from './transport';
import type { ProgramHistoryData } from './types';

/** Task 4: paginated version history, structural comparisons and append-only revert. */
export function ProgramHistory({ id, initial, canEdit }: { id: string; initial: ProgramHistoryData; canEdit: boolean }) {
  const t = useTranslations('programs'); const locale = useLocale(); const router = useRouter();
  const [data, setData] = useState(initial); const [a, setA] = useState(initial.items[1]?.versionNo ?? initial.items[0]?.versionNo ?? 1); const [b, setB] = useState(initial.items[0]?.versionNo ?? 1);
  const [entries, setEntries] = useState<DiffEntry[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [note, setNote] = useState('');
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  async function compare() {
    setBusy(true); setError('');
    try { setEntries(await programRequest<DiffEntry[]>(`/api/v1/programs/${id}/versions/${a}/diff/${b}`)); }
    catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  async function revert(versionNo: number) {
    setBusy(true); setError('');
    try { await programRequest(`/api/v1/programs/${id}/revert`, { method: 'POST', body: { toVersionNo: versionNo, changeNote: note } }); router.push(`/coach/programs/${id}`); }
    catch (error) { setError(t(`errors.${programErrorKey(error)}`)); setBusy(false); }
  }
  async function more() {
    if (!data.nextCursor) return; setBusy(true); setError('');
    try {
      const result = await programRequest<ProgramHistoryData>(`/api/v1/programs/${id}/versions?${new URLSearchParams({ cursor: data.nextCursor })}`);
      setData(old => ({ items: [...old.items, ...result.items.filter(value => !old.items.some(row => row.id === value.id))], nextCursor: result.nextCursor }));
    } catch (error) { setError(t(`errors.${programErrorKey(error)}`)); } finally { setBusy(false); }
  }
  return <div className="grid min-w-0 max-w-full gap-5 [overflow-wrap:anywhere]">
    <Button asChild variant="outline" className="min-h-11 justify-self-start"><Link href={`/coach/programs/${id}`}>{t('backToBuilder')}</Link></Button>
    {!data.items.length ? <EmptyState Icon={History} title={t('noVersions')} /> : <>
      <form className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void compare(); }}>
        <label className="grid min-w-0 gap-2">{t('compareFrom')}<Input className="min-h-11" type="number" min={1} required max={initial.items[0]?.versionNo} value={a} onChange={e => setA(Number(e.target.value))} /></label>
        <label className="grid min-w-0 gap-2">{t('compareTo')}<Input className="min-h-11" type="number" min={1} required max={initial.items[0]?.versionNo} value={b} onChange={e => setB(Number(e.target.value))} /></label>
        <Button type="submit" className="min-h-11 self-end" disabled={busy}>{t('compare')}</Button>
      </form>
      {canEdit ? <label className="grid gap-2">{t('revertReason')}<Input className="min-h-11" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label> : null}
      {data.items.map(version => <article key={version.id} className="grid min-w-0 gap-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{t('versionNumber', { number: number(version.versionNo) })}</h2><ProgramStatus status={version.status} /></div>
        {version.publishedAt ? <p className="text-sm">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(version.publishedAt))}{version.publishedByName ? ` · ${version.publishedByName}` : ''}</p> : null}
        {version.changeNote ? <p className="whitespace-pre-wrap">{version.changeNote}</p> : null}
        <p className="text-sm text-muted-foreground">{t('diffCounts', { added: number(version.diffSummary.added), removed: number(version.diffSummary.removed), changed: number(version.diffSummary.changed) })}</p>
        {canEdit ? <Button className="min-h-11 justify-self-start" variant="outline" disabled={busy} onClick={() => void revert(version.versionNo)}>{t('revert')}</Button> : null}
      </article>)}
      {data.nextCursor ? <Button className="min-h-11" disabled={busy} variant="outline" onClick={() => void more()}>{t('loadMore')}</Button> : null}
    </>}
    {error ? <p role="alert">{error}</p> : null}
    {entries !== null ? <section aria-live="polite" className="grid min-w-0 gap-3 rounded-xl border p-4"><h2 className="font-semibold">{t('comparison')}</h2>{!entries.length ? <p>{t('noChanges')}</p> : <ul className="grid min-w-0 gap-3">{entries.map((entry, index) => <li key={`${entry.path}-${index}`} className="grid min-w-0 gap-1 rounded-lg bg-muted/40 p-3"><span className="font-medium">{t(`diffKinds.${entry.kind}`)} · {locale === 'ar' ? entry.label.ar || entry.label.en : entry.label.en || entry.label.ar}</span><code className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.path}</code><div className="grid min-w-0 gap-2 sm:grid-cols-2"><div className="min-w-0"><p className="text-sm">{t('before')}</p><pre className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.before === undefined ? t('none') : JSON.stringify(entry.before, null, 2)}</pre></div><div className="min-w-0"><p className="text-sm">{t('after')}</p><pre className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.after === undefined ? t('none') : JSON.stringify(entry.after, null, 2)}</pre></div></div></li>)}</ul>}</section> : null}
  </div>;
}
