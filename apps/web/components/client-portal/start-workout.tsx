'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { useRouter } from '@/i18n/navigation';
import type { SessionDetail } from '@/src/server/workout/contracts';
import { cacheSession } from '@/src/lib/outbox/store';
import { PageSkeleton } from '@/src/components/shell/page-skeleton';
import { useOutbox } from './client-runtime';
import { PortalEmpty } from './portal-frame';

type Target = { sessionId?: string; start: { programId: string; programVersionId: string; dayId: string; workoutId: string; localDate: string; timezone: string } | null };
/** Task 5: durable creation UUID survives retries; cache the prescription before navigating. */
export function StartWorkout({ target }: { target: Target }) {
  const { db } = useOutbox(); const router = useRouter(); const t = useTranslations('workout');
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  const work = useRef<Promise<SessionDetail> | null>(null);
  useEffect(() => {
    if (!db || (!target.start && !target.sessionId)) return;
    let live = true;
    async function create() {
      if (target.sessionId) {
        const response = await fetch(`/api/v1/workout-sessions/${target.sessionId}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('session_unavailable');
        return await response.json() as SessionDetail;
      }
      const key = `workout-start:${db!.owner}:${target.start!.programId}:${target.start!.programVersionId}:${target.start!.localDate}:${target.start!.dayId}`;
      const clientUuid = sessionStorage.getItem(key) ?? crypto.randomUUID(); sessionStorage.setItem(key, clientUuid);
      const response = await fetch('/api/v1/workout-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientUuid }, body: JSON.stringify({ ...target.start, clientUuid }) });
      if (!response.ok) throw new Error('start_failed');
      return await response.json() as SessionDetail;
    }
    work.current ??= create();
    void work.current.then(async detail => {
      await cacheSession(db, detail);
      if (live) router.replace(`/app/workout/${detail.session.id}`);
    }).catch(() => { work.current = null; if (live) setError(true); });
    return () => { live = false; };
  }, [db, target, router, retry]);
  if (!target.start && !target.sessionId) return <PortalEmpty program />;
  return error ? <VStack gap={3}><Text role="alert">{t('startError')}</Text><Button label={t('retry')} className="min-h-11" onClick={() => { setError(false); setRetry(n => n + 1); }} /></VStack> : <PageSkeleton />;
}
