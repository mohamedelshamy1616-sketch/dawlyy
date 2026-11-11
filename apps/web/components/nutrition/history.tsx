'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import type { DiffEntry } from '@dawlyy/core/versioning';
import { useRouter } from '@/i18n/navigation';
import { foodText } from './shared';
import { nutritionRequest } from './transport';

/** Task 6: one row of GET /nutrition/{id}/versions (the document itself is not sent to the page). */
export type HistoryVersion = { id: string; versionNo: number; status: string; changeNote: string | null; publishedAt: string | null; diffSummary: { added: number; removed: number; changed: number } };
export type HistoryData = { items: HistoryVersion[]; nextCursor: string | null };
const STATUS = { published: 'success', draft: 'neutral', superseded: 'neutral', approved: 'info', in_review: 'warning' } as const;

/** Task 6: version history, core-document comparison and append-only revert. */
export function NutritionHistory({ id, initial, canEdit }: { id: string; initial: HistoryData; canEdit: boolean }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const router = useRouter(); const n = new Intl.NumberFormat(locale);
  const newest = initial.items[0]?.versionNo ?? 1;
  const [data, setData] = useState(initial); const [a, setA] = useState(initial.items[1]?.versionNo ?? newest); const [b, setB] = useState(newest);
  const [entries, setEntries] = useState<DiffEntry[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [note, setNote] = useState('');
  async function compare() {
    setBusy(true); setError(false);
    try { setEntries(await nutritionRequest<DiffEntry[]>(`/api/v1/nutrition/${id}/versions/${a}/diff/${b}`)); } catch { setError(true); } finally { setBusy(false); }
  }
  async function revert(versionNo: number) {
    setBusy(true); setError(false);
    try { await nutritionRequest(`/api/v1/nutrition/${id}/revert`, { method: 'POST', body: { toVersionNo: versionNo, ...(note.trim() ? { changeNote: note.trim() } : {}) } }); router.push(`/coach/nutrition/${id}`); }
    catch { setError(true); setBusy(false); }
  }
  async function more() {
    if (!data.nextCursor) return; setBusy(true); setError(false);
    try {
      const result = await nutritionRequest<HistoryData>(`/api/v1/nutrition/${id}/versions?${new URLSearchParams({ cursor: data.nextCursor })}`);
      setData(old => ({ items: [...old.items, ...result.items.filter(v => !old.items.some(row => row.id === v.id))], nextCursor: result.nextCursor }));
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <VStack gap={4} width="100%" className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <HStack><Button size="lg" variant="secondary" href={`/coach/nutrition/${id}`} label={t('assign.backToBuilder')} /></HStack>
    {error ? <Banner status="error" title={t('errors.request')} /> : null}
    {!data.items.length ? <EmptyState icon={<History aria-hidden />} title={t('history.empty')} /> : <>
      <Card padding={4}><VStack gap={3} width="100%">
        <HStack gap={3} wrap="wrap" vAlign="end">
          <NumberInput label={t('history.compareFrom')} value={a} min={1} max={newest} isIntegerOnly onChange={setA} />
          <NumberInput label={t('history.compareTo')} value={b} min={1} max={newest} isIntegerOnly onChange={setB} />
          <Button size="lg" variant="primary" label={t('history.compare')} isLoading={busy} onClick={() => void compare()} />
        </HStack>
        {canEdit ? <TextInput label={t('history.revertReason')} value={note} onChange={setNote} isOptional /> : null}
      </VStack></Card>
      {data.items.map(version => <Card key={version.id} padding={4}><VStack gap={2} width="100%">
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Heading level={3} type="display-3">{t('builder.version', { value: n.format(version.versionNo) })}</Heading>
          <Badge variant={STATUS[version.status as keyof typeof STATUS] ?? 'neutral'} label={version.status === 'published' ? t('history.published') : version.status === 'draft' ? t('history.draft') : t('history.superseded')} />
        </HStack>
        {version.publishedAt ? <Text type="supporting" color="secondary">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(version.publishedAt))}</Text> : null}
        {version.changeNote ? <Text wordBreak="break-word">{version.changeNote}</Text> : null}
        <Text type="supporting" color="secondary">{t('history.diffCounts', { added: n.format(version.diffSummary.added), removed: n.format(version.diffSummary.removed), changed: n.format(version.diffSummary.changed) })}</Text>
        {canEdit ? <HStack><Button size="lg" variant="secondary" isDisabled={busy} label={t('history.revert')} onClick={() => void revert(version.versionNo)} /></HStack> : null}
      </VStack></Card>)}
      {data.nextCursor ? <Button size="lg" variant="secondary" isDisabled={busy} label={t('common.more')} onClick={() => void more()} /> : null}
    </>}
    {entries !== null ? <Card padding={4}><VStack gap={3} width="100%">
      <Heading level={3} type="display-3">{t('history.comparison')}</Heading>
      {!entries.length ? <Text>{t('history.noChanges')}</Text> : entries.map((entry, index) => <VStack key={`${entry.path}-${index}`} gap={1} width="100%">
        <Text weight="semibold" wordBreak="break-word">{t(`history.kinds.${entry.kind}`)} · {foodText(entry.label, locale)}</Text>
        <Text type="code" wordBreak="break-all">{entry.path}</Text>
        <Text type="supporting" color="secondary" wordBreak="break-all">{t('history.before')}: {entry.before === undefined ? t('history.none') : JSON.stringify(entry.before)}</Text>
        <Text type="supporting" color="secondary" wordBreak="break-all">{t('history.after')}: {entry.after === undefined ? t('history.none') : JSON.stringify(entry.after)}</Text>
      </VStack>)}
    </VStack></Card> : null}
  </VStack>;
}
