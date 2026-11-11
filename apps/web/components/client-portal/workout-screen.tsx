'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocale, useTranslations } from 'next-intl';
import { Dumbbell } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageSkeleton } from '@/src/components/shell/page-skeleton';
import type { PortalSession, SessionDetail, SessionWrite } from '@/src/server/workout/contracts';
import { buildSummary, coreRecord, parseWorkoutNumber, sessionTarget } from '@/src/server/workout/logic';
import { cacheSession, queueSession } from '@/src/lib/outbox/store';
import { Link } from '@/i18n/navigation';
import { useOutbox } from './client-runtime';
import { localized } from './display';
import { RestTimer } from './rest-timer';
import { SetRow } from './set-row';
import { ExerciseInfo } from './program-view';
import { HistoryDrawer } from './exercise-history';
import { FinishSummary } from './finish-summary';

/** Task 5: session renders entirely from its owner outbox; network refresh is optional. */
export function WorkoutScreen({ sessionId, initial }: { sessionId: string; initial?: SessionDetail }) {
  const t = useTranslations('workout'); const status = useTranslations('status'); const locale = useLocale(); const { db, sync } = useOutbox();
  const [ready, setReady] = useState(false); const [error, setError] = useState(false); const [deadline, setDeadline] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<'completed' | 'partially_completed' | 'abandoned'>('completed'); const [finishing, setFinishing] = useState(false);
  useEffect(() => {
    if (!db) return; let live = true;
    const load = async () => {
      try {
        const cached = await db.sessions.filter(r => r.cached.session.id === sessionId).first();
        if (!cached && initial) await cacheSession(db, initial);
        if (live) setReady(true);
        if (navigator.onLine) {
          const response = await fetch(`/api/v1/workout-sessions/${sessionId}`, { cache: 'no-store' });
          if (response.ok && live) await cacheSession(db, await response.json() as SessionDetail);
        }
      } catch { if (live) { setReady(true); setError(true); } }
    };
    void load(); return () => { live = false; };
  }, [db, initial, sessionId]);
  const data = useLiveQuery(async () => {
    if (!db || !ready) return null;
    const record = await db.sessions.filter(r => r.cached.session.id === sessionId).first();
    if (!record) return null;
    const sets = (await db.setLogs.toArray()).filter(s => s.payload.sessionClientUuid === record.clientUuid && !s.payload.deletedAt);
    return { record, sets };
  }, [db, ready, sessionId]);
  const uuid = data?.record.clientUuid; const state = data?.record.payload.state;
  const terminal = state === 'completed' || state === 'partially_completed' || state === 'abandoned';
  const allSynced = data?.record.syncState === 'synced' && data.sets.every(s => s.syncState === 'synced');
  const summaryMissing = !data?.record.cached.session.summary;
  useEffect(() => {
    if (!db || !terminal || !allSynced || !summaryMissing) return;
    let live = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/v1/workout-sessions/${sessionId}`, { cache: 'no-store' });
        if (response.ok && live) await cacheSession(db, await response.json() as SessionDetail);
      } catch { /* Keep the durable provisional summary until connectivity returns. */ }
    };
    void refresh(); window.addEventListener('online', refresh);
    return () => { live = false; window.removeEventListener('online', refresh); };
  }, [db, terminal, allSynced, summaryMissing, sessionId]);
  useEffect(() => {
    if (!db || !uuid || state !== 'not_started') return;
    void queueSession(db, uuid, { state: sessionTarget('not_started', 'active'), startedAt: new Date().toISOString() }).catch(() => setError(true));
  }, [db, uuid, state]);
  useEffect(() => {
    if (!db || !uuid || state !== 'active') return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now(); const delta = Math.floor((now - last) / 1000); if (delta < 1) return; last += delta * 1000;
      void db.sessions.get(uuid).then(row => row?.payload.state === 'active' ? queueSession(db, uuid, { activeSeconds: (row.payload.activeSeconds ?? 0) + delta }) : undefined).catch(() => setError(true));
    }, 1000);
    return () => clearInterval(timer);
  }, [db, uuid, state]);
  const rest = useCallback((seconds: number) => setDeadline(Date.now() + seconds * 1000), []);
  if (!db || !ready || data === undefined) return <PageSkeleton />;
  if (!data) return <EmptyState Icon={Dumbbell} title={t('unavailable')} description={t('openOnlineFirst')} />;
  const { record, sets } = data; const cached = record.cached; const payload = record.payload;
  const session: PortalSession = { ...cached.session, state: payload.state ?? cached.session.state,
    activeSeconds: payload.activeSeconds ?? cached.session.activeSeconds, startedAt: payload.startedAt ?? cached.session.startedAt,
    endedAt: payload.endedAt ?? cached.session.endedAt, rpeOverall: payload.rpeOverall ?? null,
    mood: payload.mood ?? null, painNote: payload.painNote ?? null, clientNote: payload.clientNote ?? null };
  const finished = ['completed', 'partially_completed', 'abandoned', 'skipped'].includes(session.state);
  const disabled = finished || session.state === 'paused';
  const current = coreRecord(session, sets.map(s => s.payload));
  const summary = cached.session.summary && record.syncState === 'synced' && sets.every(s => s.syncState === 'synced') ? cached.session.summary : buildSummary(current, cached.lastComparable, false);
  async function change(patch: Partial<SessionWrite>) {
    if (!db) return;
    try { await queueSession(db, record.clientUuid, patch); setError(false); } catch (cause) { setError(true); throw cause; }
  }
  async function finish() {
    setFinishing(true);
    try {
      await change({ state: sessionTarget(session.state, outcome), endedAt: new Date().toISOString() }); setDeadline(null);
      await sync();
      // A foreground request may already have snapshotted the session before Finish was queued.
      if (navigator.onLine) await sync();
      if (navigator.onLine && db) {
        const response = await fetch(`/api/v1/workout-sessions/${sessionId}`, { cache: 'no-store' });
        if (response.ok) await cacheSession(db, await response.json() as SessionDetail);
      }
    } catch { setError(true); } finally { setFinishing(false); }
  }
  return <VStack className="flex min-w-0 flex-col gap-5" data-testid="workout-screen">
    <VStack className="flex flex-wrap items-center justify-between gap-3"><Heading level={2} className="min-w-0 break-words text-xl font-bold">{localized(session.plannedWorkout?.name, locale)}</Heading>
      <output aria-label={t('sessionTimer')} className="font-mono text-2xl tabular-nums">{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(Math.floor(session.activeSeconds / 60))}:{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(session.activeSeconds % 60)}</output>
      {!finished ? <Button className="min-h-11" variant="secondary" onClick={() => void change({ state: sessionTarget(session.state, session.state === 'paused' ? 'active' : 'paused') }).catch(() => {})} label={t(session.state === 'paused' ? 'resume' : 'pause')} /> : <Text>{status('complete')}</Text>}</VStack>
    {error ? <Text as="p" role="alert" className="rounded-xl border p-3">{t('storageError')}</Text> : null}
    <RestTimer deadline={deadline} onChange={setDeadline} />
    {finished ? <><FinishSummary summary={summary} pending={!cached.session.summary || record.syncState !== 'synced' || sets.some(s => s.syncState !== 'synced')} /><Link className="inline-flex min-h-11 items-center underline" href="/app/history">{t('history')}</Link></> : null}
    {session.plannedWorkout?.blocks.map(block => <VStack as="section" key={block.id} className="min-w-0 space-y-5 rounded-2xl border bg-card p-4">
      <Heading level={3} className="text-lg font-semibold">{localized(block.name, locale) || t(`blocks.${block.kind}`)}</Heading><Text as="p" className="break-words">{localized(block.note, locale)}</Text>
      {block.items.toSorted((a, b) => a.order - b.order).map(item => {
        const exercise = cached.exercises.find(e => e.id === item.exerciseId);
        return <VStack as="article" key={item.id} className="min-w-0 space-y-3"><Heading level={4} className="break-words text-lg font-semibold">{localized(exercise?.name, locale) || t('exercise')}</Heading>
          <ExerciseInfo exercise={exercise} /><Text as="p" className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3">{localized(item.coachNote, locale)}</Text><HistoryDrawer exerciseId={item.exerciseId} />
          {item.sets.map(plan => <SetRow key={`${item.id}:${plan.setNo}`} sessionUuid={record.clientUuid} item={item} blockId={block.id} warmup={block.kind === 'warmup'} plan={plan}
            previous={cached.lastComparable?.sets.find(s => s.exerciseId === item.exerciseId && s.setNo === plan.setNo)}
            saved={sets.find(s => s.payload.itemId === item.id && s.payload.setNo === plan.setNo)?.payload} unit={cached.unit} exercises={cached.exercises} disabled={disabled} onComplete={rest} />)}
        </VStack>;
      })}
    </VStack>)}
    {!finished ? <VStack as="section" className="space-y-3 rounded-2xl border p-4">
      {(['clientNote', 'mood', 'painNote'] as const).map(field => <TextInput key={field} label={t(field)} controlClassName="min-h-11 text-base" isDisabled={disabled}
        value={payload[field] ?? ''} onChange={value => void change({ [field]: value.slice(0, field === 'mood' ? 200 : field === 'painNote' ? 2000 : 4000) }).catch(() => {})} />)}
      <NumberInput label={t('rpeOverall')} hasClear value={payload.rpeOverall} min={1} max={10} controlClassName="min-h-11 text-base" isDisabled={disabled}
        onInput={event => { const value = parseWorkoutNumber((event.target as HTMLInputElement).value); if (value !== undefined && (value === null || value >= 1 && value <= 10)) void change({ rpeOverall: value }).catch(() => {}); }}
        onChange={value => { if (value === null || value >= 1 && value <= 10) void change({ rpeOverall: value }).catch(() => {}); }} />
      <Selector label={t('outcome')} controlClassName="min-h-11" value={outcome} onChange={value => setOutcome(value as typeof outcome)}
        options={(['completed', 'partially_completed', 'abandoned'] as const).map(value => ({ value, label: t(`outcomes.${value}`) }))} />
      <Button className="min-h-12 w-full" isDisabled={finishing || session.state === 'not_started'} onClick={() => void finish()} data-testid="finish-workout" label={t('finish')} />
    </VStack> : null}
  </VStack>;
}
