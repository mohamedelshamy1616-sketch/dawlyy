import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { subscriptions, workoutSessions } from '@dawlyy/db/schema';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { workoutFixture } from '../server/workout/test-fixture';
import { getAuthContext } from '../server/auth';
import { withAuthTx } from '../server/db';
import { nutritionLogContext } from '../server/nutrition/client';
import type { SessionDetail } from '../server/workout/contracts';
import { app } from './index';

describe('P7 D1 and D2 retained client logging', () => {
  let f: Awaited<ReturnType<typeof workoutFixture>>;
  beforeEach(async () => { f = await workoutFixture(); await setupActiveSubscription(f.owner.tenantId, f.a.clientId); });
  afterEach(async () => { await f?.cleanup(); });
  async function lapse(state: 'expired' | 'paused') {
    await setupApiData(f.owner.tenantId, 'D1/D2 lapse subscription', tx => tx.update(subscriptions).set({ state,
      startsOn: '2000-01-01', endsOn: '2020-01-01', graceEndsOn: null,
      pausedAt: state === 'paused' ? new Date('2020-01-02T00:00:00Z') : null,
    }).where(eq(subscriptions.clientId, f.a.clientId)));
  }
  const startBody = () => ({ clientUuid: randomUUID(), programId: f.a.programId, programVersionId: f.a.versionId,
    dayId: f.dayId, workoutId: f.workoutId, localDate: '2020-01-01', timezone: 'Africa/Cairo' });
  for (const state of ['paused', 'expired'] as const) {
    it(`${state}: free-meal page context and logging work while the current plan stays gated`, async () => {
      await lapse(state);
      const auth = await getAuthContext(new Headers({ authorization: `Bearer ${f.a.userId}` }));
      const context = await withAuthTx(auth!, tx => nutritionLogContext(tx, auth!));
      expect(context).toMatchObject({ localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), timezone: 'Africa/Cairo' });
      const meal = await call(app, 'POST', '/api/v1/meal-logs', { as: f.a.userId,
        body: { clientUuid: randomUUID(), localDate: context.localDate, status: 'eaten', freeEntry: { text: 'رز وفراخ' }, clientUpdatedAt: new Date().toISOString() } });
      expect(meal.status).toBe(200);
      expect(meal.json).toMatchObject({ freeEntry: { text: 'رز وفراخ' } });
      expect((await call(app, 'GET', '/api/v1/nutrition/me', { as: f.a.userId })).status).toBe(403);
    });
    it(`${state}: sync saves sets for a session started inside the access window`, async () => {
      const started = await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: startBody() });
      expect(started.status).toBe(200);
      const detail = started.json as SessionDetail;
      await setupApiData(f.owner.tenantId, 'D2 recorded session start before lapse', tx => tx.update(workoutSessions)
        .set({ startedAt: new Date('2020-01-01T10:00:00Z'), state: 'active' }).where(eq(workoutSessions.id, detail.session.id)));
      await lapse(state);
      const row = { clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), sessionClientUuid: detail.session.clientUuid,
        exerciseId: f.exerciseId, setNo: 1, tag: 'working', completed: true, note: 'queued offline' };
      const headers = { 'Idempotency-Key': randomUUID() };
      const sync = () => call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId, headers, body: { sessions: [], sets: [row] } });
      expect(await sync()).toMatchObject({ status: 200, json: { accepted: [row.clientUuid], rejected: [] } });
      expect((await sync()).status).toBe(200);
      const read = await call(app, 'GET', `/api/v1/workout-sessions/${detail.session.id}`, { as: f.a.userId });
      expect(read.json).toMatchObject({ sets: [{ clientUuid: row.clientUuid, note: 'queued offline' }] });
      expect((await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: startBody() })).status).toBe(403);
      const newSession = { ...startBody(), startedAt: '2020-01-01T10:00:00Z', clientUpdatedAt: new Date().toISOString() };
      expect((await call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId,
        body: { sessions: [newSession], sets: [] } })).status).toBe(403);
    });
  }
  it('returns 403 for an existing session started after expiry, even with a backdated sync payload', async () => {
    const started = await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: startBody() });
    const detail = started.json as SessionDetail;
    await setupApiData(f.owner.tenantId, 'D2 start outside historical window', tx => tx.update(workoutSessions)
      .set({ startedAt: new Date('2020-01-03T00:00:00Z'), state: 'active' }).where(eq(workoutSessions.id, detail.session.id)));
    await lapse('expired');
    const result = await call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId,
      body: { sessions: [{ clientUuid: detail.session.clientUuid, startedAt: '2020-01-01T10:00:00Z', clientUpdatedAt: new Date().toISOString() }], sets: [] } });
    expect(result).toMatchObject({ status: 403, json: { error: { code: 'access_expired' } } });
  });
  it('accepts an offline first start for an existing session created during access, then saves its sets', async () => {
    const started = await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: startBody() });
    expect(started.status).toBe(200);
    const detail = started.json as SessionDetail;
    await setupApiData(f.owner.tenantId, 'D2 existing cached session created before offline start', tx => tx.update(workoutSessions)
      .set({ createdAt: new Date('2020-01-01T09:00:00Z'), startedAt: null }).where(eq(workoutSessions.id, detail.session.id)));
    await lapse('expired');
    const row = { clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), sessionClientUuid: detail.session.clientUuid,
      exerciseId: f.exerciseId, setNo: 1, tag: 'working', completed: true };
    const result = await call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId,
      body: { sessions: [{ clientUuid: detail.session.clientUuid, startedAt: '2020-01-01T10:00:00Z', state: 'active', clientUpdatedAt: new Date().toISOString() }], sets: [row] } });
    expect(result).toMatchObject({ status: 200, json: { accepted: [detail.session.clientUuid, row.clientUuid], rejected: [] } });
  });
  it('keeps eligible offline rows when a mixed batch also attempts a new session', async () => {
    const started = await call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: startBody() });
    expect(started.status).toBe(200);
    const detail = started.json as SessionDetail;
    await setupApiData(f.owner.tenantId, 'D2 mixed batch eligible session', tx => tx.update(workoutSessions)
      .set({ startedAt: new Date('2020-01-01T10:00:00Z'), state: 'active' }).where(eq(workoutSessions.id, detail.session.id)));
    await lapse('expired');
    const newSession = { ...startBody(), clientUpdatedAt: new Date().toISOString(), startedAt: '2020-01-01T10:00:00Z', state: 'active' };
    const row = { clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), sessionClientUuid: detail.session.clientUuid,
      exerciseId: f.exerciseId, setNo: 1, tag: 'working', completed: true };
    const result = await call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId, body: { sessions: [newSession], sets: [row] } });
    expect(result).toMatchObject({ status: 200, json: { accepted: [row.clientUuid],
      rejected: [{ clientUuid: newSession.clientUuid, reason: 'access_expired' }] } });
  });
});
