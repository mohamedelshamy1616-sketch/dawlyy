'use client';
import { z } from 'zod';
import type { Table } from 'dexie';
import type { OutboxDatabase } from './db';
import { MAX_OUTBOX_BATCH_BYTES, MAX_SYNC_SESSIONS, MAX_SYNC_SETS } from '../../server/request-limits';
import { backoffMs, canFlush, pendingBatch, settleRecord, type OutboxRecord } from './queue';
import type { SessionOutbox, SetOutbox } from './queue';

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
type Batch = { sessions: SessionOutbox[]; sets: SetOutbox[] };
const encode = (batch: Batch) => JSON.stringify({ sessions: batch.sessions.map(r => r.payload), sets: batch.sets.map(r => r.payload) });

function batches(sessions: SessionOutbox[], sets: SetOutbox[]): Batch[] {
  const result: Batch[] = []; let batch: Batch = { sessions: [], sets: [] };
  const envelopeBytes = new TextEncoder().encode(encode(batch)).length;
  let bytes = envelopeBytes;
  for (const entry of [...sessions.map(row => ({ kind: 'sessions' as const, row })), ...sets.map(row => ({ kind: 'sets' as const, row }))]) {
    const size = new TextEncoder().encode(JSON.stringify(entry.row.payload)).length;
    const count = batch[entry.kind].length;
    if (bytes + size + (count ? 1 : 0) > MAX_OUTBOX_BATCH_BYTES || count >= (entry.kind === 'sessions' ? MAX_SYNC_SESSIONS : MAX_SYNC_SETS)) {
      if (batch.sessions.length || batch.sets.length) result.push(batch);
      batch = { sessions: [], sets: [] }; bytes = envelopeBytes;
    }
    bytes += size + (batch[entry.kind].length ? 1 : 0);
    if (entry.kind === 'sessions') batch.sessions.push(entry.row); else batch.sets.push(entry.row);
  }
  if (batch.sessions.length || batch.sets.length) result.push(batch);
  return result;
}

async function reject(db: OutboxDatabase, batch: Batch, reason: string) {
  const response = { accepted: [], rejected: [...batch.sessions, ...batch.sets].map(r => ({ clientUuid: r.clientUuid, reason })), serverTime: new Date().toISOString() };
  await settle(db, db.sessions, batch.sessions, response); await settle(db, db.setLogs, batch.sets, response);
}

async function send(db: OutboxDatabase, batch: Batch): Promise<boolean> {
  const body = encode(batch);
  // A corrupt/legacy single record must never create an oversized request.
  if (new TextEncoder().encode(body).length > MAX_OUTBOX_BATCH_BYTES) {
    await reject(db, batch, 'payload_too_large'); return true;
  }
  let response: Response;
  try {
    response = await fetch('/api/v1/workout-sessions/sync', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body });
    if (!response.ok && response.status !== 413 && response.status !== 403) throw new Error(`sync_${response.status}`);
    if (response.ok) {
      const data = reply.parse(await response.json());
      await settle(db, db.sessions, batch.sessions, data); await settle(db, db.setLogs, batch.sets, data);
      return true;
    }
  } catch (error) {
    await failed(db, db.sessions, batch.sessions); await failed(db, db.setLogs, batch.sets); throw error;
  }
  if (response.status === 403) { await reject(db, batch, 'sync_403'); return false; }
  const length = batch.sessions.length + batch.sets.length;
  if (length === 1) { await reject(db, batch, 'payload_too_large'); return true; }
  // Sessions stay before their dependent sets in every recursive retry.
  const middle = Math.floor(length / 2); const sessionCount = batch.sessions.length;
  const first = { sessions: batch.sessions.slice(0, middle), sets: batch.sets.slice(0, Math.max(0, middle - sessionCount)) };
  const second = { sessions: batch.sessions.slice(middle), sets: batch.sets.slice(Math.max(0, middle - sessionCount)) };
  if (!await send(db, first)) { await reject(db, second, 'sync_403'); return false; }
  return send(db, second);
}
async function run(db: OutboxDatabase) {
  if (!navigator.onLine) return;
  const identity = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'same-origin' });
  if (identity.status === 401 || identity.status === 403) throw new Error('owner_mismatch');
  if (!identity.ok) throw new Error('identity_unavailable');
  const caller = z.object({ userId: z.string(), role: z.string() }).parse(await identity.json());
  if (!canFlush(db.owner, caller.userId) || caller.role !== 'client') throw new Error('owner_mismatch');
  const sessions = pendingBatch(await db.sessions.toArray(), Date.now(), Number.MAX_SAFE_INTEGER);
  const sets = pendingBatch(await db.setLogs.toArray(), Date.now(), Number.MAX_SAFE_INTEGER);
  if (!sessions.length && !sets.length) return;
  const pending = batches(sessions, sets);
  for (const [index, batch] of pending.entries()) {
    if (!await send(db, batch)) {
      for (const remaining of pending.slice(index + 1)) await reject(db, remaining, 'sync_403');
      throw new Error('sync_403');
    }
  }
}
/** Task 5: foreground-only single flight per owner; manual retries always get a fresh replay key. */
export function flushOutbox(db: OutboxDatabase): Promise<void> {
  const existing = active.get(db.owner); if (existing) return existing;
  const work = run(db).finally(() => { active.delete(db.owner); }); active.set(db.owner, work); return work;
}
