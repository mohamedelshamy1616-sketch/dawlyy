import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call, setupApiFixture } from '../test/api-harness';
import { app } from './index';

const resultSchema = z.object({ id: z.string().uuid(), name: z.object({ en: z.string().optional(), ar: z.string().optional() }),
  price: z.number(), archivedAt: z.string().nullable(), entitlements: z.array(z.unknown()) });

describe('Task 3 packages API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });

  it('creates, duplicates, edits and archives flat packages without changing the original', async () => {
    const created = await call(app, 'POST', '/api/v1/packages', { as: fixture.owner.userId,
      body: { name: { en: 'Monthly', ar: 'شهري' }, priceAmount: 500, durationDays: 28, entitlements: [{ key: 'chat', enabled: true }] } });
    expect(created.status).toBe(201);
    const original = resultSchema.parse(created.json);
    const duplicate = await call(app, 'POST', `/api/v1/packages/${original.id}/duplicate`, { as: fixture.owner.userId });
    expect(duplicate.status).toBe(201);
    const copy = resultSchema.parse(duplicate.json);
    expect(copy.id).not.toBe(original.id);
    expect(copy.entitlements).toEqual(original.entitlements);
    expect((await call(app, 'PATCH', `/api/v1/packages/${copy.id}`, { as: fixture.owner.userId, body: { priceAmount: 700 } })).status).toBe(200);
    expect(resultSchema.parse((await call(app, 'GET', `/api/v1/packages/${original.id}`, { as: fixture.owner.userId })).json).price).toBe(500);
    expect((await call(app, 'POST', `/api/v1/packages/${copy.id}/archive`, { as: fixture.owner.userId })).status).toBe(200);
    const active = z.object({ items: z.array(resultSchema) }).parse((await call(app, 'GET', '/api/v1/packages', { as: fixture.owner.userId })).json);
    expect(active.items.map(row => row.id)).toEqual([original.id]);
    const all = z.object({ items: z.array(resultSchema) }).parse((await call(app, 'GET', '/api/v1/packages?archived=1', { as: fixture.owner.userId })).json);
    expect(all.items.map(row => row.id)).toEqual([original.id, copy.id]);
  });

  it.each([
    { entitlements: [{ key: 'invented', enabled: true }] }, { entitlements: [{ key: 'chat', enabled: true, limit: -1 }] },
    { entitlements: [{ key: 'custom', enabled: true }] }, { entitlements: [{ key: 'chat', enabled: true }, { key: 'chat', enabled: false }] },
  ])('rejects invalid or ambiguous entitlements with 400', async ({ entitlements }) => {
    const response = await call(app, 'POST', '/api/v1/packages', { as: fixture.owner.userId,
      body: { name: { en: 'Invalid' }, priceAmount: 100, durationDays: 28, entitlements } });
    expect(response.status).toBe(400);
  });
});
