import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture } from './factories';
import { as, svc, q, one, expectCode, expectPrivilege } from './helpers';
import { TABLE_GRANTS, keyColumns, type MatrixTable } from './matrix';

let fx: Fixture;
beforeAll(async () => {
  if(!process.env.DATABASE_URL||!process.env.DATABASE_URL_SERVICE)throw new Error('Suite Z requires DATABASE_URL and DATABASE_URL_SERVICE; security tests never skip.');
  fx = await buildFixture();
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

async function protectedState(): Promise<unknown> {
  return svc(async (tx) => ({
    clients: await q(tx, sql`select * from clients order by id`),
    tenants: await q(tx, sql`select * from tenants order by id`),
    triggers: await q(tx, sql`select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace order by 1,2`),
    acl: await q(tx, sql`select c.relname,c.relowner::regrole::text,c.relacl::text from pg_class c where c.relnamespace in ('public'::regnamespace,'app'::regnamespace) order by 1`),
    functions: await q(tx, sql`select p.oid::regprocedure::text,p.proowner::regrole::text,p.proacl::text from pg_proc p where p.pronamespace in ('public'::regnamespace,'app'::regnamespace) order by 1`),
  }));
}
async function control(f: Fixture = fx): Promise<void> {
  expect(await as(f.o1, (tx) => q(tx, sql`select id from clients order by id`))).toEqual([f.clientA, f.clientB].sort().map((id) => ({ id })));
  expect(await as(f.o1, (tx) => one(tx, sql`select current_user::text as role,current_setting('session_replication_role') as replication`))).toEqual({ role: 'dawlyy_rls', replication: 'origin' });
}
async function deniedPrivilege(statement: SQL, prefix?: SQL): Promise<void> {
  const before = await protectedState();
  const error = await expectPrivilege(() => as(fx.o1, async (tx) => {
    if (prefix) await tx.execute(prefix);
    await tx.execute(statement);
    // Even an accidentally successful DDL statement is rolled back, then fails the SQLSTATE assertion.
    throw new Error('escape unexpectedly succeeded');
  }));
  expect(error.code).toBe('42501');
  expect(await protectedState()).toEqual(before);
  await control();
}

describe('runtime connection escape resistance', () => {
  it('Z01 clients/tenants o1 RESET ROLE SELECT/UPDATE baseline login privileges', async () => {
    const before = await protectedState();
    await expectPrivilege(() => as(fx.o1, async (tx) => {
      await tx.execute(sql`reset role`);
      expect(await one(tx, sql`select current_user::text as role,session_user::text as login`)).toEqual({ role: 'dawlyy_app', login: 'dawlyy_app' });
      await tx.execute(sql`select * from clients`);
    }));
    expect(await protectedState()).toEqual(before);
    await control();
    await deniedPrivilege(sql`update tenants set name='escape' where id=${fx.t1}`, sql`reset role`);
  });
  it('Z02 all tables/functions o1 SET LOCAL ROLE authenticated/reachable roles effective denial', async () => {
    const roles = await svc((tx) => q<{ name: string }>(tx, sql`select rolname as name from pg_roles where rolname='authenticated' or (rolname not in ('dawlyy_rls','dawlyy_app') and (pg_has_role('dawlyy_app',oid,'MEMBER') or pg_has_role('dawlyy_rls',oid,'MEMBER'))) order by 1`));
    expect(roles.map((r) => r.name)).toContain('authenticated');
    const functions = await svc((tx) => q<{ schema: string; name: string; types: string[] }>(tx, sql`select n.nspname as schema,p.proname as name,array(select format_type(a,null) from unnest(p.proargtypes::oid[]) a) as types from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') order by 1,2,p.oid::regprocedure::text`));
    for (const role of roles) {
      const prefix = sql`set local role ${sql.identifier(role.name)}`;
      const before = await protectedState();
      let refusal: unknown;
      try {
        expect(await as(fx.o1, async (tx) => { await tx.execute(prefix); return one(tx, sql`select current_user::text as role`); })).toEqual({ role: role.name });
      } catch (error) { refusal = error; }
      if (refusal !== undefined) {
        const error = await expectCode(Promise.reject(refusal), '42501');
        expect(error.message).toMatch(/permission denied to set role/i);
      } else {
        for (const table of [...Object.keys(TABLE_GRANTS).map((name) => ['public', name] as const), ['app', 'audit_actions'] as const, ['app', 'event_types'] as const]) {
          const target = sql`${sql.identifier(table[0])}.${sql.identifier(table[1])}`;
          await deniedPrivilege(sql`select * from ${target}`, prefix);
          await deniedPrivilege(sql`insert into ${target} default values`, prefix);
          await deniedPrivilege(sql`delete from ${target} where false`, prefix);
          const column=table[0]==='app'?(table[1]==='audit_actions'?'action':'type'):keyColumns(table[1]as MatrixTable)[0]!;
          // `= default` is the only assignment PostgreSQL accepts on a GENERATED ALWAYS identity key (events/audit_log ids raise 428C9 otherwise).
          await deniedPrivilege(sql`update ${target} set ${sql.identifier(column)}=default where false`,prefix);
        }
        for (const fn of functions) {
          // Types determine only a callable probe, never expected privilege. Every probed EXECUTE must be denied.
          for (const type of fn.types) if (!/^[a-z_ ]+(?:\[\])?$/i.test(type)) throw new Error(`unhandled argument type ${type}`);
          await deniedPrivilege(sql`select ${sql.identifier(fn.schema)}.${sql.identifier(fn.name)}(${sql.join(fn.types.map((type) => sql`null::${sql.raw(type)}`), sql`, `)})`, prefix);
        }
      }
      expect(await protectedState()).toEqual(before);
      await control();
    }
  });
  it('Z03 runtime o1 SET LOCAL ROLE postgres baseline membership refusal', async () => {
    const before = await protectedState();
    const error = await expectCode(() => as(fx.o1, (tx) => tx.execute(sql`set local role postgres`)), '42501');
    expect(error.message).toMatch(/permission denied to set role\s+"?postgres/i);
    expect(await protectedState()).toEqual(before);
    await control();
  });
  it('Z04 runtime o1 SET LOCAL session_replication_role replica enabled triggers', async () => {
    const before=await protectedState();
    // PG17 says "permission denied to set parameter"; helpers.expectPrivilege only accepts "for parameter".
    const error=await expectCode(()=>as(fx.o1,(tx)=>tx.execute(sql`set local session_replication_role=replica`)),'42501');
    expect(error.message).toMatch(/^permission denied to set parameter "?session_replication_role"?$/i);
    expect(error.detail??'').not.toMatch(/(?:guard|rule):/);expect(await protectedState()).toEqual(before);await control();
    const f = await buildPrivateFixture();
    expect(await as(f.o1, (tx) => q(tx, sql`update clients set phone='01000000004' where id=${f.clientA} returning id,phone`))).toEqual([{ id: f.clientA, phone: '01000000004' }]);
  });
  it('Z05 clients o1 ALTER TABLE DISABLE TRIGGER ALL ownership refusal', async () => {
    const f = await buildPrivateFixture();
    const before = await protectedState();
    const error = await expectCode(() => as(f.o1, (tx) => tx.execute(sql`alter table clients disable trigger all`)), '42501');
    expect(error.message).toMatch(/^must be owner of table clients$/i);
    expect(await protectedState()).toEqual(before);
    expect(await as(f.o1, (tx) => q(tx, sql`update clients set phone='01000000005' where id=${f.clientA} returning id,phone`))).toEqual([{ id: f.clientA, phone: '01000000005' }]);
    await control();
  });
  it('Z06 public/app o1 CREATE TABLE/FUNCTION schema denial no debris', async () => {
    const name = `dawlyy_probe_z06_${randomUUID().replace(/-/g, '')}`;
    await deniedPrivilege(sql`create table public.${sql.identifier(name)} (id uuid)`);
    expect(await svc((tx) => one(tx, sql`select to_regclass(${'public.' + name})::text as object`))).toEqual({ object: null });
    await deniedPrivilege(sql`create function app.${sql.identifier(name)}() returns integer language sql as 'select 1'`);
    expect(await svc((tx) => one(tx, sql`select to_regprocedure(${'app.' + name + '()'})::text as object`))).toEqual({ object: null });
  });
  it('Z07 runtime login outside helpers SELECT clients/app.uid privilege denied then pinned client succeeds', async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Z07 requires runtime DATABASE_URL; security tests never skip');
    const client = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
    const before = await protectedState();
    try {
      const identity = await client`select current_user::text as role,session_user::text as login`;
      expect(identity).toHaveLength(1); expect(identity[0]).toEqual({ role: 'dawlyy_app', login: 'dawlyy_app' });
      const tableRefusal=await expectPrivilege(() => client`select * from clients`);expect(tableRefusal.message).toMatch(/^permission denied for table clients\b/i);
      expect(await protectedState()).toEqual(before);
      expect(await as(fx.ua, (tx) => q(tx, sql`select current_user::text as role,app.uid() as uid,id from clients`))).toEqual([{ role: 'dawlyy_rls', uid: fx.ua.userId, id: fx.clientA }]);
      const functionRefusal=await expectPrivilege(() => client`select app.uid()`);expect(functionRefusal.message).toMatch(/^permission denied for function uid\b/i);
      expect(await protectedState()).toEqual(before);
      expect(await as(fx.ua, (tx) => q(tx, sql`select current_user::text as role,app.uid() as uid,id from clients`))).toEqual([{ role: 'dawlyy_rls', uid: fx.ua.userId, id: fx.clientA }]);
    } finally { await client.end({ timeout: 5 }); }
  });
});
