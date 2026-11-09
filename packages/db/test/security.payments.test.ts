import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { closeDb, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership, mkPayment, mkPackage, mkSubscription } from './factories';
import { as, svc, q, one, serviceRow, serviceRowWhere, expectGuard, expectCode, expectRls, expectPrivilege, expectNoEffect } from './helpers';

beforeAll(async () => {
  await buildFixture();
});
afterAll(async () => {
  try {
    await truncateAll();
  } finally {
    await closeDb();
  }
});
type Row = Record<string, unknown>;
async function payment(id: string): Promise<Row> {
  return (await svc(tx => one<{ row: Row }>(tx, sql`select to_jsonb(p) as row from payments p where id=${id}`))).row;
}
async function image(f: Fixture): Promise<unknown> {
  return svc(tx => Promise.all(['tenants', 'payments', 'packages', 'subscriptions', 'subscription_events', 'client_entitlement_overrides', 'media', 'audit_log', 'events'].map(table => q(tx, table === 'tenants' ? sql`select to_jsonb(t) as row from tenants t where id in (${f.t1},${f.t2}) order by id` : sql`select to_jsonb(t) as row from ${sql.identifier(table)} t where tenant_id in (${f.t1},${f.t2}) order by to_jsonb(t)::text`))));
}
async function deny(f: Fixture, ctx: AuthContext | null, statement: SQL, expected: { rule: string;column?: string;table?: string;code?: string } | { code: string;constraint: string } | 'rls' | 'privilege'): Promise<void> {
  const before = await image(f);
  const work = ctx ? as(ctx, tx => tx.execute(statement)) : svc(tx => tx.execute(statement));
  if (expected === 'rls') {
    await expectRls(work);
  }
  else if (expected === 'privilege') {
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
  else if ('rule' in expected) {
    const e = await expectGuard(work, expected.rule, expected.column);
    expect(e.table_name).toBe(expected.table ?? 'payments');
    if (expected.code) {
      expect(e.code).toBe(expected.code);
    }
  }
  else expect((await expectCode(work, expected.code)).constraint_name).toBe(expected.constraint);
  expect(await image(f)).toEqual(before);
}
const guard = (rule: string, column?: string, table = 'payments') => ({ rule, column, table });
function insert(f: Fixture, id: string, extra: Record<string, SQL> = {}): SQL {
  const row: Record<string, SQL> = { id: sql`${id}`, tenant_id: sql`${f.t1}`, client_id: sql`${f.clientA}`, subscription_id: sql`${f.subA}`, amount: sql`100`, currency: sql`'EGP'`, method: sql`'cash'`, ...extra };
  return sql`insert into payments(${sql.join(Object.keys(row).map(sql.identifier), sql`,`)}) values(${sql.join(Object.values(row), sql`,`)})`;
}
async function staff(f: Fixture, preset?: 'coach' | 'assistant' | 'business_manager'): Promise<AuthContext> {
  return mkMembership(f.s2, preset ? { preset } : { permissions: { client_scope: 'all', modules: { billing: ['manage'], packages: ['manage'] } } });
}
async function grants(ctx: AuthContext, module: string, actions: string[]): Promise<AuthContext> {
  const permissions = { client_scope: ctx.permissions?.client_scope ?? 'all' as const, modules: { ...ctx.permissions?.modules, [module]: actions } };
  await svc(tx => tx.execute(sql`update memberships set permissions=${JSON.stringify(permissions)}::jsonb where id=${ctx.membershipId}`));
  return { ...ctx, permissions };
}
async function verify(ctx: AuthContext, id: string): Promise<Row> {
  return as(ctx, async tx => {
    await tx.execute(sql`update payments set state='verified' where id=${id}`);
    const { row } = await one<{ row: Row }>(tx, sql`select to_jsonb(p) as row from payments p where id=${id}`);
    expect(row.verified_by).toBe(ctx.userId);
    expect(new Date(String(row.verified_at)).getTime()).toBe(new Date((await one<{ clock: string }>(tx, sql`select now()::text as clock`)).clock).getTime());
    return row;
  });
}
async function reference(ctx: AuthContext, id: string): Promise<void> {
  await as(ctx, tx => tx.execute(sql`update payments set reference='allowed' where id=${id}`));
  expect(await payment(id)).toMatchObject({ reference: 'allowed' });
}
const receipt = (n: number) => 'R-'+String(n).padStart(6, '0');
async function counter(f: Fixture): Promise<number> {
  return Number((await serviceRow('tenants', f.t1))?.receipt_counter);
}
async function primaryKey(table: string): Promise<string> {
  return (await svc(tx => one<{ name: string }>(tx, sql`select c.conname as name from pg_constraint c where c.conrelid=${'public.'+table}::regclass and c.contype='p' and (select array_agg(a.attname::text order by k.n) from unnest(c.conkey) with ordinality k(num,n) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num)=array['id']::text[]`))).name;
}

describe('payments, subscription history and catalogue permissions', () => {
  const clientEq: Readonly<Record<string, SQL>> = { state: sql`'verified'`, notes: sql`'forged'`, provider: sql`'gateway'`, provider_ref: sql`'forged'` };
  const serverEq: Readonly<Record<string, SQL>> = { verified_at: sql`'2001-01-01T00:00:00Z'`, verified_by: sql`${randomUUID()}`, receipt_no: sql`'R-forged'`, refunded_at: sql`'2001-01-01T00:00:00Z'`, refund_amount: sql`20`, rejected_reason: sql`'forged'` };
  for (const [column, value] of Object.entries({ ...clientEq, ...serverEq })) {
    it(`P01 payments ua INSERT ${column} pending`, async () => {
      const f = await buildPrivateFixture();
      const id = randomUUID();
      await deny(f, f.ua, insert(f, id, { [column]: value }), guard(column in clientEq ? 'client_insert_eq' : 'insert_eq', column));
      expect(await serviceRow('payments', id)).toBeUndefined();
      await as(f.ua, tx => tx.execute(insert(f, id)));
      expect(await payment(id)).toMatchObject({ amount: 100, currency: 'EGP', method: 'cash', state: 'pending', created_by: f.ua.userId, receipt_no: null, verified_at: null, verified_by: null, refund_amount: null, refunded_at: null, notes: null, provider: null, provider_ref: null });
    });
  }
  for (const [column, value] of Object.entries({ state: sql`'verified'`, notes: sql`'forged'`, amount: sql`120`, currency: sql`'USD'`, method: sql`'other'` })) {
    it(`P02 payments ua UPDATE ${column} pending`, async () => {
      const f = await buildPrivateFixture();
      await deny(f, f.ua, sql`update payments set ${sql.identifier(column)}=${value} where id=${f.payA}`, guard('client_update', column));
      await as(f.ua, tx => tx.execute(sql`update payments set proof_media_id=${f.mediaA},reference='proof-1',paid_at='2026-01-01T00:00:00Z' where id=${f.payA}`));
      const stored = await payment(f.payA);
      expect(stored).toMatchObject({ proof_media_id: f.mediaA, reference: 'proof-1' });
      expect(new Date(String(stored.paid_at)).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  }
  for (const state of ['rejected', 'refunded']) {
    it(`P02 payments ua UPDATE state pending -> ${state}`, async () => {
      const f = await buildPrivateFixture();
      await deny(f, f.ua, sql`update payments set state=${state} where id=${f.payA}`, guard('client_update', 'state'));
      await reference(f.ua, f.payA);
    });
  }
  for (const kind of ['client', 'subscription', 'proof'] as const) {
    it(`P03 payments ua INSERT ${kind}_id other client and s1 UPDATE B pending`, async () => {
      const f = await buildPrivateFixture();
      const id = randomUUID();
      const extra: Record<string, SQL> = kind === 'client' ? { client_id: sql`${f.clientB}`, subscription_id: sql`${f.subB}` } : kind === 'subscription' ? { subscription_id: sql`${f.subB}` } : { proof_media_id: sql`${f.mediaB}` };
      await deny(f, f.ua, insert(f, id, extra), kind === 'client' ? 'rls' : { code: '23503', constraint: kind === 'subscription' ? 'payments_subscription_fk' : 'payments_proof_media_fk' });
      await as(f.ua, tx => tx.execute(insert(f, id, { proof_media_id: sql`${f.mediaA}` })));
      expect(await payment(id)).toMatchObject({ client_id: f.clientA, subscription_id: f.subA, proof_media_id: f.mediaA });
      await expectNoEffect(f.s1, sql`update payments set reference='forged' where id=${f.payB}`, 'payments', sql`id=${f.payB}`);
      const ctx = await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: { billing: ['edit'] } } });
      await reference(ctx, f.payA);
    });
  }
  for (const who of ['o1', 's2'] as const) {
    for (const column of ['amount', 'currency', 'method', 'proof_media_id', 'reference', 'paid_at']) {
      it(`P04 payments ${who} UPDATE ${column} pending/verified`, async () => {
        const f = await buildPrivateFixture();
        const ctx = who === 'o1' ? f.o1 : await staff(f);
        const values: Record<string, SQL> = { amount: sql`120`, currency: sql`'USD'`, method: sql`'other'`, proof_media_id: sql`${f.mediaA}`, reference: sql`'proof'`, paid_at: sql`'2026-01-01T00:00:00Z'` };
        await as(ctx, tx => tx.execute(sql`update payments set amount=120,currency='USD',method='other',proof_media_id=${f.mediaA},reference='proof',paid_at='2026-01-01T00:00:00Z' where id=${f.payA}`));
        expect(await payment(f.payA)).toMatchObject({ amount: 120, currency: 'USD', method: 'other', proof_media_id: f.mediaA, reference: 'proof' });
        await verify(ctx, f.payA);
        const alternate: Record<string, SQL> = { amount: sql`130`, currency: sql`'EGP'`, method: sql`'cash'`, proof_media_id: sql`null`, reference: sql`'changed'`, paid_at: sql`'2026-02-01T00:00:00Z'` };
        expect(values[column]).toBeDefined();
        await deny(f, ctx, sql`update payments set ${sql.identifier(column)}=${alternate[column]!} where id=${f.payA}`, guard('editable_in', column));
        await as(ctx, tx => tx.execute(sql`update payments set notes='internal' where id=${f.payA}`));
        expect(await payment(f.payA)).toMatchObject({ notes: 'internal' });
      });
    }
  }
  for (const column of ['id', 'tenant_id', 'client_id', 'created_by', 'created_at', 'verified_at', 'verified_by', 'receipt_no', 'refunded_at', 'provider', 'provider_ref']) {
    it(`P05 payments o1 UPDATE ${column} pending immutable`, async () => {
      const f = await buildPrivateFixture();
      const value = column.endsWith('_at') ? sql`'2001-01-01T00:00:00Z'` : column === 'tenant_id' ? sql`${f.t2}` : column === 'client_id' ? sql`${f.clientB}` : ['receipt_no', 'provider', 'provider_ref'].includes(column) ? sql`'forged'` : sql`${randomUUID()}`;
      await deny(f, f.o1, sql`update payments set ${sql.identifier(column)}=${value} where id=${f.payA}`, guard('immutable', column));
      await reference(f.o1, f.payA);
    });
  }
  for (const replacement of ['other', 'null'] as const) {
    it(`P06 payments o1 UPDATE subscription_id set-once -> ${replacement}`, async () => {
      const f = await buildPrivateFixture();
      await svc(tx => tx.execute(sql`update payments set subscription_id=null where id=${f.payA}`));
      await deny(f, f.o1, sql`update payments set subscription_id=${f.subB} where id=${f.payA}`, { code: '23503', constraint: 'payments_subscription_fk' });
      await as(f.o1, tx => tx.execute(sql`update payments set subscription_id=${f.subA} where id=${f.payA}`));
      expect(await payment(f.payA)).toMatchObject({ subscription_id: f.subA });
      await deny(f, f.o1, sql`update payments set subscription_id=${replacement === 'null' ? null : f.subB} where id=${f.payA}`, guard('set_once', 'subscription_id'));
      await as(f.o1, tx => tx.execute(sql`update payments set subscription_id=${f.subA},notes='allowed' where id=${f.payA}`));
      expect(await payment(f.payA)).toMatchObject({ subscription_id: f.subA, notes: 'allowed' });
    });
  }
  for (const lower of [10, null]) {
    it(`P07 payments o1 UPDATE refund_amount verified 60 -> ${lower}`, async () => {
      const f = await buildPrivateFixture();
      await verify(f.o1, f.payA);
      const n = await counter(f);
      const first = await as(f.o1, tx => one(tx, sql`update payments set refund_amount=20 where id=${f.payA} returning refunded_at=now() as clock`));
      expect(first).toEqual({ clock: true });
      const timestamp = (await payment(f.payA)).refunded_at;
      await as(f.o1, tx => tx.execute(sql`update payments set refund_amount=60 where id=${f.payA}`));
      expect(await payment(f.payA)).toMatchObject({ state: 'verified', refund_amount: 60, refunded_at: timestamp });
      await deny(f, f.o1, sql`update payments set refund_amount=${lower} where id=${f.payA}`, guard('monotonic', 'refund_amount'));
      await as(f.o1, tx => tx.execute(sql`update payments set refund_amount=100,state='refunded' where id=${f.payA}`));
      expect(await payment(f.payA)).toMatchObject({ state: 'refunded', refund_amount: 100, refunded_at: timestamp, receipt_no: receipt(n) });
      expect(await counter(f)).toBe(n);
    });
  }
  for (const variant of ['partial-state', 'null-state', 'full-without-state', 'pending-write'] as const) {
    it(`P08 payments o1 UPDATE refund_amount/state ${variant}`, async () => {
      const f = await buildPrivateFixture();
      if (variant !== 'pending-write') {
        await verify(f.o1, f.payA);
      }
      const bad = variant === 'partial-state' ? sql`refund_amount=20,state='refunded'` : variant === 'null-state' ? sql`state='refunded'` : variant === 'full-without-state' ? sql`refund_amount=100` : sql`refund_amount=20`;
      await deny(f, f.o1, sql`update payments set ${bad} where id=${f.payA}`, variant === 'pending-write' ? guard('editable_in', 'refund_amount') : { code: '23514', constraint: 'payments_refund_state_ck' });
      if (variant === 'pending-write') {
        await verify(f.o1, f.payA);
        await as(f.o1, tx => tx.execute(sql`update payments set refund_amount=20 where id=${f.payA}`));
        expect(await payment(f.payA)).toMatchObject({ state: 'verified', refund_amount: 20 });
      }
      else {
        await as(f.o1, tx => tx.execute(sql`update payments set refund_amount=100,state='refunded' where id=${f.payA}`));
        expect(await payment(f.payA)).toMatchObject({ state: 'refunded', refund_amount: 100 });
      }
    });
  }
  it('P09 payments o1 UPDATE rejected_reason pending/rejected', async () => {
    const f = await buildPrivateFixture();
    await deny(f, f.o1, sql`update payments set rejected_reason='unreadable' where id=${f.payA}`, { code: '23514', constraint: 'payments_rejected_reason_ck' });
    await as(f.o1, tx => tx.execute(sql`update payments set state='rejected',rejected_reason='unreadable' where id=${f.payA}`));
    expect(await payment(f.payA)).toMatchObject({ state: 'rejected', rejected_reason: 'unreadable' });
    await deny(f, f.o1, sql`update payments set rejected_reason='changed' where id=${f.payA}`, guard('editable_in', 'rejected_reason'));
    await as(f.o1, tx => tx.execute(sql`update payments set state='rejected',rejected_reason='another' where id=${f.payB}`));
    expect(await payment(f.payB)).toMatchObject({ state: 'rejected', rejected_reason: 'another' });
  });
  for (const who of ['ua', 'o1'] as const) {
    it(`P10 payments ${who} DELETE pending and EXECUTE receipt allocator`, async () => {
      const f = await buildPrivateFixture();
      const ctx = f[who];
      await deny(f, ctx, sql`delete from payments where id=${f.payA}`, 'privilege');
      if (who === 'ua') {
        await reference(ctx, f.payA);
      }
      else await verify(ctx, f.payA);
      await deny(f, ctx, sql`select app.next_receipt_no(${f.t1}::uuid)`, 'privilege');
      expect(await as(ctx, tx => q(tx, sql`select id from payments where id=${f.payA}`))).toEqual([{ id: f.payA }]);
    });
  }
  const permissionOps = [['payments', 'insert', 'billing', 'create'], ['payments', 'update', 'billing', 'edit'], ['subscriptions', 'insert', 'billing', 'create'], ['subscriptions', 'update', 'billing', 'edit'], ['subscription_events', 'insert', 'billing', 'edit'], ['client_entitlement_overrides', 'insert', 'billing', 'edit'], ['client_entitlement_overrides', 'update', 'billing', 'edit'], ['packages', 'insert', 'packages', 'create'], ['packages', 'update', 'packages', 'edit'], ['packages', 'delete', 'packages', 'delete']] as const;
  async function permissionStatement(f: Fixture, table: string, operation: string, id: string): Promise<SQL> {
    if (table === 'payments') {
      return operation === 'insert' ? insert(f, id) : sql`update payments set notes='allowed' where id=${f.payA}`;
    }
    if (table === 'subscriptions') {
      return operation === 'insert' ? sql`insert into subscriptions(id,tenant_id,client_id,package_id,package_snapshot,starts_on,ends_on) select ${id}::uuid,tenant_id,client_id,package_id,package_snapshot,starts_on,ends_on from subscriptions where id=${f.subA}` : sql`update subscriptions set notes='allowed' where id=${f.subA}`;
    }
    if (table === 'subscription_events') {
      return sql`insert into subscription_events(id,tenant_id,client_id,subscription_id,kind,days,actor_user_id) values(${id},${f.t1},${f.clientA},${f.subA},'extension',7,${f.ub.userId})`;
    }
    if (table === 'client_entitlement_overrides') {
      if (operation === 'insert') {
        return sql`insert into client_entitlement_overrides(id,tenant_id,client_id,override) values(${id},${f.t1},${f.clientA},'{}'::jsonb)`;
      }
      await svc(tx => tx.execute(sql`insert into client_entitlement_overrides(id,tenant_id,client_id,override) values(${id},${f.t1},${f.clientA},'{}'::jsonb)`));
      return sql`update client_entitlement_overrides set revoked_at='2001-01-01T00:00:00Z' where id=${id}`;
    }
    if (operation === 'insert') {
      return sql`insert into packages(id,tenant_id,name,duration_days,schedule_rules) values(${id},${f.t1},'{"en":"Private"}'::jsonb,30,'{"checkins":[],"workouts":[]}'::jsonb)`;
    }
    const pack = await mkPackage(f.t1);
    return operation === 'update' ? sql`update packages set name='{"en":"Allowed"}'::jsonb where id=${pack}` : sql`delete from packages where id=${pack}`;
  }
  for (const [table, operation, module, action] of permissionOps) {
    for (const expansion of [false, true]) {
      it(`P11 ${table} assistant ${operation} require_perm ${action}/manage ${expansion}`, async () => {
        const f = await buildPrivateFixture();
        let ctx = await staff(f, 'assistant');
        ctx = await grants(ctx, module, ['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export'].filter(granted => granted !== action));
        const id = randomUUID();
        const statement = await permissionStatement(f, table, operation, id);
        await deny(f, ctx, statement, guard('require_perm', undefined, table));
        ctx = await grants(ctx, module, [expansion ? 'manage' : action]);
        const stored = await as(ctx, tx => one<Row>(tx, sql`${statement} returning *`));
        if (operation === 'insert') {
          expect(await serviceRow(table, id)).toMatchObject({ [table === 'subscription_events' ? 'actor_user_id' : 'created_by']: ctx.userId });
        }
        else if (operation === 'update') {
          if (table === 'payments' || table === 'subscriptions') {
            expect(stored.notes).toBe('allowed');
          }
          else if (table === 'packages') {
            expect(stored.name).toEqual({ en: 'Allowed' });
          }
          else expect(stored.revoked_at).not.toBeNull();
        } else expect(await serviceRow(table, String(stored.id))).toBeUndefined();
      });
    }
  }
  for (const target of ['verified', 'rejected', 'refunded'] as const) {
    it(`P12 payments coach UPDATE state ${target === 'refunded' ? 'verified' : 'pending'} -> ${target}`, async () => {
      const f = await buildPrivateFixture();
      let ctx = await staff(f, 'coach');
      if (target === 'refunded') {
        await verify(f.o1, f.payA);
      }
      const statement = sql`update payments set state=${target}${target === 'refunded' ? sql`,refund_amount=100` : sql``} where id=${f.payA}`;
      await deny(f, ctx, statement, guard('perm_transitions', 'state'));
      ctx = await grants(ctx, 'billing', ['edit', 'verify']);
      await as(ctx, tx => tx.execute(statement));
      expect(await payment(f.payA)).toMatchObject({ state: target });
      const manager = await staff(f, 'business_manager');
      const id = await mkPayment(f.t1, f.clientB, f.subB);
      if (target === 'refunded') {
        await verify(manager, id);
      }
      await as(manager, tx => tx.execute(sql`update payments set state=${target}${target === 'refunded' ? sql`,refund_amount=100` : sql``} where id=${id}`));
      expect(await payment(id)).toMatchObject({ state: target });
    });
  }
  for (const column of ['price', 'currency', 'package_snapshot', 'package_id', 'client_id']) {
    it(`P13 subscriptions o1 UPDATE ${column} active immutable snapshot`, async () => {
      const f = await buildPrivateFixture();
      const alt = column === 'price' ? sql`120` : column === 'currency' ? sql`'USD'` : column === 'package_snapshot' ? sql`'{}'::jsonb` : sql`${column === 'client_id' ? f.clientB : await mkPackage(f.t1)}`;
      await deny(f, f.o1, sql`update subscriptions set ${sql.identifier(column)}=${alt} where id=${f.subA}`, guard('immutable', column, 'subscriptions'));
      const before = await serviceRow('subscriptions', f.subA);
      await as(f.o1, tx => tx.execute(sql`update subscriptions set ends_on='2030-01-01' where id=${f.subA}`));
      expect(await serviceRow('subscriptions', f.subA)).toMatchObject({ ends_on: '2030-01-01' });
      const audit = await serviceRowWhere('audit_log', sql`tenant_id=${f.t1} and entity='subscriptions' and entity_id=${f.subA} and action='update'`);
      expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ before: expect.objectContaining({ ends_on: before?.ends_on }), after: expect.objectContaining({ ends_on: '2030-01-01' }) })]));
      const replacement = await mkSubscription(f.t1, f.clientA, f.packageT1);
      expect(replacement).not.toBe(f.subA);
      await deny(f, f.o1, sql`delete from subscriptions where id=${f.subA}`, 'privilege');
      expect(await as(f.o1, tx => q(tx, sql`select id from subscriptions where id=${replacement}`))).toEqual([{ id: replacement }]);
    });
  }
  for (const operation of ['UPDATE', 'DELETE']) {
    it(`P14 subscription_events s2 ${operation} extension ledger append-only`, async () => {
      const f = await buildPrivateFixture();
      const ctx = await staff(f);
      const id = randomUUID();
      const before = await serviceRow('subscriptions', f.subA);
      const statement = await permissionStatement(f, 'subscription_events', 'insert', id);
      await as(ctx, tx => tx.execute(statement));
      expect(await serviceRow('subscription_events', id)).toMatchObject({ kind: 'extension', days: 7, actor_user_id: ctx.userId });
      expect(await serviceRow('subscriptions', f.subA)).toEqual(before);
      await deny(f, ctx, operation === 'UPDATE' ? sql`update subscription_events set days=8 where id=${id}` : sql`delete from subscription_events where id=${id}`, 'privilege');
      const next = randomUUID();
      await as(ctx, tx => tx.execute(sql`insert into subscription_events(id,tenant_id,client_id,subscription_id,kind,days) values(${next},${f.t1},${f.clientA},${f.subA},'extension',8)`));
      expect(await serviceRow('subscription_events', next)).toMatchObject({ days: 8, actor_user_id: ctx.userId });
    });
  }
  for (const variant of ['clear', 'replace', 'json', 'delete'] as const) {
    it(`P15 client_entitlement_overrides s2 UPDATE/DELETE ${variant} revoked`, async () => {
      const f = await buildPrivateFixture();
      const ctx = await staff(f);
      const id = randomUUID();
      await as(ctx, tx => tx.execute(sql`insert into client_entitlement_overrides(id,tenant_id,client_id,override,created_by) values(${id},${f.t1},${f.clientA},'{}'::jsonb,${f.ub.userId})`));
      expect(await serviceRow('client_entitlement_overrides', id)).toMatchObject({ created_by: ctx.userId, revoked_at: null });
      expect(await as(ctx, tx => one(tx, sql`update client_entitlement_overrides set revoked_at='2001-01-01T00:00:00Z' where id=${id} returning revoked_at=now() as clock`))).toEqual({ clock: true });
      const statement = variant === 'delete' ? sql`delete from client_entitlement_overrides where id=${id}` : variant === 'json' ? sql`update client_entitlement_overrides set override='{"x":1}'::jsonb where id=${id}` : sql`update client_entitlement_overrides set revoked_at=${variant === 'clear' ? null : '2000-01-01T00:00:00Z'} where id=${id}`;
      await deny(f, ctx, statement, variant === 'delete' ? 'privilege' : guard(variant === 'json' ? 'update_allow' : 'set_once', variant === 'json' ? 'override' : 'revoked_at', 'client_entitlement_overrides'));
      expect(await as(ctx, tx => q(tx, sql`select id from client_entitlement_overrides where id=${id}`))).toEqual([{ id }]);
    });
  }
  for (const operation of ['insert', 'update', 'delete'] as const) {
    it(`P16 packages s2 ${operation} missing action; ua public unarchived SELECT`, async () => {
      const f = await buildPrivateFixture();
      let ctx = await staff(f);
      const id = randomUUID();
      const statement = await permissionStatement(f, 'packages', operation, id);
      const action = operation === 'insert' ? 'create' : operation === 'update' ? 'edit' : 'delete';
      ctx = await grants(ctx, 'packages', ['view']);
      await deny(f, ctx, statement, guard('require_perm', undefined, 'packages'));
      ctx = await grants(ctx, 'packages', [action]);
      await as(ctx, tx => tx.execute(statement));
      const hidden = await mkPackage(f.t1);
      const archived = await mkPackage(f.t1);
      await svc(tx => tx.execute(sql`update packages set is_public=false where id=${hidden}`));
      await svc(tx => tx.execute(sql`update packages set archived_at=now() where id=${archived}`));
      expect(await as(f.ua, tx => q(tx, sql`select id from packages where id in (${f.packageT1},${hidden},${archived})`))).toEqual([{ id: f.packageT1 }]);
      await deny(f, f.ua, sql`insert into packages(tenant_id,name,duration_days,schedule_rules) values(${f.t1},'{}'::jsonb,30,'{}'::jsonb)`, 'rls');
      await expectNoEffect(f.ua, sql`update packages set is_public=false where id=${f.packageT1}`, 'packages', sql`id=${f.packageT1}`);
      await expectNoEffect(f.ua, sql`delete from packages where id=${f.packageT1}`, 'packages', sql`id=${f.packageT1}`);
      expect(await as(f.ua, tx => q(tx, sql`select id from packages where id=${f.packageT1}`))).toEqual([{ id: f.packageT1 }]);
    });
  }
  it('P20 payments s2 UPDATE state pending -> verified emits consecutive receipts', async () => {
    const f = await buildPrivateFixture();
    const ctx = await staff(f);
    const n = await counter(f);
    const a = await verify(ctx, f.payA);
    const b = await verify(ctx, f.payB);
    expect([a.receipt_no, b.receipt_no]).toEqual([receipt(n+1), receipt(n+2)]);
    expect(await counter(f)).toBe(n+2);
  });
  it('P21 payments s2 UPDATE verification rollback preserves payment/counter/audit', async () => {
    const f = await buildPrivateFixture();
    const ctx = await staff(f);
    const before = await image(f);
    const n = await counter(f);
    const abort = new Error('deliberate verification rollback');
    await expect(as(ctx, async tx => {
      await tx.execute(sql`update payments set state='verified' where id=${f.payA}`);
      throw abort;
    })).rejects.toBe(abort);
    expect(await image(f)).toEqual(before);
    expect((await verify(ctx, f.payB)).receipt_no).toBe(receipt(n+1));
  });
  it('P22 payments s2 UPDATE concurrent verification obtains two unique consecutive receipts', async () => {
    const f = await buildPrivateFixture();
    const ctx = await staff(f);
    const n = await counter(f);
    let ready = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
      release = resolve;
    });
    const commit = (id: string) => as(ctx, async tx => {
      await tx.execute(sql`select pg_backend_pid()`);
      ready++;
      if (ready === 2) {
        release();
      }
      await barrier;
      await tx.execute(sql`update payments set state='verified' where id=${id}`);
      return one<{ receipt_no: string;clock: boolean;verified_by: string }>(tx, sql`select receipt_no,verified_at=now() as clock,verified_by from payments where id=${id}`);
    });
    const rows = await Promise.all([commit(f.payA), commit(f.payB)]);
    expect(rows.map(r => r.receipt_no).sort()).toEqual([receipt(n+1), receipt(n+2)].sort());
    for (const row of rows) {
      expect(row).toMatchObject({ clock: true, verified_by: ctx.userId });
    }
    expect(await counter(f)).toBe(n+2);
  });
  for (const column of ['verified_at', 'verified_by', 'receipt_no']) {
    it(`P23 payments s2 INSERT ${column} verified requires verify and null server input`, async () => {
      const f = await buildPrivateFixture();
      let ctx = await staff(f, 'assistant');
      ctx = await grants(ctx, 'billing', ['create']);
      const id = randomUUID();
      await deny(f, ctx, insert(f, id, { state: sql`'verified'` }), guard('perm_transitions', 'state'));
      ctx = await grants(ctx, 'billing', ['create', 'verify']);
      await deny(f, ctx, insert(f, id, { state: sql`'verified'`, [column]: serverEq[column]! }), guard('insert_eq', column));
      const n = await counter(f);
      expect(await as(ctx, tx => one(tx, sql`${insert(f, id, { state: sql`'verified'` })} returning receipt_no,verified_by,verified_at=now() as clock`))).toEqual({ receipt_no: receipt(n+1), verified_by: ctx.userId, clock: true });
    });
  }
  it('P24 payments service UPDATE receipt_no uniqueness scoped to tenant', async () => {
    const f = await buildPrivateFixture();
    const receiptNo = (await verify(f.o1, f.payA)).receipt_no;
    await deny(f, null, sql`update payments set receipt_no=${receiptNo} where id=${f.payB}`, { code: '23505', constraint: 'payments_tenant_receipt_uq' });
    await svc(tx => tx.execute(sql`update payments set receipt_no='R-distinct' where id=${f.payB}`));
    expect(await payment(f.payB)).toMatchObject({ receipt_no: 'R-distinct' });
    await svc(tx => tx.execute(sql`update payments set receipt_no=${receiptNo} where id=${f.payC}`));
    expect(await payment(f.payC)).toMatchObject({ receipt_no: receiptNo });
  });
  for (const amount of ['101', '-1', 'NaN']) {
    it(`P25 payments o1 UPDATE refund_amount null -> ${amount} verified`, async () => {
      const f = await buildPrivateFixture();
      await verify(f.o1, f.payA);
      await deny(f, f.o1, sql`update payments set refund_amount=${amount}::numeric where id=${f.payA}`, { code: '23514', constraint: 'payments_amount_ck' });
      expect(await as(f.o1, tx => one(tx, sql`update payments set refund_amount=20 where id=${f.payA} returning state,refund_amount::int as refund_amount,refunded_at=now() as clock`))).toEqual({ state: 'verified', refund_amount: 20, clock: true });
    });
  }
  it('P26 tenants o2/o1 UPDATE verification counters are independent', async () => {
    const f = await buildPrivateFixture();
    await svc(tx => tx.execute(sql`update tenants set receipt_counter=20 where id=${f.t1}`));
    expect((await verify(f.o2, f.payC)).receipt_no).toBe('R-000001');
    expect((await verify(f.o1, f.payA)).receipt_no).toBe('R-000021');
    expect(await counter(f)).toBe(21);
    expect(await serviceRow('tenants', f.t2)).toMatchObject({ receipt_counter: 1 });
  });
  for (const column of ['reference', 'amount']) {
    it(`P27 payments ua UPDATE ${column} service-verified row is invisible`, async () => {
      const f = await buildPrivateFixture();
      await deny(f, f.ua, sql`update payments set amount=120 where id=${f.payA}`, guard('client_update', 'amount'));
      await reference(f.ua, f.payA);
      await svc(tx => tx.execute(sql`update payments set state='verified',verified_at=now(),verified_by=${f.o1.userId} where id=${f.payA}`));
      await expectNoEffect(f.ua, sql`update payments set ${sql.identifier(column)}=${column === 'amount' ? sql`120` : sql`'forged'`} where id=${f.payA}`, 'payments', sql`id=${f.payA}`);
      const pending = await mkPayment(f.t1, f.clientA, f.subA);
      await reference(f.ua, pending);
    });
  }
  it('P28 payments o1 INSERT verified duplicate id rolls allocator back to savepoint', async () => {
    const f = await buildPrivateFixture();
    const before = await image(f);
    const n = await counter(f);
    const pk = await primaryKey('payments');
    await as(f.o1, async tx => {
      await tx.execute(sql`savepoint duplicate_payment`);
      const e = await expectCode(tx.execute(insert(f, f.payA, { state: sql`'verified'` })), '23505');
      expect(e.constraint_name).toBe(pk);
      await tx.execute(sql`rollback to savepoint duplicate_payment`);
    });
    expect(await image(f)).toEqual(before);
    expect((await verify(f.o1, f.payB)).receipt_no).toBe(receipt(n+1));
  });
  it('P29 payments service/runtime receipt million boundary and unknown-tenant allocators', async () => {
    const f = await buildPrivateFixture();
    await svc(tx => tx.execute(sql`update tenants set receipt_counter=999998 where id=${f.t1}`));
    const third = await mkPayment(f.t1, f.clientA, f.subA);
    for (const [id, want] of [[f.payA, 'R-999999'], [f.payB, 'R-1000000'], [third, 'R-1000001']] as const) {
      expect((await verify(f.o1, id)).receipt_no).toBe(want);
    }
    for (const fn of ['next_receipt_no', 'next_client_code']) {
      const before = await image(f);
      const e = await expectGuard(svc(tx => tx.execute(sql`select app.${sql.identifier(fn)}(${randomUUID()}::uuid)`)), 'rule:app.'+fn, 'id');
      expect(e.code).toBe('P0001');
      expect(e.table_name).toBe('tenants');
      expect(await image(f)).toEqual(before);
      const column = fn === 'next_receipt_no' ? 'receipt_counter' : 'client_counter';
      const count = Number((await serviceRow('tenants', f.t1))?.[column]);
      await svc(tx => tx.execute(sql`select app.${sql.identifier(fn)}(${f.t1}::uuid)`));
      expect(Number((await serviceRow('tenants', f.t1))?.[column])).toBe(count+1);
    }
  });
  it('P30 API/db source INSERT clients/payments never conflict-upserts or MERGE-inserts', () => {
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        }
        else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          files.push(path);
        }
      }
    };
    walk(fileURLToPath(new URL('../../../apps/web/src/', import.meta.url)));
    walk(fileURLToPath(new URL('../src/', import.meta.url)));
    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(source, path).not.toMatch(/\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?(?:payments|clients)"?(?=\s|\()[^;`]*\bon\s+conflict\b/i);
      expect(source, path).not.toMatch(/\.insert\(\s*(?:\w+\.)?(?:payments|clients)\s*\)[^;]*\.onConflict(?:DoNothing|DoUpdate)\s*\(/s);
      expect(source, path).not.toMatch(/\bmerge\s+into\s+(?:"?public"?\s*\.\s*)?"?(?:payments|clients)"?(?=\s|\()[^;`]*\bthen\s+insert\b/i);
      // Source contract only (§13.6): API behaviour remains W06. Check each writer when it exists.
      const writes=[...source.matchAll(/\binsert\s+into\s+(?:"?public"?\s*\.\s*)?"?(payments|clients)"?(?=\s|\()/gi),...source.matchAll(/\.insert\(\s*(?:\w+\.)?(payments|clients)\s*\)/g)];
      for (const write of writes) {
        const table=write[1];const prefix=source.slice(0,write.index);
        const readFirst=new RegExp('(?:\\bselect\\b[^;`]*\\bfrom\\s+(?:"?public"?\\s*\\.\\s*)?"?'+table+'"?|\\.select\\([^;]*\\.from\\(\\s*(?:\\w+\\.)?'+table+'\\s*\\))','is').test(prefix);
        const catchesDuplicate=/23505/.test(source.slice(write.index));
        const savepoint=/\bsavepoint\b/i.test(prefix)||/\btx\.transaction\s*\(/.test(prefix);
        expect(readFirst||savepoint&&catchesDuplicate,path+': '+table+' INSERT requires SELECT first or a savepoint catching 23505').toBe(true);
      }
    }
  });
  for (const start of [null, 20]) {
    it(`P31 payments coach UPDATE refund_amount ${start} -> 60 verified requires verify`, async () => {
      const f = await buildPrivateFixture();
      let ctx = await staff(f, 'coach');
      await verify(f.o1, f.payA);
      if (start !== null) {
        await as(f.o1, tx => tx.execute(sql`update payments set refund_amount=${start} where id=${f.payA}`));
      }
      const n = await counter(f);
      const old = await payment(f.payA);
      await deny(f, ctx, sql`update payments set refund_amount=60 where id=${f.payA}`, { rule: 'rule:app.payment_refund_permission', column: 'refund_amount', table: 'payments', code: '42501' });
      ctx = await grants(ctx, 'billing', ['edit', 'verify']);
      expect(await as(ctx, tx => one(tx, sql`update payments set refund_amount=60 where id=${f.payA} returning refunded_at=now() as first_stamp`))).toEqual({ first_stamp: start === null });
      expect(await payment(f.payA)).toMatchObject({ state: 'verified', refund_amount: 60, receipt_no: old.receipt_no });
      expect(await counter(f)).toBe(n);
      const editOnly = await grants(ctx, 'billing', ['edit']);
      await as(editOnly, tx => tx.execute(sql`update payments set refund_amount=60,notes='allowed' where id=${f.payA}`));
      expect(await payment(f.payA)).toMatchObject({ notes: 'allowed', refund_amount: 60 });
      for (const actor of [await staff(f, 'business_manager'), f.o1]) {
        const id = await mkPayment(f.t1, f.clientA, f.subA);
        await verify(actor, id);
        await as(actor, tx => tx.execute(sql`update payments set refund_amount=20 where id=${id}`));
        expect(await payment(id)).toMatchObject({ state: 'verified', refund_amount: 20 });
      }
    });
  }
});
