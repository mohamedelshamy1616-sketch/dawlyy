import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { withAuthTx, type Tx } from '@dawlyy/db';
import { ScheduleRules } from '@dawlyy/core/types';
import { packages, subscriptions, workoutSessions, nutritionPlans, nutritionPlanVersions, supplementLogs } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { getAuthContext } from '../server/auth';
import { workoutFixture } from '../server/workout/test-fixture';
import { startSession, syncWorkout } from '../server/workout/write';
import { myNutrition } from '../server/nutrition/client';
import { nutritionHistoryContext } from '../server/nutrition/history';
import { draftDocumentSchema } from '../server/nutrition/schemas';
import { app } from './index';

const states = ['pending', 'active', 'grace', 'expired', 'suspended', 'absent', 'cancelled'] as const;
type State = typeof states[number];
const routes = ['start', 'sync', 'nutrition', 'history'] as const;

describe('N1 live access through the real API and shared page services', () => {
  let f: Awaited<ReturnType<typeof workoutFixture>>;
  let subscriptionId: string;
  let historyId: string;
  beforeEach(async () => {
    f = await workoutFixture();
    subscriptionId = randomUUID(); historyId = randomUUID();
    await setupApiData(f.owner.tenantId, 'N1 subscription and retained history', async tx => {
      const [pkg] = await tx.insert(packages).values({ tenantId: f.owner.tenantId, name: { en: 'Access' }, durationDays: 30,
        scheduleRules: ScheduleRules.parse({}) }).returning();
      await tx.insert(subscriptions).values({ id: subscriptionId, tenantId: f.owner.tenantId, clientId: f.a.clientId,
        packageId: pkg!.id, packageSnapshot: { name: pkg!.name, entitlements: pkg!.entitlements, scheduleRules: pkg!.scheduleRules,
          durationDays: pkg!.durationDays, price: pkg!.price, currency: pkg!.currency }, state: 'active', startsOn: '2000-01-01', endsOn: '2099-01-01' });
      await tx.insert(workoutSessions).values({ id: historyId, tenantId: f.owner.tenantId, clientId: f.a.clientId,
        clientUuid: randomUUID(), localDate: '2020-01-01', timezone: 'Africa/Cairo', state: 'completed' });
    });
  });
  afterEach(async () => { await f?.cleanup(); });

  const body = () => ({ clientUuid: randomUUID(), programId: f.a.programId, programVersionId: f.a.versionId,
    dayId: f.dayId, workoutId: f.workoutId, localDate: '2026-11-12', timezone: 'Africa/Cairo' });
  async function state(value: State) {
    await setupApiData(f.owner.tenantId, 'N1 choose subscription state', async tx => {
      if (value === 'absent') {
        // Keep the membership active while removing every subscription from the access decision.
        await tx.execute(sql`delete from subscriptions where id = ${subscriptionId}::uuid`);
      } else await tx.update(subscriptions).set({ state: value,
        endsOn: value === 'grace' ? '2000-01-02' : '2099-01-01', graceEndsOn: value === 'grace' ? '2099-01-02' : null,
      }).where(eq(subscriptions.id, subscriptionId));
    });
  }
  async function request(route: typeof routes[number], headers?: HeadersInit, input = body()) {
    if (route === 'start') return call(app, 'POST', '/api/v1/workout-sessions', { as: f.a.userId, body: input, headers });
    if (route === 'sync') return call(app, 'POST', '/api/v1/workout-sessions/sync', { as: f.a.userId, body: { sessions: [], sets: [] }, headers });
    if (route === 'nutrition') return call(app, 'GET', '/api/v1/nutrition/me', { as: f.a.userId });
    return call(app, 'GET', `/api/v1/workout-sessions/${historyId}`, { as: f.a.userId });
  }
  for (const value of states) for (const route of routes) it(`${value}: ${route}`, async () => {
    await state(value);
    const allowed = route === 'history' || value === 'active' || value === 'grace';
    const result = await request(route, { 'Idempotency-Key': randomUUID() });
    expect(result.status).toBe(allowed ? 200 : 403);
    if (!allowed) expect(result.json).toMatchObject({ error: { code: 'access_expired', details: { state: value === 'absent' ? null : value } } });
    if (route === 'history') expect(result.json).toMatchObject({ session: { id: historyId } });
  });
  for (const route of ['start', 'sync'] as const) it(`${route}: checks access before replaying a saved success`, async () => {
    const input = body(); const headers = { 'Idempotency-Key': randomUUID() };
    expect((await request(route, headers, input)).status).toBe(200);
    expect((await request(route, headers, input)).status).toBe(200);
    await state('expired');
    const replay = await request(route, headers, input);
    expect(replay.status).toBe(403);
    expect(replay.json).toMatchObject({ error: { code: 'access_expired' } });
  });
  for (const value of states) it(`${value}: shared services enforce the same decision without API middleware`, async () => {
    await state(value);
    const auth = await getAuthContext(new Headers({ authorization: `Bearer ${f.a.userId}` }));
    expect(auth).not.toBeNull();
    const services: Array<(tx: Tx) => Promise<unknown>> = [tx => startSession(tx, auth!, body()),
      tx => syncWorkout(tx, auth!, { sessions: [], sets: [] }), tx => myNutrition(tx, auth!)];
    for (const service of services) {
      const result = withAuthTx(auth!, service);
      if (value === 'active' || value === 'grace') await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toMatchObject({ status: 403, code: 'access_expired' });
    }
  });
  for (const value of ['expired', 'cancelled'] as const) it(`${value}: nutrition history keeps logged labels without returning a current plan`, async () => {
    await state(value);
    await setupApiData(f.owner.tenantId, 'N1 retained nutrition history', async tx => {
      const [plan] = await tx.insert(nutritionPlans).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, kind: 'client', name: { en: 'Historical plan' } }).returning({ id: nutritionPlans.id });
      const document = draftDocumentSchema.parse({ targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 }, meals: [],
        supplements: [{ id: 'past', name: { en: 'Historical supplement' }, dose: 1, unit: 'g', timing: 'custom' }], instructions: { en: 'Never expose current instructions through history' } });
      const [version] = await tx.insert(nutritionPlanVersions).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, planId: plan!.id,
        versionNo: 1, status: 'superseded', document, publishedAt: new Date('2020-01-01T00:00:00Z'),
        publishedBy: f.owner.userId, supersededAt: new Date('2020-02-01T00:00:00Z') }).returning({ id: nutritionPlanVersions.id });
      await tx.insert(supplementLogs).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, clientUuid: randomUUID(),
        planVersionId: version!.id, supplementId: 'past', localDate: '2020-01-01', taken: true, clientUpdatedAt: new Date() });
    });
    const auth = await getAuthContext(new Headers({ authorization: `Bearer ${f.a.userId}` }));
    const context = await withAuthTx(auth!, tx => nutritionHistoryContext(tx, auth!));
    expect(context.supplementNames).toEqual({ past: { en: 'Historical supplement' } });
    expect(Object.keys(context).sort()).toEqual(['localDate', 'mealNames', 'supplementNames']);
    const history = await call(app, 'GET', '/api/v1/meal-logs?date=2020-01-01', { as: f.a.userId });
    expect(history.status).toBe(200); expect(history.json).toMatchObject({ supplements: [{ supplementId: 'past', taken: true }] });
    expect((await request('nutrition')).status).toBe(403);
  });
});
