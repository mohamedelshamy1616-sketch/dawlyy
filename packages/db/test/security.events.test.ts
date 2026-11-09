import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, withUserTx, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership } from './factories';
import { as, svc, q, one, expectCode, expectGuard, expectPrivilege, expectRls, expectNoEffect, serviceRow, serviceRowWhere } from './helpers';

beforeAll(async () => { await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
const tables = ['calendar_events', 'form_submissions', 'consents', 'tasks', 'ai_requests', 'notifications', 'notification_deliveries', 'push_subscriptions', 'idempotency_keys', 'job_runs', 'audit_log', 'events'] as const;
async function snapshot(f: Fixture): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    for (const table of tables) result.push(await one(tx, sql`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text as rows
      from ${sql.identifier(table)} t where tenant_id in (${f.t1}::uuid, ${f.t2}::uuid)`));
    return result;
  }, f.t1);
}
async function refused(f: Fixture, work: () => Promise<unknown>, layer: string, table?: string, column?: string, code?: string): Promise<void> {
  const before = await snapshot(f);
  if (layer === 'rls') await expectRls(work);
  else if (layer === 'privilege') { const error = await expectPrivilege(work); if (table) expect(error.message).toContain('table ' + table); }
  else if (layer.startsWith('check:')) { const error = await expectCode(work, '23514'); expect(error.constraint_name).toBe(layer.slice(6)); }
  else if (code === '23503' || code === '22023' || code === 'P0002') {
    const error = await expectCode(work, code); expect(error.detail).toBe(layer); if (table) expect(error.table_name).toBe(table); if (column) expect(error.column_name).toBe(column);
  } else { const error = await expectGuard(work, layer, column); if (table) expect(error.table_name).toBe(table); if (code) expect(error.code).toBe(code); }
  expect(await snapshot(f)).toEqual(before);
}
function insert(table: string, f: Fixture, id: string, extra: Record<string, SQL> = {}): SQL {
  const base: Record<string, SQL> = { id: sql`${id}::uuid`, tenant_id: sql`${f.t1}::uuid` };
  const defaults: Record<string, Record<string, SQL>> = {
    calendar_events: { client_id: sql`${f.clientA}::uuid`, type: sql`'checkin'`, source: sql`'manual'`, state: sql`'scheduled'`, due_at: sql`now()`, local_date: sql`current_date`, timezone: sql`'Africa/Cairo'` },
    form_submissions: { client_id: sql`${f.clientA}::uuid`, form_id: sql`${f.templateForm}::uuid`, form_version_id: sql`${f.templateFormPub}::uuid`, form_kind: sql`'checkin'`, client_uuid: sql`${randomUUID()}::uuid` },
    consents: { user_id: sql`${f.ua.userId}::uuid`, kind: sql`'terms'`, version: sql`${id}`, locale: sql`'en'` },
    tasks: { client_id: sql`${f.clientA}::uuid`, title: sql`'private task'` },
    ai_requests: { client_id: sql`${f.clientA}::uuid`, kind: sql`'program'`, input: sql`'{}'::jsonb`, created_by: sql`${f.s2.userId}::uuid` },
    push_subscriptions: { user_id: sql`${f.ua.userId}::uuid`, endpoint: sql`${'https://push.example.test/' + id}`, keys: sql`'{"p256dh":"p","auth":"a"}'::jsonb` },
  };
  const values = { ...base, ...defaults[table], ...extra };
  return sql`insert into ${sql.identifier(table)} (${sql.join(Object.keys(values).map(sql.identifier), sql`, `)}) values (${sql.join(Object.values(values), sql`, `)}) returning *`;
}
async function privateRow(table: string, f: Fixture, extra: Record<string, SQL> = {}): Promise<string> {
  const id = randomUUID(); await svc((tx) => q(tx, insert(table, f, id, extra)), f.t1); return id;
}
async function linked(f: Fixture, due: SQL = sql`now() - interval '1 day'`): Promise<{ event: string; submission: string }> {
  const event = await privateRow('calendar_events', f, { due_at: due });
  const submission = await privateRow('form_submissions', f, { state: sql`'scheduled'`, calendar_event_id: sql`${event}::uuid` });
  return { event, submission };
}
async function advance(actor: AuthContext, submission: string): Promise<boolean> {
  return as(actor, async (tx) => (await one<{ moved: boolean }>(tx, sql`select app.advance_due(${submission}::uuid) as moved`)).moved);
}
async function dueControl(f: Fixture): Promise<void> {
  const pair = await linked(f); expect(await advance(f.ua, pair.submission)).toBe(true);
  expect(await serviceRow('calendar_events', pair.event)).toMatchObject({ state: 'due' }); expect(await serviceRow('form_submissions', pair.submission)).toMatchObject({ state: 'due' });
}
async function register(actor: AuthContext, endpoint: string, keys: unknown = { p256dh: 'p', auth: 'a' }, ua = 'ua'): Promise<string> {
  return as(actor, async (tx) => (await one<{ id: string }>(tx, sql`select app.register_push(${endpoint}, ${JSON.stringify(keys)}::jsonb, ${ua}) as id`)).id);
}
async function keysEdit(actor: AuthContext, id: string): Promise<void> {
  await as(actor, (tx) => q(tx, sql`update push_subscriptions set keys = '{"p256dh":"allowed","auth":"a"}', user_agent = 'allowed' where id = ${id}`));
  expect(await serviceRow('push_subscriptions', id)).toMatchObject({ keys: { p256dh: 'allowed', auth: 'a' }, user_agent: 'allowed' });
}
function signal<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
async function blocked(pid: number, holder: number): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await svc((tx) => one<{ blocked: boolean }>(tx, sql`select ${holder}::int = any(pg_blocking_pids(${pid}::int)) as blocked`))).blocked) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('expected contender to wait on the documented lock');
}

describe('calendar, forms, consent, AI and personal rows (§13.4 E)', () => {
  for (const old of ['scheduled', 'due', 'overdue'] as const) for (const target of ['completed', 'skipped'] as const) it(`E01 calendar_events ua UPDATE state ${old}→${target}`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('calendar_events', f, { state: sql`${old}` });
    await as(f.ua, async (tx) => { await q(tx, sql`update calendar_events set state = ${target} where id = ${id}`);
      expect(await one(tx, sql`select state::text, completed_at = now() as completed, skipped_at = now() as skipped, cancelled_at from calendar_events where id = ${id}`))
        .toEqual({ state: target, completed: target === 'completed' ? true : null, skipped: target === 'skipped' ? true : null, cancelled_at: null }); });
  });
  for (const column of ['due_at', 'payload', 'source'] as const) it(`E01 calendar_events ua UPDATE ${column} due/client restriction`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('calendar_events', f, { state: sql`'due'` });
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update calendar_events set ${sql.identifier(column)} = ${column === 'due_at' ? sql`now() + interval '1 day'` : column === 'payload' ? sql`'{"forged":true}'::jsonb` : sql`'automation'`} where id = ${id}`)), column === 'source' ? 'immutable' : 'client_update', 'calendar_events', column);
    await as(f.ua, (tx) => q(tx, sql`update calendar_events set state = 'completed' where id = ${id}`)); expect(await serviceRow('calendar_events', id)).toMatchObject({ state: 'completed' });
  });
  it('E01 calendar_events ua INSERT RLS and UPDATE B invisible', async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); await refused(f, () => as(f.ua, (tx) => q(tx, insert('calendar_events', f, id))), 'rls');
    await as(f.ua, (tx) => q(tx, sql`update calendar_events set state = 'completed' where id = ${f.eventA}`)); expect(await serviceRow('calendar_events', f.eventA)).toMatchObject({ state: 'completed' });
    await expectNoEffect(f.ua, sql`update calendar_events set state = 'completed' where id = ${f.eventB}`, 'calendar_events', sql`id = ${f.eventB}`);
    const own = await privateRow('calendar_events', f, { state: sql`'due'` }); await as(f.ua, (tx) => q(tx, sql`update calendar_events set state = 'skipped' where id = ${own}`)); expect(await serviceRow('calendar_events', own)).toMatchObject({ state: 'skipped' });
  });
  for (const [column, value, label] of [['source', sql`'package_rule'`, 'package_rule'], ['source', sql`'automation'`, 'automation'], ['rule_key', sql`'rule'`, 'rule']] as const) it(`E02 calendar_events s1 INSERT ${column} ${label}`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); await refused(f, () => as(f.s1, (tx) => q(tx, insert('calendar_events', f, id, { [column]: value }))), 'insert_eq', 'calendar_events', column);
    await as(f.s1, (tx) => q(tx, insert('calendar_events', f, id))); expect(await serviceRow('calendar_events', id)).toMatchObject({ source: 'manual', rule_key: null, created_by: f.s1.userId });
  });
  for (const missing of ['rule_key', 'subscription_id'] as const) it(`E02 calendar_events svc INSERT package_rule missing ${missing}`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); const fields = { source: sql`'package_rule'`, rule_key: sql`'rule'`, subscription_id: sql`${f.subA}::uuid` };
    await refused(f, () => svc((tx) => q(tx, insert('calendar_events', f, id, { ...fields, [missing]: sql`null` })), f.t1), 'check:calendar_events_rule_ck');
    await svc((tx) => q(tx, insert('calendar_events', f, id, fields)), f.t1); expect(await serviceRow('calendar_events', id)).toMatchObject({ source: 'package_rule', rule_key: 'rule', subscription_id: f.subA });
  });
  for (const old of ['completed', 'skipped', 'cancelled'] as const) for (const state of ['scheduled', 'due', 'overdue'] as const) it(`E02 calendar_events s1 UPDATE state ${old}→${state} clears stamps`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('calendar_events', f, { state: sql`${old}`, completed_at: sql`now()`, skipped_at: sql`now()`, cancelled_at: sql`now()` });
    await as(f.s1, (tx) => q(tx, sql`update calendar_events set state = ${state} where id = ${id}`)); expect(await serviceRow('calendar_events', id)).toMatchObject({ state, completed_at: null, skipped_at: null, cancelled_at: null });
  });
  it('E03 form_submissions ua UPDATE answers/missing_required/client_updated_at due/submitted', async () => {
    const f = await buildPrivateFixture(), id = await privateRow('form_submissions', f);
    await as(f.ua, (tx) => q(tx, sql`update form_submissions set answers = '{"q":"answer"}', missing_required = array['other'], client_updated_at = '2026-01-01T00:00:00Z' where id = ${id}`));
    expect(await serviceRow('form_submissions', id)).toMatchObject({ answers: { q: 'answer' }, missing_required: ['other'], client_updated_at: new Date('2026-01-01T00:00:00Z') });
    await as(f.ua, (tx) => q(tx, sql`update form_submissions set state = 'submitted' where id = ${id}`));
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update form_submissions set answers = '{"q":"changed"}' where id = ${id}`)), 'editable_in', 'form_submissions', 'answers');
    const due = await privateRow('form_submissions', f); await as(f.ua, (tx) => q(tx, sql`update form_submissions set answers = '{"q":"changed"}' where id = ${due}`)); expect(await serviceRow('form_submissions', due)).toMatchObject({ answers: { q: 'changed' } });
  });
  for (const column of ['coach_feedback', 'results'] as const) for (const operation of ['insert', 'update'] as const) it(`E03 form_submissions ua ${operation.toUpperCase()} ${column} due`, async () => {
    const f = await buildPrivateFixture(), id = operation === 'insert' ? randomUUID() : await privateRow('form_submissions', f), value = column === 'results' ? sql`'{"score":5}'::jsonb` : sql`'feedback'`;
    await refused(f, () => as(f.ua, (tx) => q(tx, operation === 'insert' ? insert('form_submissions', f, id, { [column]: value }) : sql`update form_submissions set ${sql.identifier(column)} = ${value} where id = ${id}`)), operation === 'insert' ? 'client_insert_eq' : 'client_update', 'form_submissions', column);
    if (operation === 'insert') await as(f.ua, (tx) => q(tx, insert('form_submissions', f, id)));
    await as(f.ua, (tx) => q(tx, sql`update form_submissions set answers = '{"allowed":true}' where id = ${id}`)); expect(await serviceRow('form_submissions', id)).toMatchObject({ answers: { allowed: true } });
    await as(f.s2, (tx) => q(tx, sql`update form_submissions set ${sql.identifier(column)} = ${value} where id = ${id}`)); expect(await serviceRow('form_submissions', id)).toMatchObject({ [column]: column === 'results' ? { score: 5 } : 'feedback' });
  });
  for (const column of ['id', 'form_id', 'form_version_id', 'calendar_event_id', 'subscription_id', 'client_uuid', 'submitted_at', 'reviewed_at', 'reviewed_by']) for (const who of ['ua', 's2'] as const) it(`E04 form_submissions ${who} UPDATE ${column} due identity/server stamp`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('form_submissions', f), value = column.endsWith('_at') ? sql`now()` : sql`${randomUUID()}::uuid`;
    await refused(f, () => as(f[who], (tx) => q(tx, sql`update form_submissions set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'immutable', 'form_submissions', column);
    await as(f[who], async (tx) => { await q(tx, sql`update form_submissions set state = 'submitted' where id = ${id}`); expect(await one(tx, sql`select submitted_at = now() as stamped from form_submissions where id = ${id}`)).toEqual({ stamped: true }); });
    await as(f.s2, async (tx) => { await q(tx, sql`update form_submissions set state = 'reviewed' where id = ${id}`); expect(await one(tx, sql`select reviewed_at = now() as stamped, reviewed_by from form_submissions where id = ${id}`)).toEqual({ stamped: true, reviewed_by: f.s2.userId }); });
  });
  for (const column of ['submitted_at', 'reviewed_at', 'reviewed_by']) it(`E04 form_submissions ua INSERT ${column} forged`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); await refused(f, () => as(f.ua, (tx) => q(tx, insert('form_submissions', f, id, { [column]: column === 'reviewed_by' ? sql`${f.ua.userId}::uuid` : sql`now()` }))), 'insert_eq', 'form_submissions', column);
    await as(f.ua, (tx) => q(tx, insert('form_submissions', f, id))); expect(await serviceRow('form_submissions', id)).toMatchObject({ submitted_at: null, reviewed_at: null, reviewed_by: null });
  });
  for (const boundary of ['past', 'now'] as const) it(`E05 form_submissions/calendar_events ua UPDATE scheduled→submitted due_at ${boundary}`, async () => {
    const f = await buildPrivateFixture(), pair = await linked(f);
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update form_submissions set state = 'submitted' where id = ${pair.submission}`)), 'transitions', 'form_submissions', 'state');
    await as(f.ua, async (tx) => {
      // Pin the event to this runtime transaction's exact clock using an independent service connection.
      if (boundary === 'now') {
        const clock = await one<{ time: string }>(tx, sql`select now()::text as time`);
        await svc((service) => q(service, sql`update calendar_events set due_at = ${clock.time}::timestamptz where tenant_id = ${f.t1} and id = ${pair.event}`), f.t1);
        expect(await one(tx, sql`select due_at = now() as boundary from calendar_events where id = ${pair.event}`)).toEqual({ boundary: true });
      }
      expect(await one(tx, sql`select app.advance_due(${pair.submission}::uuid) as moved`)).toEqual({ moved: true });
      expect(await one(tx, sql`select state::text from calendar_events where id = ${pair.event}`)).toEqual({ state: 'due' });
      await q(tx, sql`update form_submissions set state = 'submitted' where id = ${pair.submission}`);
      expect(await one(tx, sql`select state::text, submitted_at = now() as stamped from form_submissions where id = ${pair.submission}`)).toEqual({ state: 'submitted', stamped: true });
      expect(await one(tx, sql`select app.advance_due(${pair.submission}::uuid) as moved`)).toEqual({ moved: false });
    });
  });
  for (const target of ['B', 'missing', 'future', 'no-link', 'unpinned'] as const) it(`E06 advance_due ua EXECUTE ${target} scheduled`, async () => {
    const f = await buildPrivateFixture(), pair = await linked(f, target === 'future' ? sql`now() + interval '1 day'` : sql`now() - interval '1 day'`);
    let id = pair.submission;
    if (target === 'B') id = await privateRow('form_submissions', f, { client_id: sql`${f.clientB}::uuid`, state: sql`'scheduled'` });
    if (target === 'no-link') id = await privateRow('form_submissions', f, { state: sql`'scheduled'` });
    if (target === 'missing') id = randomUUID();
    if (target === 'B' || target === 'missing') await refused(f, () => advance(f.ua, id), 'rule:app.advance_due', 'form_submissions', 'id', 'P0002');
    else if (target === 'unpinned') await refused(f, () => withUserTx(f.ua.userId, (tx) => q(tx, sql`select app.advance_due(${id}::uuid)`)), 'rule:app.advance_due', undefined, undefined, '42501');
    else { const before = await snapshot(f); expect(await advance(f.ua, id)).toBe(false); expect(await snapshot(f)).toEqual(before); await refused(f, () => as(f.ua, (tx) => q(tx, sql`update form_submissions set state = 'submitted' where id = ${id}`)), 'transitions', 'form_submissions', 'state'); }
    await dueControl(f);
  });
  for (const column of ['accepted', 'accepted_at', 'kind', 'version', 'locale', 'user_id'] as const) it(`E07 consents ua UPDATE ${column} append-only`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('consents', f);
    const value = column === 'accepted' ? sql`false` : column === 'accepted_at' ? sql`now() + interval '1 day'` : column === 'user_id' ? sql`${f.ub.userId}::uuid` : column === 'kind' ? sql`'privacy'` : sql`'changed'`;
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update consents set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'update_allow', 'consents', column);
    await as(f.ua, async (tx) => { expect(await one(tx, sql`update consents set withdrawn_at = '2099-01-01' where id = ${id} returning withdrawn_at = now() as stamped`)).toEqual({ stamped: true }); });
  });
  it('E07 consents ua INSERT accepted/withdrawal stamps and staff withdrawal invisible', async () => {
    const f = await buildPrivateFixture(), id = randomUUID();
    await refused(f, () => as(f.ua, (tx) => q(tx, insert('consents', f, id, { withdrawn_at: sql`now()` }))), 'insert_eq', 'consents', 'withdrawn_at');
    await as(f.ua, async (tx) => { await q(tx, insert('consents', f, id, { accepted_at: sql`'2001-01-01'::timestamptz` })); expect(await one(tx, sql`select accepted_at = now() as stamped, withdrawn_at from consents where id = ${id}`)).toEqual({ stamped: true, withdrawn_at: null }); });
    await expectNoEffect(f.s1, sql`update consents set withdrawn_at = now() where id = ${id}`, 'consents', sql`id = ${id}`); expect(await as(f.s1, (tx) => q(tx, sql`select id from consents where id = ${f.consentS1}`))).toEqual([{ id: f.consentS1 }]);
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`delete from consents where id = ${id}`)), 'privilege', 'consents'); expect(await as(f.ua, (tx) => q(tx, sql`select id from consents where id = ${id}`))).toEqual([{ id }]);
  });
  for (const column of ['source', 'source_event_id', 'dedupe_key', 'completed_at', 'completed_by']) it(`E08 tasks s1 INSERT ${column} server-only`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), value = column === 'source' ? sql`'automation'` : column === 'source_event_id' ? sql`5000000000` : column === 'dedupe_key' ? sql`'forged'` : column === 'completed_at' ? sql`now()` : sql`${f.s1.userId}::uuid`;
    await refused(f, () => as(f.s1, (tx) => q(tx, insert('tasks', f, id, { [column]: value }))), 'insert_eq', 'tasks', column);
    await as(f.s1, (tx) => q(tx, insert('tasks', f, id))); expect(await serviceRow('tasks', id)).toMatchObject({ source: 'manual', source_event_id: null, dedupe_key: null, completed_at: null, completed_by: null, created_by: f.s1.userId });
    await refused(f, () => as(f.s1, (tx) => q(tx, sql`update tasks set client_id = null where id = ${id}`)), 'immutable', 'tasks', 'client_id');
    await as(f.s1, (tx) => q(tx, sql`update tasks set title = 'allowed', state = 'done' where id = ${id}`)); expect(await serviceRow('tasks', id)).toMatchObject({ title: 'allowed', completed_by: f.s1.userId });
    await as(f.s1, (tx) => q(tx, sql`update tasks set state = 'open' where id = ${id}`)); expect(await serviceRow('tasks', id)).toMatchObject({ state: 'open', completed_at: null, completed_by: null });
  });
  for (const who of ['s2', 'svc'] as const) for (const operation of ['insert', 'update'] as const) for (const invalid of ['disabled', 'client', 'foreign'] as const) it(`E09 tasks ${who} ${operation.toUpperCase()} assignee_membership_id ${invalid}`, async () => {
    const f = await buildPrivateFixture(), id = operation === 'insert' ? randomUUID() : await privateRow('tasks', f), membership = invalid === 'disabled' ? f.sx.membershipId : invalid === 'client' ? f.ua.membershipId : f.o2.membershipId;
    const run = <T>(fn: (tx: Tx) => Promise<T>) => who === 'svc' ? svc(fn, f.t1) : as(f.s2, fn);
    await refused(f, () => run((tx) => q(tx, operation === 'insert' ? insert('tasks', f, id, { assignee_membership_id: sql`${membership}::uuid` }) : sql`update tasks set assignee_membership_id = ${membership} where id = ${id}`)), 'rule:app.task_assignee_check', 'tasks', 'assignee_membership_id', '23503');
    const assigned = await mkMembership(invalid === 'client' ? f.o1 : f.s2); await run((tx) => q(tx, operation === 'insert' ? insert('tasks', f, id, { assignee_membership_id: sql`${assigned.membershipId}::uuid` }) : sql`update tasks set assignee_membership_id = ${assigned.membershipId} where id = ${id}`));
    expect(await serviceRow('tasks', id)).toMatchObject({ assignee_membership_id: assigned.membershipId });
    await svc((tx) => q(tx, sql`update memberships set status = 'disabled' where tenant_id = ${f.t1} and id = ${assigned.membershipId}`), f.t1);
    await run((tx) => q(tx, sql`update tasks set title = 'allowed', assignee_membership_id = assignee_membership_id where id = ${id}`)); expect(await serviceRow('tasks', id)).toMatchObject({ title: 'allowed', assignee_membership_id: assigned.membershipId });
  });
  for (const initial of ['approved', 'rejected'] as const) it(`E10 ai_requests s2 INSERT state ${initial}/draft then publish permission`, async () => {
    const f = await buildPrivateFixture(), actor = await mkMembership(f.s2), id = randomUUID();
    await refused(f, () => as(actor, (tx) => q(tx, insert('ai_requests', f, id, { state: sql`${initial}` }))), 'transitions', 'ai_requests', 'state');
    await as(actor, (tx) => q(tx, insert('ai_requests', f, id))); expect(await serviceRow('ai_requests', id)).toMatchObject({ state: 'draft', created_by: actor.userId, approved_at: null, approved_by: null });
    await refused(f, () => as(actor, (tx) => q(tx, sql`update ai_requests set state = 'approved' where id = ${id}`)), 'perm_transitions', 'ai_requests', 'state');
    await svc((tx) => q(tx, sql`update memberships set permissions = '{"client_scope":"all","modules":{"ai":["publish"]}}' where tenant_id = ${f.t1} and id = ${actor.membershipId}`), f.t1);
    await as(actor, async (tx) => { await q(tx, sql`update ai_requests set state = 'approved' where id = ${id}`); expect(await one(tx, sql`select approved_at = now() as stamped, approved_by from ai_requests where id = ${id}`)).toEqual({ stamped: true, approved_by: actor.userId }); });
    await refused(f, () => as(actor, (tx) => q(tx, sql`delete from ai_requests where id = ${id}`)), 'privilege', 'ai_requests'); expect(await as(actor, (tx) => q(tx, sql`select id from ai_requests where id = ${id}`))).toEqual([{ id }]);
  });
  for (const state of ['approved', 'rejected'] as const) for (const column of ['output', 'model'] as const) it(`E10 ai_requests s2 UPDATE ${column} ${state}/draft`, async () => {
    const f = await buildPrivateFixture(), id = await privateRow('ai_requests', f, { state: sql`${state}` }), value = column === 'output' ? sql`'{"allowed":true}'::jsonb` : sql`'model-v1'`;
    await refused(f, () => as(f.s2, (tx) => q(tx, sql`update ai_requests set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'editable_in', 'ai_requests', column);
    const draft = await privateRow('ai_requests', f); await as(f.s2, (tx) => q(tx, sql`update ai_requests set ${sql.identifier(column)} = ${value} where id = ${draft}`)); expect(await serviceRow('ai_requests', draft)).toMatchObject({ [column]: column === 'output' ? { allowed: true } : 'model-v1' });
  });
  it('E11 notifications ua SELECT/UPDATE/DELETE other user invisible; own read time exact', async () => {
    const f = await buildPrivateFixture(); expect(await as(f.ua, (tx) => q(tx, sql`select id from notifications where id = ${f.notifB}`))).toEqual([]);
    for (const statement of [sql`update notifications set read_at = now() where id = ${f.notifB}`, sql`delete from notifications where id = ${f.notifB}`]) { await expectNoEffect(f.ua, statement, 'notifications', sql`id = ${f.notifB}`); await as(f.ua, (tx) => q(tx, sql`update notifications set read_at = '2026-01-01T00:00:00Z' where id = ${f.notifA}`)); expect(await serviceRow('notifications', f.notifA)).toMatchObject({ read_at: new Date('2026-01-01T00:00:00Z') }); }
    expect(await as(f.ua, (tx) => q(tx, sql`select id from notification_deliveries`))).toEqual([{ id: f.deliveryA }]);
  });
  for (const column of ['title', 'payload', 'user_id', 'client_id'] as const) it(`E11 notifications ua UPDATE ${column} own`, async () => {
    const f = await buildPrivateFixture(), value = column === 'title' || column === 'payload' ? sql`'{"en":"forged"}'::jsonb` : sql`${randomUUID()}::uuid`;
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update notifications set ${sql.identifier(column)} = ${value} where id = ${f.notifA}`)), 'update_allow', 'notifications', column);
    await as(f.ua, (tx) => q(tx, sql`update notifications set read_at = '2026-01-01T00:00:00Z' where id = ${f.notifA}`)); expect(await serviceRow('notifications', f.notifA)).toMatchObject({ read_at: new Date('2026-01-01T00:00:00Z') });
  });
  for (const [table, operation] of [['notifications', 'insert'], ['notification_deliveries', 'insert'], ['notification_deliveries', 'update'], ['notification_deliveries', 'delete']] as const) it(`E11 ${table} ua ${operation.toUpperCase()} service-only write`, async () => {
    const f = await buildPrivateFixture(); const statement = operation === 'insert' ? table === 'notifications' ? sql`insert into notifications (tenant_id, user_id, type, title) values (${f.t1}, ${f.ua.userId}, 'private', '{}')` : sql`insert into notification_deliveries (tenant_id, notification_id, user_id, channel) values (${f.t1}, ${f.notifA}, ${f.ua.userId}, 'inapp')` : operation === 'update' ? sql`update notification_deliveries set attempts = 1 where id = ${f.deliveryA}` : sql`delete from notification_deliveries where id = ${f.deliveryA}`;
    await refused(f, () => as(f.ua, (tx) => q(tx, statement)), 'privilege', table); await as(f.ua, (tx) => q(tx, sql`update notifications set read_at = '2026-01-01T00:00:00Z' where id = ${f.notifA}`)); expect(await serviceRow('notifications', f.notifA)).toMatchObject({ read_at: new Date('2026-01-01T00:00:00Z') });
  });
  it('E12 idempotency_keys ua/ub/o1 INSERT/SELECT/UPDATE/DELETE composite self key', async () => {
    const f = await buildPrivateFixture(), key = randomUUID(); const create = (user: string) => sql`insert into idempotency_keys (tenant_id, user_id, key, request_hash, status_code, response_body) values (${f.t1}, ${user}, ${key}, 'hash', 201, '{"id":"response"}')`;
    await refused(f, () => as(f.ua, (tx) => q(tx, create(f.ub.userId))), 'rls'); await as(f.ua, (tx) => q(tx, create(f.ua.userId)));
    expect(await serviceRowWhere('idempotency_keys', sql`tenant_id = ${f.t1} and user_id = ${f.ua.userId} and key = ${key}`)).toMatchObject([{ key, request_hash: 'hash', status_code: 201, response_body: { id: 'response' } }]);
    for (const actor of [f.ub, f.o1]) { expect(await as(actor, (tx) => q(tx, sql`select * from idempotency_keys where key = ${key}`))).toEqual([]); await expectNoEffect(actor, sql`delete from idempotency_keys where key = ${key}`, 'idempotency_keys', sql`tenant_id = ${f.t1} and user_id = ${f.ua.userId} and key = ${key}`); const own = randomUUID(); await as(actor, (tx) => q(tx, sql`insert into idempotency_keys (tenant_id, user_id, key, request_hash, status_code) values (${f.t1}, ${actor.userId}, ${own}, 'own', 200)`)); expect(await as(actor, (tx) => q(tx, sql`select key from idempotency_keys where key = ${own}`))).toEqual([{ key: own }]); }
    await refused(f, () => as(f.ua, (tx) => q(tx, sql`update idempotency_keys set status_code = 200 where key = ${key}`)), 'privilege', 'idempotency_keys');
    expect(await as(f.ua, (tx) => q(tx, sql`delete from idempotency_keys where key = ${key} returning key`))).toEqual([{ key }]); expect(await serviceRowWhere('idempotency_keys', sql`tenant_id = ${f.t1} and user_id = ${f.ua.userId} and key = ${key}`)).toEqual([]);
  });
  it('E13 register_push ua EXECUTE valid/re-register keys/UA/reset failure', async () => {
    const f = await buildPrivateFixture(), endpoint = 'https://push.example.test/' + randomUUID(), id = await register(f.ua, endpoint);
    expect(id).toMatch(/^[0-9a-f-]{36}$/); expect(await serviceRow('push_subscriptions', id)).toMatchObject({ tenant_id: f.t1, user_id: f.ua.userId, endpoint, keys: { p256dh: 'p', auth: 'a' }, user_agent: 'ua' });
    await svc((tx) => q(tx, sql`update push_subscriptions set failed_at = now() where tenant_id = ${f.t1} and id = ${id}`), f.t1);
    expect(await register(f.ua, endpoint, { p256dh: 'new', auth: 'new' }, 'x'.repeat(600))).toBe(id); expect(await serviceRow('push_subscriptions', id)).toMatchObject({ keys: { p256dh: 'new', auth: 'new' }, user_agent: 'x'.repeat(512), failed_at: null });
  });
  for (const [label, endpoint, keys, column] of [ ['malformed', 'garbage', { p256dh: 'p', auth: 'a' }, 'endpoint'], ['http', 'http://push.example.test/e', { p256dh: 'p', auth: 'a' }, 'endpoint'], ['credentials', 'https://user@push.example.test/e', { p256dh: 'p', auth: 'a' }, 'endpoint'], ['long', 'https://push.example.test/' + 'x'.repeat(2048), { p256dh: 'p', auth: 'a' }, 'endpoint'], ['missing-keys', 'https://push.example.test/e', {}, 'keys'], ['array-keys', 'https://push.example.test/e', [], 'keys'], ['null-keys', 'https://push.example.test/e', null, 'keys'] ] as const) it(`E13 register_push ua EXECUTE ${label} invalid`, async () => {
    const f = await buildPrivateFixture(); await refused(f, () => register(f.ua, endpoint, keys), 'rule:app.register_push', 'push_subscriptions', column, '22023'); const id = await register(f.ua, 'https://push.example.test/' + randomUUID()); expect(await serviceRow('push_subscriptions', id)).toMatchObject({ user_id: f.ua.userId });
  });
  it('E13 register_push ua EXECUTE missing pin', async () => { const f = await buildPrivateFixture(); await refused(f, () => withUserTx(f.ua.userId, (tx) => q(tx, sql`select app.register_push('https://push.example.test/e', '{"p256dh":"p","auth":"a"}', 'ua')`)), 'rule:app.register_push', undefined, undefined, '42501'); expect(await serviceRow('push_subscriptions', await register(f.ua, 'https://push.example.test/' + randomUUID()))).toMatchObject({ user_id: f.ua.userId }); });
  it('E14 push_subscriptions ua/ub/o1/o1t2 REGISTER endpoint takeover/same-user cross-tenant', async () => {
    const f = await buildPrivateFixture(), endpoint = 'https://push.example.test/' + randomUUID(), unrelated = await register(f.ua, 'https://push.example.test/' + randomUUID()), old = await register(f.ua, endpoint);
    const before = await snapshot(f);
    await expectRls(() => as(f.ub, (tx) => q(tx, sql`insert into push_subscriptions (tenant_id, user_id, endpoint, keys) values (${f.t1}, ${f.ub.userId}, ${endpoint}, '{"p256dh":"b","auth":"b"}') on conflict (tenant_id, endpoint) do update set user_id = excluded.user_id, keys = excluded.keys`)));
    expect(await snapshot(f)).toEqual(before);
    const taken = await register(f.ub, endpoint); expect(await serviceRow('push_subscriptions', old)).toBeUndefined(); expect(await serviceRow('push_subscriptions', taken)).toMatchObject({ user_id: f.ub.userId, tenant_id: f.t1 }); expect(await serviceRow('push_subscriptions', unrelated)).toMatchObject({ user_id: f.ua.userId });
    const shared = 'https://push.example.test/' + randomUUID(), a = await register(f.o1, shared), b = await register(f.o1t2, shared);
    for (const [actor, id] of [[f.o1, a], [f.o1t2, b]] as const) expect(await as(actor, (tx) => q(tx, sql`select id from push_subscriptions where endpoint = ${shared}`))).toEqual([{ id }]);
  });
  for (const across of [false, true]) it(`E14 register_push ua/${across ? 'uc' : 'ub'} EXECUTE overlapping endpoint advisory lock`, async () => {
    const f = await buildPrivateFixture(), endpoint = 'https://push.example.test/' + randomUUID(), secondActor = across ? f.uc : f.ub, held = signal<number>(), ready = signal<number>(), release = signal<void>();
    const first = as(f.ua, async (tx) => { await q(tx, sql`select app.register_push(${endpoint}, '{"p256dh":"first","auth":"a"}', 'first')`); held.resolve((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid); await release.promise; });
    let second: Promise<unknown> | undefined;
    try { const holder = await Promise.race([held.promise, first.then(() => { throw new Error('holder ended early'); })]); second = as(secondActor, async (tx) => { ready.resolve((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid); return q(tx, sql`select app.register_push(${endpoint}, '{"p256dh":"last","auth":"a"}', 'last')`); }); const finished = Promise.allSettled([second]); await blocked(await ready.promise, holder); release.resolve(); await first; expect((await finished)[0]?.status).toBe('fulfilled'); }
    finally { release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
    expect(await svc((tx) => q(tx, sql`select tenant_id, user_id, keys from push_subscriptions where endpoint = ${endpoint}`))).toEqual([{ tenant_id: secondActor.tenantId, user_id: secondActor.userId, keys: { p256dh: 'last', auth: 'a' } }]);
  });
  for (const caseId of ['E15', 'E18'] as const) for (const who of (caseId === 'E18' ? ['ua', 's2', 'o1'] : ['ua']) as readonly ('ua' | 's2' | 'o1')[]) for (const column of (caseId === 'E18' ? ['last_used_at', 'failed_at'] : ['id', 'tenant_id', 'user_id', 'endpoint', 'created_at', 'last_used_at', 'failed_at'])) it(`${caseId} push_subscriptions ${who} UPDATE ${column} own`, async () => {
    const f = await buildPrivateFixture(), actor = f[who], endpoint = 'https://push.example.test/' + randomUUID(), id = await register(actor, endpoint), value = column.endsWith('_at') ? sql`now()` : column === 'endpoint' ? sql`'https://push.example.test/changed'` : sql`${randomUUID()}::uuid`;
    await refused(f, () => as(actor, (tx) => q(tx, sql`update push_subscriptions set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'immutable', 'push_subscriptions', column); await keysEdit(actor, id);
    if (column === 'last_used_at' || column === 'failed_at') { await svc((tx) => q(tx, sql`update push_subscriptions set ${sql.identifier(column)} = '2026-01-01T00:00:00Z' where tenant_id = ${f.t1} and id = ${id}`), f.t1); expect(await serviceRow('push_subscriptions', id)).toMatchObject({ [column]: new Date('2026-01-01T00:00:00Z') }); expect(await register(actor, endpoint)).toBe(id); if (column === 'failed_at') expect(await serviceRow('push_subscriptions', id)).toMatchObject({ failed_at: null }); }
  });
  for (const caseId of ['E15', 'E18'] as const) for (const who of (caseId === 'E18' ? ['ua', 's2', 'o1'] : ['ua']) as readonly ('ua' | 's2' | 'o1')[]) for (const column of ['last_used_at', 'failed_at']) it(`${caseId} push_subscriptions ${who} INSERT ${column} non-null`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), actor = f[who]; await refused(f, () => as(actor, (tx) => q(tx, insert('push_subscriptions', f, id, { user_id: sql`${actor.userId}::uuid`, [column]: sql`now()` }))), 'insert_eq', 'push_subscriptions', column);
    await as(actor, (tx) => q(tx, insert('push_subscriptions', f, id, { user_id: sql`${actor.userId}::uuid` }))); expect(await serviceRow('push_subscriptions', id)).toMatchObject({ last_used_at: null, failed_at: null }); await keysEdit(actor, id);
  });
  it('E15 push_subscriptions ua INSERT other user/http and UPDATE/DELETE invisible', async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); await refused(f, () => as(f.ua, (tx) => q(tx, insert('push_subscriptions', f, id, { user_id: sql`${f.ub.userId}::uuid` }))), 'rls'); await as(f.ua, (tx) => q(tx, insert('push_subscriptions', f, id))); await keysEdit(f.ua, id);
    const http = randomUUID(); await refused(f, () => as(f.ua, (tx) => q(tx, insert('push_subscriptions', f, http, { endpoint: sql`'http://push.example.test/e'` }))), 'check:push_subscriptions_endpoint_ck'); await as(f.ua, (tx) => q(tx, insert('push_subscriptions', f, http))); await keysEdit(f.ua, http);
    for (const statement of [sql`update push_subscriptions set user_agent = 'forged' where id = ${id}`, sql`delete from push_subscriptions where id = ${id}`]) { await expectNoEffect(f.ub, statement, 'push_subscriptions', sql`id = ${id}`); const own = await register(f.ub, 'https://push.example.test/' + randomUUID()); await keysEdit(f.ub, own); }
    expect(await as(f.ua, (tx) => q(tx, sql`delete from push_subscriptions where id = ${id} returning id`))).toEqual([{ id }]); expect(await serviceRow('push_subscriptions', http)).toMatchObject({ user_id: f.ua.userId });
  });
  for (const who of ['s1', 's2', 'o1', 'ua', 'o2'] as const) for (const operation of ['insert', 'update', 'delete'] as const) it(`E16 job_runs ${who} ${operation.toUpperCase()}/SELECT tenant/global`, async () => {
    const f = await buildPrivateFixture(), a = randomUUID(), b = randomUUID(), global = randomUUID(); await svc((tx) => q(tx, sql`insert into job_runs (id, tenant_id, job) values (${a}, ${f.t1}, 'a'), (${b}, ${f.t2}, 'b'), (${global}, null, 'global')`));
    const expected = who === 'ua' ? [] : who === 'o2' ? [{ id: b }] : [{ id: a }]; expect(await as(f[who], (tx) => q(tx, sql`select id from job_runs`))).toEqual(expected);
    await refused(f, () => as(f[who], (tx) => q(tx, operation === 'insert' ? sql`insert into job_runs (tenant_id, job) values (${f[who].tenantId}, 'forged')` : operation === 'update' ? sql`update job_runs set attempts = 2 where id = ${a}` : sql`delete from job_runs where id = ${a}`)), 'privilege', 'job_runs'); expect(await as(f[who], (tx) => q(tx, sql`select id from tenants`))).toEqual([{ id: f[who].tenantId }]);
  });
  for (const scenario of ['submitted', 'cancelled', 'future'] as const) it(`E17 advance_due ua EXECUTE waits for submission/event ${scenario} committed state`, async () => {
    const f = await buildPrivateFixture(), pair = await linked(f), held = signal<number>(), ready = signal<number>(), release = signal<void>();
    const writer = svc(async (tx) => {
      await q(tx, sql`select id from form_submissions where tenant_id = ${f.t1} and id = ${pair.submission} for update`);
      await q(tx, sql`select id from calendar_events where tenant_id = ${f.t1} and id = ${pair.event} for update`);
      if (scenario === 'future') await q(tx, sql`update calendar_events set due_at = now() + interval '1 day' where tenant_id = ${f.t1} and id = ${pair.event}`);
      else { await q(tx, sql`update form_submissions set state = ${scenario} where tenant_id = ${f.t1} and id = ${pair.submission}`); await q(tx, sql`update calendar_events set state = ${scenario === 'submitted' ? 'completed' : 'cancelled'} where tenant_id = ${f.t1} and id = ${pair.event}`); }
      held.resolve((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid); await release.promise;
    }, f.t1);
    let reader: Promise<unknown> | undefined;
    try { const holder = await Promise.race([held.promise, writer.then(() => { throw new Error('writer ended early'); })]); reader = as(f.ua, async (tx) => { ready.resolve((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid); return one(tx, sql`select app.advance_due(${pair.submission}::uuid) as moved`); }); const finished = Promise.allSettled([reader]); await blocked(await ready.promise, holder); release.resolve(); await writer; expect((await finished)[0]).toMatchObject({ status: 'fulfilled', value: { moved: false } }); }
    finally { release.resolve(); await Promise.allSettled([writer, ...(reader ? [reader] : [])]); }
    expect(await serviceRow('form_submissions', pair.submission)).toMatchObject({ state: scenario === 'future' ? 'scheduled' : scenario }); expect(await serviceRow('calendar_events', pair.event)).toMatchObject({ state: scenario === 'future' ? 'scheduled' : scenario === 'submitted' ? 'completed' : 'cancelled' }); await dueControl(f);
  });
});
