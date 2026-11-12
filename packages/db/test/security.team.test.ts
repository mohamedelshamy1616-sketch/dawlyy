import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { closeDb, withUserTx, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership } from './factories';
import { as, svc, q, one, serviceRow, serviceRowWhere, expectGuard, expectRls, expectPrivilege, expectCode, expectNoEffect } from './helpers';

let fx: Fixture;
beforeAll(async () => {
  fx = await buildFixture();
});
afterAll(async () => {
  try {
    await truncateAll();
  } finally {
    await closeDb();
  }
});
const ids = (rows: readonly { id: string }[]) => rows.map(r => r.id).sort();
async function snapshot(f: Fixture): Promise<unknown> {
  return svc(tx => Promise.all(['tenants', 'memberships', 'staff_client_assignments', 'clients', 'invitations', 'tasks', 'business_settings', 'user_preferences', 'consents', 'audit_log', 'events'].map(table => q(tx, table === 'tenants' ? sql`select to_jsonb(t) as row from tenants t where id in (${f.t1},${f.t2}) order by id` : sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where tenant_id in (${f.t1},${f.t2}) order by to_jsonb(t)::text`))));
}
async function deny(f: Fixture, ctx: AuthContext, statement: SQL, kind: 'rls' | 'privilege' | { rule: string;column: string;table: string;code?: string } | { code: string;constraint: string }): Promise<void> {
  const before = await snapshot(f);
  const work = as(ctx, tx => tx.execute(statement));
  if (kind === 'rls') {
    await expectRls(work);
  }
  else if (kind === 'privilege') {
    const error = await expectPrivilege(work);
    const text = new PgDialect().sqlToQuery(statement).sql;
    const table = text.match(/\b(?:delete\s+from|update|insert\s+into)\s+"?(\w+)/i)?.[1];
    const fn = text.match(/\bselect\s+app\."?(\w+)/i)?.[1];
    if (table) {
      expect(error.message).toContain('table '+table);
    }
    if (fn) {
      expect(error.message).toContain('function '+fn);
    }
  }
  else if ('rule' in kind) {
    const e = await expectGuard(work, kind.rule, kind.column);
    expect(e.table_name).toBe(kind.table);
    if (kind.code) {
      expect(e.code).toBe(kind.code);
    }
  }
  else expect((await expectCode(work, kind.code)).constraint_name).toBe(kind.constraint);
  expect(await snapshot(f)).toEqual(before);
}
const guard = (rule: string, column: string, table: string) => ({ rule, column, table });
function invitation(f: Fixture, ctx: AuthContext, id: string, extra: Record<string, unknown> = {}): SQL {
  const row = { id, tenant_id: f.t1, client_id: f.clientA, role: 'client', token_hash: id, invited_by: ctx.userId, expires_at: '2035-01-01T00:00:00Z', ...extra };
  return sql`insert into invitations (${sql.join(Object.keys(row).map(sql.identifier), sql`,`)}) values (${sql.join(Object.values(row).map(v => sql`${v}`), sql`,`)})`;
}
async function ownEdit(ctx: AuthContext): Promise<void> {
  await as(ctx, tx => tx.execute(sql`update memberships set display_name='self',phone='01000000000',locale='en',last_seen_at='2026-01-01T00:00:00Z' where id=${ctx.membershipId}`));
  expect(await serviceRow('memberships', ctx.membershipId)).toMatchObject({ display_name: 'self', phone: '01000000000', locale: 'en' });
}
async function createClient(ctx: AuthContext, id = randomUUID(), returning = false): Promise<string> {
  const n = Number((await serviceRow('tenants', ctx.tenantId))?.client_counter);
  const code = 'DW-'+String(n+1).padStart(6, '0');
  await as(ctx, async tx => {
    await tx.execute(sql`insert into clients(id,tenant_id,first_name) values(${id},${ctx.tenantId},'Private')${returning ? sql` returning id` : sql``}`);
    expect(await q(tx, sql`select id,code from clients where id=${id}`)).toEqual([{ id, code }]);
  });
  expect(await serviceRow('clients', id)).toMatchObject({ id, tenant_id: ctx.tenantId, created_by: ctx.userId, code });
  return id;
}
async function grant(ctx: AuthContext, modules: Record<string, string[]>): Promise<AuthContext> {
  const permissions = { client_scope: ctx.permissions?.client_scope ?? 'all' as const, modules };
  await svc(tx => tx.execute(sql`update memberships set permissions=${JSON.stringify(permissions)}::jsonb where id=${ctx.membershipId}`));
  return { ...ctx, permissions };
}

describe('tenant, team and client identity writes', () => {
  for (const variant of ['owner', 'staff', 'client-permissions'] as const) {
    it(`T01 invitations s1 INSERT role ${variant} pending`, async () => {
      const f = await buildPrivateFixture();
      const id = randomUUID();
      await deny(f, f.s1, invitation(f, f.s1, id, variant === 'client-permissions' ? { permissions: '{}' } : { role: variant, client_id: null }), 'rls');
      await as(f.s1, tx => tx.execute(invitation(f, f.s1, id, { invited_by: f.ub.userId })));
      expect(await serviceRow('invitations', id)).toMatchObject({ role: 'client', client_id: f.clientA, permissions: null, invited_by: f.s1.userId });
    });
  }
  it('T02 invitations s1/s2/o1 SELECT id and s1 INSERT client_id unassigned B pending', async () => {
    for (const [ctx, want] of [[fx.s1, [fx.invS1ClientA]], [fx.s2, [fx.invS1ClientA, fx.invO1ClientB]], [fx.o1, [fx.invOwnerStaff, fx.invS1ClientA, fx.invO1ClientB]]] as const)
    {
      expect(ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select id from invitations`)))).toEqual([...want].sort());
    }
    const f = await buildPrivateFixture();
    const id = randomUUID();
    await deny(f, f.s1, invitation(f, f.s1, id, { client_id: f.clientB }), 'rls');
    await as(f.s1, tx => tx.execute(invitation(f, f.s1, id)));
    expect(await serviceRow('invitations', id)).toMatchObject({ client_id: f.clientA });
  });
  for (const who of ['s1', 'o1'] as const) {
    for (const column of ['token_hash', 'role', 'client_id', 'invited_by', 'accepted_at', 'accepted_user_id']) {
      it(`T03 invitations ${who} UPDATE ${column} pending`, async () => {
        const f = await buildPrivateFixture();
        const ctx = f[who];
        const id = randomUUID();
        await as(ctx, tx => tx.execute(invitation(f, ctx, id)));
        const value = column === 'token_hash' ? 'forged' : column === 'role' ? 'staff' : column === 'accepted_at' ? '2026-01-01T00:00:00Z' : column === 'client_id' ? f.clientB : f.ub.userId;
        await deny(f, ctx, sql`update invitations set ${sql.identifier(column)}=${value} where id=${id}`, guard('immutable', column, 'invitations'));
        await as(ctx, tx => tx.execute(sql`update invitations set status='revoked' where id=${id}`));
        expect(await serviceRow('invitations', id)).toMatchObject({ status: 'revoked' });
      });
    }
  }
  it('T04 invitations s1 UPDATE other inviter and DELETE pending; owner delete permitted', async () => {
    const f = await buildPrivateFixture();
    await expectNoEffect(f.s1, sql`update invitations set status='revoked' where id=${f.invO1ClientB}`, 'invitations', sql`id=${f.invO1ClientB}`);
    await expectNoEffect(f.s1, sql`delete from invitations where id=${f.invS1ClientA}`, 'invitations', sql`id=${f.invS1ClientA}`);
    await as(f.s1, tx => tx.execute(sql`update invitations set status='revoked' where id=${f.invS1ClientA}`));
    expect(await serviceRow('invitations', f.invS1ClientA)).toMatchObject({ status: 'revoked' });
    expect(await as(f.o1, tx => q(tx, sql`delete from invitations where id=${f.invOwnerStaff} returning id`))).toEqual([{ id: f.invOwnerStaff }]);
    expect(await serviceRow('invitations', f.invOwnerStaff)).toBeUndefined();
  });
  for (const who of ['s1', 'o1'] as const) {
    it(`T05 invitations ${who} UPDATE status pending -> accepted/expired`, async () => {
      const f = await buildPrivateFixture();
      const ctx = f[who];
      const id = randomUUID();
      await as(ctx, tx => tx.execute(invitation(f, ctx, id)));
      await deny(f, ctx, sql`update invitations set status='accepted' where id=${id}`, guard('transitions', 'status', 'invitations'));
      await as(ctx, tx => tx.execute(sql`update invitations set status='expired' where id=${id}`));
      expect(await serviceRow('invitations', id)).toMatchObject({ status: 'expired' });
    });
  }
  for (const column of ['accepted_at', 'accepted_user_id']) {
    it(`T05 invitations s1 INSERT ${column} pending`, async () => {
      const f = await buildPrivateFixture();
      const id = randomUUID();
      await deny(f, f.s1, invitation(f, f.s1, id, { [column]: column === 'accepted_at' ? '2026-01-01T00:00:00Z' : f.ua.userId }), guard('insert_eq', column, 'invitations'));
      await as(f.s1, tx => tx.execute(invitation(f, f.s1, id)));
      expect(await serviceRow('invitations', id)).toMatchObject({ accepted_at: null, accepted_user_id: null, status: 'pending' });
      await svc(tx => tx.execute(sql`update invitations set status='accepted',accepted_at=now(),accepted_user_id=${f.ua.userId} where id=${id}`));
      expect(await serviceRow('invitations', id)).toMatchObject({ status: 'accepted', accepted_user_id: f.ua.userId });
    });
  }
  for (const column of ['id', 'client_counter', 'receipt_counter', 'created_at']) {
    it(`T06 tenants o1 UPDATE ${column} active`, async () => {
      const f = await buildPrivateFixture();
      const value = column === 'id' ? randomUUID() : column === 'created_at' ? '2001-01-01T00:00:00Z' : 99;
      await deny(f, f.o1, sql`update tenants set ${sql.identifier(column)}=${value} where id=${f.t1}`, guard('immutable', column, 'tenants'));
      await as(f.o1, tx => tx.execute(sql`update tenants set name='allowed' where id=${f.t1}`));
      expect(await serviceRow('tenants', f.t1)).toMatchObject({ name: 'allowed' });
      for (const ctx of [f.s1, f.ua]) {
        await expectNoEffect(ctx, sql`update tenants set name='forged' where id=${f.t1}`, 'tenants', sql`id=${f.t1}`);
        expect(await as(ctx, tx => q(tx, sql`select id from tenants`))).toEqual([{ id: f.t1 }]);
      }
    });
  }
  for (const who of ['ua', 's1', 'o1'] as const) {
    for (const fn of ['next_client_code', 'next_receipt_no']) {
      it(`T07 tenants ${who} EXECUTE ${fn} active`, async () => {
        const f = await buildPrivateFixture();
        await deny(f, f[who], sql`select app.${sql.identifier(fn)}(${f.t1}::uuid)`, 'privilege');
        expect(await as(f[who], tx => q(tx, sql`select id from tenants`))).toEqual([{ id: f.t1 }]);
        await deny(f, f.o1, sql`delete from clients where id=${f.clientA}`, 'privilege');
        const id = await createClient(f.o1);
        expect((await serviceRow('clients', id))?.code).toMatch(/^DW-\d{6,}$/);
      });
    }
  }
  it('T08 memberships/assignments s1/ua/o1 SELECT exact tenant and self sets', async () => {
    for (const [ctx, want] of [[fx.s1, [fx.o1.membershipId, fx.s1.membershipId, fx.s2.membershipId, fx.sx.membershipId, fx.ua.membershipId]], [fx.ua, [fx.ua.membershipId]], [fx.o1, [fx.o1.membershipId, fx.s1.membershipId, fx.s2.membershipId, fx.sx.membershipId, fx.ua.membershipId, fx.ub.membershipId, fx.o1t2.membershipId]]] as const) {
      expect(ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select id from memberships`)))).toEqual([...want].sort());
      expect(await as(ctx, tx => q(tx, sql`select tenant_id,membership_id,client_id from staff_client_assignments`))).toEqual(ctx.role === 'client' ? [] : [{ tenant_id: fx.t1, membership_id: fx.s1MembershipId, client_id: fx.clientA }]);
    }
  });
  for (const who of ['s1', 'ua'] as const) {
    for (const column of ['permissions', 'role', 'status']) {
      it(`T09 memberships ${who} UPDATE ${column} self active`, async () => {
        const f = await buildPrivateFixture();
        const ctx = f[who];
        const value = column === 'permissions' ? sql`'{"client_scope":"all","modules":{}}'::jsonb` : column === 'role' ? sql`'owner'` : sql`'disabled'`;
        await deny(f, ctx, sql`update memberships set ${sql.identifier(column)}=${value} where id=${ctx.membershipId}`, guard(who === 'ua' ? 'client_update' : 'staff_update', column, 'memberships'));
        await expectNoEffect(ctx, sql`update memberships set display_name='forged' where id=${f.ub.membershipId}`, 'memberships', sql`id=${f.ub.membershipId}`);
        await ownEdit(ctx);
      });
    }
  }
  for (const column of ['role', 'status']) {
    it(`T10 memberships o1 UPDATE ${column} sole active owner`, async () => {
      const f = await buildPrivateFixture();
      await deny(f, f.o1, sql`update memberships set ${sql.identifier(column)}=${column === 'role' ? 'staff' : 'disabled'} where id=${f.o1.membershipId}`, { ...guard('rule:app.keep_one_owner', column, 'memberships'), code: 'P0001' });
      await deny(f, f.o1, sql`delete from memberships where id=${f.o1.membershipId}`, 'privilege');
      const second = await mkMembership(f.o1);
      await as(f.o1, tx => tx.execute(sql`update memberships set role='staff' where id=${f.o1.membershipId}`));
      expect(await serviceRow('memberships', f.o1.membershipId)).toMatchObject({ role: 'staff' });
      expect(await as(second, tx => one(tx, sql`select count(*)::int as n from memberships where role='owner' and status='active'`))).toEqual({ n: 1 });
    });
  }
  it('T11 memberships two owners UPDATE status active -> disabled with overlapping transactions', async () => {
    const f = await buildPrivateFixture();
    const second = await mkMembership(f.o1);
    let ready = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const beforeRows = await Promise.all([serviceRow('memberships', f.o1.membershipId), serviceRow('memberships', second.membershipId)]);
    const beforeAudit = await Promise.all([f.o1, second].map(ctx => serviceRowWhere('audit_log', sql`tenant_id=${f.t1} and entity='memberships' and entity_id=${ctx.membershipId}`)));
    const work = (ctx: AuthContext) => as(ctx, async tx => {
      await tx.execute(sql`select pg_backend_pid()`);
      ready++;
      if (ready === 2) {
        release();
      }
      await barrier;
      await tx.execute(sql`update memberships set status='disabled' where id=${ctx.membershipId}`);
    });
    const results = await Promise.allSettled([work(f.o1), work(second)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const loser = results.findIndex(r => r.status === 'rejected');
    const rejected = results[loser];
    if (!rejected || rejected.status !== 'rejected') {
      throw new Error('expected losing owner');
    }
    const error = await expectGuard(Promise.reject(rejected.reason), 'rule:app.keep_one_owner', 'status');
    expect(error.code).toBe('P0001');
    expect(error.table_name).toBe('memberships');
    expect(await svc(tx => one(tx, sql`select count(*)::int as n from memberships where tenant_id=${f.t1} and role='owner' and status='active'`))).toEqual({ n: 1 });
    const ctx = loser === 0 ? f.o1 : second;
    expect(await serviceRow('memberships', ctx.membershipId)).toEqual(beforeRows[loser]);
    expect(await serviceRowWhere('audit_log', sql`tenant_id=${f.t1} and entity='memberships' and entity_id=${ctx.membershipId}`)).toEqual(beforeAudit[loser]);
    expect(await as(ctx, tx => q(tx, sql`select id from memberships where id=${ctx.membershipId}`))).toEqual([{ id: ctx.membershipId }]);
  });
  it('T12 memberships ua SELECT team_directory exposes active team names only', async () => {
    const expected = [{ user_id: fx.o1.userId, role: 'owner', display_name: null }, { user_id: fx.s1.userId, role: 'staff', display_name: null }, { user_id: fx.s2.userId, role: 'staff', display_name: null }].sort((a, b) => a.user_id.localeCompare(b.user_id));
    const query = sql`select * from app.team_directory() order by user_id`;
    expect(await withUserTx(fx.ua.userId, tx => q(tx, query))).toEqual([]);
    expect(await as(fx.sx, tx => q(tx, query))).toEqual([]);
    expect(await as(fx.ua, tx => q(tx, query))).toEqual(expected);
  });
  it('T13 clients assistant INSERT id without create then assigned creator grant', async () => {
    const f = await buildPrivateFixture();
    let ctx = await mkMembership(f.s1, { preset: 'assistant' });
    const id = randomUUID();
    const statement = sql`insert into clients(id,tenant_id,first_name) values(${id},${f.t1},'Private')`;
    await deny(f, ctx, statement, 'rls');
    ctx = await grant(ctx, { clients: ['create'] });
    await createClient(ctx, id);
    await as(ctx, tx => tx.execute(sql`update clients set phone='01012345678' where id=${id}`));
    expect(await serviceRow('clients', id)).toMatchObject({ phone: '01012345678' });
    expect(await serviceRowWhere('staff_client_assignments', sql`client_id=${id}`)).toEqual([expect.objectContaining({ tenant_id: f.t1, client_id: id, membership_id: ctx.membershipId, assigned_by: ctx.userId })]);
  });
  it('T14 clients assigned staff INSERT RETURNING id rolls back counters and assignment', async () => {
    const f = await buildPrivateFixture();
    const ctx = await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: { clients: ['create'] } } });
    const id = randomUUID();
    await deny(f, ctx, sql`insert into clients(id,tenant_id,first_name) values(${id},${f.t1},'Private') returning id`, 'rls');
    await createClient(ctx, id);
    expect(await as(ctx, tx => q(tx, sql`select id from clients where id=${id}`))).toEqual([{ id }]);
    expect(await serviceRowWhere('staff_client_assignments', sql`client_id=${id}`)).toHaveLength(1);
    const all = await mkMembership(f.s2, { permissions: { client_scope: 'all', modules: { clients: ['create'] } } });
    for (const member of [all, f.o1]) {
      const added = await createClient(member, randomUUID(), true);
      expect(await serviceRowWhere('staff_client_assignments', sql`client_id=${added}`)).toEqual([]);
    }
  });
  for (const column of ['code', 'membership_id']) {
    it(`T15 clients o1 INSERT ${column} default profile`, async () => {
      const f = await buildPrivateFixture();
      const id = randomUUID();
      await deny(f, f.o1, sql`insert into clients(id,tenant_id,first_name,${sql.identifier(column)}) values(${id},${f.t1},'Private',${column === 'code' ? 'spoof' : f.ua.membershipId})`, guard('insert_eq', column, 'clients'));
      const n = Number((await serviceRow('tenants', f.t1))?.client_counter);
      await createClient(f.o1, id);
      expect(await serviceRow('clients', id)).toMatchObject({ code: 'DW-'+String(n+1).padStart(6, '0'), membership_id: null, created_by: f.o1.userId });
    });
  }
  for (const column of ['user_id', 'client_id', 'tenant_id', 'id', 'created_at']) {
    it(`T20 memberships o1 UPDATE ${column} private non-owner`, async () => {
      const f = await buildPrivateFixture();
      const ctx = await mkMembership(f.s2);
      const value = column === 'created_at' ? '2001-01-01T00:00:00Z' : column === 'tenant_id' ? f.t2 : column === 'client_id' ? f.clientA : randomUUID();
      await deny(f, f.o1, sql`update memberships set ${sql.identifier(column)}=${value} where id=${ctx.membershipId}`, guard('immutable', column, 'memberships'));
      await as(f.o1, tx => tx.execute(sql`update memberships set display_name='allowed' where id=${ctx.membershipId}`));
      expect(await serviceRow('memberships', ctx.membershipId)).toMatchObject({ display_name: 'allowed' });
    });
  }
  it('T21 memberships o1 UPDATE role client -> owner retains client_id CHECK', async () => {
    const f = await buildPrivateFixture();
    await deny(f, f.o1, sql`update memberships set role='owner' where id=${f.ua.membershipId}`, { code: '23514', constraint: 'memberships_role_client_ck' });
    await as(f.o1, tx => tx.execute(sql`update memberships set display_name='allowed' where id=${f.ua.membershipId}`));
    expect(await serviceRow('memberships', f.ua.membershipId)).toMatchObject({ role: 'client', display_name: 'allowed' });
  });
  it('T22 memberships o1 UPDATE role staff -> owner then first owner steps down', async () => {
    const f = await buildPrivateFixture();
    await as(f.o1, tx => tx.execute(sql`update memberships set role='owner' where id=${f.s2.membershipId}`));
    expect(await serviceRow('memberships', f.s2.membershipId)).toMatchObject({ role: 'owner', status: 'active', client_id: null });
    await as(f.o1, tx => tx.execute(sql`update memberships set role='staff' where id=${f.o1.membershipId}`));
  });
  for (const who of ['s1', 's2', 'o1', 'ua'] as const) {
    it(`T23 memberships/assignments ${who} INSERT UPDATE DELETE active`, async () => {
      const f = await buildPrivateFixture();
      const ctx = f[who];
      await deny(f, ctx, sql`delete from memberships where id=${ctx.membershipId}`, 'privilege');
      if (who === 's1' || who === 's2') {
        await deny(f, ctx, sql`insert into memberships(tenant_id,user_id,role,status) values(${f.t1},${randomUUID()},'staff','active')`, 'rls');
        await expectNoEffect(ctx, sql`update memberships set display_name='forged' where id=${f.ub.membershipId}`, 'memberships', sql`id=${f.ub.membershipId}`);
        await deny(f, ctx, sql`update memberships set permissions='{}'::jsonb where id=${ctx.membershipId}`, guard('staff_update', 'permissions', 'memberships'));
        await deny(f, ctx, sql`insert into staff_client_assignments(tenant_id,membership_id,client_id) values(${f.t1},${ctx.membershipId},${f.clientB})`, 'rls');
        await expectNoEffect(ctx, sql`delete from staff_client_assignments where membership_id=${f.s1MembershipId} and client_id=${f.clientA}`, 'staff_client_assignments', sql`membership_id=${f.s1MembershipId} and client_id=${f.clientA}`);
      }
      await ownEdit(ctx);
      expect(await as(ctx, tx => q(tx, sql`select client_id from staff_client_assignments`))).toEqual(who === 'ua' ? [] : [{ client_id: f.clientA }]);
      expect(await as(f.o1, tx => q(tx, sql`insert into staff_client_assignments(tenant_id,membership_id,client_id) values(${f.t1},${f.s2.membershipId},${f.clientB}) returning client_id`))).toEqual([{ client_id: f.clientB }]);
      expect(await as(f.o1, tx => q(tx, sql`delete from staff_client_assignments where membership_id=${f.s2.membershipId} and client_id=${f.clientB} returning client_id`))).toEqual([{ client_id: f.clientB }]);
    });
  }
  it('T24 staff_client_assignments o1 INSERT assigned_by and UPDATE privilege', async () => {
    const f = await buildPrivateFixture();
    const now = await as(f.o1, async tx => {
      await tx.execute(sql`insert into staff_client_assignments(tenant_id,membership_id,client_id,assigned_by) values(${f.t1},${f.s2.membershipId},${f.clientB},${f.ub.userId})`);
      return one<{ now: Date }>(tx, sql`select now() as now`);
    });
    const where = sql`membership_id=${f.s2.membershipId} and client_id=${f.clientB}`;
    const row = (await serviceRowWhere('staff_client_assignments', where))[0];
    expect(row).toMatchObject({ assigned_by: f.o1.userId, created_at: now.now });
    await deny(f, f.o1, sql`update staff_client_assignments set assigned_by=${f.ub.userId} where ${where}`, 'privilege');
    expect(await as(f.o1, tx => q(tx, sql`select assigned_by from staff_client_assignments where ${where}`))).toEqual([{ assigned_by: f.o1.userId }]);
  });
  for (const reference of ['client_id', 'membership_id']) {
    it(`T25 staff_client_assignments o1 INSERT ${reference} foreign tenant`, async () => {
      const f = await buildPrivateFixture();
      await deny(f, f.o1, sql`insert into staff_client_assignments(tenant_id,membership_id,client_id) values(${f.t1},${reference === 'membership_id' ? f.o1t2.membershipId : f.s2.membershipId},${reference === 'client_id' ? f.clientC : f.clientB})`, { code: '23503', constraint: reference === 'client_id' ? 'sca_client_fk' : 'sca_membership_fk' });
      await as(f.o1, tx => tx.execute(sql`insert into staff_client_assignments(tenant_id,membership_id,client_id) values(${f.t1},${f.s2.membershipId},${f.clientB})`));
      expect(await serviceRowWhere('staff_client_assignments', sql`membership_id=${f.s2.membershipId} and client_id=${f.clientB}`)).toHaveLength(1);
    });
  }
  for (const task of [false, true]) {
    it(`T26 memberships o1 DELETE staff with assigned task ${task}`, async () => {
      const f = await buildPrivateFixture();
      if (task) {
        await svc(tx => tx.execute(sql`update tasks set assignee_membership_id=${f.s1MembershipId} where id=${f.taskA}`));
      }
      await deny(f, f.o1, sql`delete from memberships where id=${f.s1MembershipId}`, 'privilege');
      await as(f.o1, tx => tx.execute(sql`update memberships set status='disabled' where id=${f.s1MembershipId}`));
      expect(await serviceRow('memberships', f.s1MembershipId)).toMatchObject({ status: 'disabled' });
      expect(await serviceRowWhere('staff_client_assignments', sql`membership_id=${f.s1MembershipId}`)).toHaveLength(1);
      expect(await serviceRow('tasks', f.taskA)).toMatchObject({ assignee_membership_id: task ? f.s1MembershipId : null });
    });
  }
  it('T27 business_settings s2/o1 INSERT UPDATE settings and server attribution', async () => {
    const f = await buildPrivateFixture();
    await deny(f, f.s2, sql`insert into business_settings(tenant_id,settings) values(${f.t1},'{}'::jsonb)`, 'rls');
    const row = await as(f.o1, tx => one(tx, sql`insert into business_settings(tenant_id,settings,updated_by) values(${f.t1},'{}'::jsonb,${f.ub.userId}) returning updated_by,updated_at=now() as clock`));
    expect(row).toEqual({ updated_by: f.o1.userId, clock: true });
    await expectNoEffect(f.s2, sql`update business_settings set settings='{"numerals":"western"}'::jsonb where tenant_id=${f.t1}`, 'business_settings', sql`tenant_id=${f.t1}`);
    expect(await as(f.s2, tx => q(tx, sql`select settings from business_settings`))).toEqual([{ settings: {} }]);
    await deny(f, f.o1, sql`update business_settings set tenant_id=${f.t2} where tenant_id=${f.t1}`, guard('immutable', 'tenant_id', 'business_settings'));
    expect(await as(f.o1, tx => one(tx, sql`update business_settings set settings='{"numerals":"western"}'::jsonb,updated_by=${f.ub.userId} where tenant_id=${f.t1} returning settings,updated_by,updated_at=now() as clock`))).toEqual({ settings: { numerals: 'western' }, updated_by: f.o1.userId, clock: true });
  });
  for (const column of ['tenant_id', 'user_id']) {
    it(`T28 user_preferences ua UPDATE ${column} own and other-user isolation`, async () => {
      const f = await buildPrivateFixture();
      await svc(tx => tx.execute(sql`insert into user_preferences(tenant_id,user_id) values(${f.t1},${f.ua.userId}),(${f.t1},${f.ub.userId})`));
      expect(await as(f.ua, tx => q(tx, sql`select user_id from user_preferences where user_id=${f.ub.userId}`))).toEqual([]);
      expect(await as(f.o1, tx => q(tx, sql`select user_id from user_preferences`))).toEqual([]);
      for (const statement of [sql`update user_preferences set preferences='{}'::jsonb where user_id=${f.ub.userId}`, sql`delete from user_preferences where user_id=${f.ub.userId}`]) {
        await expectNoEffect(f.ua, statement, 'user_preferences', sql`tenant_id=${f.t1} and user_id=${f.ub.userId}`);
      }
      await deny(f, f.ua, sql`update user_preferences set ${sql.identifier(column)}=${column === 'tenant_id' ? f.t2 : f.ub.userId} where user_id=${f.ua.userId}`, guard('immutable', column, 'user_preferences'));
      expect(await as(f.ua, tx => q(tx, sql`update user_preferences set preferences='{"locale":"en"}'::jsonb where user_id=${f.ua.userId} returning preferences`))).toEqual([{ preferences: { locale: 'en' } }]);
      expect(await as(f.ua, tx => q(tx, sql`delete from user_preferences where user_id=${f.ua.userId} returning user_id`))).toEqual([{ user_id: f.ua.userId }]);
      expect(await serviceRowWhere('user_preferences', sql`tenant_id=${f.t1} and user_id=${f.ua.userId}`)).toEqual([]);
    });
  }
  for (const column of ['status', 'tags', 'source', 'code']) {
    it(`T29 clients ua UPDATE ${column} own active`, async () => {
      const f = await buildPrivateFixture();
      const value = column === 'tags' ? sql`array['x']::text[]` : sql`${column === 'status' ? 'archived' : 'forged'}`;
      await deny(f, f.ua, sql`update clients set ${sql.identifier(column)}=${value} where id=${f.clientA}`, guard(column === 'code' ? 'immutable' : 'client_update', column, 'clients'));
      await expectNoEffect(f.ua, sql`update clients set phone='forged' where id=${f.clientB}`, 'clients', sql`id=${f.clientB}`);
      await deny(f, f.ua, sql`insert into clients(tenant_id,first_name) values(${f.t1},'forged')`, 'rls');
      await deny(f, f.ua, sql`delete from clients where id=${f.clientA}`, 'privilege');
      await as(f.ua, tx => tx.execute(sql`update clients set phone='01000000000',profile='{"goal":"strength"}'::jsonb where id=${f.clientA}`));
      expect(await serviceRow('clients', f.clientA)).toMatchObject({ phone: '01000000000', profile: { goal: 'strength' } });
      const ctx = await mkMembership(f.s2, { permissions: { client_scope: 'all', modules: { clients: ['create'] } } });
      await deny(f, ctx, sql`insert into clients(tenant_id,first_name,code) values(${f.t1},'private','forged')`, guard('insert_eq', 'code', 'clients'));
      await createClient(ctx);
    });
  }
  for (const who of ['s1', 's2', 'o1', 'ua'] as const) {
    it(`T30 consents ${who} SELECT user visibility and INSERT foreign/own user`, async () => {
      const f = await buildPrivateFixture();
      const ctx = f[who];
      const team = [f.o1.userId, f.s1.userId, f.s2.userId, f.sx.userId];
      const want = who === 'ua' ? [f.ua.userId] : who === 's1' ? [...team, f.ua.userId] : [...team, f.ua.userId, f.ub.userId];
      expect(ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select app.accessible_user_ids() as id`)))).toEqual(want.sort());
      for (const user of [...team, f.ua.userId, f.ub.userId, f.uc.userId]) {
        expect(await as(ctx, tx => one(tx, sql`select app.can_access_user(${user}::uuid) as ok`))).toEqual({ ok: want.includes(user) });
      }
      const id = randomUUID();
      await deny(f, ctx, sql`insert into consents(id,tenant_id,user_id,kind,version,locale) values(${id},${f.t1},${f.uc.userId},'terms','v2','en')`, 'rls');
      await as(ctx, tx => tx.execute(sql`insert into consents(id,tenant_id,user_id,kind,version,locale) values(${id},${f.t1},${ctx.userId},'terms','v2','en')`));
      expect(await serviceRow('consents', id)).toMatchObject({ user_id: ctx.userId });
    });
  }
  it('T31 clients o1 INSERT code million boundary and duplicate-id savepoint rollback', async () => {
    const f = await buildPrivateFixture();
    await svc(tx => tx.execute(sql`update tenants set client_counter=999998 where id=${f.t1}`));
    for (const code of ['DW-999999', 'DW-1000000', 'DW-1000001']) {
      const id = await createClient(f.o1);
      expect(await serviceRow('clients', id)).toMatchObject({ code });
    }
    const before = await snapshot(f);
    const pk = await svc(tx => one<{ name: string }>(tx, sql`select c.conname as name from pg_constraint c where c.conrelid='public.clients'::regclass and c.contype='p' and (select array_agg(a.attname::text order by k.n) from unnest(c.conkey) with ordinality k(num,n) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num)=array['id']::text[]`));
    await as(f.o1, async tx => {
      // tx.transaction is Drizzle's SAVEPOINT (raw `savepoint` text through tx.execute makes postgres.js rethrow at commit).
      const e = await expectCode(() => tx.transaction(sp => sp.execute(sql`insert into clients(id,tenant_id,first_name) values(${f.clientA},${f.t1},'duplicate')`)), '23505');
      expect(e.constraint_name).toBe(pk.name);
    });
    expect(await snapshot(f)).toEqual(before);
    const id = await createClient(f.o1);
    expect(await serviceRow('clients', id)).toMatchObject({ code: 'DW-1000002' });
  });
});
