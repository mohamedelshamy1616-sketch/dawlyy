import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture } from './factories';
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
type Library = 'exercises' | 'foods';
const ids = (rows: readonly { id: string }[]) => rows.map(r => r.id).sort();
function insertLibrary(f: Fixture, table: Library, id: string, extra: Record<string, SQL> = {}): SQL {
  const base: Record<string, SQL> = { id: sql`${id}`, tenant_id: sql`${f.t1}`, slug: sql`${'private-'+id}`, name: sql`'{"en":"Private"}'::jsonb`, category: sql`${table === 'exercises' ? 'strength' : 'grains'}`,
    ...(table === 'exercises' ? { movement_pattern: sql`'squat'`, difficulty: sql`'beginner'` } : { per_100: sql`'{"kcal":100,"proteinG":5,"carbsG":15,"fatG":2}'::jsonb` }), ...extra };
  return sql`insert into ${sql.identifier(table)}(${sql.join(Object.keys(base).map(sql.identifier), sql`,`)}) values(${sql.join(Object.values(base), sql`,`)})`;
}
async function image(f: Fixture): Promise<unknown> {
  return svc(tx => Promise.all(['clients', 'client_notes', 'client_flags', 'exercises', 'foods', 'tenant_hidden_items', 'media', 'audit_log', 'events'].map(t => q(tx, sql`select to_jsonb(t) as row from ${sql.identifier(t)} t where tenant_id in (${f.t1},${f.t2}) or tenant_id is null order by to_jsonb(t)::text`))));
}
async function guard(f: Fixture, ctx: AuthContext, statement: SQL, key: string, column: string, table: string): Promise<void> {
  const before = await image(f);
  const e = await expectGuard(as(ctx, tx => tx.execute(statement)), key, column);
  expect(e.table_name).toBe(table);
  expect(await image(f)).toEqual(before);
}
async function native(f: Fixture, ctx: AuthContext | null, statement: SQL, code: string, detail: string, column?: string): Promise<void> {
  const before = await image(f);
  const e = await expectCode(ctx ? as(ctx, tx => tx.execute(statement)) : svc(tx => tx.execute(statement)), code);
  if (detail.startsWith('rule:')) {
    expect(e.detail).toBe(detail);
    expect(e.column_name).toBe(column);
    expect(e.table_name).toBe('exercises');
  } else expect(e.constraint_name).toBe(detail);
  expect(await image(f)).toEqual(before);
}
async function note(f: Fixture, ctx: AuthContext, id: string, client = f.clientA): Promise<void> {
  await as(ctx, tx => tx.execute(sql`insert into client_notes(id,tenant_id,client_id,body,author_user_id) values(${id},${f.t1},${client},'private',${f.ub.userId})`));
}
async function asset(f: Fixture, purpose: string, tenant = f.t1): Promise<string> {
  const id = randomUUID();
  await svc(tx => tx.execute(sql`insert into media(id,tenant_id,owner_user_id,bucket,path,kind,purpose,mime_type) values(${id},${tenant},${f.o1.userId},'tenant-assets',${tenant+'/assets/'+id+'.jpg'},'file',${purpose},'image/jpeg')`));
  return id;
}

describe('client records and shared libraries', () => {
  it('L01 clients s1/s2/ua/uc SELECT id and s1 UPDATE phone assigned/unassigned', async () => {
    const f = await buildPrivateFixture();
    for (const [ctx, want] of [[f.s1, [f.clientA]], [f.s2, [f.clientA, f.clientB]], [f.ua, [f.clientA]], [f.uc, [f.clientC]]] as const) {
      expect(ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select id from clients`)))).toEqual([...want].sort());
    }
    await expectNoEffect(f.s1, sql`update clients set phone='forged' where id=${f.clientB}`, 'clients', sql`id=${f.clientB}`);
    await as(f.s1, tx => tx.execute(sql`update clients set phone='01000000000' where id=${f.clientA}`));
    expect(await serviceRow('clients', f.clientA)).toMatchObject({ phone: '01000000000' });
  });
  it('L02 client_notes s1/ua INSERT author_user_id assigned A/unassigned B', async () => {
    const f = await buildPrivateFixture();
    const id = randomUUID();
    const before = await image(f);
    await expectRls(as(f.s1, tx => tx.execute(sql`insert into client_notes(id,tenant_id,client_id,body,author_user_id) values(${id},${f.t1},${f.clientB},'private',${f.s1.userId})`)));
    expect(await image(f)).toEqual(before);
    await note(f, f.s1, id);
    expect(await serviceRow('client_notes', id)).toMatchObject({ author_user_id: f.s1.userId, client_id: f.clientA });
    const prior = await image(f);
    await expectRls(as(f.ua, tx => tx.execute(sql`insert into client_notes(tenant_id,client_id,body,author_user_id) values(${f.t1},${f.clientA},'private',${f.ua.userId})`)));
    expect(await image(f)).toEqual(prior);
    expect(await as(f.ua, tx => q(tx, sql`select id from client_notes`))).toEqual([]);
    expect(await as(f.ua, tx => q(tx, sql`select id from clients`))).toEqual([{ id: f.clientA }]);
  });
  for (const column of ['author_user_id', 'client_id']) {
    it(`L03 client_notes s2 UPDATE ${column} own and another author`, async () => {
      const f = await buildPrivateFixture();
      await expectNoEffect(f.s2, sql`update client_notes set body='forged' where id=${f.noteA}`, 'client_notes', sql`id=${f.noteA}`);
      await expectNoEffect(f.s2, sql`delete from client_notes where id=${f.noteA}`, 'client_notes', sql`id=${f.noteA}`);
      const id = randomUUID();
      await note(f, f.s2, id);
      await guard(f, f.s2, sql`update client_notes set ${sql.identifier(column)}=${column === 'client_id' ? f.clientB : f.ub.userId} where id=${id}`, 'immutable', column, 'client_notes');
      await as(f.s2, tx => tx.execute(sql`update client_notes set body='edited' where id=${id}`));
      expect(await serviceRow('client_notes', id)).toMatchObject({ body: 'edited' });
      expect(await as(f.s2, tx => q(tx, sql`delete from client_notes where id=${id} returning id`))).toEqual([{ id }]);
      expect(await serviceRow('client_notes', id)).toBeUndefined();
      await as(f.o1, tx => tx.execute(sql`update client_notes set body='owner' where id=${f.noteA}`));
      expect(await serviceRow('client_notes', f.noteA)).toMatchObject({ body: 'owner' });
      await as(f.o1, tx => tx.execute(sql`delete from client_notes where id=${f.noteA}`));
      expect(await serviceRow('client_notes', f.noteA)).toBeUndefined();
    });
  }
  it('L04 client_flags s1 UPDATE resolved_at toggle and immutable attribution; ua denied', async () => {
    const f = await buildPrivateFixture();
    const id = randomUUID();
    await as(f.s1, tx => tx.execute(sql`insert into client_flags(id,tenant_id,client_id,kind) values(${id},${f.t1},${f.clientA},'risk')`));
    const resolve = async () => {
      expect(await as(f.s1, tx => one(tx, sql`update client_flags set resolved_at='2001-01-01T00:00:00Z' where id=${id} returning resolved_at=now() as clock,resolved_by`))).toEqual({ clock: true, resolved_by: f.s1.userId });
    };
    await resolve();
    await guard(f, f.s1, sql`update client_flags set resolved_by=${f.ub.userId} where id=${id}`, 'immutable', 'resolved_by', 'client_flags');
    await as(f.s1, tx => tx.execute(sql`update client_flags set resolved_at=null where id=${id}`));
    expect(await serviceRow('client_flags', id)).toMatchObject({ resolved_at: null, resolved_by: null });
    await resolve();
    await guard(f, f.s1, sql`update client_flags set resolved_at='2000-01-01T00:00:00Z' where id=${id}`, 'on_clear', 'resolved_at', 'client_flags');
    await as(f.s1, tx => tx.execute(sql`update client_flags set resolved_at=null where id=${id}`));
    expect(await serviceRow('client_flags', id)).toMatchObject({ resolved_at: null, resolved_by: null });
    let before = await image(f);
    expect((await expectPrivilege(as(f.s1, tx => tx.execute(sql`delete from client_flags where id=${id}`)))).message).toMatch(/table client_flags/);
    expect(await image(f)).toEqual(before);
    await resolve();
    before = await image(f);
    await expectRls(as(f.ua, tx => tx.execute(sql`insert into client_flags(tenant_id,client_id,kind) values(${f.t1},${f.clientA},'risk')`)));
    expect(await image(f)).toEqual(before);
    expect(await as(f.ua, tx => q(tx, sql`select id from client_flags`))).toEqual([]);
    expect(await as(f.ua, tx => q(tx, sql`select id from clients`))).toEqual([{ id: f.clientA }]);
  });
  it('L05 exercises/foods ua SELECT library and hidden rows; system UPDATE is invisible', async () => {
    const f = await buildPrivateFixture();
    await as(f.s2, tx => tx.execute(sql`update exercises set hidden=true where id=${f.exerciseT1}`));
    expect(ids(await as(f.ua, tx => q<{ id: string }>(tx, sql`select id from exercises`)))).toEqual([f.exerciseSystem, f.exerciseT1].sort());
    expect(ids(await as(f.ua, tx => q<{ id: string }>(tx, sql`select id from foods`)))).toEqual([f.foodSystem]);
    await expectNoEffect(f.ua, sql`update exercises set hidden=false where id=${f.exerciseT1}`, 'exercises', sql`id=${f.exerciseT1}`);
    expect(await as(f.ua, tx => one(tx, sql`select hidden from exercises where id=${f.exerciseT1}`))).toEqual({ hidden: true });
    for (const ctx of [f.o1, f.s1, f.s2, f.ua]) {
      await expectNoEffect(ctx, sql`update exercises set hidden=true where id=${f.exerciseSystem}`, 'exercises', sql`id=${f.exerciseSystem}`);
      expect(await as(ctx, tx => q(tx, sql`select id from exercises where id=${f.exerciseSystem}`))).toEqual([{ id: f.exerciseSystem }]);
    }
  });
  for (const who of ['o1', 's2'] as const) {
    for (const table of ['exercises', 'foods'] as const) {
      it(`L06 ${table} ${who} DELETE tenant item and retire via hidden`, async () => {
        const f = await buildPrivateFixture();
        const id = randomUUID();
        await svc(tx => tx.execute(insertLibrary(f, table, id)));
        const before = await image(f);
        expect((await expectPrivilege(as(f[who], tx => tx.execute(sql`delete from ${sql.identifier(table)} where id=${id}`)))).message).toContain('table '+table);
        expect(await image(f)).toEqual(before);
        await as(f[who], tx => tx.execute(sql`update ${sql.identifier(table)} set hidden=true where id=${id}`));
        expect(await serviceRow(table, id)).toMatchObject({ hidden: true });
        const item = table === 'exercises' ? f.exerciseSystem : f.foodSystem;
        await as(f[who], tx => tx.execute(sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},${table === 'exercises' ? 'exercise' : 'food'},${item})`));
        expect(await serviceRowWhere('tenant_hidden_items', sql`tenant_id=${f.t1} and item_id=${item}`)).toHaveLength(1);
      });
    }
  }
  for (const table of ['exercises', 'foods'] as const) {
    for (const operation of ['INSERT', 'UPDATE'] as const) {
      it(`L07 ${table} s1 ${operation} based_on_id foreign/system/same tenant`, async () => {
        const f = await buildPrivateFixture();
        const id = randomUUID();
        const parent = randomUUID();
        await svc(tx => tx.execute(insertLibrary(f, table, parent)));
        if (operation === 'UPDATE') {
          await svc(tx => tx.execute(insertLibrary(f, table, id)));
        }
        const foreign = table === 'exercises' ? f.exerciseT2 : f.foodT2;
        const statement = operation === 'INSERT' ? insertLibrary(f, table, id, { based_on_id: sql`${foreign}` }) : sql`update ${sql.identifier(table)} set based_on_id=${foreign} where id=${id}`;
        const before = await image(f);
        const e = await expectCode(as(f.s1, tx => tx.execute(statement)), '23503');
        expect(e.detail).toBe('rule:app.library_ref_check');
        expect(e.column_name).toBe('based_on_id');
        expect(e.table_name).toBe(table);
        expect(await image(f)).toEqual(before);
        const system = table === 'exercises' ? f.exerciseSystem : f.foodSystem;
        if (operation === 'INSERT') {
          await as(f.s1, tx => tx.execute(insertLibrary(f, table, id, { based_on_id: sql`${system}` })));
        }
        else await as(f.s1, tx => tx.execute(sql`update ${sql.identifier(table)} set based_on_id=${system} where id=${id}`));
        expect(await serviceRow(table, id)).toMatchObject({ based_on_id: system });
        for (const ref of [parent, parent]) {
          await as(f.s1, tx => tx.execute(sql`update ${sql.identifier(table)} set based_on_id=${ref} where id=${id}`));
          expect(await serviceRow(table, id)).toMatchObject({ based_on_id: ref });
        }
      });
    }
  }
  for (const operation of ['INSERT', 'UPDATE'] as const) {
    for (const who of ['s2', 'service'] as const) {
      for (const bad of ['client', 'foreign', 'purpose'] as const) {
        it(`L08 exercises ${who} ${operation} thumbnail_media_id ${bad}`, async () => {
          const f = await buildPrivateFixture();
          const id = randomUUID();
          if (operation === 'UPDATE') {
            await svc(tx => tx.execute(insertLibrary(f, 'exercises', id)));
          }
          const thumbnail = bad === 'client' ? f.mediaA : await asset(f, bad === 'purpose' ? 'payment_proof' : 'branding', bad === 'foreign' ? f.t2 : f.t1);
          const ctx = who === 's2' ? f.s2 : null;
          await native(f, ctx, operation === 'INSERT' ? insertLibrary(f, 'exercises', id, { thumbnail_media_id: sql`${thumbnail}` }) : sql`update exercises set thumbnail_media_id=${thumbnail} where id=${id}`, '23503', 'rule:app.exercise_thumbnail_check', 'thumbnail_media_id');
          const valid = await asset(f, 'exercise_demo');
          const statement = operation === 'INSERT' ? insertLibrary(f, 'exercises', id, { thumbnail_media_id: sql`${valid}` }) : sql`update exercises set thumbnail_media_id=${valid} where id=${id}`;
          await (ctx ? as(ctx, tx => tx.execute(statement)) : svc(tx => tx.execute(statement)));
          expect(await serviceRow('exercises', id)).toMatchObject({ thumbnail_media_id: valid });
          const branding = await asset(f, 'branding');
          await (ctx ? as(ctx, tx => tx.execute(sql`update exercises set thumbnail_media_id=${branding} where id=${id}`)) : svc(tx => tx.execute(sql`update exercises set thumbnail_media_id=${branding} where id=${id}`)));
          expect(await serviceRow('exercises', id)).toMatchObject({ thumbnail_media_id: branding });
        });
      }
    }
  }
  it('L08 exercises service INSERT system thumbnail forbidden; video_url permitted', async () => {
    const f = await buildPrivateFixture();
    const id = randomUUID();
    const media = await asset(f, 'branding');
    await native(f, null, insertLibrary(f, 'exercises', id, { tenant_id: sql`null`, thumbnail_media_id: sql`${media}` }), '23503', 'rule:app.exercise_thumbnail_check', 'thumbnail_media_id');
    await svc(tx => tx.execute(insertLibrary(f, 'exercises', id, { tenant_id: sql`null`, video_url: sql`'https://example.invalid/video'` })));
    expect(await serviceRow('exercises', id)).toMatchObject({ thumbnail_media_id: null, video_url: 'https://example.invalid/video' });
  });
  it('L09 tenant_hidden_items s1 INSERT key attribution duplicate/kind constraints and ua isolation', async () => {
    const f = await buildPrivateFixture();
    expect(await as(f.s1, tx => one(tx, sql`insert into tenant_hidden_items(tenant_id,kind,item_id,hidden_by) values(${f.t1},'exercise',${f.exerciseSystem},${f.ub.userId}) returning hidden_by,created_at=now() as clock`))).toEqual({ hidden_by: f.s1.userId, clock: true });
    await native(f, f.s1, sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},'exercise',${f.exerciseSystem})`, '23505', 'tenant_hidden_items_pk');
    await as(f.s1, tx => tx.execute(sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},'food',${f.foodSystem})`));
    await native(f, f.s1, sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},'x',${f.exerciseT1})`, '23514', 'tenant_hidden_items_kind_ck');
    await as(f.s1, tx => tx.execute(sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},'exercise',${f.exerciseT1})`));
    const before = await image(f);
    await expectRls(as(f.ua, tx => tx.execute(sql`insert into tenant_hidden_items(tenant_id,kind,item_id) values(${f.t1},'food',${f.foodT2})`)));
    expect(await image(f)).toEqual(before);
    expect(await as(f.ua, tx => q(tx, sql`select kind,item_id from tenant_hidden_items order by kind,item_id`))).toEqual([{ kind: 'exercise', item_id: f.exerciseSystem }, { kind: 'exercise', item_id: f.exerciseT1 }, { kind: 'food', item_id: f.foodSystem }].sort((a, b) => a.kind.localeCompare(b.kind) || a.item_id.localeCompare(b.item_id)));
    const pre = await image(f);
    expect((await expectPrivilege(as(f.s1, tx => tx.execute(sql`update tenant_hidden_items set hidden_by=${f.ub.userId} where tenant_id=${f.t1}`)))).message).toMatch(/table tenant_hidden_items/);
    expect(await image(f)).toEqual(pre);
    expect(await as(f.s1, tx => q(tx, sql`delete from tenant_hidden_items where tenant_id=${f.t1} and kind='exercise' and item_id=${f.exerciseT1} returning item_id`))).toEqual([{ item_id: f.exerciseT1 }]);
    expect(await serviceRowWhere('tenant_hidden_items', sql`tenant_id=${f.t1} and item_id=${f.exerciseT1}`)).toEqual([]);
  });
  for (const table of ['exercises', 'foods'] as const) {
    for (const column of ['created_by', 'id', 'tenant_id', 'created_at']) {
      it(`L10 ${table} s1 UPDATE ${column} runtime attribution`, async () => {
        const f = await buildPrivateFixture();
        const id = randomUUID();
        await as(f.s1, tx => tx.execute(insertLibrary(f, table, id, { created_by: sql`${f.ub.userId}` })));
        expect(await serviceRow(table, id)).toMatchObject({ created_by: f.s1.userId });
        await guard(f, f.s1, sql`update ${sql.identifier(table)} set ${sql.identifier(column)}=${column === 'created_at' ? '2001-01-01T00:00:00Z' : column === 'tenant_id' ? f.t2 : randomUUID()} where id=${id}`, 'immutable', column, table);
        expect(await as(f.s1, tx => one(tx, sql`update ${sql.identifier(table)} set name='{"en":"Edited","ar":"معدل"}'::jsonb where id=${id} returning name,updated_at=now() as clock`))).toEqual({ name: { en: 'Edited', ar: 'معدل' }, clock: true });
      });
    }
  }
});
