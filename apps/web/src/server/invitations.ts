import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { ACTIONS, MODULES, PRESETS, permissionsFromPreset, type StaffPermissions } from '@dawlyy/core/authz';
import { clientColumns } from '@dawlyy/db';
import { clients, invitations, memberships, staffClientAssignments, tenants } from '@dawlyy/db/schema';
import { ApiError, forbidden, notFound, unprocessable, validationError } from '@/src/api/errors';
import { page, type Cursor } from '@/src/api/lib/pagination';
import { lockUnassignedUser } from './bootstrap';
import { withServiceTx, type AuthContext, type Tx } from './db';
import { requirePermission } from './require-permission';

const permissionsSchema = z.object({
  client_scope: z.enum(['all', 'assigned']).optional(),
  modules: z.partialRecord(z.enum(MODULES), z.array(z.enum(ACTIONS))).optional(),
}).strict();

/** Task 2: invitation request schema; a client invitation must reference an existing accessible client. */
export const invitationInputSchema = z.object({
  role: z.enum(['staff', 'client']), clientId: z.uuid().optional(),
  displayName: z.string().trim().min(1).max(160),
  email: z.email().max(254).optional(), phone: z.string().trim().min(3).max(40).optional(),
  preset: z.string().refine((value) => Object.hasOwn(PRESETS, value), 'Unknown permission preset').optional(),
  permissions: permissionsSchema.optional(), clientScope: z.enum(['all', 'assigned']).optional(),
  assignedClientIds: z.array(z.uuid()).max(500).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.email && !value.phone) ctx.addIssue({ code: 'custom', message: 'Email or phone is required' });
  if ((value.role === 'client') !== Boolean(value.clientId)) ctx.addIssue({ code: 'custom', message: 'Only client invitations require clientId' });
  if (value.role === 'client' && (value.preset || value.permissions || value.clientScope || value.assignedClientIds)) {
    ctx.addIssue({ code: 'custom', message: 'Client invitations cannot carry staff permissions or assignments' });
  }
});

/** Task 2: validated invitation creation input. */
export type InvitationInput = z.infer<typeof invitationInputSchema>;

type InvitationPermissions = StaffPermissions & { assigned_client_ids?: string[] };
type InvitationRow = typeof invitations.$inferSelect;
const privateColumns = {
  id: invitations.id, tenantId: invitations.tenantId, role: invitations.role, clientId: invitations.clientId,
  displayName: invitations.displayName, email: invitations.email, phone: invitations.phone,
  permissions: invitations.permissions, status: invitations.status, invitedBy: invitations.invitedBy,
  expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, acceptedUserId: invitations.acceptedUserId,
  createdAt: invitations.createdAt,
};
type StoredInvitation = Omit<InvitationRow, 'tokenHash'>;

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

function requireInvitePermission(auth: AuthContext, role: 'owner' | 'staff' | 'client') {
  if (role === 'client') requirePermission(auth, 'clients', 'edit');
  else {
    requirePermission(auth, 'team', 'manage');
    if (auth.role !== 'owner') throw forbidden();
  }
}

async function visibleClientIds(tx: Tx, tenantId: string, ids: readonly string[]) {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  const rows = await tx.select({ id: clientColumns.clients.id }).from(clients)
    .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, unique)));
  if (rows.length !== unique.length) throw forbidden();
}

async function insertInvitation(tx: Tx, auth: AuthContext, input: {
  role: 'staff' | 'client'; clientId: string | null; displayName: string | null;
  email: string | null; phone: string | null; permissions: InvitationPermissions | null;
}) {
  const token = generateInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  // Drizzle marks invitedBy required, but §6.3 stamps it. Omit that column entirely, including from VALUES.
  await tx.execute(sql`insert into public.invitations
    (tenant_id, token_hash, role, client_id, display_name, email, phone, permissions, expires_at)
    values (${auth.tenantId}::uuid, ${tokenHash}, ${input.role}::public.membership_role,
      ${input.clientId}::uuid, ${input.displayName}, ${input.email}, ${input.phone},
      ${input.permissions === null ? null : JSON.stringify(input.permissions)}::jsonb, ${expiresAt.toISOString()}::timestamptz)`);
  const [row] = await tx.select({ id: invitations.id, role: invitations.role, expiresAt: invitations.expiresAt })
    .from(invitations).where(and(eq(invitations.tenantId, auth.tenantId), eq(invitations.tokenHash, tokenHash))).limit(1);
  if (!row) throw forbidden();
  return { id: row.id, role: input.role, expiresAt: row.expiresAt.toISOString(), token };
}

/** Task 2: create an invitation in the caller's RLS transaction; guards stamp the inviter. */
export async function createInvitation(tx: Tx, auth: AuthContext, input: InvitationInput) {
  requireInvitePermission(auth, input.role);
  if (input.clientId) await visibleClientIds(tx, auth.tenantId, [input.clientId]);
  let permissions: InvitationPermissions | null = null;
  if (input.role === 'staff') {
    const preset = input.preset ?? 'assistant';
    if (!Object.hasOwn(PRESETS, preset)) throw validationError(undefined, 'Unknown permission preset');
    const base = permissionsFromPreset(preset as keyof typeof PRESETS, {
      client_scope: input.permissions?.client_scope,
      modules: Object.fromEntries(Object.entries(input.permissions?.modules ?? {}).map(([module, actions]) => [module, actions ?? []])),
    });
    permissions = { ...base, client_scope: input.clientScope ?? base.client_scope };
    const assigned = [...new Set(input.assignedClientIds ?? [])];
    if (permissions.client_scope !== 'assigned' && assigned.length) throw validationError(undefined, 'Assignments require assigned scope');
    await visibleClientIds(tx, auth.tenantId, assigned);
    if (permissions.client_scope === 'assigned') permissions.assigned_client_ids = assigned;
  }
  return insertInvitation(tx, auth, {
    role: input.role, clientId: input.clientId ?? null, displayName: input.displayName,
    email: input.email ?? null, phone: input.phone ?? null, permissions,
  });
}

/** Task 2: list visible invitations newest first, without token hashes, secrets or permission snapshots. */
export async function listInvitations(tx: Tx, auth: AuthContext, query: { limit: number; cursor?: Cursor }) {
  let cursorFilter;
  if (query.cursor) {
    const { k, id } = query.cursor;
    if (typeof k !== 'string' || !z.iso.datetime({ offset: true }).safeParse(k).success || !z.uuid().safeParse(id).success) throw validationError();
    // Preserve Postgres microseconds: converting the cursor through Date would skip rows within one millisecond.
    cursorFilter = or(sql`${invitations.createdAt} < ${k}::timestamptz`,
      and(sql`${invitations.createdAt} = ${k}::timestamptz`, lt(invitations.id, id)));
  }
  const rows = await tx.select({
    id: invitations.id, role: invitations.role, displayName: invitations.displayName,
    email: invitations.email, phone: invitations.phone, clientId: invitations.clientId,
    status: invitations.status, expiresAt: invitations.expiresAt,
    createdAt: sql<string>`to_char(${invitations.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  }).from(invitations).where(and(eq(invitations.tenantId, auth.tenantId), cursorFilter))
    .orderBy(desc(invitations.createdAt), desc(invitations.id)).limit(query.limit + 1);
  return page(rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() })), query.limit, (row) => row.createdAt);
}

async function pendingInvitation(tx: Tx, auth: AuthContext, id: string): Promise<StoredInvitation> {
  const [row] = await tx.select(privateColumns).from(invitations)
    .where(and(eq(invitations.tenantId, auth.tenantId), eq(invitations.id, id))).for('update');
  if (!row) throw notFound();
  requireInvitePermission(auth, row.role);
  if (row.status !== 'pending') throw unprocessable('invitation_not_pending', 'Invitation is no longer pending');
  return row;
}

/** Task 2: revoke only a visible pending invitation; runtime policies also restrict staff to their own invites. */
export async function revokeInvitation(tx: Tx, auth: AuthContext, id: string) {
  await pendingInvitation(tx, auth, id);
  const [row] = await tx.update(invitations).set({ status: 'revoked' })
    .where(and(eq(invitations.tenantId, auth.tenantId), eq(invitations.id, id))).returning({ id: invitations.id });
  if (!row) throw forbidden();
  return { id: row.id, status: 'revoked' as const };
}

/** Task 2: revoke and replace atomically, preserving the invitation profile and validated assignment snapshot. */
export async function regenerateInvitation(tx: Tx, auth: AuthContext, id: string) {
  const row = await pendingInvitation(tx, auth, id);
  await revokeInvitation(tx, auth, id);
  if (row.role === 'owner') throw forbidden();
  return insertInvitation(tx, auth, {
    role: row.role, clientId: row.clientId, displayName: row.displayName,
    email: row.email, phone: row.phone, permissions: row.permissions,
  });
}

async function findInvitation(token: string) {
  // The unique digest is the only available scope before the invitation's tenant is known.
  return withServiceTx(null, 'invitation preview', async (tx) => {
    const [row] = await tx.select({ tenantId: invitations.tenantId }).from(invitations)
      .where(eq(invitations.tokenHash, hashInvitationToken(token))).limit(1);
    return row;
  });
}

/** Task 2: anonymous preview exposes only the business, role, recipient name and availability. */
export async function previewInvitation(token: string) {
  return withServiceTx(null, 'invitation preview', async (tx) => {
    const [row] = await tx.select({
      businessName: clientColumns.tenants.name, role: invitations.role,
      displayName: invitations.displayName, expiresAt: invitations.expiresAt, status: invitations.status,
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
