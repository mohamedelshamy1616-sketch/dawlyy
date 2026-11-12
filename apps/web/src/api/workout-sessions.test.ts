import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sessionVolume } from '@dawlyy/core/workout';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { workoutFixture } from '../server/workout/test-fixture';
import type { SessionDetail, SetWrite, WorkoutSummary } from '../server/workout/contracts';
import { app } from './index';

const base = '/api/v1/workout-sessions';
const syncReply = z.object({ accepted: z.array(z.string()), rejected: z.array(z.object({ clientUuid: z.string(), reason: z.string() })) });
describe('Task 5 offline workout API / G2 and G3', () => {
  let f: Awaited<ReturnType<typeof workoutFixture>>;
  beforeEach(async () => {
    f = await workoutFixture();
    await setupActiveSubscription(f.owner.tenantId, f.a.clientId);
    await setupActiveSubscription(f.owner.tenantId, f.b.clientId);
  });
  afterEach(async () => { await f?.cleanup(); });
  const startBody = (actor = f.a, date = '2026-11-09') => ({ clientUuid: randomUUID(), programId: actor.programId, programVersionId: actor.versionId, dayId: f.dayId, workoutId: f.workoutId, localDate: date, timezone: 'Africa/Cairo' });
  async function start(actor = f.a, date?: string) {
    const response = await call(app, 'POST', base, { as: actor.userId, body: startBody(actor, date) });
    expect(response.status).toBe(200); return response.json as SessionDetail;
  }
  const set = (session: SessionDetail, setNo = 1): SetWrite => ({ clientUuid: randomUUID(), clientUpdatedAt: '2026-11-11T10:00:00Z', sessionClientUuid: session.session.clientUuid,
    exerciseId: f.exerciseId, setNo, reps: 10, load: 20, loadUnit: 'kg', completed: true, skipped: false, painFlag: false, tag: 'working' });
  async function sync(sets: SetWrite[], sessions: unknown[] = [], as = f.a.userId) {
    const response = await call(app, 'POST', `${base}/sync`, { as, body: { sessions, sets }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(response.status).toBe(200); return syncReply.parse(response.json);
  }
  async function finish(detail: SessionDetail, as: string = f.a.userId) {
    return call(app, 'POST', `${base}/${detail.session.id}/finish`, { as, body: { outcome: 'completed', endedAt: '2026-11-11T11:00:00Z', activeSeconds: 600 } });
  }

  it('deduplicates create and double flush, and older or equal timestamps never overwrite sets', async () => {
    const body = startBody();
    const first = await call(app, 'POST', base, { as: f.a.userId, body });
    const again = await call(app, 'POST', base, { as: f.a.userId, body });
    expect(first.status).toBe(200); expect(again.status).toBe(200);
    const detail = first.json as SessionDetail;
    expect((again.json as SessionDetail).session.id).toBe(detail.session.id);
    const sets = [1, 2, 3].map(n => set(detail, n));
    expect((await sync(sets)).rejected).toEqual([]); expect((await sync(sets)).rejected).toEqual([]);
    await sync(sets.map(s => ({ ...s, load: 99, clientUpdatedAt: '2026-11-11T09:00:00Z' })));
    await sync(sets.map(s => ({ ...s, load: 88 })));
    const read = await call(app, 'GET', `${base}/${detail.session.id}`, { as: f.a.userId });
    expect(read.status).toBe(200); expect((read.json as SessionDetail).sets).toHaveLength(3);
    expect((read.json as SessionDetail).sets.map(s => s.load)).toEqual([20, 20, 20]);
    const newer = sets.map(s => ({ ...s, load: 25, clientUpdatedAt: '2026-11-11T10:01:00Z' }));
    expect((await sync(newer)).rejected).toEqual([]);
    const updated = await call(app, 'GET', `${base}/${detail.session.id}`, { as: f.a.userId });
    expect((updated.json as SessionDetail).sets.map(s => s.load)).toEqual([25, 25, 25]);
    const conflict = await call(app, 'POST', base, { as: f.a.userId, body: { ...body, workoutId: 'different' } });
    expect(conflict.status).toBe(409); expect(conflict.json).toMatchObject({ error: { code: 'session_conflict' } });
  });

  it('creates a missing session before its sets in the same batch and rejects only invalid rows', async () => {
    const body = startBody();
    const row: SetWrite = { ...set({ session: { clientUuid: body.clientUuid } } as SessionDetail), sessionClientUuid: body.clientUuid };
    const response = await sync([row, { ...row, clientUuid: randomUUID(), sessionClientUuid: randomUUID() }], [{ ...body, state: 'active', clientUpdatedAt: '2026-11-11T10:00:00Z' }]);
    expect(response.accepted).toEqual([body.clientUuid, row.clientUuid]); expect(response.rejected).toHaveLength(1);
    expect(response.rejected[0]?.reason).toBe('not_found');
  });

  it('stores a core-derived finish summary and refuses completed to active on both write paths', async () => {
    const detail = await start(); const sets = [1, 2, 3].map(n => set(detail, n)); await sync(sets);
    const result = await finish(detail); expect(result.status).toBe(200);
    expect((result.json as WorkoutSummary).volume.current).toBe(sessionVolume(sets.map(s => ({ exerciseId: s.exerciseId, setNo: s.setNo, reps: s.reps ?? undefined, load: s.load ?? undefined, loadUnit: 'kg', completed: s.completed, skipped: s.skipped })), 'kg').volume);
    const read = await call(app, 'GET', `${base}/${detail.session.id}`, { as: f.a.userId });
    expect((read.json as SessionDetail).session.summary).toEqual(result.json);
    const patch = await call(app, 'PATCH', `${base}/${detail.session.id}`, { as: f.a.userId, body: { event: 'resume' } });
    expect(patch.status).toBe(422); expect(patch.json).toMatchObject({ error: { code: 'illegal_transition' } });
    const rejected = await sync([], [{ clientUuid: detail.session.clientUuid, clientUpdatedAt: '2099-01-01T00:00:00Z', state: 'active' }]);
    expect(rejected.rejected).toEqual([{ clientUuid: detail.session.clientUuid, reason: 'illegal_transition' }]);
    const unchanged = await call(app, 'GET', `${base}/${detail.session.id}`, { as: f.a.userId });
    expect((unchanged.json as SessionDetail).session.state).toBe('completed');
  });

  it('isolates client A from B and refuses coach session creation and finish', async () => {
    const b = await start(f.b);
    expect((await call(app, 'GET', `${base}/${b.session.id}`, { as: f.a.userId })).status).toBe(404);
    expect((await finish(b)).status).toBe(404);
    const row = set(b);
    expect((await sync([row])).rejected).toEqual([{ clientUuid: row.clientUuid, reason: 'not_found' }]);
    const hijack = await sync([], [{ clientUuid: b.session.clientUuid, state: 'active', clientUpdatedAt: '2026-11-11T10:00:00Z' }]);
    expect(hijack.rejected[0]?.reason).toBe('not_found');
    for (const as of [f.owner.userId, f.staffUserId]) {
      expect((await call(app, 'POST', base, { as, body: startBody() })).status).toBe(403);
      expect((await finish(b, as)).status).toBe(403);
    }
    const unchanged = await call(app, 'GET', `${base}/${b.session.id}`, { as: f.b.userId });
    expect((unchanged.json as SessionDetail).sets).toEqual([]);
    expect((unchanged.json as SessionDetail).session.state).toBe('not_started');
  });

  it('keeps assigned-scope history private and paginates finished sessions without repeats', async () => {
    const a = await start(); const b = await start(f.b); await finish(a); await finish(b, f.b.userId);
    const next = await start(f.a, '2026-11-11'); await finish(next);
    const assigned = await call(app, 'GET', `${base}?clientId=${f.a.clientId}&limit=1`, { as: f.staffUserId });
    expect(assigned.status).toBe(200);
    const first = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string() }).parse(assigned.json);
    expect(first.items.map(r => r.id)).toEqual([next.session.id]);
    const second = await call(app, 'GET', `${base}?clientId=${f.a.clientId}&limit=1&cursor=${first.nextCursor}`, { as: f.staffUserId });
    expect(second.status).toBe(200); expect(second.json).toMatchObject({ items: [{ id: a.session.id }], nextCursor: null });
    const hidden = await call(app, 'GET', `${base}?clientId=${f.b.clientId}`, { as: f.staffUserId });
    expect(hidden.status).toBe(200); expect(hidden.json).toMatchObject({ items: [] });
    expect((await call(app, 'GET', `${base}/${b.session.id}`, { as: f.staffUserId })).status).toBe(404);
    expect((await call(app, 'GET', base, { as: f.staffUserId })).status).toBe(400);
    expect((await call(app, 'GET', `${base}?from=2026-11-10`, { as: f.a.userId })).json).toMatchObject({ items: [{ id: next.session.id }] });
  });

  it('G3 returns previous values before logging and the last five exercise sessions without a date cap', async () => {
    // Old history remains available: no rolling three-month window.
    const old = await start(f.a, '2020-01-01'); await sync([set(old)]); await finish(old);
    const current = await start(f.a, '2026-11-11');
    expect(current.lastComparable?.id).toBe(old.session.id); expect(current.lastComparable?.sets[0]).toMatchObject({ reps: 10, load: 20 });
    const history = await call(app, 'GET', `${base}/exercise-history/${f.exerciseId}`, { as: f.a.userId });
    expect(history.status).toBe(200); expect(history.json).toMatchObject([{ sessionId: old.session.id, sets: [{ reps: 10, load: 20 }] }]);
    // Seed additional completed history as fixture data; reads still go through real RLS.
    const { workoutSessions, setLogs } = await import('@dawlyy/db/schema');
    await setupApiData(f.owner.tenantId, 'five-session drawer history', async tx => {
      for (let day = 1; day <= 6; day++) {
        const [session] = await tx.insert(workoutSessions).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, clientUuid: randomUUID(), localDate: `2026-10-0${day}`, timezone: 'Africa/Cairo', state: 'completed' }).returning({ id: workoutSessions.id });
        await tx.insert(setLogs).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, sessionId: session!.id, clientUuid: randomUUID(), clientUpdatedAt: new Date(), exerciseId: f.exerciseId, setNo: 1, reps: 10, load: 20, loadUnit: 'kg' });
      }
    });
    const lastFive = await call(app, 'GET', `${base}/exercise-history/${f.exerciseId}`, { as: f.a.userId });
    expect(lastFive.status).toBe(200);
    expect(z.array(z.object({ localDate: z.string() })).parse(lastFive.json).map(r => r.localDate)).toEqual(['2026-10-06', '2026-10-05', '2026-10-04', '2026-10-03', '2026-10-02']);
  });
});
