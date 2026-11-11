'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput } from '@astryxdesign/core/TextInput';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import type { DiffEntry } from '@dawlyy/core/versioning';
import { useRouter } from '@/i18n/navigation';
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
  return <Grid gap={5} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <Button variant="secondary" className="min-h-11 min-w-11 justify-self-start" href={`/coach/programs/${id}`} label={t('backToBuilder')} />
    {!data.items.length ? <EmptyState Icon={History} title={t('noVersions')} /> : <>
      <form className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void compare(); }}>
        <VStack className="grid min-w-0 gap-2"><TextInput label={t('compareFrom')} controlClassName="min-h-11" isRequired value={String(a)} onChange={value => setA(Number(value))} ref={input => {
          // Keep native numeric validation rather than NumberInput's blur clamping.
          if (input) { input.type = 'number'; input.required = true; input.min = '1'; input.max = String(initial.items[0]?.versionNo ?? ''); }
        }} /></VStack>
        <VStack className="grid min-w-0 gap-2"><TextInput label={t('compareTo')} controlClassName="min-h-11" isRequired value={String(b)} onChange={value => setB(Number(value))} ref={input => {
          if (input) { input.type = 'number'; input.required = true; input.min = '1'; input.max = String(initial.items[0]?.versionNo ?? ''); }
        }} /></VStack>
        <Button type="submit" className="min-h-11 min-w-11 self-end" isDisabled={busy} label={t('compare')} />
      </form>
      {canEdit ? <VStack className="grid gap-2"><TextInput label={t('revertReason')} controlClassName="min-h-11" value={note} onChange={value => setNote(value)} ref={input => { if (input) { input.maxLength = 2000; } }} /></VStack> : null}
      {data.items.map(version => <article key={version.id} className="grid min-w-0 gap-3 rounded-xl border p-4">
        <HStack gap={3} wrap="wrap" className="items-center"><Heading level={2} className="font-semibold">{t('versionNumber', { number: number(version.versionNo) })}</Heading><ProgramStatus status={version.status} /></HStack>
        {version.publishedAt ? <Text as="p" className="text-sm">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(version.publishedAt))}{version.publishedByName ? ` · ${version.publishedByName}` : ''}</Text> : null}
        {version.changeNote ? <Text as="p" className="whitespace-pre-wrap">{version.changeNote}</Text> : null}
        <Text as="p" className="text-sm text-muted-foreground">{t('diffCounts', { added: number(version.diffSummary.added), removed: number(version.diffSummary.removed), changed: number(version.diffSummary.changed) })}</Text>
        {canEdit ? <Button className="min-h-11 min-w-11 justify-self-start" variant="secondary" isDisabled={busy} onClick={() => void revert(version.versionNo)} label={t('revert')} /> : null}
      </article>)}
      {data.nextCursor ? <Button className="min-h-11 min-w-11" isDisabled={busy} variant="secondary" onClick={() => void more()} label={t('loadMore')} /> : null}
    </>}
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    {entries !== null ? <section aria-live="polite" className="grid min-w-0 gap-3 rounded-xl border p-4"><Heading level={2} className="font-semibold">{t('comparison')}</Heading>{!entries.length ? <Text as="p">{t('noChanges')}</Text> : <ul className="grid min-w-0 gap-3">{entries.map((entry, index) => <li key={`${entry.path}-${index}`} className="grid min-w-0 gap-1 rounded-lg bg-muted/40 p-3"><Text className="font-medium">{t(`diffKinds.${entry.kind}`)} · {locale === 'ar' ? entry.label.ar || entry.label.en : entry.label.en || entry.label.ar}</Text><code className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.path}</code><Grid gap={2} className="min-w-0 sm:grid-cols-2"><VStack className="min-w-0"><Text as="p" className="text-sm">{t('before')}</Text><pre className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.before === undefined ? t('none') : JSON.stringify(entry.before, null, 2)}</pre></VStack><VStack className="min-w-0"><Text as="p" className="text-sm">{t('after')}</Text><pre className="max-w-full whitespace-pre-wrap break-all text-xs">{entry.after === undefined ? t('none') : JSON.stringify(entry.after, null, 2)}</pre></VStack></Grid></li>)}</ul>}</section> : null}
  </Grid>;
}
