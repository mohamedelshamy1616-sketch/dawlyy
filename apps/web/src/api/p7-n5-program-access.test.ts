import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { subscriptions, workoutSessions } from '@dawlyy/db/schema';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { getAuthContext } from '../server/auth';
import { withAuthTx } from '../server/db';
import { getPortalProgram } from '../server/workout/portal';
import { workoutFixture } from '../server/workout/test-fixture';
import { app } from './index';

const cases = [
  ['pending', 403], ['active', 200], ['grace', 200], ['paused', 403],
  ['expired', 403], ['suspended', 403], ['cancelled', 403], ['absent', 403],
] as const;
type State = typeof cases[number][0];

describe('P7 N5 current program access and retained history', () => {
  let f: Awaited<ReturnType<typeof workoutFixture>>;
  beforeEach(async () => { f = await workoutFixture(); });
  afterEach(async () => { await f?.cleanup(); });

  async function subscriptionState(state: State) {
    if (state === 'absent') return;
    await setupActiveSubscription(f.owner.tenantId, f.a.clientId);
    await setupApiData(f.owner.tenantId, 'N5 subscription state', tx => tx.update(subscriptions).set({ state,
      endsOn: state === 'grace' ? '2000-01-02' : '2099-01-01',
      graceEndsOn: state === 'grace' ? '2099-01-02' : null,
      pausedAt: state === 'paused' ? new Date('2000-01-02T00:00:00Z') : null,
    }).where(eq(subscriptions.clientId, f.a.clientId)));
  }

  it.each(cases)('%s: GET /me/program returns %i', async (state, status) => {
    await subscriptionState(state);
    const result = await call(app, 'GET', '/api/v1/me/program', { as: f.a.userId });
    expect(result.status).toBe(status);
    if (status === 200) expect(result.json).toMatchObject({ programId: f.a.programId, document: { phases: expect.any(Array) } });
    else expect(result.json).toMatchObject({ error: { code: 'access_expired', details: { state: state === 'absent' ? null : state } } });
  });

  it.each(cases)('%s: the shared program reader enforces the same boundary', async (state, status) => {
    await subscriptionState(state);
    const auth = await getAuthContext(new Headers({ authorization: `Bearer ${f.a.userId}` }));
    expect(auth).not.toBeNull();
    const result = withAuthTx(auth!, tx => getPortalProgram(tx, auth!));
    if (status === 200) await expect(result).resolves.toMatchObject({ programId: f.a.programId });
    else await expect(result).rejects.toMatchObject({ status: 403, code: 'access_expired', details: { state: state === 'absent' ? null : state } });
  });

  it('keeps expired workout history, session detail and exercise history readable', async () => {
    await subscriptionState('expired');
    const sessionId = randomUUID();
    await setupApiData(f.owner.tenantId, 'N5 retained workout', tx => tx.insert(workoutSessions).values({
      id: sessionId, tenantId: f.owner.tenantId, clientId: f.a.clientId, clientUuid: randomUUID(),
      localDate: '2020-01-01', timezone: 'Africa/Cairo', state: 'completed',
    }));
    const history = await call(app, 'GET', '/api/v1/workout-sessions', { as: f.a.userId });
    expect(history.status).toBe(200);
    expect(history.json).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: sessionId })]) });
    const detail = await call(app, 'GET', `/api/v1/workout-sessions/${sessionId}`, { as: f.a.userId });
    expect(detail.status).toBe(200);
    expect(detail.json).toMatchObject({ session: { id: sessionId } });
    expect((await call(app, 'GET', `/api/v1/workout-sessions/exercise-history/${f.exerciseId}`, { as: f.a.userId })).status).toBe(200);
  });

  for (const state of ['expired', 'absent'] as const) it(`${state}: identity and Today remain available for renewal`, async () => {
    await subscriptionState(state);
    expect((await call(app, 'GET', '/api/v1/me', { as: f.a.userId })).status).toBe(200);
    const today = await call(app, 'GET', '/api/v1/me/today', { as: f.a.userId });
    expect(today.status).toBe(200);
    expect(today.json).toMatchObject({ subscription: { state: state === 'absent' ? 'none' : state } });
  });

  it('authenticates before checking access and preserves the coach portal boundary', async () => {
    expect((await call(app, 'GET', '/api/v1/me/program')).status).toBe(401);
    for (const as of [f.owner.userId, f.staffUserId]) {
      const result = await call(app, 'GET', '/api/v1/me/program', { as });
      expect(result.status).toBe(403);
      expect(result.json).toMatchObject({ error: { code: 'forbidden' } });
    }
  });
});
