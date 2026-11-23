import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkSession, mkTenant, mkClient, mkVersion } from './factories';
import { as, svc, q, one, expectCode, expectGuard, expectPrivilege, expectRls, expectNoEffect, serviceRow } from './helpers';

let fx: Fixture;
beforeAll(async () => { fx = await buildFixture(); });
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
const trackingTables = ['metric_entries', 'measurement_sets', 'progress_photo_sets', 'inbody_records', 'workout_sessions', 'set_logs',
  'meal_logs', 'supplement_logs', 'form_submissions', 'programs', 'program_versions', 'nutrition_plans', 'nutrition_plan_versions', 'forms', 'form_versions',
  'media', 'payments', 'consents', 'tenant_hidden_items', 'exercises', 'foods', 'audit_log', 'events'] as const;
async function snapshot(f: Fixture): Promise<unknown[]> {
  return svc(async (tx) => {
    const result: unknown[] = [];
    for (const table of trackingTables) result.push(await one(tx, sql`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate "C"), '[]'::jsonb)::text as rows
      from ${sql.identifier(table)} t where tenant_id in (${f.t1}::uuid, ${f.t2}::uuid)`));
    return result;
  }, f.t1);
}
async function refusal(f: Fixture, work: () => Promise<unknown>, layer: string, column?: string, table?: string): Promise<void> {
  const before = await snapshot(f);
  if (layer === 'privilege') { const error = await expectPrivilege(work); expect(error.message).toContain(`table ${table}`); }
  else if (layer === 'rls') await expectRls(work);
  else if (layer.startsWith('fk:') || layer.startsWith('check:')) {
    const error = await expectCode(work, layer.startsWith('fk:') ? '23503' : '23514'); expect(error.constraint_name).toBe(layer.slice(layer.indexOf(':') + 1));
  } else if (layer.startsWith('parent:')) {
    const error = await expectCode(work, '23503'); expect(error).toMatchObject({ detail: 'rule:app.' + layer.slice(7), table_name: table, column_name: column });
  } else { const error = await expectGuard(work, layer, column); expect(error.table_name).toBe(table); if (layer.startsWith('rule:')) expect(error.code).toBe('P0001'); }
  expect(await snapshot(f)).toEqual(before);
}
function insert(table: string, f: Fixture, id: string, extra: Record<string, SQL> = {}): SQL {
  const common = { id: sql`${id}::uuid`, tenant_id: sql`${f.t1}::uuid`, client_id: sql`${f.clientA}::uuid` };
  const defaults: Record<string, Record<string, SQL>> = {
    metric_entries: { metric: sql`'weight'`, value: sql`80`, unit: sql`'kg'`, source: sql`'manual'`, recorded_at: sql`now()`, local_date: sql`current_date`, timezone: sql`'Africa/Cairo'`, client_uuid: sql`${randomUUID()}::uuid` },
    measurement_sets: { local_date: sql`current_date`, values: sql`'[]'::jsonb`, client_uuid: sql`${randomUUID()}::uuid` },
    progress_photo_sets: { local_date: sql`current_date`, poses: sql`'[]'::jsonb`, client_uuid: sql`${randomUUID()}::uuid` },
    inbody_records: { local_date: sql`current_date` },
    workout_sessions: { local_date: sql`current_date`, timezone: sql`'Africa/Cairo'`, client_uuid: sql`${randomUUID()}::uuid` },
    set_logs: { exercise_id: sql`${f.exerciseSystem}::uuid`, set_no: sql`1`, reps: sql`10`, client_uuid: sql`${randomUUID()}::uuid`, client_updated_at: sql`'2026-01-01T00:00:00Z'::timestamptz` },
    meal_logs: { local_date: sql`current_date`, client_uuid: sql`${randomUUID()}::uuid` },
    supplement_logs: { local_date: sql`current_date`, supplement_id: sql`'supplement'`, taken: sql`true`, client_uuid: sql`${randomUUID()}::uuid` },
    form_submissions: { form_version_id: sql`${f.templateFormPub}::uuid`, form_id: sql`${f.templateForm}::uuid`, form_kind: sql`'checkin'`, client_uuid: sql`${randomUUID()}::uuid` },
  };
  const values = { ...common, ...defaults[table], ...extra };
  return sql`insert into ${sql.identifier(table)} (${sql.join(Object.keys(values).map(sql.identifier), sql`, `)}) values (${sql.join(Object.values(values), sql`, `)}) returning *`;
}
async function row(table: string, f: Fixture, extra: Record<string, SQL> = {}): Promise<string> {
  const id = randomUUID(); await svc((tx) => q(tx, insert(table, f, id, extra)), f.t1); return id;
}
async function legal(actor: AuthContext, table: string, id: string): Promise<void> {
  if (actor.role === 'client' && ['meal_logs', 'measurement_sets', 'supplement_logs'].includes(table)) {
    const before = await serviceRow(table, id);
    expect(before).toBeDefined();
    expect(await as(actor, tx => one(tx, sql`select * from ${sql.identifier(table)} where id = ${id}`))).toEqual(before);
    return;
  }
  const column = table === 'workout_sessions' ? 'client_note' : table === 'supplement_logs' ? 'taken' : table === 'form_submissions' ? 'answers' : 'note';
  const value = column === 'taken' ? sql`false` : column === 'answers' ? sql`'{"allowed":true}'::jsonb` : sql`'allowed'`;
  await as(actor, (tx) => q(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where id = ${id}`));
  expect(await serviceRow(table, id)).toMatchObject({ [column]: column === 'taken' ? false : column === 'answers' ? { allowed: true } : 'allowed' });
}
async function appendMetric(f: Fixture, actor: AuthContext): Promise<void> {
  const id = randomUUID(); await as(actor, (tx) => q(tx, insert('metric_entries', f, id)));
  expect(await serviceRow('metric_entries', id)).toMatchObject({ source: 'manual', client_id: f.clientA });
}

// Hand-entered §6.3 client_update lists. No catalog/guard JSON supplies these expectations.
const syncColumns = {
  set_logs: ['exercise_id', 'block_id', 'item_id', 'set_no', 'tag', 'reps', 'load', 'load_unit', 'duration_sec', 'distance_m', 'rpe', 'rir', 'rest_sec', 'completed', 'skipped', 'substituted_for', 'pain_flag', 'note', 'client_updated_at', 'deleted_at'],
  measurement_sets: ['local_date', 'values', 'note', 'client_updated_at'],
  progress_photo_sets: ['local_date', 'poses', 'weight_kg', 'note', 'client_updated_at'],
  workout_sessions: ['state', 'local_date', 'timezone', 'started_at', 'ended_at', 'active_seconds', 'rpe_overall', 'mood', 'pain_note', 'client_note', 'client_updated_at'],
  meal_logs: ['plan_version_id', 'local_date', 'meal_id', 'option_id', 'free_entry', 'status', 'note', 'client_updated_at', 'recorded_at'],
  supplement_logs: ['plan_version_id', 'supplement_id', 'local_date', 'taken', 'client_updated_at', 'recorded_at'],
} as const;
type SyncTable = keyof typeof syncColumns;
const libraryCoverage = new Set<string>();

describe('tracking isolation and offline synchronization (§5.2, §6.3, §7.5)', () => {
  for (const [who, target, layer] of [['ua', 'B-session', 'fk:set_logs_session_fk'], ['s2', 'B-client', 'fk:set_logs_session_fk'], ['ua', 'B-client', 'rls']] as const) it(`K01 set_logs ${who} INSERT session_id/client_id ${target}`, async () => {
    const f = await buildPrivateFixture(), a = await mkSession(f.t1, f.clientA), b = await mkSession(f.t1, f.clientB), id = randomUUID();
    await refusal(f, () => as(f[who], (tx) => q(tx, insert('set_logs', f, id, { session_id: sql`${target === 'B-session' ? b : a}::uuid`, client_id: sql`${target === 'B-client' ? f.clientB : f.clientA}::uuid` }))), layer);
    await as(f[who], (tx) => q(tx, insert('set_logs', f, id, { session_id: sql`${a}::uuid` })));
    expect(await serviceRow('set_logs', id)).toMatchObject({ client_id: f.clientA, session_id: a, set_no: 1, reps: 10 });
  });
  for (const target of ['program', 'version'] as const) it(`K01 workout_sessions s2 INSERT ${target}_id other-client`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID();
    await refusal(f, () => as(f.s2, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: sql`${target === 'program' ? f.copyProgramB : f.copyProgramA2}::uuid`, program_version_id: target === 'version' ? sql`${f.copyPubB}::uuid` : sql`null` }))), `fk:workout_sessions_${target}_fk`);
    await as(f.s2, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: sql`${f.copyProgramA2}::uuid`, program_version_id: sql`${f.copyPubA}::uuid` })));
    expect(await serviceRow('workout_sessions', id)).toMatchObject({ program_id: f.copyProgramA2, program_version_id: f.copyPubA });
  });
  for (const state of ['draft', 'in_review'] as const) it(`K02 workout_sessions ua INSERT program_version_id own ${state}`, async () => {
    const f = await buildPrivateFixture(), v = await mkVersion(f.t1, { clientId: f.clientA }), id = randomUUID();
    if (state === 'in_review') await svc((tx) => q(tx, sql`update program_versions set status = 'in_review' where tenant_id = ${f.t1} and id = ${v.versionId}`), f.t1);
    await refusal(f, () => as(f.ua, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: sql`${v.headId}::uuid`, program_version_id: sql`${v.versionId}::uuid` }))), 'parent:visible_refs', 'program_version_id', 'workout_sessions');
    // doc §7.1 program_versions edges: in_review -> approved -> published (in_review -> published is not an edge).
    if (state === 'in_review') await as(f.o1, (tx) => q(tx, sql`update program_versions set status = 'approved' where id = ${v.versionId}`));
    await as(f.o1, (tx) => q(tx, sql`update program_versions set status = 'published' where id = ${v.versionId}`));
    await as(f.ua, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: sql`${v.headId}::uuid`, program_version_id: sql`${v.versionId}::uuid` })));
    expect(await serviceRow('workout_sessions', id)).toMatchObject({ program_id: v.headId, program_version_id: v.versionId });
  });
  for (const target of ['wrong-head', 'null-head', 'superseded'] as const) it(`K02 workout_sessions ua INSERT program_id/version_id ${target}`, async () => {
    const f = await buildPrivateFixture(), v = await mkVersion(f.t1, { clientId: f.clientA, status: 'published' }), id = randomUUID();
    if (target !== 'superseded') await refusal(f, () => as(f.ua, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: target === 'null-head' ? sql`null` : sql`${v.headId}::uuid`, program_version_id: sql`${f.copyPubA}::uuid` }))), target === 'null-head' ? 'check:workout_sessions_program_pair_ck' : 'fk:workout_sessions_version_fk');
    else await as(f.o1, (tx) => q(tx, sql`update program_versions set status = 'superseded' where id = ${v.versionId}`));
    await as(f.ua, (tx) => q(tx, insert('workout_sessions', f, id, { program_id: sql`${v.headId}::uuid`, program_version_id: sql`${v.versionId}::uuid` })));
    expect(await serviceRow('workout_sessions', id)).toMatchObject({ program_version_id: v.versionId });
  });
  for (const table of ['meal_logs', 'supplement_logs'] as const) for (const operation of ['insert', 'update'] as const) for (const target of ['draft', 'B-invisible', 'B-visible'] as const) it(`K03 ${table} ${target === 'B-visible' ? 's2' : 'ua'} ${operation.toUpperCase()} plan_version_id ${target}`, async () => {
    const f = await buildPrivateFixture(), draft = await mkVersion(f.t1, { family: 'nutrition', clientId: f.clientA }), id = operation === 'update' ? await row(table, f, { plan_version_id: sql`${f.planPubA}::uuid` }) : randomUUID(), actor = target === 'B-visible' ? f.s2 : f.ua;
    const bad = target === 'draft' ? draft.versionId : f.planPubB;
    await refusal(f, () => as(actor, (tx) => q(tx, operation === 'insert' ? insert(table, f, id, { plan_version_id: sql`${bad}::uuid` }) : sql`update ${sql.identifier(table)} set plan_version_id = ${bad} where id = ${id}`)), target === 'B-visible' ? `fk:${table}_plan_version_fk` : 'parent:visible_refs', 'plan_version_id', table);
    if (operation === 'insert') await as(actor, (tx) => q(tx, insert(table, f, id, { plan_version_id: sql`${f.planPubA}::uuid` })));
    else if (actor.role === 'client') await as(actor, tx => q(tx, sql`update ${sql.identifier(table)} set plan_version_id = plan_version_id where id = ${id}`));
    else await as(actor, (tx) => q(tx, sql`update ${sql.identifier(table)} set plan_version_id = plan_version_id, ${sql.identifier(table === 'meal_logs' ? 'note' : 'taken')} = ${table === 'meal_logs' ? sql`'allowed'` : sql`false`} where id = ${id}`));
    expect(await serviceRow(table, id)).toMatchObject({ plan_version_id: f.planPubA });
  });
  it('K04 metric_entries ua INSERT correction_of other-client/new correction', async () => {
    const f = await buildPrivateFixture(), original = await serviceRow('metric_entries', f.metricA), id = randomUUID();
    await refusal(f, () => as(f.ua, (tx) => q(tx, insert('metric_entries', f, id, { correction_of: sql`${f.metricB}::uuid`, value: sql`79.5` }))), 'fk:metric_entries_correction_fk');
    await as(f.ua, (tx) => q(tx, insert('metric_entries', f, id, { correction_of: sql`${f.metricA}::uuid`, value: sql`79.5` })));
    expect(await serviceRow('metric_entries', id)).toMatchObject({ correction_of: f.metricA, value: '79.500' }); expect(await serviceRow('metric_entries', f.metricA)).toEqual(original);
  });
  for (const source of ['imported', 'device', 'form', 'ai_estimate']) it(`K04 metric_entries ua INSERT source ${source}`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID();
    await refusal(f, () => as(f.ua, (tx) => q(tx, insert('metric_entries', f, id, { source: sql`${source}` }))), 'client_insert_eq', 'source', 'metric_entries');
    await as(f.ua, (tx) => q(tx, insert('metric_entries', f, id))); expect(await serviceRow('metric_entries', id)).toMatchObject({ source: 'manual' });
  });
  for (const caseId of ['K05', 'K20'] as const) for (const who of ['ua', 's2', 'o1'] as const) for (const operation of ['update', 'delete'] as const) it(`${caseId} metric_entries ${who} ${operation.toUpperCase()} value79.5 append-only`, async () => {
    const f = await buildPrivateFixture(), before = await serviceRow('metric_entries', f.metricA);
    await refusal(f, () => as(f[who], (tx) => q(tx, operation === 'update' ? sql`update metric_entries set value = 79.5 where id = ${f.metricA}` : sql`delete from metric_entries where id = ${f.metricA}`)), 'privilege', undefined, 'metric_entries');
    if (caseId === 'K20') {
      const correction = randomUUID(); await as(f[who], (tx) => q(tx, insert('metric_entries', f, correction, { value: sql`79.5`, correction_of: sql`${f.metricA}::uuid` })));
      expect(await serviceRow('metric_entries', correction)).toMatchObject({ value: '79.500', correction_of: f.metricA });
    } else await appendMetric(f, f[who]);
    expect(await serviceRow('metric_entries', f.metricA)).toEqual(before);
  });
  it('K05 metric_entries ua/ub INSERT same offline UUID DO NOTHING and independent client', async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), offline = randomUUID();
    const statement = (key: string, client: string) => sql`${insert('metric_entries', f, key, { client_id: sql`${client}::uuid`, client_uuid: sql`${offline}::uuid` }).getSQL()}`;
    // Build DO NOTHING before RETURNING, rather than appending after the insert helper's RETURNING.
    const retry = (key: string, client: string) => sql`insert into metric_entries (id, tenant_id, client_id, metric, value, unit, recorded_at, local_date, timezone, client_uuid)
      values (${key}, ${f.t1}, ${client}, 'weight', 80, 'kg', now(), current_date, 'Africa/Cairo', ${offline}) on conflict (tenant_id, client_id, client_uuid) do nothing returning id`;
    await as(f.ua, (tx) => q(tx, statement(id, f.clientA))); const before = await snapshot(f);
    expect(await as(f.ua, (tx) => q(tx, retry(randomUUID(), f.clientA)))).toEqual([]); expect(await snapshot(f)).toEqual(before);
    const other = randomUUID(); expect(await as(f.ub, (tx) => q(tx, retry(other, f.clientB)))).toEqual([{ id: other }]);
  });
  for (const who of ['ua', 's2', 'o1'] as const) for (const column of ['unit', 'source', 'id'] as const) it(`K05 metric_entries ${who} UPDATE ${column} append-only`, async () => {
    const f = await buildPrivateFixture();
    await refusal(f, () => as(f[who], (tx) => q(tx, sql`update metric_entries set ${sql.identifier(column)} = ${column === 'id' ? sql`${randomUUID()}::uuid` : column === 'unit' ? sql`'lb'` : sql`'device'`} where id = ${f.metricA}`)), 'privilege', undefined, 'metric_entries');
    await appendMetric(f, f[who]);
  });
  it('K06 inbody_records svc INSERT normalized/source importer then ua UPDATE fields/note', async () => {
    const f = await buildPrivateFixture(), id = await row('inbody_records', f, { source: sql`'imported'`, normalized: sql`'{"weightKg":80}'::jsonb` });
    expect(await serviceRow('inbody_records', id)).toMatchObject({ source: 'imported', normalized: { weightKg: 80 } });
    await as(f.ua, (tx) => q(tx, sql`update inbody_records set fields = '{"weight":"79.5"}', note = 'allowed' where id = ${id}`));
    expect(await serviceRow('inbody_records', id)).toMatchObject({ fields: { weight: '79.5' }, note: 'allowed', source: 'imported', normalized: { weightKg: 80 } });
  });
  for (const [column, value, layer] of [['raw_media_id', 'mediaB', 'fk:inbody_records_media_fk'], ['source', 'imported', 'client_insert_eq']] as const) it(`K06 inbody_records ua INSERT ${column} ${value}`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID();
    await refusal(f, () => as(f.ua, (tx) => q(tx, insert('inbody_records', f, id, { [column]: column === 'raw_media_id' ? sql`${f.mediaB}::uuid` : sql`'imported'` }))), layer, column, 'inbody_records');
    await as(f.ua, (tx) => q(tx, insert('inbody_records', f, id, { raw_media_id: sql`${f.mediaA}::uuid` })));
    expect(await serviceRow('inbody_records', id)).toMatchObject({ raw_media_id: f.mediaA, source: 'manual', normalized: {} });
    await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update inbody_records set source = 'imported' where id = ${id}`)), 'client_update', 'source', 'inbody_records'); await legal(f.ua, 'inbody_records', id);
  });
  for (const caseId of ['K07', 'K25'] as const) for (const who of ['ua', 's2', 'o1'] as const) for (const table of (caseId === 'K07' ? ['workout_sessions'] : ['workout_sessions', 'inbody_records']) as readonly ('workout_sessions' | 'inbody_records')[]) for (const operation of ['insert', 'update'] as const) {
    const column = table === 'workout_sessions' ? 'summary' : 'normalized';
    it(`${caseId} ${table} ${who} ${operation.toUpperCase()} ${column} service-written`, async () => {
      const f = await buildPrivateFixture(), id = operation === 'update' ? await row(table, f) : randomUUID(), computed = { computed: 42 };
      await refusal(f, () => as(f[who], (tx) => q(tx, operation === 'insert' ? insert(table, f, id, { [column]: sql`${JSON.stringify(computed)}::jsonb` }) : sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${JSON.stringify(computed)}::jsonb where id = ${id}`)), operation === 'insert' ? 'insert_eq' : 'immutable', column, table);
      if (operation === 'insert') await as(f[who], (tx) => q(tx, insert(table, f, id)));
      await legal(f[who], table, id);
      await svc((tx) => q(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${JSON.stringify(computed)}::jsonb where tenant_id = ${f.t1} and id = ${id}`), f.t1);
      expect(await as(f[who], (tx) => one(tx, sql`select ${sql.identifier(column)} from ${sql.identifier(table)} where id = ${id}`))).toEqual({ [column]: computed });
    });
  }
  for (const column of ['planned_workout', 'program_id', 'program_version_id', 'phase_id', 'week_id', 'day_id', 'workout_id']) it(`K07 workout_sessions ua UPDATE ${column} snapshot identity`, async () => {
    const f = await buildPrivateFixture(), id = await mkSession(f.t1, f.clientA);
    const value = column === 'planned_workout' ? sql`'{"id":"snapshot"}'::jsonb` : column === 'program_version_id' ? sql`${f.copyPubA}::uuid` : column === 'program_id' ? sql`${f.copyProgramA2}::uuid` : sql`'other'`;
    await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update workout_sessions set ${sql.identifier(column)} = ${value} where id = ${id}`)), 'immutable', column, 'workout_sessions'); await legal(f.ua, 'workout_sessions', id);
  });
  for (const table of ['measurement_sets', 'progress_photo_sets'] as const) {
    it(`K08 ${table} ua payload/note ${table === 'measurement_sets' ? 'requires a replacement' : 'remains mutable'}`, async () => {
      const f = await buildPrivateFixture(), id = await row(table, f);
      const payload = table === 'measurement_sets' ? { values: [{ type: 'waist', value: 80, unit: 'cm' }], note: 'allowed' } : { poses: [{ pose: 'front', mediaId: f.mediaA }], weight_kg: '79.50', note: 'allowed' };
      if (table === 'measurement_sets') {
        await refusal(f, () => as(f.ua, tx => q(tx, sql`update measurement_sets set "values" = ${JSON.stringify(payload.values)}::jsonb where id = ${id}`)), 'client_update', 'values', table);
        await refusal(f, () => as(f.ua, tx => q(tx, sql`update measurement_sets set note = 'allowed' where id = ${id}`)), 'client_update', 'note', table);
        const replacement = randomUUID();
        await as(f.ua, tx => q(tx, insert(table, f, replacement, {
          values: sql`${JSON.stringify(payload.values)}::jsonb`, note: sql`'allowed'`, replaces_id: sql`${id}::uuid`,
        })));
        expect(await serviceRow(table, id)).toMatchObject({ values: [], note: null, voided_at: expect.any(Date) });
        expect(await serviceRow(table, replacement)).toMatchObject({ ...payload, replaces_id: id });
        return;
      }
      await as(f.ua, tx => q(tx, sql`update progress_photo_sets set poses = ${JSON.stringify(payload.poses)}::jsonb, weight_kg = 79.5, note = 'allowed' where id = ${id}`));
      expect(await serviceRow(table, id)).toMatchObject(payload);
    });
    for (const column of ['id', 'tenant_id', 'client_id', 'client_uuid', 'created_at']) it(`K08 ${table} ua UPDATE ${column} identity`, async () => {
      const f = await buildPrivateFixture(), id = await row(table, f);
      await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${column === 'created_at' ? sql`'2001-01-01'::timestamptz` : sql`${randomUUID()}::uuid`} where id = ${id}`)), 'immutable', column, table); await legal(f.ua, table, id);
    });
  }
  it('K08 measurement_sets ua INSERT taken_by staff/client', async () => {
    const f = await buildPrivateFixture(), id = randomUUID();
    await refusal(f, () => as(f.ua, (tx) => q(tx, insert('measurement_sets', f, id, { taken_by: sql`'staff'` }))), 'client_insert_eq', 'taken_by', 'measurement_sets');
    await as(f.ua, (tx) => q(tx, insert('measurement_sets', f, id))); expect(await serviceRow('measurement_sets', id)).toMatchObject({ taken_by: 'client' });
  });
  for (const caseId of ['K09', 'K22'] as const) for (const column of ['exercise_id', 'substituted_for'] as const) for (const operation of ['insert', 'update'] as const) for (const who of (caseId === 'K22' ? ['ua', 's2'] : ['ua']) as readonly ('ua' | 's2')[]) {
    if (caseId === 'K22') { libraryCoverage.add(`set_logs.${column}:${operation === 'insert' ? 'insert' : 'changed-update'}`); libraryCoverage.add(`set_logs.${column}:unchanged-update`); }
    it(`${caseId} set_logs ${who} ${operation.toUpperCase()} ${column} exerciseT2/system/tenant`, async () => {
    const f = await buildPrivateFixture(), session = await mkSession(f.t1, f.clientA), id = operation === 'update' ? await row('set_logs', f, { session_id: sql`${session}::uuid` }) : randomUUID();
    await refusal(f, () => as(f[who], (tx) => q(tx, operation === 'insert' ? insert('set_logs', f, id, { session_id: sql`${session}::uuid`, [column]: sql`${f.exerciseT2}::uuid` }) : sql`update set_logs set ${sql.identifier(column)} = ${f.exerciseT2} where id = ${id}`)), 'parent:set_logs_library_check', column, 'set_logs');
    if (operation === 'insert') await as(f[who], (tx) => q(tx, insert('set_logs', f, id, { session_id: sql`${session}::uuid`, [column]: sql`${f.exerciseSystem}::uuid` })));
    for (const exercise of [f.exerciseSystem, f.exerciseT1, f.exerciseT1]) { await as(f[who], (tx) => q(tx, sql`update set_logs set ${sql.identifier(column)} = ${exercise} where id = ${id}`)); expect(await serviceRow('set_logs', id)).toMatchObject({ [column]: exercise }); }
  });
  }
  for (const column of ['session_id', 'client_uuid', 'client_id', 'id', 'physical-delete'] as const) it(`K10 set_logs ua ${column === 'physical-delete' ? 'DELETE' : 'UPDATE'} ${column} live/tombstone`, async () => {
    const f = await buildPrivateFixture(), session = await mkSession(f.t1, f.clientA), id = await row('set_logs', f, { session_id: sql`${session}::uuid` });
    await refusal(f, () => as(f.ua, (tx) => q(tx, column === 'physical-delete' ? sql`delete from set_logs where id = ${id}` : sql`update set_logs set ${sql.identifier(column)} = ${randomUUID()} where id = ${id}`)), column === 'physical-delete' ? 'privilege' : 'immutable', column === 'physical-delete' ? undefined : column, 'set_logs');
    await as(f.ua, (tx) => q(tx, sql`update set_logs set reps = 12, deleted_at = '2026-02-01T00:00:00Z', client_updated_at = '2026-02-02T00:00:00Z' where id = ${id}`));
    expect(await serviceRow('set_logs', id)).toMatchObject({ reps: 12, deleted_at: new Date('2026-02-01T00:00:00Z'), client_updated_at: new Date('2026-02-02T00:00:00Z') });
  });
  for (const table of Object.keys(syncColumns) as SyncTable[]) for (const initial of ['null', 'non-null'] as const) it(`K11 ${table} ua UPSERT client_updated_at stored ${initial}/equal/older/newer`, async () => {
    const f = await buildPrivateFixture(), session = table === 'set_logs' ? await mkSession(f.t1, f.clientA) : undefined, offline = randomUUID(), id = randomUUID();
    const dependency: Record<string, SQL> = session ? { session_id: sql`${session}::uuid` } : {};
    // set_logs declares client_updated_at NOT NULL (schema/tracking.ts; docs/plans/OPEN_DECISIONS.md item 15), so a stored-null
    // set log cannot exist: pin that fact instead of arranging it. The null-safe predicate stays covered by the other five tables.
    if (table === 'set_logs' && initial === 'null') {
      await expectCode(() => svc((tx) => q(tx, insert(table, f, id, { ...dependency, client_uuid: sql`${offline}::uuid`, client_updated_at: sql`null` })), f.t1), '23502');
      return;
    }
    await svc((tx) => q(tx, insert(table, f, id, { ...dependency, client_uuid: sql`${offline}::uuid`, client_updated_at: initial === 'null' ? sql`null` : sql`'2026-01-01T00:00:00Z'::timestamptz` })), f.t1);
    const replay = async (time: string) => as(f.ua, (tx) => q(tx, sql`insert into ${sql.identifier(table)}
      select (jsonb_populate_record(null::${sql.identifier(table)}, to_jsonb(t) || jsonb_build_object('id', ${randomUUID()}::text, 'client_updated_at', ${time}::text) || ${JSON.stringify(table === 'supplement_logs' ? { taken: false } : table === 'workout_sessions' ? { client_note: 'newer', active_seconds: 60 } : table === 'set_logs' ? { reps: 12, note: 'newer' } : table === 'measurement_sets' ? { values: [{ type: 'waist', value: 80, unit: 'cm' }], note: 'newer' } : table === 'progress_photo_sets' ? { poses: [], weight_kg: 79.5, note: 'newer' } : { note: 'newer', free_entry: { text: 'meal' } })}::jsonb)).*
      from ${sql.identifier(table)} t where id = ${id}
      on conflict (tenant_id, client_id, client_uuid) do update set ${sql.join(syncColumns[table].map((column) => sql`${sql.identifier(column)} = excluded.${sql.identifier(column)}`), sql`, `)}
      where excluded.client_updated_at is not null and (${sql.identifier(table)}.client_updated_at is null or ${sql.identifier(table)}.client_updated_at < excluded.client_updated_at) returning id`));
    if (['meal_logs', 'measurement_sets', 'supplement_logs'].includes(table)) {
      const before = await serviceRow(table, id);
      await refusal(f, () => replay('2026-02-01T00:00:00Z'), 'client_update', table === 'supplement_logs' ? 'taken' : 'note', table);
      for (const time of ['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z']) {
        expect(await as(f.ua, tx => q(tx, sql`insert into ${sql.identifier(table)}
          select (jsonb_populate_record(null::${sql.identifier(table)}, to_jsonb(t)
            || jsonb_build_object('id', ${randomUUID()}::text, 'client_updated_at', ${time}::text))).*
          from ${sql.identifier(table)} t where id = ${id}
          on conflict (tenant_id, client_id, client_uuid) do nothing returning id`))).toEqual([]);
        expect(await serviceRow(table, id)).toEqual(before);
      }
      await legal(f.ua, table, id);
      return;
    }
    expect(await replay('2026-02-01T00:00:00Z')).toEqual([{ id }]);
    const afterFirst = await serviceRow(table, id);
    expect(afterFirst).toMatchObject({ client_updated_at: new Date('2026-02-01T00:00:00Z'), ...(table === 'set_logs' ? { reps: 12, note: 'newer' } : table === 'workout_sessions' ? { client_note: 'newer', active_seconds: 60 } : table === 'supplement_logs' ? { taken: false } : { note: 'newer' }) });
    for (const timestamp of ['2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z']) { expect(await replay(timestamp)).toEqual([]); expect(await serviceRow(table, id)).toEqual(afterFirst); }
    expect(await replay('2026-03-01T00:00:00Z')).toEqual([{ id }]); expect(await serviceRow(table, id)).toMatchObject({ client_updated_at: new Date('2026-03-01T00:00:00Z') });
    for (const bad of [sql`'2026-02-01T00:00:00Z'::timestamptz`, sql`null`]) { await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update ${sql.identifier(table)} set client_updated_at = ${bad} where id = ${id}`)), 'monotonic', 'client_updated_at', table); await legal(f.ua, table, id); }
  });
  for (const state of ['scheduled', 'overdue', 'due', 'submitted'] as const) it(`K11 form_submissions ua UPDATE answers sync stored ${state}/null/equal/older/newer`, async () => {
    const f = await buildPrivateFixture(), offline = randomUUID(), id = await row('form_submissions', f, { state: sql`${state}`, client_uuid: sql`${offline}::uuid`, client_updated_at: sql`null` });
    const sync = (time: string) => as(f.ua, async (tx) => {
      const own = await one<{ id: string }>(tx, sql`select id from form_submissions where tenant_id = ${f.t1} and client_id = ${f.clientA} and client_uuid = ${offline}`);
      return q(tx, sql`update form_submissions set answers = '{"answer":"newer"}'::jsonb, missing_required = array[]::text[], state = ${state}, client_updated_at = ${time}::timestamptz
        where id = ${own.id} and ${time}::timestamptz is not null and (client_updated_at is null or client_updated_at < ${time}::timestamptz) returning id`);
    });
    if (state === 'submitted') { await refusal(f, () => sync('2026-02-01T00:00:00Z'), 'editable_in', 'answers', 'form_submissions'); const legalId = await row('form_submissions', f); await legal(f.ua, 'form_submissions', legalId); }
    else { expect(await sync('2026-02-01T00:00:00Z')).toEqual([{ id }]); const before = await serviceRow('form_submissions', id); for (const time of ['2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z']) { expect(await sync(time)).toEqual([]); expect(await serviceRow('form_submissions', id)).toEqual(before); } expect(await sync('2026-03-01T00:00:00Z')).toEqual([{ id }]); expect(await serviceRow('form_submissions', id)).toMatchObject({ answers: { answer: 'newer' }, state, client_updated_at: new Date('2026-03-01T00:00:00Z') }); }
    if (state === 'scheduled' || state === 'overdue') { const proposed = randomUUID(); await refusal(f, () => as(f.ua, (tx) => q(tx, insert('form_submissions', f, proposed, { state: sql`${state}` }))), state === 'scheduled' ? 'client_transitions' : 'transitions', 'state', 'form_submissions'); await as(f.ua, (tx) => q(tx, insert('form_submissions', f, proposed))); expect(await serviceRow('form_submissions', proposed)).toMatchObject({ state: 'due' }); }
  });
  it('K11 form_submissions ua INSERT race 23505 savepoint then UPDATE retry and batch continues', async () => {
    const f = await buildPrivateFixture(), offline = randomUUID(), existing = randomUUID(), photo = await row('progress_photo_sets', f, { client_updated_at: sql`'2026-02-01T00:00:00Z'::timestamptz` });
    const photoBefore = await serviceRow('progress_photo_sets', photo);
    if (!photoBefore) throw new Error('private photo was not inserted');
    await as(f.ua, async (tx) => {
      expect(await q(tx, sql`select id from form_submissions where tenant_id = ${f.t1} and client_id = ${f.clientA} and client_uuid = ${offline}`)).toEqual([]);
      // A second connection wins after the RLS lookup but before this transaction's ordinary INSERT.
      await svc((service) => q(service, insert('form_submissions', f, existing, { client_uuid: sql`${offline}::uuid` })), f.t1);
      const beforeDuplicate = await snapshot(f);
      const duplicate = await expectCode(() => tx.transaction((sp) => q(sp, insert('form_submissions', f, randomUUID(), { client_uuid: sql`${offline}::uuid` }))), '23505'); expect(duplicate.constraint_name).toBe('form_submissions_client_uuid_uq');
      expect(await snapshot(f)).toEqual(beforeDuplicate);
      expect(await one(tx, sql`select id from form_submissions where tenant_id = ${f.t1} and client_id = ${f.clientA} and client_uuid = ${offline}`)).toEqual({ id: existing });
      expect(await q(tx, sql`update form_submissions set answers = '{"retry":true}', missing_required = array[]::text[], state = 'due', client_updated_at = '2026-03-01T00:00:00Z' where id = ${existing}
        and ('2026-03-01T00:00:00Z'::timestamptz is not null) and (client_updated_at is null or client_updated_at < '2026-03-01T00:00:00Z'::timestamptz) returning id`)).toEqual([{ id: existing }]);
      const immutable = await expectGuard(() => tx.transaction((sp) => q(sp, sql`update progress_photo_sets set client_uuid = ${randomUUID()} where id = ${photo}`)), 'immutable', 'client_uuid'); expect(immutable.table_name).toBe('progress_photo_sets');
      const monotonic = await expectGuard(() => tx.transaction((sp) => q(sp, sql`update progress_photo_sets set client_updated_at = '2026-01-01T00:00:00Z' where id = ${photo}`)), 'monotonic', 'client_updated_at'); expect(monotonic.table_name).toBe('progress_photo_sets');
      await q(tx, sql`update progress_photo_sets set note = 'later valid' where id = ${photo}`);
    });
    expect(await serviceRow('form_submissions', existing)).toMatchObject({ answers: { retry: true } }); expect(await serviceRow('progress_photo_sets', photo)).toEqual({ ...photoBefore, note: 'later valid' });
  });
  it('K11 messages ua INSERT sender offline dedupe then separate edit/read', async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), offline = randomUUID();
    const create = () => as(f.ua, (tx) => q(tx, sql`insert into messages (id, tenant_id, conversation_id, sender_user_id, sender_role, body, client_uuid)
      values (${id}, ${f.t1}, ${f.convA}, ${f.ua.userId}, 'client', 'original', ${offline}) on conflict (tenant_id, sender_user_id, client_uuid) do nothing returning id`));
    expect(await create()).toEqual([{ id }]); const before = await serviceRow('messages', id); expect(await create()).toEqual([]); expect(await serviceRow('messages', id)).toEqual(before);
    await as(f.ua, async (tx) => { expect(await one(tx, sql`select id from messages where tenant_id = ${f.t1} and sender_user_id = ${f.ua.userId} and client_uuid = ${offline}`)).toEqual({ id }); await q(tx, sql`update messages set body = 'edited', read_by_client_at = now() where id = ${id}`); });
    expect(await serviceRow('messages', id)).toMatchObject({ body: 'edited', read_by_client_at: expect.any(Date) });
  });
  for (const [who, target, code, column] of [['ua', 'B', '23503', 'form_version_id'], ['s2', 'B', '42501', 'client_id'], ['ua', 'missing', '23503', 'form_version_id'], ['ua', 'draft', '23503', 'form_version_id'], ['s2', 'draft', 'P0001', 'form_version_id']] as const) it(`K12 form_submissions ${who} INSERT ${column} ${target}`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), before = await snapshot(f), version = target === 'B' ? f.copyFormBPub : target === 'missing' ? randomUUID() : f.templateFormDraft;
    const work = () => as(f[who], (tx) => q(tx, insert('form_submissions', f, id, { form_version_id: sql`${version}::uuid` })));
    const error = code === '23503' ? await expectCode(work, code) : await expectGuard(work, 'rule:app.submission_rules', column);
    expect(error).toMatchObject({ code, detail: 'rule:app.submission_rules', table_name: 'form_submissions', column_name: column }); expect(await snapshot(f)).toEqual(before);
    await as(f[who], (tx) => q(tx, insert('form_submissions', f, id, { form_id: sql`${randomUUID()}::uuid`, form_kind: sql`'assessment'` })));
    expect(await serviceRow('form_submissions', id)).toMatchObject({ form_id: f.templateForm, form_kind: 'checkin', form_version_id: f.templateFormPub });
  });
  for (const ownership of ['coach', 'client'] as const) for (const [column, value] of [['bytes', sql`2000`], ['metadata', sql`'{"x":1}'::jsonb`], ['uploaded_at', sql`now()`], ['deleted_at', sql`now()`]] as const) it(`K13 media ua UPDATE ${column} approved ${ownership}-owned`, async () => {
    const f = await buildPrivateFixture();
    await svc((tx) => q(tx, sql`update media set owner_user_id = ${ownership === 'coach' ? f.o1.userId : f.ua.userId}, review_state = 'approved' where tenant_id = ${f.t1} and id = ${f.mediaA}`), f.t1);
      if (ownership === 'coach') await expectNoEffect(f.ua, sql`update media set ${sql.identifier(column)} = ${value} where id = ${f.mediaA}`, 'media', sql`id = ${f.mediaA}`);
      else await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update media set ${sql.identifier(column)} = ${value} where id = ${f.mediaA}`)), 'editable_in', column, 'media');
      const control = await buildPrivateFixture(); await svc((tx) => q(tx, sql`update media set owner_user_id = ${control.o1.userId}, review_state = 'requested' where tenant_id = ${control.t1} and id = ${control.mediaA}`), control.t1);
      await expectNoEffect(control.ub, sql`update media set review_state = 'uploaded', bytes = 2000 where id = ${control.mediaA}`, 'media', sql`id = ${control.mediaA}`);
      await svc((tx) => q(tx, sql`update media set review_state = 'requested' where tenant_id = ${control.t1} and id = ${control.mediaB}`), control.t1);
      await as(control.ub, (tx) => q(tx, sql`update media set review_state = 'uploaded', bytes = 2000 where id = ${control.mediaB}`));
      await as(control.ua, (tx) => q(tx, sql`update media set review_state = 'uploaded', mime_type = 'image/heic', bytes = 2000 where id = ${control.mediaA}`));
      expect(await serviceRow('media', control.mediaA)).toMatchObject({ review_state: 'uploaded', mime_type: 'image/heic', bytes: '2000', owner_user_id: control.o1.userId });
  });
  for (const state of ['uploaded', 'queued_for_review'] as const) it(`K14 media ua UPDATE mime_type ${state}`, async () => {
    const f = await buildPrivateFixture(); await svc((tx) => q(tx, sql`update media set review_state = ${state} where tenant_id = ${f.t1} and id = ${f.mediaA}`), f.t1);
    await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update media set mime_type = 'image/heic' where id = ${f.mediaA}`)), 'editable_in', 'mime_type', 'media');
    await svc((tx) => q(tx, sql`update media set review_state = 'needs_resubmission' where tenant_id = ${f.t1} and id = ${f.mediaA}`), f.t1);
    await as(f.ua, (tx) => q(tx, sql`update media set mime_type = 'image/heic', review_state = 'uploaded' where id = ${f.mediaA}`)); expect(await serviceRow('media', f.mediaA)).toMatchObject({ mime_type: 'image/heic', review_state: 'uploaded' });
  });
  for (const column of ['path', 'bucket', 'purpose', 'client_id', 'owner_user_id', 'kind']) it(`K14 media ua UPDATE ${column} immutable`, async () => {
    const f = await buildPrivateFixture(); await svc((tx) => q(tx, sql`update media set review_state = 'requested' where tenant_id = ${f.t1} and id = ${f.mediaA}`), f.t1);
    const value = column === 'client_id' || column === 'owner_user_id' ? sql`${randomUUID()}::uuid` : sql`${column === 'kind' ? 'photo' : column === 'purpose' ? 'progress_photo' : 'other'}`;
    await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update media set ${sql.identifier(column)} = ${value} where id = ${f.mediaA}`)), 'immutable', column, 'media');
    await as(f.ua, (tx) => q(tx, sql`update media set review_state = 'uploaded', mime_type = 'image/heic' where id = ${f.mediaA}`)); expect(await serviceRow('media', f.mediaA)).toMatchObject({ review_state: 'uploaded' });
  });
  for (const who of ['ua', 'svc'] as const) for (const state of ['verified', 'rejected', 'refunded'] as const) it(`K15 media ${who} UPDATE deleted_at linked payment ${state}`, async () => {
    const f = await buildPrivateFixture(); await svc((tx) => q(tx, sql`update payments set state = ${state}, proof_media_id = ${f.mediaA}, refund_amount = ${state === 'refunded' ? 100 : null} where tenant_id = ${f.t1} and id = ${f.payA}`), f.t1);
    const run = <T>(fn: (tx: Tx) => Promise<T>) => who === 'svc' ? svc(fn, f.t1) : as(f.ua, fn);
    await refusal(f, () => run((tx) => q(tx, sql`update media set deleted_at = now() where id = ${f.mediaA}`)), 'rule:app.media_proof_rules', 'deleted_at', 'media');
    await svc((tx) => q(tx, sql`update payments set state = 'pending', refund_amount = null where tenant_id = ${f.t1} and id = ${f.payA}`), f.t1);
    await run((tx) => q(tx, sql`update media set deleted_at = '2026-01-01T00:00:00Z' where id = ${f.mediaA}`)); expect(await serviceRow('media', f.mediaA)).toMatchObject({ deleted_at: new Date('2026-01-01T00:00:00Z') });
    if (who === 'ua') for (const value of [sql`now()`, sql`null`]) { await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update media set deleted_at = ${value} where id = ${f.mediaA}`)), 'set_once', 'deleted_at', 'media'); await as(f.ua, (tx) => q(tx, sql`select id from media where id = ${f.mediaA}`)); }
  });
  for (const who of ['ua', 's1', 's2', 'o1', 'o2'] as const) it(`K21 consents ${who} SELECT exact shared scope`, async () => {
    const expected = who === 'ua' ? [fx.consentA] : who === 's1' ? [fx.consentA, fx.consentS1] : who === 'o2' ? [] : [fx.consentA, fx.consentB, fx.consentS1];
    expect((await as(fx[who], (tx) => q<{ id: string }>(tx, sql`select id from consents`))).map((r) => r.id).sort()).toEqual(expected.sort());
    const users = await as(fx[who], (tx) => q<{ id: string }>(tx, sql`select app.accessible_user_ids() as id`));
    const team = [fx.o1.userId, fx.s1.userId, fx.s2.userId, fx.sx.userId];
    const expectedUsers = who === 'ua' ? [fx.ua.userId] : who === 's1' ? [...team, fx.ua.userId] : who === 'o2' ? [fx.o2.userId, fx.o1.userId, fx.uc.userId, fx.ub.userId] : [...team, fx.ua.userId, fx.ub.userId];
    expect(users.map((r) => r.id).sort()).toEqual(expectedUsers.sort());
  });
  it('K21 consents ua INSERT foreign/DELETE and UPDATE withdrawal once', async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), before = await snapshot(f);
    await expectRls(() => as(f.ua, (tx) => q(tx, sql`insert into consents (id, tenant_id, user_id, kind, version, locale) values (${id}, ${f.t1}, ${f.ub.userId}, 'terms', 'v2', 'en')`))); expect(await snapshot(f)).toEqual(before);
    await as(f.ua, (tx) => q(tx, sql`insert into consents (id, tenant_id, user_id, kind, version, locale) values (${id}, ${f.t1}, ${f.ua.userId}, 'terms', 'v2', 'en')`));
    await as(f.ua, async (tx) => { expect(await one(tx, sql`update consents set withdrawn_at = '2099-01-01' where id = ${id} returning withdrawn_at = now() as stamped`)).toEqual({ stamped: true }); });
    for (const value of [sql`now() + interval '1 day'`, sql`null`]) { await refusal(f, () => as(f.ua, (tx) => q(tx, sql`update consents set withdrawn_at = ${value} where id = ${id}`)), 'set_once', 'withdrawn_at', 'consents'); expect(await as(f.ua, (tx) => q(tx, sql`select id from consents where id = ${id}`))).toEqual([{ id }]); }
    await refusal(f, () => as(f.ua, (tx) => q(tx, sql`delete from consents where id = ${id}`)), 'privilege', undefined, 'consents'); expect(await as(f.ua, (tx) => q(tx, sql`select id from consents where id = ${id}`))).toEqual([{ id }]);
  });
  for (const table of ['exercises', 'foods'] as const) for (const operation of ['insert', 'update'] as const) {
    libraryCoverage.add(`${table}.based_on_id:${operation === 'insert' ? 'insert' : 'changed-update'}`); libraryCoverage.add(`${table}.based_on_id:unchanged-update`);
    it(`K22 ${table} s2 ${operation.toUpperCase()} based_on_id foreign/system/same-value`, async () => {
    const f = await buildPrivateFixture(), id = randomUUID(), parent = table === 'exercises' ? f.exerciseSystem : f.foodSystem, foreign = table === 'exercises' ? f.exerciseT2 : f.foodT2;
    const create = (based: string) => table === 'exercises' ? sql`insert into exercises (id, tenant_id, slug, name, category, movement_pattern, difficulty, based_on_id) values (${id}, ${f.t1}, ${id}, '{}', 'strength', 'squat', 'beginner', ${based})` : sql`insert into foods (id, tenant_id, slug, name, category, per_100, based_on_id) values (${id}, ${f.t1}, ${id}, '{}', 'grains', '{"kcal":100,"proteinG":5,"carbsG":15,"fatG":2}', ${based})`;
    if (operation === 'update') await as(f.s2, (tx) => q(tx, create(parent)));
    await refusal(f, () => as(f.s2, (tx) => q(tx, operation === 'insert' ? create(foreign) : sql`update ${sql.identifier(table)} set based_on_id = ${foreign} where id = ${id}`)), 'parent:library_ref_check', 'based_on_id', table);
    if (operation === 'insert') await as(f.s2, (tx) => q(tx, create(parent)));
    expect(await serviceRow(table, id)).toMatchObject({ based_on_id: parent });
    const own = randomUUID();
    await svc((tx) => q(tx, table === 'exercises' ? sql`insert into exercises (id, tenant_id, slug, name, category, movement_pattern, difficulty) values (${own}, ${f.t1}, ${own}, '{}', 'strength', 'squat', 'beginner')` : sql`insert into foods (id, tenant_id, slug, name, category, per_100) values (${own}, ${f.t1}, ${own}, '{}', 'grains', '{"kcal":100,"proteinG":5,"carbsG":15,"fatG":2}')`), f.t1);
    await as(f.s2, (tx) => q(tx, sql`update ${sql.identifier(table)} set based_on_id = ${own} where id = ${id}`));
    await as(f.s2, (tx) => q(tx, sql`update ${sql.identifier(table)} set based_on_id = based_on_id, name = '{"en":"allowed"}' where id = ${id}`)); expect(await serviceRow(table, id)).toMatchObject({ based_on_id: own, name: { en: 'allowed' } });
  });
  }
  it('K22 library checks svc SOURCE coverage includes every table/column INSERT/changed/unchanged call site', () => {
    expect([...libraryCoverage].sort()).toEqual([
      'set_logs.exercise_id:insert', 'set_logs.exercise_id:changed-update', 'set_logs.exercise_id:unchanged-update',
      'set_logs.substituted_for:insert', 'set_logs.substituted_for:changed-update', 'set_logs.substituted_for:unchanged-update',
      'exercises.based_on_id:insert', 'exercises.based_on_id:changed-update', 'exercises.based_on_id:unchanged-update',
      'foods.based_on_id:insert', 'foods.based_on_id:changed-update', 'foods.based_on_id:unchanged-update',
    ].sort());
  });
  for (const layer of ['duplicate', 'kind', 'rls'] as const) it(`K23 tenant_hidden_items ${layer === 'rls' ? 'ua' : 's1'} INSERT ${layer} composite key`, async () => {
    const f = await buildPrivateFixture();
    await as(f.s1, async (tx) => { expect(await one(tx, sql`insert into tenant_hidden_items (tenant_id, kind, item_id) values (${f.t1}, 'exercise', ${f.exerciseSystem}) returning hidden_by, created_at = now() as stamped`)).toEqual({ hidden_by: f.s1.userId, stamped: true }); });
      const actor = layer === 'rls' ? f.ua : f.s1, kind = layer === 'duplicate' ? 'exercise' : layer === 'kind' ? 'x' : 'food';
      const before = await snapshot(f); const work = () => as(actor, (tx) => q(tx, sql`insert into tenant_hidden_items (tenant_id, kind, item_id) values (${f.t1}, ${kind}, ${kind === 'exercise' ? f.exerciseSystem : f.foodSystem})`));
      if (layer === 'rls') await expectRls(work); else { const e = await expectCode(work, layer === 'duplicate' ? '23505' : '23514'); expect(e.constraint_name).toBe(layer === 'duplicate' ? 'tenant_hidden_items_pk' : 'tenant_hidden_items_kind_ck'); } expect(await snapshot(f)).toEqual(before);
      await as(f.s1, (tx) => q(tx, sql`insert into tenant_hidden_items (tenant_id, kind, item_id) values (${f.t1}, 'food', ${f.foodSystem})`));
      expect(await as(actor, (tx) => q(tx, sql`select tenant_id, kind, item_id from tenant_hidden_items order by kind`))).toEqual([{ tenant_id: f.t1, kind: 'exercise', item_id: f.exerciseSystem }, { tenant_id: f.t1, kind: 'food', item_id: f.foodSystem }]);
      expect(await as(actor, (tx) => q(tx, sql`select id from exercises where id = ${f.exerciseSystem}`))).toEqual([{ id: f.exerciseSystem }]);
      await as(f.s1, (tx) => q(tx, sql`delete from tenant_hidden_items where tenant_id = ${f.t1} and kind = 'exercise' and item_id = ${f.exerciseSystem}`));
      expect(await as(f.ua, (tx) => q(tx, sql`select kind, item_id from tenant_hidden_items`))).toEqual([{ kind: 'food', item_id: f.foodSystem }]);
  });
  it('K24 additions svc INSERT bigint/tombstone/based_on and SELECT stored defaults/nulls', async () => {
    const f = await buildPrivateFixture(), session = await mkSession(f.t1, f.clientA), log = await row('set_logs', f, { session_id: sql`${session}::uuid`, deleted_at: sql`'2026-01-01T00:00:00Z'::timestamptz` });
    await svc(async (tx) => {
      await q(tx, sql`update tasks set source_event_id = 5000000000 where tenant_id = ${f.t1} and id = ${f.taskA}`);
      await q(tx, sql`update exercises set based_on_id = ${f.exerciseSystem} where tenant_id = ${f.t1} and id = ${f.exerciseT1}`);
      const food = randomUUID(); await q(tx, sql`insert into foods (id, tenant_id, slug, name, category, per_100, based_on_id) values (${food}, ${f.t1}, ${food}, '{}', 'grains', '{"kcal":100,"proteinG":5,"carbsG":15,"fatG":2}', ${f.foodSystem})`);
      expect(await one(tx, sql`select source_event_id::text as value from tasks where tenant_id = ${f.t1} and id = ${f.taskA}`)).toEqual({ value: '5000000000' });
      expect(await one(tx, sql`select based_on_id from foods where tenant_id = ${f.t1} and id = ${food}`)).toEqual({ based_on_id: f.foodSystem });
      expect(await one(tx, sql`select receipt_counter from tenants where id = ${f.t1}`)).toEqual({ receipt_counter: 0 });
      expect(await one(tx, sql`select search_key from clients where tenant_id = ${f.t1} and id = ${f.clientA}`)).toEqual({ search_key: '' });
      expect(await one(tx, sql`select display_name from invitations where tenant_id = ${f.t1} and id = ${f.invOwnerStaff}`)).toEqual({ display_name: null });
      expect(await one(tx, sql`insert into events (tenant_id, type, aggregate) values (${f.t1}, 'message.sent', 'messages') returning actor_user_id, actor_role`)).toEqual({ actor_user_id: null, actor_role: null });
    }, f.t1);
    expect(await serviceRow('set_logs', log)).toMatchObject({ deleted_at: new Date('2026-01-01T00:00:00Z') }); expect(await serviceRow('exercises', f.exerciseT1)).toMatchObject({ based_on_id: f.exerciseSystem });
    const tenant = await mkTenant(), client = await mkClient(tenant); expect(await serviceRow('clients', client)).toMatchObject({ search_key: '' });
  });
});
