import { sql, type SQL } from 'drizzle-orm';
import { pgPolicy, pgRole, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Row Level Security building blocks. Every policy reads the caller through the
 * `app.*` security-definer helpers (see ../../sql/0001_app_helpers.sql), which in turn
 * read the transaction-local settings that `withAuthTx` applies.
 *
 * Postgres role used at runtime after `SET LOCAL ROLE authenticated` (Supabase built-in).
 */
export const authenticated = pgRole('authenticated').existing();

export const tenantMatch = (tenantId: AnyPgColumn): SQL => sql`${tenantId} = (select app.tenant_id())`;
export const isStaff: SQL = sql`(select app.is_staff())`;
export const canAccessClient = (clientId: AnyPgColumn): SQL => sql`(select app.can_access_client(${clientId}))`;

/** Rows every member of the tenant may read (packages, exercises, foods, templates); only owner/staff may write. */
export function tenantPolicies(table: string, t: { tenantId: AnyPgColumn }) {
  const read = tenantMatch(t.tenantId);
  const write = sql`${read} and ${isStaff}`;
  return [
    pgPolicy(`${table}_member_select`, { for: 'select', to: authenticated, using: read }),
    pgPolicy(`${table}_staff_all`, { for: 'all', to: authenticated, using: write, withCheck: write }),
  ];
}

/**
 * Rows that belong to one client. Owner, staff assigned to that client (or with client_scope = all)
 * and the client themself may read. Staff may write. With `clientWrite`, the client may insert and
 * update their own rows (logs, submissions, messages).
 */
export function clientPolicies(
  table: string,
  t: { tenantId: AnyPgColumn; clientId: AnyPgColumn },
  opts: { clientWrite?: boolean } = {},
) {
  const access = sql`${tenantMatch(t.tenantId)} and ${canAccessClient(t.clientId)}`;
  const staffWrite = sql`${access} and ${isStaff}`;
  const policies = [
    pgPolicy(`${table}_access_select`, { for: 'select', to: authenticated, using: access }),
    pgPolicy(`${table}_staff_all`, { for: 'all', to: authenticated, using: staffWrite, withCheck: staffWrite }),
  ];
  if (opts.clientWrite) {
    const own = sql`${tenantMatch(t.tenantId)} and ${t.clientId} = (select app.client_id())`;
    policies.push(pgPolicy(`${table}_client_insert`, { for: 'insert', to: authenticated, withCheck: own }));
    policies.push(pgPolicy(`${table}_client_update`, { for: 'update', to: authenticated, using: own, withCheck: own }));
  }
  return policies;
}

/** Coach-only rows (private notes, risk flags, internal tasks). Clients never see them. */
export function coachPrivatePolicies(table: string, t: { tenantId: AnyPgColumn; clientId?: AnyPgColumn }) {
  const base = sql`${tenantMatch(t.tenantId)} and ${isStaff}`;
  const scoped = t.clientId ? sql`${base} and (${t.clientId} is null or ${canAccessClient(t.clientId)})` : base;
  return [pgPolicy(`${table}_coach_all`, { for: 'all', to: authenticated, using: scoped, withCheck: scoped })];
}

/** Rows owned by one user (preferences, push subscriptions, notifications). */
export function userOwnedPolicies(table: string, t: { tenantId: AnyPgColumn; userId: AnyPgColumn }) {
  const own = sql`${tenantMatch(t.tenantId)} and ${t.userId} = (select app.uid())`;
  return [pgPolicy(`${table}_owner_all`, { for: 'all', to: authenticated, using: own, withCheck: own })];
}
