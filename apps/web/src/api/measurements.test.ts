import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call } from '../test/api-harness';
import { app } from './index';
import { trackingFixture } from '../server/tracking/test-fixture';

describe('Task 8 measurements', () => {
  let fixture: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { fixture = await trackingFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  const input = () => ({ localDate: '2026-11-01', clientUuid: randomUUID(), clientUpdatedAt: '2026-11-01T10:00:00Z', values: [{ type: 'waist', value: 80, unit: 'cm' }] });
  it('isolates client B and calculates a delta against the previous set', async () => {
    const older = input();
    expect((await call(app, 'POST', '/api/v1/measurements', { as: fixture.b.userId, body: older })).status).toBe(201);
    expect((await call(app, 'GET', `/api/v1/measurements?clientId=${fixture.b.clientId}`, { as: fixture.a.userId })).status).toBe(403);
    expect(z.object({ items: z.array(z.unknown()) }).parse((await call(app, 'GET', '/api/v1/measurements', { as: fixture.a.userId })).json).items).toHaveLength(0);
    expect((await call(app, 'POST', '/api/v1/measurements', { as: fixture.b.userId, body: { ...input(), localDate: '2026-11-08', values: [{ type: 'waist', value: 78, unit: 'cm' }] } })).status).toBe(201);
    const result = await call(app, 'GET', '/api/v1/measurements', { as: fixture.b.userId });
    expect(z.object({ items: z.array(z.object({ deltas: z.array(z.object({ absolute: z.number().nullable() })) })) }).parse(result.json).items[0]?.deltas[0]?.absolute).toBe(-2);
  });
  it('ignores stale sync timestamps and accepts only strictly newer corrections', async () => {
    const body = input();
    expect((await call(app, 'POST', '/api/v1/measurements', { as: fixture.a.userId, body })).status).toBe(201);
    const stale = await call(app, 'POST', '/api/v1/measurements', { as: fixture.a.userId, body: { ...body, values: [{ type: 'waist', value: 99, unit: 'cm' }] } });
    expect(stale.status).toBe(201); expect(z.object({ values: z.array(z.object({ value: z.number() })) }).parse(stale.json).values[0]?.value).toBe(80);
    const newer = await call(app, 'POST', '/api/v1/measurements', { as: fixture.a.userId, body: { ...body, clientUpdatedAt: '2026-11-01T11:00:00Z', values: [{ type: 'waist', value: 79, unit: 'cm' }] } });
    expect(newer.status).toBe(201); expect(z.object({ values: z.array(z.object({ value: z.number() })) }).parse(newer.json).values[0]?.value).toBe(79);
  });
});
