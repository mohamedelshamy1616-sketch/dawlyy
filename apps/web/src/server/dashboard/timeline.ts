import { sql, type SQL } from 'drizzle-orm';
import { isAllowed, type Module } from '@dawlyy/core/authz';
import type { AuthContext, Tx } from '@dawlyy/db';
import { page, parseListQuery } from '../../api/lib/pagination';
import { notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { timelineHref, type TimelineKind } from './logic';

const ATOM_KEY = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);

/** Task 10: the module whose `view` grant opens each timeline section. */
const SECTION_MODULE: Record<TimelineKind, Module> = {
  subscription: 'billing', payment: 'billing', submission: 'checkins', version: 'programs',
  session: 'tracking', metric: 'tracking', message: 'messages', note: 'clients',
};

/** Task 10: sections the caller may read (RLS still limits which clients). */
export function allowedTimelineKinds(auth: AuthContext): TimelineKind[] {
  return (Object.keys(SECTION_MODULE) as TimelineKind[]).filter(kind => isAllowed(auth, SECTION_MODULE[kind], 'view'));
}

function sections(tenantId: string, clientId: string, kinds: readonly TimelineKind[]): SQL[] {
  const T = sql`${tenantId}::uuid`;
  const C = sql`${clientId}::uuid`;
  const all: Record<TimelineKind, SQL[]> = {
    subscription: [
      sql`select 'subscription'::text as kind, 'subscription:' || s.id::text as ref, s.id::text as source_id, null::text as parent_id, s.created_at as sort_at,
        jsonb_build_object('event', 'created', 'state', s.state, 'startsOn', s.starts_on::text, 'endsOn', s.ends_on::text) as summary, false as is_private
        from public.subscriptions s where s.tenant_id = ${T} and s.client_id = ${C}`,
      sql`select 'subscription'::text, 'subscription_event:' || e.id::text, e.subscription_id::text, null::text, e.created_at,
        jsonb_build_object('event', e.kind::text, 'state', e.to_state::text, 'days', e.days, 'endsOn', e.new_ends_on::text), false
        from public.subscription_events e where e.tenant_id = ${T} and e.client_id = ${C} and e.kind <> 'created'`,
    ],
    submission: [sql`select 'submission'::text, 'submission:' || fs.id::text, fs.id::text, null::text, coalesce(fs.submitted_at, fs.created_at),
      jsonb_build_object('formKind', fs.form_kind::text, 'state', fs.state::text), false
      from public.form_submissions fs where fs.tenant_id = ${T} and fs.client_id = ${C} and fs.state in ('submitted', 'waiting_for_coach', 'reviewed')`],
    version: [sql`select 'version'::text, 'version:' || v.id::text, v.id::text, v.program_id::text, coalesce(v.published_at, v.created_at),
      jsonb_build_object('versionNo', v.version_no, 'status', v.status::text), false
      from public.program_versions v where v.tenant_id = ${T} and v.client_id = ${C} and v.status in ('published', 'superseded')`],
    session: [sql`select 'session'::text, 'session:' || w.id::text, w.id::text, null::text, coalesce(w.ended_at, w.started_at, w.created_at),
      jsonb_build_object('state', w.state::text, 'localDate', w.local_date::text, 'name', w.planned_workout -> 'name', 'activeSeconds', w.active_seconds), false
      from public.workout_sessions w where w.tenant_id = ${T} and w.client_id = ${C} and w.state in ('completed', 'partially_completed', 'abandoned', 'skipped')`],
    metric: [sql`select 'metric'::text, 'metric:' || m.id::text, m.id::text, null::text, m.recorded_at,
      jsonb_build_object('metric', m.metric::text, 'metricKey', m.metric_key, 'value', m.value, 'unit', m.unit), false
      from public.metric_entries m where m.tenant_id = ${T} and m.client_id = ${C}`],
    message: [sql`select 'message'::text, 'message:' || g.id::text, g.id::text, null::text, g.created_at,
      jsonb_build_object('senderRole', g.sender_role, 'preview', left(coalesce(g.body, ''), 160), 'attachments', jsonb_array_length(g.attachments)), false
      from public.messages g where g.tenant_id = ${T} and g.client_id = ${C} and g.deleted_at is null`],
    payment: [sql`select 'payment'::text, 'payment:' || p.id::text, p.id::text, null::text, p.created_at,
      jsonb_build_object('amount', p.amount, 'currency', p.currency, 'method', p.method::text, 'state', p.state::text), false
      from public.payments p where p.tenant_id = ${T} and p.client_id = ${C}`],
    note: [sql`select 'note'::text, 'note:' || n.id::text, n.id::text, null::text, n.created_at,
      jsonb_build_object('preview', left(n.body, 240)), true
      from public.client_notes n where n.tenant_id = ${T} and n.client_id = ${C}`],
  };
  return kinds.flatMap(kind => all[kind]);
}

type TimelineRow = { kind: TimelineKind; ref: string; source_id: string; parent_id: string | null; sort_key: string; summary: Record<string, unknown>; is_private: boolean };

/**
 * Task 10: the client's events merged newest first, keyset on (time, ref). Tables read: subscriptions,
 * subscription_events, form_submissions, program_versions, workout_sessions, metric_entries, messages, payments,
 * client_notes. Sections need the matching module grant; coach notes carry `private: true`.
 */
export async function clientTimeline(tx: Tx, auth: AuthContext, clientId: string, query: { limit?: string; cursor?: string }) {
  requirePermission(auth, 'dashboard', 'view');
  const { limit, cursor } = parseListQuery(query);
  const exists = await tx.execute<{ id: string }>(sql`select id::text as id from public.clients where tenant_id = ${auth.tenantId}::uuid and id = ${clientId}::uuid`);
  if (!exists.length) throw notFound('Client not found');
  const parts = sections(auth.tenantId, clientId, allowedTimelineKinds(auth));
  if (!parts.length) return { items: [], nextCursor: null };
  const after = cursor === undefined ? sql`true` : sql`(t.sort_at, t.ref) < (${String(cursor.k)}::timestamptz, ${cursor.id}::text)`;
  const rows = await tx.execute<TimelineRow>(sql`
    select t.kind, t.ref, t.source_id, t.parent_id, to_char(t.sort_at at time zone 'UTC', ${ATOM_KEY}) as sort_key, t.summary, t.is_private
    from (${sql.join(parts, sql` union all `)}) t
    where ${after}
    order by t.sort_at desc, t.ref desc
    limit ${limit + 1}`);
  const items = [...rows].map(row => ({
    id: row.ref, kind: row.kind, at: row.sort_key, summary: row.summary, private: row.is_private,
    href: timelineHref(row.kind, clientId, row.source_id, row.parent_id),
  }));
  return page(items, limit, row => row.at);
}
