import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { clientNotes, clients, calendarEvents, conversations, formSubmissions, memberships, messages, metricEntries, packages, payments, staffClientAssignments, subscriptions, workoutSessions } from '@dawlyy/db/schema';
import { ScheduleRules } from '@dawlyy/core/types';
import { call, setupApiData } from '../test/api-harness';
import { formsFixture } from '../server/forms/api-fixture';
import { QUEUE_KINDS } from '../server/dashboard/logic';
import { app } from './index';

const countsSchema = z.object({ counts: z.record(z.string(), z.object({ count: z.number(), href: z.string() })) });
const queueSchema = z.object({ items: z.array(z.object({ id: z.string(), clientId: z.string(), clientName: z.string().nullable(), href: z.string(), at: z.string() })), nextCursor: z.string().nullable() });
const timelineSchema = z.object({ items: z.array(z.object({ id: z.string(), kind: z.string(), at: z.string(), private: z.boolean(), href: z.string(), summary: z.record(z.string(), z.unknown()) })), nextCursor: z.string().nullable() });

/** Today in the default client timezone, shifted by whole days, as YYYY-MM-DD. */
function cairoDate(offsetDays: number): string {
  const base = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

describe('Task 10 dashboard counts, queues and Client 360 timeline', () => {
  let f: Awaited<ReturnType<typeof formsFixture>>;
  let assignedStaff: string; let clientUser: string; let viewOnlyStaff: string;
  beforeEach(async () => {
    f = await formsFixture('checkin');
    assignedStaff = randomUUID(); clientUser = randomUUID(); viewOnlyStaff = randomUUID();
    const tenantId = f.owner.tenantId;
    await setupApiData(tenantId, 'dashboard fixture', async tx => {
      await tx.update(clients).set({ status: 'active' }).where(sql`${clients.tenantId} = ${tenantId}`);
      const staffMembership = randomUUID();
      await tx.insert(memberships).values([
        { id: staffMembership, tenantId, userId: assignedStaff, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { dashboard: ['view'], billing: ['view'], tracking: ['view'], clients: ['view'], checkins: ['view'], programs: ['view'], messages: ['view'] } } },
        { tenantId, userId: viewOnlyStaff, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { dashboard: ['view'] } } },
        { tenantId, userId: clientUser, role: 'client', status: 'active', clientId: f.clientId },
      ]);
      await tx.insert(staffClientAssignments).values({ tenantId, membershipId: staffMembership, clientId: f.clientId });
      const timing = { timezone: 'Africa/Cairo', localDate: cairoDate(0) };
      await tx.insert(calendarEvents).values([
        { tenantId, clientId: f.clientId, type: 'weekly_checkin', state: 'overdue', dueAt: daysAgo(2), source: 'manual', ...timing },
        { tenantId, clientId: f.otherClientId, type: 'weekly_checkin', state: 'overdue', dueAt: daysAgo(1), source: 'manual', ...timing },
        { tenantId, clientId: f.clientId, type: 'weigh_in', state: 'overdue', dueAt: daysAgo(1), source: 'manual', ...timing },
        { tenantId, clientId: f.otherClientId, type: 'weekly_checkin', state: 'completed', dueAt: daysAgo(9), source: 'manual', ...timing },
      ]);
      const submission = { tenantId, formId: f.formId, formVersionId: f.versionId, formKind: 'checkin' as const };
      await tx.insert(formSubmissions).values([
        { ...submission, clientId: f.clientId, state: 'submitted', submittedAt: daysAgo(1) },
        { ...submission, clientId: f.otherClientId, state: 'waiting_for_coach', submittedAt: daysAgo(2) },
        { ...submission, clientId: f.otherClientId, state: 'reviewed', submittedAt: daysAgo(8), reviewedAt: daysAgo(7) },
      ]);
      const metric = { tenantId, metric: 'weight' as const, unit: 'kg', timezone: 'Africa/Cairo' };
      await tx.insert(metricEntries).values([
        { ...metric, clientId: f.clientId, value: 80, recordedAt: daysAgo(2), localDate: cairoDate(-2), clientUuid: randomUUID() },
        { ...metric, clientId: f.otherClientId, value: 90, recordedAt: daysAgo(20), localDate: cairoDate(-20), clientUuid: randomUUID() },
      ]);
      const [pkg] = await tx.insert(packages).values({ tenantId, name: { en: 'Coaching' }, durationDays: 28, scheduleRules: ScheduleRules.parse({}) }).returning({ id: packages.id });
      if (!pkg) throw new Error('Missing package');
      const snapshot = { name: { en: 'Coaching' }, durationDays: 28, price: 0, currency: 'EGP', entitlements: [], scheduleRules: ScheduleRules.parse({}) };
      await tx.insert(subscriptions).values([
        { tenantId, clientId: f.clientId, packageId: pkg.id, startsOn: cairoDate(-23), endsOn: cairoDate(5), state: 'active', packageSnapshot: snapshot },
        { tenantId, clientId: f.otherClientId, packageId: pkg.id, startsOn: cairoDate(-1), endsOn: cairoDate(30), state: 'active', packageSnapshot: snapshot },
      ]);
      await tx.insert(payments).values([
        { tenantId, clientId: f.clientId, amount: 500, method: 'cash', state: 'pending', createdAt: daysAgo(3) },
        { tenantId, clientId: f.otherClientId, amount: 700, method: 'cash', state: 'verified', createdAt: daysAgo(4) },
      ]);
      const session = (state: 'completed' | 'abandoned', offset: number) => ({
        tenantId, clientId: f.clientId, state, timezone: 'Africa/Cairo', localDate: cairoDate(offset), startedAt: daysAgo(-offset), endedAt: daysAgo(-offset), clientUuid: randomUUID(),
      });
      await tx.insert(workoutSessions).values([
        session('completed', -8), session('completed', -9), session('completed', -10), session('completed', -11), // previous window: 100 percent
        session('completed', -1), session('abandoned', -2), session('abandoned', -3), session('abandoned', -4), // current window: 25 percent
      ]);
    });
  });
  afterEach(async () => { await f?.cleanup(); });

  /** The plan's acceptance: independent SQL over the fixture, bypassing RLS but filtered by tenant. */
  async function directCounts(onlyClient?: string) {
    const tenantId = f.owner.tenantId;
    const scope = (column: string) => onlyClient ? sql`and ${sql.raw(column)} = ${onlyClient}::uuid` : sql``;
    return setupApiData(tenantId, 'dashboard direct counts', async tx => {
      const one = async (query: ReturnType<typeof sql>) => Number((await tx.execute<{ n: number }>(query))[0]?.n);
      const overdue = await one(sql`select count(*)::int as n from calendar_events where tenant_id = ${tenantId}::uuid and state = 'overdue' and type in ('weekly_checkin', 'daily_checkin') ${scope('client_id')}`);
      const waiting = await one(sql`select count(*)::int as n from form_submissions where tenant_id = ${tenantId}::uuid and form_kind = 'checkin' and state in ('submitted', 'waiting_for_coach') ${scope('client_id')}`);
      const missing = await one(sql`select count(*)::int as n from clients c where c.tenant_id = ${tenantId}::uuid and c.status = 'active' ${scope('c.id')} and c.id not in (select client_id from metric_entries where tenant_id = ${tenantId}::uuid and metric = 'weight' and recorded_at > now() - interval '14 days')`);
      const expiring = await one(sql`select count(*)::int as n from subscriptions where tenant_id = ${tenantId}::uuid and state in ('active', 'grace') and ends_on >= ${cairoDate(0)}::date and ends_on <= ${cairoDate(14)}::date ${scope('client_id')}`);
      const pending = await one(sql`select count(*)::int as n from payments where tenant_id = ${tenantId}::uuid and state = 'pending' ${scope('client_id')}`);
      const adherenceRows = await tx.execute<{ client_id: string }>(sql`select client_id::text as client_id from (
        select client_id,
          count(*) filter (where local_date >= ${cairoDate(-13)}::date and local_date <= ${cairoDate(-7)}::date) as prev_total,
          count(*) filter (where local_date >= ${cairoDate(-13)}::date and local_date <= ${cairoDate(-7)}::date and state = 'completed') as prev_done,
          count(*) filter (where local_date >= ${cairoDate(-6)}::date and local_date <= ${cairoDate(0)}::date) as cur_total,
          count(*) filter (where local_date >= ${cairoDate(-6)}::date and local_date <= ${cairoDate(0)}::date and state = 'completed') as cur_done
        from workout_sessions where tenant_id = ${tenantId}::uuid and state in ('completed', 'partially_completed', 'abandoned', 'skipped') ${scope('client_id')} group by client_id) s
        where prev_total > 0 and (prev_done::numeric / prev_total) * 100 - (case when cur_total = 0 then 0 else (cur_done::numeric / cur_total) * 100 end) >= 30`);
      const adherence = adherenceRows.length;
      const declining = sql.join([sql`null::uuid`, ...[...adherenceRows].map(row => sql`${row.client_id}::uuid`)], sql`, `);
      const attention = await one(sql`select count(distinct c.id)::int as n from clients c where c.tenant_id = ${tenantId}::uuid and c.status = 'active' ${scope('c.id')} and (
        c.id in (select client_id from calendar_events where tenant_id = ${tenantId}::uuid and state = 'overdue' and type in ('weekly_checkin', 'daily_checkin'))
        or c.id in (select client_id from form_submissions where tenant_id = ${tenantId}::uuid and form_kind = 'checkin' and state in ('submitted', 'waiting_for_coach'))
        or c.id not in (select client_id from metric_entries where tenant_id = ${tenantId}::uuid and metric = 'weight' and recorded_at > now() - interval '14 days')
        or c.id in (select client_id from subscriptions where tenant_id = ${tenantId}::uuid and state in ('active', 'grace') and ends_on >= ${cairoDate(0)}::date and ends_on <= ${cairoDate(14)}::date)
        or c.id in (select client_id from payments where tenant_id = ${tenantId}::uuid and state = 'pending')
        or c.id in (${declining}))`);
      return { overdue_checkins: overdue, waiting_review: waiting, missing_data: missing, expiring_subscriptions: expiring, pending_payments: pending, adherence_decline: adherence, attention };
    });
  }
  async function summary(as: string) {
    const response = await call(app, 'GET', '/api/v1/dashboard/summary', { as });
    expect(response.status).toBe(200);
    return countsSchema.parse(response.json).counts;
  }

  it('returns every count equal to a direct SQL count, each with a filtered-queue href', async () => {
    const counts = await summary(f.owner.userId);
    const expected = await directCounts();
    expect(Object.keys(counts).sort()).toEqual([...QUEUE_KINDS].sort());
    for (const kind of QUEUE_KINDS) {
      expect(counts[kind]?.count, kind).toBe(expected[kind]);
      expect(counts[kind]?.href).toBe(`/coach?queue=${kind}`);
    }
    // The fixture is built so each rule fires for a known client (guards against both sides being wrong together).
    expect(Object.fromEntries(QUEUE_KINDS.map(kind => [kind, counts[kind]?.count]))).toEqual({
      attention: 2, overdue_checkins: 2, waiting_review: 2, missing_data: 1, expiring_subscriptions: 1, pending_payments: 1, adherence_decline: 1,
    });
  });

  it('limits assigned-scope staff to the counts of their assigned clients', async () => {
    const counts = await summary(assignedStaff);
    const expected = await directCounts(f.clientId);
    for (const kind of QUEUE_KINDS) expect(counts[kind]?.count, kind).toBe(expected[kind]);
    expect(Object.fromEntries(QUEUE_KINDS.map(kind => [kind, counts[kind]?.count]))).toEqual({
      attention: 1, overdue_checkins: 1, waiting_review: 1, missing_data: 0, expiring_subscriptions: 1, pending_payments: 1, adherence_decline: 1,
    });
  });

  it('refuses clients, unauthenticated callers and staff without the dashboard grant', async () => {
    for (const path of ['/api/v1/dashboard/summary', '/api/v1/dashboard/queue/pending_payments', `/api/v1/dashboard/timeline/${f.clientId}`]) {
      expect((await call(app, 'GET', path, { as: clientUser })).status, path).toBe(403);
      expect((await call(app, 'GET', path)).status, path).toBe(401);
    }
    expect((await call(app, 'GET', '/api/v1/dashboard/queue/not_a_kind', { as: f.owner.userId })).status).toBe(400);
    expect((await call(app, 'GET', '/api/v1/dashboard/queue/pending_payments?cursor=junk', { as: f.owner.userId })).status).toBe(400);
    // The forms fixture staff holds forms and checkins grants only.
    expect((await call(app, 'GET', '/api/v1/dashboard/summary', { as: f.staffId })).status).toBe(403);
  });

  it('lists the rows behind a count with keyset pagination and per-row links', async () => {
    const payments = queueSchema.parse((await call(app, 'GET', '/api/v1/dashboard/queue/pending_payments', { as: f.owner.userId })).json);
    expect(payments.items).toHaveLength(1);
    expect(payments.items[0]).toMatchObject({ clientId: f.clientId, href: '/coach/billing' });
    const first = queueSchema.parse((await call(app, 'GET', '/api/v1/dashboard/queue/overdue_checkins?limit=1', { as: f.owner.userId })).json);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = queueSchema.parse((await call(app, 'GET', `/api/v1/dashboard/queue/overdue_checkins?limit=1&cursor=${first.nextCursor}`, { as: f.owner.userId })).json);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([first.items[0]?.clientId, second.items[0]?.clientId])).toEqual(new Set([f.clientId, f.otherClientId]));
    const attention = queueSchema.parse((await call(app, 'GET', '/api/v1/dashboard/queue/attention', { as: f.owner.userId })).json);
    expect(attention.items.map(row => row.clientId).sort()).toEqual([f.clientId, f.otherClientId].sort());
    const waiting = queueSchema.parse((await call(app, 'GET', '/api/v1/dashboard/queue/waiting_review', { as: assignedStaff })).json);
    expect(waiting.items).toHaveLength(1);
    expect(waiting.items[0]?.href).toMatch(/^\/coach\/checkins\/review\/[0-9a-f-]{36}$/);
  });

  it('merges subscription, payment, session, message and private note rows newest first', async () => {
    const tenantId = f.owner.tenantId;
    await setupApiData(tenantId, 'timeline notes and messages', async tx => {
      await tx.insert(clientNotes).values({ tenantId, clientId: f.clientId, body: 'Knee is bothering him; go easy', authorUserId: f.owner.userId, createdAt: daysAgo(0.5) });
      const [conversation] = await tx.insert(conversations).values({ tenantId, kind: 'client', clientId: f.clientId }).returning({ id: conversations.id });
      if (!conversation) throw new Error('Missing conversation');
      await tx.insert(messages).values({ tenantId, conversationId: conversation.id, clientId: f.clientId, senderUserId: f.owner.userId, senderRole: 'owner', body: 'Great week', clientUuid: randomUUID(), createdAt: daysAgo(0.25) });
    });
    const response = await call(app, 'GET', `/api/v1/dashboard/timeline/${f.clientId}`, { as: f.owner.userId });
    expect(response.status).toBe(200);
    const { items, nextCursor } = timelineSchema.parse(response.json);
    expect(nextCursor).toBeNull();
    const kinds = new Set(items.map(item => item.kind));
    for (const kind of ['subscription', 'payment', 'session', 'metric', 'submission', 'message', 'note']) expect(kinds.has(kind), kind).toBe(true);
    const times = items.map(item => item.at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(new Set(items.map(item => item.id)).size).toBe(items.length);
    expect(items.filter(item => item.private).map(item => item.kind)).toEqual(['note']);
    expect(items.find(item => item.kind === 'payment')).toMatchObject({ href: '/coach/billing', summary: { state: 'pending', amount: 500 } });
    // Paging by two never repeats or loses a row.
    const seen: string[] = []; let cursor: string | null = null;
    do {
      const next = timelineSchema.parse((await call(app, 'GET', `/api/v1/dashboard/timeline/${f.clientId}?limit=2${cursor ? `&cursor=${cursor}` : ''}`, { as: f.owner.userId })).json);
      seen.push(...next.items.map(item => item.id)); cursor = next.nextCursor;
    } while (cursor);
    expect(seen).toEqual(items.map(item => item.id));
  });

  it('shows staff only the timeline sections their grants open and hides clients outside their scope', async () => {
    const tenantId = f.owner.tenantId;
    await setupApiData(tenantId, 'timeline note', async tx => {
      await tx.insert(clientNotes).values({ tenantId, clientId: f.clientId, body: 'Private', authorUserId: f.owner.userId });
    });
    const limited = timelineSchema.parse((await call(app, 'GET', `/api/v1/dashboard/timeline/${f.clientId}`, { as: viewOnlyStaff })).json);
    expect(limited.items).toEqual([]);
    const scoped = timelineSchema.parse((await call(app, 'GET', `/api/v1/dashboard/timeline/${f.clientId}`, { as: assignedStaff })).json);
    expect(scoped.items.some(item => item.kind === 'payment')).toBe(true);
    expect(scoped.items.some(item => item.kind === 'message')).toBe(false);
    expect((await call(app, 'GET', `/api/v1/dashboard/timeline/${f.otherClientId}`, { as: assignedStaff })).status).toBe(404);
    expect((await call(app, 'GET', `/api/v1/dashboard/timeline/${randomUUID()}`, { as: f.owner.userId })).status).toBe(404);
    expect((await call(app, 'GET', '/api/v1/dashboard/timeline/not-a-uuid', { as: f.owner.userId })).status).toBe(400);
  });
});
