'use client';
import { z } from 'zod';
import type { Table } from 'dexie';
import type { OutboxDatabase } from './db';
import { backoffMs, canFlush, pendingBatch, settleRecord, type OutboxRecord } from './queue';

const reply = z.object({ accepted: z.array(z.string()), rejected: z.array(z.object({ clientUuid: z.string(), reason: z.string() })), serverTime: z.string() });
const active = new Map<string, Promise<void>>();
async function settle<T extends OutboxRecord>(db: OutboxDatabase, table: Table<T, string>, sent: T[], response: z.infer<typeof reply>) {
  await db.transaction('rw', table, async () => {
    for (const record of sent) {
      const current = await table.get(record.clientUuid); if (!current) continue;
      const rejection = response.rejected.find(r => r.clientUuid === record.clientUuid);
      if (rejection || response.accepted.includes(record.clientUuid)) await table.put(settleRecord(current, record, rejection ? 'rejected' : 'synced', rejection?.reason));
    }
  });
}
async function failed<T extends OutboxRecord>(db: OutboxDatabase, table: Table<T, string>, sent: T[]) {
  await db.transaction('rw', table, async () => {
    for (const record of sent) {
      const current = await table.get(record.clientUuid);
      if (current && current.clientUpdatedAt === record.clientUpdatedAt) await table.put({ ...current, attempts: current.attempts + 1, nextAttemptAt: Date.now() + backoffMs(current.attempts + 1) });
    }
  });
}
async function run(db: OutboxDatabase) {
  if (!navigator.onLine) return;
  const identity = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'same-origin' });
  if (identity.status === 401 || identity.status === 403) throw new Error('owner_mismatch');
  if (!identity.ok) throw new Error('identity_unavailable');
  const caller = z.object({ userId: z.string(), role: z.string() }).parse(await identity.json());
  if (!canFlush(db.owner, caller.userId) || caller.role !== 'client') throw new Error('owner_mismatch');
  const sessions = pendingBatch(await db.sessions.toArray(), Date.now(), 100);
  const sets = pendingBatch(await db.setLogs.toArray(), Date.now(), 1000);
  if (!sessions.length && !sets.length) return;
  try {
    const response = await fetch('/api/v1/workout-sessions/sync', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ sessions: sessions.map(r => r.payload), sets: sets.map(r => r.payload) }) });
    if (!response.ok) throw new Error(`sync_${response.status}`);
    const data = reply.parse(await response.json());
    await settle(db, db.sessions, sessions, data); await settle(db, db.setLogs, sets, data);
  } catch (error) { await failed(db, db.sessions, sessions); await failed(db, db.setLogs, sets); throw error; }
}
/** Task 5: foreground-only single flight per owner; manual retries always get a fresh replay key. */
export function flushOutbox(db: OutboxDatabase): Promise<void> {
  const existing = active.get(db.owner); if (existing) return existing;
  const work = run(db).finally(() => { active.delete(db.owner); }); active.set(db.owner, work); return work;
}
