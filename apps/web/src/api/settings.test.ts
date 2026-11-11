import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clients, memberships } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';

const errorSchema = z.object({ error: z.object({ code: z.string() }) });
const businessSchema = z.object({
  name: z.string(), defaultLocale: z.string(), timezone: z.string(), currency: z.string(),
  settings: z.object({ units: z.object({ weight: z.string(), length: z.string() }), exerciseCategories: z.array(z.string()), brandColor: z.string().optional() }),
});
const consentSchema = z.object({ id: z.string(), kind: z.string(), version: z.string(), accepted: z.boolean(), acceptedAt: z.string(), withdrawnAt: z.string().nullable() });
const consentListSchema = z.object({ items: z.array(consentSchema), current: z.record(z.string(), z.object({ state: z.string() })) });
const pageSchema = z.object({ items: z.array(consentSchema.extend({ userId: z.string() })), nextCursor: z.string().nullable() });

describe('Task 11 settings API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  const owner = () => fixture.owner.userId;

  async function addStaff(modules: Record<string, string[]>) {
    const userId = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'settings staff fixture', async (tx) => {
      await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId, role: 'staff', status: 'active', displayName: 'Staff', permissions: { client_scope: 'all', modules } });
    });
    return userId;
  }
  async function addClient() {
    const userId = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'settings client fixture', async (tx) => {
      const [row] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'Client' }).returning({ id: clients.id });
      if (!row) throw new Error('client fixture');
      await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: row.id });
    });
    return userId;
  }

  it('refuses PUT /business to staff without the settings module, and to staff who have it (owner only)', async () => {
    const plain = await addStaff({ clients: ['view'] });
    const granted = await addStaff({ settings: ['view', 'edit'] });
    for (const as of [plain, granted]) {
      const response = await call(app, 'PUT', '/api/v1/settings/business', { as, body: { name: 'Hijacked' } });
      expect(response.status).toBe(403);
      expect(errorSchema.parse(response.json).error.code).toBe('forbidden');
    }
    expect(businessSchema.parse((await call(app, 'GET', '/api/v1/settings/business', { as: owner() })).json).name).toBe('API test tenant');
  });

  it('lets the owner update business settings; a client can read them but not write', async () => {
    const response = await call(app, 'PUT', '/api/v1/settings/business', { as: owner(), body: {
      name: 'Nour Coaching', defaultLocale: 'en', timezone: 'Asia/Riyadh', units: { weight: 'lb', length: 'in' },
      exerciseCategories: ['Strength', 'Strength', 'Mobility'], brandColor: '#0F766E',
    } });
    expect(response.status).toBe(200);
    const saved = businessSchema.parse(response.json);
    expect(saved).toMatchObject({ name: 'Nour Coaching', defaultLocale: 'en', timezone: 'Asia/Riyadh', currency: 'EGP' });
    expect(saved.settings).toMatchObject({ units: { weight: 'lb', length: 'in' }, exerciseCategories: ['Strength', 'Mobility'], brandColor: '#0f766e' });
    const client = await addClient();
    const read = await call(app, 'GET', '/api/v1/settings/business', { as: client });
    expect(read.status).toBe(200);
    expect(businessSchema.parse(read.json).name).toBe('Nour Coaching');
    expect((await call(app, 'PUT', '/api/v1/settings/business', { as: client, body: { name: 'Mine now' } })).status).toBe(403);
    expect(businessSchema.parse((await call(app, 'GET', '/api/v1/settings/business', { as: owner() })).json).name).toBe('Nour Coaching');
  });

  it('rejects invalid business input with 400 and an unknown logo with 422', async () => {
    for (const body of [{ timezone: 'Mars/Base' }, { brandColor: 'teal' }, { name: '' }, { currency: 'USD' }, { logoMediaId: 'nope' }]) {
      expect((await call(app, 'PUT', '/api/v1/settings/business', { as: owner(), body })).status).toBe(400);
    }
    const logo = await call(app, 'PUT', '/api/v1/settings/business', { as: owner(), body: { logoMediaId: randomUUID() } });
    expect(logo.status).toBe(422);
    expect(errorSchema.parse(logo.json).error.code).toBe('logo_not_found');
  });

  it('keeps preferences per user', async () => {
    const staff = await addStaff({ clients: ['view'] });
    const saved = await call(app, 'PUT', '/api/v1/settings/preferences', { as: staff, body: { locale: 'en', channels: { email: false } } });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ locale: 'en', channels: { email: false } });
    const merged = await call(app, 'PUT', '/api/v1/settings/preferences', { as: staff, body: { channels: { whatsapp: true } } });
    expect(merged.json).toMatchObject({ locale: 'en', channels: { email: false, whatsapp: true } });
    expect((await call(app, 'GET', '/api/v1/settings/preferences', { as: owner() })).json).toEqual({});
    expect((await call(app, 'PUT', '/api/v1/settings/preferences', { as: staff, body: { locale: 'fr' } })).status).toBe(400);
  });

  it('records a consent, then a withdrawal keeps both facts and the newest state is withdrawn', async () => {
    const client = await addClient();
    const body = { kind: 'photos', version: '2026-11-draft', locale: 'ar', accepted: true };
    const accepted = await call(app, 'POST', '/api/v1/settings/consents', { as: client, body, headers: { 'user-agent': 'vitest-agent', 'x-forwarded-for': '203.0.113.9' } });
    expect(accepted.status).toBe(201);
    const row = consentSchema.parse(accepted.json);
    expect(row).toMatchObject({ kind: 'photos', accepted: true, withdrawnAt: null });
    expect(JSON.stringify(accepted.json)).not.toMatch(/203\.0\.113\.9|vitest-agent|ip_?hash|userAgent/i);
    let list = consentListSchema.parse((await call(app, 'GET', '/api/v1/settings/consents', { as: client })).json);
    expect(list.current.photos?.state).toBe('accepted');

    const withdrawn = await call(app, 'POST', '/api/v1/settings/consents', { as: client, body: { ...body, accepted: false } });
    expect(withdrawn.status).toBe(200);
    expect(consentSchema.parse(withdrawn.json)).toMatchObject({ id: row.id, accepted: true, acceptedAt: row.acceptedAt });
    list = consentListSchema.parse((await call(app, 'GET', '/api/v1/settings/consents', { as: client })).json);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.withdrawnAt).not.toBeNull();
    expect(list.current.photos?.state).toBe('withdrawn');

    const again = await call(app, 'POST', '/api/v1/settings/consents', { as: client, body: { ...body, accepted: false } });
    expect(again.status).toBe(422);
    expect(errorSchema.parse(again.json).error.code).toBe('no_active_consent');
  });

  it('never lets the client set server-owned consent columns', async () => {
    const client = await addClient();
    for (const extra of [{ acceptedAt: '2020-01-01T00:00:00Z' }, { ipHash: 'x' }, { userAgent: 'x' }, { userId: randomUUID() }]) {
      const response = await call(app, 'POST', '/api/v1/settings/consents', { as: client, body: { kind: 'terms', version: 'v1', locale: 'en', accepted: true, ...extra } });
      expect(response.status).toBe(400);
    }
    expect(consentListSchema.parse((await call(app, 'GET', '/api/v1/settings/consents', { as: client })).json).items).toHaveLength(0);
  });

  it('shows a client only their own consents; the owner lists the tenant with keyset pages; others get 403', async () => {
    const first = await addClient();
    const second = await addClient();
    for (const [as, kind] of [[first, 'terms'], [first, 'privacy'], [second, 'photos']] as const) {
      expect((await call(app, 'POST', '/api/v1/settings/consents', { as, body: { kind, version: 'v1', locale: 'en', accepted: true } })).status).toBe(201);
    }
    expect(consentListSchema.parse((await call(app, 'GET', '/api/v1/settings/consents', { as: second })).json).items.map((r) => r.kind)).toEqual(['photos']);
    expect((await call(app, 'GET', '/api/v1/settings/consents/all', { as: first })).status).toBe(403);
    const staff = await addStaff({ clients: ['view'] });
    expect((await call(app, 'GET', '/api/v1/settings/consents/all', { as: staff })).status).toBe(403);
    const one = pageSchema.parse((await call(app, 'GET', '/api/v1/settings/consents/all?limit=2', { as: owner() })).json);
    expect(one.items).toHaveLength(2);
    expect(one.nextCursor).not.toBeNull();
    const two = pageSchema.parse((await call(app, 'GET', `/api/v1/settings/consents/all?limit=2&cursor=${one.nextCursor}`, { as: owner() })).json);
    expect(two.items).toHaveLength(1);
    expect(two.nextCursor).toBeNull();
    expect(new Set([...one.items, ...two.items].map((r) => r.id)).size).toBe(3);
    expect((await call(app, 'GET', '/api/v1/settings/consents/all?cursor=garbage', { as: owner() })).status).toBe(400);
  });

  it('requires a session', async () => {
    expect((await call(app, 'GET', '/api/v1/settings/business')).status).toBe(401);
  });
});
