import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { as, svc, q, one, expectPrivilege } from './helpers';

// P9 only: policy evidence comes from production runtime transactions, never mocks.
let f: Fixture;
let marker: string;
let corpus: Array<{ id: string; tenantId: string; clientId: string | null }>;
beforeAll(async () => {
  f = await buildFixture(); marker = randomUUID();
  corpus = await svc(async tx => {
    const rows: Array<{ id: string; tenantId: string; clientId: string | null }> = [];
    for (const [tenantId, clientId] of [[f.t1, f.clientA], [f.t1, f.clientB], [f.t1, null], [f.t2, f.clientC]] as const) {
      const row = await one<{ id: string }>(tx, sql`insert into audit_log
        (tenant_id,client_id,actor_user_id,actor_role,action,entity,entity_id,before,after,reason,request_id)
        values (${tenantId}::uuid,${clientId}::uuid,${tenantId === f.t1 ? f.o1.userId : f.o2.userId}::uuid,'owner','update',
          'clients',${clientId},'{"private":"before"}'::jsonb,'{"private":"after"}'::jsonb,'private reason',${marker}) returning id::text`);
      rows.push({ ...row, tenantId, clientId });
    }
    return rows;
  });
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

async function snapshot() {
  return svc(tx => q(tx, sql`select to_jsonb(a) as row from audit_log a where request_id=${marker} order by id`));
}
async function ids(who: 'o1'|'o2'|'s1'|'s2'|'ua'|'ub') {
  return as(f[who], tx => q<{ id: string }>(tx, sql`select id::text from audit_log where request_id=${marker} order by id`))
    .then(rows => rows.map(row => row.id));
}
describe('R3b activity source policies and append-only guards', () => {
  it('ACT01 owners read only their tenant including null-client rows', async () => {
    expect(await ids('o1')).toEqual(corpus.filter(row => row.tenantId === f.t1).map(row => row.id));
    expect(await ids('o2')).toEqual(corpus.filter(row => row.tenantId === f.t2).map(row => row.id));
  });
  it('ACT02 assigned staff read A only and cannot obtain B through an explicit client filter', async () => {
    expect(await ids('s1')).toEqual(corpus.filter(row => row.clientId === f.clientA).map(row => row.id));
    expect(await as(f.s1, tx => q(tx, sql`select id::text from audit_log where request_id=${marker} and client_id=${f.clientB}::uuid`))).toEqual([]);
  });
  it('ACT03 all-client staff still cannot read tenant-template/null-client audit metadata', async () => {
    expect(await ids('s2')).toEqual(corpus.filter(row => row.tenantId === f.t1 && row.clientId !== null).map(row => row.id));
    expect(await as(f.s2, tx => q(tx, sql`select id::text from audit_log where request_id=${marker} and client_id is null`))).toEqual([]);
  });
  for (const who of ['ua','ub'] as const) it(`ACT04 ${who} client reads no audit rows, including their own`, async () => {
    expect(await ids(who)).toEqual([]);
    expect(await as(f[who], tx => q(tx, sql`select id::text from audit_log where tenant_id=${f.t1}::uuid and request_id=${marker}`))).toEqual([]);
  });
  it('ACT05 runtime metadata projection is explicitly safe and retains exact decimal IDs', async () => {
    const rows = await as(f.o1, tx => q(tx, sql`select id::text as id,
      to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt",
      client_id::text as "clientId",actor_user_id::text as "actorUserId",actor_role as "actorRole",action,entity,entity_id as "entityId"
      from audit_log where request_id=${marker} order by created_at desc,id desc`));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['action','actorRole','actorUserId','clientId','createdAt','entity','entityId','id']);
      expect(row.id).toMatch(/^\d+$/); expect(row.createdAt).toMatch(/\.\d{6}Z$/);
      for (const key of ['before','after','reason','request_id']) expect(row).not.toHaveProperty(key);
    }
  });
  for (const who of ['o1','s1','s2','ua','o2'] as const) for (const operation of ['update','delete'] as const) {
    it(`ACT06 ${who} ${operation.toUpperCase()} remains refused with every original audit row unchanged`, async () => {
      const before = await snapshot();
      const statement = operation === 'update'
        ? sql`update audit_log set reason='forged activity edit' where request_id=${marker}`
        : sql`delete from audit_log where request_id=${marker}`;
      const error = await expectPrivilege(() => as(f[who], tx => q(tx, statement)));
      expect(error.message).toContain('audit_log'); expect(await snapshot()).toEqual(before);
    });
  }
  it('ACT07 assigned staff retain archived-client history without any subscription/activity-state lookup', async () => {
    await as(f.o1, tx => q(tx, sql`update clients set archived_at=now() where id=${f.clientA}::uuid and tenant_id=${f.t1}::uuid`));
    expect(await ids('s1')).toEqual(corpus.filter(row => row.clientId === f.clientA).map(row => row.id));
    expect(await as(f.s1, tx => q(tx, sql`select id::text from clients where id=${f.clientA}::uuid`))).toEqual([{ id: f.clientA }]);
  });
});
