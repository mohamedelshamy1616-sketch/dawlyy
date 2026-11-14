import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { ClientModules, DEFAULT_CLIENT_MODULES, EntitlementOverride, resolveClientModules } from '@dawlyy/core/types';
import { closeDb, type AuthContext } from '../src/client';
import { buildPrivateFixture, truncateAll, type Fixture, mkMembership } from './fixtures';
import { as, svc, q, one, serviceRow, expectCode, expectGuard, expectPrivilege, expectRls, expectNoEffect } from './helpers';
import { GUARDS } from './guard-matrix';

// reinvent R0a: use real runtime transactions and independently read service snapshots.
let f: Fixture;
let editor: AuthContext;
let reviewer: AuthContext;
const hash = 'a'.repeat(64);
const archives = [
  ['clients', 'clients'], ['programs', 'programs'], ['nutrition_plans', 'nutrition'],
  ['forms', 'forms'], ['packages', 'packages'], ['exercises', 'exercises'],
] as const;
const entries = ['meal_logs', 'metric_entries', 'measurement_sets', 'workout_sessions'] as const;
type Entry = typeof entries[number];
type Archive = typeof archives[number][0];

beforeAll(async () => {
  f = await buildPrivateFixture();
  editor = await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: {
    clients: ['edit'], programs: ['edit'], nutrition: ['edit'], forms: ['edit'],
    packages: ['edit'], exercises: ['edit'], tracking: ['edit'],
  } } });
  reviewer = await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: { checkins: ['review'] } } });
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

async function refusal(work: PromiseLike<unknown>, code: string, detail: string, table?: string, column?: string) {
  const error = await expectCode(work, code);
  expect(error.detail).toBe(detail);
  if (table !== undefined) expect(error.table_name).toBe(table);
  if (column !== undefined) expect(error.column_name).toBe(column);
}
function insert(table: string, values: Record<string, SQL>): SQL {
  const row = { id: sql`${randomUUID()}::uuid`, ...values };
  return sql`insert into ${sql.identifier(table)} (${sql.join(Object.keys(row).map(sql.identifier), sql`, `)})
    values (${sql.join(Object.values(row), sql`, `)}) returning id`;
}
function entryInsert(table: Entry, id: string, actor = f.ua, extra: Record<string, SQL> = {}): SQL {
  const defaults: Record<Entry, Record<string, SQL>> = {
    meal_logs: {}, measurement_sets: { values: sql`'[]'::jsonb` },
    workout_sessions: { timezone: sql`'Africa/Cairo'` },
    metric_entries: { metric: sql`'weight'`, value: sql`80`, unit: sql`'kg'`,
      source: sql`'manual'`, recorded_at: sql`now()`, timezone: sql`'Africa/Cairo'` },
  };
  return insert(table, { id: sql`${id}::uuid`, tenant_id: sql`${actor.tenantId}::uuid`,
    client_id: sql`${actor.clientId}::uuid`, local_date: sql`current_date`,
    client_uuid: sql`${randomUUID()}::uuid`, ...defaults[table], ...extra });
}
async function entry(table: Entry, actor = f.ua, extra: Record<string, SQL> = {}) {
  const id = randomUUID();
  await svc(tx => q(tx, entryInsert(table, id, actor, extra)), actor.tenantId);
  return id;
}
async function voidEntry(actor: AuthContext, table: string, id: string, reason = 'mistake') {
  return as(actor, tx => q(tx, sql`select app.void_entry(${table}, ${id}::uuid, ${reason})`));
}
async function archiveRow(table: Archive, actor = f.ua) {
  if (table === 'clients') return actor.clientId!;
  const id = randomUUID();
  const values: Record<string, SQL> = { id: sql`${id}::uuid`, tenant_id: sql`${actor.tenantId}::uuid` };
  if (table === 'exercises') Object.assign(values, { slug: sql`${id}`, name: sql`'{"en":"Archive"}'::jsonb`,
    category: sql`'strength'`, movement_pattern: sql`'squat'`, difficulty: sql`'beginner'` });
  else if (table === 'packages') Object.assign(values, { name: sql`'{"en":"Archive"}'::jsonb`,
    duration_days: sql`30`, schedule_rules: sql`'{"checkins":[],"workouts":[]}'::jsonb` });
  else Object.assign(values, { name: sql`'{"en":"Archive"}'::jsonb`, kind: sql`'client'`, client_id: sql`${actor.clientId}::uuid`,
    ...(table === 'forms' ? { form_kind: sql`'checkin'` } : {}) });
  await svc(tx => q(tx, insert(table, values)), actor.tenantId);
  return id;
}
async function audit(table: string, id: string, column: string, beforeNull: boolean, afterNull: boolean, actor: AuthContext) {
  const rows = await svc(tx => q(tx, sql`select actor_user_id, actor_role from audit_log
    where tenant_id = ${actor.tenantId} and entity = ${table} and entity_id = ${id} and action = 'update'
      and ("before" -> ${column} = 'null'::jsonb) = ${beforeNull}
      and ("after" -> ${column} = 'null'::jsonb) = ${afterNull}`), actor.tenantId);
  expect(rows).toContainEqual({ actor_user_id: actor.userId, actor_role: actor.role });
}
async function draft(actor = f.ua, extra: Record<string, SQL> = {}) {
  const id = randomUUID();
  await svc(tx => q(tx, insert('ai_drafts', { id: sql`${id}::uuid`, tenant_id: sql`${actor.tenantId}::uuid`,
    client_id: sql`${actor.clientId}::uuid`, kind: sql`'week_review'`, input_hash: sql`${hash}`,
    input_version: sql`'v1'`, body: sql`'{"reply":"draft"}'::jsonb`, ...extra })), actor.tenantId);
  return id;
}
function approve(actor: AuthContext, id: string, currentHash = hash) {
  return as(actor, tx => one<{ status: string }>(tx,
    sql`select app.approve_ai_draft(${id}::uuid, ${currentHash}) as status`));
}
async function message(actor = f.ua) {
  const id = randomUUID();
  await as(actor, tx => q(tx, sql`insert into messages
    (id, tenant_id, conversation_id, sender_user_id, sender_role, body, client_uuid)
    values (${id}, ${actor.tenantId}, ${actor.clientId === f.clientA ? f.convA : actor.clientId === f.clientB ? f.convB : f.convC},
      ${actor.userId}, 'client', 'pain', ${randomUUID()})`));
  return id;
}
function raise(actor: AuthContext, source: string, id: string, category = 'pain_injury', matched = 'pain') {
  return as(actor, tx => one<{ id: string }>(tx,
    sql`select app.raise_red_flag(${source}, ${id}::uuid, ${category}, ${matched}) as id`));
}

describe('reinvent R0a archive and calendar controls', () => {
  for (const [table] of archives) it(`${table}: tenant A cannot read, update or archive tenant B`, async () => {
    const id = await archiveRow(table, f.uc);
    expect(await as(f.o1, tx => q(tx, sql`select id from ${sql.identifier(table)} where id = ${id}`))).toEqual([]);
    await expectNoEffect(f.o1, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`, table, sql`id = ${id}`);
    await expectNoEffect(f.o1, sql`update ${sql.identifier(table)} set archived_by = ${f.o1.userId} where id = ${id}`, table, sql`id = ${id}`);
  });
  for (const [table] of archives) it(`${table}: owner archives and restores with attribution and both audit snapshots`, async () => {
    const id = await archiveRow(table);
    const original = await serviceRow(table, id);
    await as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`));
    expect(await serviceRow(table, id)).toMatchObject({ archived_at: expect.any(Date), archived_by: f.o1.userId });
    if (table === 'clients') expect((await serviceRow(table, id))?.status).toBe(original?.status);
    await audit(table, id, 'archived_at', true, false, f.o1);
    await as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = null where id = ${id}`));
    expect(await serviceRow(table, id)).toMatchObject({ archived_at: null, archived_by: null });
    await audit(table, id, 'archived_at', false, true, f.o1);
  });
  it('clients: existing status plus archive service writes still work in both directions', async () => {
    await as(f.o1, tx => q(tx, sql`update clients set status = 'archived', archived_at = now() where id = ${f.clientA}`));
    expect(await serviceRow('clients', f.clientA)).toMatchObject({ status: 'archived', archived_by: f.o1.userId });
    await as(f.o1, tx => q(tx, sql`update clients set status = 'inactive', archived_at = null where id = ${f.clientA}`));
    expect(await serviceRow('clients', f.clientA)).toMatchObject({ status: 'inactive', archived_by: null });
  });
  it('a client cannot archive their own client row', async () => {
    await expectGuard(as(f.ua, tx => q(tx, sql`update clients set archived_at = now() where id = ${f.clientA}`)), 'client_update', 'archived_at');
  });
  for (const table of ['clients', 'programs', 'nutrition_plans', 'forms'] as const) it(`${table}: edit permission does not grant access to an unassigned client`, async () => {
    const id = await archiveRow(table, f.ub);
    await expectNoEffect(editor, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`, table, sql`id = ${id}`);
  });
  for (const [table] of archives) it(`${table}: client has no archive path`, async () => {
    const id = await archiveRow(table);
    if (table === 'clients') await expectGuard(as(f.ua, tx => q(tx, sql`update clients set archived_at = now() where id = ${id}`)), 'client_update', 'archived_at');
    else await expectNoEffect(f.ua, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`, table, sql`id = ${id}`);
  });
  for (const [table] of archives) it(`${table}: staff need module edit for archive and restore`, async () => {
    const id = await archiveRow(table);
    const denied = () => as(f.s1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`));
    if (table === 'packages') await expectGuard(denied(), 'require_perm');
    else await refusal(denied(), '42501', 'guard:archive', table, 'archived_at');
    await as(editor, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`));
    expect(await serviceRow(table, id)).toMatchObject({ archived_by: editor.userId, archived_at: expect.any(Date) });
    if (table === 'packages') await expectGuard(as(f.s1, tx => q(tx, sql`update packages set archived_at = null where id = ${id}`)), 'require_perm');
    else await refusal(as(f.s1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = null where id = ${id}`)), '42501', 'guard:archive', table, 'archived_at');
    await as(editor, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = null where id = ${id}`));
    expect(await serviceRow(table, id)).toMatchObject({ archived_at: null, archived_by: null });
  });
  for (const [table] of archives) it(`${table}: archived_by cannot be forged and timestamps cannot be replaced`, async () => {
    const id = await archiveRow(table);
    await refusal(as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_by = ${f.ua.userId} where id = ${id}`)), '42501', 'guard:archive', table, 'archived_by');
    await refusal(as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now(), archived_by = ${f.o1.userId} where id = ${id}`)), '42501', 'guard:archive', table, 'archived_by');
    await as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now() where id = ${id}`));
    await refusal(as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = now() + interval '1 day' where id = ${id}`)), 'P0001', 'guard:archive', table, 'archived_at');
    await as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set archived_at = null where id = ${id}`));
  });
  for (const [table] of archives) for (const column of ['archived_at', 'archived_by'] as const) it(`${table}: ${column} starts null on runtime INSERT`, async () => {
    const id = randomUUID();
    const values: Record<string, SQL> = { id: sql`${id}::uuid`, tenant_id: sql`${f.t1}::uuid`,
      [column]: column === 'archived_at' ? sql`now()` : sql`${f.o1.userId}::uuid` };
    if (table === 'clients') values.first_name = sql`'Archived insert'`;
    else if (table === 'exercises') Object.assign(values, { slug: sql`${id}`, name: sql`'{}'::jsonb`, category: sql`'strength'`, movement_pattern: sql`'squat'`, difficulty: sql`'beginner'` });
    else if (table === 'packages') Object.assign(values, { name: sql`'{}'::jsonb`, duration_days: sql`30`, schedule_rules: sql`'{"checkins":[],"workouts":[]}'::jsonb` });
    else Object.assign(values, { name: sql`'{}'::jsonb`, kind: sql`'template'`, ...(table === 'forms' ? { form_kind: sql`'checkin'` } : {}) });
    await refusal(as(f.o1, tx => q(tx, insert(table, values))), '42501', 'guard:archive', table, column);
    expect(await serviceRow(table, id)).toBeUndefined();
  });
  it('system exercise archive is inaccessible and tenant hide remains available', async () => {
    await expectNoEffect(f.o1, sql`update exercises set archived_at = now() where id = ${f.exerciseSystem}`, 'exercises', sql`id = ${f.exerciseSystem}`);
    await as(f.o1, tx => q(tx, sql`insert into tenant_hidden_items (tenant_id, kind, item_id) values (${f.t1}, 'exercise', ${f.exerciseSystem})`));
    expect(await serviceRow('exercises', f.exerciseSystem)).toMatchObject({ tenant_id: null, archived_at: null, archived_by: null });
  });
  it('ordinary exercise edits do not create archive audit rows', async () => {
    const id = await archiveRow('exercises');
    await as(f.o1, tx => q(tx, sql`update exercises set name = '{"en":"Edited exercise"}'::jsonb where id = ${id}`));
    expect(await svc(tx => q(tx, sql`select id from audit_log where tenant_id = ${f.t1} and entity = 'exercises' and entity_id = ${id}`))).toEqual([]);
  });
  it('calendar cancellation stamps cancelled_by, clears it on another state, and audits', async () => {
    await as(f.o1, tx => q(tx, sql`update calendar_events set state = 'cancelled' where id = ${f.eventA}`));
    expect(await serviceRow('calendar_events', f.eventA)).toMatchObject({ cancelled_by: f.o1.userId, cancelled_at: expect.any(Date) });
    await audit('calendar_events', f.eventA, 'cancelled_by', true, false, f.o1);
    await expectGuard(as(f.o1, tx => q(tx, sql`update calendar_events set cancelled_by = ${f.ua.userId} where id = ${f.eventA}`)), 'immutable', 'cancelled_by');
    await as(f.o1, tx => q(tx, sql`update calendar_events set state = 'due' where id = ${f.eventA}`));
    expect(await serviceRow('calendar_events', f.eventA)).toMatchObject({ cancelled_by: null, cancelled_at: null });
  });
  it('calendar cancelled_by cannot be supplied on INSERT', async () => {
    await expectGuard(as(f.o1, tx => q(tx, sql`insert into calendar_events
      (tenant_id, client_id, type, source, due_at, local_date, timezone, cancelled_by)
      values (${f.t1}, ${f.clientA}, 'checkin', 'manual', now(), current_date, 'Africa/Cairo', ${f.o1.userId})`)), 'insert_eq', 'cancelled_by');
  });
});

describe('reinvent R0a voids and history-preserving corrections', () => {
  it('void_entry rejects unsupported table names', async () => {
    await refusal(voidEntry(f.o1, 'clients', randomUUID()), '22023', 'rule:app.void_entry');
  });
  for (const table of entries) {
    it(`${table}: tenant A cannot void tenant B`, async () => {
      const id = await entry(table, f.uc), before = await serviceRow(table, id);
      await refusal(voidEntry(f.o1, table, id), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, id)).toEqual(before);
    });
    it(`${table}: owning client voids within seven days, preserves history and writes an audit row`, async () => {
      const id = await entry(table), before = await serviceRow(table, id);
      await voidEntry(f.ua, table, id, 'x'.repeat(600));
      const after = await serviceRow(table, id);
      expect(after).toMatchObject({ ...before, voided_at: expect.any(Date), voided_by: f.ua.userId, void_reason: 'x'.repeat(500) });
      expect(await as(f.ua, tx => q(tx, sql`select id from ${sql.identifier(table)} where id = ${id}`))).toEqual([{ id }]);
      await audit(table, id, 'voided_at', true, false, f.ua);
      await refusal(voidEntry(f.ua, table, id), 'P0001', 'rule:app.void_entry');
    });
    it(`${table}: client cannot void another client in the same tenant`, async () => {
      const id = await entry(table, f.ub), before = await serviceRow(table, id);
      await refusal(voidEntry(f.ua, table, id), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, id)).toEqual(before);
    });
    it(`${table}: client cannot void a row older than seven days`, async () => {
      const id = await entry(table);
      await svc(tx => q(tx, sql`update ${sql.identifier(table)} set created_at = now() - interval '8 days' where id = ${id}`), f.t1);
      const before = await serviceRow(table, id);
      await refusal(voidEntry(f.ua, table, id), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, id)).toEqual(before);
    });
    it(`${table}: a future service timestamp does not extend the client correction window`, async () => {
      const id = await entry(table, f.ua, { created_at: sql`now() + interval '1 day'` });
      await refusal(voidEntry(f.ua, table, id), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, id)).toMatchObject({ voided_at: null });
    });
    it(`${table}: staff need the correct edit permission and accessible client`, async () => {
      const id = await entry(table), inaccessible = await entry(table, f.ub);
      await refusal(voidEntry(f.s1, table, id), '42501', 'rule:app.void_entry');
      const wrongModule = await mkMembership(f.s1, { permissions: { client_scope: 'assigned', modules: table === 'meal_logs' ? { tracking: ['edit'] } : { nutrition: ['edit'] } } });
      await refusal(voidEntry(wrongModule, table, id), '42501', 'rule:app.void_entry');
      await refusal(voidEntry(editor, table, inaccessible), '42501', 'rule:app.void_entry');
      await svc(tx => q(tx, sql`update ${sql.identifier(table)} set created_at = now() - interval '8 days' where id = ${id}`), f.t1);
      await voidEntry(editor, table, id);
      expect(await serviceRow(table, id)).toMatchObject({ voided_by: editor.userId });
      await audit(table, id, 'voided_at', true, false, editor);
    });
    it(`${table}: owner passes void permission checks`, async () => {
      const id = await entry(table, f.ub);
      await voidEntry(f.o1, table, id);
      expect(await serviceRow(table, id)).toMatchObject({ voided_by: f.o1.userId });
    });
    it(`${table}: voided rows refuse runtime updates, no-op updates, and deletes`, async () => {
      const id = await entry(table);
      await voidEntry(f.ua, table, id);
      const before = await serviceRow(table, id);
      for (const actor of [f.ua, editor, f.o1]) {
        for (const assignment of [sql`voided_at = null`, sql`${sql.identifier(table === 'workout_sessions' ? 'client_note' : 'note')} = 'changed'`, sql`id = id`]) {
          const work = as(actor, tx => q(tx, sql`update ${sql.identifier(table)} set ${assignment} where id = ${id}`));
          if (table === 'metric_entries') await expectPrivilege(work);
          else await refusal(work, 'P0001', 'guard:void', table, 'voided_at');
        }
        await expectPrivilege(as(actor, tx => q(tx, sql`delete from ${sql.identifier(table)} where id = ${id}`)));
      }
      expect(await serviceRow(table, id)).toEqual(before);
    });
    for (const column of ['voided_at', 'voided_by', 'void_reason'] as const) {
      const value = column === 'voided_at' ? sql`now()` : column === 'voided_by' ? sql`${randomUUID()}::uuid` : sql`'forged'`;
      it(`${table}: ${column} cannot be supplied on runtime INSERT`, async () => {
        for (const actor of [f.ua, f.o1]) await refusal(as(actor, tx => q(tx, entryInsert(table, randomUUID(), f.ua, { [column]: value }))), '42501', 'guard:void', table, column);
      });
      it(`${table}: ${column} cannot be changed on runtime UPDATE`, async () => {
        const id = await entry(table);
        for (const actor of [f.ua, f.o1]) {
          const work = as(actor, tx => q(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where id = ${id}`));
          if (table === 'metric_entries') await expectPrivilege(work);
          else await refusal(work, '42501', 'guard:void', table, column);
        }
      });
    }
    it(`${table}: void_reason length CHECK applies to trusted writes too`, async () => {
      const id = await entry(table);
      const error = await expectCode(svc(tx => q(tx, sql`update ${sql.identifier(table)} set void_reason = ${'x'.repeat(501)} where id = ${id}`)), '23514');
      expect(error.constraint_name).toBe(`${table}_void_reason_ck`);
    });
  }
  for (const table of ['meal_logs', 'measurement_sets'] as const) {
    it(`${table}: client correction atomically voids its original and audits`, async () => {
      const old = await entry(table), replacement = randomUUID();
      await as(f.ua, tx => q(tx, entryInsert(table, replacement, f.ua, { replaces_id: sql`${old}::uuid` })));
      expect(await serviceRow(table, old)).toMatchObject({ void_reason: 'corrected', voided_by: f.ua.userId, voided_at: expect.any(Date) });
      expect(await serviceRow(table, replacement)).toMatchObject({ replaces_id: old, voided_at: null });
      await audit(table, old, 'voided_at', true, false, f.ua);
    });
    it(`${table}: staff correction requires edit permission and client scope`, async () => {
      const old = await entry(table), outside = await entry(table, f.ub);
      const denied = randomUUID();
      await refusal(as(f.s1, tx => q(tx, entryInsert(table, denied, f.ua, { replaces_id: sql`${old}::uuid` }))), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, denied)).toBeUndefined();
      const outId = randomUUID();
      await expectRls(as(editor, tx => q(tx, entryInsert(table, outId, f.ub, { replaces_id: sql`${outside}::uuid` }))));
      expect(await serviceRow(table, outId)).toBeUndefined();
      const id = randomUUID();
      await as(editor, tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` })));
      expect(await serviceRow(table, old)).toMatchObject({ void_reason: 'corrected', voided_by: editor.userId });
    });
    it(`${table}: a second correction fails without leaving a new row`, async () => {
      const old = await entry(table);
      await as(f.ua, tx => q(tx, entryInsert(table, randomUUID(), f.ua, { replaces_id: sql`${old}::uuid` })));
      const id = randomUUID(), before = await serviceRow(table, old);
      // The partial unique index rejects the second replacement before AFTER INSERT runs.
      const error = await expectCode(as(f.ua, tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` }))), '23505');
      expect(error.constraint_name).toBe(`${table}_replaces_uq`);
      expect(await serviceRow(table, id)).toBeUndefined();
      expect(await serviceRow(table, old)).toEqual(before);
    });
    it(`${table}: a cross-client replacement fails its composite foreign key`, async () => {
      const old = await entry(table, f.ub), before = await serviceRow(table, old), id = randomUUID();
      const error = await expectCode(as(f.o1, tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` }))), '23503');
      expect(error.constraint_name).toBe(`${table}_replaces_fk`);
      expect(await serviceRow(table, id)).toBeUndefined();
      expect(await serviceRow(table, old)).toEqual(before);
    });
    it(`${table}: old client correction rolls back the inserted row`, async () => {
      const old = await entry(table);
      await svc(tx => q(tx, sql`update ${sql.identifier(table)} set created_at = now() - interval '8 days' where id = ${old}`));
      const id = randomUUID(), before = await serviceRow(table, old);
      await refusal(as(f.ua, tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` }))), '42501', 'rule:app.void_entry');
      expect(await serviceRow(table, id)).toBeUndefined();
      expect(await serviceRow(table, old)).toEqual(before);
    });
    it(`${table}: service correction voids an old original with nullable actor`, async () => {
      const old = await entry(table), id = randomUUID();
      await svc(tx => q(tx, sql`update ${sql.identifier(table)} set created_at = now() - interval '8 days' where id = ${old}`));
      await svc(tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` })), f.t1);
      expect(await serviceRow(table, old)).toMatchObject({ voided_at: expect.any(Date), voided_by: null, void_reason: 'corrected' });
      expect(await serviceRow(table, id)).toMatchObject({ replaces_id: old });
    });
    it(`${table}: correction of an already voided original is refused for runtime and service`, async () => {
      const old = await entry(table);
      await voidEntry(f.ua, table, old);
      for (const trusted of [false, true]) {
        const id = randomUUID(), statement = entryInsert(table, id, f.ua, { replaces_id: sql`${old}::uuid` });
        await refusal(trusted ? svc(tx => q(tx, statement), f.t1) : as(f.ua, tx => q(tx, statement)), 'P0001', trusted ? 'rule:app.apply_correction' : 'rule:app.void_entry');
        expect(await serviceRow(table, id)).toBeUndefined();
      }
    });
    it(`${table}: replaces_id is immutable after INSERT`, async () => {
      const id = await entry(table), old = await entry(table);
      await refusal(as(f.o1, tx => q(tx, sql`update ${sql.identifier(table)} set replaces_id = ${old} where id = ${id}`)), '42501', 'guard:void', table, 'replaces_id');
    });
    it(`${table}: a correction cannot replace itself`, async () => {
      const id = randomUUID();
      await refusal(as(f.ua, tx => q(tx, entryInsert(table, id, f.ua, { replaces_id: sql`${id}::uuid` }))), 'P0001', 'rule:app.apply_correction');
      expect(await serviceRow(table, id)).toBeUndefined();
    });
  }
  it('metric correction_of keeps its append-only multi-actor behaviour', async () => {
    const old = await entry('metric_entries'), before = await serviceRow('metric_entries', old);
    for (const actor of [f.ua, editor, f.o1]) {
      const id = randomUUID();
      await as(actor, tx => q(tx, entryInsert('metric_entries', id, f.ua, { correction_of: sql`${old}::uuid` })));
      expect(await serviceRow('metric_entries', id)).toMatchObject({ correction_of: old, voided_at: null });
    }
    expect(await serviceRow('metric_entries', old)).toEqual(before);
  });
  it('voiding a workout leaves all attached set logs unchanged', async () => {
    const id = await entry('workout_sessions'), set = randomUUID();
    await as(f.ua, tx => q(tx, sql`insert into set_logs
      (id, tenant_id, client_id, session_id, exercise_id, set_no, reps, client_uuid, client_updated_at)
      values (${set}, ${f.t1}, ${f.clientA}, ${id}, ${f.exerciseSystem}, 1, 10, ${randomUUID()}, now())`));
    const before = await serviceRow('set_logs', set);
    await voidEntry(f.ua, 'workout_sessions', id);
    expect(await serviceRow('set_logs', set)).toEqual(before);
  });
});

describe('reinvent R0a private review drafts', () => {
  it('clients cannot read or insert ai_drafts', async () => {
    const id = await draft();
    expect(await as(f.ua, tx => q(tx, sql`select id from ai_drafts where id = ${id}`))).toEqual([]);
    await expectRls(as(f.ua, tx => q(tx, sql`insert into ai_drafts (tenant_id, client_id, kind, input_hash, input_version, body)
      values (${f.t1}, ${f.clientA}, 'week_review', ${hash}, 'v1', '{}'::jsonb)`)));
  });
  it('tenant A cannot read, edit or approve tenant B drafts', async () => {
    const id = await draft(f.uc), before = await serviceRow('ai_drafts', id);
    expect(await as(f.o1, tx => q(tx, sql`select id from ai_drafts where id = ${id}`))).toEqual([]);
    await expectNoEffect(f.o1, sql`update ai_drafts set body = '{}'::jsonb where id = ${id}`, 'ai_drafts', sql`id = ${id}`);
    await refusal(approve(f.o1, id), '42501', 'rule:app.approve_ai_draft');
    expect(await serviceRow('ai_drafts', id)).toEqual(before);
  });
  it('assigned staff cannot see, edit or approve an unassigned client draft', async () => {
    const id = await draft(f.ub);
    expect(await as(reviewer, tx => q(tx, sql`select id from ai_drafts where id = ${id}`))).toEqual([]);
    await expectNoEffect(reviewer, sql`update ai_drafts set body = '{}'::jsonb where id = ${id}`, 'ai_drafts', sql`id = ${id}`);
    await refusal(approve(reviewer, id), '42501', 'rule:app.approve_ai_draft');
  });
  it('runtime draft INSERT cannot target a foreign tenant or an unassigned client', async () => {
    for (const [actor, tenant, client] of [[f.o1, f.t2, f.clientC], [reviewer, f.t1, f.clientB]] as const) {
      const id = randomUUID();
      await expectRls(as(actor, tx => q(tx, sql`insert into ai_drafts (id, tenant_id, client_id, kind, input_hash, input_version, body)
        values (${id}, ${tenant}, ${client}, 'week_review', ${hash}, 'v1', '{}'::jsonb)`)));
      expect(await serviceRow('ai_drafts', id)).toBeUndefined();
    }
  });
  it('staff can create and edit a scoped draft with stamped created_by', async () => {
    const id = randomUUID();
    await as(reviewer, tx => q(tx, sql`insert into ai_drafts
      (id, tenant_id, client_id, kind, input_hash, input_version, body, created_by)
      values (${id}, ${f.t1}, ${f.clientA}, 'week_review', ${hash}, 'v1', '{}'::jsonb, ${f.ua.userId})`));
    await as(reviewer, tx => q(tx, sql`update ai_drafts set body = '{"reply":"edited"}'::jsonb where id = ${id}`));
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ created_by: reviewer.userId, body: { reply: 'edited' } });
    expect(await svc(tx => q(tx, sql`select actor_user_id, actor_role from audit_log where tenant_id = ${f.t1}
      and entity = 'ai_drafts' and entity_id = ${id} and action = 'insert'`))).toEqual([{ actor_user_id: reviewer.userId, actor_role: 'staff' }]);
  });
  for (const actorName of ['owner', 'reviewer'] as const) it(`${actorName}: matching hash approves, attributes and audits`, async () => {
    const id = await draft(), actor = actorName === 'owner' ? f.o1 : reviewer;
    expect(await approve(actor, id)).toEqual({ status: 'approved' });
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'approved', approved_by: actor.userId, approved_at: expect.any(Date), updated_at: expect.any(Date) });
    await audit('ai_drafts', id, 'approved_at', true, false, actor);
  });
  it('a changed input hash commits stale without approval', async () => {
    const id = await draft();
    expect(await approve(reviewer, id, 'b'.repeat(64))).toEqual({ status: 'stale' });
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'stale', approved_by: null, approved_at: null });
    expect(await svc(tx => q(tx, sql`select id from audit_log where tenant_id = ${f.t1} and entity = 'ai_drafts'
      and entity_id = ${id} and "before" ->> 'status' = 'draft' and "after" ->> 'status' = 'stale'`))).toHaveLength(1);
  });
  for (const status of ['approved', 'stale'] as const) for (const actorName of ['owner', 'reviewer'] as const) it(`${actorName}: direct status = ${status} is refused`, async () => {
    const id = await draft();
    await expectGuard(as(actorName === 'owner' ? f.o1 : reviewer, tx => q(tx, sql`update ai_drafts set status = ${status} where id = ${id}`)), 'transitions', 'status');
  });
  for (const status of ['stale', 'rejected', 'approved'] as const) it(`${status}: draft cannot be approved again or have its body edited`, async () => {
    const id = await draft();
    if (status === 'rejected') await as(reviewer, tx => q(tx, sql`update ai_drafts set status = 'rejected' where id = ${id}`));
    else await approve(reviewer, id, status === 'stale' ? 'b'.repeat(64) : hash);
    const before = await serviceRow('ai_drafts', id);
    await refusal(approve(reviewer, id), 'P0001', 'rule:app.approve_ai_draft');
    for (const actor of [f.o1, reviewer]) await expectGuard(as(actor, tx => q(tx, sql`update ai_drafts set body = '{"reply":"changed"}'::jsonb where id = ${id}`)), 'editable_in', 'body');
    expect(await serviceRow('ai_drafts', id)).toEqual(before);
  });
  for (const [column, value] of [['input_hash', sql`${'b'.repeat(64)}`], ['approved_by', sql`${randomUUID()}::uuid`], ['approved_at', sql`now()`]] as const) it(`ai_drafts: ${column} cannot be overwritten directly`, async () => {
    const id = await draft();
    for (const actor of [f.o1, reviewer]) await expectGuard(as(actor, tx => q(tx, sql`update ai_drafts set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'immutable', column);
  });
  for (const column of ['id', 'tenant_id', 'client_id', 'kind', 'input_version', 'provider', 'created_by', 'created_at'] as const) it(`ai_drafts: ${column} is immutable for runtime owner and staff`, async () => {
    const id = await draft();
    const values: Record<typeof column, SQL> = { id: sql`${randomUUID()}::uuid`, tenant_id: sql`${f.t2}::uuid`,
      client_id: sql`${f.clientB}::uuid`, kind: sql`'other'`, input_version: sql`'v2'`, provider: sql`'anthropic'`,
      created_by: sql`${f.ua.userId}::uuid`, created_at: sql`'2001-01-01T00:00:00Z'::timestamptz` };
    for (const actor of [f.o1, reviewer]) await expectGuard(as(actor, tx => q(tx, sql`update ai_drafts set ${sql.identifier(column)} = ${values[column]} where id = ${id}`)), 'immutable', column);
  });
  for (const [column, value] of [['status', sql`'approved'`], ['approved_by', sql`${randomUUID()}::uuid`], ['approved_at', sql`now()`]] as const) it(`ai_drafts: INSERT cannot pre-set ${column}`, async () => {
    await expectGuard(as(f.o1, tx => q(tx, insert('ai_drafts', { tenant_id: sql`${f.t1}::uuid`, client_id: sql`${f.clientA}::uuid`,
      kind: sql`'week_review'`, input_hash: sql`${hash}`, input_version: sql`'v1'`, body: sql`'{}'::jsonb`, [column]: value }))), 'insert_eq', column);
  });
  it('staff without checkins review cannot approve', async () => {
    const id = await draft();
    await refusal(approve(f.s1, id), '42501', 'rule:app.approve_ai_draft');
    await refusal(approve(editor, id), '42501', 'rule:app.approve_ai_draft');
  });
  it('neither runtime owner nor staff can delete a draft', async () => {
    const id = await draft();
    for (const actor of [f.o1, reviewer]) await expectPrivilege(as(actor, tx => q(tx, sql`delete from ai_drafts where id = ${id}`)));
  });
});

describe('reinvent R0a red flags', () => {
  it('client own message raises once and returns the same id on repeat; clients cannot read flags', async () => {
    const source = await message(), first = await raise(f.ua, 'message', source);
    expect(await raise(f.ua, 'message', source)).toEqual(first);
    expect(await serviceRow('red_flags', first.id)).toMatchObject({ tenant_id: f.t1, client_id: f.clientA, source_id: source, status: 'open' });
    expect(await as(f.ua, tx => q(tx, sql`select id from red_flags where id = ${first.id}`))).toEqual([]);
    expect(await svc(tx => q(tx, sql`select id from audit_log where tenant_id = ${f.t1} and entity = 'red_flags' and entity_id = ${first.id} and action = 'insert'`))).toHaveLength(1);
  });
  it('client cannot raise a flag on another client message or a missing source', async () => {
    const source = await message(f.ub);
    await refusal(raise(f.ua, 'message', source), '42501', 'rule:app.raise_red_flag');
    await refusal(raise(f.ua, 'message', randomUUID()), '42501', 'rule:app.raise_red_flag');
  });
  it('client cannot raise a flag on a staff-authored message in their conversation', async () => {
    const source = randomUUID();
    await as(f.o1, tx => q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, body, client_uuid)
      values (${source}, ${f.t1}, ${f.convA}, ${f.o1.userId}, 'owner', 'coach message', ${randomUUID()})`));
    await refusal(raise(f.ua, 'message', source), '42501', 'rule:app.raise_red_flag');
  });
  it('staff may flag an accessible client message but cannot flag an internal conversation', async () => {
    expect((await raise(f.s1, 'message', await message())).id).toEqual(expect.any(String));
    const id = randomUUID();
    await as(f.o1, tx => q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, body, client_uuid)
      values (${id}, ${f.t1}, ${f.convInternal}, ${f.o1.userId}, 'owner', 'internal pain', ${randomUUID()})`));
    await refusal(raise(f.o1, 'message', id), '42501', 'rule:app.raise_red_flag');
  });
  for (const source of ['meal_note', 'checkin'] as const) it(`${source}: own client and accessible staff may raise; other clients and out-of-scope staff cannot`, async () => {
    let id: string;
    if (source === 'meal_note') id = await entry('meal_logs');
    else {
      id = randomUUID();
      await as(f.ua, tx => q(tx, sql`insert into form_submissions
        (id, tenant_id, client_id, form_id, form_version_id, form_kind, state, answers, client_uuid)
        values (${id}, ${f.t1}, ${f.clientA}, ${f.templateForm}, ${f.templateFormPub}, 'checkin', 'due', '{}'::jsonb, ${randomUUID()})`));
    }
    expect((await raise(f.ua, source, id)).id).toEqual(expect.any(String));
    expect((await raise(f.s1, source, id, 'other')).id).toEqual(expect.any(String));
    await refusal(raise(f.ub, source, id), '42501', 'rule:app.raise_red_flag');
    const outside = await mkMembership(f.s1, { assignedClientIds: [f.clientB] });
    await refusal(raise(outside, source, id), '42501', 'rule:app.raise_red_flag');
  });
  it('tenant A cannot raise from tenant B source, select or update tenant B flags', async () => {
    const source = await message(f.uc), flag = await raise(f.uc, 'message', source);
    await refusal(raise(f.o1, 'message', source), '42501', 'rule:app.raise_red_flag');
    expect(await as(f.o1, tx => q(tx, sql`select id from red_flags where id = ${flag.id}`))).toEqual([]);
    await expectNoEffect(f.o1, sql`update red_flags set status = 'handled' where id = ${flag.id}`, 'red_flags', sql`id = ${flag.id}`);
  });
  it('assigned staff can handle a scoped flag with stamped attribution and audit', async () => {
    const flag = await raise(f.ua, 'message', await message());
    await as(f.s1, tx => q(tx, sql`update red_flags set status = 'handled' where id = ${flag.id}`));
    expect(await serviceRow('red_flags', flag.id)).toMatchObject({ status: 'handled', handled_by: f.s1.userId, handled_at: expect.any(Date) });
    await audit('red_flags', flag.id, 'handled_at', true, false, f.s1);
    await expectGuard(as(f.o1, tx => q(tx, sql`update red_flags set status = 'open' where id = ${flag.id}`)), 'transitions', 'status');
  });
  it('out-of-scope staff cannot see or handle flags', async () => {
    const flag = await raise(f.ub, 'message', await message(f.ub));
    expect(await as(f.s1, tx => q(tx, sql`select id from red_flags where id = ${flag.id}`))).toEqual([]);
    await expectNoEffect(f.s1, sql`update red_flags set status = 'handled' where id = ${flag.id}`, 'red_flags', sql`id = ${flag.id}`);
  });
  it('runtime actors cannot insert or delete flags, or forge handled attribution', async () => {
    const source = await message(), flag = await raise(f.ua, 'message', source);
    for (const actor of [f.o1, f.s1, f.ua]) {
      await expectPrivilege(as(actor, tx => q(tx, sql`insert into red_flags (tenant_id, client_id, source, source_id, category, matched)
        values (${f.t1}, ${f.clientA}, 'message', ${source}, 'other', 'other')`)));
      await expectPrivilege(as(actor, tx => q(tx, sql`delete from red_flags where id = ${flag.id}`)));
    }
    for (const [column, value] of [['handled_by', sql`${f.ua.userId}::uuid`], ['handled_at', sql`now()`], ['matched', sql`'changed'`]] as const)
      await expectGuard(as(f.o1, tx => q(tx, sql`update red_flags set ${sql.identifier(column)} = ${value} where id = ${flag.id}`)), 'immutable', column);
  });
  for (const column of ['id', 'tenant_id', 'client_id', 'source', 'source_id', 'category', 'matched', 'created_at', 'handled_by', 'handled_at'] as const) it(`red_flags: ${column} is immutable for runtime owner and staff`, async () => {
    const flag = await raise(f.ua, 'message', await message());
    const values: Record<typeof column, SQL> = { id: sql`${randomUUID()}::uuid`, tenant_id: sql`${f.t2}::uuid`,
      client_id: sql`${f.clientB}::uuid`, source: sql`'meal_note'`, source_id: sql`${randomUUID()}::uuid`, category: sql`'other'`,
      matched: sql`'changed'`, created_at: sql`'2001-01-01T00:00:00Z'::timestamptz`, handled_by: sql`${f.o1.userId}::uuid`, handled_at: sql`now()` };
    for (const actor of [f.o1, f.s1]) await expectGuard(as(actor, tx => q(tx, sql`update red_flags set ${sql.identifier(column)} = ${values[column]} where id = ${flag.id}`)), 'immutable', column);
  });
  for (const [source, category] of [['invalid', 'other'], ['message', 'invalid']] as const) it(`red flag validates source ${source} and category ${category}`, async () => {
    await refusal(raise(f.ua, source, randomUUID(), category), '22023', 'rule:app.raise_red_flag');
  });
});

describe('reinvent R0a database object contracts', () => {
  it('new tables have enabled RLS, the exact staff-only policies, and exact runtime grants', async () => {
    expect(await svc(tx => q(tx, sql`select relname, relrowsecurity, relforcerowsecurity from pg_class
      where oid in ('public.ai_drafts'::regclass, 'public.red_flags'::regclass) order by relname`))).toEqual([
      { relname: 'ai_drafts', relrowsecurity: true, relforcerowsecurity: false },
      { relname: 'red_flags', relrowsecurity: true, relforcerowsecurity: false },
    ]);
    const policies = await svc(tx => q<{ policyname: string; roles: string[] }>(tx, sql`select policyname, roles from pg_policies
      where schemaname = 'public' and tablename in ('ai_drafts','red_flags') order by policyname`));
    expect(policies.map(p => p.policyname)).toEqual([
      'ai_drafts_staff_insert', 'ai_drafts_staff_select', 'ai_drafts_staff_update', 'ai_drafts_tenant_guard',
      'red_flags_staff_select', 'red_flags_staff_update', 'red_flags_tenant_guard',
    ]);
    for (const policy of policies) expect(policy.roles).toEqual(['dawlyy_rls']);
    for (const [table, expected] of [['ai_drafts', [true, true, true, false]], ['red_flags', [true, false, true, false]]] as const) {
      const actual = await svc(tx => q<{ allowed: boolean }>(tx, sql`select has_table_privilege('dawlyy_rls', ${'public.' + table}, p) as allowed
        from unnest(array['SELECT','INSERT','UPDATE','DELETE']) with ordinality as x(p,n) order by n`));
      expect(actual.map(row => row.allowed)).toEqual(expected);
    }
  });
  it('new functions have the required trust mode, empty search_path, and no PUBLIC or trigger execute grant', async () => {
    const definers = ['void_entry', 'approve_ai_draft', 'raise_red_flag'];
    const names = ['guard_archive', 'guard_void', 'apply_correction', ...definers].sort();
    const functions = await svc(tx => q<{ name: string; definer: boolean; config: string[]; runtime: boolean; public_execute: boolean }>(tx, sql`
      select p.proname as name, p.prosecdef as definer, p.proconfig as config,
        has_function_privilege('dawlyy_rls', p.oid, 'EXECUTE') as runtime,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_execute
      from pg_proc p where p.pronamespace = 'app'::regnamespace and p.proname in (${sql.join(names.map(name => sql`${name}`), sql`,`)}) order by p.proname`));
    expect(functions.map(fn => fn.name)).toEqual(names);
    for (const fn of functions) {
      expect(fn.definer).toBe(definers.includes(fn.name));
      expect(fn.runtime).toBe(definers.includes(fn.name));
      expect(fn.public_execute).toBe(false);
      expect(fn.config).toContain('search_path=""');
    }
  });
  for (const table of ['ai_drafts', 'red_flags', 'calendar_events'] as const) it(`${table}: exact additive guard config is installed`, async () => {
    const guard = await svc(tx => one<{ args: string }>(tx, sql`select encode(tgargs, 'hex') as args from pg_trigger
      where tgrelid = ${'public.' + table}::regclass and tgname = ${table + '_50_guard'}`));
    const config: unknown = JSON.parse(Buffer.from(guard.args, 'hex').toString('utf8').replace(/\0$/, ''));
    expect(config).toEqual(GUARDS[table]);
  });
  for (const [table, module] of archives) it(`${table}: archive trigger follows the existing guard`, async () => {
    const trigger = await svc(tx => one(tx, sql`select t.tgtype::int as type, p.proname as fn,
      encode(t.tgargs, 'hex') as args from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = ${'public.' + table}::regclass and t.tgname = ${table + '_55_archive'}`));
    expect(trigger).toEqual({ type: 23, fn: 'guard_archive', args: Buffer.from(module + '\0').toString('hex') });
  });
  for (const table of entries) it(`${table}: void guard and audit cover the required operations`, async () => {
    const triggers = await svc(tx => q(tx, sql`select t.tgname as name, t.tgtype::int as type, p.proname as fn
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = ${'public.' + table}::regclass
      and t.tgname in (${table + '_45_void'}, ${table + '_void_audit'}) order by t.tgname`));
    expect(triggers).toEqual([
      { name: table + '_45_void', type: 31, fn: 'guard_void' },
      { name: table + '_void_audit', type: 17, fn: 'audit_row' },
    ]);
  });
  for (const [column, value, constraint] of [
    ['kind', sql`'other'`, 'kind'], ['input_hash', sql`'bad'`, 'input_hash'],
    ['input_version', sql`''`, 'input_version'], ['input_version', sql`${'x'.repeat(201)}`, 'input_version'],
    ['body', sql`'[]'::jsonb`, 'body'], ['provider', sql`'other'`, 'provider'], ['status', sql`'other'`, 'status'],
  ] as const) it(`ai_drafts: ${column} CHECK ${constraint} applies to trusted inserts`, async () => {
    const error = await expectCode(draft(f.ua, { [column]: value }), '23514');
    expect(error.constraint_name).toBe(`ai_drafts_${constraint}_ck`);
  });
  for (const [column, value, constraint] of [
    ['source', sql`'invalid'`, 'source'], ['category', sql`'invalid'`, 'category'],
    ['matched', sql`''`, 'matched'], ['matched', sql`${'x'.repeat(201)}`, 'matched'], ['status', sql`'invalid'`, 'status'],
  ] as const) it(`red_flags: ${column} CHECK ${constraint} applies to trusted inserts`, async () => {
    const error = await expectCode(svc(tx => q(tx, insert('red_flags', { tenant_id: sql`${f.t1}::uuid`, client_id: sql`${f.clientA}::uuid`,
      source: sql`'message'`, source_id: sql`${randomUUID()}::uuid`, category: sql`'other'`, matched: sql`'pain'`, [column]: value }))), '23514');
    expect(error.constraint_name).toBe(`red_flags_${constraint}_ck`);
  });
  for (const table of ['ai_drafts', 'red_flags'] as const) it(`${table}: a client foreign key cannot cross tenants even for the service`, async () => {
    const values: Record<string, SQL> = table === 'ai_drafts'
      ? { kind: sql`'week_review'`, input_hash: sql`${hash}`, input_version: sql`'v1'`, body: sql`'{}'::jsonb` }
      : { source: sql`'message'`, source_id: sql`${randomUUID()}::uuid`, category: sql`'other'`, matched: sql`'pain'` };
    const error = await expectCode(svc(tx => q(tx, insert(table, { tenant_id: sql`${f.t1}::uuid`, client_id: sql`${f.clientC}::uuid`, ...values }))), '23503');
    expect(error.constraint_name).toBe(`${table}_client_fk`);
  });
  it('inactive membership pins cannot call any new definer API', async () => {
    const id = await draft(), source = await message(), meal = await entry('meal_logs');
    for (const actor of [f.sx, f.ubT2]) {
      await refusal(voidEntry(actor, 'meal_logs', meal), '42501', 'rule:app.void_entry');
      await refusal(approve(actor, id), '42501', 'rule:app.approve_ai_draft');
      await refusal(raise(actor, 'message', source), '42501', 'rule:app.raise_red_flag');
    }
  });
});

describe('reinvent R0a client module settings', () => {
  beforeAll(async () => {
    await svc(tx => q(tx, sql`insert into business_settings (tenant_id, settings) values (${f.t1}, '{}'::jsonb)`), f.t1);
  });
  it('all seven modules default to true', async () => {
    expect(await as(f.ua, tx => one(tx, sql`select client_modules from business_settings where tenant_id = ${f.t1}`))).toEqual({ client_modules: DEFAULT_CLIENT_MODULES });
  });
  for (const value of ['{"unknown":true}', '{"workouts":"yes"}', '[]', 'null', '{"workouts":null}']) it(`client_modules CHECK refuses ${value}`, async () => {
    const error = await expectCode(as(f.o1, tx => q(tx, sql`update business_settings set client_modules = ${value}::jsonb where tenant_id = ${f.t1}`)), '23514');
    expect(error.constraint_name).toBe('business_settings_client_modules_ck');
  });
  it('only the owner can update client_modules and the guard stamps updated_by', async () => {
    const modules = { ...DEFAULT_CLIENT_MODULES, payments: false };
    for (const actor of [f.ua, f.s1]) await expectNoEffect(actor, sql`update business_settings set client_modules = ${JSON.stringify(modules)}::jsonb where tenant_id = ${f.t1}`, 'business_settings', sql`tenant_id = ${f.t1}`);
    await as(f.o1, tx => q(tx, sql`update business_settings set client_modules = ${JSON.stringify(modules)}::jsonb where tenant_id = ${f.t1}`));
    expect(await svc(tx => one(tx, sql`select client_modules, updated_by from business_settings where tenant_id = ${f.t1}`))).toEqual({ client_modules: modules, updated_by: f.o1.userId });
    await as(f.o1, tx => q(tx, sql`update business_settings set client_modules = ${JSON.stringify(DEFAULT_CLIENT_MODULES)}::jsonb where tenant_id = ${f.t1}`));
  });
  it('client_modules remains tenant-isolated', async () => {
    await svc(tx => q(tx, sql`insert into business_settings (tenant_id, settings) values (${f.t2}, '{}'::jsonb)`));
    expect(await as(f.o1, tx => q(tx, sql`select client_modules from business_settings where tenant_id = ${f.t2}`))).toEqual([]);
    await expectNoEffect(f.o1, sql`update business_settings set client_modules = '{"messages":false}'::jsonb where tenant_id = ${f.t2}`, 'business_settings', sql`tenant_id = ${f.t2}`);
  });
  it('core schemas reject unknown keys and resolve explicit false overrides', () => {
    expect(ClientModules.parse(DEFAULT_CLIENT_MODULES)).toEqual(DEFAULT_CLIENT_MODULES);
    expect(ClientModules.safeParse({ ...DEFAULT_CLIENT_MODULES, unknown: true }).success).toBe(false);
    expect(EntitlementOverride.safeParse({ key: 'chat', modules: { messages: false } }).success).toBe(true);
    expect(EntitlementOverride.safeParse({ key: 'chat', modules: { unknown: false } }).success).toBe(false);
    expect(EntitlementOverride.safeParse({ key: 'chat', modules: { workouts: 'yes' } }).success).toBe(false);
    expect(resolveClientModules(DEFAULT_CLIENT_MODULES, { workouts: false })).toEqual({ ...DEFAULT_CLIENT_MODULES, workouts: false });
    expect(resolveClientModules(DEFAULT_CLIENT_MODULES)).toEqual(DEFAULT_CLIENT_MODULES);
    expect(DEFAULT_CLIENT_MODULES.workouts).toBe(true);
  });
});
