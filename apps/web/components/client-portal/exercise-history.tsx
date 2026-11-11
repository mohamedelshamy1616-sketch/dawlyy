'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHeaderCell } from '@astryxdesign/core/Table';
import { Link } from '@/i18n/navigation';
import type { ExerciseHistory } from '@/src/server/workout/contracts';
import { displayDate } from './display';

/** Task 5 / G3: accessible exercise drawer with five prior sessions and a full history link. */
export function HistoryDrawer({ exerciseId }: { exerciseId: string }) {
  const t = useTranslations('workout'); const [open, setOpen] = useState(false); const [rows, setRows] = useState<ExerciseHistory | null>(null); const [error, setError] = useState(false);
  async function show() {
    setOpen(true); setError(false);
    try {
      const response = await fetch(`/api/v1/workout-sessions/exercise-history/${exerciseId}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('History unavailable');
      setRows(await response.json() as ExerciseHistory);
    } catch { setError(true); }
  }
  return <><Button className="min-h-11" variant="secondary" onClick={() => void show()} label={t('exerciseHistory')} />
    <BottomSheet isOpen={open} onOpenChange={setOpen} label={t('exerciseHistory')}>
      <Heading level={2}>{t('exerciseHistory')}</Heading><Text>{t('lastFive')}</Text>
      {error ? <Text as="p" role="status" className="p-4">{t('historyOffline')}</Text> : rows ? <ExerciseHistoryTable rows={rows} /> : <Text as="p" role="status">{t('loading')}</Text>}
      <Link className="inline-flex min-h-11 items-center underline" href={`/app/history/exercise/${exerciseId}`}>{t('fullHistory')}</Link><Button className="min-h-11" variant="secondary" onClick={() => setOpen(false)} label={t('dismiss')} />
    </BottomSheet></>;
}

/** Task 5: table and inline SVG trend need no chart library and retain accessible numeric values. */
export function ExerciseHistoryTable({ rows }: { rows: ExerciseHistory }) {
  const t = useTranslations('workout'); const locale = useLocale(); const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const points = [...rows].reverse(); const maximum = Math.max(1, ...points.map(r => r.totals.est1RM));
  if (!rows.length) return <Text as="p" className="py-5">{t('emptyHistory')}</Text>;
  return <VStack className="min-w-0 space-y-3">
    <svg viewBox="0 0 300 70" className="mt-4 h-24 w-full" role="img" aria-label={t('strengthTrend')}><polyline fill="none" stroke="currentColor" strokeWidth="2" points={points.map((r, i) => `${10 + i * 280 / Math.max(1, points.length - 1)},${60 - r.totals.est1RM / maximum * 50}`).join(' ')} />{points.map((r, i) => <circle key={r.sessionId} cx={10 + i * 280 / Math.max(1, points.length - 1)} cy={60 - r.totals.est1RM / maximum * 50} r="3" fill="currentColor" />)}</svg>
    <Table className="w-full table-fixed text-start text-sm"><caption className="mb-2 text-start">{t('strengthTrend')}</caption><TableHeader><TableRow isHeaderRow><TableHeaderCell className="p-2 text-start">{t('date')}</TableHeaderCell><TableHeaderCell className="p-2 text-start">{t('volume')}</TableHeaderCell><TableHeaderCell className="p-2 text-start">{t('estimated1RM')}</TableHeaderCell></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.sessionId} className="border-t"><TableCell className="break-words p-2"><Link className="inline-flex min-h-11 items-center underline" href={`/app/history/${row.sessionId}`}>{displayDate(row.localDate, locale)}</Link></TableCell><TableCell className="p-2">{fmt.format(row.totals.volume)}</TableCell><TableCell className="p-2">{fmt.format(row.totals.est1RM)}</TableCell></TableRow>)}</TableBody></Table>
    {rows.map(row => <VStack key={row.sessionId} className="rounded-xl border p-3"><Heading level={3} className="font-medium">{displayDate(row.localDate, locale)}</Heading>{row.sets.map((set, i) => <Text as="p" className="py-1" key={i}>{t('setNumber', { count: set.setNo })} · {fmt.format(set.reps ?? 0)} {t('repUnit')} · {fmt.format(set.load ?? 0)} {t(`units.${set.loadUnit ?? 'kg'}`)}{set.rpe ? ` · ${t('rpe')} ${fmt.format(set.rpe)}` : ''}{set.rir !== undefined ? ` · ${t('rir')} ${fmt.format(set.rir)}` : ''}</Text>)}</VStack>)}
  </VStack>;
}
