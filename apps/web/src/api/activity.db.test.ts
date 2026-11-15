import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { memberships, staffClientAssignments, mealLogs } from '@dawlyy/db/schema';
import type { StaffPermissions } from '@dawlyy/core/authz';
import { call, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { activityPageSchema } from '../server/activity/schemas';
import { app } from './index';

// P9 only: apply the r3b API mount first. api-harness mocks identity alone, retaining real membership/RLS/guards.
describe('R3b activity API with authenticated PostgreSQL scope', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { f = await trackingFixture(); });
  afterEach(async () => { await f?.cleanup(); });
  async function staff(scope: 'all' | 'assigned', modules: StaffPermissions['modules'] = { clients: ['view'] }) {
    const userId = randomUUID(), membershipId = randomUUID();
    await setupApiData(f.owner.tenantId, 'activity staff fixture', async tx => {
      await tx.insert(memberships).values({ id: membershipId, tenantId: f.owner.tenantId, userId, role: 'staff', status: 'active',
        displayName: 'Activity reviewer', permissions: { client_scope: scope, modules } });
      if (scope === 'assigned') await tx.insert(staffClientAssignments).values({ tenantId: f.owner.tenantId, membershipId, clientId: f.a.clientId });
    });
    return userId;
  }
  async function audit(clientId: string | null, entity = 'clients', entityId: string | null = clientId,
    createdAt = '2090-01-01T12:00:00.123456Z', explicitId?: string) {
    return setupApiData(f.owner.tenantId, 'activity metadata corpus', async tx => {
      const values = sql`${f.owner.tenantId}::uuid,${clientId}::uuid,${f.owner.userId}::uuid,'owner','update',${entity},${entityId},
        '{"secret":"before-medical-text"}'::jsonb,'{"secret":"after-payment-detail","href":"https://untrusted.test"}'::jsonb,
        'private-reason',${randomUUID()},${createdAt}::timestamptz`;
      const result = explicitId
        ? await tx.execute<{ id: string }>(sql`insert into audit_log (id,tenant_id,client_id,actor_user_id,actor_role,action,entity,entity_id,before,after,reason,request_id,created_at)
            overriding system value values (${explicitId}::bigint,${values}) returning id::text`)
        : await tx.execute<{ id: string }>(sql`insert into audit_log (tenant_id,client_id,actor_user_id,actor_role,action,entity,entity_id,before,after,reason,request_id,created_at)
            values (${values}) returning id::text`);
      if (!result[0]) throw new Error('Missing seeded audit row');
      return result[0].id;
    });
  }
  async function activity(as = f.owner.userId, query = '') {
    const result = await call(app, 'GET', `/api/v1/activity${query}`, { as });
    expect(result.status).toBe(200);
    // Inspect wire keys before parsing: a stripping schema must not conceal a projection leak.
    const raw = result.json as { items: Array<Record<string, unknown>> };
    for (const row of raw.items) {
      expect(Object.keys(row).sort()).toEqual(['action', 'actor', 'clientId', 'createdAt', 'entity', 'entityId', 'href', 'id', 'version']);
      expect(Object.keys(row.actor as object).sort()).toEqual(['displayName', 'role', 'userId']);
    }
    return activityPageSchema.parse(result.json);
  }
  it('rejects unauthenticated, client and missing clients/view identities', async () => {
    expect((await call(app, 'GET', '/api/v1/activity')).status).toBe(401);
    expect((await call(app, 'GET', '/api/v1/activity', { as: f.a.userId })).status).toBe(403);
    expect((await call(app, 'GET', '/api/v1/activity', { as: await staff('all', {}) })).status).toBe(403);
  });
  it('owner sees tenant rows; assigned and all-client staff retain null-client RLS refusal', async () => {
    const a = await audit(f.a.clientId), b = await audit(f.b.clientId), tenant = await audit(null);
    const assigned = await staff('assigned'), all = await staff('all');
    expect((await activity()).items.map(row => row.id)).toEqual(expect.arrayContaining([a, b, tenant]));
    const assignedRows = (await activity(assigned)).items;
    expect(assignedRows.map(row => row.id)).toContain(a); expect(assignedRows.map(row => row.id)).not.toContain(b);
    expect(assignedRows.every(row => row.clientId === f.a.clientId)).toBe(true);
    const allRows = (await activity(all)).items;
    expect(allRows.map(row => row.id)).toEqual(expect.arrayContaining([a, b]));
    expect(allRows.every(row => row.clientId !== null)).toBe(true);
  });
  it('returns 404 for inaccessible, missing and foreign clients; visible empty history is 200', async () => {
    const assigned = await staff('assigned');
    for (const id of [f.b.clientId, randomUUID()]) expect((await call(app, 'GET', `/api/v1/activity?clientId=${id}`, { as: assigned })).status).toBe(404);
    const foreign = await trackingFixture();
    try {
      expect((await call(app, 'GET', `/api/v1/activity?clientId=${foreign.a.clientId}`, { as: f.owner.userId })).status).toBe(404);
      expect(await activity(f.owner.userId, `?clientId=${f.a.clientId}&entity=red_flags`)).toEqual({ items: [], nextCursor: null });
    } finally { await foreign.cleanup(); }
  });
  it('keeps archived-client history readable without a subscription and orders real archive/restore actions', async () => {
    expect((await call(app, 'POST', `/api/v1/clients/${f.a.clientId}/archive`, { as: f.owner.userId })).status).toBe(200);
    expect((await activity(f.owner.userId, `?clientId=${f.a.clientId}&entity=clients`)).items.some(row => row.action === 'archive')).toBe(true);
    expect((await call(app, 'POST', `/api/v1/clients/${f.a.clientId}/unarchive`, { as: f.owner.userId })).status).toBe(200);
    const history = (await activity(f.owner.userId, `?clientId=${f.a.clientId}&entity=clients`)).items;
    const restored = history.findIndex(row => row.action === 'restore'), archived = history.findIndex(row => row.action === 'archive');
    expect(restored).toBeGreaterThanOrEqual(0); expect(archived).toBeGreaterThan(restored);
    expect(history[restored]).toMatchObject({ actor: { userId: f.owner.userId, role: 'owner' }, href: `/coach/clients/${f.a.clientId}` });
  });
  it('projects actual correction metadata without meal text, payloads, reasons or request IDs', async () => {
    const id = randomUUID();
    await setupApiData(f.owner.tenantId, 'meal correction source', async tx => {
      await tx.insert(mealLogs).values({ id, tenantId: f.owner.tenantId, clientId: f.a.clientId, localDate: '2026-11-15',
        clientUuid: randomUUID(), status: 'eaten', freeEntry: { text: 'private-original-meal' } });
    });
    const result = await call(app, 'POST', `/api/v1/meal-logs/${id}/correct`, { as: f.a.userId,
      body: { clientUuid: randomUUID(), localDate: '2026-11-15', status: 'eaten', freeEntry: { text: 'private-corrected-meal' }, clientUpdatedAt: new Date().toISOString() } });
    expect(result.status).toBe(201);
    const seeded = await audit(f.a.clientId, 'meal_logs', id);
    const page = await activity(f.owner.userId, `?clientId=${f.a.clientId}&entity=meal_logs`);
    expect(page.items.some(row => row.action === 'correct')).toBe(true); expect(page.items.map(row => row.id)).toContain(seeded);
    for (const secret of ['private-original-meal', 'private-corrected-meal', 'before-medical-text', 'after-payment-detail', 'private-reason', 'untrusted.test']) expect(JSON.stringify(page)).not.toContain(secret);
  });
  it('filters source permissions before pagination and excludes unknown producers', async () => {
    const actor = await staff('assigned'), meal = await audit(f.a.clientId, 'meal_logs', randomUUID());
    const unknown = await audit(f.a.clientId, 'future_unregistered_entity', randomUUID()), visible = await audit(f.a.clientId);
    const page = await activity(actor, '?limit=1'); expect(page.items.map(row => row.id)).toEqual([visible]);
    expect(page.items.map(row => row.id)).not.toContain(meal); expect(page.items.map(row => row.id)).not.toContain(unknown);
    expect((await activity(actor, '?entity=meal_logs')).items).toEqual([]);
  });
  it('honors form kind permissions independently and requires AI view plus checkins review', async () => {
    const intakeId = randomUUID(), checkinId = randomUUID();
    await setupApiData(f.owner.tenantId, 'activity form discriminator corpus', async tx => {
      await tx.execute(sql`insert into forms (id,tenant_id,client_id,kind,name,form_kind) values
        (${intakeId}::uuid,${f.owner.tenantId}::uuid,${f.a.clientId}::uuid,'client','{"en":"Intake"}'::jsonb,'intake'),
        (${checkinId}::uuid,${f.owner.tenantId}::uuid,${f.a.clientId}::uuid,'client','{"en":"Weekly"}'::jsonb,'checkin')`);
    });
    const intake = await audit(f.a.clientId, 'forms', intakeId), checkin = await audit(f.a.clientId, 'forms', checkinId);
    const ai = await audit(f.a.clientId, 'ai_drafts', randomUUID());
    const intakeStaff = await staff('assigned', { clients: ['view'], forms: ['view'] });
    const intakeRows = (await activity(intakeStaff, '?entity=forms')).items.map(row => row.id);
    expect(intakeRows).toContain(intake); expect(intakeRows).not.toContain(checkin);
    const checkinStaff = await staff('assigned', { clients: ['view'], checkins: ['view'] });
    const checkinRows = (await activity(checkinStaff, '?entity=forms')).items.map(row => row.id);
    expect(checkinRows).toContain(checkin); expect(checkinRows).not.toContain(intake);
    const aiViewOnly = await staff('assigned', { clients: ['view'], ai: ['view'] });
    expect((await activity(aiViewOnly, '?entity=ai_drafts')).items).toEqual([]);
    const aiReview = await staff('assigned', { clients: ['view'], ai: ['view'], checkins: ['review'] });
    expect((await activity(aiReview, '?entity=ai_drafts')).items.map(row => row.id)).toContain(ai);
  });
  it('sets private no-store and uses a fallback for an actor with no visible active profile', async () => {
    const id = await setupApiData(f.owner.tenantId, 'activity deleted actor metadata', async tx => {
      const rows = await tx.execute<{id:string}>(sql`insert into audit_log
        (tenant_id,client_id,actor_user_id,actor_role,action,entity,entity_id,created_at)
        values (${f.owner.tenantId}::uuid,${f.a.clientId}::uuid,${randomUUID()}::uuid,'staff','update','clients',${f.a.clientId},'2090-01-01T12:00:00.123456Z'::timestamptz) returning id::text`);
      if (!rows[0]) throw new Error('Missing actor fixture'); return rows[0].id;
    });
    const response = await app.request(new Request('http://localhost/api/v1/activity', { headers: { authorization: `Bearer ${f.owner.userId}` } }));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
    const page = activityPageSchema.parse(await response.json());
    expect(page.items.find(row => row.id === id)?.actor).toMatchObject({ displayName: null, role: 'staff' });
  });
  it('orders equal microsecond timestamps by decimal bigint IDs and ignores newer inserts between pages', async () => {
    const base = BigInt('9007199254740993') + BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 9)}`) * BigInt(10);
    const ids = [base.toString(), (base + BigInt(1)).toString(), (base + BigInt(2)).toString()];
    for (const id of ids) await audit(f.a.clientId, 'clients', f.a.clientId, '2090-01-01T12:00:00.123456Z', id);
    const query = `?clientId=${f.a.clientId}&entity=clients&limit=1`, first = await activity(f.owner.userId, query);
    expect(first.items[0]?.id).toBe(ids[2]); expect(first.items[0]?.createdAt).toBe('2090-01-01T12:00:00.123456Z'); expect(first.nextCursor).not.toBeNull();
    await audit(f.a.clientId, 'clients', f.a.clientId, '2090-01-01T12:00:00.123457Z');
    const second = await activity(f.owner.userId, `${query}&cursor=${encodeURIComponent(first.nextCursor!)}`);
    expect(second.items[0]?.id).toBe(ids[1]); expect(second.nextCursor).not.toBeNull();
    const third = await activity(f.owner.userId, `${query}&cursor=${encodeURIComponent(second.nextCursor!)}`);
    expect(third.items[0]?.id).toBe(ids[0]); expect(new Set([...first.items, ...second.items, ...third.items].map(row => row.id)).size).toBe(3);
    expect((await call(app, 'GET', `/api/v1/activity?clientId=${f.b.clientId}&entity=clients&limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`, { as: f.owner.userId })).status).toBe(400);
  });
  it('validates strict keys, entities, UUIDs, cursors and both integer limit boundaries', async () => {
    for (const query of ['?unexpected=x', '?entity=unknown', '?clientId=nope', '?cursor=nope', '?limit=0', '?limit=101', '?limit=1.5', '?limit=-1', '?limit=1&limit=2']) expect((await call(app, 'GET', `/api/v1/activity${query}`, { as: f.owner.userId })).status).toBe(400);
    for (const limit of [1, 100]) expect((await call(app, 'GET', `/api/v1/activity?limit=${limit}`, { as: f.owner.userId })).status).toBe(200);
  });
});
