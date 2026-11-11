'use client';
import type { SessionDetail, SessionWrite, SetWrite } from '@/src/server/workout/contracts';
import type { OutboxDatabase } from './db';
import type { SessionOutbox } from './queue';

/** Task 5: monotonic local stamps even for multiple keystrokes in the same millisecond. */
export function nextStamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString();
}
/** Task 5: server snapshots never overwrite pending offline session edits. */
export async function cacheSession(db: OutboxDatabase, detail: SessionDetail) {
  await db.transaction('rw', db.sessions, db.setLogs, async () => {
    const s = detail.session; const existing = await db.sessions.get(s.clientUuid);
    if (existing && existing.syncState !== 'synced') return;
    const stamp = s.clientUpdatedAt ?? new Date().toISOString();
    const payload: SessionWrite = { clientUuid: s.clientUuid, clientUpdatedAt: stamp, programId: s.programId ?? undefined,
      programVersionId: s.programVersionId ?? undefined, dayId: s.dayId ?? undefined, workoutId: s.workoutId ?? undefined,
      localDate: s.localDate, timezone: s.timezone, state: s.state, startedAt: s.startedAt, endedAt: s.endedAt,
      activeSeconds: s.activeSeconds, rpeOverall: s.rpeOverall, mood: s.mood, painNote: s.painNote, clientNote: s.clientNote };
    await db.sessions.put({ clientUuid: s.clientUuid, clientUpdatedAt: stamp, payload, cached: detail, syncState: 'synced', attempts: 0 });
    for (const entry of detail.sets) {
      const { id: _id, ...set } = entry;
      const local = await db.setLogs.get(set.clientUuid);
      if (!local || local.syncState === 'synced') await db.setLogs.put({ clientUuid: set.clientUuid,
        clientUpdatedAt: set.clientUpdatedAt, payload: set, syncState: 'synced', attempts: 0 });
    }
  });
}
/** Task 5: persist a session change before the UI acknowledges it. */
export async function queueSession(db: OutboxDatabase, clientUuid: string, patch: Partial<SessionWrite>): Promise<SessionOutbox> {
  return db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(clientUuid); if (!current) throw new Error('Session is not cached');
    const stamp = nextStamp(current.clientUpdatedAt);
    const payload = { ...current.payload, ...patch, clientUuid, clientUpdatedAt: stamp };
    const updated: SessionOutbox = { ...current, clientUpdatedAt: stamp, payload, syncState: 'pending', attempts: 0, reason: undefined, nextAttemptAt: undefined };
    await db.sessions.put(updated); return updated;
  });
}
/** Task 5: every input is durable first; stable set UUIDs make replay idempotent. */
export async function queueSet(db: OutboxDatabase, set: SetWrite) {
  await db.transaction('rw', db.setLogs, async () => {
    const previous = await db.setLogs.get(set.clientUuid); const stamp = nextStamp(previous?.clientUpdatedAt);
    await db.setLogs.put({ clientUuid: set.clientUuid, clientUpdatedAt: stamp, payload: { ...set, clientUpdatedAt: stamp }, syncState: 'pending', attempts: 0 });
  });
}
