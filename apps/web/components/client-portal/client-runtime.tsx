'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { outboxFor, type OutboxDatabase } from '@/src/lib/outbox/db';
import { flushOutbox } from '@/src/lib/outbox/flush';

const Runtime = createContext<{ db: OutboxDatabase | null; sync: () => Promise<void> }>({ db: null, sync: async () => {} });
const OWNER_KEY = 'dawlyy-client-owner';
/** Task 5: screens only see the currently authenticated owner's IndexedDB. */
export const useOutbox = () => useContext(Runtime);

/** Task 5: foreground triggers work on iOS without background sync. */
export function ClientRuntime({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [verifiedId, setVerifiedId] = useState<string | null>(null); const [error, setError] = useState(false); const [syncing, setSyncing] = useState(false);
  const verified = verifiedId === userId;
  const [mismatch, setMismatch] = useState(false);
  const [openedOwner, setOpenedOwner] = useState<string | null>(null); const [storageFailed, setStorageFailed] = useState(false);
  const candidate = useMemo(() => verified ? outboxFor(userId) : null, [verified, userId]);
  const db = verified && openedOwner === userId && !storageFailed ? candidate : null;
  useEffect(() => {
    if (!candidate) return;
    let live = true;
    void candidate.open().then(() => { if (live) { setOpenedOwner(candidate.owner); setStorageFailed(false); } })
      .catch(() => { if (live) setStorageFailed(true); });
    return () => { live = false; };
  }, [candidate]);
  const sync = useCallback(async () => {
    if (!db) return;
    setSyncing(true);
    try { await flushOutbox(db); setError(false); }
    catch (cause) {
      if (cause instanceof Error && cause.message === 'owner_mismatch') { setVerifiedId(null); setMismatch(true); localStorage.removeItem(OWNER_KEY); navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_OWNER' }); }
      setError(true);
    } finally { setSyncing(false); }
  }, [db]);
  useEffect(() => {
    let live = true;
    const offlineIdentity = () => {
      if (!live) return;
      let owner: string | null = null;
      try { owner = localStorage.getItem(OWNER_KEY); } catch { /* Storage blocked: require a fresh online identity. */ }
      setVerifiedId(owner === userId ? userId : null); setError(true);
    };
    const verify = async () => {
      if (!navigator.onLine) { offlineIdentity(); return; }
      try {
        const response = await fetch('/api/v1/me', { cache: 'no-store' });
        if (response.status >= 500) { offlineIdentity(); return; }
        const caller = response.ok ? await response.json() as { userId?: string; role?: string } : null;
        if (!live) return;
        const same = caller?.userId === userId && caller?.role === 'client';
        setVerifiedId(same ? userId : null); setMismatch(!same);
        if (same) { try { localStorage.setItem(OWNER_KEY, userId); } catch { /* Online use still works when browser storage is blocked. */ } }
        else { localStorage.removeItem(OWNER_KEY); navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_OWNER' }); }
      } catch { offlineIdentity(); }
    };
    const changed = (event: StorageEvent) => {
      if (event.key === OWNER_KEY && event.newValue !== userId && live) { setVerifiedId(null); setMismatch(true); }
    };
    const visible = () => { if (document.visibilityState === 'visible') void verify(); };
    void verify(); window.addEventListener('online', verify);
    window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', visible);
    return () => { live = false; window.removeEventListener('online', verify); window.removeEventListener('storage', changed); document.removeEventListener('visibilitychange', visible); };
  }, [userId]);
  useEffect(() => {
    if (!db) return;
    const flush = () => { if (document.visibilityState === 'visible') void sync(); };
    flush(); window.addEventListener('online', flush); document.addEventListener('visibilitychange', flush);
    const timer = window.setInterval(flush, 30000);
    return () => { clearInterval(timer); window.removeEventListener('online', flush); document.removeEventListener('visibilitychange', flush); };
  }, [db, sync]);
  useEffect(() => {
    if (!verified || !('serviceWorker' in navigator) || (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_SW !== '1')) return;
    let live = true;
    void navigator.serviceWorker.register('/sw.js').then(async registration => {
      await navigator.serviceWorker.ready;
      if (live) (navigator.serviceWorker.controller ?? registration.active)?.postMessage({ type: 'SET_OWNER', userId });
    }).catch(() => { /* Logging remains durable in IndexedDB when worker registration is unavailable. */ });
    return () => { live = false; };
  }, [verified, userId]);
  const t = useTranslations('workout');
  return <Runtime.Provider value={{ db, sync }}>
    <UnsyncedBadge db={db} syncing={syncing} error={error} sync={sync} />
    {mismatch ? <Text as="p" role="alert" className="rounded-xl border p-4">{t('accountChanged')}</Text> : storageFailed ? <Text role="alert">{t('storageError')}</Text> : db ? children : <Text role="status">{t(error ? 'openOnlineFirst' : 'loading')}</Text>}
  </Runtime.Provider>;
}

/** Task 5: durable unsynced/rejected counts remain visible throughout the client portal. */
export function UnsyncedBadge({ db, syncing, error, sync }: { db: OutboxDatabase | null; syncing: boolean; error: boolean; sync: () => Promise<void> }) {
  const t = useTranslations('workout');
  const snapshot = useLiveQuery(async () => ({ owner: db?.owner, rows: db ? [...await db.sessions.toArray(), ...await db.setLogs.toArray(), ...await db.metrics.toArray()].filter(r => r.syncState !== 'synced') : [] }), [db]);
  const rows = db && snapshot?.owner === db.owner ? snapshot.rows : [];
  const rejected = rows.filter(r => r.syncState === 'rejected');
  const pending = rows.length > 0;
  const label = pending ? t('unsynced', { count: rows.length }) : t('allSynced');
  return <VStack as="aside" className="mb-4 min-w-0" gap={2} aria-live="polite">
    <HStack align="center" gap={2} className="justify-end">
      <VStack as="span" aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${pending || error ? 'bg-warning' : 'bg-success'}`} />
      <Text data-testid="unsynced-count" type="supporting" className="sr-only">{label}</Text>
    </HStack>
    {pending ? <VStack className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
      <Text>{label}</Text>
      <Button className="min-h-11" variant="secondary" isDisabled={!db || syncing} onClick={() => void sync()} data-testid="sync-now" label={t(syncing ? 'syncing' : 'syncNow')} />
      {error ? <Text as="p" className="w-full text-sm">{t('offlineSaved')}</Text> : null}
      {rejected.length ? <Text as="p" className="w-full break-words text-sm text-destructive">{t('rejected', { count: rejected.length })} {rejected.map(r => t(`reasons.${r.reason && ['illegal_transition', 'session_conflict', 'not_found', 'forbidden', 'substitution_not_allowed', 'validation_error'].includes(r.reason) ? r.reason : 'unknown'}`)).join(' · ')}</Text> : null}
    </VStack> : null}
  </VStack>;
}
