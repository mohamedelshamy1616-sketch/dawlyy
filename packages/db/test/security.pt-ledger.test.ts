import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/client';
import { buildFixture, buildPrivateFixture, truncateAll } from './fixtures';
import { as, expectCode, expectPrivilege, expectRls, q, svc } from './helpers';

beforeAll(async () => { await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

async function fixture(count?: number) {
  const f = await buildPrivateFixture();
  const scope = sql`${f.t1},${f.clientA},${f.subA}`;
  const open = (amount: number) => as(f.o1, tx => tx.execute(sql`insert into pt_ledger_entries
    (tenant_id,client_id,subscription_id,kind,delta,reason) values(${scope},'credit',${amount},'Desk count')`));
  const close = (visit: string) => as(f.s1, tx => tx.execute(sql`insert into pt_visits
    (tenant_id,client_id,subscription_id,visit_id) values(${scope},${visit}) on conflict (tenant_id,visit_id) do nothing`));
  const entries = () => as(f.ua, tx => q(tx, sql`select kind,delta,visit_id from pt_ledger_entries
    where subscription_id=${f.subA} order by position`));
  if (count !== undefined) await open(count);
  return { f, scope, close, open, entries };
}

describe('PT ledger under pinned memberships', () => {
  it('allows only the input columns and keeps timestamps, attribution and ordering database-owned', async () => {
    const scope = ['tenant_id', 'client_id', 'subscription_id', 'visit_id'];
    const writable = { pt_visits: scope, pt_ledger_entries: [...scope, 'kind', 'delta', 'reason'],
      pt_receipt_actions: [...scope, 'kind', 'note'] };
    for (const [table, columns] of Object.entries(writable)) {
      const actual = await svc(tx => q<{ name: string }>(tx, sql`select attname::text as name from pg_attribute
        where attrelid=${'public.' + table}::regclass and attnum>0 and not attisdropped
        and has_column_privilege('dawlyy_rls',attrelid,attnum,'INSERT')`));
      expect(actual.map(c => c.name).sort()).toEqual([...columns].sort());
      expect(await svc(tx => q(tx, sql`select has_table_privilege('dawlyy_rls',${'public.' + table},
        'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as mutable`))).toEqual([{ mutable: false }]);
    }
  });
  it('charges one simultaneous close and preserves it on offline replay after another visit', async () => {
    const { close, entries } = await fixture(2);
    const a = randomUUID(), b = randomUUID();
    await Promise.all([close(a), close(a)]);
    await close(b); await close(a);
    expect(await entries()).toEqual([{ kind: 'credit', delta: 2, visit_id: null },
      { kind: 'debit', delta: -1, visit_id: a }, { kind: 'debit', delta: -1, visit_id: b }]);
  });
  it('requires an opening, rejects duplicate funding, and rolls back the losing last-credit visit', async () => {
    const { f, open, close, entries } = await fixture();
    await expectCode(close(randomUUID()), 'P0001');
    await open(1); await expectCode(open(10), 'P0001');
    const results = await Promise.allSettled([close(randomUUID()), close(randomUUID())]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expectCode(close(randomUUID()), 'P0001');
    expect(await entries()).toHaveLength(2);
    expect(await as(f.o1, tx => q(tx, sql`select visit_id from pt_visits where subscription_id=${f.subA}`))).toHaveLength(1);
  });
  it('hides receipts and entries from unassigned staff and another client and rejects their writes', async () => {
    const { f, close, scope } = await fixture(1); const id = randomUUID(); await close(id);
    for (const actor of [f.s2, f.ub, f.o2]) {
      expect(await as(actor, tx => q(tx, sql`select id from pt_ledger_entries where subscription_id=${f.subA}`))).toEqual([]);
      expect(await as(actor, tx => q(tx, sql`select visit_id from pt_visits where visit_id=${id}`))).toEqual([]);
    }
    await expectRls(as(f.s2, tx => tx.execute(sql`insert into pt_visits(tenant_id,client_id,subscription_id,visit_id) values(${scope},${randomUUID()})`)));
    await expectRls(as(f.ub, tx => tx.execute(sql`insert into pt_receipt_actions(tenant_id,client_id,subscription_id,visit_id,kind) values(${scope},${id},'confirm')`)));
  });
  it('keeps the disputed debit and records one owner-approved reversal', async () => {
    const { f, scope, close, entries } = await fixture(1); const id = randomUUID(); await close(id);
    const correction = sql`insert into pt_ledger_entries(tenant_id,client_id,subscription_id,visit_id,kind,delta,reason)
      values(${scope},${id},'correction',1,'Desk verified')`;
    await expectCode(as(f.o1, tx => tx.execute(correction)), 'P0001');
    for (const kind of ['view','dispute']) await as(f.ua, tx => tx.execute(sql`insert into pt_receipt_actions
      (tenant_id,client_id,subscription_id,visit_id,kind) values(${scope},${id},${kind})`));
    await expectRls(as(f.s1, tx => tx.execute(correction)));
    await as(f.o1, tx => tx.execute(correction));
    await expectCode(as(f.o1, tx => tx.execute(correction)), '23505');
    expect((await entries()).map(e => e.delta)).toEqual([1,-1,1]);
    expect(await as(f.o1, tx => q(tx, sql`select approved_by,reason from pt_ledger_entries where visit_id=${id} and kind='correction'`)))
      .toEqual([{ approved_by: f.o1.userId, reason: 'Desk verified' }]);
    await expectPrivilege(as(f.o1, tx => tx.execute(sql`delete from pt_ledger_entries where visit_id=${id}`)));
    await expectPrivilege(as(f.o1, tx => tx.execute(sql`update pt_ledger_entries set delta=0 where visit_id=${id}`)));
  });
});
