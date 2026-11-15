import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { authorizedEntityPredicate, resolveActivityLinks } from './links';
import { encodeActivityCursor, parseActivityQuery } from './schemas';
import type { ActivityItem, ActivityPage, ActivityQuery } from './types';

type AuditMetadata = {
  id: string; createdAt: string; clientId: string | null; actorUserId: string | null;
  actorRole: string | null; actorDisplayName: string | null; action: string; entity: string; entityId: string | null;
};

/** R3b: an RLS-scoped read-only metadata projection. No active-access/subscription gate applies to history. */
export async function listActivity(tx: Tx, auth: AuthContext, query: ActivityQuery): Promise<ActivityPage> {
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'clients', 'view');
  const parsed = parseActivityQuery(query);
  if (parsed.clientId) {
    const [visible] = await tx.execute<{ id: string }>(sql`
      select c.id::text as id from public.clients c
      where c.tenant_id = ${auth.tenantId}::uuid and c.id = ${parsed.clientId}::uuid limit 1`);
    if (!visible) throw notFound();
  }
  const cursorFilter = parsed.cursor
    ? sql`and (a.created_at, a.id) < (${parsed.cursor.t}::timestamptz, ${parsed.cursor.id}::bigint)`
    : sql``;
  const rows = [...await tx.execute<AuditMetadata>(sql`
    select a.id::text as id,
      to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
      a.client_id::text as "clientId", a.actor_user_id::text as "actorUserId", a.actor_role as "actorRole",
      actor.display_name as "actorDisplayName", a.entity, a.entity_id as "entityId",
      case
        when a.action = 'update' and a.entity in ('clients','exercises','programs','nutrition_plans','forms','packages')
          and a.before->>'archived_at' is null and a.after->>'archived_at' is not null then 'archive'
        when a.action = 'update' and a.entity in ('clients','exercises','programs','nutrition_plans','forms','packages')
          and a.before->>'archived_at' is not null and a.after->>'archived_at' is null then 'restore'
        when a.action = 'update' and a.entity = 'calendar_events'
          and a.before->>'state' is distinct from 'cancelled' and a.after->>'state' = 'cancelled' then 'cancel'
        when a.action = 'update' and a.entity = 'calendar_events'
          and a.before->>'state' = 'cancelled' and a.after->>'state' is distinct from 'cancelled' then 'restore'
        when a.action = 'update' and a.entity in ('meal_logs','metric_entries','measurement_sets','workout_sessions')
          and a.before->>'voided_at' is null and a.after->>'voided_at' is not null
          then case when a.entity in ('meal_logs','measurement_sets') and a.after->>'void_reason' = 'corrected' then 'correct' else 'void' end
        when a.action = 'insert' and a.entity in ('meal_logs','measurement_sets') and a.after->>'replaces_id' is not null then 'correct'
        when a.action = 'update' and a.entity in ('program_versions','nutrition_plan_versions','form_versions')
          and a.before->>'status' is distinct from a.after->>'status'
          then case a.after->>'status' when 'approved' then 'approve' when 'published' then 'publish' when 'archived' then 'archive' else 'update' end
        when a.action = 'update' and a.entity = 'ai_drafts' and a.before->>'status' is distinct from a.after->>'status'
          then case a.after->>'status' when 'approved' then 'approve' when 'rejected' then 'reject' when 'stale' then 'stale' else 'update' end
        else a.action
      end as action
    from public.audit_log a
    left join public.memberships actor on actor.tenant_id = a.tenant_id and actor.user_id = a.actor_user_id and actor.status = 'active'
    where a.tenant_id = ${auth.tenantId}::uuid
      and ${authorizedEntityPredicate(auth)}
      ${auth.role === 'staff' ? sql`and a.client_id is not null` : sql``}
      ${parsed.clientId ? sql`and a.client_id = ${parsed.clientId}::uuid` : sql``}
      ${parsed.entity ? sql`and a.entity = ${parsed.entity}` : sql``}
      ${cursorFilter}
    order by a.created_at desc, a.id desc
    limit ${parsed.limit + 1}`)];
  const returned = rows.slice(0, parsed.limit);
  const links = await resolveActivityLinks(tx, auth, returned);
  const items: ActivityItem[] = returned.map(row => {
    const link = links.get(row.id);
    return {
      id: row.id, createdAt: row.createdAt, clientId: row.clientId,
      actor: { userId: row.actorUserId, displayName: row.actorDisplayName, role: row.actorRole },
      action: row.action, entity: row.entity, entityId: row.entityId,
      href: link?.href ?? null, version: link?.version ?? null,
    };
  });
  const last = returned.at(-1);
  return { items, nextCursor: rows.length > parsed.limit && last ? encodeActivityCursor(last, parsed) : null };
}
