import { sql, type SQL } from 'drizzle-orm';
import type { AuthContext, Tx } from '@dawlyy/db';
import { page, parseListQuery } from '../../api/lib/pagination';
import { requirePermission } from '../require-permission';
import { QUEUE_KINDS, queueHref, queueRowHref, type QueueKind } from './logic';

type Part = Exclude<QueueKind, 'attention'>;
const ATOM_KEY = sql`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`;

/**
 * Task 10: one SELECT per count, all returning (client_id, ref_id, sort_at, label). Everything runs inside the
 * caller's withAuthTx transaction, so RLS (ACCESS on client_id) scopes assigned-scope staff to their clients.
 *
 * Definitions (documented in the T10 report):
 * - overdue_checkins: calendar events of type weekly_checkin or daily_checkin in state overdue.
 * - waiting_review: check-in form submissions submitted and not yet reviewed (submitted or waiting_for_coach).
 * - missing_data: active clients with no weight metric entry recorded in the last 14 days.
 * - expiring_subscriptions: active or grace subscriptions whose ends_on is today..today+14 in their own timezone.
 * - pending_payments: payments in state pending.
 * - adherence_decline: active clients whose completed share of finished workout sessions over the last 7 local days
 *   is at least 30 points below the previous 7 (no previous sessions: never; no current sessions: share 0).
 * - attention: distinct active clients matching at least one of the six conditions above.
 */
export function queueParts(tenantId: string): Record<Part, SQL> {
  const T = sql`${tenantId}::uuid`;
  return {
    overdue_checkins: sql`select ce.client_id, ce.id::text as ref_id, ce.due_at as sort_at, ce.type as label
      from public.calendar_events ce
      where ce.tenant_id = ${T} and ce.state = 'overdue' and ce.type in ('weekly_checkin', 'daily_checkin')`,
    waiting_review: sql`select fs.client_id, fs.id::text as ref_id, fs.submitted_at as sort_at, fs.form_kind::text as label
      from public.form_submissions fs
      where fs.tenant_id = ${T} and fs.form_kind = 'checkin' and fs.state in ('submitted', 'waiting_for_coach') and fs.submitted_at is not null`,
    missing_data: sql`select c.id as client_id, c.id::text as ref_id, c.created_at as sort_at, null::text as label
      from public.clients c
      where c.tenant_id = ${T} and c.status = 'active'
        and not exists (select 1 from public.metric_entries m
          where m.tenant_id = c.tenant_id and m.client_id = c.id and m.metric = 'weight' and m.recorded_at >= now() - interval '14 days')`,
    expiring_subscriptions: sql`select s.client_id, s.id::text as ref_id, (s.ends_on::timestamp at time zone 'UTC') as sort_at, s.ends_on::text as label
      from public.subscriptions s
      where s.tenant_id = ${T} and s.state in ('active', 'grace')
        and s.ends_on between (now() at time zone s.timezone)::date and (now() at time zone s.timezone)::date + 14`,
    pending_payments: sql`select p.client_id, p.id::text as ref_id, p.created_at as sort_at, (p.amount::text || ' ' || p.currency) as label
      from public.payments p
      where p.tenant_id = ${T} and p.state = 'pending'`,
    adherence_decline: sql`select c.id as client_id, c.id::text as ref_id, c.created_at as sort_at, null::text as label
      from public.clients c
      cross join lateral (select (now() at time zone c.timezone)::date as d) t
      cross join lateral (
        select
          count(*) filter (where ws.local_date between t.d - 13 and t.d - 7)::int as pt,
          count(*) filter (where ws.local_date between t.d - 13 and t.d - 7 and ws.state = 'completed')::int as pc,
          count(*) filter (where ws.local_date between t.d - 6 and t.d)::int as ct,
          count(*) filter (where ws.local_date between t.d - 6 and t.d and ws.state = 'completed')::int as cc
        from public.workout_sessions ws
        where ws.tenant_id = c.tenant_id and ws.client_id = c.id
          and ws.state in ('completed', 'partially_completed', 'abandoned', 'skipped')
          and ws.local_date between t.d - 13 and t.d
      ) a
      where c.tenant_id = ${T} and c.status = 'active' and a.pt > 0
        and case when a.ct = 0 then 100 * a.pc >= 30 * a.pt
                 else 100 * a.pc * a.ct - 100 * a.cc * a.pt >= 30 * a.pt * a.ct end`,
  };
}

function kindQuery(kind: QueueKind, tenantId: string): SQL {
  const parts = queueParts(tenantId);
  if (kind !== 'attention') return parts[kind];
  const T = sql`${tenantId}::uuid`;
  const ids = (Object.keys(parts) as Part[]).map(key => sql`select client_id from (${parts[key]}) ${sql.identifier(`u_${key}`)}`);
  return sql`select c.id as client_id, c.id::text as ref_id, c.created_at as sort_at, null::text as label
    from public.clients c
    where c.tenant_id = ${T} and c.status = 'active' and c.id in (${sql.join(ids, sql` union `)})`;
}

/** Task 10 (spec dashboard): every count, each with the href of its filtered queue. */
export async function dashboardSummary(tx: Tx, auth: AuthContext) {
  requirePermission(auth, 'dashboard', 'view');
  const selects = QUEUE_KINDS.map(kind => sql`(select count(*)::int from (${kindQuery(kind, auth.tenantId)}) ${sql.identifier(`q_${kind}`)}) as ${sql.identifier(kind)}`);
  const rows = await tx.execute<Record<QueueKind, number>>(sql`select ${sql.join(selects, sql`, `)}`);
  const row = rows[0];
  const counts = Object.fromEntries(QUEUE_KINDS.map(kind => [kind, { count: Number(row?.[kind] ?? 0), href: queueHref(kind) }])) as Record<QueueKind, { count: number; href: string }>;
  return { counts };
}

type QueueRow = { client_id: string; ref_id: string; sort_key: string; label: string | null; client_name: string; client_code: string };

/** Task 10: the rows behind one count. Keyset order is (sort_at, ref_id): newest first, except expiring (soonest first). */
export async function dashboardQueue(tx: Tx, auth: AuthContext, kind: QueueKind, query: { limit?: string; cursor?: string }) {
  requirePermission(auth, 'dashboard', 'view');
  const { limit, cursor } = parseListQuery(query);
  const ascending = kind === 'expiring_subscriptions';
  const after = cursor === undefined ? sql`true`
    : ascending ? sql`(f.sort_at, f.ref_id) > (${String(cursor.k)}::timestamptz, ${cursor.id}::text)`
      : sql`(f.sort_at, f.ref_id) < (${String(cursor.k)}::timestamptz, ${cursor.id}::text)`;
  const order = ascending ? sql`f.sort_at asc, f.ref_id asc` : sql`f.sort_at desc, f.ref_id desc`;
  const rows = await tx.execute<QueueRow>(sql`
    select f.client_id::text as client_id, f.ref_id, to_char(f.sort_at at time zone 'UTC', ${ATOM_KEY}) as sort_key, f.label,
      coalesce(nullif(c.display_name, ''), nullif(trim(c.first_name || ' ' || coalesce(c.last_name, '')), '')) as client_name, c.code as client_code
    from (${kindQuery(kind, auth.tenantId)}) f
    join public.clients c on c.tenant_id = ${auth.tenantId}::uuid and c.id = f.client_id
    where ${after}
    order by ${order}
    limit ${limit + 1}`);
  const items = [...rows].map(row => ({
    id: row.ref_id, clientId: row.client_id, clientName: row.client_name, clientCode: row.client_code,
    at: row.sort_key, label: row.label, href: queueRowHref(kind, row.client_id, row.ref_id),
  }));
  return page(items, limit, row => row.at);
}
