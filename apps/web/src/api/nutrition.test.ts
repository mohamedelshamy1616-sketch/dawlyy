import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { addMacros, itemMacros } from '@dawlyy/core/nutrition';
import { foods, nutritionPlans, nutritionPlanVersions, clients, memberships, mealLogs } from '@dawlyy/db/schema';
import { withAuthTx, type AuthContext } from '../server/db';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { draftDocumentSchema } from '../server/nutrition/schemas';
import { mapNutritionError } from '../server/nutrition/errors';
import { app } from './index';

const detail = z.object({ head: z.object({ id: z.string(), publishedVersionId: z.string().nullable() }), currentVersion: z.object({ id: z.string(), versionNo: z.number(), status: z.string(), document: draftDocumentSchema }), revision: z.string() });
const macros = z.object({ kcal: z.number(), proteinG: z.number(), carbsG: z.number(), fatG: z.number() });
describe('Task 6 nutrition versions and isolation', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  async function create() {
    const response = await call(app, 'POST', '/api/v1/nutrition', { as: fixture.owner.userId, body: { name: { en: 'Regional diet' } } });
    expect(response.status).toBe(201); return detail.parse(response.json);
  }
  async function save(id: string, document: z.infer<typeof draftDocumentSchema>, baseVersionNo = 1) {
    return call(app, 'PUT', `/api/v1/nutrition/${id}/draft`, { as: fixture.owner.userId, body: { document, baseVersionNo } });
  }
  async function ready() {
    const plan = await create();
    const [food] = await withAuthTx(fixture.owner, tx => tx.select({ id: foods.id }).from(foods).limit(1));
    if (!food) throw new Error('Load food seed before nutrition API tests');
    plan.currentVersion.document.meals = [{ id: 'lunch', name: { en: 'Lunch' }, options: [{ id: 'first', items: [{ id: 'rice', foodId: food.id, quantity: 100, measure: { kind: 'g' }, approx: false }] }] }];
    expect((await save(plan.head.id, plan.currentVersion.document)).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/nutrition/${plan.head.id}/publish`, { as: fixture.owner.userId, body: {} })).status).toBe(200);
    return plan;
  }
  it('creates v1 and rejects stale numbers and same-version revision tokens', async () => {
    const plan = await create(); expect(plan.currentVersion).toMatchObject({ versionNo: 1, status: 'draft' });
    expect((await save(plan.head.id, plan.currentVersion.document, 9)).status).toBe(409);
    const changed = { ...plan.currentVersion.document, instructions: { en: 'First edit' } };
    expect((await save(plan.head.id, changed)).status).toBe(200);
    const stale = await call(app, 'PUT', `/api/v1/nutrition/${plan.head.id}/draft`, { as: fixture.owner.userId, body: { document: changed, baseVersionNo: 1, baseRevision: plan.revision } });
    expect(stale).toMatchObject({ status: 409, json: { error: { code: 'stale_draft' } } });
  });
  it('supersedes before publishing and never changes frozen content', async () => {
    const plan = await ready(); const id = plan.head.id;
    expect((await save(id, { ...plan.currentVersion.document, instructions: { en: 'Second version' } })).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/nutrition/${id}/publish`, { as: fixture.owner.userId, body: {} })).status).toBe(200);
    const versions = await withAuthTx(fixture.owner, tx => tx.select({ id: nutritionPlanVersions.id, status: nutritionPlanVersions.status, versionNo: nutritionPlanVersions.versionNo }).from(nutritionPlanVersions).where(eq(nutritionPlanVersions.planId, id)));
    expect(versions).toEqual(expect.arrayContaining([expect.objectContaining({ versionNo: 1, status: 'superseded' }), expect.objectContaining({ versionNo: 2, status: 'published' })]));
    const [head] = await withAuthTx(fixture.owner, tx => tx.select({ pointer: nutritionPlans.publishedVersionId }).from(nutritionPlans).where(eq(nutritionPlans.id, id)));
    expect(head?.pointer).toBe(versions.find(v => v.versionNo === 2)?.id);
    const refusal = await call(app, 'PUT', `/api/v1/nutrition/${id}/versions/1`, { as: fixture.owner.userId, body: { document: plan.currentVersion.document } });
    expect(refusal).toMatchObject({ status: 409, json: { error: { code: 'version_immutable' } } });
    const dbRefusal = await withAuthTx(fixture.owner, tx => tx.update(nutritionPlanVersions).set({ document: { ...plan.currentVersion.document, instructions: { en: 'tamper' } } }).where(and(eq(nutritionPlanVersions.planId, id), eq(nutritionPlanVersions.versionNo, 1)))).then(() => null, mapNutritionError);
    expect(dbRefusal).toMatchObject({ status: 409, code: 'version_immutable' });
    expect((await call(app, 'POST', `/api/v1/nutrition/${id}/publish`, { as: fixture.owner.userId, body: {} })).status).toBe(422);
  });
  it('copies independently and protects other clients and coach routes', async () => {
    const plan = await ready();
    const people = await setupApiData(fixture.owner.tenantId, 'nutrition clients', async tx => {
      const result: Array<{ id: string; userId: string }> = [];
      for (const firstName of ['A', 'B']) {
        const [client] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName }).returning({ id: clients.id });
        if (!client) throw new Error('Missing client'); const userId = randomUUID();
        await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: client.id }); result.push({ ...client, userId });
      } return result;
    });
    const a = people[0]!; const b = people[1]!;
    async function assign(clientId: string) { const r = await call(app, 'POST', `/api/v1/nutrition/${plan.head.id}/assign`, { as: fixture.owner.userId, body: { clientId, publish: true } }); expect(r.status).toBe(201); return detail.parse(r.json); }
    const ca = await assign(a.id); const cb = await assign(b.id);
    expect((await save(ca.head.id, { ...ca.currentVersion.document, instructions: { en: 'A only' } })).status).toBe(200);
    for (const p of [plan, cb]) { const r = await call(app, 'GET', `/api/v1/nutrition/${p.head.id}`, { as: fixture.owner.userId }); expect(detail.parse(r.json).currentVersion.document.instructions).toEqual(p.currentVersion.document.instructions); }
    expect((await call(app, 'GET', `/api/v1/nutrition/${cb.head.id}`, { as: a.userId })).status).toBe(403);
    const own = await call(app, 'GET', '/api/v1/nutrition/me', { as: a.userId }); expect(own.status).toBe(200);
    expect(z.object({ head: z.object({ id: z.string() }) }).parse(own.json).head.id).toBe(ca.head.id);
    expect((await call(app, 'GET', `/api/v1/meal-logs?date=2026-11-10&clientId=${b.id}`, { as: a.userId })).status).toBe(403);
  });
  it('rejects unknown food references on publication', async () => {
    const p = await ready(); p.currentVersion.document.meals[0]!.options[0]!.items[0]!.foodId = randomUUID();
    expect((await save(p.head.id, p.currentVersion.document)).status).toBe(200);
    expect(await call(app, 'POST', `/api/v1/nutrition/${p.head.id}/publish`, { as: fixture.owner.userId, body: {} })).toMatchObject({ status: 422, json: { error: { code: 'plan_invalid' } } });
  });
  type Person = { id: string; userId: string; auth: AuthContext };
  async function makeClients(count: number): Promise<Person[]> {
    return setupApiData(fixture.owner.tenantId, 'nutrition clients', async tx => {
      const result: Person[] = [];
      for (let i = 0; i < count; i++) {
        const [client] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: `Client ${i}` }).returning({ id: clients.id }); if (!client) throw new Error('Missing client');
        const userId = randomUUID(); const membershipId = randomUUID();
        await tx.insert(memberships).values({ id: membershipId, tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: client.id });
        result.push({ id: client.id, userId, auth: { userId, tenantId: fixture.owner.tenantId, membershipId, role: 'client', permissions: null, clientId: client.id } });
      } return result;
    });
  }
  async function assignTo(planId: string, clientId: string) {
    const r = await call(app, 'POST', `/api/v1/nutrition/${planId}/assign`, { as: fixture.owner.userId, body: { clientId, publish: true } }); expect(r.status).toBe(201); return detail.parse(r.json);
  }
  const logBody = (extra: Record<string, unknown>) => ({ clientUuid: randomUUID(), localDate: '2026-11-10', clientUpdatedAt: new Date().toISOString(), ...extra });
  it('keeps client plans and meal logs private in the database and refuses coach routes to clients', async () => {
    const plan = await ready(); const people = await makeClients(2); const a = people[0]!; const b = people[1]!;
    const ca = await assignTo(plan.head.id, a.id); const cb = await assignTo(plan.head.id, b.id);
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as: b.userId, body: logBody({ status: 'eaten', freeEntry: { text: 'B lunch' } }) })).status).toBe(200);
    const seen = await withAuthTx(a.auth, async tx => ({
      plans: await tx.select({ id: nutritionPlans.id }).from(nutritionPlans), versions: await tx.select({ planId: nutritionPlanVersions.planId }).from(nutritionPlanVersions), logs: await tx.select({ id: mealLogs.id }).from(mealLogs),
    }));
    expect(seen.plans.map(p => p.id)).toEqual([ca.head.id]); expect(seen.plans.some(p => p.id === cb.head.id)).toBe(false);
    expect(seen.versions.every(v => v.planId === ca.head.id)).toBe(true); expect(seen.logs).toEqual([]);
    const coachRoutes: Array<[string, string, unknown?]> = [['GET', '/api/v1/foods'], ['POST', '/api/v1/foods', { name: { en: 'x' }, category: 'x', per100: { kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 } }], ['POST', '/api/v1/nutrition', { name: { en: 'x' } }], ['GET', '/api/v1/nutrition'], ['POST', '/api/v1/nutrition/reuse-check', { planId: plan.head.id, clientId: b.id }]];
    for (const [method, path, body] of coachRoutes) expect((await call(app, method, path, { as: a.userId, ...(body === undefined ? {} : { body }) })).status, `${method} ${path}`).toBe(403);
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as: fixture.owner.userId, body: logBody({ status: 'eaten', freeEntry: { text: 'coach cannot log for a client' } }) })).status).toBe(403);
  });
  it('filters the assignment client picker by name', async () => {
    const plan = await ready();
    await setupApiData(fixture.owner.tenantId, 'named clients', async tx => { for (const firstName of ['Alphonse', 'Bertrand']) await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName, searchKey: firstName.toLowerCase() }); });
    const names = async (q: string) => z.object({ items: z.array(z.object({ firstName: z.string() })) }).parse((await call(app, 'GET', `/api/v1/nutrition/${plan.head.id}/assignment-clients?q=${q}`, { as: fixture.owner.userId })).json).items.map(c => c.firstName);
    expect(await names('alph')).toEqual(['Alphonse']); expect((await names('')).sort()).toEqual(['Alphonse', 'Bertrand']);
  });
  it('G5: the stored and computed diet total equals the sum of the per-measure item totals', async () => {
    const plan = await create();
    const seed = await withAuthTx(fixture.owner, tx => tx.select().from(foods).where(isNull(foods.tenantId)));
    const household = (f: (typeof seed)[number]) => f.measures.find(m => m.measure.kind !== 'g' && m.measure.kind !== 'ml');
    const picks = seed.filter(f => f.per100.kcal > 0 && household(f)).slice(0, 4); expect(picks.length).toBe(4);
    const items = picks.map((f, i) => ({ id: `item-${i}`, foodId: f.id, quantity: i + 1.5, measure: household(f)!.measure, approx: false }));
    const document = { ...plan.currentVersion.document, meals: [{ id: 'm1', name: { en: 'Mixed' }, options: [{ id: 'o1', items }] }] };
    expect((await save(plan.head.id, document)).status).toBe(200);
    const read = await call(app, 'GET', `/api/v1/nutrition/${plan.head.id}`, { as: fixture.owner.userId });
    const parsed = z.object({ currentVersion: z.object({ document: draftDocumentSchema }), totals: z.object({ total: macros }) }).parse(read.json);
    const expected = addMacros(...items.map(item => { const f = picks.find(p => p.id === item.foodId)!; return itemMacros({ id: f.id, per100: f.per100, measures: f.measures }, item).macros; }));
    expect(parsed.totals.total).toEqual(expected);
    expect(parsed.currentVersion.document.meals[0]!.options[0]!.macros).toEqual(expected);
  });
  it('serves the client their plan and daily logs, and rejects unknown meals and supplements', async () => {
    const plan = await create(); const [food] = await withAuthTx(fixture.owner, tx => tx.select({ id: foods.id }).from(foods).where(isNull(foods.tenantId)).limit(1)); if (!food) throw new Error('Load food seed');
    const document = { ...plan.currentVersion.document, meals: [{ id: 'lunch', name: { en: 'Lunch' }, options: [{ id: 'first', items: [{ id: 'rice', foodId: food.id, quantity: 100, measure: { kind: 'g' as const }, approx: false }] }] }], supplements: [{ id: 'vit', name: { en: 'Vitamin D' }, dose: 1, unit: 'capsule', timing: 'with_meal' as const }] };
    expect((await save(plan.head.id, document)).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/nutrition/${plan.head.id}/publish`, { as: fixture.owner.userId, body: {} })).status).toBe(200);
    const client = (await makeClients(1))[0]!; await assignTo(plan.head.id, client.id); const as = client.userId;
    const me = z.object({ head: z.object({ id: z.string() }), dayType: z.string(), version: z.object({ document: draftDocumentSchema }), foods: z.array(z.object({ id: z.string() })) }).parse((await call(app, 'GET', '/api/v1/nutrition/me', { as })).json);
    expect(me.dayType).toBe('training'); expect(me.version.document.meals).toHaveLength(1); expect(me.foods.map(f => f.id)).toContain(food.id);
    const byIds = await call(app, 'GET', `/api/v1/foods/by-ids?ids=${food.id},${randomUUID()}`, { as });
    expect(z.object({ items: z.array(z.object({ id: z.string() })) }).parse(byIds.json).items.map(f => f.id)).toEqual([food.id]);
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as, body: logBody({ mealId: 'lunch', optionId: 'first', status: 'eaten' }) })).status).toBe(200);
    expect(await call(app, 'POST', '/api/v1/meal-logs', { as, body: logBody({ mealId: 'nope', status: 'eaten' }) })).toMatchObject({ status: 422, json: { error: { code: 'meal_unknown' } } });
    expect((await call(app, 'POST', '/api/v1/meal-logs/supplements', { as, body: logBody({ supplementId: 'vit', taken: true }) })).status).toBe(200);
    expect(await call(app, 'POST', '/api/v1/meal-logs/supplements', { as, body: logBody({ supplementId: 'nope', taken: true }) })).toMatchObject({ status: 422, json: { error: { code: 'supplement_unknown' } } });
    expect((await call(app, 'POST', '/api/v1/meal-logs/water', { as, body: { clientUuid: randomUUID(), localDate: '2026-11-10', amountMl: 500 } })).status).toBe(200);
    const day = z.object({ items: z.array(z.object({ mealId: z.string().nullable() })), supplements: z.array(z.object({ taken: z.boolean() })), waterMl: z.number() });
    for (const [who, path] of [[as, '/api/v1/meal-logs?date=2026-11-10'], [fixture.owner.userId, `/api/v1/meal-logs?date=2026-11-10&clientId=${client.id}`]] as const) {
      const r = await call(app, 'GET', path, { as: who }); expect(r.status).toBe(200);
      const parsed = day.parse(r.json); expect(parsed.items.map(i => i.mealId)).toEqual(['lunch']); expect(parsed.supplements).toEqual([{ taken: true }]); expect(parsed.waterMl).toBe(500);
    }
  });
});
