import { sql, type SQL } from 'drizzle-orm';
import { pgPolicy, pgRole } from 'drizzle-orm/pg-core';

// Role and identity functions: 0003_rls_role_and_helpers, doc §3–§4.
/** doc §5.1: the sole policy target; runtime transactions SET LOCAL ROLE dawlyy_rls. */
export const rls = pgRole('dawlyy_rls').existing();

// doc §11: 0004 drops policies while every table keeps .enableRLS(); 0005 adds them.
const POLICIES_ON = process.env.DRIZZLE_NO_POLICIES !== '1';

/** doc §5.1: match the pinned tenant. */
export const T = (tenantId: unknown): SQL => sql`${tenantId} = (select app.tenant_id())`;
/** doc §5.1: owner or staff of the pinned tenant. */
export const STAFF: SQL = sql`(select app.is_staff())`;
/** doc §5.1: owner of the pinned tenant. */
export const OWNER: SQL = sql`(select app.is_owner())`;
/** doc §5.1: client of the pinned tenant. */
export const CLIENT: SQL = sql`(select app.is_client())`;
/** doc §5.1: all-scope access or one hashed set of assigned clients per query (PERF-01). */
export const ACCESS = (clientId: unknown): SQL =>
  sql`((select app.sees_all_clients()) or ${clientId} in (select app.assigned_client_ids()))`;
/** doc §5.1: the pinned membership's own client. */
export const OWN = (clientId: unknown): SQL => sql`${clientId} = (select app.client_id())`;
/** doc §5.1: the authenticated user. */
export const ME = (userId: unknown): SQL => sql`${userId} = (select app.uid())`;
/** doc §5.1: client creation permission from the pinned membership. */
export const CAN_CREATE_CLIENTS: SQL = sql`(select app.has_perm('clients', 'create'))`;

/** doc §5.1: commands admitted by an individual permissive policy. */
export type Cmd = 'select' | 'insert' | 'update' | 'delete';

/** doc §5.1, §11: one permissive `${name}_${cmd}` policy per command, or none with the flag set. */
export function allow(name: string, cmds: Cmd[], using: SQL, check: SQL = using) {
  if (!POLICIES_ON) return [];
  return cmds.map((cmd) =>
    pgPolicy(`${name}_${cmd}`, {
      as: 'permissive',
      for: cmd,
      to: rls,
      ...(cmd === 'insert' ? { withCheck: check } : cmd === 'update' ? { using, withCheck: check } : { using }),
    }),
  );
}

/** doc §5.1, §11: one restrictive `${table}_tenant_guard` policy, or none with the flag set. */
export function tenantGuard(table: string, using: SQL, check: SQL = using) {
  if (!POLICIES_ON) return [];
  return [pgPolicy(`${table}_tenant_guard`, { as: 'restrictive', for: 'all', to: rls, using, withCheck: check })];
}
