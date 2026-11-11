import 'server-only';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { describePermissions, diffPermissions, type StaffPermissions } from '@dawlyy/core/authz';
import { memberships } from '@dawlyy/db/schema';
import { forbidden, notFound, unprocessable } from '@/src/api/errors';
import { createInvitation, type InvitationInput } from '../invitations';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { PermissionInputError, isPresetId, normalizeModules, resolvePermissions, type PermissionEditInput } from './permission-edit';

const columns = {
  id: memberships.id, role: memberships.role, status: memberships.status, displayName: memberships.displayName,
  email: memberships.email, permissions: memberships.permissions, disabledAt: memberships.disabledAt,
  createdAt: memberships.createdAt, lastSeenAt: memberships.lastSeenAt,
};

/** Task 11: a team member (owner or staff) with stored and effective permissions. Client rows never appear. */
export type TeamMember = {
  id: string; role: 'owner' | 'staff'; status: 'invited' | 'active' | 'disabled'; displayName: string | null;
  email: string | null; preset: string | null; clientScope: 'all' | 'assigned' | null;
  modules: Record<string, string[]>; effective: ReturnType<typeof describePermissions>;
  disabledAt: string | null; createdAt: string; lastSeenAt: string | null;
};

type Row = { id: string; role: 'owner' | 'staff' | 'client'; status: TeamMember['status']; displayName: string | null; email: string | null;
  permissions: StaffPermissions | null; disabledAt: Date | null; createdAt: Date; lastSeenAt: Date | null };

function present(row: Row): TeamMember {
  const role = row.role === 'owner' ? 'owner' : 'staff';
  const stored = role === 'staff' ? row.permissions : null;
  return {
    id: row.id, role, status: row.status, displayName: row.displayName, email: row.email,
    preset: stored?.preset ?? null, clientScope: role === 'owner' ? 'all' : stored?.client_scope ?? null,
    modules: stored?.modules ?? {}, effective: describePermissions({ role, permissions: stored }),
    disabledAt: row.disabledAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  };
}

/** Task 11: GET /team. Needs `team:view`; owners and staff of this business only. */
export async function listTeam(tx: Tx, auth: AuthContext): Promise<{ items: TeamMember[] }> {
  requirePermission(auth, 'team', 'view');
  const rows = await tx.select(columns).from(memberships)
    .where(and(eq(memberships.tenantId, auth.tenantId), inArray(memberships.role, ['owner', 'staff'])))
    .orderBy(asc(memberships.createdAt), asc(memberships.id)).limit(200);
  return { items: rows.map(present) };
}

async function loadMember(tx: Tx, auth: AuthContext, id: string, lock = false): Promise<Row> {
  const query = tx.select(columns).from(memberships)
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.id, id), inArray(memberships.role, ['owner', 'staff'])));
  const [row] = lock ? await query.limit(1).for('update') : await query.limit(1);
  if (!row) throw notFound('Team member not found');
  return row;
}

/** Task 11: GET /team/{membershipId}. */
export async function getTeamMember(tx: Tx, auth: AuthContext, id: string): Promise<TeamMember> {
  requirePermission(auth, 'team', 'view');
  return present(await loadMember(tx, auth, id));
}

function requireOwner(auth: AuthContext): void {
  requirePermission(auth, 'team', 'manage');
  if (auth.role !== 'owner') throw forbidden();
}

function mapPermissionError(error: unknown): never {
  if (error instanceof PermissionInputError) throw unprocessable(error.code, error.message);
  throw error;
}

/** Task 11: body of POST /team/invite. */
export type TeamInviteInput = {
  email: string; displayName: string; preset: string;
  overrides?: { client_scope?: 'all' | 'assigned'; modules?: Record<string, string[]> };
};

/**
 * Task 11: POST /team/invite. Reuses the Task 2 invitation service (`createInvitation`), which checks that only an
 * owner invites staff, snapshots the preset (with overrides merged) into `invitations.permissions`, and returns the
 * one-time token. Staff and clients are refused with 403 there.
 */
export async function inviteTeamMember(tx: Tx, auth: AuthContext, input: TeamInviteInput) {
  requirePermission(auth, 'team', 'manage');
  if (!isPresetId(input.preset)) throw unprocessable('unknown_preset', 'Unknown permission preset');
  let modules: Record<string, string[]> | undefined;
  try {
    modules = input.overrides?.modules ? normalizeModules(input.overrides.modules) : undefined;
  } catch (error) { mapPermissionError(error); }
  const invitation = {
    role: 'staff', displayName: input.displayName, email: input.email, preset: input.preset,
    ...(input.overrides?.client_scope ? { clientScope: input.overrides.client_scope } : {}),
    ...(modules ? { permissions: { modules } } : {}),
  } as unknown as InvitationInput; // modules are validated and normalised above against the core MODULES/ACTIONS
  return createInvitation(tx, auth, invitation);
}

/** Task 11: result of a permission change; `changes` is core `diffPermissions` of old against new. */
export type PermissionChange = {
  member: TeamMember; changes: ReturnType<typeof diffPermissions>; clientScopeBefore: string | null;
};

/** Task 11: PUT /team/{membershipId}/permissions. Owner only; owners themselves and clients cannot be edited. */
export async function setMemberPermissions(tx: Tx, auth: AuthContext, id: string, input: PermissionEditInput): Promise<PermissionChange> {
  requireOwner(auth);
  const row = await loadMember(tx, auth, id, true);
  if (row.role !== 'staff') throw unprocessable('owner_permissions_fixed', 'An owner always has full access');
  let next: StaffPermissions;
  try { next = resolvePermissions(row.permissions, input); } catch (error) { return mapPermissionError(error); }
  const before: StaffPermissions = row.permissions ?? { client_scope: 'assigned', modules: {} };
  const changes = diffPermissions(before, next);
  await tx.update(memberships).set({ permissions: next })
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.id, id)));
  await tx.execute(sql`select app.audit('team.permissions', 'memberships', ${id}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(next)}::jsonb, null)`);
  return { member: present(await loadMember(tx, auth, id)), changes, clientScopeBefore: row.permissions?.client_scope ?? null };
}

/** Task 11: POST /team/{membershipId}/deactivate. Owner only; the last active owner is protected (422 `last_owner`). */
export async function deactivateMember(tx: Tx, auth: AuthContext, id: string): Promise<TeamMember> {
  requireOwner(auth);
  const row = await loadMember(tx, auth, id, true);
  if (row.status !== 'active') throw unprocessable('not_active', 'Only an active member can be deactivated');
  if (row.role === 'owner') {
    const others = await tx.select({ id: memberships.id }).from(memberships).where(and(
      eq(memberships.tenantId, auth.tenantId), eq(memberships.role, 'owner'), eq(memberships.status, 'active'), ne(memberships.id, id),
    )).limit(1);
    if (!others.length) throw unprocessable('last_owner', 'A business must keep at least one active owner');
  }
  await tx.update(memberships).set({ status: 'disabled', disabledAt: new Date() })
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.id, id)));
  await tx.execute(sql`select app.audit('team.disable', 'memberships', ${id}, null, ${JSON.stringify({ status: 'disabled' })}::jsonb, 'deactivate')`);
  return present(await loadMember(tx, auth, id));
}

/** Task 11: POST /team/{membershipId}/reactivate. Owner only; the allow-list has no reactivation action, so it is audited as `team.disable` with reason `reactivate`. */
export async function reactivateMember(tx: Tx, auth: AuthContext, id: string): Promise<TeamMember> {
  requireOwner(auth);
  const row = await loadMember(tx, auth, id, true);
  if (row.status !== 'disabled') throw unprocessable('not_disabled', 'Only a deactivated member can be reactivated');
  await tx.update(memberships).set({ status: 'active', disabledAt: null })
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.id, id)));
  await tx.execute(sql`select app.audit('team.disable', 'memberships', ${id}, null, ${JSON.stringify({ status: 'active' })}::jsonb, 'reactivate')`);
  return present(await loadMember(tx, auth, id));
}
