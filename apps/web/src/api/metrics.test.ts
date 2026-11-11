import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call } from '../test/api-harness';
import { app } from './index';
import { trackingFixture } from '../server/tracking/test-fixture';

const rows = z.object({ items: z.array(z.object({ id: z.string(), value: z.number() })), nextCursor: z.string().nullable() });
describe('Task 8 scalar metrics and cadence', () => {
  let fixture: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { fixture = await trackingFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  const entry = () => ({ metric: 'weight', value: 80, unit: 'kg', recordedAt: '2026-11-08T07:00:00Z', timezone: 'Africa/Cairo', clientUuid: randomUUID() });
  it('dedupes scalar UUIDs without rewriting entries and rejects conflicting retries', async () => {
    const input = entry();
    const first = await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: input });
    const retry = await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: input });
    expect(first.status).toBe(201); expect(retry.status).toBe(201); expect(retry.json).toEqual(first.json);
    expect((await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: { ...input, value: 90 } })).status).toBe(409);
    expect(rows.parse((await call(app, 'GET', '/api/v1/metrics', { as: fixture.a.userId })).json).items).toHaveLength(1);
  });
  it('cannot read or write another client in the same tenant', async () => {
    expect((await call(app, 'POST', '/api/v1/metrics', { as: fixture.b.userId, body: entry() })).status).toBe(201);
    expect((await call(app, 'GET', `/api/v1/metrics?clientId=${fixture.b.clientId}`, { as: fixture.a.userId })).status).toBe(403);
    expect(rows.parse((await call(app, 'GET', '/api/v1/metrics', { as: fixture.a.userId })).json).items).toHaveLength(0);
    expect((await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: { ...entry(), clientId: fixture.b.clientId } })).status).toBe(403);
  });
  it('materializes only weekly weigh-ins, and logging completes the matching occurrence', async () => {
    const body = { startsOn: '2026-11-01', endsOn: '2026-11-29', timezone: 'Africa/Cairo', metrics: [{ metric: 'weight', unit: 'kg', cadence: { kind: 'weekly', day: 0 } }] };
    const path = `/api/v1/metrics/cadence/${fixture.a.clientId}`;
    expect((await call(app, 'PUT', path, { as: fixture.a.userId, body })).status).toBe(403);
    expect((await call(app, 'PUT', path, { as: fixture.owner.userId, body })).status).toBe(200);
    const read = await call(app, 'GET', path, { as: fixture.a.userId }); expect(read.status).toBe(200);
    const result = await call(app, 'GET', '/api/v1/calendar/mine', { as: fixture.a.userId });
    const events = z.object({ items: z.array(z.object({ id: z.string(), type: z.string(), localDate: z.string(), state: z.string() })) }).parse(result.json).items;
    expect(events.map(event => event.localDate)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
    expect(events.every(event => event.type === 'weigh_in')).toBe(true);
    expect(JSON.stringify(result.json)).not.toContain('payload');
    expect((await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: entry() })).status).toBe(201);
    const after = await call(app, 'GET', '/api/v1/calendar/mine', { as: fixture.a.userId });
    expect(z.object({ items: z.array(z.object({ localDate: z.string(), state: z.string() })) }).parse(after.json).items.find(event => event.localDate === '2026-11-08')?.state).toBe('completed');
  });
  it('paginates equal timestamps without repeating or omitting rows', async () => {
    for (let n = 0; n < 3; n++) expect((await call(app, 'POST', '/api/v1/metrics', { as: fixture.a.userId, body: { ...entry(), value: 80 + n } })).status).toBe(201);
    const first = rows.parse((await call(app, 'GET', '/api/v1/metrics?limit=2', { as: fixture.a.userId })).json);
    const second = rows.parse((await call(app, 'GET', `/api/v1/metrics?limit=2&cursor=${first.nextCursor}`, { as: fixture.a.userId })).json);
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(3); expect(second.nextCursor).toBeNull();
  });
});
