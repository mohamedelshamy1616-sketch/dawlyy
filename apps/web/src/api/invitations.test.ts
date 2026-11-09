import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { permissionsFromPreset } from '@dawlyy/core/authz';
import { withAuthTx, type AuthContext } from '@dawlyy/db';
import { clients, idempotencyKeys, invitations, memberships, staffClientAssignments } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '@/src/test/api-harness';
import { hashInvitationToken } from '@/src/server/invitations';
import { app } from './index';

type Invite = { id: string; token: string; link: string; role: 'staff' | 'client'; expiresAt: string };
let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
beforeEach(async () => { fixture = await setupApiFixture(); });
afterEach(async () => { await fixture?.cleanup(); });

async function createClient() {
  return setupApiData(fixture.owner.tenantId, 'invitation client', async (tx) => {
    const [row] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'Invitation client' }).returning({ id: clients.id });
    if (!row) throw new Error('Missing test client');
    return row.id;
  });
}

async function invite(input: Record<string, unknown> = {}) {
  const response = await call(app, 'POST', '/api/v1/invitations', {
    as: fixture.owner.userId, body: { role: 'staff', displayName: 'New coach', email: 'coach@example.com', preset: 'assistant', ...input },
  });
  expect(response.status).toBe(201);
  return response.json as Invite;
}

async function staff(clientId: string): Promise<AuthContext> {
  const auth: AuthContext = {
    userId: randomUUID(), membershipId: randomUUID(), tenantId: fixture.owner.tenantId,
    role: 'staff', permissions: permissionsFromPreset('assistant', { modules: { clients: ['view', 'edit'], team: ['manage'] } }),
  };
  await setupApiData(auth.tenantId, 'inviting staff fixture', async (tx) => {
    await tx.insert(memberships).values({ id: auth.membershipId, tenantId: auth.tenantId, userId: auth.userId, role: 'staff', status: 'active', permissions: auth.permissions });
    await tx.insert(staffClientAssignments).values({ tenantId: auth.tenantId, membershipId: auth.membershipId, clientId });
  });
  return auth;
}

describe('Task 2 invitation API', () => {
  it('creates, lists with keyset pagination, regenerates and revokes without exposing secrets', async () => {
    const first = await invite();
    expect(first.link).toContain(`/ar/invite/${first.token}`);
    const second = await invite({ displayName: 'Another coach' });
    const listed = await call(app, 'GET', '/api/v1/invitations?limit=1', { as: fixture.owner.userId });
    expect(listed.status).toBe(200);
    const listing = listed.json as { items: { id: string }[]; nextCursor: string };
    expect(listing.items).toHaveLength(1);
    expect(listing.nextCursor).toBeTruthy();
    expect(JSON.stringify(listed.json)).not.toContain(first.token);
    expect(JSON.stringify(listed.json)).not.toContain(hashInvitationToken(first.token));
    for (const item of listing.items) {
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('tokenHash');
      expect(item).not.toHaveProperty('token_hash');
    }
    const next = await call(app, 'GET', `/api/v1/invitations?limit=1&cursor=${encodeURIComponent(listing.nextCursor)}`, { as: fixture.owner.userId });
    expect(next.status).toBe(200);
    expect((next.json as { items: { id: string }[] }).items[0]?.id).not.toBe(listing.items[0]?.id);
    const replaced = await call(app, 'POST', `/api/v1/invitations/${first.id}/regenerate`, { as: fixture.owner.userId });
    expect(replaced.status).toBe(201);
    expect((replaced.json as Invite).token).not.toBe(first.token);
    const oldPreview = await call(app, 'POST', '/api/v1/invitations/preview', { body: { token: first.token } });
    expect(oldPreview.json).toMatchObject({ status: 'revoked' });
    const revoked = await call(app, 'POST', `/api/v1/invitations/${second.id}/revoke`, { as: fixture.owner.userId });
    expect(revoked).toMatchObject({ status: 200, json: { id: second.id, status: 'revoked' } });
    expect((await call(app, 'POST', `/api/v1/invitations/${second.id}/revoke`, { as: fixture.owner.userId })).status).toBe(422);
  });

  it('returns the exact same public error for unknown and expired tokens and refuses expired acceptance', async () => {
    const created = await invite();
    const preview = await call(app, 'POST', '/api/v1/invitations/preview', { body: { token: created.token } });
    expect(preview.status).toBe(200);
    expect(Object.keys(preview.json as object).sort()).toEqual(['businessName', 'displayName', 'expired', 'role', 'status']);
    await setupApiData(fixture.owner.tenantId, 'expire invitation', async (tx) => {
      await tx.update(invitations).set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(and(eq(invitations.tenantId, fixture.owner.tenantId), eq(invitations.id, created.id)));
    });
    const expired = await call(app, 'POST', '/api/v1/invitations/preview', { body: { token: created.token } });
    const unknown = await call(app, 'POST', '/api/v1/invitations/preview', { body: { token: 'a'.repeat(43) } });
    expect(expired).toEqual(unknown);
    expect(expired).toMatchObject({ status: 404, json: { error: { code: 'invalid_invitation' } } });
    expect((await call(app, 'POST', '/api/v1/invitations/accept', { as: randomUUID(), body: { token: created.token } })).status).toBe(404);
  });

  it('keeps the id tie-breaker when multiple rows have the same microsecond timestamp', async () => {
    const first = await invite();
    const second = await invite();
    await setupApiData(fixture.owner.tenantId, 'tie invitation timestamps', async (tx) => {
      await tx.update(invitations).set({ createdAt: sql`'2026-11-09T12:00:00.123456Z'::timestamptz` })
        .where(and(eq(invitations.tenantId, fixture.owner.tenantId), inArray(invitations.id, [first.id, second.id])));
    });
    const response = await call(app, 'GET', '/api/v1/invitations?limit=1', { as: fixture.owner.userId });
    expect(response.status).toBe(200);
    const firstPage = response.json as { items: { id: string }[]; nextCursor: string };
    const next = await call(app, 'GET', `/api/v1/invitations?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, { as: fixture.owner.userId });
    expect(next.status).toBe(200);
    const secondPage = next.json as { items: { id: string }[]; nextCursor: string | null };
    expect([firstPage.items[0]?.id, secondPage.items[0]?.id].sort()).toEqual([first.id, second.id].sort());
    expect(secondPage.nextCursor).toBeNull();
  });

  it('accepts a client invitation with its client_id and refuses second use and an existing active user', async () => {
    const clientId = await createClient();
    const created = await invite({ role: 'client', clientId, preset: undefined });
    const userId = randomUUID();
    expect(await call(app, 'POST', '/api/v1/invitations/accept', { as: userId, body: { token: created.token } }))
      .toMatchObject({ status: 200, json: { role: 'client', redirectTo: '/app/today' } });
    expect((await call(app, 'GET', '/api/v1/invitations', { as: userId })).status).toBe(403);
    await setupApiData(fixture.owner.tenantId, 'verify accepted client', async (tx) => {
      const rows = await tx.select({ clientId: memberships.clientId }).from(memberships)
        .where(and(eq(memberships.tenantId, fixture.owner.tenantId), eq(memberships.userId, userId)));
      expect(rows).toEqual([{ clientId }]);
    });
    expect(await call(app, 'POST', '/api/v1/invitations/accept', { as: randomUUID(), body: { token: created.token } }))
      .toMatchObject({ status: 409, json: { error: { code: 'invitation_used' } } });
    const another = await invite();
    expect(await call(app, 'POST', '/api/v1/invitations/accept', { as: fixture.owner.userId, body: { token: another.token } }))
      .toMatchObject({ status: 409, json: { error: { code: 'already_member' } } });
  });

  it('allows exactly one concurrent accept and inserts only the assigned clients', async () => {
    const clientId = await createClient();
    const otherClientId = await createClient();
    const created = await invite({ clientScope: 'assigned', assignedClientIds: [clientId] });
    const users = [randomUUID(), randomUUID()];
    const responses = await Promise.all(users.map((as) => call(app, 'POST', '/api/v1/invitations/accept', { as, body: { token: created.token } })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = users[responses.findIndex((response) => response.status === 200)];
    if (!winner) throw new Error('No acceptance winner');
    const acceptedAuth = await setupApiData(fixture.owner.tenantId, 'verify assigned staff', async (tx) => {
      const [member] = await tx.select({ id: memberships.id, permissions: memberships.permissions }).from(memberships)
        .where(and(eq(memberships.tenantId, fixture.owner.tenantId), eq(memberships.userId, winner)));
      expect(member?.permissions?.client_scope).toBe('assigned');
      if (!member) throw new Error('Missing accepted member');
      const assignments = await tx.select({ clientId: staffClientAssignments.clientId }).from(staffClientAssignments)
        .where(and(eq(staffClientAssignments.tenantId, fixture.owner.tenantId), eq(staffClientAssignments.membershipId, member.id)));
      expect(assignments).toEqual([{ clientId }]);
      return { ...fixture.owner, userId: winner, membershipId: member.id, role: 'staff' as const, permissions: member.permissions };
    });
    const visible = await withAuthTx(acceptedAuth, (tx) => tx.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.tenantId, fixture.owner.tenantId), inArray(clients.id, [clientId, otherClientId]))));
    expect(visible).toEqual([{ id: clientId }]);
  });

  it('does not list or mutate another tenant\'s invitation', async () => {
    const other = await setupApiFixture();
    try {
      const created = await invite();
      expect(await call(app, 'GET', '/api/v1/invitations', { as: other.owner.userId }))
        .toMatchObject({ status: 200, json: { items: [], nextCursor: null } });
      expect((await call(app, 'POST', `/api/v1/invitations/${created.id}/revoke`, { as: other.owner.userId })).status).toBe(404);
      expect((await call(app, 'POST', `/api/v1/invitations/${created.id}/regenerate`, { as: other.owner.userId })).status).toBe(404);
      const foreignId = await setupApiData(other.owner.tenantId, 'foreign assignment client', async (tx) => {
        const [client] = await tx.insert(clients).values({ tenantId: other.owner.tenantId, firstName: 'Foreign client' }).returning({ id: clients.id });
        if (!client) throw new Error('Missing foreign client');
        return client.id;
      });
      expect((await call(app, 'POST', '/api/v1/invitations', { as: fixture.owner.userId, body: {
        role: 'staff', displayName: 'Coach', phone: '01012345678', clientScope: 'assigned', assignedClientIds: [foreignId],
      } })).status).toBe(403);
    } finally { await other.cleanup(); }
  });

  it('refuses staff invitations by staff, inaccessible clients, and unknown assignment IDs', async () => {
    const accessible = await createClient();
    const inaccessible = await createClient();
    const actor = await staff(accessible);
    expect((await call(app, 'POST', '/api/v1/invitations', { as: actor.userId, body: { role: 'staff', displayName: 'Forbidden', phone: '01012345678' } })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/invitations', { as: actor.userId, body: { role: 'client', clientId: inaccessible, displayName: 'Forbidden', phone: '01012345678' } })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/invitations', { as: actor.userId, body: { role: 'client', clientId: accessible, displayName: 'Allowed', phone: '01012345678' } })).status).toBe(201);
    expect((await call(app, 'POST', '/api/v1/invitations', { as: fixture.owner.userId, body: { role: 'staff', displayName: 'Forbidden', phone: '01012345678', clientScope: 'assigned', assignedClientIds: [randomUUID()] } })).status).toBe(403);
    // Exercise RLS directly as well: even staff holding team.manage cannot insert a staff invite.
    await expect(withAuthTx(actor, (tx) => tx.insert(invitations).values({
      tenantId: actor.tenantId, invitedBy: actor.userId, tokenHash: hashInvitationToken(randomUUID()), role: 'staff',
      displayName: 'RLS refusal', expiresAt: new Date(Date.now() + 60_000),
    }))).rejects.toMatchObject({ cause: { code: '42501' } });
  });

  it('keeps raw token responses out of replay storage and authenticates protected paths', async () => {
    expect((await call(app, 'GET', '/api/v1/invitations')).status).toBe(401);
    const created = await invite();
    expect((await call(app, 'POST', `/api/v1/invitations/${created.id}/regenerate`)).status).toBe(401);
    const key = randomUUID();
    const options = {
      as: fixture.owner.userId, headers: { 'Idempotency-Key': key },
      body: { role: 'staff', displayName: 'Coach', phone: '01012345678' },
    };
    const first = await call(app, 'POST', '/api/v1/invitations', options);
    expect(first.status).toBe(201);
    const replay = await call(app, 'POST', '/api/v1/invitations', options);
    expect(replay).toMatchObject({ status: 409, json: { error: { code: 'invitation_link_already_issued' } } });
    await setupApiData(fixture.owner.tenantId, 'verify replay does not store bearer secrets', async (tx) => {
      const [saved] = await tx.select({ body: idempotencyKeys.responseBody }).from(idempotencyKeys)
        .where(and(eq(idempotencyKeys.tenantId, fixture.owner.tenantId), eq(idempotencyKeys.userId, fixture.owner.userId), eq(idempotencyKeys.key, key)));
      expect(saved?.body).toEqual(replay.json);
      expect(JSON.stringify(saved?.body)).not.toContain((first.json as Invite).token);
      expect(JSON.stringify(saved?.body)).not.toContain(hashInvitationToken((first.json as Invite).token));
      const rows = await tx.select({ id: invitations.id }).from(invitations)
        .where(and(eq(invitations.tenantId, fixture.owner.tenantId), eq(invitations.displayName, 'Coach')));
      expect(rows).toHaveLength(1);
    });
  });
});
