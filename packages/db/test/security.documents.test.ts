import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, withErasureTx, withServiceTx, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkClient, mkMembership, mkSession, mkTenant, mkVersion } from './factories';
import { as, svc, q, one, expectCode, expectGuard, expectPrivilege, serviceRow } from './helpers';

let fx: Fixture;
beforeAll(async () => { fx = await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
const families = [
  { family: 'program', head: 'programs', versions: 'program_versions', key: 'program_id', module: 'programs' },
  { family: 'nutrition', head: 'nutrition_plans', versions: 'nutrition_plan_versions', key: 'plan_id', module: 'nutrition' },
  { family: 'form', head: 'forms', versions: 'form_versions', key: 'form_id', module: 'forms' },
] as const;
type Family = typeof families[number];
type Version = Awaited<ReturnType<typeof mkVersion>>;
type Run = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
const graphTables = ['tenants', 'memberships', 'staff_client_assignments', 'invitations', 'business_settings', 'user_preferences',
  'consents', 'clients', 'client_notes', 'client_flags', 'tasks', 'ai_requests', 'packages', 'subscriptions', 'subscription_events',
  'client_entitlement_overrides', 'payments', 'exercises', 'foods', 'tenant_hidden_items', 'programs', 'program_versions',
  'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions', 'metric_entries', 'measurement_sets', 'progress_photo_sets',
  'inbody_records', 'workout_sessions', 'set_logs', 'meal_logs', 'supplement_logs', 'form_submissions', 'calendar_events', 'conversations',
  'messages', 'message_revisions', 'notifications', 'notification_deliveries', 'push_subscriptions', 'idempotency_keys', 'media', 'audit_log', 'events', 'job_runs'] as const;
async function snapshot(tenantId: string, tables: readonly string[] = graphTables): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    for (const table of tables) result.push(await one(tx, sql`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text as rows
      from ${sql.identifier(table)} t where ${sql.identifier(table === 'tenants' ? 'id' : 'tenant_id')} = ${tenantId}::uuid`));
    return result;
  }, tenantId);
}
async function unchanged(tenantId: string, work: () => Promise<unknown>): Promise<void> {
  const before = await snapshot(tenantId); await work(); expect(await snapshot(tenantId)).toEqual(before);
}
async function clientSnapshot(tenantId: string, clientId: string): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    const columns = await q<{ table_name: string }>(tx, sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'client_id' order by table_name`);
    for (const { table_name: table } of columns) result.push(await one(tx, sql`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text as rows from ${sql.identifier(table)} t where tenant_id = ${tenantId} and client_id = ${clientId}`));
    result.push(await serviceRow('clients', clientId)); return result;
  }, tenantId);
}
async function guard(tenantId: string, work: () => Promise<unknown>, rule: string, table: string, column?: string, code?: string): Promise<void> {
  await unchanged(tenantId, async () => {
    const error = await expectGuard(work, rule, column); expect(error.table_name).toBe(table);
    if (code !== undefined) expect(error.code).toBe(code);
  });
}
function runner(actor: AuthContext | 'svc', tenantId = fx.t1): Run {
  return actor === 'svc' ? (fn) => svc(fn, tenantId) : (fn) => as(actor, fn);
}
function append(t: Family, v: Version, id: string, n: number, status = 'draft', extra: Record<string, SQL> = {}): SQL {
  const values: Record<string, SQL> = { id: sql`${id}::uuid`, tenant_id: sql`${fx.t1}::uuid`, [t.key]: sql`${v.headId}::uuid`,
    client_id: sql`${v.clientId}::uuid`, version_no: sql`${n}`, status: sql`${status}`, document: sql`'{}'::jsonb`, ...extra };
  return sql`insert into ${sql.identifier(t.versions)} (${sql.join(Object.keys(values).map(sql.identifier), sql`, `)}) values (${sql.join(Object.values(values), sql`, `)}) returning *`;
}
async function draft(t: Family, tenantId = fx.t1, clientId: string | null = null): Promise<Version> {
  return mkVersion(tenantId, { family: t.family, clientId });
}
async function change(t: Family, v: Version, run: Run, state: string): Promise<void> {
  await run(async (tx) => {
    expect(await one(tx, sql`update ${sql.identifier(t.versions)} set status = ${state} where id = ${v.versionId} returning status::text as status`)).toEqual({ status: state });
  });
}
async function allowedEdit(t: Family, run: Run, tenantId = fx.t1): Promise<void> {
  const v = await draft(t, tenantId);
  await run((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set document = '{"allowed":true}'::jsonb, change_note = 'allowed' where id = ${v.versionId}`));
  expect(await serviceRow(t.versions, v.versionId)).toMatchObject({ document: { allowed: true }, change_note: 'allowed' });
}
async function special(work: () => Promise<unknown>, code: string, rule: string, table?: string, column?: string): Promise<void> {
  const error = code === '42501' || code === 'P0001' ? await expectGuard(work, `rule:app.${rule}`, column) : await expectCode(work, code);
  expect(error.code).toBe(code); expect(error.detail).toBe(`rule:app.${rule}`);
  if (table) expect(error.table_name).toBe(table);
  if (column) expect(error.column_name).toBe(column);
}
function signal<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
async function waitBlocked(pid: number, holder: number): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await svc((tx) => one<{ blocked: boolean }>(tx, sql`select ${holder}::int = any(pg_blocking_pids(${pid}::int)) as blocked`))).blocked) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('contending transaction did not wait on the head advisory lock');
}
async function serialized(actor: AuthContext, firstWork: (tx: Tx) => Promise<unknown>, secondWork: (tx: Tx) => Promise<unknown>): Promise<PromiseSettledResult<unknown>> {
  const held = signal<number>(), secondPid = signal<number>(), release = signal<void>();
  const first = as(actor, async (tx) => { const pid = await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`); await firstWork(tx); held.resolve(pid.pid); await release.promise; });
  const firstFailure = first.then(() => { throw new Error('holder finished before synchronization'); });
  let second: Promise<unknown> | undefined;
  try {
    const holder = await Promise.race([held.promise, firstFailure]);
    second = as(actor, async (tx) => { secondPid.resolve((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid); return secondWork(tx); });
    const outcome = Promise.allSettled([second]);
    await waitBlocked(await secondPid.promise, holder); release.resolve(); await first;
    return (await outcome)[0]!;
  } finally { release.resolve(); await Promise.allSettled([first, ...(second ? [second] : [])]); }
}

describe('documents, publication and erasure (§7.1–7.3, §7.9)', () => {
  for (const t of families) {
    for (const who of ['ua', 's1', 's2', 'o1'] as const) {
      it(`D01 ${t.head}/${t.versions} ${who} SELECT id all publication states/template/copy`, async () => {
        const f = await buildPrivateFixture();
        const built: { headId: string; versionId: string; owner: 'A' | 'B' | 'template' | 'T2'; state: string }[] = [];
        for (const owner of ['A', 'B', 'template', 'T2'] as const) {
          for (const state of ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived']) {
            const v = await mkVersion(owner === 'T2' ? f.t2 : f.t1, { family: t.family, clientId: owner === 'A' ? f.clientA : owner === 'B' ? f.clientB : owner === 'T2' ? f.clientC : null,
              status: state === 'published' || state === 'superseded' ? 'published' : 'draft', publishedBy: f.o1.userId });
            if (state !== 'draft' && state !== 'published') await svc((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = ${state} where tenant_id = ${owner === 'T2' ? f.t2 : f.t1} and id = ${v.versionId}`));
            built.push({ ...v, owner, state });
          }
        }
        // Scope only to this hand-built corpus; fixture baselines are covered separately by suite S.
        const keys = sql.join(built.map((v) => sql`${v.headId}::uuid`), sql`, `);
        const allowed = built.filter((v) => v.owner !== 'T2' && (who === 'o1' || who === 's2' || (who === 's1' && v.owner !== 'B') ||
          (who === 'ua' && (v.owner === 'A' || (v.owner === 'template' && t.family === 'form')))));
        const visibleVersions = allowed.filter((v) => who !== 'ua' || v.state === 'published' || v.state === 'superseded');
        const actual = await as(f[who], async (tx) => ({ heads: await q<{ id: string }>(tx, sql`select id from ${sql.identifier(t.head)} where id in (${keys})`),
          versions: await q<{ id: string }>(tx, sql`select id from ${sql.identifier(t.versions)} where ${sql.identifier(t.key)} in (${keys})`) }));
        expect(actual.heads.map((v) => v.id).sort()).toEqual(allowed.map((v) => v.headId).sort());
        expect(actual.versions.map((v) => v.id).sort()).toEqual(visibleVersions.map((v) => v.versionId).sort());
      });
    }
    for (const state of ['in_review', 'approved', 'archived'] as const) for (const column of ['document', 'change_note'] as const) {
      it(`D02 ${t.versions} o1 UPDATE ${column} ${state}/never-published`, async () => {
        const v = await draft(t); await svc((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = ${state} where tenant_id = ${fx.t1} and id = ${v.versionId}`), fx.t1);
        await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.versions)} set ${sql.identifier(column)} = ${column === 'document' ? sql`'{"changed":true}'::jsonb` : sql`'changed'`} where id = ${v.versionId}`)), 'editable_in', t.versions, column);
        await allowedEdit(t, runner(fx.o1));
      });
    }
    for (const who of ['o1', 'svc'] as const) for (const state of ['published', 'superseded', 'archived'] as const) {
      for (const column of ['document', 'version_no', 'published_at', 'published_by', 'tenant_id', 'client_id', t.key] as const) {
        it(`D03 ${t.versions} ${who} UPDATE ${column} ${state}/ever-published`, async () => {
          const v = await mkVersion(fx.t1, { family: t.family, status: 'published', publishedBy: fx.o1.userId });
          const run = runner(who === 'svc' ? 'svc' : fx.o1);
          if (state !== 'published') await change(t, v, run, state);
          const value = column === 'document' ? sql`'{"changed":true}'::jsonb` : column === 'version_no' ? sql`99` : column === 'published_at' ? sql`'2001-01-01'::timestamptz` : sql`${randomUUID()}::uuid`;
          await guard(fx.t1, () => run((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set ${sql.identifier(column)} = ${value} where id = ${v.versionId}`)), 'rule:app.protect_published_version', t.versions, column, 'P0001');
          await run((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = status where id = ${v.versionId}`));
          expect(await serviceRow(t.versions, v.versionId)).toMatchObject({ status: state });
          await allowedEdit(t, run);
        });
      }
      it(`D03 ${t.versions} ${who} UPDATE status ${state} same/forward`, async () => {
        const v = await mkVersion(fx.t1, { family: t.family, status: 'published' }), run = runner(who === 'svc' ? 'svc' : fx.o1);
        const before = await serviceRow(t.versions, v.versionId);
        await change(t, v, run, 'superseded'); await change(t, v, run, 'archived'); await change(t, v, run, 'archived');
        const after = await serviceRow(t.versions, v.versionId);
        for (const c of ['document', 'version_no', 'published_at', 'published_by', 'tenant_id', 'client_id', t.key]) expect(after?.[c]).toEqual(before?.[c]);
      });
    }
    it(`D04 ${t.versions} o1 INSERT version_no <=max and UPDATE status older draft`, async () => {
      const v = await draft(t), id = randomUUID();
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, append(t, v, id, 1))), 'rule:app.version_rules', t.versions, 'version_no', 'P0001');
      await as(fx.o1, (tx) => q(tx, append(t, v, id, 2)));
      expect(await serviceRow(t.versions, id)).toMatchObject({ version_no: 2 });
      await change(t, { ...v, versionId: id }, runner(fx.o1), 'published'); await change(t, { ...v, versionId: id }, runner(fx.o1), 'superseded');
      await guard(fx.t1, () => change(t, v, runner(fx.o1), 'published'), 'rule:app.version_rules', t.versions, 'version_no', 'P0001');
      const newest = randomUUID(); await as(fx.o1, (tx) => q(tx, append(t, v, newest, 3)));
      await change(t, { ...v, versionId: newest }, runner(fx.o1), 'published');
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: newest });
    });
    for (const column of ['kind', 'client_id', 'template_id', ...(t.family === 'form' ? ['form_kind'] : [])]) {
      it(`D05 ${t.head} o1 UPDATE ${column} draft head`, async () => {
        const v = await draft(t), template = await draft(t), copy = await draft(t, fx.t1, fx.clientA);
        const value = column === 'kind' ? sql`'client'` : column === 'form_kind' ? sql`'intake'` : sql`${column === 'template_id' ? template.headId : fx.clientA}::uuid`;
        const target = column === 'template_id' ? copy.headId : v.headId;
        await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.head)} set ${sql.identifier(column)} = ${value} where id = ${target}`)), 'immutable', t.head, column);
        await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.head)} set name = '{"en":"allowed"}'::jsonb where id = ${target}`));
        expect(await serviceRow(t.head, target)).toMatchObject({ name: { en: 'allowed' } });
      });
    }
    for (const column of [t.key, 'client_id'] as const) it(`D05 ${t.versions} o1 UPDATE ${column} draft`, async () => {
      const v = await draft(t), other = await draft(t);
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.versions)} set ${sql.identifier(column)} = ${column === 'client_id' ? fx.clientA : other.headId} where id = ${v.versionId}`)), 'immutable', t.versions, column);
      await allowedEdit(t, runner(fx.o1));
    });
    for (const state of ['in_review', 'approved', 'archived'] as const) it(`D06 ${t.versions} o1 DELETE status ${state}/never-published`, async () => {
      const v = await draft(t); await svc((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = ${state} where tenant_id = ${fx.t1} and id = ${v.versionId}`), fx.t1);
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(t.versions)} where id = ${v.versionId} returning id`)), 'delete_when', t.versions, 'status');
      const legal = await draft(t);
      expect(await as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(t.versions)} where id = ${legal.versionId} returning id`))).toEqual([{ id: legal.versionId }]);
      expect(await serviceRow(t.versions, legal.versionId)).toBeUndefined();
    });
    for (const who of ['o1', 'svc'] as const) it(`D06 ${t.versions} ${who} DELETE frozen published`, async () => {
      const v = await mkVersion(fx.t1, { family: t.family, status: 'published' }), run = runner(who === 'svc' ? 'svc' : fx.o1);
      await guard(fx.t1, () => run((tx) => q(tx, sql`delete from ${sql.identifier(t.versions)} where id = ${v.versionId}`)), 'rule:app.protect_published_version', t.versions, undefined, 'P0001');
      const legal = await draft(t); await run((tx) => q(tx, sql`delete from ${sql.identifier(t.versions)} where id = ${legal.versionId}`));
      expect(await serviceRow(t.versions, legal.versionId)).toBeUndefined();
    });
    for (const state of ['in_review', 'approved', 'published', 'superseded', 'archived'] as const) it(`D07 ${t.head} o1 DELETE head child ${state}`, async () => {
      const v = await mkVersion(fx.t1, { family: t.family, status: state === 'published' || state === 'superseded' ? 'published' : 'draft' });
      if (state !== 'published') await svc((tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = ${state} where tenant_id = ${fx.t1} and id = ${v.versionId}`), fx.t1);
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(t.head)} where id = ${v.headId}`)), 'rule:app.head_rules', t.head, undefined, 'P0001');
      const legal = await draft(t); await as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(t.head)} where id = ${legal.headId} returning id`));
      expect(await serviceRow(t.head, legal.headId)).toBeUndefined(); expect(await serviceRow(t.versions, legal.versionId)).toBeUndefined();
    });
    it(`D07 ${t.head} svc DELETE head child frozen published`, async () => {
      const v = await mkVersion(fx.t1, { family: t.family, status: 'published' });
      await guard(fx.t1, () => svc((tx) => q(tx, sql`delete from ${sql.identifier(t.head)} where tenant_id = ${fx.t1} and id = ${v.headId}`), fx.t1), 'rule:app.protect_published_version', t.versions, undefined, 'P0001');
      const legal = await draft(t); await svc((tx) => q(tx, sql`delete from ${sql.identifier(t.head)} where tenant_id = ${fx.t1} and id = ${legal.headId}`), fx.t1);
      expect(await serviceRow(t.head, legal.headId)).toBeUndefined();
    });
    it(`D08 ${t.versions} o1 INSERT version_no3 concurrent head max2`, async () => {
      const v = await draft(t); await as(fx.o1, (tx) => q(tx, append(t, v, randomUUID(), 2)));
      const a = randomUUID(), b = randomUUID();
      const outcome = await serialized(fx.o1, (tx) => q(tx, append(t, v, a, 3)), (tx) => q(tx, append(t, v, b, 3)));
      expect(outcome.status).toBe('rejected');
      await special(() => outcome.status === 'rejected' ? Promise.reject(outcome.reason) : Promise.resolve(), 'P0001', 'version_rules', t.versions, 'version_no');
      expect(await serviceRow(t.versions, b)).toBeUndefined();
      expect(await svc((tx) => q(tx, sql`select id from ${sql.identifier(t.versions)} where tenant_id = ${fx.t1} and ${sql.identifier(t.key)} = ${v.headId} and version_no = 3`), fx.t1)).toEqual([{ id: a }]);
      await as(fx.o1, (tx) => q(tx, append(t, v, b, 4))); expect(await serviceRow(t.versions, b)).toMatchObject({ version_no: 4 });
    });
    for (const who of ['o1', 'svc'] as const) for (const client of ['template', 'A'] as const) it(`D09 ${t.versions} ${who} INSERT tenant_id/client_id spoof ${client}`, async () => {
      const v = await draft(t, fx.t1, client === 'A' ? fx.clientA : null), id = randomUUID();
      await runner(who === 'svc' ? 'svc' : fx.o1)((tx) => q(tx, append(t, v, id, 2, 'draft', { tenant_id: sql`${fx.t2}::uuid`, client_id: sql`${fx.clientC}::uuid` })));
      expect(await serviceRow(t.versions, id)).toMatchObject({ tenant_id: fx.t1, client_id: client === 'A' ? fx.clientA : null });
    });
    for (const who of ['ua', 's1'] as const) it(`D09 ${t.versions} ${who} INSERT ${t.key} invisible template/B`, async () => {
      const v = await draft(t, fx.t1, who === 'ua' ? null : fx.clientB), id = randomUUID();
      await unchanged(fx.t1, () => special(() => as(fx[who], (tx) => q(tx, append(t, v, id, 2))), '23503', 'version_rules', t.versions, t.key));
      if (who === 'ua') {
        const own = await mkVersion(fx.t1, { family: t.family, clientId: fx.clientA, status: 'published' });
        expect(await as(fx.ua, (tx) => q(tx, sql`select id from ${sql.identifier(t.versions)} where id = ${own.versionId}`))).toEqual([{ id: own.versionId }]);
      } else {
        const own = await draft(t, fx.t1, fx.clientA); await as(fx.s1, (tx) => q(tx, append(t, own, id, 2)));
        expect(await serviceRow(t.versions, id)).toMatchObject({ client_id: fx.clientA, version_no: 2 });
      }
    });
    for (const operation of ['insert', 'update'] as const) for (const target of ['draft', 'other-head', 'other-tenant'] as const) it(`D10 ${t.head} svc ${operation.toUpperCase()} published_version_id ${target}`, async () => {
      const v = await draft(t), other = await mkVersion(target === 'other-tenant' ? fx.t2 : fx.t1, { family: t.family, status: 'published' });
      const pointer = target === 'draft' ? v.versionId : other.versionId, id = operation === 'insert' ? randomUUID() : v.headId;
      const statement = operation === 'update' ? sql`update ${sql.identifier(t.head)} set published_version_id = ${pointer} where tenant_id = ${fx.t1} and id = ${id}`
        : sql`insert into ${sql.identifier(t.head)} (id, tenant_id, name, kind, published_version_id${t.family === 'form' ? sql`, form_kind` : sql``}) values (${id}, ${fx.t1}, '{}'::jsonb, 'template', ${pointer}${t.family === 'form' ? sql`, 'checkin'` : sql``})`;
      await unchanged(fx.t1, () => special(() => svc((tx) => q(tx, statement), fx.t1), '23503', 'head_rules', t.head, 'published_version_id'));
      if (operation === 'insert') {
        await svc((tx) => q(tx, sql`insert into ${sql.identifier(t.head)} (id, tenant_id, name, kind${t.family === 'form' ? sql`, form_kind` : sql``}) values (${id}, ${fx.t1}, '{}'::jsonb, 'template'${t.family === 'form' ? sql`, 'checkin'` : sql``})`), fx.t1);
        expect(await serviceRow(t.head, id)).toMatchObject({ published_version_id: null });
      } else {
        await change(t, v, runner(fx.o1), 'published');
        await svc((tx) => q(tx, sql`update ${sql.identifier(t.head)} set published_version_id = ${v.versionId} where tenant_id = ${fx.t1} and id = ${id}`), fx.t1);
        expect(await serviceRow(t.head, id)).toMatchObject({ published_version_id: v.versionId });
      }
    });
    for (const operation of ['insert', 'change', 'clear'] as const) it(`D10 ${t.head} o1 ${operation.toUpperCase()} published_version_id runtime`, async () => {
      const v = await draft(t), published = await mkVersion(fx.t1, { family: t.family, status: 'published' });
      const id = operation === 'insert' ? randomUUID() : operation === 'clear' ? published.headId : v.headId;
      const statement = operation === 'insert' ? sql`insert into ${sql.identifier(t.head)} (id, tenant_id, name, kind, published_version_id${t.family === 'form' ? sql`, form_kind` : sql``}) values (${id}, ${fx.t1}, '{}'::jsonb, 'template', ${published.versionId}${t.family === 'form' ? sql`, 'checkin'` : sql``})`
        : sql`update ${sql.identifier(t.head)} set published_version_id = ${operation === 'clear' ? null : published.versionId} where id = ${id}`;
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, statement)), 'rule:app.head_rules', t.head, 'published_version_id', '42501');
      await change(t, v, runner(fx.o1), 'published');
      await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.head)} set published_version_id = published_version_id where id = ${v.headId}`));
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: v.versionId });
    });
    for (const who of ['o1', 'svc'] as const) for (const target of ['other-head', 'other-tenant'] as const) it(`D11 ${t.head} ${who} UPDATE current_version_id ${target}`, async () => {
      const v = await draft(t), other = await draft(t, target === 'other-tenant' ? fx.t2 : fx.t1), run = runner(who === 'svc' ? 'svc' : fx.o1);
      await unchanged(fx.t1, () => special(() => run((tx) => q(tx, sql`update ${sql.identifier(t.head)} set current_version_id = ${other.versionId} where id = ${v.headId}`)), '23503', 'head_rules', t.head, 'current_version_id'));
      await run((tx) => q(tx, sql`update ${sql.identifier(t.head)} set current_version_id = ${v.versionId} where id = ${v.headId}`));
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ current_version_id: v.versionId });
      await run((tx) => q(tx, sql`delete from ${sql.identifier(t.versions)} where id = ${v.versionId}`));
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ id: v.headId, current_version_id: null });
    });
    it(`D12 ${t.head}/${t.versions} o1 UPDATE status replacement/pointer immediate`, async () => {
      const v = await mkVersion(fx.t1, { family: t.family, clientId: fx.clientA, status: 'published' }), next = randomUUID();
      await as(fx.o1, (tx) => q(tx, append(t, v, next, 2)));
      await as(fx.o1, async (tx) => {
        await q(tx, sql`update ${sql.identifier(t.versions)} set status = 'superseded' where id = ${v.versionId}`);
        expect(await one(tx, sql`select published_version_id from ${sql.identifier(t.head)} where id = ${v.headId}`)).toEqual({ published_version_id: null });
        await q(tx, sql`update ${sql.identifier(t.versions)} set status = 'published' where id = ${next}`);
        expect(await one(tx, sql`select published_version_id from ${sql.identifier(t.head)} where id = ${v.headId}`)).toEqual({ published_version_id: next });
      });
      expect(await as(fx.ua, (tx) => q(tx, sql`select id, status::text as status from ${sql.identifier(t.versions)} where ${sql.identifier(t.key)} = ${v.headId} order by version_no`)))
        .toEqual([{ id: v.versionId, status: 'superseded' }, { id: next, status: 'published' }]);
      await change(t, { ...v, versionId: next }, runner(fx.o1), 'archived');
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: null });
      expect(await as(fx.ua, (tx) => q(tx, sql`select id from ${sql.identifier(t.head)} where id = ${v.headId}`))).toEqual([{ id: v.headId }]);
    });
    for (const operation of ['insert', 'update'] as const) for (const state of ['published', 'superseded'] as const) it(`D13 ${t.versions} svc ${operation.toUpperCase()} published_at null/${state}`, async () => {
      const v = await draft(t), id = operation === 'insert' ? randomUUID() : v.versionId;
      const bad = operation === 'insert' ? append(t, v, id, 2, state) : sql`update ${sql.identifier(t.versions)} set status = ${state} where tenant_id = ${fx.t1} and id = ${id}`;
      await unchanged(fx.t1, async () => { const error = await expectCode(() => svc((tx) => q(tx, bad), fx.t1), '23514'); expect(error.constraint_name).toBe(t.versions + '_published_at_ck'); });
      await svc((tx) => q(tx, operation === 'insert' ? append(t, v, id, 2, state, { published_at: sql`'2026-01-01T00:00:00Z'::timestamptz`, published_by: sql`${fx.o1.userId}::uuid` })
        : sql`update ${sql.identifier(t.versions)} set status = ${state}, published_at = '2026-01-01T00:00:00Z', published_by = ${fx.o1.userId} where tenant_id = ${fx.t1} and id = ${id}`), fx.t1);
      expect(await serviceRow(t.versions, id)).toMatchObject({ status: state, published_at: new Date('2026-01-01T00:00:00Z'), published_by: fx.o1.userId });
    });
    it(`D14 ${t.versions} o1 UPDATE status published concurrent v2/v3`, async () => {
      const v = await draft(t), a = randomUUID(), b = randomUUID();
      await as(fx.o1, async (tx) => { await q(tx, append(t, v, a, 2)); await q(tx, append(t, v, b, 3)); });
      const outcome = await serialized(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = 'published' where id = ${a}`), (tx) => q(tx, sql`update ${sql.identifier(t.versions)} set status = 'published' where id = ${b}`));
      const error = await expectCode(() => outcome.status === 'rejected' ? Promise.reject(outcome.reason) : Promise.resolve(), '23505');
      expect(error.constraint_name).toBe(t.versions + '_one_published_uq');
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: a }); expect(await serviceRow(t.versions, b)).toMatchObject({ status: 'draft', published_at: null });
      await change(t, { ...v, versionId: a }, runner(fx.o1), 'superseded'); await change(t, { ...v, versionId: b }, runner(fx.o1), 'published');
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: b });
      // Hold the same advisory lock and prove ordinary draft edits finish while it remains held.
      const held = signal<void>(), release = signal<void>();
      const lock = svc(async (tx) => { await q(tx, sql`select pg_advisory_xact_lock(hashtextextended(${v.headId}::text, 0))`); held.resolve(); await release.promise; }, fx.t1);
      try { await held.promise; await as(fx.o1, (tx) => q(tx, sql`update ${sql.identifier(t.versions)} set change_note = 'unlocked' where id = ${v.versionId}`)); }
      finally { release.resolve(); await lock; }
      expect(await serviceRow(t.versions, v.versionId)).toMatchObject({ change_note: 'unlocked' });
    });
    it(`D15 ${t.versions} s2 UPDATE status draft→published missing/${t.module}.publish`, async () => {
      const v = await draft(t), actor = await mkMembership(fx.s2);
      await guard(fx.t1, () => change(t, v, runner(actor), 'published'), 'perm_transitions', t.versions, 'status');
      await svc((tx) => q(tx, sql`update memberships set permissions = ${JSON.stringify({ client_scope: 'all', modules: { [t.module]: ['publish'] } })}::jsonb where tenant_id = ${fx.t1} and id = ${actor.membershipId}`), fx.t1);
      await as(actor, async (tx) => { await q(tx, sql`update ${sql.identifier(t.versions)} set status = 'published' where id = ${v.versionId}`);
        expect(await one(tx, sql`select published_at = now() as stamped, published_by from ${sql.identifier(t.versions)} where id = ${v.versionId}`)).toEqual({ stamped: true, published_by: actor.userId }); });
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: v.versionId });
    });
    for (const who of ['o1', 's2'] as const) for (const state of ['in_review', 'approved', 'superseded', 'archived'] as const) it(`D16 ${t.versions} ${who} INSERT status ${state}/published`, async () => {
      const actor = who === 'o1' ? fx.o1 : await mkMembership(fx.s2, { permissions: { client_scope: 'all', modules: { [t.module]: ['publish'] } } });
      const v = await draft(t), id = randomUUID();
      await guard(fx.t1, () => as(actor, (tx) => q(tx, append(t, v, id, 2, state))), 'transitions', t.versions, 'status');
      await as(actor, async (tx) => { await q(tx, append(t, v, id, 2, 'published'));
        expect(await one(tx, sql`select published_at = now() as stamped, published_by from ${sql.identifier(t.versions)} where id = ${id}`)).toEqual({ stamped: true, published_by: actor.userId }); });
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: id });
    });
    for (const column of ['published_at', 'published_by', 'superseded_at'] as const) it(`D16 ${t.versions} o1 INSERT ${column} non-null/published`, async () => {
      const v = await draft(t), id = randomUUID();
      await guard(fx.t1, () => as(fx.o1, (tx) => q(tx, append(t, v, id, 2, 'published', { [column]: column === 'published_by' ? sql`${fx.o1.userId}::uuid` : sql`now()` }))), 'insert_eq', t.versions, column);
      await as(fx.o1, (tx) => q(tx, append(t, v, id, 2, 'published'))); expect(await serviceRow(t.head, v.headId)).toMatchObject({ published_version_id: id });
    });
    for (const who of ['o1', 'svc'] as const) for (const state of ['superseded', 'archived-ever', 'archived-never'] as const) it(`D17 ${t.versions} ${who} UPDATE status ${state}→draft`, async () => {
      const v = await mkVersion(fx.t1, { family: t.family, status: state === 'archived-never' ? 'draft' : 'published' }), run = runner(who === 'svc' ? 'svc' : fx.o1);
      await change(t, v, runner('svc'), state === 'superseded' ? 'superseded' : 'archived');
      await guard(fx.t1, () => change(t, v, run, 'draft'), 'rule:app.protect_published_version', t.versions, 'status', 'P0001');
      await allowedEdit(t, run);
    });
    for (const [who, operation] of [['s2', 'insert'], ['svc', 'insert'], ['svc', 'update']] as const) for (const target of ['client-copy', 'foreign-template'] as const) {
      // Runtime template_id UPDATE is independently refused by D05; service exercises both operations.
      it(`D23 ${t.head} ${who} ${operation.toUpperCase()} template_id ${target}`, async () => {
        const v = await draft(t, fx.t1, fx.clientA), bad = await draft(t, target === 'foreign-template' ? fx.t2 : fx.t1, target === 'client-copy' ? fx.clientB : null), good = await draft(t);
        const id = operation === 'insert' ? randomUUID() : v.headId, run = runner(who === 'svc' ? 'svc' : fx.s2);
        const statement = (template: string) => operation === 'update' ? sql`update ${sql.identifier(t.head)} set template_id = ${template} where id = ${id}`
          : sql`insert into ${sql.identifier(t.head)} (id, tenant_id, client_id, kind, name, template_id${t.family === 'form' ? sql`, form_kind` : sql``}) values (${id}, ${fx.t1}, ${fx.clientA}, 'client', '{}'::jsonb, ${template}${t.family === 'form' ? sql`, 'checkin'` : sql``})`;
        await unchanged(fx.t1, () => special(() => run((tx) => q(tx, statement(bad.headId))), '23503', 'template_ref_check', t.head, 'template_id'));
        await run((tx) => q(tx, statement(good.headId))); expect(await serviceRow(t.head, id)).toMatchObject({ template_id: good.headId });
      });
    }
    if (t.family !== 'form') it(`D23 ${t.head} svc UPDATE subscription_id template non-null`, async () => {
      const v = await draft(t);
      await unchanged(fx.t1, async () => { const error = await expectCode(() => svc((tx) => q(tx, sql`update ${sql.identifier(t.head)} set subscription_id = ${fx.subA} where tenant_id = ${fx.t1} and id = ${v.headId}`), fx.t1), '23514'); expect(error.constraint_name).toBe(t.head + '_client_sub_ck'); });
      await svc((tx) => q(tx, sql`update ${sql.identifier(t.head)} set subscription_id = null, name = '{"en":"allowed"}' where tenant_id = ${fx.t1} and id = ${v.headId}`), fx.t1);
      expect(await serviceRow(t.head, v.headId)).toMatchObject({ subscription_id: null, name: { en: 'allowed' } });
    });
  }

  it('D18 entity_client svc SELECT every allowlisted entity real UUID/template/tenant', async () => {
    const f = await buildPrivateFixture(), submission = randomUUID(), msg = randomUUID(), flag = randomUUID(), ai = randomUUID(), session = await mkSession(f.t1, f.clientA);
    await svc(async (tx) => {
      await q(tx, sql`insert into form_submissions (id, tenant_id, client_id, form_version_id, form_id, form_kind) values (${submission}, ${f.t1}, ${f.clientA}, ${f.templateFormPub}, ${f.templateForm}, 'checkin')`);
      await q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, client_uuid) values (${msg}, ${f.t1}, ${f.convA}, ${f.ua.userId}, 'client', ${randomUUID()})`);
      await q(tx, sql`insert into client_flags (id, tenant_id, client_id, kind, severity, detail) values (${flag}, ${f.t1}, ${f.clientA}, 'injury', 'low', '{"note":"flag"}')`);
      await q(tx, sql`insert into ai_requests (id, tenant_id, client_id, kind, input, created_by) values (${ai}, ${f.t1}, ${f.clientA}, 'program', '{}', ${f.o1.userId})`);
    }, f.t1);
    const entities: readonly [string, string, string | null][] = [ ['clients', f.clientA, f.clientA], ['memberships', f.ua.membershipId, f.clientA], ['invitations', f.invOwnerStaff, null], ['packages', f.packageT1, null], ['subscriptions', f.subA, f.clientA], ['payments', f.payA, f.clientA], ['programs', f.templateProgram, null], ['program_versions', f.copyPubA, f.clientA], ['nutrition_plans', f.planCopyA, f.clientA], ['nutrition_plan_versions', f.planPubA, f.clientA], ['forms', f.templateForm, null], ['form_versions', f.templateFormPub, null], ['form_submissions', submission, f.clientA], ['calendar_events', f.eventA, f.clientA], ['workout_sessions', session, f.clientA], ['conversations', f.convInternal, null], ['messages', msg, f.clientA], ['media', f.mediaA, f.clientA], ['tasks', f.taskT1, null], ['client_flags', flag, f.clientA], ['client_notes', f.noteA, f.clientA], ['ai_requests', ai, f.clientA], ['tenants', f.t1, null] ];
    for (const [entity, id, client] of entities) expect(await svc((tx) => one(tx, sql`select app.entity_client(${entity}, ${id}, ${f.t1}::uuid) as client`), f.t1)).toEqual({ client });
  });
  for (const [entity, value, code] of [['unknown', 'valid', '42501'], ['payments', 'bad', '22023'], ['payments', 'missing', 'P0002'], ['payments', 'foreign', 'P0002'], ['tenants', 'foreign', 'P0002']] as const) it(`D18 entity_client svc SELECT ${entity}/${value} invalid`, async () => {
    const id = value === 'bad' ? 'not-uuid' : value === 'missing' ? randomUUID() : value === 'foreign' ? entity === 'tenants' ? fx.t2 : fx.payC : fx.payA;
    await unchanged(fx.t1, () => special(() => svc((tx) => q(tx, sql`select app.entity_client(${entity}, ${id}, ${fx.t1}::uuid)`), fx.t1), code, 'entity_client', entity === 'unknown' ? undefined : entity, entity === 'unknown' ? undefined : 'id'));
    expect(await svc((tx) => one(tx, sql`select app.entity_client('payments', ${fx.payA}, ${fx.t1}::uuid) as client`), fx.t1)).toEqual({ client: fx.clientA });
  });
  for (const who of ['o1', 'ua'] as const) for (const fn of ['erase_client', 'close_tenant'] as const) it(`D19 ${fn} ${who} EXECUTE service-only`, async () => {
    await unchanged(fx.t1, async () => { const error = await expectPrivilege(() => as(fx[who], (tx) => q(tx, fn === 'erase_client' ? sql`select app.erase_client(${fx.t1}::uuid, ${fx.clientA}::uuid)` : sql`select app.close_tenant(${fx.t1}::uuid)`))); expect(error.message).toContain(`function ${fn}`); });
    expect(await as(fx[who], (tx) => q(tx, sql`select id from clients where id = ${fx.clientA}`))).toEqual([{ id: fx.clientA }]);
  });
  for (const fn of ['erase_client', 'close_tenant'] as const) it(`D19 ${fn} svc EXECUTE forged JWT identity`, async () => {
    const f = await buildPrivateFixture();
    await unchanged(f.t1, () => special(() => svc(async (tx) => { await q(tx, sql`select set_config('request.jwt.claim.sub', ${f.o1.userId}, true)`); return q(tx, fn === 'erase_client' ? sql`select app.erase_client(${f.t1}::uuid, ${f.clientA}::uuid)` : sql`select app.close_tenant(${f.t1}::uuid)`); }, f.t1), '42501', fn));
    await svc((tx) => q(tx, fn === 'erase_client' ? sql`select app.erase_client(${f.t1}::uuid, ${f.clientA}::uuid)` : sql`select app.close_tenant(${f.t1}::uuid)`), f.t1);
    expect(await serviceRow(fn === 'erase_client' ? 'clients' : 'tenants', fn === 'erase_client' ? f.clientA : f.t1)).toBeUndefined();
  });
  it('D20 erase_client svc DELETE full frozen client graph/all linked users', async () => {
    const f = await buildPrivateFixture(), second = await mkMembership(f.ua), session = await mkSession(f.t1, f.clientA), form = await mkVersion(f.t1, { family: 'form', clientId: f.clientA, status: 'published' });
    await svc(async (tx) => {
      for (const actor of [f.ua, second]) {
        const notification = randomUUID();
        await q(tx, sql`insert into notifications (id, tenant_id, user_id, type, title) values (${notification}, ${f.t1}, ${actor.userId}, 'private', '{"en":"personal"}')`);
        await q(tx, sql`insert into notification_deliveries (tenant_id, notification_id, user_id, channel) values (${f.t1}, ${notification}, ${actor.userId}, 'inapp')`);
        await q(tx, sql`insert into push_subscriptions (tenant_id, user_id, endpoint, keys) values (${f.t1}, ${actor.userId}, ${'https://push.example.test/' + actor.userId}, '{"p256dh":"p","auth":"a"}')`);
        await q(tx, sql`insert into user_preferences (tenant_id, user_id, preferences) values (${f.t1}, ${actor.userId}, '{"private":true}')`);
        await q(tx, sql`insert into idempotency_keys (tenant_id, user_id, key, request_hash, status_code, response_body) values (${f.t1}, ${actor.userId}, 'private', 'hash', 200, '{"personal":true}')`);
      }
      await q(tx, sql`insert into consents (tenant_id, user_id, kind, version, locale) values (${f.t1}, ${second.userId}, 'terms', 'v1', 'en')`);
      await q(tx, sql`insert into form_submissions (tenant_id, client_id, form_version_id, form_id, form_kind, calendar_event_id, subscription_id, client_uuid) values (${f.t1}, ${f.clientA}, ${form.versionId}, ${form.headId}, 'checkin', ${f.eventA}, ${f.subA}, ${randomUUID()})`);
      await q(tx, sql`insert into set_logs (tenant_id, client_id, session_id, exercise_id, set_no, client_uuid, client_updated_at) values (${f.t1}, ${f.clientA}, ${session}, ${f.exerciseSystem}, 1, ${randomUUID()}, now())`);
      await q(tx, sql`insert into meal_logs (tenant_id, client_id, plan_version_id, local_date, client_uuid) values (${f.t1}, ${f.clientA}, ${f.planPubA}, current_date, ${randomUUID()})`);
      await q(tx, sql`insert into supplement_logs (tenant_id, client_id, plan_version_id, supplement_id, local_date, taken, client_uuid) values (${f.t1}, ${f.clientA}, ${f.planPubA}, 's', current_date, true, ${randomUUID()})`);
      await q(tx, sql`insert into measurement_sets (tenant_id, client_id, local_date, "values", client_uuid) values (${f.t1}, ${f.clientA}, current_date, '[]', ${randomUUID()})`);
      await q(tx, sql`insert into progress_photo_sets (tenant_id, client_id, local_date, poses, client_uuid) values (${f.t1}, ${f.clientA}, current_date, '[]', ${randomUUID()})`);
      await q(tx, sql`insert into inbody_records (tenant_id, client_id, local_date, raw_media_id) values (${f.t1}, ${f.clientA}, current_date, ${f.mediaA})`);
      await q(tx, sql`insert into ai_requests (tenant_id, client_id, kind, input, created_by) values (${f.t1}, ${f.clientA}, 'private', '{"personal":true}', ${f.o1.userId})`);
      await q(tx, sql`insert into client_flags (tenant_id, client_id, kind, severity, detail) values (${f.t1}, ${f.clientA}, 'injury', 'low', '{"note":"private"}')`);
      await q(tx, sql`insert into events (tenant_id, client_id, type, aggregate, aggregate_id, payload) values (${f.t1}, ${f.clientA}, 'message.sent', 'clients', ${f.clientA}, '{"personal":true}')`);
    }, f.t1);
    const msg = randomUUID();
    await as(f.ua, (tx) => q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, client_uuid, body) values (${msg}, ${f.t1}, ${f.convA}, ${f.ua.userId}, 'client', ${randomUUID()}, 'personal')`));
    await as(f.ua, (tx) => q(tx, sql`update messages set body = 'edited personal' where id = ${msg}`));
    const otherTenant = await snapshot(f.t2), otherClient = await clientSnapshot(f.t1, f.clientB);
    const consentBefore = await svc((tx) => q(tx, sql`select * from consents where tenant_id = ${f.t1} order by id`), f.t1);
    await unchanged(f.t1, () => special(() => svc((tx) => q(tx, sql`delete from clients where tenant_id = ${f.t1} and id = ${f.clientA}`), f.t1), 'P0001', 'protect_published_version'));
    const expected = await svc(async (tx) => {
      const audit = await one<{ n: number }>(tx, sql`select count(*)::int as n from audit_log where tenant_id = ${f.t1} and client_id = ${f.clientA}`);
      let cascade = 0;
      for (const table of ['memberships', 'staff_client_assignments', 'invitations', 'clients', 'client_notes', 'client_flags', 'subscriptions', 'subscription_events', 'client_entitlement_overrides', 'payments', 'programs', 'program_versions', 'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions', 'ai_requests', 'media']) {
        cascade += (await one<{ n: number }>(tx, sql`select count(*)::int as n from ${sql.identifier(table)} where tenant_id = ${f.t1} and ${sql.identifier(table === 'clients' ? 'id' : 'client_id')} = ${f.clientA}`)).n;
      }
      return { audit_log: audit.n + cascade, events: 1 };
    }, f.t1);
    const counts = await withErasureTx(f.t1, 'erase private graph', (tx) => one<{ deleted: unknown }>(tx, sql`select app.erase_client(${f.t1}::uuid, ${f.clientA}::uuid) as deleted`));
    expect(counts.deleted).toEqual(expected);
    // Discover column presence only to sweep actual data, never to derive a permission oracle.
    await svc(async (tx) => {
      const clientTables = await q<{ table_name: string }>(tx, sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'client_id' order by table_name`);
      for (const { table_name: table } of clientTables) expect(await q(tx, sql`select 1 from ${sql.identifier(table)} where tenant_id = ${f.t1} and client_id = ${f.clientA}`), table).toEqual([]);
      for (const table of ['notifications', 'notification_deliveries', 'push_subscriptions', 'user_preferences', 'idempotency_keys']) expect(await q(tx, sql`select 1 from ${sql.identifier(table)} where tenant_id = ${f.t1} and user_id in (${f.ua.userId}::uuid, ${second.userId}::uuid)`), table).toEqual([]);
      expect(await q(tx, sql`select client_id, entity_id, action, actor_role, actor_user_id, before, after, reason from audit_log where tenant_id = ${f.t1} and entity = 'clients' and entity_id = ${f.clientA}`))
        .toEqual([{ client_id: null, entity_id: f.clientA, action: 'client.erase', actor_role: 'service', actor_user_id: null, before: null, after: { deleted: expected }, reason: 'erasure: erase private graph' }]);
    }, f.t1);
    expect(await serviceRow('clients', f.clientA)).toBeUndefined(); expect(await clientSnapshot(f.t1, f.clientB)).toEqual(otherClient);
    expect(await snapshot(f.t2)).toEqual(otherTenant);
    expect(await svc((tx) => q(tx, sql`select * from consents where tenant_id = ${f.t1} order by id`), f.t1)).toEqual(consentBefore);
  });
  it('D21 erase_client/close_tenant svc EXECUTE repeated/unknown and full tenant closure', async () => {
    const f = await buildPrivateFixture(), second = await mkClient(f.t1);
    await svc((tx) => q(tx, sql`select app.erase_client(${f.t1}::uuid, ${f.clientA}::uuid)`), f.t1);
    await unchanged(f.t1, () => special(() => svc((tx) => q(tx, sql`select app.erase_client(${f.t1}::uuid, ${f.clientA}::uuid)`), f.t1), 'P0002', 'erase_client', 'clients', 'id'));
    await svc((tx) => q(tx, sql`select app.erase_client(${f.t1}::uuid, ${second}::uuid)`), f.t1); expect(await serviceRow('clients', second)).toBeUndefined();
    await svc(async (tx) => {
      await q(tx, sql`insert into job_runs (tenant_id, job) values (${f.t1}, 'private')`);
      await q(tx, sql`insert into idempotency_keys (tenant_id, user_id, key, request_hash, status_code) values (${f.t1}, ${f.o1.userId}, 'close', 'hash', 200)`);
      await q(tx, sql`insert into events (tenant_id, type, aggregate, aggregate_id) values (${f.t1}, 'message.sent', 'clients', ${f.clientB})`);
    }, f.t1);
    await unchanged(f.t1, () => special(() => svc((tx) => q(tx, sql`delete from tenants where id = ${f.t1}`), f.t1), 'P0001', 'protect_published_version'));
    await unchanged(f.t1, () => special(() => svc((tx) => q(tx, sql`select app.close_tenant(${randomUUID()}::uuid)`), f.t1), 'P0002', 'close_tenant', 'tenants', 'id'));
    const other = await snapshot(f.t2), system = await svc((tx) => q(tx, sql`select id from exercises where tenant_id is null union all select id from foods where tenant_id is null order by id`));
    await withErasureTx(f.t1, 'close private tenant', (tx) => q(tx, sql`select app.close_tenant(${f.t1}::uuid)`));
    for (const table of graphTables) expect(await snapshot(f.t1, [table]), table).toEqual([{ rows: '[]' }]);
    expect(await snapshot(f.t2)).toEqual(other);
    expect(await svc((tx) => q(tx, sql`select id from exercises where tenant_id is null union all select id from foods where tenant_id is null order by id`))).toEqual(system);
  });
  for (const t of families) it(`D22 ${t.head}/${t.versions} o1 DELETE frozen with forged app.erasure on`, async () => {
    const v = await mkVersion(fx.t1, { family: t.family, status: 'published' });
    for (const table of [t.versions, t.head]) {
      await guard(fx.t1, () => as(fx.o1, async (tx) => { await q(tx, sql`select set_config('app.erasure', 'on', true)`); return q(tx, sql`delete from ${sql.identifier(table)} where id = ${table === t.head ? v.headId : v.versionId}`); }), table === t.head ? 'rule:app.head_rules' : 'rule:app.protect_published_version', table, undefined, 'P0001');
      const legal = await draft(t); await as(fx.o1, (tx) => q(tx, sql`delete from ${sql.identifier(t.head)} where id = ${legal.headId}`)); expect(await serviceRow(t.head, legal.headId)).toBeUndefined();
    }
  });
  for (const reason of ['', ' ', 'a', 'ab', ' ab ']) it(`D22 withErasureTx svc EXECUTE reason=${JSON.stringify(reason)} before callback`, async () => {
    let invoked = false;
    await expect(withErasureTx(fx.t1, reason, async () => { invoked = true; })).rejects.toThrow('withErasureTx needs a reason'); expect(invoked).toBe(false);
    expect(await withErasureTx(fx.t1, 'valid reason', (tx) => one(tx, sql`select app.uid() as uid, current_setting('app.erasure') as flag, current_setting('app.service_reason') as reason`)))
      .toEqual({ uid: null, flag: 'on', reason: 'erasure: valid reason' });
    expect(await withServiceTx(fx.t1, 'later service', (tx) => one(tx, sql`select coalesce(current_setting('app.erasure', true), '') = 'on' as flag, app.uid() as uid`))).toEqual({ flag: false, uid: null });
  });
  it('D22 erasure svc EXECUTE identity-free ordinary service function establishes flag', async () => {
    const tenant = await mkTenant(), client = await mkClient(tenant);
    await svc((tx) => q(tx, sql`select app.erase_client(${tenant}::uuid, ${client}::uuid)`), tenant);
    expect(await serviceRow('clients', client)).toBeUndefined();
  });
});
