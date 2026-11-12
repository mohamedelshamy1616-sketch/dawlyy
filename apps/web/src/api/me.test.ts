import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call, setupActiveSubscription } from '../test/api-harness';
import { workoutFixture } from '../server/workout/test-fixture';
import { app } from './index';

describe('Task 5 own client portal', () => {
  let fixture: Awaited<ReturnType<typeof workoutFixture>>;
  beforeEach(async () => { fixture = await workoutFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });

  it('preserves GET /me identity, authenticates portal reads, and denies coaches', async () => {
    const me = await call(app, 'GET', '/api/v1/me', { as: fixture.a.userId });
    expect(me.status).toBe(200); expect(me.json).toMatchObject({ userId: fixture.a.userId, clientId: fixture.a.clientId, role: 'client' });
    for (const path of ['/api/v1/me/today', '/api/v1/me/program']) {
      expect((await call(app, 'GET', path)).status).toBe(401);
      expect((await call(app, 'GET', path, { as: fixture.owner.userId })).status).toBe(403);
      expect((await call(app, 'GET', path, { as: fixture.staffUserId })).status).toBe(403);
    }
  });

  it('returns only the own published copy without the current draft or internal notes', async () => {
    // P7 N5 (docs/qa/FINAL_REVIEW.md; build plan Task 3 acceptance): the current program needs active access.
    await setupActiveSubscription(fixture.owner.tenantId, fixture.a.clientId);
    const response = await call(app, 'GET', '/api/v1/me/program', { as: fixture.a.userId });
    expect(response.status).toBe(200);
    const program = z.object({ programId: z.string(), versionNo: z.number(), document: z.record(z.string(), z.unknown()), startDate: z.string(), progress: z.object({ weeksTotal: z.number(), currentWeekIndex: z.number() }) }).parse(response.json);
    expect(program.programId).toBe(fixture.a.programId); expect(program.versionNo).toBe(1);
    expect(program.startDate).toBe('2026-11-09'); expect(program.progress.weeksTotal).toBe(2);
    expect(program.document).not.toHaveProperty('notes'); expect(program.document).not.toHaveProperty('goal');
    expect(JSON.stringify(response.json)).not.toContain(fixture.b.programId);
    expect(JSON.stringify(response.json)).not.toContain('DRAFT ONLY');
  });

  it('resolves training and rest days in the client timezone and rejects invalid dates', async () => {
    const rest = await call(app, 'GET', '/api/v1/me/today?date=2026-11-10', { as: fixture.a.userId });
    expect(rest.status).toBe(200);
    expect(rest.json).toMatchObject({ date: '2026-11-10', workout: { state: 'rest' }, meals: null, checkins: [], intakePending: false, unreadMessages: 0, subscription: { state: 'none' } });
    const training = await call(app, 'GET', '/api/v1/me/today?date=2026-11-09', { as: fixture.a.userId });
    expect(training.status).toBe(200); expect(training.json).toMatchObject({ workout: { state: 'planned', exerciseCount: 1 } });
    expect((await call(app, 'GET', '/api/v1/me/today?date=2026-02-30', { as: fixture.a.userId })).status).toBe(400);
  });
});
