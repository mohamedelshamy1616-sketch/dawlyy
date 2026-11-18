'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { useClientModules } from '@/components/client-today/client-module-provider';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
import { Link } from '@/i18n/navigation';
import type { PortalSession, SessionDetail } from '@/src/server/workout/contracts';
import { buildSummary, coreRecord } from '@/src/server/workout/logic';
import { localized } from './display';
import { PortalEmpty } from './portal-frame';
import { FinishSummary } from './finish-summary';
import { HistoryDrawer } from './exercise-history';

type CorrectionSession = PortalSession & { createdAt?: string | null };
type HistoryPage = { items: PortalSession[]; nextCursor: string | null };
/** Task 5: full finished history, keyset navigation without repeating rows. */
export function HistoryList({ initial }: { initial: HistoryPage }) {
  const t = useTranslations('workout'); const corrections = useTranslations('clientCorrections'); const locale = useLocale();
  const { numerals } = useClientModules(); const router = useRouter();
  const fmt = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale), numerals, maximumFractionDigits: 1 }) };
  const [data, setData] = useState(initial); const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = (id: string, active: boolean) => setPendingIds(current => { const next = new Set(current); if (active) next.add(id); else next.delete(id); return next; });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { const response = await fetch('/api/v1/workout-sessions?limit=50', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('history_unavailable');
      const page = await response.json() as HistoryPage; if (mounted.current) { setData(page); setPendingIds(current => new Set([...current].filter(id => !page.items.some(row => row.id === id && row.voidedAt)))); } router.refresh();
    } catch { if (mounted.current) setError(true); }
  }, [router]);
  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  async function more() {
    if (!data.nextCursor || busy) return; setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/v1/workout-sessions?cursor=${encodeURIComponent(data.nextCursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('history_unavailable'); const next = await response.json() as HistoryPage;
      if (mounted.current) setData(current => ({ items: [...current.items, ...next.items.filter(r => !current.items.some(s => s.id === r.id))], nextCursor: next.nextCursor }));
    } catch { if (mounted.current) setError(true); } finally { if (mounted.current) setBusy(false); }
  }
  if (!data.items.length) return <VStack gap={3}><PortalEmpty />{error ? <><Text role="alert">{t('historyOffline')}</Text><Button label={corrections('retry')} className="min-h-11" onClick={() => { void refresh(); }} /></> : null}</VStack>;
  return <VStack gap={3} as="section">{data.items.map(session => <VStack gap={2} key={session.id} id={`workout-${session.id}`} data-entry-id={session.id} className="min-w-0 border-b py-4">
    <Link className="inline-flex min-h-11 items-center break-words underline" href={`/app/history/${session.id}`}><Heading level={2}>{localized(session.plannedWorkout?.name, locale) || t('workout')}</Heading></Link>
    <Text>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: numerals }).format(new Date(`${session.localDate}T12:00:00Z`))} · {t(`outcomes.${session.state}`)}</Text>
    {session.voidedAt || pendingIds.has(session.id) ? <Text>{corrections(session.voidedAt ? 'notCounted' : 'pending')}</Text> : <><Text>{t('volume')}: {session.summary ? fmt.format(session.summary.volume.current) : t('summaryPending')} {session.summary ? t('volumeUnit') : ''}</Text>
    <Text>{t('completionPct')}: {session.summary ? `${fmt.format(session.summary.completionPct.current)}${t('percent')}` : t('summaryPending')}</Text></>}
    <EntryActions kind="workout" id={session.id} createdAt={(session as CorrectionSession).createdAt ?? null} voidedAt={session.voidedAt} onChanged={() => { void refresh(); }} onPendingChange={active => pending(session.id, active)} />
  </VStack>)}{error ? <><Text role="alert">{t('historyOffline')}</Text><Button label={corrections('retry')} className="min-h-11" onClick={() => { void refresh(); }} /></> : null}{data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}</VStack>;
}

/** Task 5: historical sets use stored prescriptions and link into exercise history. */
export function HistoryDetail({ detail }: { detail: SessionDetail }) {
  const t = useTranslations('workout'); const corrections = useTranslations('clientCorrections'); const locale = useLocale();
  const { numerals } = useClientModules(); const router = useRouter(); const [pending, setPending] = useState(false);
  const fmt = { format: (value: number) => formatNumber(value, { locale: numberLocale(locale), numerals, maximumFractionDigits: 1 }) };
  const { session, sets } = detail; const ids = [...new Set(sets.map(s => s.exerciseId))];
  return <VStack gap={5}><Heading level={2}>{localized(session.plannedWorkout?.name, locale) || t('workout')}</Heading>
    <Text>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: numerals }).format(new Date(`${session.localDate}T12:00:00Z`))}</Text>
    {session.voidedAt || pending ? <Text>{corrections(session.voidedAt ? 'notCounted' : 'pending')}</Text> : <FinishSummary summary={session.summary ?? buildSummary(coreRecord(session, sets), detail.lastComparable, false)} pending={!session.summary} />}
    <EntryActions kind="workout" id={session.id} createdAt={(session as CorrectionSession).createdAt ?? null} voidedAt={session.voidedAt} onChanged={() => router.refresh()} onPendingChange={setPending} />
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
