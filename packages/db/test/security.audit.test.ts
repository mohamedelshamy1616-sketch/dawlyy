import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, withUserTx, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkClient, mkMembership, mkPackage, mkPayment, mkSession, mkSubscription, mkTenant, mkVersion } from './factories';
import { as, svc, q, one, expectCode, expectGuard, expectPrivilege, serviceRow } from './helpers';

let fx: Fixture;
beforeAll(async () => { fx = await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
const families = [ ['program', 'programs', 'program_versions', 'program_id'], ['nutrition', 'nutrition_plans', 'nutrition_plan_versions', 'plan_id'], ['form', 'forms', 'form_versions', 'form_id'] ] as const;
async function snapshot(f: Fixture): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    for (const table of ['audit_log', 'events', 'payments', 'tenants', 'clients', 'memberships', 'subscriptions', 'programs', 'program_versions', 'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions', 'form_submissions', 'workout_sessions', 'conversations', 'messages', 'media', 'ai_requests']) result.push(await one(tx, sql`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text as rows from ${sql.identifier(table)} t
      where ${sql.identifier(table === 'tenants' ? 'id' : 'tenant_id')} in (${f.t1}::uuid, ${f.t2}::uuid)`));
    return result;
  }, f.t1);
}
async function rejected(f: Fixture, work: () => Promise<unknown>, rule: string, code = '42501'): Promise<void> {
  const before = await snapshot(f); const error = code === '42501' || code === 'P0001' ? await expectGuard(work, rule) : await expectCode(work, code);
  expect(error.code).toBe(code); expect(error.detail).toBe(rule); expect(await snapshot(f)).toEqual(before);
}
function audit(tx: Tx, action: string, entity: string, id: string, before: unknown = null, after: unknown = null, reason: string | null = null, request: string | null = null): Promise<unknown[]> {
  return q(tx, sql`select app.audit(${action}, ${entity}, ${id}, ${before === null ? sql`null` : sql`${JSON.stringify(before)}::jsonb`}, ${after === null ? sql`null` : sql`${JSON.stringify(after)}::jsonb`}, ${reason}, ${request})`);
}
async function emit(tx: Tx, type: string, entity: string, id: string, payload: unknown = {}): Promise<string> {
  return (await one<{ id: string }>(tx, sql`select app.emit_event(${type}, ${entity}, ${id}, ${JSON.stringify(payload)}::jsonb)::text as id`)).id;
}
async function semanticControl(actor: AuthContext, f: Fixture): Promise<void> {
  const request = randomUUID();
  if (actor.role === 'client') {
    const session = await mkSession(actor.tenantId, actor.clientId);
    await as(actor, (tx) => audit(tx, 'workout.complete', 'workout_sessions', session, null, { allowed: true }, 'allowed', request));
    expect(await svc((tx) => q(tx, sql`select actor_user_id, actor_role, client_id, after from audit_log where tenant_id = ${actor.tenantId} and request_id = ${request}`), actor.tenantId))
      .toEqual([{ actor_user_id: actor.userId, actor_role: 'client', client_id: actor.clientId, after: { allowed: true } }]);
  } else {
    const payment = actor.tenantId === f.t2 ? f.payC : f.payA;
    const id = await as(actor, (tx) => emit(tx, 'payment.verified', 'payments', payment));
    expect(await svc((tx) => one(tx, sql`select actor_user_id, actor_role, aggregate_id from events where tenant_id = ${actor.tenantId} and id = ${id}::bigint`), actor.tenantId))
      .toEqual({ actor_user_id: actor.userId, actor_role: actor.role, aggregate_id: payment });
  }
}
async function ownMessage(f: Fixture, client: 'A' | 'B' | 'internal' = 'A'): Promise<string> {
  const id = randomUUID(), actor = client === 'B' ? f.ub : client === 'internal' ? f.s1 : f.ua;
  await as(actor, (tx) => q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, body, client_uuid)
    values (${id}, ${f.t1}, ${client === 'B' ? f.convB : client === 'internal' ? f.convInternal : f.convA}, ${actor.userId}, ${actor.role}, 'private', ${randomUUID()})`)); return id;
}
async function rowJson(table: string, where: SQL, tenantId: string): Promise<Record<string, unknown> | null> {
  return svc(async (tx) => (await q<{ row: Record<string, unknown> }>(tx, sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where ${sql.identifier(table === 'tenants' ? 'id' : 'tenant_id')} = ${tenantId}::uuid and (${where})`))[0]?.row ?? null, tenantId);
}

describe('audit and transactional outbox (§7.8, §10)', () => {
  for (const who of ['ua', 's1', 'o1'] as const) for (const table of ['audit_log', 'events'] as const) for (const operation of ['insert', 'update', 'delete'] as const) it(`A01 ${table} ${who} ${operation.toUpperCase()} direct history write`, async () => {
    const f = await buildPrivateFixture();
    await svc((tx) => q(tx, sql`insert into events (tenant_id, type, aggregate, aggregate_id, client_id) values (${f.t1}, 'payment.verified', 'payments', ${f.payA}, ${f.clientA})`), f.t1);
    const before = await snapshot(f);
    const statement = operation === 'insert' ? table === 'audit_log' ? sql`insert into audit_log (tenant_id, action, entity) values (${f.t1}, 'forged', 'clients')` : sql`insert into events (tenant_id, type, aggregate) values (${f.t1}, 'message.sent', 'messages')`
      : operation === 'update' ? sql`update ${sql.identifier(table)} set ${sql.identifier(table === 'events' ? 'last_error' : 'reason')} = 'forged' where tenant_id = ${f.t1}` : sql`delete from ${sql.identifier(table)} where tenant_id = ${f.t1}`;
    const error = await expectPrivilege(() => as(f[who], (tx) => q(tx, statement))); expect(error.message).toContain('table ' + table); expect(await snapshot(f)).toEqual(before); await semanticControl(f[who], f);
  });
  for (const who of ['o1', 's2'] as const) it(`A02 audit/events ${who} EXECUTE payment.verify/verified exact snapshots/actor`, async () => {
    const f = await buildPrivateFixture(), actor = who === 's2' ? await mkMembership(f.s2, { permissions: { client_scope: 'all', modules: { billing: ['manage'] } } }) : f.o1, request = randomUUID();
    const id = await as(actor, async (tx) => { await q(tx, sql`select set_config('app.service_reason', 'forged service reason', true)`); await audit(tx, 'payment.verify', 'payments', f.payA, { state: 'pending' }, { state: 'verified' }, 'manual verification', request); return emit(tx, 'payment.verified', 'payments', f.payA, { reference: 'exact' }); });
    expect(id).toMatch(/^\d+$/);
    expect(await svc((tx) => q(tx, sql`select tenant_id, client_id, actor_user_id, actor_role, before, after, reason, request_id from audit_log where tenant_id = ${f.t1} and request_id = ${request}`), f.t1))
      .toEqual([{ tenant_id: f.t1, client_id: f.clientA, actor_user_id: actor.userId, actor_role: actor.role, before: { state: 'pending' }, after: { state: 'verified' }, reason: 'manual verification', request_id: request }]);
    expect(await svc((tx) => one(tx, sql`select tenant_id, client_id, actor_user_id, actor_role, type, aggregate, aggregate_id, payload from events where tenant_id = ${f.t1} and id = ${id}::bigint`), f.t1))
      .toEqual({ tenant_id: f.t1, client_id: f.clientA, actor_user_id: actor.userId, actor_role: actor.role, type: 'payment.verified', aggregate: 'payments', aggregate_id: f.payA, payload: { reference: 'exact' } });
  });
  for (const who of ['o1', 's1', 's2', 'ua'] as const) it(`A03 audit_log/events ${who} SELECT exact A/B/tenant/T2 corpus`, async () => {
    const f = await buildPrivateFixture(), marker = randomUUID();
    const corpus = await svc(async (tx) => {
      const rows: { id: string; client: string | null; tenant: string }[] = [];
      for (const [tenant, client] of [[f.t1, f.clientA], [f.t1, f.clientB], [f.t1, null], [f.t2, f.clientC]] as const) {
        const row = await one<{ id: string }>(tx, sql`insert into audit_log (tenant_id, client_id, action, entity, entity_id, request_id) values (${tenant}, ${client}, 'insert', 'clients', ${client}, ${marker}) returning id::text`); rows.push({ id: row.id, client, tenant });
        await q(tx, sql`insert into events (tenant_id, client_id, type, aggregate, payload) values (${tenant}, ${client}, 'payment.verified', 'payments', ${JSON.stringify({ marker })}::jsonb)`);
      } return rows;
    });
    const want = corpus.filter((row) => row.tenant === f.t1 && (who === 'o1' || (who === 's1' && row.client === f.clientA) || (who === 's2' && row.client !== null))).map((row) => row.id).sort();
    expect((await as(f[who], (tx) => q<{ id: string }>(tx, sql`select id::text from audit_log where request_id = ${marker}`))).map((row) => row.id).sort()).toEqual(want);
    const eventIds = await svc((tx) => q<{ id: string }>(tx, sql`select id::text from events where tenant_id = ${f.t1} and payload->>'marker' = ${marker} order by id`), f.t1);
    expect(await as(f[who], (tx) => q(tx, sql`select id::text from events where payload->>'marker' = ${marker} order by id`))).toEqual(who === 'o1' ? eventIds : []);
    expect(await svc((tx) => one(tx, sql`select client_id from audit_log where tenant_id = ${f.t1} and entity = 'clients' and entity_id = ${f.clientA} and request_id is null and action = 'insert'`), f.t1)).toEqual({ client_id: f.clientA });
  });
  for (const who of ['o1', 's2', 'o1t2'] as const) for (const fn of ['audit', 'emit_event'] as const) for (const target of ['foreign', 'missing'] as const) it(`A04 ${fn} ${who} EXECUTE payments ${target}`, async () => {
    const f = await buildPrivateFixture(), actor = f[who], id = target === 'missing' ? randomUUID() : who === 'o1t2' ? f.payA : f.payC;
    await rejected(f, () => as(actor, async (tx) => fn === 'audit' ? audit(tx, 'payment.verify', 'payments', id) : emit(tx, 'payment.verified', 'payments', id)), 'rule:app.entity_client', 'P0002'); await semanticControl(actor, f);
  });
  for (const fn of ['audit', 'emit_event'] as const) it(`A05 ${fn} s1 EXECUTE payments unassigned B/assigned A`, async () => {
    const f = await buildPrivateFixture(); await rejected(f, () => as(f.s1, async (tx) => fn === 'audit' ? audit(tx, 'payment.verify', 'payments', f.payB) : emit(tx, 'payment.verified', 'payments', f.payB)), 'rule:app.' + fn);
    const request = randomUUID(); if (fn === 'audit') { await as(f.s1, (tx) => audit(tx, 'payment.verify', 'payments', f.payA, null, null, 'allowed', request)); expect(await svc((tx) => q(tx, sql`select client_id, actor_user_id from audit_log where tenant_id = ${f.t1} and request_id = ${request}`), f.t1)).toEqual([{ client_id: f.clientA, actor_user_id: f.s1.userId }]); } else await semanticControl(f.s1, f);
  });
  for (const fn of ['audit', 'emit_event'] as const) for (const name of ['staff-only', 'unknown'] as const) it(`A06 ${fn} ua EXECUTE ${name} name`, async () => {
    const f = await buildPrivateFixture(); await rejected(f, () => as(f.ua, async (tx) => fn === 'audit' ? audit(tx, name === 'unknown' ? 'unknown.action' : 'payment.verify', 'payments', f.payA) : emit(tx, name === 'unknown' ? 'unknown.event' : 'payment.verified', 'payments', f.payA)), 'rule:app.' + fn);
    if (fn === 'audit') await semanticControl(f.ua, f); else { const message = await ownMessage(f), id = await as(f.ua, (tx) => emit(tx, 'message.sent', 'messages', message)); expect(await svc((tx) => one(tx, sql`select client_id, actor_role from events where tenant_id = ${f.t1} and id = ${id}::bigint`), f.t1)).toEqual({ client_id: f.clientA, actor_role: 'client' }); }
  });
  for (const target of ['B', 'internal'] as const) it(`A07 emit_event ua EXECUTE message.sent ${target}`, async () => {
    const f = await buildPrivateFixture(), other = await ownMessage(f, target); await rejected(f, () => as(f.ua, (tx) => emit(tx, 'message.sent', 'messages', other)), 'rule:app.emit_event'); const own = await ownMessage(f), id = await as(f.ua, (tx) => emit(tx, 'message.sent', 'messages', own)); expect(await svc((tx) => one(tx, sql`select aggregate_id, client_id from events where tenant_id = ${f.t1} and id = ${id}::bigint`), f.t1)).toEqual({ aggregate_id: own, client_id: f.clientA });
  });
  for (const fn of ['audit', 'emit_event'] as const) it(`A07 ${fn} o1 EXECUTE unpinned`, async () => { const f = await buildPrivateFixture(); await rejected(f, () => withUserTx(f.o1.userId, async (tx) => fn === 'audit' ? audit(tx, 'payment.verify', 'payments', f.payA) : emit(tx, 'payment.verified', 'payments', f.payA)), 'rule:app.' + fn); await semanticControl(f.o1, f); });
  it('A07 audit o1 EXECUTE wrong action/entity pair', async () => { const f = await buildPrivateFixture(); await rejected(f, () => as(f.o1, (tx) => audit(tx, 'payment.verify', 'clients', f.clientA)), 'rule:app.audit'); const request = randomUUID(); await as(f.o1, (tx) => audit(tx, 'payment.verify', 'payments', f.payA, null, null, 'allowed', request)); expect(await svc((tx) => q(tx, sql`select entity from audit_log where tenant_id = ${f.t1} and request_id = ${request}`), f.t1)).toEqual([{ entity: 'payments' }]); });
  for (const field of ['payload', 'before', 'after'] as const) it(`A08 ${field === 'payload' ? 'emit_event' : 'audit'} o1 EXECUTE ${field} pg_column_size cap`, async () => {
    const f = await buildPrivateFixture(), limit = field === 'payload' ? 16384 : 65536;
    // Measure JSONB in PostgreSQL, independently of JS character length and TOAST storage.
    const large = await svc((tx) => one<{ value: unknown; bytes: number }>(tx, sql`select jsonb_build_object('text', repeat('x', ${limit})) as value, pg_column_size(jsonb_build_object('text', repeat('x', ${limit}))) as bytes`));
    expect(large.bytes).toBeGreaterThan(limit);
    await rejected(f, () => as(f.o1, async (tx) => field === 'payload' ? emit(tx, 'payment.verified', 'payments', f.payA, large.value) : audit(tx, 'payment.verify', 'payments', f.payA, field === 'before' ? large.value : null, field === 'after' ? large.value : null)), 'rule:app.' + (field === 'payload' ? 'emit_event' : 'audit'), '54000');
    const small = { exact: 'allowed' }; const bytes = await svc((tx) => one<{ n: number }>(tx, sql`select pg_column_size(${JSON.stringify(small)}::jsonb) as n`)); expect(bytes.n).toBeLessThanOrEqual(limit);
    if (field === 'payload') { const id = await as(f.o1, (tx) => emit(tx, 'payment.verified', 'payments', f.payA, small)); expect(await svc((tx) => one(tx, sql`select payload from events where tenant_id = ${f.t1} and id = ${id}::bigint`), f.t1)).toEqual({ payload: small }); }
    else { const request = randomUUID(); await as(f.o1, (tx) => audit(tx, 'payment.verify', 'payments', f.payA, field === 'before' ? small : null, field === 'after' ? small : null, null, request)); expect(await svc((tx) => one(tx, sql`select ${sql.identifier(field)} as value from audit_log where tenant_id = ${f.t1} and request_id = ${request}`), f.t1)).toEqual({ value: small }); }
  });
  for (const target of ['aggregate', 'uuid'] as const) it(`A08 emit_event o1 EXECUTE unknown ${target}`, async () => { const f = await buildPrivateFixture(); await rejected(f, () => as(f.o1, (tx) => emit(tx, 'payment.verified', target === 'aggregate' ? 'unknown' : 'payments', target === 'uuid' ? 'not-a-uuid' : f.payA)), 'rule:app.entity_client', target === 'aggregate' ? '42501' : '22023'); await semanticControl(f.o1, f); });
  for (const table of ['audit_actions', 'event_types'] as const) it(`A09 app.${table} o1 SELECT private allowlist`, async () => { const f = await buildPrivateFixture(), before = await snapshot(f); const error = await expectPrivilege(() => as(f.o1, (tx) => q(tx, sql`select * from app.${sql.identifier(table)}`))); expect(error.message).toContain(table); expect(await snapshot(f)).toEqual(before); await semanticControl(f.o1, f); });
  for (const table of ['audit_actions', 'event_types'] as const) for (const roles of ['empty', 'unknown'] as const) it(`A09 app.${table} svc INSERT roles ${roles} CHECK`, async () => {
    const marker = new Error('rollback valid allowlist control'); const name = table === 'audit_actions' ? 'action' : 'type';
    await expect(svc(async (tx) => {
      const before = await q(tx, sql`select * from app.${sql.identifier(table)} order by ${sql.identifier(name)}`);
      const statement = (value: readonly string[]) => table === 'audit_actions' ? sql`insert into app.audit_actions (action, entity, roles) values ('security.probe', 'payments', array[${sql.join(value.map((item) => sql`${item}`), sql`, `)}]::text[])` : sql`insert into app.event_types (type, roles) values ('security.probe', array[${sql.join(value.map((item) => sql`${item}`), sql`, `)}]::text[])`;
      const error = await expectCode(() => tx.transaction((sp) => q(sp, statement(roles === 'empty' ? [] : ['intruder']))), '23514'); expect(error.constraint_name).toBe(table + '_roles_ck'); expect(await q(tx, sql`select * from app.${sql.identifier(table)} order by ${sql.identifier(name)}`)).toEqual(before);
      await q(tx, statement(['owner', 'staff'])); expect(await one(tx, sql`select roles from app.${sql.identifier(table)} where ${sql.identifier(name)} = 'security.probe'`)).toEqual({ roles: ['owner', 'staff'] }); throw marker;
    })).rejects.toBe(marker);
  });
  it('A09 entity_client svc SELECT every canonical audit_actions entity', async () => {
    const f = await buildPrivateFixture(), session = await mkSession(f.t1, f.clientA), submission = randomUUID(), ai = randomUUID();
    await svc(async (tx) => { await q(tx, sql`insert into form_submissions (id, tenant_id, client_id, form_id, form_version_id, form_kind) values (${submission}, ${f.t1}, ${f.clientA}, ${f.templateForm}, ${f.templateFormPub}, 'checkin')`); await q(tx, sql`insert into ai_requests (id, tenant_id, client_id, kind, input, created_by) values (${ai}, ${f.t1}, ${f.clientA}, 'program', '{}', ${f.o1.userId})`); }, f.t1);
    // Canonical §9.2 entities, entered by hand; never select expected entities from the allowlist under test.
    const entities = [['program_versions', f.publishedVersion, null], ['nutrition_plan_versions', f.planPubA, f.clientA], ['form_versions', f.templateFormPub, null], ['payments', f.payA, f.clientA], ['subscriptions', f.subA, f.clientA], ['clients', f.clientA, f.clientA], ['form_submissions', submission, f.clientA], ['workout_sessions', session, f.clientA], ['media', f.mediaA, f.clientA], ['ai_requests', ai, f.clientA], ['memberships', f.s1.membershipId, null]] as const;
    for (const [entity, id, client] of entities) expect(await svc((tx) => one(tx, sql`select app.entity_client(${entity}, ${id}, ${f.t1}::uuid) as client`), f.t1)).toEqual({ client });
  });

  const plain = ['clients', 'client_notes', 'client_flags', 'packages', 'invitations', 'consents', 'programs', 'nutrition_plans', 'forms', 'ai_requests', 'media'] as const;
  for (const table of plain) for (const operation of ['insert', 'update', 'delete'] as const) it(`A10 ${table} svc ${operation.toUpperCase()} exact row snapshot`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(); let target: string = id;
    const create: Record<string, SQL> = {
      client_notes: sql`insert into client_notes (id, tenant_id, client_id, body, author_user_id) values (${id}, ${f.t1}, ${f.clientA}, 'private', ${f.o1.userId})`,
      client_flags: sql`insert into client_flags (id, tenant_id, client_id, kind) values (${id}, ${f.t1}, ${f.clientA}, 'private')`,
      invitations: sql`insert into invitations (id, tenant_id, token_hash, role, invited_by, expires_at) values (${id}, ${f.t1}, ${id}, 'staff', ${f.o1.userId}, now() + interval '1 day')`,
      consents: sql`insert into consents (id, tenant_id, user_id, kind, version, locale) values (${id}, ${f.t1}, ${f.ua.userId}, 'terms', ${id}, 'en')`,
      ai_requests: sql`insert into ai_requests (id, tenant_id, client_id, kind, input, created_by) values (${id}, ${f.t1}, ${f.clientA}, 'private', '{}', ${f.o1.userId})`,
      media: sql`insert into media (id, tenant_id, client_id, owner_user_id, bucket, path, kind, purpose, mime_type) values (${id}, ${f.t1}, ${f.clientA}, ${f.ua.userId}, 'client-media', ${f.t1 + '/clients/' + f.clientA + '/' + id + '.jpg'}, 'file', 'payment_proof', 'image/jpeg')`,
    };
    if (table === 'clients') target = await mkClient(f.t1); else if (table === 'packages') target = await mkPackage(f.t1);
    else if (table === 'programs' || table === 'nutrition_plans' || table === 'forms') target = (await mkVersion(f.t1, { family: table === 'programs' ? 'program' : table === 'forms' ? 'form' : 'nutrition', clientId: f.clientA })).headId;
    else { const statement = create[table]; if (!statement) throw new Error('missing private audit factory for ' + table); await svc((tx) => q(tx, statement), f.t1); }
    const before = await rowJson(table, sql`tenant_id = ${f.t1} and id = ${target}`, f.t1); const initial = await svc((tx) => one<{ n: number }>(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${f.t1} and entity = ${table} and entity_id = ${target}`), f.t1);
    expect(initial.n).toBe(1);
    if (operation === 'update') {
      const column = table === 'clients' ? 'first_name' : table === 'client_notes' ? 'body' : table === 'client_flags' ? 'detail' : table === 'consents' ? 'withdrawn_at' : table === 'invitations' ? 'display_name' : table === 'ai_requests' ? 'model' : table === 'media' ? 'review_note' : 'name';
      const value = column === 'name' || column === 'detail' ? sql`'{"en":"allowed"}'::jsonb` : column === 'withdrawn_at' ? sql`now()` : sql`'allowed'`;
      await svc((tx) => q(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where tenant_id = ${f.t1} and id = ${target}`), f.t1);
    } else if (operation === 'delete') await svc((tx) => q(tx, sql`delete from ${sql.identifier(table)} where tenant_id = ${f.t1} and id = ${target}`), f.t1);
    const after = await rowJson(table, sql`tenant_id = ${f.t1} and id = ${target}`, f.t1);
    const rows = await svc((tx) => q(tx, sql`select tenant_id, client_id, action, entity, entity_id, before, after, actor_role from audit_log where tenant_id = ${f.t1} and entity = ${table} and entity_id = ${target} and action = ${operation}`), f.t1);
    expect(rows).toEqual([{ tenant_id: f.t1, client_id: table === 'clients' ? target : before?.client_id ?? null, action: operation, entity: table, entity_id: target,
      before: operation === 'insert' ? null : before, after: operation === 'delete' ? null : after, actor_role: 'service' }]);
    expect(await svc((tx) => one(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${f.t1} and entity = ${table} and entity_id = ${target}`), f.t1)).toEqual({ n: operation === 'insert' ? 1 : 2 });
  });
  for (const table of ['subscriptions', 'subscription_events', 'payments', 'client_entitlement_overrides', 'memberships', 'staff_client_assignments', 'business_settings'] as const) it(`A10 ${table} svc INSERT/UPDATE retained audit composite/UUID`, async () => {
    const f = await buildPrivateFixture(); let entityId: string | null = null; let client: string | null = f.clientA; let where: SQL; let update: SQL;
    if (table === 'subscriptions') { entityId = await mkSubscription(f.t1, f.clientA, f.packageT1); where = sql`id = ${entityId}`; update = sql`update subscriptions set notes = 'allowed' where tenant_id = ${f.t1} and id = ${entityId}`; }
    else if (table === 'payments') { entityId = await mkPayment(f.t1, f.clientA, f.subA); where = sql`id = ${entityId}`; update = sql`update payments set notes = 'allowed' where tenant_id = ${f.t1} and id = ${entityId}`; }
    else if (table === 'memberships') { entityId = (await mkMembership(f.s2)).membershipId; client = null; where = sql`id = ${entityId}`; update = sql`update memberships set display_name = 'allowed' where tenant_id = ${f.t1} and id = ${entityId}`; }
    else if (table === 'staff_client_assignments') { const actor = await mkMembership(f.s2); where = sql`tenant_id = ${f.t1} and membership_id = ${actor.membershipId} and client_id = ${f.clientA}`; await svc((tx) => q(tx, sql`insert into staff_client_assignments (tenant_id, membership_id, client_id) values (${f.t1}, ${actor.membershipId}, ${f.clientA})`), f.t1); update = sql`update staff_client_assignments set assigned_by = ${f.o1.userId} where ${where}`; }
    else if (table === 'business_settings') { client = null; where = sql`tenant_id = ${f.t1}`; await svc((tx) => q(tx, sql`insert into business_settings (tenant_id, settings) values (${f.t1}, '{}')`), f.t1); update = sql`update business_settings set settings = '{"allowed":true}' where ${where}`; }
    else { entityId = randomUUID(); where = sql`id = ${entityId}`; await svc((tx) => q(tx, table === 'subscription_events' ? sql`insert into subscription_events (id, tenant_id, client_id, subscription_id, kind) values (${entityId}, ${f.t1}, ${f.clientA}, ${f.subA}, 'extension')` : sql`insert into client_entitlement_overrides (id, tenant_id, client_id, override) values (${entityId}, ${f.t1}, ${f.clientA}, '{}')`), f.t1); update = table === 'subscription_events' ? sql`update subscription_events set reason = 'allowed' where tenant_id = ${f.t1} and id = ${entityId}` : sql`update client_entitlement_overrides set revoked_at = now() where tenant_id = ${f.t1} and id = ${entityId}`; }
    const before = await rowJson(table, where, f.t1);
    const prior = await svc((tx) => one<{ n: number }>(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${f.t1} and entity = ${table}`), f.t1);
    await svc((tx) => q(tx, update), f.t1);
    const after = await rowJson(table, where, f.t1);
    const rows = await svc((tx) => q(tx, sql`select entity_id, client_id, before, after from audit_log where tenant_id = ${f.t1} and entity = ${table} and action = 'update'`), f.t1);
    expect(rows).toEqual([{ entity_id: entityId, client_id: client, before, after }]);
    expect(await svc((tx) => one(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${f.t1} and entity = ${table}`), f.t1)).toEqual({ n: prior.n + 1 });
  });
  it('A11 tenants o1 UPDATE name and svc INSERT/DELETE use tenant id', async () => {
    const f = await buildPrivateFixture(), before = await rowJson('tenants', sql`id = ${f.t1}`, f.t1);
    await as(f.o1, (tx) => q(tx, sql`update tenants set name = 'renamed' where id = ${f.t1}`)); const after = await rowJson('tenants', sql`id = ${f.t1}`, f.t1);
    expect(await svc((tx) => q(tx, sql`select tenant_id, entity_id, before, after from audit_log where tenant_id = ${f.t1} and entity = 'tenants' and action = 'update'`), f.t1)).toEqual([{ tenant_id: f.t1, entity_id: f.t1, before, after }]);
    const tenant = await mkTenant(); await svc((tx) => q(tx, sql`delete from tenants where id = ${tenant}`), tenant);
    expect(await svc((tx) => q(tx, sql`select tenant_id, entity_id, action from audit_log where tenant_id = ${tenant} and entity = 'tenants' order by id`), tenant)).toEqual([{ tenant_id: tenant, entity_id: tenant, action: 'insert' }, { tenant_id: tenant, entity_id: tenant, action: 'delete' }]);
  });
  it('A12 tenants o1 INSERT client/VERIFY payment counter-only changes emit no tenant audit', async () => {
    const f = await buildPrivateFixture(); const before = await svc((tx) => one<{ client_counter: number; receipt_counter: number; n: number }>(tx, sql`select client_counter, receipt_counter, (select count(*)::int from audit_log where tenant_id = ${f.t1} and entity = 'tenants') as n from tenants where id = ${f.t1}`), f.t1);
    const client = randomUUID(); await as(f.o1, (tx) => q(tx, sql`insert into clients (id, tenant_id, first_name) values (${client}, ${f.t1}, 'private')`)); await as(f.o1, (tx) => q(tx, sql`update payments set state = 'verified' where id = ${f.payA}`));
    expect(await svc((tx) => one(tx, sql`select client_counter, receipt_counter, (select count(*)::int from audit_log where tenant_id = ${f.t1} and entity = 'tenants') as n from tenants where id = ${f.t1}`), f.t1)).toEqual({ client_counter: before.client_counter + 1, receipt_counter: before.receipt_counter + 1, n: before.n });
    expect(await svc((tx) => q(tx, sql`select entity, action from audit_log where tenant_id = ${f.t1} and ((entity = 'clients' and entity_id = ${client}) or (entity = 'payments' and entity_id = ${f.payA} and action = 'update')) order by entity`), f.t1)).toEqual([{ entity: 'clients', action: 'insert' }, { entity: 'payments', action: 'update' }]);
  });
  it('A13 tenants o1 UPDATE name=name emits exactly one SET-list audit', async () => {
    const f = await buildPrivateFixture(); await as(f.o1, (tx) => q(tx, sql`update tenants set name = name where id = ${f.t1}`));
    const audit = await svc((tx) => one<{ before: { name: string }; after: { name: string } }>(tx, sql`select before, after from audit_log where tenant_id = ${f.t1} and entity = 'tenants' and action = 'update'`), f.t1); expect(audit.before.name).toBe(audit.after.name);
  });
  for (const [family, , table] of families) {
    it(`A13 ${table} o1 UPDATE status=status/draft document-only`, async () => { const v = await mkVersion(fx.t1, { family }); await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set status = status where id = ${v.versionId}`)); await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set document = '{"autosave":true}' where id = ${v.versionId}`)); expect(await svc((tx) => one(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${fx.t1} and entity = ${table} and entity_id = ${v.versionId} and action = 'update'`), fx.t1)).toEqual({ n: 1 }); });
    it(`A14 ${table} o1 INSERT/autosave/publish/rejected immutable/DELETE strip document`, async () => {
      const v = await mkVersion(fx.t1, { family });
      await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set document = '{"private":"content"}', change_note = 'keep note' where id = ${v.versionId}`));
      expect(await svc((tx) => one(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${fx.t1} and entity = ${table} and entity_id = ${v.versionId}`), fx.t1)).toEqual({ n: 1 });
      await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set status = 'published' where id = ${v.versionId}`));
      const before = await svc((tx) => q(tx, sql`select * from audit_log where tenant_id = ${fx.t1} and entity = ${table} and entity_id = ${v.versionId} order by id`), fx.t1);
      expect(before).toHaveLength(2);
      const persisted = await snapshot(fx);
      const error = await expectGuard(() => as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set document = '{}' where id = ${v.versionId}`)), 'rule:app.protect_published_version', 'document'); expect(error).toMatchObject({ code: 'P0001', table_name: table });
      expect(await snapshot(fx)).toEqual(persisted);
      expect(await svc((tx) => q(tx, sql`select * from audit_log where tenant_id = ${fx.t1} and entity = ${table} and entity_id = ${v.versionId} order by id`), fx.t1)).toEqual(before);
      await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(table)} set status = 'superseded' where id = ${v.versionId}`));
      const removable = await mkVersion(fx.t1, { family }); await as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(table)} where id = ${removable.versionId}`));
      const rows = await svc((tx) => q<{ before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(tx, sql`select before, after from audit_log where tenant_id = ${fx.t1} and entity = ${table} and entity_id in (${v.versionId}, ${removable.versionId}) order by id`), fx.t1);
      expect(rows).toHaveLength(5); for (const row of rows) { if (row.before) expect(row.before).not.toHaveProperty('document'); if (row.after) expect(row.after).not.toHaveProperty('document'); }
      expect(rows[1]?.after).toMatchObject({ change_note: 'keep note', status: 'published' });
    });
  }
  it('A15 payments/audit_log/events o1 UPDATE+semantic audit+event rollback/commit atomically', async () => {
    const f = await buildPrivateFixture(), marker = new Error('deliberate audit rollback'), request = randomUUID(), before = await snapshot(f);
    const work = async (tx: Tx) => { await q(tx, sql`update payments set reference = 'atomic' where id = ${f.payA}`); await audit(tx, 'payment.verify', 'payments', f.payA, null, { reference: 'atomic' }, 'atomic', request); return emit(tx, 'payment.verified', 'payments', f.payA, { request }); };
    await expect(as(f.o1, async (tx) => { await work(tx); throw marker; })).rejects.toBe(marker); expect(await snapshot(f)).toEqual(before);
    const id = await as(f.o1, work); expect(await serviceRow('payments', f.payA)).toMatchObject({ reference: 'atomic' });
    expect(await svc((tx) => q(tx, sql`select after from audit_log where tenant_id = ${f.t1} and request_id = ${request}`), f.t1)).toEqual([{ after: { reference: 'atomic' } }]); expect(await svc((tx) => one(tx, sql`select payload from events where tenant_id = ${f.t1} and id = ${id}::bigint`), f.t1)).toEqual({ payload: { request } });
  });
  it('A16 outbox processor SOURCE contract requires state re-read/recorded role before side effects (W04)', () => {
    // §13.6 explicitly allows written source contracts. There is no outbox worker in the current source tree.
    // This pins the required W04 handoff; worker/Hono behavior belongs to §12 and cannot be proved by SQL.
    const contract = readFileSync(new URL('../../../docs/architecture/02-database-security-model.md', import.meta.url), 'utf8');
    const row = contract.split('\n').find((line) => line.startsWith('| 4 | **Outbox processor.**'));
    expect(row, 'missing §12.1 W04 outbox processor contract').toBeDefined();
    expect(row).toContain('Re-read the aggregate\'s current state before acting');
    expect(row).toContain('ignore an event whose `app.event_types` row does not list the recorded actor role');
    expect(row).toContain('Treat `events.payload` as a hint'); expect(row).toContain('W04');
  });
});
