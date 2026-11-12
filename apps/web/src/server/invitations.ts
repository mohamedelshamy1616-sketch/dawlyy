import 'server-only';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { ACTIONS, MODULES, PRESETS, permissionsFromPreset, type StaffPermissions } from '@dawlyy/core/authz';
import { invitations } from '@dawlyy/db/schema';
import { ApiError, forbidden, notFound, unprocessable, validationError } from '@/src/api/errors';
import { page, type Cursor } from '@/src/api/lib/pagination';
import { generateInvitationToken, hashInvitationToken, privateColumns, visibleClientIds } from './invitations/client-read';
export { generateInvitationToken, hashInvitationToken, invitationExpired, previewInvitation, acceptInvitation, acceptInvitationForUser } from './invitations/client-read';
import { type AuthContext, type Tx } from './db';
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
type StoredInvitation = Omit<InvitationRow, 'tokenHash'>;

function requireInvitePermission(auth: AuthContext, role: 'owner' | 'staff' | 'client') {
  if (role === 'client') requirePermission(auth, 'clients', 'edit');
  else {
    requirePermission(auth, 'team', 'manage');
    if (auth.role !== 'owner') throw forbidden();
  }
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
