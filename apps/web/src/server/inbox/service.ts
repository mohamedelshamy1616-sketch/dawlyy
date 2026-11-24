import 'server-only';
import { sql } from 'drizzle-orm';
import { rankAttention, type AttentionInput } from '@dawlyy/core/attention';
import { isAllowed } from '@dawlyy/core/authz';
import type { ProgramDocument } from '@dawlyy/core/types';
import type { AuthContext, Tx } from '@dawlyy/db';
import { forbidden, notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { queueParts } from '../dashboard/queue';
import { actionHref, attentionGoal, plannedWorkouts } from './logic';

type Client = { id: string; displayName: string; code: string; goal: unknown };
type Facts = {
  client_id: string; submitted_on: string | null; checkin_status: AttentionInput['lastCheckin']['status'];
  review_id: string | null; due_on: string | null; done7: number | null; done14: number | null;
  meal_days: number | null; nutrition_assigned: boolean; weights: AttentionInput['weights14'] | null;
  payment_id: string | null; ends_on: string | null; conversation_id: string | null;
  last_coach_on: string | null; unread: number | null;
};

/** R1b: five set-based reads under caller RLS. Exported for DB acceptance of input windows/voids. */
export async function readInboxInputs(tx: Tx, auth: AuthContext) {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'clients', 'view');
  const canBilling = isAllowed(auth, 'billing', 'view');
  const canMessages = isAllowed(auth, 'messages', 'view');
  const canCheckins = isAllowed(auth, 'checkins', 'view');
  const canTracking = isAllowed(auth, 'tracking', 'view');
  const canNutrition = isAllowed(auth, 'nutrition', 'view');
  const T = sql`${auth.tenantId}::uuid`;
  const [clock] = await tx.execute<{ today: string; timezone: string }>(sql`
    select (now() at time zone t.timezone)::date::text as today, t.timezone
    from public.tenants t where t.id = ${T}`);
  if (!clock) throw notFound();
  const { today, timezone } = clock;
  const D = sql`${today}::date`;
  const scope = sql`select c.id from public.clients c where c.tenant_id = ${T} and c.status = 'active' and c.archived_at is null`;
  const clients = [...await tx.execute<Client>(sql`
    select c.id::text as id, coalesce(nullif(c.display_name, ''), trim(c.first_name || ' ' || coalesce(c.last_name, ''))) as "displayName",
      c.code, c.profile->>'goal' as goal
    from public.clients c where c.id in (${scope}) and c.tenant_id = ${T}`)];
  const queues = queueParts(auth.tenantId);
  // Unavailable sources have typed empty relations, without referencing their tables.
  const emptyQueue = sql`select null::uuid as client_id, null::text as ref_id, null::timestamptz as sort_at where false`;
  const facts = [...await tx.execute<Facts>(sql`
    with scoped as (${scope}), waiting as (${canCheckins ? queues.waiting_review : emptyQueue}),
    pending as (${canBilling ? queues.pending_payments : emptyQueue}),
    checkins as (${canCheckins ? sql`
      select distinct on (fs.client_id) fs.client_id, fs.id, fs.submitted_at, fs.reviewed_at, fs.state
      from public.form_submissions fs join scoped c on c.id = fs.client_id
      where fs.tenant_id = ${T} and fs.form_kind = 'checkin' and fs.submitted_at is not null
      order by fs.client_id, fs.submitted_at desc, fs.id desc
    ` : sql`select null::uuid as client_id, null::uuid as id, null::timestamptz as submitted_at,
      null::timestamptz as reviewed_at, null::text as state where false`}), dues as (${canCheckins ? sql`
      select ce.client_id, min((ce.due_at at time zone ${timezone})::date)::text as due_on
      from public.calendar_events ce join scoped c on c.id = ce.client_id
      where ce.tenant_id = ${T} and ce.type in ('weekly_checkin', 'daily_checkin') and ce.state in ('scheduled', 'due', 'overdue')
      group by ce.client_id
    ` : sql`select null::uuid as client_id, null::text as due_on where false`}), workouts as (${canTracking ? sql`
      select ws.client_id, count(*) filter (where ws.local_date >= ${D} - 6)::int as done7, count(*)::int as done14
      from public.workout_sessions ws join scoped c on c.id = ws.client_id
      where ws.tenant_id = ${T} and ws.voided_at is null and ws.state = 'completed'
        and ws.local_date between ${D} - 13 and ${D} group by ws.client_id
    ` : sql`select null::uuid as client_id, null::int as done7, null::int as done14 where false`}), meals as (${canNutrition ? sql`
      select ml.client_id, count(distinct ml.local_date)::int as meal_days
      from public.meal_logs ml join scoped c on c.id = ml.client_id
      where ml.tenant_id = ${T} and ml.voided_at is null
        and ml.local_date between ${D} - 6 and ${D} group by ml.client_id
    ` : sql`select null::uuid as client_id, null::int as meal_days where false`}), weights as (${canTracking ? sql`
      select m.client_id, jsonb_agg(jsonb_build_object('on', m.local_date::text, 'kg',
        case when m.unit = 'lb' then m.value * 0.45359237 else m.value end) order by m.local_date, m.id) as weights
      from (
        select distinct on (e.client_id, e.local_date) e.client_id, e.local_date, e.id, e.unit, e.value
        from public.metric_entries e join scoped c on c.id = e.client_id
        where e.tenant_id = ${T} and e.metric = 'weight' and e.voided_at is null and e.unit in ('kg', 'lb')
          and e.local_date between ${D} - 13 and ${D}
        order by e.client_id, e.local_date, e.recorded_at desc, e.id desc
      ) m group by m.client_id
    ` : sql`select null::uuid as client_id, null::jsonb as weights where false`}), nutrition as (${canNutrition ? sql`
      select distinct p.client_id from public.nutrition_plans p join scoped c on c.id = p.client_id
      join public.nutrition_plan_versions v on v.tenant_id = p.tenant_id and v.id = p.published_version_id and v.status = 'published'
      where p.tenant_id = ${T} and p.archived_at is null
    ` : sql`select null::uuid as client_id where false`}), payments as (
      select distinct on (p.client_id) p.client_id, p.ref_id from pending p
      order by p.client_id, p.sort_at, p.ref_id
    ), subs as (${canBilling ? sql`
      select distinct on (s.client_id) s.client_id, s.ends_on::text as ends_on
      from public.subscriptions s join scoped c on c.id = s.client_id
      where s.tenant_id = ${T} and s.state in ('active', 'grace', 'expired')
      order by s.client_id, s.created_at desc, s.id desc
    ` : sql`select null::uuid as client_id, null::text as ends_on where false`}), contact as (${canMessages ? sql`
      select m.client_id, (max(m.created_at) filter (where m.sender_role in ('owner', 'staff')) at time zone ${timezone})::date::text as last_coach_on,
        count(*) filter (where m.sender_role = 'client' and m.read_by_coach_at is null)::int as unread
      from public.messages m join scoped c on c.id = m.client_id
      where m.tenant_id = ${T} and m.deleted_at is null group by m.client_id
    ` : sql`select null::uuid as client_id, null::text as last_coach_on, null::int as unread where false`}),
    conversations as (${canMessages ? sql`
      select cv.client_id, cv.id from public.conversations cv join scoped c on c.id = cv.client_id
      where cv.tenant_id = ${T} and cv.kind = 'client'
    ` : sql`select null::uuid as client_id, null::uuid as id where false`})
    select c.id::text as client_id, (ch.submitted_at at time zone ${timezone})::date::text as submitted_on,
      case when w.ref_id is not null and ch.reviewed_at is null then 'waiting_review'
        when ch.id is not null then 'reviewed' else 'none' end as checkin_status,
      case when ch.reviewed_at is null then w.ref_id end as review_id, d.due_on, ws.done7, ws.done14, ml.meal_days,
      n.client_id is not null as nutrition_assigned, we.weights, p.ref_id as payment_id, s.ends_on,
      cv.id::text as conversation_id, ct.last_coach_on, ct.unread
    from scoped c
    left join checkins ch on ch.client_id = c.id left join waiting w on w.ref_id = ch.id::text
    left join dues d on d.client_id = c.id left join workouts ws on ws.client_id = c.id
    left join meals ml on ml.client_id = c.id left join weights we on we.client_id = c.id
    left join nutrition n on n.client_id = c.id left join payments p on p.client_id = c.id
    left join subs s on s.client_id = c.id left join contact ct on ct.client_id = c.id
    left join conversations cv on cv.client_id = c.id
  `)];
  // No calendar workout event type exists. The latest published client program supplies its dated schedule.
  const programs = canTracking ? await tx.execute<{ client_id: string; document: ProgramDocument; assigned_on: string | null }>(sql`
    select distinct on (p.client_id) p.client_id::text as client_id, v.document,
      coalesce(c.started_on, ${canBilling ? sql`s.starts_on` : sql`null::date`}, (v.published_at at time zone ${timezone})::date)::text as assigned_on
    from public.programs p join public.clients c on c.tenant_id = p.tenant_id and c.id = p.client_id
    join public.program_versions v on v.tenant_id = p.tenant_id and v.id = p.published_version_id and v.status = 'published'
    ${canBilling ? sql`left join public.subscriptions s on s.tenant_id = p.tenant_id and s.id = p.subscription_id` : sql``}
    where p.tenant_id = ${T} and p.archived_at is null and p.client_id in (${scope})
    order by p.client_id, v.published_at desc, p.id desc`) : [];
  const flagSources: string[] = [];
  if (canCheckins) flagSources.push('checkin');
  if (canMessages) flagSources.push('message');
  if (canNutrition) flagSources.push('meal_note');
  const flags = flagSources.length ? await tx.execute<{ client_id: string; count: number; flags: AttentionInput['openRedFlags'] }>(sql`
    select rf.client_id::text as client_id, count(*)::int as count,
      jsonb_agg(jsonb_build_object('category', rf.category) order by rf.category) as flags
    from public.red_flags rf where rf.tenant_id = ${T} and rf.status = 'open' and rf.client_id in (${scope})
      and rf.source in (${sql.join(flagSources.map(source => sql`${source}`), sql`, `)})
    group by rf.client_id`) : [];
  const factMap = new Map(facts.map(row => [row.client_id, row]));
  const planMap = new Map([...programs].map(row => [row.client_id, plannedWorkouts(row.document, row.assigned_on, today)]));
  const flagMap = new Map([...flags].map(row => [row.client_id, row.count > 0 ? row.flags : []]));
  const inputs: AttentionInput[] = clients.map(client => {
    const f = factMap.get(client.id);
    return {
      clientId: client.id,
      lastCheckin: { submittedOn: f?.submitted_on ?? null, status: f?.checkin_status ?? 'none', dueOn: f?.due_on ?? null },
      workouts: { ...(planMap.get(client.id) ?? { planned7: 0, planned14: 0 }), done7: Number(f?.done7 ?? 0), done14: Number(f?.done14 ?? 0) },
      mealLogDays7: Number(f?.meal_days ?? 0), nutritionAssigned: f?.nutrition_assigned ?? false,
      weights14: f?.weights ?? [], goal: attentionGoal(client.goal), openRedFlags: flagMap.get(client.id) ?? [],
      paymentPending: f?.payment_id != null, subscriptionEndsOn: f?.ends_on ?? null,
      lastCoachMessageOn: f?.last_coach_on ?? null, unreadFromClient: Number(f?.unread ?? 0),
      messagesAvailable: canMessages,
    };
  });
  return { today, clients, inputs, factMap };
}

/** R1b: rank the full accessible active cohort before applying the bounded response limit. */
export async function listInbox(tx: Tx, auth: AuthContext, limit = 50) {
  const data = await readInboxInputs(tx, auth);
  const clients = new Map(data.clients.map(({ goal, ...client }) => { void goal; return [client.id, client] as const; }));
  const items = rankAttention(data.inputs, { today: data.today }).slice(0, Math.max(1, Math.min(200, limit))).map(item => {
    const refs = data.factMap.get(item.clientId);
    const { clientId, ...attention } = item;
    return { client: clients.get(clientId)!, ...attention,
      actionHref: actionHref(item.primaryAction, clientId, { reviewId: refs?.review_id, paymentId: refs?.payment_id, conversationId: refs?.conversation_id }) };
  });
  return { items, today: data.today };
}
