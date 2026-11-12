import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { clientColumns } from '@dawlyy/db';
import { clients, invitations, memberships, staffClientAssignments, tenants } from '@dawlyy/db/schema';
import { ApiError, forbidden } from '../../api/errors';
import { lockUnassignedUser } from '../bootstrap';
import { withServiceTx, type Tx } from '../db';

export const privateColumns = clientColumns.invitations;

/** Task 2: cryptographically random invitation bearer secret, never persisted or logged. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Task 2: only the hexadecimal SHA-256 digest is stored in invitations. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Task 2: the invitation is expired at its expiry instant. */
export function invitationExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

function invalidInvitation(): ApiError {
  return new ApiError(404, 'invalid_invitation', 'Invitation is invalid or expired');
}

export async function visibleClientIds(tx: Tx, tenantId: string, ids: readonly string[]) {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  const rows = await tx.select({ id: clientColumns.clients.id }).from(clients)
    .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, unique)));
  if (rows.length !== unique.length) throw forbidden();
}

async function findInvitation(token: string) {
  // The unique digest is the only available scope before the invitation's tenant is known.
  return withServiceTx(null, 'invitation preview', async (tx) => {
    const [row] = await tx.select({ tenantId: clientColumns.invitations.tenantId }).from(invitations)
      .where(eq(invitations.tokenHash, hashInvitationToken(token))).limit(1);
    return row;
  });
}

/** Task 2: anonymous preview exposes only the business, role, recipient name and availability. */
export async function previewInvitation(token: string) {
  return withServiceTx(null, 'invitation preview', async (tx) => {
    const [row] = await tx.select({
      businessName: clientColumns.tenants.name, role: clientColumns.invitations.role,
      displayName: clientColumns.invitations.displayName, expiresAt: clientColumns.invitations.expiresAt, status: clientColumns.invitations.status,
    }).from(invitations).innerJoin(tenants, eq(tenants.id, invitations.tenantId))
      .where(eq(invitations.tokenHash, hashInvitationToken(token))).limit(1);
    // Unknown and expired tokens use the same query and the exact same 404 body.
    if (!row || row.status === 'expired' || invitationExpired(row.expiresAt)) throw invalidInvitation();
    return { businessName: row.businessName, role: row.role, displayName: row.displayName, expired: false, status: row.status };
  });
}

/** Task 2: accept the locked database invitation; request bodies never supply membership role or permissions. */
export async function acceptInvitation(tx: Tx, tenantId: string, userId: string, token: string) {
  // All identity writers take this lock first, including bootstrap and acceptance of a different token.
  await lockUnassignedUser(tx, userId);
  const [row] = await tx.select(privateColumns).from(invitations)
    .where(and(eq(invitations.tenantId, tenantId), eq(invitations.tokenHash, hashInvitationToken(token)))).for('update');
  if (!row) throw invalidInvitation();
  if (row.status !== 'pending') throw new ApiError(409, 'invitation_used', 'Invitation is no longer available');
  if (invitationExpired(row.expiresAt)) throw invalidInvitation();
  if (row.role !== 'client' && row.role !== 'staff') throw invalidInvitation();
  const snapshot = z.object({ assigned_client_ids: z.array(z.uuid()).optional() }).passthrough().safeParse(row.permissions);
  if (row.role === 'staff' && (!row.permissions || !snapshot.success)) throw invalidInvitation();
  const assigned = row.role === 'staff' && row.permissions?.client_scope === 'assigned'
    ? (snapshot.success ? [...new Set(snapshot.data.assigned_client_ids ?? [])] : []) : [];
  await visibleClientIds(tx, tenantId, assigned);
  if (row.clientId) {
    const [client] = await tx.select({ id: clientColumns.clients.id, membershipId: clientColumns.clients.membershipId }).from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.id, row.clientId))).for('update');
    if (!client) throw invalidInvitation();
    if (client.membershipId) throw new ApiError(409, 'invitation_used', 'Client already has an account');
  }
  const [member] = await tx.insert(memberships).values({
    tenantId, userId, role: row.role, clientId: row.clientId, status: 'active',
    displayName: row.displayName, email: row.email, phone: row.phone,
    permissions: row.role === 'staff' && row.permissions ? {
      client_scope: row.permissions.client_scope, modules: row.permissions.modules, preset: row.permissions.preset,
    } : null,
  }).returning({ id: memberships.id });
  if (!member) throw new Error('Accepted membership insert returned no row');
  if (assigned.length) await tx.insert(staffClientAssignments).values(assigned.map((clientId) => ({
    tenantId, membershipId: member.id, clientId, assignedBy: row.invitedBy,
  })));
  if (row.clientId) await tx.update(clients).set({ membershipId: member.id })
    .where(and(eq(clients.tenantId, tenantId), eq(clients.id, row.clientId)));
  await tx.update(invitations).set({ status: 'accepted', acceptedAt: new Date(), acceptedUserId: userId })
    .where(and(eq(invitations.tenantId, tenantId), eq(invitations.id, row.id)));
  return { role: row.role, redirectTo: row.role === 'client' ? '/app/today' as const : '/coach' as const };
}

/** Task 2: locate by digest, then keep membership, assignments and acceptance in one tenant-scoped service transaction. */
export async function acceptInvitationForUser(userId: string, token: string) {
  const row = await findInvitation(token);
  if (!row) throw invalidInvitation();
  return withServiceTx(row.tenantId, 'invitation accept', (tx) => acceptInvitation(tx, row.tenantId, userId, token));
}
