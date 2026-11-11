'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NutritionRequestError, nutritionRequest } from './transport';

/** Task 6: a queued client write keeps its own idempotency key so a replay never duplicates. */
export type QueuedWrite = { id: string; path: string; body: unknown; key: string };
const STORAGE_KEY = 'dawlyy.nutrition.queue.v1';

function readQueue(): QueuedWrite[] {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((v): v is QueuedWrite => !!v && typeof v === 'object' && 'id' in v && 'path' in v && 'key' in v) : [];
  } catch { return []; }
}
function writeQueue(queue: QueuedWrite[]) { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch { /* Storage can be full or blocked: the write then stays in memory only. */ } }
/** Task 6: only transport failures and 5xx are retried; other statuses mean the server refused the write. */
export function isRetryable(error: unknown): boolean {
  return !(error instanceof NutritionRequestError) || error.status >= 500;
}

/** Task 6: the in-page retry queue for client logging (shared outbox belongs to T5). Writes are saved on this phone when offline and replayed on reconnect. */
export function useWriteQueue() {
  const [pending, setPending] = useState(0); const [offline, setOffline] = useState(false); const flushing = useRef(false);
  const sync = useCallback(() => setPending(readQueue().length), []);
  const flush = useCallback(async () => {
    if (flushing.current) return; flushing.current = true;
    try {
      for (const entry of readQueue()) {
        try { await nutritionRequest(entry.path, { method: 'POST', body: entry.body, key: entry.key }); }
        catch (error) { if (isRetryable(error)) break; }
        writeQueue(readQueue().filter(e => e.id !== entry.id || e.key !== entry.key));
      }
    } finally { flushing.current = false; sync(); }
  }, [sync]);
  useEffect(() => {
    const online = () => { setOffline(false); void flush(); }; const off = () => setOffline(true);
    // Reading storage and connectivity after mount keeps server and first client render identical.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    sync(); setOffline(!navigator.onLine); if (navigator.onLine) void flush();
    window.addEventListener('online', online); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', off); };
  }, [flush, sync]);
  /** Sends one write; resolves 'sent' or 'queued'. Non-retryable refusals throw to the caller. */
  const send = useCallback(async (path: string, body: { clientUuid: string; [field: string]: unknown }): Promise<'sent' | 'queued'> => {
    const key = crypto.randomUUID();
    if (!navigator.onLine) { writeQueue([...readQueue().filter(e => e.id !== body.clientUuid), { id: body.clientUuid, path, body, key }]); sync(); return 'queued'; }
    try { await nutritionRequest(path, { method: 'POST', body, key }); return 'sent'; }
    catch (error) {
      if (!isRetryable(error)) throw error;
      writeQueue([...readQueue().filter(e => e.id !== body.clientUuid), { id: body.clientUuid, path, body, key }]); sync(); return 'queued';
    }
  }, [sync]);
  return { send, pending, offline, flush };
}
