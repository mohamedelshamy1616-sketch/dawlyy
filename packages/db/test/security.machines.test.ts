import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { machines, type MachineName } from '@dawlyy/core/state';
import { closeDb, type AuthContext } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership, mkVersion, mkSession } from './factories';
import { as, svc, q, one, expectGuard, expectNoEffect, expectPrivilege, serviceRow } from './helpers';
import { GUARDS } from './guard-matrix';

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
type State = string | null;
type Spec = { id: string; table: string; column: string; states: readonly State[]; actors: readonly ('o1' | 's1' | 's2' | 'ua')[]; core?: MachineName; initial: readonly State[]; clientInitial?: readonly State[] };
const specs: readonly Spec[] = [
{ id: 'X01', table: 'subscriptions', column: 'state', states: ['pending', 'active', 'grace', 'expired', 'paused', 'cancelled', 'suspended'], actors: ['o1'], core: 'subscription', initial: ['pending', 'active'] },
{ id: 'X02', table: 'form_submissions', column: 'state', states: ['scheduled', 'due', 'overdue', 'submitted', 'waiting_for_coach', 'reviewed', 'skipped', 'rescheduled', 'cancelled'], actors: ['s2', 'ua'], core: 'checkin', initial: ['scheduled', 'due', 'submitted'], clientInitial: ['due', 'submitted'] },
{ id: 'X03', table: 'media', column: 'review_state', states: [null, 'requested', 'uploaded', 'processing', 'queued_for_review', 'approved', 'needs_resubmission', 'rejected', 'archived'], actors: ['o1', 's2', 'ua'], core: 'mediaReview', initial: [null, 'requested', 'uploaded'] },
{ id: 'X04', table: 'payments', column: 'state', states: ['pending', 'verified', 'rejected', 'refunded'], actors: ['o1', 's2', 'ua'], core: 'payment', initial: ['pending', 'verified'], clientInitial: ['pending'] },
{ id: 'X05', table: 'invitations', column: 'status', states: ['pending', 'accepted', 'revoked', 'expired'], actors: ['o1', 's1'], initial: ['pending'] },
{ id: 'X06', table: 'calendar_events', column: 'state', states: ['scheduled', 'due', 'overdue', 'completed', 'skipped', 'rescheduled', 'cancelled'], actors: ['s2', 'ua'], initial: ['scheduled', 'due', 'overdue', 'completed', 'skipped', 'rescheduled', 'cancelled'] },
{ id: 'X07', table: 'workout_sessions', column: 'state', states: ['not_started', 'active', 'paused', 'completed', 'partially_completed', 'abandoned', 'skipped'], actors: ['ua'], initial: ['not_started', 'active', 'paused', 'completed', 'partially_completed', 'abandoned', 'skipped'] },
{ id: 'X08', table: 'tasks', column: 'state', states: ['open', 'snoozed', 'done', 'cancelled'], actors: ['o1', 's1'], initial: ['open'] },
{ id: 'X09', table: 'ai_requests', column: 'state', states: ['draft', 'approved', 'rejected'], actors: ['o1', 's2'], initial: ['draft'] },
  ...(['program_versions', 'nutrition_plan_versions', 'form_versions'] as const).map(table => ({ id: 'X10', table, column: 'status', states: ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived'], actors: ['o1', 's2'], core: 'publish', initial: ['draft', 'published'] } satisfies Spec)),
];
async function actor(f: Fixture, name: Spec['actors'][number]): Promise<AuthContext> {
  if (name !== 's2') {
    return f[name];
  }
  return mkMembership(f.s2, { permissions: { client_scope: 'all', modules: { billing: ['manage'], ai: ['publish'], programs: ['publish'], nutrition: ['publish'], forms: ['publish'] } } });
}

async function image(f: Fixture, table: string): Promise<unknown> {
  const tables = [...new Set([table, 'tenants', 'audit_log', 'events', ...(table.endsWith('_versions') ? ['programs', 'nutrition_plans', 'forms'] : [])])];
  return svc(async tx => Promise.all(tables.map(t => q(tx, t === 'tenants'
  ? sql`select to_jsonb(t) as row from tenants t where id in (${f.t1},${f.t2}) order by id`
  : sql`select to_jsonb(t) as row from ${sql.identifier(t)} t where tenant_id in (${f.t1},${f.t2}) order by to_jsonb(t)::text`))));
}

async function prepared(f: Fixture, spec: Spec, ctx: AuthContext, state: State): Promise<string> {
  let id: string;
  switch (spec.table) {
    case 'subscriptions': id = f.subA;
    break;
    case 'payments': id = f.payA;
    break;
    case 'media': id = f.mediaA;
    break;
    case 'invitations': id = f.invS1ClientA;
    break;
    case 'calendar_events': id = f.eventA;
    break;
    case 'tasks': id = f.taskA;
    break;
    case 'workout_sessions': id = await mkSession(f.t1, f.clientA);
    break;
    case 'form_submissions': {
      id = randomUUID();
      await svc(tx => tx.execute(sql`insert into form_submissions
        (id,tenant_id,client_id,form_id,form_version_id,form_kind,state,client_uuid)
        values (${id},${f.t1},${f.clientA},${f.templateForm},${f.templateFormPub},'checkin',${state},${randomUUID()})`));
      return id;
    }
    case 'ai_requests': {
      id = randomUUID();
      await svc(tx => tx.execute(sql`insert into ai_requests (id,tenant_id,client_id,kind,input,created_by,state)
        values (${id},${f.t1},${f.clientA},'program','{}'::jsonb,${ctx.userId},${state})`));
      return id;
    }
    default: {
      const family = spec.table === 'program_versions' ? 'program' : spec.table === 'form_versions' ? 'form' : 'nutrition';
      const version = await mkVersion(f.t1, { family, clientId: f.clientA, status: state === 'published' || state === 'superseded' ? 'published' : 'draft', publishedBy: ctx.userId });
      id = version.versionId;
    }
  }
  await svc(async tx => {
    const extra = spec.table === 'payments' ? sql`, refund_amount = ${state === 'refunded' ? 100 : null},
      verified_at = ${state === 'verified' || state === 'refunded' ? sql`now()` : sql`null`},
      verified_by = ${state === 'verified' || state === 'refunded' ? ctx.userId : null}` : sql``;
    await tx.execute(sql`update ${sql.identifier(spec.table)} set ${sql.identifier(spec.column)}=${state}${extra} where id=${id}`);
  });
  return id;
}

function change(spec: Spec, id: string, state: State, from?: State): SQL {
  return sql`update ${sql.identifier(spec.table)} set ${sql.identifier(spec.column)}=${state}
    ${spec.table === 'payments' && state === 'refunded' && from === 'verified' ? sql`, refund_amount=100` : sql``}
    where id=${id}`;
}

async function write(f: Fixture, spec: Spec, ctx: AuthContext, id: string, from: State, to: State): Promise<void> {
  const before = (await svc(tx=>one<{row:Record<string,unknown>}>(tx,sql`select to_jsonb(t) as row from ${sql.identifier(spec.table)} t where id=${id}`))).row;
  const now = await as(ctx, async tx => {
    const clock = await one<{ now: string }>(tx, sql`select now()::text as now`);
    expect(await q(tx, sql`${change(spec, id, to, from)} returning id`)).toEqual([{ id }]);
    const row = await one<Record<string, unknown>>(tx, sql`select to_jsonb(t) as row from ${sql.identifier(spec.table)} t where id=${id}`);
    const cfg=GUARDS[spec.table]!;
    if (from===to) {
      const columns=new Set(Object.values(cfg.on_transition?.stamps??{}).flatMap(stamps=>Object.keys(stamps)));
      for (const column of columns) expect(await one(tx,sql`select ${sql.identifier(column)} is not distinct from ${before[column]} as exact from ${sql.identifier(spec.table)} where id=${id}`)).toEqual({exact:true});
    } else {
      for (const [column,token] of Object.entries(cfg.on_transition?.stamps[String(to)]??{})) {
        if (token==='now') expect(await one(tx,sql`select ${sql.identifier(column)} = now() as exact from ${sql.identifier(spec.table)} where id=${id}`)).toEqual({exact:true});
      }
    }
    return { now: clock.now, row: row.row as Record<string, unknown> };
  });
  expect(now.row[spec.column]).toBe(to);
  const config = GUARDS[spec.table]!;
  if (from !== to) {
    const stamps = config.on_transition?.stamps[String(to)] ?? {};
    for (const [col, token] of Object.entries(stamps)) {
      const expected = token === 'uid' ? ctx.userId : token === 'null' ? null : token === 'role' ? ctx.role : now.now;
      if (token === 'now') {
        expect(new Date(String(now.row[col])).getTime()).toBe(new Date(String(expected)).getTime());
      }
      else expect(now.row[col]).toEqual(expected);
    }
  } else {
    for (const stamps of Object.values(config.on_transition?.stamps ?? {})) {
      for (const col of Object.keys(stamps)) {
        expect(new Date(String(now.row[col])).getTime() || now.row[col]).toEqual(new Date(String(before?.[col])).getTime() || before?.[col]);
      }
    }
  }
  if (spec.table.endsWith('_versions')) {
    const key = spec.table === 'program_versions' ? 'program_id' : spec.table === 'form_versions' ? 'form_id' : 'plan_id';
    const table = spec.table === 'program_versions' ? 'programs' : spec.table === 'form_versions' ? 'forms' : 'nutrition_plans';
    const head = await serviceRow(table, String(now.row[key]));
    expect(head?.published_version_id).toBe(to === 'published' ? id : null);
  }
  if (spec.table === 'payments' && from === 'pending' && to === 'verified') {
    expect(now.row.verified_by).toBe(ctx.userId);
    expect(new Date(String(now.row.verified_at)).getTime()).toBe(new Date(now.now).getTime());
    expect(now.row.receipt_no).toBe('R-000001');
  }
  expect(f.t1).toBe(ctx.tenantId);
}

async function insertQuery(f: Fixture, spec: Spec, ctx: AuthContext, id: string, state: State): Promise<SQL> {
  switch (spec.table) {
    case 'subscriptions': return sql`insert into subscriptions (id,tenant_id,client_id,package_id,package_snapshot,state,starts_on,ends_on)
      select ${id}::uuid,tenant_id,client_id,package_id,package_snapshot,${state},starts_on,ends_on from subscriptions where id=${f.subA}`;
    case 'payments': return sql`insert into payments(id,tenant_id,client_id,amount,method,state) values(${id},${f.t1},${f.clientA},100,'cash',${state})`;
    case 'media': return sql`insert into media(id,tenant_id,client_id,owner_user_id,bucket,path,kind,purpose,mime_type,review_state)
      values(${id},${f.t1},${f.clientA},${ctx.userId},'client-media',${f.t1+'/clients/'+f.clientA+'/'+id+'.jpg'},'file','payment_proof','image/jpeg',${state})`;
    case 'invitations': return sql`insert into invitations(id,tenant_id,client_id,role,token_hash,invited_by,expires_at,status)
      values(${id},${f.t1},${f.clientA},'client',${id},${ctx.userId},now()+interval '1 day',${state})`;
    case 'tasks': return sql`insert into tasks(id,tenant_id,client_id,title,state) values(${id},${f.t1},${f.clientA},'private',${state})`;
    case 'ai_requests': return sql`insert into ai_requests(id,tenant_id,client_id,kind,input,created_by,state) values(${id},${f.t1},${f.clientA},'program','{}'::jsonb,${ctx.userId},${state})`;
    case 'form_submissions': return sql`insert into form_submissions(id,tenant_id,client_id,form_id,form_version_id,form_kind,state,client_uuid)
      values(${id},${f.t1},${f.clientA},${f.templateForm},${f.templateFormPub},'checkin',${state},${randomUUID()})`;
    default: {
      const family = spec.table === 'program_versions' ? 'program' : spec.table === 'form_versions' ? 'form' : 'nutrition';
      const v = await mkVersion(f.t1, { family, clientId: f.clientA });
      const key = family === 'program' ? 'program_id' : family === 'form' ? 'form_id' : 'plan_id';
      return sql`insert into ${sql.identifier(spec.table)}(id,tenant_id,client_id,${sql.identifier(key)},version_no,status,document)
        select ${id}::uuid,tenant_id,client_id,${sql.identifier(key)},2,${state},document from ${sql.identifier(spec.table)} where id=${v.versionId}`;
    }
  }
}

async function insertState(ctx: AuthContext, spec: Spec, statement: SQL, id: string, state: State): Promise<void> {
  await as(ctx,async tx => {
    await tx.execute(statement);
    const {row}=await one<{row:Record<string,unknown>}>(tx,sql`select to_jsonb(t) as row from ${sql.identifier(spec.table)} t where id=${id}`);
    const cfg=GUARDS[spec.table]!;
    const stamps={...cfg.stamp_insert,...cfg.on_transition?.stamps[String(state)]};
    for (const [column,token] of Object.entries(stamps)) {
      if (token==='now') {
        expect(await one(tx,sql`select ${sql.identifier(column)} = now() as exact from ${sql.identifier(spec.table)} where id=${id}`)).toEqual({exact:true});
      } else expect(row[column]).toBe(token==='uid'?ctx.userId:token==='role'?ctx.role:null);
    }
    if (spec.table==='payments'&&state==='verified') expect(row.receipt_no).toBe('R-000001');
    if (spec.table.endsWith('_versions')) {
      const key=spec.table==='program_versions'?'program_id':spec.table==='form_versions'?'form_id':'plan_id';
      const table=spec.table==='program_versions'?'programs':spec.table==='form_versions'?'forms':'nutrition_plans';
      expect(await one(tx,sql`select published_version_id from ${sql.identifier(table)} where id=${row[key]}`)).toEqual({published_version_id:state==='published'?id:null});
    }
  });
}

describe('ordered database machine contracts', () => {
  for (const spec of specs) {
    if (spec.id !== 'X09') {
      it(`${spec.id} ${spec.table} service SELECT ${spec.column} complete enum vocabulary`, async () => {
        const states = await svc(tx => q<{ state: string }>(tx, sql`select e.enumlabel::text as state from pg_attribute a join pg_enum e on e.enumtypid=a.atttypid where a.attrelid=${'public.'+spec.table}::regclass and a.attname=${spec.column} order by e.enumsortorder`));
        // Vocabulary, not label order: pg_enum order is declaration order (invitation_status declares expired before revoked,
        // schema/enums.ts); the core machine check below keeps the spec order.
        expect(states.map(row => row.state).sort()).toEqual(spec.states.filter(state => state !== null).sort());
      });
    }
    if (spec.core) {
      it(`${spec.id} ${spec.table} service compare ${spec.column} core edge set`, () => {
        const edges = machines[spec.core!].transitions.flatMap(e => e.from.map(from => JSON.stringify([from, e.to]))).sort();
        const expected = GUARDS[spec.table]!.transitions!.edges.filter(([from]) => from !== null).map(e => JSON.stringify(e)).sort();
        expect(edges).toEqual(expected);
        expect(machines[spec.core!].states).toEqual(spec.states.filter(state => state !== null));
        if (spec.id === 'X01') {
          expect(GUARDS.subscriptions!.transitions!.insert).toEqual(['pending', 'active']);
        }
      });
    }
    for (const who of spec.actors) {
      for (const from of spec.states) {
        for (const to of spec.states) {
          it(`${spec.id} ${spec.table} ${who} UPDATE ${spec.column} ${String(from)} -> ${String(to)}`, async () => {
            const f = await buildPrivateFixture();
            const ctx = await actor(f, who);
            const id = await prepared(f, spec, ctx, from);
            const config = GUARDS[spec.table]!;
            const edge = (key: 'transitions' | 'client_transitions') => !config[key] || config[key]!.edges.some(([a, b]) => a === from && b === to);
            let rule: string | undefined;
            if (from !== to) {
              if (spec.id === 'X10' && (from === 'archived' || ((from === 'published' || from === 'superseded') && !edge('transitions')))) {
                rule = 'rule:app.protect_published_version';
              }
              else if (spec.table === 'payments' && who === 'ua' && from === 'pending') {
                rule = 'client_update';
              }
              else if (!edge('transitions')) {
                rule = 'transitions';
              }
              else if (who === 'ua' && !edge('client_transitions')) {
                rule = 'client_transitions';
              }
            }
            if (spec.table === 'payments' && who === 'ua' && from !== 'pending') {
              await expectNoEffect(ctx, change(spec, id, to, from), spec.table, sql`id=${id}`);
            } else if (rule) {
              const before = await image(f, spec.table);
              const error = await expectGuard(as(ctx, tx => tx.execute(change(spec, id, to, from))), rule, spec.column);
              expect(error.table_name).toBe(spec.table);
              expect(error.code).toBe(rule === 'client_update' ? '42501' : 'P0001');
              expect(await image(f, spec.table)).toEqual(before);
            } else {
              await write(f, spec, ctx, id, from, to);
              return;
            }
            const start = spec.table === 'media' ? 'requested' : spec.table === 'form_submissions' ? 'due' : spec.table.endsWith('_versions') ? 'draft' : spec.initial[0]!;
            const next = spec.table === 'calendar_events' ? 'completed' : spec.table === 'workout_sessions' ? 'active' : spec.table === 'payments' && who === 'ua' ? 'pending' : (config.client_transitions && who === 'ua' ? config.client_transitions : config.transitions)?.edges.find(([a]) => a === start)?.[1] ?? start;
            const control = await prepared(f, spec, ctx, start);
            if (spec.table==='payments'&&who==='ua') {
              expect(await as(ctx,tx=>one(tx,sql`update payments set reference='allowed' where id=${control} returning id,reference`))).toEqual({id:control,reference:'allowed'});
              expect(await serviceRow('payments',control)).toMatchObject({state:'pending',reference:'allowed'});
              return;
            }
            await write(f, spec, ctx, control, start, next);
          });
        }
      }
    }
    if (!['calendar_events', 'workout_sessions'].includes(spec.table)) {
      for (const who of spec.actors) {
        for (const state of spec.states) {
          it(`${spec.id} ${spec.table} ${who} INSERT ${spec.column} initial ${String(state)}`, async () => {
            const f = await buildPrivateFixture();
            const ctx = await actor(f, who);
            const id = randomUUID();
            const statement = await insertQuery(f, spec, ctx, id, state);
            const before = await image(f, spec.table);
            const allowed = (who === 'ua' ? spec.clientInitial ?? spec.initial : spec.initial).includes(state);
            if (!allowed) {
              const rule = spec.table === 'payments' && who === 'ua' ? 'client_insert_eq' : spec.table === 'invitations' ? 'insert_eq' : !spec.initial.includes(state) ? 'transitions' : 'client_transitions';
              const error = await expectGuard(as(ctx, tx => tx.execute(statement)), rule, spec.column);
              expect(error.table_name).toBe(spec.table);
              expect(await image(f, spec.table)).toEqual(before);
              expect(await serviceRow(spec.table, id)).toBeUndefined();
              const legal = await insertQuery(f, spec, ctx, id, (who === 'ua' ? spec.clientInitial ?? spec.initial : spec.initial)[0]!);
              await insertState(ctx,spec,legal,id,(who==='ua'?spec.clientInitial??spec.initial:spec.initial)[0]!);
            } else await insertState(ctx,spec,statement,id,state);
            const stored = await serviceRow(spec.table, id);
            expect(stored?.[spec.column]).toBe(allowed ? state : (who === 'ua' ? spec.clientInitial ?? spec.initial : spec.initial)[0]);
          });
        }
      }
    }
  }
  it('X07 job_runs ua UPDATE state pending and session/automation API machines remain distinct', async () => {
    const id = randomUUID();
    await svc(tx => tx.execute(sql`insert into job_runs(id,tenant_id,job) values(${id},${fx.t1},'private')`));
    const before = await serviceRow('job_runs', id);
    const error = await expectPrivilege(as(fx.ua, tx => tx.execute(sql`update job_runs set state='running' where id=${id}`)));
    expect(error.message).toMatch(/table job_runs/i);
    expect(await serviceRow('job_runs', id)).toEqual(before);
    expect(await as(fx.ua, tx => q(tx, sql`select id from clients`))).toEqual([{ id: fx.clientA }]);
    expect(machines.session.states).toEqual(['not_started','active','paused','completed','partially_completed','abandoned','skipped']);
    expect(machines.automationRun.states).toEqual(['pending','running','completed','failed','retrying','cancelled']);
    expect(machines.session.transitions.flatMap(e => e.from.map(from => [from, e.to]))).toEqual([
    ['not_started', 'active'], ['active', 'paused'], ['paused', 'active'], ['active', 'completed'], ['paused', 'completed'], ['active', 'partially_completed'], ['paused', 'partially_completed'], ['active', 'abandoned'], ['paused', 'abandoned'], ['not_started', 'skipped'],
    ]);
    expect(machines.automationRun.transitions.flatMap(e => e.from.map(from => [from, e.to]))).toEqual([
    ['pending', 'running'], ['running', 'completed'], ['running', 'failed'], ['failed', 'retrying'], ['retrying', 'running'], ['pending', 'cancelled'], ['running', 'cancelled'], ['failed', 'cancelled'], ['retrying', 'cancelled'],
    ]);
  });
});
