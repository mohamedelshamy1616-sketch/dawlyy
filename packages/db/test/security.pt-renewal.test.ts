import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/client';
import { buildFixture, buildPrivateFixture, truncateAll } from './fixtures';
import { as, expectCode, expectPrivilege, expectRls, q, svc } from './helpers';

beforeAll(async () => { await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

/** A funded package with `opening` sessions of which `used` are already closed. */
async function fixture(opening: number, used = 0) {
  const f = await buildPrivateFixture();
  const scope = sql`${f.t1},${f.clientA},${f.subA}`;
  await as(f.o1, tx => tx.execute(sql`insert into pt_ledger_entries(tenant_id,client_id,subscription_id,kind,delta,reason)
    values(${scope},'credit',${opening},'Desk count')`));
  for (let i = 0; i < used; i++) await as(f.s1, tx => tx.execute(sql`insert into pt_visits
    (tenant_id,client_id,subscription_id,visit_id) values(${scope},${randomUUID()})`));
  const request = (actor = f.ua) => as(actor, tx => tx.execute(sql`insert into pt_renewal_requests
    (tenant_id,client_id,subscription_id) values(${scope})`));
  const rows = (actor = f.o1) => as(actor, tx => q<{ id: string; status: string; delivered: number; balance: number; handled_by: string | null }>(tx,
    sql`select id,status,delivered,balance,handled_by from pt_renewal_requests where subscription_id=${f.subA}`));
  return { f, request, rows };
}

describe('PT renewal requests under pinned memberships', () => {
  it('accepts only the three input columns and one status update, with no delete', async () => {
    const insertable = await svc(tx => q<{ name: string }>(tx, sql`select attname::text as name from pg_attribute
      where attrelid='public.pt_renewal_requests'::regclass and attnum>0 and not attisdropped
      and has_column_privilege('dawlyy_rls',attrelid,attnum,'INSERT')`));
    expect(insertable.map(c => c.name).sort()).toEqual(['client_id', 'subscription_id', 'tenant_id']);
    const updatable = await svc(tx => q<{ name: string }>(tx, sql`select attname::text as name from pg_attribute
      where attrelid='public.pt_renewal_requests'::regclass and attnum>0 and not attisdropped
      and has_column_privilege('dawlyy_rls',attrelid,attnum,'UPDATE')`));
    expect(updatable).toEqual([{ name: 'status' }]);
    expect(await svc(tx => q(tx, sql`select has_table_privilege('dawlyy_rls','public.pt_renewal_requests',
      'DELETE,TRUNCATE,REFERENCES,TRIGGER') as mutable`))).toEqual([{ mutable: false }]);
  });
  it('measures balance and delivered sessions in the database at 2 or fewer', async () => {
    const { request, rows } = await fixture(12, 10);
    await request();
    expect(await rows()).toMatchObject([{ status: 'open', delivered: 10, balance: 2, handled_by: null }]);
  });
  it('refuses a request above 2 sessions or before the package is funded', async () => {
    const above = await fixture(12, 9);
    await expectCode(above.request(), 'P0001');
    const unfunded = await buildPrivateFixture();
    await expectCode(as(unfunded.ua, tx => tx.execute(sql`insert into pt_renewal_requests(tenant_id,client_id,subscription_id)
      values(${unfunded.t1},${unfunded.clientA},${unfunded.subA})`)), 'P0001');
  });
  it('lets only the client insert their own request and hides it from others', async () => {
    const { f, request, rows } = await fixture(3, 1);
    for (const actor of [f.ub, f.s1, f.s2, f.o1, f.o2]) await expectRls(request(actor));
    expect(await rows()).toEqual([]);
    await request();
    expect(await rows(f.s1)).toHaveLength(1);
    expect(await rows(f.ua)).toHaveLength(1);
    for (const actor of [f.s2, f.ub, f.o2]) expect(await rows(actor)).toEqual([]);
  });
  it('allows one open request per package and a new one after it is handled', async () => {
    const { f, request, rows } = await fixture(3, 1);
    await request();
    await expectCode(request(), '23505');
    await as(f.o1, tx => tx.execute(sql`update pt_renewal_requests set status='handled' where subscription_id=${f.subA}`));
    await request();
    expect((await rows()).map(r => r.status).sort()).toEqual(['handled', 'open']);
  });
  it('lets only the owner or assigned coach mark it handled, once, with database stamps', async () => {
    const { f, request, rows } = await fixture(3, 1);
    await request();
    const handle = (actor: typeof f.o1) => as(actor, tx => tx.execute(sql`update pt_renewal_requests set status='handled'
      where subscription_id=${f.subA} and status='open'`));
    for (const actor of [f.ua, f.s2, f.ub, f.o2]) {
      await handle(actor);
      expect(await rows()).toMatchObject([{ status: 'open' }]);
    }
    await handle(f.s1);
    expect(await rows()).toMatchObject([{ status: 'handled', handled_by: f.s1.userId }]);
    await expectCode(as(f.o1, tx => tx.execute(sql`update pt_renewal_requests set status='open' where subscription_id=${f.subA}`)), 'P0001');
    await expectPrivilege(as(f.o1, tx => tx.execute(sql`update pt_renewal_requests set delivered=0 where subscription_id=${f.subA}`)));
    await expectPrivilege(as(f.o1, tx => tx.execute(sql`delete from pt_renewal_requests where subscription_id=${f.subA}`)));
  });
});
