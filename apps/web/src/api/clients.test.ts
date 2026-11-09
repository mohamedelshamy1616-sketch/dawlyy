import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { clientEntitlementOverrides, memberships, subscriptions } from '@dawlyy/db/schema';
import { ScheduleRules } from '@dawlyy/core/types';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';

const clientSchema = z.object({ id: z.string().uuid(), code: z.string(), firstName: z.string(), searchKey: z.string() });
const listSchema = z.object({ items: z.array(clientSchema), nextCursor: z.string().nullable() });

describe('Task 3 clients API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  async function create(firstName: string, extra: Record<string, unknown> = {}, as = fixture.owner.userId) {
    const response = await call(app, 'POST', '/api/v1/clients', { as, body: { firstName, ...extra } });
    expect(response.status).toBe(201);
    return clientSchema.parse(response.json);
  }

  it('creates sequential codes, searches Arabic, English, phone and code, and recomputes search after edits', async () => {
    const a = await create('أَحْمَد', { lastName: 'إبراهيم', displayName: 'Ahmed', phone: '01012345678', email: 'ahmed@example.com' });
    const b = await create('Mona');
    expect(a.code).toBe('DW-000001');
    expect(b.code).toBe('DW-000002');
    for (const q of ['احمد', 'ابراهيم', 'Ahmed', '01012345678', a.code, 'ahmed@example.com']) {
      const found = await call(app, 'GET', `/api/v1/clients?q=${encodeURIComponent(q)}`, { as: fixture.owner.userId });
      expect(found.status).toBe(200);
      expect(listSchema.parse(found.json).items.map(row => row.id)).toEqual([a.id]);
    }
    const duplicate = await call(app, 'POST', '/api/v1/clients', { as: fixture.owner.userId, body: { firstName: 'Other', phone: '01012345678' } });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json).toMatchObject({ error: { code: 'duplicate_client', details: { clientId: a.id } } });
    const changed = await call(app, 'PATCH', `/api/v1/clients/${a.id}`, { as: fixture.owner.userId, body: { firstName: 'عُمر', displayName: null } });
    expect(changed.status).toBe(200);
    expect(clientSchema.parse(changed.json).searchKey).toContain('عمر');
    expect(listSchema.parse((await call(app, 'GET', `/api/v1/clients?q=${encodeURIComponent('احمد')}`, { as: fixture.owner.userId })).json).items).toHaveLength(0);
    const firstPage = listSchema.parse((await call(app, 'GET', '/api/v1/clients?limit=1', { as: fixture.owner.userId })).json);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = listSchema.parse((await call(app, 'GET', `/api/v1/clients?limit=1&cursor=${firstPage.nextCursor}`, { as: fixture.owner.userId })).json);
    expect(new Set([...firstPage.items, ...secondPage.items].map(row => row.id)).size).toBe(2);
    expect((await create('Third')).code).toBe('DW-000003');
  });

  it('isolates tenants and starts their codes independently', async () => {
    const a = await create('Private');
    const other = await setupApiFixture();
    try {
      expect((await create('Other', {}, other.owner.userId)).code).toBe('DW-000001');
      expect((await call(app, 'GET', `/api/v1/clients/${a.id}`, { as: other.owner.userId })).status).toBe(404);
    } finally { await other.cleanup(); }
  });

  it('replays a client creation without inserting another client or consuming another code', async () => {
    const options = { as: fixture.owner.userId, headers: { 'Idempotency-Key': randomUUID() }, body: { firstName: 'Once' } };
    const first = await call(app, 'POST', '/api/v1/clients', options);
    const replay = await call(app, 'POST', '/api/v1/clients', options);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.json).toEqual(first.json);
    expect((await create('Next')).code).toBe('DW-000002');
  });

  it('filters tags and status, rejects duplicate emails, and archives without deleting history', async () => {
    const client = await create('Tagged', { email: 'TAGGED@example.com', tags: ['vip'], locale: 'en', notes: 'Coach only' });
    const other = await create('Other');
    const duplicate = await call(app, 'POST', '/api/v1/clients', { as: fixture.owner.userId, body: { firstName: 'Duplicate', email: 'tagged@example.com' } });
    expect(duplicate.status).toBe(409);
    expect(listSchema.parse((await call(app, 'GET', '/api/v1/clients?tag=vip&status=lead', { as: fixture.owner.userId })).json).items.map(row => row.id)).toEqual([client.id]);
    expect((await call(app, 'PATCH', `/api/v1/clients/${client.id}`, { as: fixture.owner.userId, body: { firstName: 'Edited' } })).json)
      .toMatchObject({ locale: 'en', tags: ['vip'], notes: 'Coach only' });
    expect((await call(app, 'POST', `/api/v1/clients/${client.id}/archive`, { as: fixture.owner.userId })).json).toMatchObject({ status: 'archived' });
    expect((await call(app, 'GET', `/api/v1/clients/${client.id}`, { as: fixture.owner.userId })).json).toMatchObject({ id: client.id, notes: 'Coach only' });
    expect((await call(app, 'POST', `/api/v1/clients/${client.id}/unarchive`, { as: fixture.owner.userId })).json).toMatchObject({ status: 'inactive', archivedAt: null });
    expect((await call(app, 'GET', `/api/v1/clients/${other.id}`, { as: fixture.owner.userId })).status).toBe(200);
    expect((await call(app, 'PATCH', `/api/v1/clients/${client.id}`, { as: fixture.owner.userId, body: { code: 'DW-999999' } })).status).toBe(400);
    expect((await call(app, 'GET', '/api/v1/clients?cursor=bad', { as: fixture.owner.userId })).status).toBe(400);
  });

  it('assigns a staff creator before readback and hides unassigned clients; client role gets 403', async () => {
    const hidden = await create('Hidden');
    const staff = randomUUID();
    const clientUser = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'staff and client memberships', async tx => {
      await tx.insert(memberships).values([
        { tenantId: fixture.owner.tenantId, userId: staff, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { clients: ['view', 'create', 'edit'] } } },
        { tenantId: fixture.owner.tenantId, userId: clientUser, role: 'client', status: 'active', clientId: hidden.id },
      ]);
    });
    const own = await create('Staff client', {}, staff);
    expect((await call(app, 'GET', `/api/v1/clients/${own.id}`, { as: staff })).status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/clients/${hidden.id}`, { as: staff })).status).toBe(404);
    expect(listSchema.parse((await call(app, 'GET', '/api/v1/clients', { as: staff })).json).items.map(row => row.id)).toEqual([own.id]);
    expect((await call(app, 'GET', '/api/v1/clients', { as: clientUser })).status).toBe(403);
    expect((await call(app, 'PUT', `/api/v1/clients/${own.id}/overrides/chat`, { as: staff, body: { enabled: false } })).status).toBe(403);
  });

  it('overrides only client A and resets by revocation without changing the package or client B', async () => {
    const a = await create('A');
    const b = await create('B');
    const packageResponse = await call(app, 'POST', '/api/v1/packages', { as: fixture.owner.userId,
      body: { name: { en: 'Plan' }, durationDays: 28, priceAmount: 500, entitlements: [{ key: 'chat', enabled: true, limit: 1 }] } });
    expect(packageResponse.status).toBe(201);
    const pkg = z.object({ id: z.string(), name: z.object({ en: z.string() }) }).parse(packageResponse.json);
    await setupApiData(fixture.owner.tenantId, 'subscription snapshots for overrides', async tx => {
      for (const client of [a, b]) await tx.insert(subscriptions).values({ tenantId: fixture.owner.tenantId, clientId: client.id, packageId: pkg.id,
        startsOn: '2026-11-01', endsOn: '2026-11-29', state: 'active', price: 500,
        packageSnapshot: { name: pkg.name, durationDays: 28, price: 500, currency: 'EGP', entitlements: [{ key: 'chat', enabled: true, limit: 1 }], scheduleRules: ScheduleRules.parse({}) } });
    });
    expect((await call(app, 'PUT', `/api/v1/clients/${a.id}/overrides/chat`, { as: fixture.owner.userId, body: { enabled: true, limit: 3 } })).status).toBe(200);
    const read = async (id: string) => (await call(app, 'GET', `/api/v1/clients/${id}/overrides`, { as: fixture.owner.userId })).json;
    expect(await read(a.id)).toMatchObject({ resolved: [{ key: 'chat', limit: 3, source: 'override' }] });
    expect(await read(b.id)).toMatchObject({ resolved: [{ key: 'chat', limit: 1, source: 'package' }] });
    expect((await call(app, 'GET', `/api/v1/packages/${pkg.id}`, { as: fixture.owner.userId })).json).toMatchObject({ entitlements: [{ key: 'chat', limit: 1 }] });
    expect(listSchema.parse((await call(app, 'GET', `/api/v1/clients?packageId=${pkg.id}`, { as: fixture.owner.userId })).json).items.map(row => row.id).sort()).toEqual([a.id, b.id].sort());
    expect((await call(app, 'PATCH', `/api/v1/packages/${pkg.id}`, { as: fixture.owner.userId, body: { entitlements: [{ key: 'chat', enabled: true, limit: 10 }] } })).status).toBe(200);
    expect(await read(b.id)).toMatchObject({ resolved: [{ key: 'chat', limit: 1, source: 'package' }] });
    expect((await call(app, 'DELETE', `/api/v1/clients/${a.id}/overrides/chat`, { as: fixture.owner.userId })).status).toBe(200);
    expect(await read(a.id)).toMatchObject({ resolved: [{ key: 'chat', limit: 1, source: 'package' }] });
    const stored = await setupApiData(fixture.owner.tenantId, 'confirm subscription preserved', tx => tx.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.tenantId, fixture.owner.tenantId), eq(subscriptions.clientId, a.id))));
    expect(stored).toHaveLength(1);
    const history = await setupApiData(fixture.owner.tenantId, 'confirm override revocation retained', tx => tx.select({ revokedAt: clientEntitlementOverrides.revokedAt }).from(clientEntitlementOverrides)
      .where(and(eq(clientEntitlementOverrides.tenantId, fixture.owner.tenantId), eq(clientEntitlementOverrides.clientId, a.id))));
    expect(history).toHaveLength(1);
    expect(history[0]?.revokedAt).toBeInstanceOf(Date);
  });
});
