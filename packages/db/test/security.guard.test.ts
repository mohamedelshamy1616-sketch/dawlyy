import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership, mkVersion, mkSession, mkPackage, mkSubscription } from './factories';
import { as, svc, q, one, serviceRow, expectGuard, expectCode, expectPrivilege, expectNoEffect, withProbe, setProbeGuard, dropProbe } from './helpers';
import { GUARDS, GUARD_COLUMNS, INSERT_ACTORS, MATRIX_STATES, SPECIAL_PRECEDENCE, NO_ALTERNATE, type GuardConfig } from './guard-matrix';
import { makeRow, insertRow, type MatrixTable } from './matrix';

let fx: Fixture;
beforeAll(async () => {
  fx = await buildFixture();
});
afterAll(async () => {
  try {
    await dropProbe();
    await truncateAll();
  } finally {
    await closeDb();
  }
});
type Row = Record<string, unknown>;
type Who = 'o1' | 's1' | 'ua';
function insertProbe(id: string, patch: Record<string, SQL> = {}): SQL {
  const row = { id: sql`${id}`, tenant_id: sql`${fx.t1}`, client_id: sql`${fx.clientA}`, ...patch };
  return sql`insert into dawlyy_probe.t(${sql.join(Object.keys(row).map(sql.identifier), sql`,`)}) values(${sql.join(Object.values(row), sql`,`)})`;
}
async function seed(patch: Record<string, SQL> = {}): Promise<string> {
  const id = randomUUID();
  await svc(tx => tx.execute(insertProbe(id, patch)));
  return id;
}
async function probeImage(): Promise<unknown> {
  return svc(tx => q(tx, sql`select to_jsonb(t) as row from dawlyy_probe.t t order by id`));
}
async function refused(ctx: AuthContext, statement: SQL, key: string, column?: string): Promise<void> {
  const before = await probeImage();
  const e = await expectGuard(as(ctx, tx => tx.execute(statement)), key, column);
  expect(e.table_name).toBe('t');
  expect(await probeImage()).toEqual(before);
}
async function updateProbe(ctx: AuthContext, id: string, assignments: SQL): Promise<Row> {
  return as(ctx, async tx => {
    const result = await one<{ row: Row }>(tx, sql`update dawlyy_probe.t set ${assignments} where id=${id} returning to_jsonb(t) as row`);
    return result.row;
  });
}
async function notes(ctx: AuthContext, id: string): Promise<void> {
  expect(await updateProbe(ctx, id, sql`notes='allowed'`)).toMatchObject({ notes: 'allowed' });
}
async function stamp(ctx: AuthContext, statement: SQL, expected: Record<string, 'uid' | 'role' | 'now' | 'null'>): Promise<Row> {
  return as(ctx, async tx => {
    const { row } = await one<{ row: Row }>(tx, sql`${statement} returning to_jsonb(t) as row`);
    const { clock } = await one<{ clock: string }>(tx, sql`select now()::text as clock`);
    for (const [col, token] of Object.entries(expected)) {
      if (token === 'now') {
        expect(new Date(String(row[col])).getTime()).toBe(new Date(clock).getTime());
        expect(await one(tx, sql`select ${sql.identifier(col)} = now() as exact from dawlyy_probe.t where id=${row.id}`)).toEqual({exact:true});
      }
      else expect(row[col]).toBe(token === 'uid' ? ctx.userId : token === 'role' ? ctx.role : null);
    }
    return row;
  });
}
function engine(id: string, title: string, config: GuardConfig, body: () => Promise<void>): void {
  it(`${id} dawlyy_probe.t ${title}`, () => withProbe(config, body));
}
async function permittedStaff(actions: string[]): Promise<AuthContext> {
  return mkMembership(fx.s1, { permissions: { client_scope: 'assigned', modules: { billing: actions } } });
}
async function setActions(ctx: AuthContext, actions: string[]): Promise<AuthContext> {
  const permissions = { client_scope: 'assigned' as const, modules: { billing: actions } };
  await svc(tx => tx.execute(sql`update memberships set permissions=${JSON.stringify(permissions)}::jsonb where id=${ctx.membershipId}`));
  return { ...ctx, permissions };
}

describe('guard engine', () => {
  for (const who of ['o1', 's1', 'ua'] as const) {
    engine('G01', `${who} UPDATE tenant_id pending`, { immutable: ['tenant_id'], client_update: ['notes'] }, async () => {
      const id = await seed();
      await refused(fx[who], sql`update dawlyy_probe.t set tenant_id=${fx.t2} where id=${id}`, 'immutable', 'tenant_id');
      await notes(fx[who], id);
    });
  }
  for (const value of [null, '2002-01-01T00:00:00Z']) {
    engine('G02', `o1 UPDATE verified_at set-once -> ${value}`, { set_once: ['verified_at'] }, async () => {
      const id = await seed();
      expect(await updateProbe(fx.o1, id, sql`verified_at='2001-01-01T00:00:00Z'`)).toMatchObject({ verified_at: '2001-01-01T00:00:00+00:00' });
      await refused(fx.o1, sql`update dawlyy_probe.t set verified_at=${value} where id=${id}`, 'set_once', 'verified_at');
      await notes(fx.o1, id);
      expect(await updateProbe(fx.o1, id, sql`verified_at='2001-01-01T00:00:00Z'`)).toMatchObject({ verified_at: '2001-01-01T00:00:00+00:00' });
    });
  }
  for (const who of ['s1', 'ua'] as const) {
    engine('G03', `${who} UPDATE state pending universal allowlist`, { update_allow: ['notes'] }, async () => {
      const id = await seed();
      await refused(fx[who], sql`update dawlyy_probe.t set state='verified' where id=${id}`, 'update_allow', 'state');
      await notes(fx[who], id);
    });
  }
  for (const who of ['s1', 'ua'] as const) {
    engine('G04', `${who} UPDATE ${who === 'ua' ? 'state' : 'notes'} pending role allowlist`, { client_update: ['notes'], staff_update: ['state'] }, async () => {
      const id = await seed();
      await refused(fx[who], who === 'ua' ? sql`update dawlyy_probe.t set state='verified' where id=${id}` : sql`update dawlyy_probe.t set notes='forged' where id=${id}`, who === 'ua' ? 'client_update' : 'staff_update', who === 'ua' ? 'state' : 'notes');
      if (who === 'ua') {
        await notes(fx.ua, id);
      }
      else expect(await updateProbe(fx.s1, id, sql`state='verified'`)).toMatchObject({ state: 'verified' });
    });
  }
  engine('G05', 'ua/o1 UPDATE notes/state pending fail-closed and owner universal allowlist', { staff_update: ['state'] }, async () => {
    const id = await seed();
    await refused(fx.ua, sql`update dawlyy_probe.t set notes='forged' where id=${id}`, 'client_update');
    await setProbeGuard({ staff_update: ['state'], client_update: ['notes'] });
    await notes(fx.ua, id);
    await notes(fx.o1, id);
    await setProbeGuard({ update_allow: ['notes'] });
    await refused(fx.o1, sql`update dawlyy_probe.t set state='verified' where id=${id}`, 'update_allow', 'state');
    await notes(fx.o1, id);
  });
  for (const who of ['o1', 'ua'] as const) {
    engine('G06', `${who} INSERT ${who === 'ua' ? 'state' : 'verified_at'} pending equality`, { insert_eq: { verified_at: null }, client_insert_eq: { state: 'pending' } }, async () => {
      const id = randomUUID();
      await refused(fx[who], insertProbe(id, who === 'ua' ? { state: sql`'verified'` } : { verified_at: sql`'2001-01-01T00:00:00Z'` }), who === 'ua' ? 'client_insert_eq' : 'insert_eq', who === 'ua' ? 'state' : 'verified_at');
      await as(fx[who], tx => tx.execute(insertProbe(id)));
      expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject({ verified_at: null, state: 'pending' });
    });
  }
  for (const who of ['o1', 's1', 'ua'] as const) {
    engine('G07', `${who} INSERT created_by and SELECT resolver tokens`, { stamp_insert: { created_by: 'uid' } }, async () => {
      const ctx = fx[who];
      const id = randomUUID();
      await stamp(ctx, insertProbe(id, { created_by: sql`${fx.ub.userId}` }), { created_by: 'uid' });
      const before = await probeImage();
      const e = await expectCode(as(ctx, tx => tx.execute(sql`select app.guard_resolve('{"notes":"invalid"}'::jsonb,app.role())`)), 'P0001');
      expect(e.detail).toBe('guard:stamp');
      expect(e.column_name).toBe('notes');
      expect(e.table_name).toBeUndefined();
      expect(await probeImage()).toEqual(before);
      await as(ctx, async tx => {
        const { resolved } = await one<{ resolved: Row }>(tx, sql`select app.guard_resolve('{"created_by":"uid","state":"role","verified_at":"now","notes":"null"}'::jsonb,app.role()) as resolved`);
        expect(resolved).toMatchObject({ created_by: ctx.userId, state: ctx.role, notes: null });
        expect(new Date(String(resolved.verified_at)).getTime()).toBe(new Date((await one<{ clock: string }>(tx, sql`select now()::text as clock`)).clock).getTime());
      });
    });
  }
  engine('G08', 'ua UPDATE updated_at pending clock exemption applies only to allowlist', { client_update: ['notes'], stamp_update: { updated_at: 'now' } }, async () => {
    const id = await seed();
    await stamp(fx.ua, sql`update dawlyy_probe.t set notes='allowed',updated_at='2001-01-01T00:00:00Z' where id=${id}`, { updated_at: 'now' });
    await setProbeGuard({ client_update: ['notes'], stamp_update: { updated_at: 'now' }, immutable: ['updated_at'] });
    await refused(fx.ua, sql`update dawlyy_probe.t set updated_at='2000-01-01T00:00:00Z' where id=${id}`, 'immutable', 'updated_at');
    await setProbeGuard({ client_update: ['notes'], stamp_update: { updated_at: 'now' } });
    await stamp(fx.ua, sql`update dawlyy_probe.t set notes='allowed',updated_at='2001-01-01T00:00:00Z' where id=${id}`, { updated_at: 'now' });
  });
  for (const state of ['verified', null]) {
    engine('G09', `o1 UPDATE amount OLD ${state} overlapping editable rules`, { editable_in: [{ column: 'state', states: ['pending', null], cols: ['amount'] }, { column: 'state', states: ['pending'], cols: ['amount'] }] }, async () => {
      const id = await seed({ state: sql`${state}` });
      await refused(fx.o1, sql`update dawlyy_probe.t set amount=120,state='pending' where id=${id}`, 'editable_in', 'amount');
      const legal = await seed();
      expect(await updateProbe(fx.o1, legal, sql`amount=120,state='verified'`)).toMatchObject({ amount: 120, state: 'verified' });
      if (state === null) {
        await setProbeGuard({ editable_in: [{ column: 'state', states: [null], cols: ['amount'] }] });
        expect(await updateProbe(fx.o1, id, sql`amount=120`)).toMatchObject({ amount: 120, state: null });
      }
    });
  }
  engine('G10', 'o1 INSERT/UPDATE state pending/verified global machine', { transitions: { column: 'state', insert: ['pending'], edges: [['pending', 'verified']] } }, async () => {
    const id = randomUUID();
    await refused(fx.o1, insertProbe(id, { state: sql`'rejected'` }), 'transitions', 'state');
    await as(fx.o1, tx => tx.execute(insertProbe(id)));
    expect(await updateProbe(fx.o1, id, sql`state='verified'`)).toMatchObject({ state: 'verified' });
    await refused(fx.o1, sql`update dawlyy_probe.t set state='pending' where id=${id}`, 'transitions', 'state');
    expect(await updateProbe(fx.o1, id, sql`state='verified'`)).toMatchObject({ state: 'verified' });
  });
  engine('G11', 'ua INSERT/UPDATE state pending client-only machine', { client_update: ['state'], client_transitions: { column: 'state', insert: ['pending'], edges: [] } }, async () => {
    const id = randomUUID();
    await refused(fx.ua, insertProbe(id, { state: sql`'verified'` }), 'client_transitions', 'state');
    await as(fx.ua, tx => tx.execute(insertProbe(id)));
    await refused(fx.ua, sql`update dawlyy_probe.t set state='verified' where id=${id}`, 'client_transitions', 'state');
    expect(await updateProbe(fx.ua, id, sql`state='pending'`)).toMatchObject({ state: 'pending' });
  });
  engine('G12', 'o1 INSERT/UPDATE state verified transition stamps', { transitions: { column: 'state', insert: ['pending', 'verified'], edges: [['pending', 'verified']] }, on_transition: { column: 'state', stamps: { verified: { verified_at: 'now', verified_by: 'uid' } } } }, async () => {
    const first = randomUUID();
    await stamp(fx.o1, insertProbe(first, { state: sql`'verified'`, verified_at: sql`'2001-01-01T00:00:00Z'`, verified_by: sql`${fx.ub.userId}` }), { verified_at: 'now', verified_by: 'uid' });
    const id = await seed();
    expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject({ verified_at: null, verified_by: null });
    const entered = await stamp(fx.o1, sql`update dawlyy_probe.t set state='verified',verified_at='2001-01-01T00:00:00Z',verified_by=${fx.ub.userId} where id=${id}`, { verified_at: 'now', verified_by: 'uid' });
    expect(await updateProbe(fx.o1, id, sql`notes='allowed'`)).toMatchObject({ verified_at: entered.verified_at, verified_by: entered.verified_by });
    await refused(fx.o1, sql`update dawlyy_probe.t set state='pending' where id=${id}`, 'transitions', 'state');
    const control = await seed();
    await stamp(fx.o1, sql`update dawlyy_probe.t set state='verified' where id=${control}`, { verified_at: 'now', verified_by: 'uid' });
  });
  engine('G13', 'ua INSERT/UPDATE deleted_at toggle stamps and clears', { client_update: ['deleted_at'], on_set: { deleted_at: { deleted_at: 'now', completed_by: 'uid' } }, on_clear: { deleted_at: { completed_by: 'null' } } }, async () => {
    const first = randomUUID();
    await stamp(fx.ua, insertProbe(first, { deleted_at: sql`'2001-01-01T00:00:00Z'` }), { deleted_at: 'now', completed_by: 'uid' });
    const id = await seed();
    await stamp(fx.ua, sql`update dawlyy_probe.t set deleted_at='2001-01-01T00:00:00Z' where id=${id}`, { deleted_at: 'now', completed_by: 'uid' });
    await refused(fx.ua, sql`update dawlyy_probe.t set deleted_at='2000-01-01T00:00:00Z' where id=${id}`, 'on_clear', 'deleted_at');
    expect(await updateProbe(fx.ua, id, sql`deleted_at=null`)).toMatchObject({ deleted_at: null, completed_by: null });
    await stamp(fx.ua, sql`update dawlyy_probe.t set deleted_at='2001-01-01T00:00:00Z' where id=${id}`, { deleted_at: 'now', completed_by: 'uid' });
  });
  engine('G14', 'o1 DELETE state verified/pending', { delete_when: { column: 'state', states: ['pending'] } }, async () => {
    const id = await seed({ state: sql`'verified'` });
    await refused(fx.o1, sql`delete from dawlyy_probe.t where id=${id}`, 'delete_when', 'state');
    const legal = await seed();
    expect(await as(fx.o1, tx => q(tx, sql`delete from dawlyy_probe.t where id=${legal} returning id`))).toEqual([{ id: legal }]);
    expect(await serviceRow('dawlyy_probe.t', legal)).toBeUndefined();
  });
  for (const who of ['o1', 's1', 'ua'] as const) {
    engine('G15', `${who} UPDATE unread_for_client 5 reset-only`, { update_to: { unread_for_client: 0 }, client_update: ['unread_for_client'] }, async () => {
      const id = await seed({ unread_for_client: sql`5` });
      await refused(fx[who], sql`update dawlyy_probe.t set unread_for_client=99 where id=${id}`, 'update_to', 'unread_for_client');
      expect(await updateProbe(fx[who], id, sql`unread_for_client=5`)).toMatchObject({ unread_for_client: 5 });
      expect(await updateProbe(fx[who], id, sql`unread_for_client=0`)).toMatchObject({ unread_for_client: 0 });
    });
  }
  for (const who of ['o1', 's1', 'ua'] as const) {
    for (const col of ['refund_amount', 'client_updated_at']) {
      for (const clear of [false, true]) {
        engine('G16', `${who} UPDATE ${col} monotonic -> ${clear ? 'null' : 'lower'}`, { monotonic: ['refund_amount', 'client_updated_at'], client_update: ['refund_amount', 'client_updated_at'] }, async () => {
          const id = await seed({ refund_amount: sql`20`, client_updated_at: sql`'2026-02-01T00:00:00Z'` });
          await refused(fx[who], sql`update dawlyy_probe.t set ${sql.identifier(col)}=${clear ? sql`null` : col === 'refund_amount' ? sql`10` : sql`'2026-01-01T00:00:00Z'`} where id=${id}`, 'monotonic', col);
          expect(await updateProbe(fx[who], id, sql`refund_amount=20,client_updated_at='2026-02-01T00:00:00Z'`)).toMatchObject({ refund_amount: 20 });
          expect(await updateProbe(fx[who], id, sql`refund_amount=30,client_updated_at='2026-03-01T00:00:00Z'`)).toMatchObject({ refund_amount: 30 });
          const first = await seed();
          expect(await updateProbe(fx[who], first, sql`refund_amount=1,client_updated_at='2026-01-01T00:00:00Z'`)).toMatchObject({ refund_amount: 1 });
        });
      }
    }
  }
  for (const operation of ['insert', 'update', 'delete'] as const) {
    for (const manage of [false, true]) {
      engine('G17', `s1 ${operation} require_perm billing ${manage ? 'manage' : operation} pending`, { require_perm: { insert: ['billing', 'create'], update: ['billing', 'edit'], delete: ['billing', 'delete'] }, client_update: ['notes'] }, async () => {
        let ctx = await permittedStaff([]);
        const id = operation === 'insert' ? randomUUID() : await seed();
        const statement = operation === 'insert' ? insertProbe(id) : operation === 'update' ? sql`update dawlyy_probe.t set notes='allowed' where id=${id}` : sql`delete from dawlyy_probe.t where id=${id}`;
        await refused(ctx, statement, 'require_perm');
        ctx = await setActions(ctx, [manage ? 'manage' : operation === 'insert' ? 'create' : operation === 'update' ? 'edit' : 'delete']);
        await as(ctx, tx => tx.execute(statement));
        if (operation === 'delete') {
          expect(await serviceRow('dawlyy_probe.t', id)).toBeUndefined();
        }
        else expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject(operation === 'update' ? { notes: 'allowed' } : { id });
        const owner = randomUUID();
        await as(fx.o1, tx => tx.execute(insertProbe(owner)));
        await notes(fx.o1, owner);
        const client = await seed();
        await notes(fx.ua, client);
      });
    }
  }
  for (const operation of ['INSERT', 'UPDATE']) {
    engine('G18', `s1 ${operation} state pending -> verified permission stamps`, { transitions: { column: 'state', insert: ['pending', 'verified'], edges: [['pending', 'verified']] }, perm_transitions: { verified: ['billing', 'verify'] }, on_transition: { column: 'state', stamps: { verified: { verified_by: 'uid', verified_at: 'now' } } } }, async () => {
      let ctx = await permittedStaff([]);
      const id = operation === 'INSERT' ? randomUUID() : await seed();
      const statement = operation === 'INSERT' ? insertProbe(id, { state: sql`'verified'` }) : sql`update dawlyy_probe.t set state='verified' where id=${id}`;
      await refused(ctx, statement, 'perm_transitions', 'state');
      ctx = await setActions(ctx, ['verify']);
      await stamp(ctx, statement, { verified_by: 'uid', verified_at: 'now' });
      ctx = await setActions(ctx, []);
      await notes(ctx, id);
      const owner = await seed();
      await stamp(fx.o1, sql`update dawlyy_probe.t set state='verified' where id=${owner}`, { verified_by: 'uid', verified_at: 'now' });
    });
  }
  engine('G19', 'service INSERT UPDATE DELETE bypasses runtime-only guard', { immutable: ['tenant_id'], insert_eq: { verified_at: null }, transitions: { column: 'state', insert: ['pending'], edges: [] }, delete_when: { column: 'state', states: ['pending'] }, client_update: ['notes'] }, async () => {
    const id = await seed({ state: sql`'verified'`, verified_at: sql`'2001-01-01T00:00:00Z'`, created_at: sql`'2001-01-01T00:00:00Z'` });
    expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject({ state: 'verified', created_at: new Date('2001-01-01T00:00:00Z') });
    await svc(tx => tx.execute(sql`update dawlyy_probe.t set tenant_id=${fx.t2} where id=${id}`));
    expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject({ tenant_id: fx.t2 });
    await svc(tx => tx.execute(sql`delete from dawlyy_probe.t where id=${id}`));
    expect(await serviceRow('dawlyy_probe.t', id)).toBeUndefined();
    const own = await seed();
    await refused(fx.ua, sql`update dawlyy_probe.t set tenant_id=${fx.t2} where id=${own}`, 'immutable', 'tenant_id');
    await notes(fx.ua, own);
  });
  engine('G23', 'ua INSERT tenant_id foreign-user membership pin empty guard', {}, async () => {
    const id = randomUUID();
    const forged = { ...fx.ua, membershipId: fx.o1.membershipId };
    const before = await probeImage();
    const e = await expectGuard(as(forged, tx => tx.execute(insertProbe(id))), 'no_membership');
    expect(e.table_name).toBe('t');
    expect(e.column_name).toBeUndefined();
    expect(await probeImage()).toEqual(before);
    expect(await serviceRow('dawlyy_probe.t', id)).toBeUndefined();
    expect(await as(forged, tx => q(tx, sql`select id from memberships`))).toEqual([{ id: fx.ua.membershipId }]);
    await as(fx.ua, tx => tx.execute(insertProbe(id)));
    expect(await serviceRow('dawlyy_probe.t', id)).toMatchObject({ id, tenant_id: fx.t1 });
  });
});
type MatrixRow = { f: Fixture;ctx: AuthContext;table: string;where: SQL;row: Row;versionId?: string;asset: string;parentVoided?: boolean };
const noUpdateGrant = ['staff_client_assignments', 'subscription_events', 'tenant_hidden_items', 'metric_entries'];
const clientInvisible = ['invitations', 'business_settings', 'client_notes', 'client_flags', 'tasks', 'ai_requests', 'packages', 'subscriptions', 'client_entitlement_overrides', 'exercises', 'foods', 'programs', 'nutrition_plans', 'forms', 'program_versions', 'nutrition_plan_versions', 'form_versions'];
const heads = ['programs', 'nutrition_plans', 'forms'];
const versions = ['program_versions', 'nutrition_plan_versions', 'form_versions'];
// 0008: A/B separate triggers surround guard_row; keep their rules outside its JSON golden.
const archiveModules: Readonly<Record<string, string>> = { clients: 'clients', programs: 'programs', nutrition_plans: 'nutrition', forms: 'forms', packages: 'packages', exercises: 'exercises' };
const voidTables = ['meal_logs', 'metric_entries', 'measurement_sets', 'workout_sessions'];
// 0008: D/E private rows have no client UPDATE/SELECT policy.
clientInvisible.push('ai_drafts', 'red_flags');
const baseState = (table: string): string | null => MATRIX_STATES[table] ? MATRIX_STATES[table]![0]! : 'base';
function valueSql(value: unknown, type = 's'): SQL {
  if (value === null) {
    return sql`null`;
  }
  if (type === 'j') {
    return sql`${JSON.stringify(value)}::jsonb`;
  }
  if (type === 'a') {
    if (!Array.isArray(value)) {
      throw new Error('expected text array');
    }
    return sql`array[${sql.join(value.map(v => sql`${String(v)}`), sql`,`)}]::text[]`;
  }
  return sql`${value}`;
}
async function matrixImage(m: MatrixRow): Promise<unknown> {
  const tables = [...new Set([m.table, 'tenants', 'audit_log', 'events', ...heads, 'staff_client_assignments'])];
  return svc(tx => Promise.all(tables.map(table => q(tx, table === 'tenants' ? sql`select to_jsonb(t) as row from tenants t where id in (${m.f.t1},${m.f.t2}) order by id` : sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where tenant_id in (${m.f.t1},${m.f.t2}) order by to_jsonb(t)::text`))));
}
async function readMatrix(m: MatrixRow, tx?: Tx): Promise<Row> {
  const read = async (t: Tx) => (await one<{ row: Row }>(t, sql`select to_jsonb(t) as row from ${sql.identifier(m.table)} t where ${m.where}`)).row;
  return tx ? read(tx) : svc(read);
}
async function arrange(table: string, who: Who, state: string | null = 'base'): Promise<MatrixRow> {
  const f = await buildPrivateFixture();
  const ctx = who === 's1' ? await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: { billing: ['manage'], packages: ['manage'], clients: ['create'], ai: ['publish'], programs: ['publish'], nutrition: ['publish'], forms: ['publish'] } } }) : f[who];
  const asset = randomUUID();
  await svc(tx => tx.execute(sql`insert into media(id,tenant_id,owner_user_id,bucket,path,kind,purpose,mime_type) values(${asset},${f.t1},${ctx.userId},'tenant-assets',${f.t1+'/assets/'+asset+'.jpg'},'file','branding','image/jpeg')`));
  let id: string = randomUUID();
  let where: SQL = sql`id=${id}`;
  let versionId: string | undefined;
  const create = async (row: Record<string, SQL>): Promise<void> => {
    await svc(tx => tx.execute(sql`insert into ${sql.identifier(table)}(${sql.join(Object.keys(row).map(sql.identifier), sql`,`)}) values(${sql.join(Object.values(row), sql`,`)})`));
  };
  const base = { id: sql`${id}`, tenant_id: sql`${f.t1}`, client_id: sql`${f.clientA}` };
  switch (table) {
    case 'tenants': id = f.t1;
    break;
    case 'memberships': id = who === 'o1' ? f.s2.membershipId : ctx.membershipId;
    break;
    case 'staff_client_assignments': where = sql`tenant_id=${f.t1} and membership_id=${who === 's1' ? ctx.membershipId : f.s1MembershipId} and client_id=${f.clientA}`;
    break;
    case 'invitations': id = f.invS1ClientA;
    await svc(tx => tx.execute(sql`update invitations set invited_by=${ctx.userId},status=${state} where id=${id}`));
    break;
    case 'business_settings': where = sql`tenant_id=${f.t1}`;
    await create({ tenant_id: base.tenant_id, settings: sql`'{}'::jsonb` });
    break;
    case 'user_preferences': where = sql`tenant_id=${f.t1} and user_id=${ctx.userId}`;
    await create({ tenant_id: base.tenant_id, user_id: sql`${ctx.userId}`, preferences: sql`'{}'::jsonb` });
    break;
    case 'consents': await create({ id: base.id, tenant_id: base.tenant_id, user_id: sql`${ctx.userId}`, kind: sql`'terms'`, version: sql`'v2'`, locale: sql`'en'`, withdrawn_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'clients': id = f.clientA;
    break;
    case 'client_notes': id = f.noteA;
    await svc(tx => tx.execute(sql`update client_notes set author_user_id=${ctx.userId} where id=${id}`));
    break;
    case 'client_flags': await create({ ...base, kind: sql`'risk'`, resolved_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null`, resolved_by: state === 'set' ? sql`${ctx.userId}` : sql`null` });
    break;
    case 'tasks': id = f.taskA;
    await svc(tx => tx.execute(sql`update tasks set state=${state},completed_at=${state === 'done' ? sql`now()` : sql`null`},completed_by=${state === 'done' ? ctx.userId : null} where id=${id}`));
    break;
    case 'ai_requests': await create({ ...base, kind: sql`'program'`, input: sql`'{}'::jsonb`, created_by: sql`${ctx.userId}`, state: sql`${state}`, approved_at: state === 'approved' ? sql`now()` : sql`null`, approved_by: state === 'approved' ? sql`${ctx.userId}` : sql`null` });
    break;
    // 0008: D/E trusted service inserts every OLD status, including otherwise unreachable approved/stale/handled.
    case 'ai_drafts': await create({ ...base, kind: sql`'week_review'`, input_hash: sql`${'a'.repeat(64)}`, input_version: sql`'guard-v1'`, body: sql`'{}'::jsonb`, provider: sql`'none'`, status: sql`${state}`, created_by: sql`${ctx.userId}`, approved_by: state === 'approved' ? sql`${ctx.userId}` : sql`null`, approved_at: state === 'approved' ? sql`now()` : sql`null` });
    break;
    case 'red_flags': await create({ ...base, source: sql`'meal_note'`, source_id: sql`${randomUUID()}`, category: sql`'other'`, matched: sql`'guard'`, evidence_hash: sql`${'a'.repeat(64)}`, status: sql`${state}`, handled_by: state === 'handled' ? sql`${ctx.userId}` : sql`null`, handled_at: state === 'handled' ? sql`now()` : sql`null` });
    break;
    case 'packages': id = await mkPackage(f.t1);
    break;
    case 'subscriptions': id = f.subA;
    await svc(tx => tx.execute(sql`update subscriptions set state=${state} where id=${id}`));
    break;
    case 'subscription_events': await create({ ...base, subscription_id: sql`${f.subA}`, kind: sql`'extension'`, days: sql`7` });
    break;
    case 'client_entitlement_overrides': await create({ ...base, override: sql`'{}'::jsonb`, revoked_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'payments': id = f.payA;
    await svc(tx => tx.execute(sql`update payments set state=${state === 'partial' ? 'verified' : state},refund_amount=${state === 'refunded' ? 100 : state === 'partial' ? 20 : null},refunded_at=${state === 'refunded' || state === 'partial' ? sql`now()` : sql`null`},verified_at=${['verified', 'partial', 'refunded'].includes(state ?? '') ? sql`now()` : sql`null`},verified_by=${['verified', 'partial', 'refunded'].includes(state ?? '') ? ctx.userId : null} where id=${id}`));
    break;
    case 'exercises': id = f.exerciseT1;
    break;
    case 'foods': await create({ id: base.id, tenant_id: base.tenant_id, slug: sql`${id}`, name: sql`'{"en":"Private food"}'::jsonb`, category: sql`'grains'`, per_100: sql`'{"kcal":100,"proteinG":5,"carbsG":15,"fatG":2}'::jsonb` });
    break;
    case 'tenant_hidden_items': where = sql`tenant_id=${f.t1} and kind='exercise' and item_id=${f.exerciseSystem}`;
    await create({ tenant_id: base.tenant_id, kind: sql`'exercise'`, item_id: sql`${f.exerciseSystem}` });
    break;
    case 'programs': case 'nutrition_plans': case 'forms': case 'program_versions': case 'nutrition_plan_versions': case 'form_versions': {
      const family = table === 'programs' || table === 'program_versions' ? 'program' : table === 'forms' || table === 'form_versions' ? 'form' : 'nutrition';
      const v = await mkVersion(f.t1, { family, clientId: f.clientA, status: heads.includes(table) || state === 'published' || state === 'superseded' ? 'published' : 'draft', publishedBy: ctx.userId });
      versionId = v.versionId;
      id = heads.includes(table) ? v.headId : v.versionId;
      if (versions.includes(table) && !['base', 'draft', 'published'].includes(state ?? '')) {
        await svc(tx => tx.execute(sql`update ${sql.identifier(table)} set status=${state} where id=${id}`));
      }
      break;
    }
    case 'metric_entries': id = f.metricA;
    break;
    case 'measurement_sets': await create({ ...base, local_date: sql`current_date`, values: sql`'[]'::jsonb`, client_uuid: sql`${randomUUID()}`, client_updated_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'progress_photo_sets': await create({ ...base, local_date: sql`current_date`, poses: sql`'[]'::jsonb`, client_uuid: sql`${randomUUID()}`, client_updated_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'inbody_records': await create({ ...base, local_date: sql`current_date`, source: sql`'manual'` });
    break;
    case 'workout_sessions': id = await mkSession(f.t1, f.clientA);
    versionId = String((await serviceRow(table, id))?.program_version_id);
    await svc(tx => tx.execute(sql`update workout_sessions set program_version_id=null where id=${id}`));
    break;
    case 'set_logs': {
      const session = await mkSession(f.t1, f.clientA);
      await create({ ...base, session_id: sql`${session}`, exercise_id: sql`${f.exerciseSystem}`, set_no: sql`1`, client_uuid: sql`${randomUUID()}`, client_updated_at: sql`'2026-01-01T00:00:00Z'` });
      if (state === 'parent_voided') await svc(tx => tx.execute(sql`update workout_sessions set voided_at=now() where id=${session}`));
      break;
    }
    case 'meal_logs': await create({ ...base, local_date: sql`current_date`, client_uuid: sql`${randomUUID()}`, client_updated_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'supplement_logs': await create({ ...base, local_date: sql`current_date`, supplement_id: sql`'vitamin'`, taken: sql`true`, client_uuid: sql`${randomUUID()}`, client_updated_at: state === 'set' ? sql`'2026-01-01T00:00:00Z'` : sql`null` });
    break;
    case 'form_submissions': await create({ ...base, form_id: sql`${f.templateForm}`, form_version_id: sql`${f.templateFormPub}`, form_kind: sql`'checkin'`, state: sql`${state}`, client_uuid: sql`${randomUUID()}`, submitted_at: ['submitted', 'waiting_for_coach', 'reviewed'].includes(state ?? '') ? sql`now()` : sql`null`, reviewed_at: state === 'reviewed' ? sql`now()` : sql`null`, reviewed_by: state === 'reviewed' ? sql`${ctx.userId}` : sql`null` });
    break;
    case 'calendar_events': id = f.eventA;
    await svc(tx => tx.execute(sql`update calendar_events set state=${state} where id=${id}`));
    break;
    case 'conversations': id = f.convA;
    await svc(tx => tx.execute(sql`update conversations set unread_for_client=5,unread_for_coach=5 where id=${id}`));
    break;
    case 'notifications': await create({ ...base, user_id: sql`${ctx.userId}`, type: sql`'private'`, title: sql`'{"en":"Private"}'::jsonb` });
    break;
    case 'push_subscriptions': await create({ id: base.id, tenant_id: base.tenant_id, user_id: sql`${ctx.userId}`, endpoint: sql`${'https://example.invalid/'+id}`, keys: sql`'{"p256dh":"key","auth":"auth"}'::jsonb` });
    break;
    case 'media': id = f.mediaA;
    await svc(tx => tx.execute(sql`update media set review_state=${state} where id=${id}`));
    break;
    default: throw new Error('missing private matrix factory: '+table);
  }
  if (!['staff_client_assignments', 'business_settings', 'user_preferences', 'tenant_hidden_items'].includes(table)) {
    where = sql`id=${id}`;
  }
  // 0008: A/B service establishes archived/voided OLD rows without runtime attribution or transition guards.
  if (state === 'archived' && archiveModules[table]) {
    await svc(tx => tx.execute(sql`update ${sql.identifier(table)} set archived_at='2026-01-01T00:00:00Z',archived_by=${ctx.userId} where ${where}`));
  }
  if (state === 'voided' && voidTables.includes(table)) {
    await svc(tx => tx.execute(sql`update ${sql.identifier(table)} set voided_at='2026-01-01T00:00:00Z',voided_by=${ctx.userId},void_reason='service OLD state' where ${where}`));
  }
  const m: MatrixRow = { f, ctx, table, where, row: {}, versionId, asset, parentVoided: table === 'set_logs' && state === 'parent_voided' };
  m.row = await readMatrix(m);
  return m;
}

async function alternate(m: MatrixRow, column: string, type: string): Promise<unknown> {
  const old = m.row[column];
  const f = m.f;
  // 0008: C/D/E alternates remain inside each new CHECK's domain.
  if (m.table === 'business_settings' && column === 'client_modules') {
    return { workouts: true, nutrition: true, checkins: true, progress_photos: true, measurements: true, messages: false, payments: true };
  }
  if (m.table === 'ai_drafts' && column === 'input_hash') return 'b'.repeat(64);
  if (m.table === 'ai_drafts' && column === 'provider') return old === 'none' ? 'anthropic' : 'none';
  if (m.table === 'red_flags' && column === 'source') return old === 'meal_note' ? 'message' : 'meal_note';
  if (m.table === 'red_flags' && column === 'category') return old === 'other' ? 'pain_injury' : 'other';
  if (m.table === 'red_flags' && column === 'evidence_hash') return 'b'.repeat(64);
  // 0008: B a replacement alternate is a real same-client row, even though runtime UPDATE must refuse it.
  if (column === 'replaces_id') {
    const original = await makeRow(m.table as MatrixTable, f, f.ua);
    await svc(tx => insertRow(tx, m.table as MatrixTable, original));
    return original.id;
  }
  if (column === 'tenant_id') {
    return f.t2;
  }
  if (column === 'client_id') {
    return f.clientB;
  }
  if (column === 'based_on_id') {
    return m.table === 'foods' ? f.foodSystem : f.exerciseSystem;
  }
  if (column === 'template_id') {
    const family = m.table === 'programs' ? 'program' : m.table === 'forms' ? 'form' : 'nutrition';
    return(await mkVersion(f.t1, { family, clientId: null })).headId;
  }
  if (column === 'thumbnail_media_id') {
    return m.asset;
  }
  if (column === 'published_version_id') {
    return old === null ? m.versionId : null;
  }
  if (column === 'current_version_id') {
    return m.versionId;
  }
  if (column === 'subscription_id') {
    return m.table === 'subscription_events' ? mkSubscription(f.t1, f.clientA, f.packageT1) : old === null ? f.subA : null;
  }
  if (column === 'package_id') {
    return await mkPackage(f.t1);
  }
  if (column === 'assignee_membership_id') {
    return f.s2.membershipId;
  }
  if (column === 'exercise_id' || column === 'substituted_for') {
    return f.exerciseT1;
  }
  if (column === 'proof_media_id' || column === 'raw_media_id') {
    return f.mediaA;
  }
  if (column === 'plan_version_id') {
    return f.planPubA;
  }
  if (column === 'program_version_id') {
    return m.versionId;
  }
  if (column === 'form_version_id') {
    return f.templateFormDraft;
  }
  if (column === 'program_id' || column === 'plan_id' || column === 'form_id') {
    const family = column === 'program_id' ? 'program' : column === 'form_id' ? 'form' : 'nutrition';
    const other = await mkVersion(f.t1, { family, clientId: f.clientA });
    const child = family === 'program' ? 'program_versions' : family === 'form' ? 'form_versions' : 'nutrition_plan_versions';
    await svc(tx => tx.execute(sql`delete from ${sql.identifier(child)} where id=${other.versionId}`));
    return other.headId;
  }
  if (column === 'rescheduled_from') {
    return f.eventA;
  }
  if (column === 'refund_amount') {
    return old === null ? 20 : 10;
  }
  if (column === 'state' && m.table === 'payments') {
    return old === 'pending' ? 'verified' : 'pending';
  }
  if (column === 'state' || column === 'status' && m.table !== 'clients' && m.table !== 'memberships') {
    const machine = GUARDS[m.table]!.transitions ?? GUARDS[m.table]!.client_transitions;
    if (m.table === 'meal_logs') {
      return 'skipped';
    }
    return machine?.edges.find(([from]) => from === old)?.[1] ?? machine?.insert?.[0] ?? machine?.edges[0]?.[0] ?? (m.table === 'workout_sessions' ? 'active' : 'pending');
  }
  if (column === 'review_state') {
    return old === null ? 'uploaded' : old === 'requested' ? 'uploaded' : old === 'uploaded' ? 'processing' : old === 'processing' ? 'queued_for_review' : old === 'queued_for_review' ? 'approved' : old === 'needs_resubmission' ? 'uploaded' : 'requested';
  }
  const enums: Record<string, readonly string[]> = { role: ['staff', 'owner', 'client'], status: m.table === 'memberships' ? ['active', 'disabled'] : ['active', 'inactive', 'lead', 'archived'], form_kind: ['assessment', 'checkin'], kind: m.table === 'media' ? ['photo', 'file'] : m.table === 'consents' ? ['privacy', 'terms'] : m.table === 'subscription_events' ? ['extension', 'freeze'] : ['client', 'template'], purpose: ['other', 'payment_proof'], method: ['other', 'cash'], priority: ['high', 'normal'], metric: ['steps', 'weight'], from_state: ['pending', 'active'], to_state: ['active', 'expired'], source: m.table === 'metric_entries' ? ['imported', 'manual'] : m.table === 'calendar_events' ? ['automation', 'manual'] : ['manual', 'coach'], taken_by: ['staff', 'client'] };
  if (type === 's' && enums[column]) {
    return enums[column]!.find(v => v !== old)!;
  }
  if (type === 'u') {
    return randomUUID();
  }
  if (type === 't') {
    return old && String(old).startsWith('2031') ? '2032-01-01T00:00:00Z' : '2031-01-01T00:00:00Z';
  }
  if (type === 'd') {
    return old === '2031-01-01' ? '2032-01-01' : '2031-01-01';
  }
  if (type === 'n') {
    return Number(old ?? 0)+1;
  }
  if (type === 'b') {
    return !old;
  }
  if (type === 'a') {
    return ['alternate'];
  }
  if (type === 'j') {
    if (column === 'name' || column === 'title' || column === 'description') {
      return { en: 'Alternate' };
    }
    if (column === 'keys') {
      return { p256dh: 'alternate', auth: 'alternate' };
    }
    if (column === 'permissions') {
      return { client_scope: 'all', modules: { billing: ['view'] } };
    }
    if (column === 'preferences') {
      return { locale: 'en' };
    }
    if (column === 'per_100') {
      return { kcal: 120, proteinG: 5, carbsG: 20, fatG: 2 };
    }
    if (column === 'schedule_rules') {
      return { checkins: [], workouts: [], timezone: 'Africa/Cairo' };
    }
    if (['poses', 'values', 'measures', 'entitlements', 'cues', 'common_mistakes', 'contraindications'].includes(column)) {
      return [{ id: randomUUID() }];
    }
    if (column === 'document') {
      const v = await mkVersion(f.t1, { family: m.table === 'form_versions' ? 'form' : m.table === 'program_versions' ? 'program' : 'nutrition', clientId: f.clientA });
      const other = (await serviceRow(m.table, v.versionId))?.document;
      if (!other) {
        throw new Error('alternate document missing');
      }
      return other;
    }
    return { alternate: true };
  }
  if (column === 'locale' || column === 'default_locale') {
    return old === 'en' ? 'ar' : 'en';
  }
  if (column === 'timezone') {
    return 'UTC';
  }
  if (column === 'currency') {
    return old === 'USD' ? 'EGP' : 'USD';
  }
  if (column === 'slug' || column === 'token_hash' || column === 'dedupe_key' || column === 'code') {
    return 'alternate-'+randomUUID();
  }
  if (column === 'endpoint' || column === 'video_url') {
    return 'https://example.invalid/alternate';
  }
  if (column === 'mime_type') {
    return 'image/png';
  }
  if (column === 'load_unit') {
    return 'kg';
  }
  if (column === 'tag') {
    return 'warmup';
  }
  if (column === 'path') {
    return f.t1+'/clients/'+f.clientA+'/alternate.jpg';
  }
  return 'alternate';
}

function firstRule(m: MatrixRow, column: string, alternateValue: unknown): string | undefined {
  const cfg = GUARDS[m.table]!;
  const before = m.row;
  const old = before[column];
  const role = m.ctx.role;
  if (m.parentVoided) return 'rule:app.set_logs_parent_live';
  // 0008: B _45_void precedes _50_guard and blocks every update after voiding.
  if (voidTables.includes(m.table) && (before.voided_at !== null || ['voided_at', 'voided_by', 'void_reason', 'replaces_id'].includes(column))) {
    return 'void';
  }
  if (heads.includes(m.table) && column === 'published_version_id') {
    return SPECIAL_PRECEDENCE.heads.published_version_id;
  }
  if (versions.includes(m.table)) {
    if (before.status === 'archived' && column === 'status') {
      return SPECIAL_PRECEDENCE.archivedVersionStatus;
    }
    if (before.published_at !== null || ['published', 'superseded'].includes(String(before.status))) {
      if (column in SPECIAL_PRECEDENCE.frozenVersions) {
        return SPECIAL_PRECEDENCE.frozenVersions[column as keyof typeof SPECIAL_PRECEDENCE.frozenVersions];
      }
      if (column === 'status' && !cfg.transitions!.edges.some(([a, b]) => a === before.status && b === alternateValue)) {
        return 'rule:app.protect_published_version';
      }
    }
  }
  if (cfg.immutable?.includes(column)) {
    return 'immutable';
  }
  if (cfg.set_once?.includes(column) && old !== null) {
    return 'set_once';
  }
  if (cfg.on_clear?.[column] && old !== null && alternateValue !== null) {
    return 'on_clear';
  }
  const allowKey = role === 'client' ? (cfg.client_update ? 'client_update' : 'update_allow') : role === 'staff' ? (cfg.staff_update ? 'staff_update' : 'update_allow') : 'update_allow';
  const allow = cfg[allowKey];
  if (role === 'client' && !allow) {
    return 'client_update';
  }
  if (allow && !allow.includes(column) && !cfg.stamp_update?.[column]) {
    return allowKey;
  }
  if (cfg.update_to && column in cfg.update_to && alternateValue !== cfg.update_to[column]) {
    return 'update_to';
  }
  if (cfg.monotonic?.includes(column) && old !== null && (alternateValue === null || (typeof alternateValue === 'number' ? alternateValue<Number(old) : new Date(String(alternateValue)).getTime()<new Date(String(old)).getTime()))) {
    return 'monotonic';
  }
  if (cfg.editable_in?.some(rule => rule.cols.includes(column) && !rule.states.includes(before[rule.column] as string | null))) {
    return 'editable_in';
  }
  for (const key of ['transitions', 'client_transitions'] as const) {
    const machine = cfg[key];
    if (machine && (key === 'transitions' || role === 'client') && machine.column === column && !machine.edges.some(([a, b]) => a === old && b === alternateValue)) {
      return key;
    }
  }
  // 0008: A _55_archive follows all guard_row checks, including client allowlists.
  if (archiveModules[m.table] && (column === 'archived_by' || column === 'archived_at' && (!canArchive(m) || old !== null && alternateValue !== null))) {
    return 'archive';
  }
  return undefined;
}

// 0008: A archive requires module edit (or manage); arrange deliberately preserves the existing staff grants.
// P9 fix F5: a form is archived under the module of its kind (guard_archive in 0008).
function archiveModuleOf(table: string, row: Row): string {
  if (table !== 'forms') return archiveModules[table]!;
  return row.form_kind === 'checkin' ? 'checkins' : row.form_kind === 'assessment' ? 'assessments' : 'forms';
}
function canArchive(m: MatrixRow): boolean {
  const moduleName = archiveModuleOf(m.table, m.row);
  const actions = m.ctx.permissions?.modules?.[moduleName];
  return m.ctx.role === 'owner' || m.ctx.role === 'staff' && !!actions?.some(action => action === 'edit' || action === 'manage');
}

// 0008: A/B these independent triggers use guard:archive/guard:void, outside helpers' guard_row key vocabulary.
async function matrixRefusal(m: MatrixRow, statement: SQL, rule: string, column: string): Promise<void> {
  if (rule === 'archive' || rule === 'void') {
    const frozen = rule === 'void' && m.row.voided_at !== null;
    const code = frozen || rule === 'archive' && column === 'archived_at' && canArchive(m) && m.row.archived_at !== null ? 'P0001' : '42501';
    const error = await expectCode(as(m.ctx, tx => tx.execute(statement)), code);
    expect(error.detail).toBe('guard:' + rule);
    expect(error.column_name).toBe(frozen ? 'voided_at' : column);
    expect(error.table_name).toBe(m.table);
    return;
  }
  const error = await expectGuard(as(m.ctx, tx => tx.execute(statement)), rule, rule === 'rule:app.set_logs_parent_live' ? 'session_id' : column);
  expect(error.table_name).toBe(m.table);
  if (rule.startsWith('rule:')) expect(error.code).toBe(rule === 'rule:app.head_rules' ? '42501' : 'P0001');
}

async function control(m: MatrixRow): Promise<void> {
  const query = sql`select to_jsonb(t) as row from ${sql.identifier(m.table)} t where ${m.where}`;
  // 0008: D/E both private tables remain invisible to clients in refusal controls too.
  const visible = m.ctx.role !== 'client' || !['invitations', 'client_notes', 'client_flags', 'tasks', 'ai_requests', 'staff_client_assignments', 'ai_drafts', 'red_flags'].includes(m.table) && (!versions.includes(m.table) || ['published', 'superseded'].includes(String(m.row.status)));
  // 0005 packages_client_select shows a client only `is_public and archived_at is null`: an archived package is invisible to a
  // client actor, so UPDATE through RLS matches zero rows and the unchanged-row control must expect none for them.
  const archivedHidden = m.ctx.role === 'client' && m.table === 'packages' && m.row.archived_at != null;
  const expected = visible && !archivedHidden ? await svc(tx => q(tx, query)) : [];
  expect(await as(m.ctx, tx => q(tx, query))).toEqual(expected);
  expect(await as(m.ctx, tx => q(tx, sql`select id from clients where id=${m.f.clientA}`))).toEqual([{ id: m.f.clientA }]);
}
async function exactWrite(m: MatrixRow, assignments: SQL, column: string, expectedValue: unknown): Promise<Row> {
  return as(m.ctx, async tx => {
    const { clock } = await one<{ clock: string }>(tx, sql`select now()::text as clock`);
    const { row } = await one<{ row: Row }>(tx, sql`update ${sql.identifier(m.table)} t set ${assignments} where ${m.where} returning to_jsonb(t) as row`);
    const expected = { ...m.row, [column]: expectedValue };
    // 0008: A archive guard stamps attribution on set and clears it on restore, preserving the supplied time.
    if (archiveModules[m.table] && column === 'archived_at' && m.row.archived_at !== expectedValue) {
      expected.archived_by = expectedValue === null ? null : m.ctx.userId;
    }
    const cfg = GUARDS[m.table]!;
    const stamps: Record<string, string> = { ...cfg.stamp_update };
    if (cfg.on_transition && cfg.on_transition.column === column && m.row[column] !== expectedValue) {
      Object.assign(stamps, cfg.on_transition.stamps[String(expectedValue)]);
    }
    if (m.row[column] === null && expectedValue !== null) {
      Object.assign(stamps, cfg.on_set?.[column]);
    }
    if (m.row[column] !== null && expectedValue === null) {
      Object.assign(stamps, cfg.on_clear?.[column]);
    }
    for (const [col, token] of Object.entries(stamps)) {
      expected[col] = token === 'now' ? clock : token === 'uid' ? m.ctx.userId : token === 'role' ? m.ctx.role : null;
      if (token === 'now') {
        expect(await one(tx,sql`select ${sql.identifier(col)} = now() as exact from ${sql.identifier(m.table)} where ${m.where}`)).toEqual({exact:true});
      }
    }
    for (const [col, type] of Object.entries(Object.fromEntries(GUARD_COLUMNS[m.table]!.split(' ').map(s => s.split(':'))))) {
      if (type === 't' && expected[col] !== null) {
        expected[col] = new Date(String(expected[col])).toISOString();
      }
    }
    const normalized = { ...row };
    for (const [col, type] of GUARD_COLUMNS[m.table]!.split(' ').map(s => s.split(':'))) {
      if (type === 't' && col && normalized[col] !== null) {
        normalized[col] = new Date(String(normalized[col])).toISOString();
      }
    }
    if (m.table === 'payments' && column === 'state' && expectedValue === 'verified') {
      expected.receipt_no = 'R-000001';
    }
    expect(normalized).toEqual(expected);
    return row;
  });
}

async function insertion(m: MatrixRow, patch: Record<string, unknown> = {}): Promise<{ statement: SQL;where: SQL;row: Row }> {
  const row: Row = { ...m.row };
  if ('id' in row) {
    row.id = randomUUID();
  }
  if ('client_uuid' in row) {
    row.client_uuid = randomUUID();
  }
  if ('slug' in row) {
    row.slug = 'insert-'+randomUUID();
  }
  if ('token_hash' in row) {
    row.token_hash = randomUUID();
  }
  if ('user_id' in row) {
    row.user_id = m.table === 'memberships' ? randomUUID() : m.ctx.userId;
  }
  const cfg = GUARDS[m.table]!;
  Object.assign(row, cfg.insert_eq, m.ctx.role === 'client' ? cfg.client_insert_eq : {});
  if (cfg.transitions?.insert) {
    row[cfg.transitions.column] = cfg.transitions.insert[0];
  }
  if (cfg.client_transitions?.insert && m.ctx.role === 'client') {
    row[cfg.client_transitions.column] = cfg.client_transitions.insert[0];
  }
  if (versions.includes(m.table)) {
    row.version_no = Number(row.version_no)+1;
  }
  if (heads.includes(m.table)) {
    row.current_version_id = null;
    row.published_version_id = null;
  }
  if (m.table === 'conversations') {
    row.unread_for_coach = 0;
    row.unread_for_client = 0;
    row.last_message_at = null;
    row.last_message_preview = null;
  }
  if (m.table === 'media') {
    row.path = m.f.t1+'/clients/'+m.f.clientA+'/'+String(row.id)+'.jpg';
  }
  if (m.table === 'push_subscriptions') {
    row.endpoint = 'https://example.invalid/'+String(row.id);
  }
  if (m.table === 'staff_client_assignments') {
    row.membership_id = m.f.s2.membershipId;
    row.client_id = m.f.clientB;
  }
  if (m.table === 'tenant_hidden_items') {
    row.item_id = m.f.exerciseT1;
  }
  // 0008: E a new flag INSERT probe uses its own source/category key.
  if (m.table === 'red_flags') row.source_id = randomUUID();
  if (['business_settings', 'user_preferences', 'conversations'].includes(m.table)) {
    await svc(tx => tx.execute(sql`delete from ${sql.identifier(m.table)} where ${m.where}`));
  }
  Object.assign(row, patch);
  const columns = GUARD_COLUMNS[m.table]!.split(' ').map(s => s.split(':')[0]!);
  const statement = sql`insert into ${sql.identifier(m.table)}(${sql.join(columns.map(sql.identifier), sql`,`)}) select ${sql.join(columns.map(sql.identifier), sql`,`)} from jsonb_populate_record(null::${sql.identifier(m.table)},${JSON.stringify(row)}::jsonb)`;
  const keys = m.table === 'staff_client_assignments' ? ['tenant_id', 'membership_id', 'client_id'] : m.table === 'business_settings' ? ['tenant_id'] : m.table === 'user_preferences' ? ['tenant_id', 'user_id'] : m.table === 'tenant_hidden_items' ? ['tenant_id', 'kind', 'item_id'] : ['id'];
  return { statement, where: sql.join(keys.map(k => sql`${sql.identifier(k)}=${row[k]}`), sql` and `), row };
}
async function insertedRow(m: MatrixRow, where: SQL): Promise<Row | undefined> {
  return svc(async tx => (await q<{ row: Row }>(tx, sql`select to_jsonb(t) as row from ${sql.identifier(m.table)} t where ${where}`))[0]?.row);
}
function normalizedTimes(table: string, row: Row): Row {
  const result = { ...row };
  for (const spec of GUARD_COLUMNS[table]!.split(' ')) {
    const [column, type] = spec.split(':');
    if (column && type === 't' && result[column] !== null) {
      result[column] = new Date(String(result[column])).toISOString();
    }
  }return result;
}
async function exactInsert(m: MatrixRow, statement: SQL, where: SQL, input: Row): Promise<Row> {
  const tenant = await serviceRow('tenants', m.f.t1);
  const expected = { ...input };
  const cfg = GUARDS[m.table]!;
  const stamps: Record<string, string> = { ...cfg.stamp_insert };
  if ('created_at' in input) {
    stamps.created_at = 'now';
  }
  if ('updated_at' in input) {
    stamps.updated_at = 'now';
  }
  if (cfg.on_transition) {
    Object.assign(stamps, cfg.on_transition.stamps[String(input[cfg.on_transition.column])]);
  }
  for (const [driver, spec] of Object.entries(cfg.on_set ?? {})) {
    if (input[driver] !== null) {
      Object.assign(stamps, spec);
    }
  }
  const clock = await as(m.ctx, async tx => {
    await tx.execute(statement);
    for (const [column,token] of Object.entries(stamps)) {
      if (token === 'now') {
        expect(await one(tx,sql`select ${sql.identifier(column)} = now() as exact from ${sql.identifier(m.table)} where ${where}`)).toEqual({exact:true});
      }
    }
    return(await one<{clock:string}>(tx,sql`select now()::text as clock`)).clock;
  });
  for (const [column, token] of Object.entries(stamps)) {
    expected[column] = token === 'uid' ? m.ctx.userId : token === 'role' ? m.ctx.role : token === 'now' ? clock : null;
  }
  if (m.table === 'clients') {
    expected.code = 'DW-'+String(Number(tenant?.client_counter)+1).padStart(6, '0');
  }
  if (m.table === 'payments' && input.state === 'verified') {
    expected.receipt_no = 'R-'+String(Number(tenant?.receipt_counter)+1).padStart(6, '0');
  }
  const stored = await insertedRow(m, where);
  expect(stored).toBeDefined();
  if (!stored) {
    throw new Error('permitted INSERT did not persist');
  }
  expect(normalizedTimes(m.table, stored)).toEqual(normalizedTimes(m.table, expected));
  return stored;
}
async function pinCoupledConstraint(m: MatrixRow, column: string): Promise<void> {
  // 0008: D kind has one legal label; its immutable refusal is covered by security.reinvent and its CHECK by N03.
  if (m.table === 'ai_drafts' && column === 'kind') {
    const actual = await svc(tx => one<{ definition: string }>(tx, sql`select pg_get_expr(conbin,conrelid) as definition from pg_constraint where conrelid='ai_drafts'::regclass and conname='ai_drafts_kind_ck' and contype='c' and convalidated`));
    expect(actual.definition.replace(/::text|[\s()]/g, '')).toBe("kind='week_review'");
    return;
  }
  const name = m.table === 'payments' ? (column === 'rejected_reason' ? 'payments_rejected_reason_ck' : 'payments_refund_state_ck') : m.table === 'memberships' ? 'memberships_role_client_ck' : m.table === 'invitations' ? 'invitations_role_client_ck' : m.table === 'conversations' ? 'conversations_kind_client_ck' : m.table+'_kind_client_ck';
  const expression = m.table === 'payments' ? (column === 'rejected_reason' ? "rejected_reason is null or state = 'rejected'" : "(state = 'refunded') = (refund_amount is not null and refund_amount = amount) and (refund_amount is null or state in ('verified', 'refunded'))") : m.table === 'memberships' || m.table === 'invitations' ? "(role = 'client') = (client_id is not null)" : m.table === 'conversations' ? "(kind = 'internal') = (client_id is null)" : "(kind = 'template') = (client_id is null)";
  const actual = await svc(tx => one<{ definition: string }>(tx, sql`select pg_get_expr(conbin,conrelid) as definition from pg_constraint where conrelid=${'public.'+m.table}::regclass and contype='c' and conname=${name} and convalidated`));
  const normalize = (value: string) => value.replace(/::(?:\w+\.)?\w+(?:\[\])?/g, '').replace(/=\s*ANY\s*\(ARRAY\[([^\]]+)\]\)/gi, 'in ($1)').replace(/[\s()"']/g, '').toLowerCase();
  expect(normalize(actual.definition)).toBe(normalize(expression));
}

function contractTuples(configs:Readonly<Record<string,GuardConfig>>):string[] {
  const result:string[]=[];
  for (const [table,cfg] of Object.entries(configs)) {
    const emit=(key:string,column:string,operation:string,contract:unknown,actors:readonly Who[]=['o1','s1','ua'],oldStates:readonly (string|null)[]=operation==='insert'?[null]:MATRIX_STATES[table]??['base']):void=>{
      for (const actor of actors) for (const oldState of oldStates) result.push(JSON.stringify([table,key,column,operation,actor,oldState,contract]));
    };
    for (const key of ['immutable','set_once','monotonic','update_allow','client_update','staff_update'] as const) {
      for (const column of cfg[key]??[]) emit(key,column,'update',true,key==='client_update'?['ua']:key==='staff_update'?['s1']:undefined);
    }
    for (const key of ['insert_eq','client_insert_eq','stamp_insert','stamp_update','update_to'] as const) {
      for (const [column,value] of Object.entries(cfg[key]??{})) emit(key,column,key==='stamp_update'||key==='update_to'?'update':'insert',value,key==='client_insert_eq'?['ua']:undefined);
    }
    for (const [operation,permission] of Object.entries(cfg.require_perm??{})) {
      emit('require_perm','',operation,permission,['s1']);
      emit('require_perm','',operation,'bypass',['o1','ua']);
    }
    for (const [target,permission] of Object.entries(cfg.perm_transitions??{})) for (const operation of ['insert','update']) {
      emit('perm_transitions',cfg.transitions!.column,operation,{target,permission},['s1']);
      emit('perm_transitions',cfg.transitions!.column,operation,{target,bypass:true},['o1','ua']);
    }
    for (const key of ['transitions','client_transitions'] as const) {
      const machine=cfg[key];if(!machine)continue;
      const actors:readonly Who[]=key==='client_transitions'?['ua']:['o1','s1','ua'];
      for (const target of machine.insert??[]) emit(key,machine.column,'insert',{target},actors);
      for (const [from,to] of machine.edges) emit(key,machine.column,'update',{to},actors,[from]);
    }
    for (const rule of cfg.editable_in??[]) for (const column of rule.cols) emit('editable_in',column,'update',{driver:rule.column,states:rule.states});
    if (cfg.delete_when) emit('delete_when',cfg.delete_when.column,'delete',cfg.delete_when.states);
    for (const key of ['on_set','on_clear'] as const) for (const [driver,stamps] of Object.entries(cfg[key]??{})) for (const [column,token] of Object.entries(stamps)) {
      emit(key,column,'update',{driver,token});
      if (key==='on_set'&&!(cfg.insert_eq&&driver in cfg.insert_eq)) emit(key,column,'insert',{driver,token});
    }
    for (const [target,stamps] of Object.entries(cfg.on_transition?.stamps??{})) for (const [column,token] of Object.entries(stamps)) {
      emit('on_transition',column,'update',{driver:cfg.on_transition!.column,target,token});
      if (!cfg.transitions?.insert||cfg.transitions.insert.includes(target)) emit('on_transition',column,'insert',{driver:cfg.on_transition!.column,target,token});
    }
  }
  return result.sort();
}

describe('per-table guard matrix', () => {
  // 0008: A explicit restore/set attribution covers both owner and staff with the named module edit grant.
  for (const table of Object.keys(archiveModules)) for (const who of ['o1', 's1'] as const) {
    for (const state of ['base', 'archived']) it(`G21 ${table} ${who} UPDATE archived_at OLD ${state} archive attribution`, async () => {
      const m = await arrange(table, who, state);
      if (who === 's1') {
        const module = archiveModuleOf(table, m.row);
        const permissions = m.ctx.permissions!;
        m.ctx = await mkMembership(m.ctx, { permissions: { ...permissions, modules: { ...permissions.modules, [module]: [...(permissions.modules[module] ?? []), 'edit'] } } });
      }
      const next = state === 'archived' ? null : '2031-01-01T00:00:00Z';
      await exactWrite(m, sql`archived_at=${next}`, 'archived_at', next);
      await control(m);
    });
    for (const column of ['archived_at', 'archived_by']) it(`G21 ${table} ${who} INSERT ${column} must start null`, async () => {
      const m = await arrange(table, who);
      const bad = await insertion(m, { [column]: column === 'archived_at' ? '2031-01-01T00:00:00Z' : m.f.ub.userId });
      const before = await matrixImage(m);
      await matrixRefusal(m, bad.statement, 'archive', column);
      expect(await matrixImage(m)).toEqual(before);
      expect(await insertedRow(m, bad.where)).toBeUndefined();
      const good = await insertion(m);
      await exactInsert(m, good.statement, good.where, good.row);
      await control(m);
    });
  }
  // 0008: B runtime INSERT cannot prepopulate void attribution; the positive row still starts unvoided.
  for (const table of voidTables) for (const who of ['o1', 's1', 'ua'] as const) {
    for (const column of ['voided_at', 'voided_by', 'void_reason']) it(`G21 ${table} ${who} INSERT ${column} must start null`, async () => {
      const m = await arrange(table, who);
      const bad = await insertion(m, { [column]: column === 'voided_at' ? '2031-01-01T00:00:00Z' : column === 'voided_by' ? m.f.ub.userId : 'forged' });
      const before = await matrixImage(m);
      await matrixRefusal(m, bad.statement, 'void', column);
      expect(await matrixImage(m)).toEqual(before);
      expect(await insertedRow(m, bad.where)).toBeUndefined();
      const good = await insertion(m);
      await exactInsert(m, good.statement, good.where, good.row);
      await control(m);
    });
  }
  // 0008: E/F red_flags has no runtime INSERT, even for the owner; OLD rows are always service-created.
  for (const who of ['o1', 's1', 'ua'] as const) it(`G21 red_flags ${who} INSERT lacks table privilege`, async () => {
    const m = await arrange('red_flags', who, 'open');
    const input = await insertion(m);
    // Give the attempted row an independent source key so a duplicate cannot explain the refusal.
    const before = await matrixImage(m);
    const error = await expectPrivilege(as(m.ctx, tx => tx.execute(input.statement)));
    expect(error.message).toContain('table red_flags');
    expect(await insertedRow(m, input.where)).toBeUndefined();
    expect(await matrixImage(m)).toEqual(before);
    await control(m);
  });
  for (const [table, columns] of Object.entries(GUARD_COLUMNS)) {
    for (const who of ['o1', 's1', 'ua'] as const) {
      for (const state of MATRIX_STATES[table] ?? ['base']) {
        for (const spec of columns.split(' ')) {
          const [column, type] = spec.split(':');
          if (!column || !type) {
            throw new Error('invalid handwritten column');
          }
          it(`G20 ${table} ${who} UPDATE ${column} OLD ${String(state)}`, async () => {
            const m = await arrange(table, who, state);
            const tag = NO_ALTERNATE[`${table}.${column}.${state}`] ?? NO_ALTERNATE[`${table}.${column}.${m.row.role}`] ?? NO_ALTERNATE[`${table}.${column}`];
            if (tag) {
              expect(tag).toMatch(/^[TDMPX]\d+/);
              expect(GUARDS[table]!.immutable?.includes(column) || GUARDS[table]!.transitions?.column === column || GUARDS[table]!.client_update && !GUARDS[table]!.client_update!.includes(column) || table === 'payments').toBe(true);
              expect(await svc(tx => q(tx, sql`select attname from pg_attribute where attrelid=${'public.'+table}::regclass and attname=${column} and not attisdropped`))).toEqual([{ attname: column }]);
              await pinCoupledConstraint(m, column);
              await control(m);
              return;
            }
            const next = await alternate(m, column, type);
            expect(next).not.toEqual(m.row[column]);
            const statement = sql`update ${sql.identifier(table)} set ${sql.identifier(column)}=${valueSql(next, type)} where ${m.where}`;
            if (noUpdateGrant.includes(table)) {
              const before = await matrixImage(m);
              const e = await expectPrivilege(as(m.ctx, tx => tx.execute(statement)));
              expect(e.message).toContain('table '+table);
              expect(await matrixImage(m)).toEqual(before);
            }
            else if (who === 'ua' && clientInvisible.includes(table) || table === 'tenants' && who !== 'o1' || table === 'business_settings' && who === 's1' || table === 'payments' && who === 'ua' && m.row.state !== 'pending') {
              await expectNoEffect(m.ctx, statement, table, m.where);
            }
            else {
              const rule = firstRule(m, column, next);
              if (rule) {
                const before = await matrixImage(m);
                await matrixRefusal(m, statement, rule, column);
                expect(await matrixImage(m)).toEqual(before);
              }
              else await exactWrite(m, sql`${sql.identifier(column)}=${valueSql(next, type)}`, column, next);
            }
            await control(m);
          });
        }
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const key of ['insert_eq', 'client_insert_eq'] as const) {
      for (const column of Object.keys(cfg[key] ?? {})) {
        for (const who of INSERT_ACTORS[table] ?? []) {
          if (key === 'client_insert_eq' && who !== 'ua') {
            continue;
          }
          it(`G21 ${table} ${who} INSERT ${column} ${key} initial`, async () => {
            // 0008: D new draft INSERT contracts start from a valid service-written draft.
            const state = table === 'invitations' ? 'pending' : table === 'subscriptions' ? 'pending' : table === 'payments' ? 'pending' : table === 'tasks' ? 'open' : table === 'ai_requests' || table === 'ai_drafts' ? 'draft' : table === 'form_submissions' ? 'due' : table === 'calendar_events' ? 'due' : table === 'media' ? null : versions.includes(table) ? 'draft' : 'base';
            const m = await arrange(table, who, state);
            const type = GUARD_COLUMNS[table]!.split(' ').find(s => s.startsWith(column+':'))!.split(':')[1]!;
            let forged: unknown = type === 'u' ? m.f.ub.userId : type === 't' ? '2001-01-01T00:00:00Z' : type === 'n' ? 99 : type === 'j' ? { forged: true } : column === 'state' ? 'verified' : column === 'status' ? 'accepted' : column === 'source' ? 'automation' : column === 'kind' ? 'internal' : 'forged';
            if (column === 'taken_by') {
              forged = 'staff';
            }
            if (column === 'source' && table === 'metric_entries') {
              forged = 'device';
            }
            if (column === 'published_version_id') {
              forged = m.versionId;
            }
            // 0008: D rejected satisfies the status CHECK but must still fail insert_eq/status.
            if (table === 'ai_drafts' && column === 'status') forged = 'rejected';
            const bad = await insertion(m, { [column]: forged });
            const before = await matrixImage(m);
            const expected = column === 'published_version_id' ? 'rule:app.head_rules' : key;
            const e = await expectGuard(as(m.ctx, tx => tx.execute(bad.statement)), expected, column);
            expect(e.table_name).toBe(table);
            expect(e.code).toBe('42501');
            expect(await matrixImage(m)).toEqual(before);
            expect(await insertedRow(m, bad.where)).toBeUndefined();
            const fixed = { ...bad.row, [column]: (who === 'ua' && cfg.client_insert_eq && column in cfg.client_insert_eq ? cfg.client_insert_eq : cfg.insert_eq)![column] };
            const cols = Object.keys(fixed);
            await exactInsert(m, sql`insert into ${sql.identifier(table)}(${sql.join(cols.map(sql.identifier), sql`,`)}) select ${sql.join(cols.map(sql.identifier), sql`,`)} from jsonb_populate_record(null::${sql.identifier(table)},${JSON.stringify(fixed)}::jsonb)`, bad.where, fixed);
            await control(m);
          });
        }
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const [column, token] of Object.entries(cfg.stamp_insert ?? {})) {
      for (const who of INSERT_ACTORS[table] ?? [])
      {
        it(`G21 ${table} ${who} INSERT ${column} stamp_insert initial`, async () => {
          const m = await arrange(table, who, baseState(table));
          const input = await insertion(m, { [column]: token === 'now' ? '2001-01-01T00:00:00Z' : m.f.ub.userId });
          const row = await exactInsert(m, input.statement, input.where, input.row);
          expect(row[column]).toBeDefined();
          await control(m);
        });
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const column of Object.keys(cfg.stamp_update ?? {})) {
      for (const who of ['o1', 's1', 'ua'] as const) {
        if (who === 'ua' && clientInvisible.includes(table) || table === 'tenants' && who !== 'o1' || table === 'business_settings' && who === 's1') {
          continue;
        }
        it(`G21 ${table} ${who} UPDATE ${column} stamp_update base`, async () => {
          const m = await arrange(table, who, baseState(table));
          await exactWrite(m, sql`${sql.identifier(column)}=${column.endsWith('_by') ? sql`${m.f.ub.userId}` : sql`'2001-01-01T00:00:00Z'`}`, column, column.endsWith('_by') ? m.f.ub.userId : '2001-01-01T00:00:00Z');
        });
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const event of ['on_set', 'on_clear'] as const) {
      for (const driver of Object.keys(cfg[event] ?? {})) {
        for (const who of ['o1', 's1', 'ua'] as const) {
          if (who === 'ua' && (clientInvisible.includes(table) || table === 'payments')) {
            continue;
          }
          it(`G21 ${table} ${who} UPDATE ${driver} ${event} ${event === 'on_set' ? 'null' : 'set'}`, async () => {
            const m = await arrange(table, who, table === 'payments' ? 'verified' : event === 'on_clear' ? 'set' : 'base');
            const next = event === 'on_clear' ? null : driver === 'refund_amount' ? 20 : '2001-01-01T00:00:00Z';
            await exactWrite(m, sql`${sql.identifier(driver)}=${next}`, driver, next);
          });
        }
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const [target, stamps] of Object.entries(cfg.on_transition?.stamps ?? {})) {
      for (const column of Object.keys(stamps)) {
        for (const who of ['o1', 's1', 'ua'] as const) {
          const machine = who === 'ua' && cfg.client_transitions ? cfg.client_transitions : cfg.transitions;
          const source = machine?.edges.find(([, to]) => to === target)?.[0] ?? (table === 'calendar_events' && who !== 'ua' ? (target === 'due' ? 'completed' : 'due') : undefined);
          if (source === undefined || who === 'ua' && clientInvisible.includes(table) || table === 'payments' && who === 'ua') {
            continue;
          }
          it(`G21 ${table} ${who} UPDATE ${column} on_transition ${String(source)} -> ${target}`, async () => {
            const m = await arrange(table, who, source);
            const driver = cfg.on_transition!.column;
            await exactWrite(m, sql`${sql.identifier(driver)}=${target}`, driver, target);
          });
          if ((who === 'ua' ? cfg.client_transitions?.insert ?? cfg.transitions?.insert : cfg.transitions?.insert)?.includes(target)||table==='calendar_events'&&who!=='ua') {
            it(`G21 ${table} ${who} INSERT ${column} on_transition ${target}`, async () => {
              const m = await arrange(table, who, source);
              const input = await insertion(m, { [cfg.on_transition!.column]: target });
              const row = await exactInsert(m, input.statement, input.where, input.row);
              expect(row[column]).toBeDefined();
            });
          }
        }
      }
    }
  }
  for (const [table, cfg] of Object.entries(GUARDS)) {
    for (const driver of Object.keys(cfg.on_set ?? {})) {
      for (const who of INSERT_ACTORS[table] ?? []) {
        if (cfg.insert_eq && driver in cfg.insert_eq || who === 'ua' && cfg.client_insert_eq && driver in cfg.client_insert_eq) {
          continue;
        }
        it(`G21 ${table} ${who} INSERT ${driver} on_set non-null initial`, async () => {
          const m = await arrange(table, who, baseState(table));
          const input = await insertion(m, { [driver]: '2001-01-01T00:00:00Z' });
          await exactInsert(m, input.statement, input.where, input.row);
        });
      }
    }
  }
  for (const table of ['tenants', 'notifications']) {
    it(`G21 ${table} o1 INSERT id lacks table privilege`, async () => {
      const m = await arrange(table, 'o1');
      const input = await insertion(m);
      const before = await matrixImage(m);
      const e = await expectPrivilege(as(m.ctx, tx => tx.execute(input.statement)));
      expect(e.message).toContain('table '+table);
      expect(await matrixImage(m)).toEqual(before);
      await control(m);
    });
  }
  it('G20 media o1 UPDATE deleted_at null protected non-pending payment proof precedes guard', async () => {
    const m = await arrange('media', 'o1', null);
    await svc(tx => tx.execute(sql`update payments set proof_media_id=${m.row.id},state='verified',verified_at=now(),verified_by=${m.ctx.userId} where id=${m.f.payA}`));
    const before = await matrixImage(m);
    const e = await expectGuard(as(m.ctx, tx => tx.execute(sql`update media set deleted_at=now() where ${m.where}`)), SPECIAL_PRECEDENCE.paymentProofDelete, 'deleted_at');
    expect(e.code).toBe('P0001');
    expect(e.table_name).toBe('media');
    expect(await matrixImage(m)).toEqual(before);
    await exactWrite(m, sql`width=100`, 'width', 100);
  });
  it('G22 guards service SELECT complete table/key/column/operation/actor/OLD-state contract', async () => {
    const rows = await svc(tx => q<{ table: string;args: string }>(tx, sql`select c.relname as table,encode(t.tgargs,'hex') as args from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where not t.tgisinternal and n.nspname='public' and pn.nspname='app' and p.proname='guard_row' order by c.relname`));
    expect(rows.map(r => r.table)).toEqual(Object.keys(GUARDS).sort());
    // 0008: D/E add ai_drafts_50_guard and red_flags_50_guard.
    expect(rows).toHaveLength(42);
    expect(Object.keys(GUARD_COLUMNS).sort()).toEqual(Object.keys(GUARDS).sort());
    const actual: Record<string, GuardConfig> = {};
    for (const row of rows) {
      const args = Buffer.from(row.args, 'hex').toString('utf8').split('\0');
      expect(args).toHaveLength(2);
      expect(args[1]).toBe('');
      actual[row.table] = JSON.parse(args[0]!) as GuardConfig;
    }
    expect(actual).toEqual(GUARDS);
    expect(contractTuples(actual)).toEqual(contractTuples(GUARDS));
    const columns = await svc(tx => q<{ table: string;column: string }>(tx, sql`select table_name as table,column_name as column from information_schema.columns where table_schema='public' and table_name in (${sql.join(Object.keys(GUARD_COLUMNS).map(t => sql`${t}`), sql`,`)}) order by table_name,column_name`));
    expect(columns.map(r => r.table+'.'+r.column)).toEqual(Object.entries(GUARD_COLUMNS).flatMap(([table, list]) => list.split(' ').map(c => table+'.'+c.split(':')[0])).sort());
  });
});
