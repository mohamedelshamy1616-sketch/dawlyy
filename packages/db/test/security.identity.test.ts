import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { ACTIONS, MODULES, PRESETS, isAllowed, hasAction, type StaffPermissions } from '@dawlyy/core/authz';
import { closeDb, withUserTx, type AuthContext, type Tx } from '../src/client';
import { buildFixture, truncateAll, type Fixture } from './fixtures';
import { buildPrivateFixture, mkMembership, mkSession } from './factories';
import { as, svc, q, one } from './helpers';

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
const identitySql = sql`select app.uid() as uid, app.membership_id() as membership_id, app.tenant_id() as tenant_id,
  app.role() as role, app.client_id() as client_id, app.is_staff() as is_staff, app.is_owner() as is_owner, app.is_client() as is_client`;
type Identity = { uid: string; membership_id: string | null; tenant_id: string | null; role: string | null; client_id: string | null; is_staff: boolean; is_owner: boolean; is_client: boolean };
type Pool = ReturnType<typeof import('postgres')['default']>;
const cached = () => globalThis as unknown as { __dawlyyRuntimePool?: Pool; __dawlyyServicePool?: Pool };
const ids = (rows: readonly { id: string }[]) => rows.map(r => r.id).sort();
async function empty(tx: Tx, uid: string): Promise<void> {
  expect(await one<Identity>(tx, identitySql)).toEqual({ uid, membership_id: null, tenant_id: null, role: null, client_id: null, is_staff: false, is_owner: false, is_client: false });
  expect(await q(tx, sql`select * from app.membership()`)).toEqual([]);
  for (const table of ['clients', 'tenants', 'packages']) {
    expect(await q(tx, sql`select id from ${sql.identifier(table)}`)).toEqual([]);
  }
}
async function scope(ctx: AuthContext): Promise<string[]> {
  return ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select id from clients`)));
}

describe('identity, membership pins and pooled transactions', () => {
  it('I01 runtime ua SELECT membership_id after commit reuses one backend and empty GUC', async () => {
    const previous = process.env.DAWLYY_DB_POOL_MAX;
    await closeDb();
    process.env.DAWLYY_DB_POOL_MAX = '1';
    try {
      const first = await as(fx.ua, tx => one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`));
      const pool = cached().__dawlyyRuntimePool;
      if (!pool) {
        throw new Error('runtime pool was not created');
      }
      for (const discard of [false, true]) {
        if (discard) {
          await pool.unsafe('discard plans');
        }
        const raw = await pool.unsafe<{ pid: number;pin: string }[]>("select pg_backend_pid() as pid,current_setting('app.membership_id',true) as pin");
        expect(raw).toHaveLength(1);
        expect(raw[0]).toEqual({ pid: first.pid, pin: '' });
        await withUserTx(fx.ua.userId, async tx => {
          expect((await one<{ pid: number }>(tx, sql`select pg_backend_pid() as pid`)).pid).toBe(first.pid);
          await empty(tx, fx.ua.userId);
          expect(ids(await q<{ id: string }>(tx, sql`select id from memberships`))).toEqual([fx.ua.membershipId]);
        });
      }
      expect(Number((await svc(tx => one<{ n: string }>(tx, sql`select count(*)::text as n from pg_stat_activity where datname=current_database() and usename='dawlyy_app'`))).n)).toBe(1);
    } finally {
      await closeDb();
      if (previous === undefined) {
        delete process.env.DAWLYY_DB_POOL_MAX;
      }
      else process.env.DAWLYY_DB_POOL_MAX = previous;
    }
  });
  it('I02 memberships o1 SELECT id unpinned and explicit T1/T2 pins', async () => {
    await withUserTx(fx.o1.userId, async tx => {
      await empty(tx, fx.o1.userId);
      expect(ids(await q<{ id: string }>(tx, sql`select id from memberships`))).toEqual([fx.o1.membershipId, fx.o1t2.membershipId].sort());
    });
    expect(await scope(fx.o1)).toEqual([fx.clientA, fx.clientB].sort());
    expect(await scope(fx.o1t2)).toEqual([fx.clientC, fx.clientD].sort());
  });
  it('I03 memberships ua SELECT tenant_id with another user pin and forged request fields', async () => {
    const forged: AuthContext = { ...fx.ua, membershipId: fx.o1.membershipId, role: 'owner', tenantId: fx.t2, permissions: { client_scope: 'all', modules: { billing: ['manage'] } } };
    await as(forged, tx => empty(tx, fx.ua.userId));
    await as({ ...forged, membershipId: fx.ua.membershipId }, async tx => {
      expect(await one<Identity>(tx, identitySql)).toEqual({ uid: fx.ua.userId, membership_id: fx.ua.membershipId, tenant_id: fx.t1, role: 'client', client_id: fx.clientA, is_staff: false, is_owner: false, is_client: true });
      expect(ids(await q<{ id: string }>(tx, sql`select id from clients`))).toEqual([fx.clientA]);
    });
  });
  for (const which of ['sx', 'ubT2', 'invited'] as const) {
    it(`I04 memberships ${which} SELECT id inactive pin and system-library exceptions`, async () => {
      const f = which === 'invited' ? await buildPrivateFixture() : fx;
      const ctx = which === 'invited' ? await mkMembership(f.s2, { status: 'invited' }) : f[which];
      await as(ctx, async tx => {
        await empty(tx, ctx.userId);
        expect(ids(await q<{ id: string }>(tx, sql`select id from memberships`))).toEqual(which === 'ubT2' ? [f.ub.membershipId, f.memBT2].sort() : [ctx.membershipId]);
        expect(ids(await q<{ id: string }>(tx, sql`select id from exercises`))).toEqual([f.exerciseSystem]);
        expect(ids(await q<{ id: string }>(tx, sql`select id from foods`))).toEqual([f.foodSystem]);
      });
      expect(await scope(which === 'ubT2' ? f.ub : f.o1)).toEqual(which === 'ubT2' ? [f.clientB] : [f.clientA, f.clientB].sort());
    });
  }
  it('I05 clients o1t2/o1/o1t2 SELECT id uses the pinned membership every time', async () => {
    for (const [ctx, want] of [[fx.o1t2, [fx.clientC, fx.clientD]], [fx.o1, [fx.clientA, fx.clientB]], [fx.o1t2, [fx.clientC, fx.clientD]]] as const) {
      expect(await scope(ctx)).toEqual([...want].sort());
      expect(ids(await as(ctx, tx => q<{ id: string }>(tx, sql`select id from tenants`)))).toEqual([ctx.tenantId]);
    }
  });
  for (const who of ['o1', 's1', 's2', 'ua', 'sx', 'unpinned', 'unrelated'] as const) {
    it(`I06 identity ${who} SELECT full helper tuple active/inactive context`, async () => {
      const ctx = who === 'unpinned' || who === 'unrelated' ? fx.o1 : fx[who];
      const valid = who !== 'sx' && who !== 'unpinned' && who !== 'unrelated';
      const run = (fn: (tx: Tx) => Promise<Identity>) => who === 'unpinned' ? withUserTx(ctx.userId, fn) : as(who === 'unrelated' ? { ...ctx, membershipId: fx.ua.membershipId } : ctx, fn);
      expect(await run(tx => one<Identity>(tx, identitySql))).toEqual({ uid: ctx.userId, membership_id: valid ? ctx.membershipId : null, tenant_id: valid ? ctx.tenantId : null, role: valid ? ctx.role : null, client_id: valid ? ctx.clientId ?? null : null, is_staff: valid && ctx.role !== 'client', is_owner: valid && ctx.role === 'owner', is_client: valid && ctx.role === 'client' });
    });
  }
  for (const who of ['o1', 's1', 's2', 'ua', 'sx', 'unpinned'] as const) {
    it(`I07 clients ${who} SELECT ACCESS and assignment set`, async () => {
      const ctx = who === 'unpinned' ? fx.o1 : fx[who];
      const run = (fn: (tx: Tx) => Promise<void>) => who === 'unpinned' ? withUserTx(ctx.userId, fn) : as(ctx, fn);
      await run(async tx => {
        const targets = [fx.clientA, fx.clientB, fx.clientC, fx.clientD, null, randomUUID()];
        const actual = [];
        for (const id of targets) {
          actual.push((await one<{ ok: boolean }>(tx, sql`select app.can_access_client(${id}::uuid) as ok`)).ok);
        }
        expect(actual).toEqual(who === 'o1' || who === 's2' ? [true, true, false, false, false, false] : who === 's1' || who === 'ua' ? [true, false, false, false, false, false] : [false, false, false, false, false, false]);
        expect((await one<{ ok: boolean }>(tx, sql`select app.sees_all_clients() as ok`)).ok).toBe(who === 'o1' || who === 's2');
        expect(ids(await q<{ id: string }>(tx, sql`select app.assigned_client_ids() as id`))).toEqual(who === 's1' ? [fx.clientA] : []);
      });
    });
  }
  it('I07 clients private all-scope staff SELECT retains explicit assignment ids', async () => {
    const f = await buildPrivateFixture();
    const ctx = await mkMembership(f.s2, { assignedClientIds: [f.clientA] });
    expect(await as(ctx, tx => q(tx, sql`select app.assigned_client_ids() as id`))).toEqual([{ id: f.clientA }]);
    expect(await scope(ctx)).toEqual([f.clientA, f.clientB].sort());
  });
  for (const who of ['o1', 's2', 's1', 'ua', 'sx', 'unpinned'] as const) {
    it(`I08 memberships ${who} SELECT accessible_user_ids equals single-user checks`, async () => {
      const ctx = who === 'unpinned' ? fx.o1 : fx[who];
      const team = [fx.o1.userId, fx.s1.userId, fx.s2.userId, fx.sx.userId];
      const want = who === 'o1' || who === 's2' ? [...team, fx.ua.userId, fx.ub.userId] : who === 's1' ? [...team, fx.ua.userId] : who === 'ua' ? [fx.ua.userId] : [];
      const run = (fn: (tx: Tx) => Promise<void>) => who === 'unpinned' ? withUserTx(ctx.userId, fn) : as(ctx, fn);
      await run(async tx => {
        expect(ids(await q<{ id: string }>(tx, sql`select app.accessible_user_ids() as id`))).toEqual(want.sort());
        for (const user of [...team, fx.ua.userId, fx.ub.userId, fx.uc.userId, fx.o2.userId]) {
          expect((await one<{ ok: boolean }>(tx, sql`select app.can_access_user(${user}::uuid) as ok`)).ok).toBe(want.includes(user));
        }
      });
    });
  }
  it('I09 runtime ua SELECT timeouts are transaction-local and service reason is retained', async () => {
    const settings = sql`select current_user::text as role,current_setting('statement_timeout') as statement,current_setting('lock_timeout') as lock,current_setting('idle_in_transaction_session_timeout') as idle`;
    const original = await svc(tx => one(tx, settings));
    const expected = { role: 'dawlyy_rls', statement: '15s', lock: '5s', idle: '30s' };
    expect(await as(fx.ua, tx => one(tx, settings))).toEqual(expected);
    expect(await withUserTx(fx.ua.userId, tx => one(tx, settings))).toEqual(expected);
    expect(await svc(tx => one(tx, settings))).toEqual(original);
    expect(await svc(tx => one(tx, sql`select current_setting('app.service_reason') as reason`))).toEqual({ reason: 'security test' });
    const pool = cached().__dawlyyRuntimePool;
    if (!pool) {
      throw new Error('runtime pool missing');
    }
    const raw = await pool.unsafe<{ role: string;statement: string;lock: string;idle: string }[]>("select current_user::text as role,current_setting('statement_timeout') as statement,current_setting('lock_timeout') as lock,current_setting('idle_in_transaction_session_timeout') as idle");
    expect(raw[0]?.role).toBe('dawlyy_app');
    expect(raw[0]).not.toEqual(expected);
    const outside = await pool.unsafe<{ name: string;setting: string;reset_val: string }[]>("select name,setting,reset_val from pg_settings where name in ('statement_timeout','lock_timeout','idle_in_transaction_session_timeout') order by name");
    expect(outside).toHaveLength(3);
    for (const setting of outside) {
      expect(setting.setting, setting.name).toBe(setting.reset_val);
    }
  });
  it('I10 set_logs/consents assigned staff EXPLAIN uses uncorrelated scope sets and exact visible rows', async () => {
    const f = await buildPrivateFixture();
    const session = await mkSession(f.t1, f.clientA);
    const log = randomUUID();
    await svc(tx => tx.execute(sql`insert into set_logs(id,tenant_id,client_id,session_id,exercise_id,set_no,client_uuid,client_updated_at)
      values(${log},${f.t1},${f.clientA},${session},${f.exerciseSystem},1,${randomUUID()},now())`));
    for (const [table, fn, want] of [['set_logs', 'assigned_client_ids', [log]], ['consents', 'accessible_user_ids', [f.consentA, f.consentS1]]] as const) {
      await as(f.s1, async tx => {
        expect(ids(await q<{ id: string }>(tx, sql`select id from ${sql.identifier(table)}`))).toEqual([...want].sort());
        const plan = await q(tx, sql`explain (verbose,format json) select count(*) from ${sql.identifier(table)}`);
        const text = JSON.stringify(plan);
        expect(text).toContain(fn);
        expect(text).not.toMatch(/can_access_(?:client|user)/);
        if (table === 'set_logs') {
          expect(text).toContain('sees_all_clients');
          expect(text).toContain('InitPlan');
        }
        const walk = (value: unknown): void => {
          if (Array.isArray(value)) {
            value.forEach(walk);
            return;
          }
          if (!value || typeof value !== 'object') {
            return;
          }
          const node = value as Record<string, unknown>;
          if (String(node['Function Name'] ?? '') === fn || String(node.Output ?? '').includes(fn)) {
            expect(JSON.stringify(node)).not.toMatch(/\$[0-9]+/);
          }
          Object.values(node).forEach(walk);
        };
        walk(plan);
      });
    }
  });
  const presets = Object.keys(PRESETS) as (keyof typeof PRESETS)[];
  const permissionActors = new Map<string, AuthContext>();
  beforeAll(async () => {
    const f = await buildPrivateFixture();
    for (const preset of presets) {
      permissionActors.set(preset, await mkMembership(f.s2, { preset }));
    }
    permissionActors.set('owner', f.o1);
    for (const [name, permissions] of [['absent', { client_scope: 'all', modules: {} }], ['null', null], ['manage', { client_scope: 'all', modules: { billing: ['manage'] } }], ['explicit', { client_scope: 'all', modules: { billing: ['edit'] } }]] as const)
    {
      permissionActors.set(name, await mkMembership(f.s2, { permissions: permissions as StaffPermissions | null }));
    }
  });
  for (const preset of [...presets, 'owner', 'absent', 'null', 'manage', 'explicit']) {
    for (const module of MODULES) {
      for (const action of ACTIONS)
      {
        it(`I11 memberships ${preset} SELECT has_perm ${module}/${action} active`, async () => {
          const ctx = permissionActors.get(preset);
          if (!ctx) {
            throw new Error('permission actor missing');
          }
          const expected = isAllowed(ctx, module, action);
          if (ctx.role === 'staff') {
            expect(expected).toBe(hasAction(ctx.permissions?.modules ?? {}, module, action));
          }
          expect(await as({ ...ctx, permissions: { client_scope: 'all', modules: { [module]: ['manage'] } } }, tx => one(tx, sql`select app.has_perm(${module},${action}) as ok`))).toEqual({ ok: expected });
        });
      }
    }
  }
  it('I11 memberships disabled/client/unpinned SELECT has_perm fails closed including unknown names', async () => {
    for (const ctx of [fx.ua, fx.sx, { ...fx.ua, membershipId: fx.o1.membershipId }]) {
      expect(await as(ctx, tx => one(tx, sql`select app.has_perm('billing','create') as ok`))).toEqual({ ok: false });
    }
    expect(await withUserTx(fx.o1.userId, tx => one(tx, sql`select app.has_perm('billing','create') as ok`))).toEqual({ ok: false });
    expect(await as(fx.o1, tx => one(tx, sql`select app.has_perm('unknown','view') as module,app.has_perm('billing','unknown') as action`))).toEqual({ module: false, action: false });
    expect(await as(fx.o1, tx => one(tx, sql`select app.has_perm('billing','create') as ok`))).toEqual({ ok: true });
  });
  for (const who of ['owner', 'staff', 'client', 'disabled', 'unpinned'] as const) {
    for (const unknown of ['module', 'action'] as const) {
      it(`I11 memberships ${who} SELECT has_perm unknown ${unknown}`, async () => {
        const ctx = who === 'owner' || who === 'unpinned' ? fx.o1 : who === 'client' ? fx.ua : who === 'disabled' ? fx.sx : permissionActors.get('manage');
        if (!ctx) {
          throw new Error('permission actor missing');
        }
        const query = sql`select app.has_perm(${unknown === 'module' ? 'unknown' : 'billing'},${unknown === 'action' ? 'unknown' : 'view'}) as ok`;
        expect(await(who === 'unpinned' ? withUserTx(ctx.userId, tx => one(tx, query)) : as(ctx, tx => one(tx, query)))).toEqual({ ok: false });
      });
    }
  }
  for (const [raw, max] of [[undefined, 10], ['', 10], ['0', 10], ['-1', 10], ['1.5', 10], ['1x', 10], ['1', 1], ['3', 3], ['9007199254740992', 10]] as const)
  {
    it(`I12 client service connect pool max ${String(raw)} -> ${max} after import`, async () => {
      const previous = process.env.DAWLYY_DB_POOL_MAX;
      await closeDb();
      let isolated: typeof import('../src/client') | undefined;
      try {
        vi.resetModules();
        const actual = await vi.importActual<typeof import('postgres')>('postgres');
        const factory = vi.fn(actual.default);
        vi.doMock('postgres', () => ({ ...actual, default: factory }));
        isolated = await import('../src/client');
        if (raw === undefined) {
          delete process.env.DAWLYY_DB_POOL_MAX;
        }
        else process.env.DAWLYY_DB_POOL_MAX = raw;
        await isolated.withServiceTx(null, 'pool options test', async tx => {
          await tx.execute(sql`select 1`);
        });
        expect(factory).toHaveBeenCalledExactlyOnceWith(expect.any(String), { max, prepare: false, idle_timeout: 20, connect_timeout: 10 });
      } finally {
        try {
          await isolated?.closeDb();
          await closeDb();
        } finally {
          vi.doUnmock('postgres');
          vi.resetModules();
          if (previous === undefined) {
            delete process.env.DAWLYY_DB_POOL_MAX;
          }
          else process.env.DAWLYY_DB_POOL_MAX = previous;
        }
      }
    });
  }
});
