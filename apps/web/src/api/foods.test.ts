import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { foods } from '@dawlyy/db/schema';
import { isNull } from 'drizzle-orm';
import { equivalentQuantity } from '@dawlyy/core/nutrition';
import { withAuthTx } from '../server/db';
import { call, setupApiFixture } from '../test/api-harness';
import { app } from './index';

describe('Task 6 food library and G5', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); }); afterEach(async () => { await fixture?.cleanup(); });
  it('loads 300 bilingual foods with household measures and keeps system rows immutable', async () => {
    const seed = await withAuthTx(fixture.owner, tx => tx.select({ id: foods.id, name: foods.name, measures: foods.measures, per100: foods.per100 }).from(foods).where(isNull(foods.tenantId)));
    expect(seed.length).toBeGreaterThanOrEqual(300); for (const f of seed) { expect(f.name.ar?.trim()).toBeTruthy(); expect(f.measures.length).toBeGreaterThan(0); }
    const id = seed[0]!.id; const as = fixture.owner.userId;
    expect((await call(app, 'PATCH', `/api/v1/foods/${id}`, { as, body: { name: { en: 'tampered' } } })).status).toBe(403);
    const cloned = await call(app, 'POST', `/api/v1/foods/${id}/clone`, { as }); expect(cloned.status).toBe(201);
    const copy = z.object({ id: z.string() }).parse(cloned.json);
    expect((await call(app, 'PATCH', `/api/v1/foods/${copy.id}`, { as, body: { name: { en: 'My food' } } })).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/foods/${id}/hide`, { as })).status).toBe(200);
    const hidden = await call(app, 'GET', '/api/v1/foods?limit=100', { as });
    expect(z.object({ items: z.array(z.object({ id: z.string() })) }).parse(hidden.json).items.some(f => f.id === id)).toBe(false);
    expect((await call(app, 'POST', `/api/v1/foods/${id}/unhide`, { as })).status).toBe(200);
    // The first seed row is water (0 kcal): a zero-macro target is refused by core, which is correct. Substitute between caloric foods.
    const caloric = seed.filter(f => f.per100.kcal > 0 && f.per100.proteinG > 0); const from = caloric[0]!; const to = caloric[1]!;
    const same = await call(app, 'POST', '/api/v1/nutrition/substitute', { as, body: { foodId: from.id, toFoodId: from.id, grams: 125, rule: 'kcal' } });
    expect(same.status).toBe(200); expect(z.object({ grams: z.number(), withinTolerance: z.boolean() }).parse(same.json)).toMatchObject({ grams: 125, withinTolerance: true });
    const swapped = await call(app, 'POST', '/api/v1/nutrition/substitute', { as, body: { foodId: from.id, toFoodId: to.id, grams: 125, rule: 'kcal' } });
    expect(swapped.status).toBe(200);
    const expected = equivalentQuantity({ id: from.id, per100: from.per100, measures: from.measures }, { id: to.id, per100: to.per100, measures: to.measures }, 125, 'kcal');
    expect(z.object({ grams: z.number(), withinTolerance: z.boolean() }).parse(swapped.json)).toMatchObject({ grams: expected.grams, withinTolerance: expected.withinTolerance });
    expect((await call(app, 'POST', '/api/v1/nutrition/substitute', { as, body: { foodId: from.id, toFoodId: seed[0]!.id, grams: 125, rule: 'kcal' } })).status).toBe(422);
  });
  it('searches Arabic-folded names and creates tenant foods with the coach source', async () => {
    const as = fixture.owner.userId; const list = z.object({ items: z.array(z.object({ id: z.string(), source: z.string(), isSystem: z.boolean() })), nextCursor: z.string().nullable() });
    const seed = await withAuthTx(fixture.owner, tx => tx.select({ id: foods.id, name: foods.name }).from(foods).where(isNull(foods.tenantId)));
    const target = seed.find(f => f.name.ar?.includes('ا'))!;
    // Hamza and alef variants fold to the same key, so a differently-spelled query still finds the food.
    const found = list.parse((await call(app, 'GET', `/api/v1/foods?limit=100&q=${encodeURIComponent(target.name.ar!.replace(/ا/g, 'أ'))}`, { as })).json);
    expect(found.items.some(f => f.id === target.id)).toBe(true);
    const created = await call(app, 'POST', '/api/v1/foods', { as, body: { name: { ar: 'فول بالزيت الحار', en: 'Spicy ful' }, category: 'legumes', per100: { kcal: 120, proteinG: 8, carbsG: 14, fatG: 4 }, measures: [{ measure: { kind: 'cup' }, grams: 240 }] } });
    expect(created.status).toBe(201); expect(z.object({ source: z.string(), isSystem: z.boolean() }).parse(created.json)).toEqual({ source: 'coach', isSystem: false });
    expect(list.parse((await call(app, 'GET', '/api/v1/foods?limit=100&q=spicy%20ful', { as })).json).items).toHaveLength(1);
    expect((await call(app, 'POST', '/api/v1/foods', { as, body: { name: { en: 'x' }, category: 'x', per100: { kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }, source: 'db' } })).status).toBe(400);
  });
});
