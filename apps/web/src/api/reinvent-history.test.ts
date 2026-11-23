import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { calendarEvents, clients, exercises, mealLogs, measurementSets, memberships, metricEntries, setLogs, workoutSessions } from '@dawlyy/db/schema';
import { localDateOf } from '@dawlyy/core/schedule';
import { call, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { app } from './index';

const date = '2026-11-13';
const rowId = (json: unknown) => z.object({ id: z.string() }).parse(json).id;
const tables = [['meal_logs', 'meal-logs'], ['measurement_sets', 'measurements'], ['metric_entries', 'metrics'], ['workout_sessions', 'workout-sessions']] as const;
type Table = typeof tables[number][0];

describe('R0c history-preserving void and correct routes', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { f = await trackingFixture(); });
  afterEach(async () => { await f?.cleanup(); });

  async function seed(table: Table, clientId = f.a.clientId, old = false) {
    const id = randomUUID(); const tenantId = f.owner.tenantId;
    await setupApiData(tenantId, 'history entry with server creation time', async tx => {
      const createdAt = old ? new Date(Date.now() - 8 * 86400000) : new Date();
      const common = { id, tenantId, clientId, localDate: date, clientUuid: randomUUID(), createdAt };
      if (table === 'meal_logs') await tx.insert(mealLogs).values({ ...common, freeEntry: { text: 'Lunch' }, status: 'eaten' });
      if (table === 'measurement_sets') await tx.insert(measurementSets).values({ ...common, values: [{ type: 'waist', value: 80, unit: 'cm' }] });
      if (table === 'metric_entries') await tx.insert(metricEntries).values({ ...common, metric: 'water', value: 300, unit: 'ml', recordedAt: new Date(), timezone: 'Africa/Cairo' });
      if (table === 'workout_sessions') await tx.insert(workoutSessions).values({ ...common, state: 'completed', timezone: 'Africa/Cairo' });
    });
    return id;
  }
  async function inspect(table: Table, id: string) {
    return setupApiData(f.owner.tenantId, 'inspect void transaction', tx => tx.execute<{ id: string; voided_at: Date | string | null }>(sql`select id,voided_at from ${sql.identifier(table)} where tenant_id = ${f.owner.tenantId} and id = ${id}`))
      // postgres-js returns timestamptz as text through execute (LESSONS 2026-11-12); compare as Date.
      .then(rows => rows.map(row => ({ ...row, voided_at: row.voided_at === null ? null : new Date(row.voided_at) })));
  }
  for (const [table, route] of tables) {
    it(`${table}: own void, scope/window refusal, double void and visible history`, async () => {
      const own = await seed(table), other = await seed(table, f.b.clientId), old = await seed(table, f.a.clientId, true);
      for (const id of [other, old]) {
        const denied = await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.a.userId, body: {} });
        expect(denied.status).toBe(403); expect(denied.json).toMatchObject({ error: { code: 'void_not_allowed' } });
        expect((await inspect(table, id))[0]?.voided_at).toBeNull();
      }
      const response = await call(app, 'POST', `/api/v1/${route}/${own}/void`, { as: f.a.userId, body: { reason: 'Duplicate' } });
      expect(response.status).toBe(200); expect(response.json).toMatchObject({ id: own, voidedAt: expect.any(String) });
      const again = await call(app, 'POST', `/api/v1/${route}/${own}/void`, { as: f.a.userId, body: {} });
      expect(again.status).toBe(409); expect(again.json).toMatchObject({ error: { code: 'already_voided' } });
      const history = await call(app, 'GET', `/api/v1/${route}${table === 'meal_logs' ? `?date=${date}` : ''}`, { as: f.a.userId });
      expect(history.status).toBe(200); expect(history.json).toMatchObject({ activeCount: 1, items: expect.arrayContaining([expect.objectContaining({ id: own, voidedAt: expect.any(String) })]) });
      expect((await call(app, 'POST', `/api/v1/${route}/${old}/void`, { as: f.owner.userId, body: {} })).status).toBe(200);
      expect((await call(app, 'GET', `/api/v1/${route}${table === 'meal_logs' ? `?date=${date}` : ''}`, { as: f.a.userId })).json).toMatchObject({ activeCount: 0 });
    });
    it(`${table}: staff edit is required and explanations are bounded`, async () => {
      const id = await seed(table); const staff = randomUUID();
      await setupApiData(f.owner.tenantId, 'void staff without grant', tx => tx.execute(sql`insert into memberships
        (tenant_id,user_id,role,status,permissions) values (${f.owner.tenantId},${staff},'staff','active','{"client_scope":"all","modules":{}}')`));
      const denied = await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: staff, body: {} });
      expect(denied.status).toBe(403); expect(denied.json).toMatchObject({ error: { code: 'void_not_allowed' } });
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.a.userId, body: { reason: 'x'.repeat(501) } })).status).toBe(400);
      const key = randomUUID();
      const first = await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.a.userId, body: {}, headers: { 'Idempotency-Key': key } });
      expect(first.status).toBe(200);
      expect(await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.a.userId, body: {}, headers: { 'Idempotency-Key': key } })).toEqual(first);
    });
  }

  function correction(table: 'meal_logs' | 'measurement_sets') {
    return table === 'meal_logs' ? { clientUuid: randomUUID(), localDate: date, status: 'eaten', freeEntry: { text: 'Correct lunch' }, clientUpdatedAt: new Date().toISOString() }
      : { clientUuid: randomUUID(), localDate: date, values: [{ type: 'waist', value: 82, unit: 'cm' }], clientUpdatedAt: new Date().toISOString() };
  }
  for (const [table, route] of [['meal_logs', 'meal-logs'], ['measurement_sets', 'measurements']] as const) {
    it(`${table}: ordinary POST preserves existing facts before and after seven days and after void`, async () => {
      const body = correction(table), status = table === 'meal_logs' ? 200 : 201;
      const created = await call(app, 'POST', `/api/v1/${route}`, { as: f.a.userId, body });
      expect(created.status).toBe(status);
      const id = rowId(created.json);
      const snapshot = () => setupApiData(f.owner.tenantId, 'snapshot immutable sync row', tx =>
        tx.execute(sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where id = ${id}`));
      const changed = table === 'meal_logs'
        ? { ...body, localDate: '2026-11-14', status: 'skipped', freeEntry: { text: 'Changed lunch' }, note: 'Changed note', clientUpdatedAt: '2099-01-01T00:00:00Z' }
        : { ...body, localDate: '2026-11-14', values: [{ type: 'waist', value: 99, unit: 'cm' }], clientUpdatedAt: '2099-01-01T00:00:00Z' };
      const before = await snapshot();
      for (const payload of [body, changed]) {
        const retry = await call(app, 'POST', `/api/v1/${route}`, { as: f.a.userId, body: payload });
        expect(retry).toEqual(created);
        expect(await snapshot()).toEqual(before);
      }
      await setupApiData(f.owner.tenantId, 'age the server creation timestamp', tx =>
        tx.execute(sql`update ${sql.identifier(table)} set created_at = now() - interval '8 days' where id = ${id}`));
      const aged = await snapshot();
      expect((await call(app, 'POST', `/api/v1/${route}`, { as: f.a.userId, body: changed })).json).toMatchObject({ id });
      expect(await snapshot()).toEqual(aged);
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/correct`, { as: f.a.userId, body: correction(table) })).status).toBe(403);
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.owner.userId, body: {} })).status).toBe(200);
      const voided = await snapshot();
      const retry = await call(app, 'POST', `/api/v1/${route}`, { as: f.a.userId, body: changed });
      expect(retry.status).toBe(status);
      expect(retry.json).toMatchObject({ id, voidedAt: expect.any(String) });
      expect(await snapshot()).toEqual(voided);
    });

    it(`${table}: correction INSERT voids original atomically; repeated and old corrections refuse`, async () => {
      const id = await seed(table); const key = randomUUID(); const body = correction(table);
      const result = await call(app, 'POST', `/api/v1/${route}/${id}/correct`, { as: f.a.userId, body, headers: { 'Idempotency-Key': key } });
      expect(result.status).toBe(201); expect(result.json).toMatchObject({ replacesId: id, voidedAt: null });
      expect(rowId(result.json)).not.toBe(id); expect((await inspect(table, id))[0]?.voided_at).toBeInstanceOf(Date);
      expect(await call(app, 'POST', `/api/v1/${route}/${id}/correct`, { as: f.a.userId, body, headers: { 'Idempotency-Key': key } })).toEqual(result);
      const again = await call(app, 'POST', `/api/v1/${route}/${id}/correct`, { as: f.a.userId, body: correction(table) });
      expect(again.status).toBe(409); expect(again.json).toMatchObject({ error: { code: 'already_corrected' } });
      for (const target of [await seed(table, f.b.clientId), await seed(table, f.a.clientId, true)]) {
        const response = await call(app, 'POST', `/api/v1/${route}/${target}/correct`, { as: f.a.userId, body: correction(table) });
        expect(response.status).toBe(403); expect(response.json).toMatchObject({ error: { code: 'void_not_allowed' } });
        expect((await inspect(table, target))[0]?.voided_at).toBeNull();
      }
      const history = await call(app, 'GET', `/api/v1/${route}${table === 'meal_logs' ? `?date=${date}` : ''}`, { as: f.a.userId });
      expect(history.json).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id, voidedAt: expect.any(String) }), expect.objectContaining({ replacesId: id })]) });
      expect((await call(app, 'POST', `/api/v1/${route}/${await seed(table)}/correct`, { as: f.owner.userId, body: correction(table) })).status).toBe(201);
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/correct`, { as: f.a.userId, body: { ...correction(table), replacesId: id } })).status).toBe(400);
    });
  }
  it('water total excludes voids while scalar history retains them', async () => {
    const id = await seed('metric_entries');
    expect((await call(app, 'GET', `/api/v1/meal-logs?date=${date}`, { as: f.a.userId })).json).toMatchObject({ waterMl: 300 });
    expect((await call(app, 'POST', `/api/v1/metrics/${id}/void`, { as: f.a.userId, body: {} })).status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/meal-logs?date=${date}`, { as: f.a.userId })).json).toMatchObject({ waterMl: 0, water: [expect.objectContaining({ id, voidedAt: expect.any(String) })] });
  });
  it('voided sessions leave attached sets intact and disappear from exercise totals', async () => {
    const id = await seed('workout_sessions'), exerciseId = randomUUID(), setId = randomUUID();
    await setupApiData(f.owner.tenantId, 'workout exercise totals', async tx => {
      await tx.insert(exercises).values({ id: exerciseId, tenantId: f.owner.tenantId, name: { en: 'Squat' }, slug: exerciseId, category: 'strength', movementPattern: 'squat', difficulty: 'beginner' });
      await tx.insert(setLogs).values({ id: setId, tenantId: f.owner.tenantId, clientId: f.a.clientId, sessionId: id, exerciseId,
        clientUuid: randomUUID(), clientUpdatedAt: new Date(), setNo: 1, reps: 10, load: 20, loadUnit: 'kg', completed: true });
    });
    const historyPath = `/api/v1/workout-sessions/exercise-history/${exerciseId}`;
    const before = await call(app, 'GET', historyPath, { as: f.a.userId });
    expect(before.status).toBe(200);
    expect(before.json).toEqual([expect.objectContaining({ sessionId: id, totals: expect.objectContaining({ volume: 200 }) })]);
    const savedSets = await setupApiData(f.owner.tenantId, 'sets before void', tx => tx.select().from(setLogs).where(eq(setLogs.id, setId)));
    expect((await call(app, 'POST', `/api/v1/workout-sessions/${id}/void`, { as: f.a.userId, body: {} })).status).toBe(200);
    expect((await call(app, 'GET', historyPath, { as: f.a.userId })).json).toEqual([]);
    expect((await call(app, 'GET', `/api/v1/workout-sessions/${id}`, { as: f.a.userId })).json).toMatchObject({ session: { id, voidedAt: expect.any(String) }, sets: [expect.objectContaining({ id: setId })] });
    expect(await setupApiData(f.owner.tenantId, 'sets after void', tx => tx.select().from(setLogs).where(eq(setLogs.id, setId)))).toEqual(savedSets);
  });
  it('dashboard missing-data and adherence counts exclude voided entries; the timeline retains them', async () => {
    const tenantId = f.owner.tenantId;
    const weight = await seed('metric_entries'), previous = await seed('workout_sessions'), current = await seed('workout_sessions');
    await setupApiData(tenantId, 'dashboard active history', async tx => {
      await tx.update(clients).set({ status: 'active' }).where(eq(clients.id, f.a.clientId));
      await tx.update(metricEntries).set({ metric: 'weight', value: 80, unit: 'kg' }).where(eq(metricEntries.id, weight));
      await tx.update(workoutSessions).set({ localDate: localDateOf(new Date(Date.now() - 8 * 86400000).toISOString(), 'Africa/Cairo') }).where(eq(workoutSessions.id, previous));
      await tx.update(workoutSessions).set({ state: 'skipped', localDate: localDateOf(new Date().toISOString(), 'Africa/Cairo') }).where(eq(workoutSessions.id, current));
    });
    const summary = () => call(app, 'GET', '/api/v1/dashboard/summary', { as: f.owner.userId });
    expect((await summary()).json).toMatchObject({ counts: { missing_data: { count: 0 }, adherence_decline: { count: 1 } } });
    for (const [route, id] of [['metrics', weight], ['workout-sessions', previous]] as const) {
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/void`, { as: f.a.userId, body: {} })).status).toBe(200);
    }
    const after = await summary();
    expect(after.status).toBe(200);
    expect(after.json).toMatchObject({ counts: { missing_data: { count: 1 }, adherence_decline: { count: 0 } } });
    const timeline = await call(app, 'GET', `/api/v1/dashboard/timeline/${f.a.clientId}`, { as: f.owner.userId });
    expect(timeline.status).toBe(200);
    expect(timeline.json).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ id: `metric:${weight}`, summary: expect.objectContaining({ voidedAt: expect.any(String) }) }),
      expect.objectContaining({ id: `session:${previous}`, summary: expect.objectContaining({ voidedAt: expect.any(String) }) }),
    ]) });
  });
  it('measurement deltas skip voided predecessors', async () => {
    const older = await seed('measurement_sets');
    await setupApiData(f.owner.tenantId, 'earlier measurements', tx => tx.update(measurementSets).set({ localDate: '2026-11-12' }).where(eq(measurementSets.id, older)));
    const newer = await seed('measurement_sets');
    expect((await call(app, 'POST', `/api/v1/measurements/${older}/void`, { as: f.a.userId, body: {} })).status).toBe(200);
    const response = await call(app, 'GET', '/api/v1/measurements', { as: f.a.userId });
    expect(response.json).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id: older, deltas: [] }), expect.objectContaining({ id: newer, deltas: [expect.objectContaining({ absolute: null, percent: null })] })]) });
  });
  it('replaying a voided metric UUID cannot satisfy a new tracking occurrence', async () => {
    const body = { clientUuid: randomUUID(), metric: 'weight', value: 80, unit: 'kg', recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo' };
    const created = await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body });
    expect(created.status).toBe(201);
    const id = rowId(created.json);
    expect((await call(app, 'POST', `/api/v1/metrics/${id}/void`, { as: f.a.userId, body: {} })).status).toBe(200);
    const localDate = z.object({ localDate: z.string() }).parse(created.json).localDate;
    const eventId = randomUUID();
    await setupApiData(f.owner.tenantId, 'tracking occurrence after metric void', tx => tx.insert(calendarEvents).values({
      id: eventId, tenantId: f.owner.tenantId, clientId: f.a.clientId, type: 'weigh_in', state: 'scheduled',
      dueAt: new Date(), localDate, timezone: 'Africa/Cairo', source: 'manual',
    }));
    const replay = await call(app, 'POST', '/api/v1/metrics', { as: f.a.userId, body });
    expect(replay.status).toBe(201);
    expect(replay.json).toMatchObject({ id, voidedAt: expect.any(String) });
    const [event] = await setupApiData(f.owner.tenantId, 'inspect untouched occurrence', tx => tx.select({ state: calendarEvents.state }).from(calendarEvents).where(eq(calendarEvents.id, eventId)));
    expect(event?.state).toBe('scheduled');
  });
  it('calendar cancel returns attribution; staff restore clears both stamps', async () => {
    const created = await call(app, 'POST', '/api/v1/calendar', { as: f.owner.userId, body: { clientId: f.a.clientId, type: 'weigh_in', dueAt: '2026-11-14T07:00:00Z', timezone: 'Africa/Cairo' } });
    expect(created.status).toBe(201); const id = rowId(created.json);
    const cancelled = await call(app, 'POST', `/api/v1/calendar/${id}/cancel`, { as: f.owner.userId });
    expect(cancelled.status).toBe(200); expect(cancelled.json).toMatchObject({ state: 'cancelled', cancelledBy: f.owner.userId, cancelledAt: expect.any(String) });
    const restored = await call(app, 'POST', `/api/v1/calendar/${id}/restore`, { as: f.owner.userId });
    expect(restored.status).toBe(200); expect(restored.json).toMatchObject({ state: 'scheduled', cancelledBy: null, cancelledAt: null });
    expect((await call(app, 'POST', `/api/v1/calendar/${id}/restore`, { as: f.a.userId })).status).toBe(403);
  });

  it('calendar restore requires calendar edit and attributes the staff cancellation', async () => {
    const editor = randomUUID(), viewer = randomUUID();
    await setupApiData(f.owner.tenantId, 'calendar restore staff permissions', tx => tx.insert(memberships).values([
      { tenantId: f.owner.tenantId, userId: editor, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { calendar: ['edit'] } } },
      { tenantId: f.owner.tenantId, userId: viewer, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { calendar: ['view'] } } },
    ]));
    const created = await call(app, 'POST', '/api/v1/calendar', { as: f.owner.userId, body: {
      clientId: f.a.clientId, type: 'weigh_in', dueAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'Africa/Cairo',
    } });
    expect(created.status).toBe(201);
    const id = rowId(created.json);
    const cancelled = await call(app, 'POST', `/api/v1/calendar/${id}/cancel`, { as: editor });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json).toMatchObject({ cancelledBy: editor, cancelledAt: expect.any(String) });
    expect((await call(app, 'POST', `/api/v1/calendar/${id}/restore`, { as: viewer })).status).toBe(403);
    const restored = await call(app, 'POST', `/api/v1/calendar/${id}/restore`, { as: editor });
    expect(restored.status).toBe(200);
    expect(restored.json).toMatchObject({ state: 'scheduled', cancelledAt: null, cancelledBy: null });
  });
});
