import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { diffPermissions, permissionsFromPreset } from '@dawlyy/core/authz';
import { clients, invitations, memberships } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';

const errorSchema = z.object({ error: z.object({ code: z.string() }) });
const memberSchema = z.object({
  id: z.string(), role: z.string(), status: z.string(), preset: z.string().nullable(), clientScope: z.string().nullable(),
  modules: z.record(z.string(), z.array(z.string())), effective: z.array(z.object({ module: z.string(), actions: z.array(z.string()) })),
});
const listSchema = z.object({ items: z.array(memberSchema) });
const changeSchema = z.object({
  member: memberSchema, changes: z.array(z.object({ module: z.string(), added: z.array(z.string()), removed: z.array(z.string()) })),
});
const inviteSchema = z.object({ id: z.string(), role: z.literal('staff'), token: z.string(), link: z.string() });

describe('Task 11 team API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  const owner = () => fixture.owner.userId;
  const path = (suffix = '') => `/api/v1/team${suffix}`;

  async function addMember(role: 'staff' | 'owner', modules: Record<string, string[]> = {}) {
    const userId = randomUUID();
    const id = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'team fixture', async (tx) => {
      await tx.insert(memberships).values({
        id, tenantId: fixture.owner.tenantId, userId, role, status: 'active', displayName: `${role} ${id.slice(0, 4)}`,
        permissions: role === 'staff' ? { client_scope: 'all', modules } : null,
      });
    });
    return { userId, id };
  }
  async function addClient() {
    const userId = randomUUID();
    const id = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'team client fixture', async (tx) => {
      const [row] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'Client' }).returning({ id: clients.id });
      if (!row) throw new Error('client fixture');
      await tx.insert(memberships).values({ id, tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: row.id });
    });
    return { userId, id };
  }

  it('lists owners and staff with effective permissions; clients and staff without team:view are refused', async () => {
    const staff = await addMember('staff', { programs: ['manage'], billing: ['view'] });
    const client = await addClient();
    const response = await call(app, 'GET', path(), { as: owner() });
    expect(response.status).toBe(200);
    const { items } = listSchema.parse(response.json);
    expect(items.map((m) => m.role).sort()).toEqual(['owner', 'staff']);
    const row = items.find((m) => m.id === staff.id);
    expect(row?.effective).toEqual([{ module: 'billing', actions: ['view'] }, { module: 'programs', actions: ['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'] }]);
    expect(items.some((m) => m.id === client.id)).toBe(false);
    expect((await call(app, 'GET', path(), { as: client.userId })).status).toBe(403);
    expect((await call(app, 'GET', path(), { as: staff.userId })).status).toBe(403);
    const viewer = await addMember('staff', { team: ['view'] });
    expect((await call(app, 'GET', path(), { as: viewer.userId })).status).toBe(200);
    expect((await call(app, 'GET', path(`/${staff.id}`), { as: viewer.userId })).status).toBe(200);
    expect((await call(app, 'GET', path(`/${randomUUID()}`), { as: owner() })).status).toBe(404);
    expect((await call(app, 'GET', path(`/${client.id}`), { as: owner() })).status).toBe(404);
  });

  it('a module that is granted reaches its API and one that is not granted gets 403', async () => {
    const staff = await addMember('staff', { clients: ['view'] });
    expect((await call(app, 'GET', '/api/v1/packages', { as: staff.userId })).status).toBe(403);
    const grant = await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body: { client_scope: 'all', modules: { packages: ['view'] } } });
    expect(grant.status).toBe(200);
    expect((await call(app, 'GET', '/api/v1/packages', { as: staff.userId })).status).toBe(200);
    expect((await call(app, 'POST', '/api/v1/packages', { as: staff.userId, body: { name: { en: 'No' }, priceAmount: 1, durationDays: 7, entitlements: [] } })).status).toBe(403);
    const revoke = await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body: { client_scope: 'all', modules: { clients: ['view'] } } });
    expect(revoke.status).toBe(200);
    expect((await call(app, 'GET', '/api/v1/packages', { as: staff.userId })).status).toBe(403);
  });

  it('returns the diff of old against new permissions and stores the preset and scope', async () => {
    const staff = await addMember('staff', { checkins: ['view', 'edit'], billing: ['view'] });
    const response = await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body: {
      preset: 'business_manager', client_scope: 'assigned', modules: { checkins: ['view'] },
    } });
    expect(response.status).toBe(200);
    const result = changeSchema.parse(response.json);
    const expected = diffPermissions(
      { client_scope: 'all', modules: { checkins: ['view', 'edit'], billing: ['view'] } },
      permissionsFromPreset('business_manager', { client_scope: 'assigned', modules: { checkins: ['view'] } }),
    );
    expect(result.changes).toEqual(expected);
    expect(result.changes.find((c) => c.module === 'checkins')).toEqual({ module: 'checkins', added: [], removed: ['edit'] });
    expect(result.changes.find((c) => c.module === 'billing')?.added).toContain('manage');
    expect(result.member).toMatchObject({ preset: 'business_manager', clientScope: 'assigned' });
    expect(result.member.modules.checkins).toEqual(['view']);
    const [stored] = await setupApiData(fixture.owner.tenantId, 'read permissions', (tx) =>
      tx.select({ permissions: memberships.permissions }).from(memberships).where(eq(memberships.id, staff.id)));
    expect(stored?.permissions).toMatchObject({ client_scope: 'assigned', preset: 'business_manager', modules: { billing: ['manage'], checkins: ['view'] } });
  });

  it('rejects unknown modules, actions and presets with 422, and owner or client targets', async () => {
    const staff = await addMember('staff');
    const cases: Array<[unknown, string]> = [
      [{ client_scope: 'all', modules: { spaceships: ['view'] } }, 'unknown_module'],
      [{ client_scope: 'all', modules: { billing: ['teleport'] } }, 'unknown_action'],
      [{ client_scope: 'all', preset: 'administrator' }, 'unknown_preset'],
      [{ client_scope: 'everyone' }, 'unknown_scope'],
    ];
    for (const [body, code] of cases) {
      const response = await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body });
      expect(response.status, code).toBe(422);
      expect(errorSchema.parse(response.json).error.code).toBe(code);
    }
    expect((await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body: { modules: { billing: ['view'] } } })).status).toBe(400);
    expect((await call(app, 'PUT', path(`/${staff.id}/permissions`), { as: owner(), body: { client_scope: 'all', role: 'owner' } })).status).toBe(400);
    expect((await call(app, 'PUT', path(`/${fixture.owner.membershipId}/permissions`), { as: owner(), body: { client_scope: 'all' } })).status).toBe(422);
    const client = await addClient();
    expect((await call(app, 'PUT', path(`/${client.id}/permissions`), { as: owner(), body: { client_scope: 'all' } })).status).toBe(404);
  });

  it('only the owner edits permissions, even for staff who hold team:manage', async () => {
    const manager = await addMember('staff', { team: ['manage', 'view'] });
    const target = await addMember('staff');
    for (const [method, suffix, body] of [
      ['PUT', `/${target.id}/permissions`, { client_scope: 'all', preset: 'coach' }],
      ['POST', `/${target.id}/deactivate`, undefined],
      ['POST', `/${target.id}/reactivate`, undefined],
    ] as const) {
      const response = await call(app, method, path(suffix), { as: manager.userId, body });
      expect(response.status, suffix).toBe(403);
    }
    const client = await addClient();
    expect((await call(app, 'PUT', path(`/${target.id}/permissions`), { as: client.userId, body: { client_scope: 'all', preset: 'coach' } })).status).toBe(403);
  });

  it('invites staff with a preset and stores the preset permissions on the invitation', async () => {
    const response = await call(app, 'POST', path('/invite'), { as: owner(), body: { email: 'sara@example.com', displayName: 'Sara', preset: 'nutrition_coach' } });
    expect(response.status).toBe(201);
    const invite = inviteSchema.parse(response.json);
    expect(invite.link).toContain(invite.token);
    const [row] = await setupApiData(fixture.owner.tenantId, 'read invitation', (tx) =>
      tx.select({ role: invitations.role, permissions: invitations.permissions, email: invitations.email }).from(invitations).where(eq(invitations.id, invite.id)));
    const expected = permissionsFromPreset('nutrition_coach');
    expect(row).toMatchObject({ role: 'staff', email: 'sara@example.com' });
    expect(row?.permissions).toMatchObject({ client_scope: expected.client_scope, preset: 'nutrition_coach', modules: expected.modules });
    const custom = await call(app, 'POST', path('/invite'), { as: owner(), body: {
      email: 'omar@example.com', displayName: 'Omar', preset: 'assistant', overrides: { client_scope: 'all', modules: { billing: ['view'] } },
    } });
    expect(custom.status).toBe(201);
    const [second] = await setupApiData(fixture.owner.tenantId, 'read custom invitation', (tx) =>
      tx.select({ permissions: invitations.permissions }).from(invitations).where(eq(invitations.id, inviteSchema.parse(custom.json).id)));
    expect(second?.permissions).toMatchObject({ client_scope: 'all', preset: 'assistant', modules: { billing: ['view'] } });
  });

  it('refuses staff and client callers on invite, and unknown presets, modules and extra fields', async () => {
    const body = { email: 'x@example.com', displayName: 'X', preset: 'coach' };
    const manager = await addMember('staff', { team: ['manage', 'view'] });
    const plain = await addMember('staff', { clients: ['view'] });
    const client = await addClient();
    for (const as of [manager.userId, plain.userId, client.userId]) {
      expect((await call(app, 'POST', path('/invite'), { as, body })).status).toBe(403);
    }
    const unknownPreset = await call(app, 'POST', path('/invite'), { as: owner(), body: { ...body, preset: 'administrator' } });
    expect(unknownPreset.status).toBe(422);
    expect(errorSchema.parse(unknownPreset.json).error.code).toBe('unknown_preset');
    expect((await call(app, 'POST', path('/invite'), { as: owner(), body: { ...body, overrides: { modules: { spaceships: ['view'] } } } })).status).toBe(422);
    expect((await call(app, 'POST', path('/invite'), { as: owner(), body: { ...body, role: 'owner' } })).status).toBe(400);
    expect((await call(app, 'POST', path('/invite'), { as: owner(), body: { ...body, email: 'nope' } })).status).toBe(400);
  });

  it('deactivates and reactivates staff, and never the last owner', async () => {
    const staff = await addMember('staff', { clients: ['view'] });
    const off = await call(app, 'POST', path(`/${staff.id}/deactivate`), { as: owner() });
    expect(off.status).toBe(200);
    expect(memberSchema.parse(off.json).status).toBe('disabled');
    expect((await call(app, 'GET', '/api/v1/me', { as: staff.userId })).status).toBe(401);
    expect(errorSchema.parse((await call(app, 'POST', path(`/${staff.id}/deactivate`), { as: owner() })).json).error.code).toBe('not_active');
    const on = await call(app, 'POST', path(`/${staff.id}/reactivate`), { as: owner() });
    expect(on.status).toBe(200);
    expect(memberSchema.parse(on.json).status).toBe('active');
    expect((await call(app, 'GET', '/api/v1/me', { as: staff.userId })).status).toBe(200);

    const last = await call(app, 'POST', path(`/${fixture.owner.membershipId}/deactivate`), { as: owner() });
    expect(last.status).toBe(422);
    expect(errorSchema.parse(last.json).error.code).toBe('last_owner');
    const second = await addMember('owner');
    expect((await call(app, 'POST', path(`/${second.id}/deactivate`), { as: owner() })).status).toBe(200);
    const stillLast = await call(app, 'POST', path(`/${fixture.owner.membershipId}/deactivate`), { as: owner() });
    expect(errorSchema.parse(stillLast.json).error.code).toBe('last_owner');
  });

  it('requires a session', async () => {
    expect((await call(app, 'GET', path())).status).toBe(401);
  });
});
