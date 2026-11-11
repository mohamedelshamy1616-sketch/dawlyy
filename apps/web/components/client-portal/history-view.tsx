'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@/i18n/navigation';
import type { PortalSession, SessionDetail } from '@/src/server/workout/contracts';
import { buildSummary, coreRecord } from '@/src/server/workout/logic';
import { displayDate, localized } from './display';
import { PortalEmpty } from './portal-frame';
import { FinishSummary } from './finish-summary';
import { HistoryDrawer } from './exercise-history';

type HistoryPage = { items: PortalSession[]; nextCursor: string | null };
/** Task 5: full finished history, keyset navigation without repeating rows. */
export function HistoryList({ initial }: { initial: HistoryPage }) {
  const t = useTranslations('workout'); const locale = useLocale(); const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  async function more() {
    if (!data.nextCursor || busy) return; setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/v1/workout-sessions?cursor=${encodeURIComponent(data.nextCursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('history_unavailable'); const next = await response.json() as HistoryPage;
      setData(current => ({ items: [...current.items, ...next.items.filter(r => !current.items.some(s => s.id === r.id))], nextCursor: next.nextCursor }));
    } catch { setError(true); } finally { setBusy(false); }
  }
  if (!data.items.length) return <PortalEmpty />;
  return <VStack gap={3} as="section">{data.items.map(session => <VStack gap={2} key={session.id} className="min-w-0 border-b py-4">
    <Link className="inline-flex min-h-11 items-center break-words underline" href={`/app/history/${session.id}`}><Heading level={2}>{localized(session.plannedWorkout?.name, locale) || t('workout')}</Heading></Link>
    <Text>{displayDate(session.localDate, locale)} · {t(`outcomes.${session.state}`)}</Text>
    <Text>{t('volume')}: {session.summary ? fmt.format(session.summary.volume.current) : t('summaryPending')} {session.summary ? t('volumeUnit') : ''}</Text>
    <Text>{t('completionPct')}: {session.summary ? `${fmt.format(session.summary.completionPct.current)}${t('percent')}` : t('summaryPending')}</Text>
  </VStack>)}{error ? <Text role="alert">{t('historyOffline')}</Text> : null}{data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}</VStack>;
}

/** Task 5: historical sets use stored prescriptions and link into exercise history. */
export function HistoryDetail({ detail }: { detail: SessionDetail }) {
  const t = useTranslations('workout'); const locale = useLocale(); const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const { session, sets } = detail; const ids = [...new Set(sets.map(s => s.exerciseId))];
  return <VStack gap={5}><Heading level={2}>{localized(session.plannedWorkout?.name, locale) || t('workout')}</Heading>
    <Text>{displayDate(session.localDate, locale)}</Text>
    <FinishSummary summary={session.summary ?? buildSummary(coreRecord(session, sets), detail.lastComparable, false)} pending={!session.summary} />
    {!sets.length ? <PortalEmpty /> : ids.map(id => <VStack as="section" key={id} gap={3} className="min-w-0 border-b py-3">
      <Heading level={3}>{localized(detail.exercises.find(e => e.id === id)?.name, locale) || t('exercise')}</Heading>
      <HistoryDrawer exerciseId={id} />
      {sets.filter(s => s.exerciseId === id).map(s => <HStack wrap="wrap" gap={2} key={s.clientUuid} className="min-w-0 break-words">
        <Text>{t('setNumber', { count: s.setNo })} · {t(`tags.${s.tag}`)} · {fmt.format(s.reps ?? 0)} {t('repUnit')} · {fmt.format(s.load ?? 0)} {t(`units.${s.loadUnit ?? 'kg'}`)}</Text>
        <Text>{t(s.skipped ? 'skipped' : s.completed ? 'setDone' : 'incomplete')}{s.rpe ? ` · ${t('rpe')} ${fmt.format(s.rpe)}` : ''}{s.rir !== null && s.rir !== undefined ? ` · ${t('rir')} ${fmt.format(s.rir)}` : ''}</Text>
        {s.note ? <Text className="w-full break-words">{s.note}</Text> : null}
      </HStack>)}
    </VStack>)}
    <Link className="inline-flex min-h-11 items-center underline" href="/app/history">{t('history')}</Link>
  </VStack>;
}
