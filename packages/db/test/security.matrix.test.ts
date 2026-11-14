import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership, mkPackage, mkVersion } from './factories';
import { as, svc, q, one, expectRls, expectPrivilege, expectNoEffect, expectGuard, serviceRowWhere, withProbe } from './helpers';
import { TABLE_GRANTS, POLICY_CONTRACTS, GUARD_CELLS, USING_CELLS, matrix, makeRow, insertRow, keyColumns, keyWhere, allowsSelect,
  type MatrixActor, type MatrixTable } from './matrix';

let fx: Fixture;
let baseline: Map<MatrixTable, Record<string, unknown>[]>;
const tables = Object.keys(TABLE_GRANTS) as MatrixTable[];
const root = fileURLToPath(new URL('../../..', import.meta.url));
const key = (table: MatrixTable, row: Record<string, unknown>) => JSON.stringify(keyColumns(table).map((c) => String(row[c])));
async function snapshot(f?: Fixture): Promise<Map<MatrixTable, Record<string, unknown>[]>> {
  const result = new Map<MatrixTable, Record<string, unknown>[]>();
  await svc(async (tx) => {
    for (const table of tables) {
      const scope = !f || table==='tenants' ? sql`true` : sql`tenant_id in (${f.t1},${f.t2}) or tenant_id is null`;
      result.set(table, await q(tx, sql`select * from ${sql.identifier(table)} t where ${scope} order by to_jsonb(t)::text collate "C"`));
    }
  });
  return result;
}
async function exactSelect(table: MatrixTable, actor: MatrixActor, f: Fixture, data: ReadonlyMap<MatrixTable, Record<string, unknown>[]>): Promise<void> {
  const actual = await as(f[actor], (tx) => q(tx, sql`select * from ${sql.identifier(table)}`));
  const expected = (data.get(table) ?? []).filter((r) => allowsSelect(table, r, actor, f, data));
  expect(actual.map((r) => key(table, r)).sort()).toEqual(expected.map((r) => key(table, r)).sort());
}
beforeAll(async () => {
  if(!process.env.DATABASE_URL||!process.env.DATABASE_URL_SERVICE)throw new Error('Suite S requires DATABASE_URL and DATABASE_URL_SERVICE; security tests never skip.');
  fx = await buildFixture();
  // S01 fills every missing class with independent recipes; fixture rows remain untouched.
  for (const actorName of ['ua', 'ub', 'uc', 'o1', 's1', 's2', 'sx', 'o2', 'o1t2', 'ubT2'] as const) {
    const actor = fx[actorName];
    for (const table of ['user_preferences', 'push_subscriptions', 'idempotency_keys', 'consents', 'notifications', 'notification_deliveries'] as const) {
      const row = await makeRow(table, fx, actor);
      if (table === 'user_preferences' && actorName === 'o1t2') {
        // Same user, different tenant is a distinct composite key.
        row.tenant_id = fx.t2;
      }
      await svc((tx) => insertRow(tx, table, row));
    }
  }
  for (const actorName of ['ua', 'ub', 'uc'] as const) {
    // 0008: D/E non-empty private-table baselines cover both tenants and assigned/unassigned clients via service inserts.
    for (const table of ['client_flags', 'client_notes', 'tasks', 'ai_requests', 'ai_drafts', 'red_flags', 'client_entitlement_overrides', 'subscription_events',
      'measurement_sets', 'progress_photo_sets', 'inbody_records', 'workout_sessions', 'set_logs', 'meal_logs', 'supplement_logs', 'form_submissions', 'messages', 'message_revisions'] as const) {
      const row = await makeRow(table, fx, fx[actorName]);
      await svc((tx) => insertRow(tx, table, row));
    }
  }
  for (const actor of [fx.o1, fx.o2]) {
    for (const table of ['business_settings', 'tenant_hidden_items', 'foods', 'job_runs', 'events'] as const) {
      const row=await makeRow(table,fx,actor);await svc((tx)=>insertRow(tx,table,row));
    }
    for (const variant of ['private', 'archived'] as const) {
      const id = await mkPackage(actor.tenantId);
      await svc((tx) => tx.execute(variant === 'private' ? sql`update packages set is_public = false where id = ${id}` : sql`update packages set archived_at = now() where id = ${id}`));
    }
    const media = await makeRow('media', fx, actor);
    media.client_id = null; media.bucket = 'tenant-assets'; media.path = `${actor.tenantId}/assets/${randomUUID()}.jpg`;
    await svc((tx) => insertRow(tx, 'media', media));
    for(const family of ['program','nutrition','form']as const){
      for(const clientId of [null,actor.tenantId===fx.t1?fx.clientA:fx.clientC]){
        await mkVersion(actor.tenantId,{family,clientId,status:'draft'});
        await mkVersion(actor.tenantId,{family,clientId,status:'published',publishedBy:actor.userId});
        const historical=await mkVersion(actor.tenantId,{family,clientId,status:'published',publishedBy:actor.userId});
        const table=family==='program'?'program_versions':family==='nutrition'?'nutrition_plan_versions':'form_versions';
        await svc((tx)=>tx.execute(sql`update ${sql.identifier(table)} set status='superseded',superseded_at=now() where id=${historical.versionId}`));
      }
    }
  }
  const internal = await makeRow('messages', fx, fx.s1);
  internal.conversation_id = fx.convInternal; internal.client_id = null;
  const message = (await svc((tx) => insertRow(tx, 'messages', internal)))[0]!;
  await svc((tx) => insertRow(tx, 'message_revisions', { id: randomUUID(), tenant_id: fx.t1, client_id: null, message_id: message.id, body: 'Earlier internal' }));
  await svc((tx) => insertRow(tx, 'job_runs', { id: randomUUID(), tenant_id: null, job: 'system', state: 'pending' }));
  baseline = await snapshot();
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });

// Every string below is a permitted edit from §6.3, independent of the live guard.
function edit(table: MatrixTable, actor: AuthContext): Record<string, unknown> {
  const changes: Record<MatrixTable, Record<string, unknown>> = {
    tenants: { name: 'Edited tenant' }, memberships: { display_name: 'Edited member' }, staff_client_assignments: { assigned_by: actor.userId },
    invitations: { status: 'revoked' }, business_settings: { settings: { units: { weight: 'lb', length: 'cm' },exerciseCategories:[],measurementTemplate:[],weekStartsOn:6,checkinReviewTurnaroundHours:24,numerals:'western' } },
    user_preferences: { preferences: { locale: 'en' } }, consents: { withdrawn_at: '2099-01-01T00:00:00Z' },
    clients: { phone: '01000000001' }, client_notes: { body: 'Edited note' }, client_flags: { resolved_at: '2099-01-01T00:00:00Z' },
    // 0008: D/E permitted runtime edits: draft body and open -> handled (stamps checked by G21).
    ai_drafts: { body: { edited: true } }, red_flags: { status: 'handled' },
    tasks: { title: 'Edited task' }, ai_requests: { output: { edited: true } }, packages: { is_public: false }, subscriptions: { notes: 'Edited subscription' },
    subscription_events: { reason: 'Edited ledger' }, client_entitlement_overrides: { revoked_at: '2099-01-01T00:00:00Z' }, payments: { reference: 'Edited reference' },
    exercises: { hidden: true }, foods: { hidden: true }, tenant_hidden_items: { hidden_by: actor.userId },
    programs: { name: { en: 'Edited program' } }, nutrition_plans: { name: { en: 'Edited plan' } }, forms: { name: { en: 'Edited form' } },
    program_versions: { change_note: 'Edited draft' }, nutrition_plan_versions: { change_note: 'Edited draft' }, form_versions: { change_note: 'Edited draft' },
    metric_entries: { note: 'Edited metric' }, measurement_sets: { note: 'Edited measurement' }, progress_photo_sets: { note: 'Edited photo' }, inbody_records: { note: 'Edited InBody' },
    workout_sessions: { client_note: 'Edited session' }, set_logs: { note: 'Edited set' }, meal_logs: { note: 'Edited meal' }, supplement_logs: { taken: false },
    form_submissions: { answers: { matrix: 'edited' } }, calendar_events: { state: 'completed' },
    conversations: actor.role === 'client' ? { unread_for_client: 0 } : { subject: 'Edited thread' }, messages: { body: 'Edited message' },
    message_revisions: { body: 'Edited revision' }, notifications: { read_at: '2026-11-09T00:00:00Z' }, notification_deliveries: { attempts: 2 },
    push_subscriptions: { user_agent: 'Edited browser' }, idempotency_keys: { status_code: 201 }, media: { deleted_at: '2026-11-09T00:00:00Z' },
    audit_log: { reason: 'Edited audit' }, events: { payload: { edited: true } }, job_runs: { detail: { edited: true } },
  };
  return changes[table];
}
async function runWrite(cell: typeof matrix[number]): Promise<void> {
  const f = await buildPrivateFixture();
  let actor = f[cell.actor];
  if (actor.role === 'staff') actor = await mkMembership(actor, { assignedClientIds: [f.clientA, f.clientC].filter((id) => actor.tenantId === f.t1 ? id === f.clientA : id === f.clientC),
    permissions: { client_scope: actor.permissions?.client_scope ?? 'all', modules: { clients: ['create'], packages: ['create', 'edit', 'delete'], billing: ['create', 'edit', 'verify'], programs: ['publish'], nutrition: ['publish'], forms: ['publish'], ai: ['publish'] } } });
  let row = await cell.factory(cell.table, f, actor);
  if (cell.table === 'media' && cell.command === 'delete' && actor.role !== 'client') {
    row.client_id = null; row.bucket = 'tenant-assets'; row.path = `${actor.tenantId}/assets/${randomUUID()}.jpg`;
  }
  // Self edits target this private graph's identity row, rather than another member/client.
  if (cell.command === 'update' && cell.table === 'memberships') row = (await serviceRowWhere('memberships', sql`id = ${actor.membershipId}`))[0]!;
  else if (cell.command === 'update' && cell.table === 'clients') row = (await serviceRowWhere('clients', sql`id = ${actor.clientId ?? (actor.tenantId === f.t2 ? f.clientC : f.clientA)}`))[0]!;
  else if (cell.command === 'update' && cell.table === 'tenants') row = (await serviceRowWhere('tenants', sql`id = ${actor.tenantId}`))[0]!;
  else {
    if (cell.table === 'conversations' && actor.role === 'client') {
      row = { ...row, kind: 'client', client_id: actor.clientId };
      await svc((tx) => tx.execute(sql`delete from conversations where tenant_id = ${actor.tenantId} and client_id = ${actor.clientId}`));
    }
    if (cell.command !== 'insert') row = (await svc((tx) => insertRow(tx, cell.table, row)))[0]!;
  }
  const before = await snapshot(f);
  const where = keyWhere(cell.table, row);
  const statement = cell.statement(cell.table,cell.command,row,edit(cell.table,actor));
  const work = () => as(actor, async (tx) => {
    const {now}=await one<{now:Date}>(tx,sql`select now()as now`);
    if (cell.command === 'insert') {
      // Assigned client creation cannot RETURNING before its AFTER assignment trigger (§5.2).
      if (cell.table === 'clients' && actor.role === 'staff' && actor.permissions?.client_scope === 'assigned') {
        await tx.execute(sql`insert into clients (id, tenant_id, first_name, status) values (${row.id}, ${actor.tenantId}, 'Matrix client', 'active')`);
        return {rows:await q(tx, sql`select * from clients where id = ${row.id}`),now};
      }
      return {rows:await q(tx,statement),now};
    }
    return {rows:await q(tx, sql`${statement} returning *`),now};
  });
  if (cell.expected === 'privilege') {const error=await expectPrivilege(work);expect(error.message).toMatch(new RegExp(`^permission denied for table ${cell.table}\\b`,'i'));}
  else if (cell.expected === 'rls') await expectRls(work);
  else if (cell.expected === 'noeffect') await expectNoEffect(actor, statement, cell.table, where);
  else {
    const {rows:returned,now} = await work();
    expect(returned).toHaveLength(1);
    expect(key(cell.table, returned[0]!)).toBe(key(cell.table, row));
    const stored = await serviceRowWhere(cell.table, where);
    if (cell.command === 'delete') expect(stored).toEqual([]);
    else {
      expect(stored).toHaveLength(1);
      const expected = cell.expectedValues(row,edit(cell.table, actor));
      for (const [column, value] of Object.entries(expected)) {
        if (['withdrawn_at', 'resolved_at', 'revoked_at'].includes(column)) expect(stored[0]![column]).toEqual(now);
        else if(stored[0]![column] instanceof Date){
          const actual=stored[0]![column] as Date;
          expect(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?actual.toISOString().slice(0,10):actual.toISOString()).toBe(/^\d{4}-\d{2}-\d{2}$/.test(String(value))?String(value):new Date(String(value)).toISOString());
        }else expect(typeof value==='number'?Number(stored[0]![column]):stored[0]![column]).toEqual(value);
      }
    }
    return;
  }
  expect(await snapshot(f)).toEqual(before); // includes counters, audit, outbox, revisions and pointers
  // For an operation forbidden on every row, its counterpart is an ordinary permitted SELECT (§13.3).
  const data = await snapshot(f);
  const actorKey = cell.actor;
  const controlFixture = { ...f, [actorKey]: actor };
  await exactSelect(cell.table, actorKey, controlFixture, data);
}

describe('complete policy matrix', () => {
  it('S00 public all actors all commands all columns baseline: exact policies and implemented coverage', async () => {
    const actual = await svc((tx) => q<{ name: string }>(tx, sql`select p.polname as name from pg_policy p join pg_class c on c.oid = p.polrelid where c.relnamespace = 'public'::regnamespace order by 1`));
    const required = POLICY_CONTRACTS.map((p) => p.name).sort();
    expect(actual.map((p) => p.name).sort()).toEqual(required);
    expect([...new Set(matrix.flatMap((c) => c.covers.map((p) => p.slice(7))))].sort()).toEqual(required);
    for (const table of tables) for (const command of ['select', 'insert', 'update', 'delete']) expect(matrix.some((c) => c.table === table && c.command === command)).toBe(true);
    expect(POLICY_CONTRACTS.filter((p) => p.impliedBy).map((p) => [p.name, p.impliedBy])).toEqual([
      ['memberships_owner_select', 'memberships_staff_select'], ['staff_client_assignments_owner_select', 'staff_client_assignments_staff_select'],
    ]);
  });
  for (const cell of matrix.filter((c) => c.command === 'select')) it(`S01 ${cell.table} ${cell.actor} SELECT key tuple baseline classes`, () => exactSelect(cell.table, cell.actor, fx, baseline));
  for (const table of tables) for (const actorName of ['o2', 'o1t2'] as const) {
    it(`S02 ${table} ${actorName} SELECT tenant_id baseline foreign rows`, async () => {
      const actor = fx[actorName];
      const predicate = table === 'tenants' ? sql`id <> ${fx.t2}` : table === 'memberships' ? sql`tenant_id is distinct from ${fx.t2} and user_id <> ${actor.userId}`
        : table === 'exercises' || table === 'foods' ? sql`tenant_id is not null and tenant_id <> ${fx.t2}` : sql`tenant_id is distinct from ${fx.t2}`;
      expect(await as(actor, (tx) => q(tx, sql`select * from ${sql.identifier(table)} where ${predicate}`))).toEqual([]);
      if (table === 'memberships') {
        const ownForeign = await as(actor, (tx) => q<{ id: string }>(tx, sql`select id from memberships where tenant_id <> ${fx.t2} and user_id = ${actor.userId}`));
        expect(ownForeign.map((r) => r.id).sort()).toEqual(actorName === 'o1t2' ? [fx.o1.membershipId] : []);
      }
      await exactSelect(table, actorName, fx, baseline);
    });
  }
  for (const cell of matrix.filter((c) => c.command !== 'select')) {
    const columns=cell.command==='update'?Object.keys(edit(cell.table,{userId:'title',tenantId:'title',membershipId:'title',role:['ua','ub','uc'].includes(cell.actor)?'client':'owner',permissions:null})).join(','):keyColumns(cell.table).join(',');
    it(`S03 ${cell.table} ${cell.actor} ${cell.command.toUpperCase()} ${columns} private ${cell.rowClass} initial state ${cell.expected}`, () => runWrite(cell));
  }
  for(const cell of GUARD_CELLS)it(`S03 ${cell.table} ${cell.actor} ${cell.command.toUpperCase()} ${cell.column} ${cell.starting} ${cell.rule}`,async()=>{
    const f=await buildPrivateFixture();const actor=f[cell.actor];
    if(cell.command==='update'){
      const id=cell.table==='clients'?f.clientA:actor.membershipId;const before=await snapshot(f);
      const forbidden=cell.column==='status'?sql`status='archived'`:sql`permissions='{}'::jsonb`;
      const error=await expectGuard(()=>as(actor,(tx)=>tx.execute(sql`update ${sql.identifier(cell.table)} set ${forbidden} where id=${id}`)),cell.rule,cell.column);expect(error.table_name).toBe(cell.table);expect(error.code).toBe(cell.code);expect(await snapshot(f)).toEqual(before);
      expect(await as(actor,(tx)=>q(tx,sql`update ${sql.identifier(cell.table)} set phone='01000000003' where id=${id} returning id,phone`))).toEqual([{id,phone:'01000000003'}]);
    }else{
      const family=cell.table.startsWith('program')?'program':cell.table.startsWith('nutrition')?'nutrition':'form';
      const doc=await mkVersion(actor.tenantId,{family,status:'published'});const id=cell.table.endsWith('_versions')?doc.versionId:doc.headId;const before=await snapshot(f);
      const error=await expectGuard(()=>as(actor,(tx)=>tx.execute(sql`delete from ${sql.identifier(cell.table)} where id=${id}`)),cell.rule);expect(error.code).toBe(cell.code);expect(error.table_name).toBe(cell.table);expect(await snapshot(f)).toEqual(before);
      const draft=await mkVersion(actor.tenantId,{family});const free=cell.table.endsWith('_versions')?draft.versionId:draft.headId;
      expect(await as(actor,(tx)=>q(tx,sql`delete from ${sql.identifier(cell.table)} where id=${free} returning id`))).toEqual([{id:free}]);
    }
  });
  for(const cell of USING_CELLS)it(`S03 ${cell.table} ${cell.actor} UPDATE ${cell.column} ${cell.starting} USING refusal`,async()=>{
    const f=await buildPrivateFixture();const actor=f[cell.actor];
    const bad=await makeRow(cell.table,f,cell.table==='payments'?f.ua:f.o1);
    const good=await makeRow(cell.table,f,cell.table==='media'?f.o1:actor);
    let value='edited';
    if(cell.table==='invitations')value='revoked';
    if(cell.table==='payments'){bad.state='verified';good.state='pending';}
    if(cell.table==='media'){bad.review_state='approved';good.review_state='requested';value='uploaded';}
    const badRow=(await svc((tx)=>insertRow(tx,cell.table,bad)))[0]!;const goodRow=(await svc((tx)=>insertRow(tx,cell.table,good)))[0]!;
    const before=await snapshot(f);
    await expectNoEffect(actor,sql`update ${sql.identifier(cell.table)} set ${sql.identifier(cell.column)}=${value} where ${keyWhere(cell.table,badRow)}`,cell.table,keyWhere(cell.table,badRow));
    expect(await snapshot(f)).toEqual(before);
    expect(await as(actor,(tx)=>q(tx,sql`update ${sql.identifier(cell.table)} set ${sql.identifier(cell.column)}=${value} where ${keyWhere(cell.table,goodRow)} returning id,${sql.identifier(cell.column)}`))).toEqual([{id:goodRow.id,[cell.column]:value}]);
    expect((await serviceRowWhere(cell.table,keyWhere(cell.table,goodRow)))[0]?.[cell.column]).toBe(value);
  });
  for (const actorName of ['o1', 's1', 'ua'] as const) it(`S04 dawlyy_probe.t ${actorName} INSERT/UPDATE tenant_id T1/T2 empty guard`, async () => {
    // doc S04: no immutable/transition rule may mask WITH CHECK. A client role is refused any UPDATE by the guard unless the
    // column is listed in client_update, so for ua list the two columns this test edits; the tenant guard policy still decides.
    await withProbe(actorName === 'ua' ? { client_update: ['tenant_id', 'notes'] } : {}, async () => {
      const a = randomUUID(); const b = randomUUID(); const proposed = randomUUID();
      await svc((tx) => tx.execute(sql`insert into dawlyy_probe.t (id, tenant_id, notes) values (${a}, ${fx.t1}, 'T1'), (${b}, ${fx.t2}, 'T2')`));
      expect(await as(fx[actorName], (tx) => q(tx, sql`select id from dawlyy_probe.t order by id`))).toEqual([{ id: a }]);
      const pre = await svc((tx) => q(tx, sql`select * from dawlyy_probe.t order by id`));
      await expectRls(() => as(fx[actorName], (tx) => tx.execute(sql`insert into dawlyy_probe.t (id, tenant_id) values (${proposed}, ${fx.t2})`)));
      expect(await svc((tx) => q(tx, sql`select * from dawlyy_probe.t order by id`))).toEqual(pre);
      expect(await as(fx[actorName], (tx) => q(tx, sql`insert into dawlyy_probe.t (id, tenant_id, notes) values (${proposed}, ${fx.t1}, 'allowed') returning id, notes`))).toEqual([{ id: proposed, notes: 'allowed' }]);
      const preMove = await svc((tx) => q(tx, sql`select * from dawlyy_probe.t order by id`));
      await expectRls(() => as(fx[actorName], (tx) => tx.execute(sql`update dawlyy_probe.t set tenant_id = ${fx.t2} where id = ${a}`)));
      expect(await svc((tx) => q(tx, sql`select * from dawlyy_probe.t order by id`))).toEqual(preMove);
      expect(await as(fx[actorName], (tx) => q(tx, sql`update dawlyy_probe.t set notes = 'edited' where id = ${a} returning id, notes`))).toEqual([{ id: a, notes: 'edited' }]);
    });
  });
  it('S05 schema source all actors policy construction baseline: enableRLS and vocabulary only', () => {
    const schemaDir = `${root}/packages/db/src/schema`;
    const vocabulary = readFileSync(`${schemaDir}/_rls.ts`, 'utf8');
    expect(vocabulary).toMatch(/DRIZZLE_NO_POLICIES/);
    expect(vocabulary).toMatch(/function\s+allow\b/); expect(vocabulary).toMatch(/function\s+tenantGuard\b/);
    for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.ts') && f !== '_rls.ts')) {
      const source = readFileSync(`${schemaDir}/${file}`, 'utf8');
      expect(source.match(/\bpgTable\s*\(/g)?.length ?? 0).toBe(source.match(/\.enableRLS\s*\(/g)?.length ?? 0);
      expect(source).not.toMatch(/\bpgPolicy\s*\(/);
      expect(source).not.toMatch(/DRIZZLE_NO_POLICIES/);
    }
    // 0008: D/E add two tables to the original 47-table inventory.
    expect(tables).toHaveLength(49);
  });
});
