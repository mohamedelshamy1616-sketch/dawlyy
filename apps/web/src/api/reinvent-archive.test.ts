import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { call, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { clientFormOptions } from '../server/clients/service';
import { withAuthTx } from '../server/db';
import { app } from './index';

describe('R0c library archive and restore', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>;
  let staff: string;
  beforeEach(async () => {
    f = await trackingFixture(); staff = randomUUID();
    await setupApiData(f.owner.tenantId, 'archive staff without edit', tx => tx.execute(sql`insert into memberships
      (tenant_id,user_id,role,status,permissions) values (${f.owner.tenantId},${staff},'staff','active',
      '{"client_scope":"all","modules":{}}'::jsonb)`));
  });
  afterEach(async () => { await f?.cleanup(); });

  for (const [table, route] of [['clients', 'clients'], ['packages', 'packages'], ['programs', 'programs'],
    ['nutrition_plans', 'nutrition'], ['forms', 'forms'], ['exercises', 'exercises']] as const) {
    it(`${table}: edit permission, idempotence, attribution and archived-only filter`, async () => {
      const id = table === 'clients' ? f.a.clientId : randomUUID();
      if (table !== 'clients') await setupApiData(f.owner.tenantId, 'archive row', tx => {
        const base = sql`(${id}::uuid,${f.owner.tenantId}::uuid,'{"en":"Archive test"}'::jsonb`;
        if (table === 'packages') return tx.execute(sql`insert into packages (id,tenant_id,name,duration_days,schedule_rules)
          values ${base},30,'{"checkins":[],"workouts":[]}'::jsonb)`);
        if (table === 'exercises') return tx.execute(sql`insert into exercises (id,tenant_id,name,slug,category,movement_pattern,difficulty)
          values ${base},${id},'strength','squat','beginner')`);
        return tx.execute(sql`insert into ${sql.identifier(table)} (id,tenant_id,name,kind${table === 'forms' ? sql`,form_kind` : sql``})
          values ${base},'template'${table === 'forms' ? sql`,'checkin'` : sql``})`);
      });
      for (const operation of ['archive', 'unarchive']) for (const as of [staff, f.a.userId]) {
        expect((await call(app, 'POST', `/api/v1/${route}/${id}/${operation}`, { as })).status).toBe(403);
      }
      const archive = await call(app, 'POST', `/api/v1/${route}/${id}/archive`, { as: f.owner.userId });
      expect(archive.status).toBe(200);
      expect(archive.json).toMatchObject({ id, archivedAt: expect.any(String), archivedBy: f.owner.userId });
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/archive`, { as: f.owner.userId })).json).toEqual(archive.json);
      const live = await call(app, 'GET', `/api/v1/${route}`, { as: f.owner.userId });
      expect(live.status).toBe(200); expect(live.json).not.toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id })]) });
      const archived = await call(app, 'GET', `/api/v1/${route}?archived=true`, { as: f.owner.userId });
      expect(archived.status).toBe(200); expect(archived.json).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id })]) });
      const restored = await call(app, 'POST', `/api/v1/${route}/${id}/unarchive`, { as: f.owner.userId });
      expect(restored.status).toBe(200); expect(restored.json).toMatchObject({ id, archivedAt: null, archivedBy: null });
      expect((await call(app, 'POST', `/api/v1/${route}/${id}/unarchive`, { as: f.owner.userId })).json).toEqual(restored.json);
    });
  }
  for (const grant of ['forms', 'checkins', 'assessments'] as const) {
    it(`${grant}/edit archives and restores only its own form kind`, async () => {
      const tenantId = f.owner.tenantId;
      const permissions = { client_scope: 'all', modules: { [grant]: ['edit'] } };
      await setupApiData(tenantId, 'disjoint form archive permission', tx => tx.execute(sql`
        update memberships set permissions = ${JSON.stringify(permissions)}::jsonb
        where tenant_id = ${tenantId} and user_id = ${staff}`));
      for (const [formKind, requiredModule] of [
        ['intake', 'forms'], ['checkin', 'checkins'], ['assessment', 'assessments'],
      ] as const) {
        const id = randomUUID();
        await setupApiData(tenantId, 'form archive kind fixture', tx => tx.execute(sql`
          insert into forms (id,tenant_id,name,kind,form_kind)
          values (${id},${tenantId},'{"en":"Kind archive"}'::jsonb,'template',${formKind})`));
        const state = async () => {
          const [row] = await setupApiData(tenantId, 'inspect form archive result', tx => tx.execute<{
            archived: boolean; actor: string | null;
          }>(sql`select archived_at is not null as archived, archived_by::text as actor
            from forms where tenant_id = ${tenantId} and id = ${id}`));
          if (!row) throw new Error('Missing archive fixture');
          return row;
        };
        const allowed = grant === requiredModule;
        const archived = await call(app, 'POST', `/api/v1/forms/${id}/archive`, { as: staff });
        expect(archived.status).toBe(allowed ? 200 : 403);
        expect(await state()).toEqual({ archived: allowed, actor: allowed ? staff : null });
        expect((await call(app, 'POST', `/api/v1/forms/${id}/archive`, { as: f.owner.userId })).status).toBe(200);
        const restored = await call(app, 'POST', `/api/v1/forms/${id}/unarchive`, { as: staff });
        expect(restored.status).toBe(allowed ? 200 : 403);
        expect(await state()).toEqual({ archived: !allowed, actor: allowed ? null : f.owner.userId });
      }
    });
  }
  it('system exercises point at the existing tenant hide', async () => {
    const id = randomUUID();
    await setupApiData(null, 'system archive refusal', tx => tx.execute(sql`insert into exercises
      (id,name,slug,category,movement_pattern,difficulty,source) values
      (${id},'{"en":"System"}',${id},'strength','squat','beginner','system')`));
    try {
      for (const action of ['archive', 'unarchive']) {
        const response = await call(app, 'POST', `/api/v1/exercises/${id}/${action}`, { as: f.owner.userId });
        expect(response.status).toBe(422); expect(response.json).toMatchObject({ error: { code: 'system_exercise_use_hide' } });
      }
    } finally { await setupApiData(null, 'remove isolated system fixture', tx => tx.execute(sql`delete from exercises where id = ${id}`)); }
  });

  it('the legacy forms PATCH archive path preserves attribution on repeated writes', async () => {
    const created = await call(app, 'POST', '/api/v1/forms', { as: f.owner.userId, body: { name: { en: 'Weekly' }, formKind: 'checkin' } });
    expect(created.status).toBe(201);
    const id = z.object({ head: z.object({ id: z.string() }) }).parse(created.json).head.id;
    const patch = () => call(app, 'PATCH', `/api/v1/forms/${id}`, { as: f.owner.userId, body: { archived: true } });
    const first = await patch();
    expect(first.status).toBe(200);
    const projection = z.object({ head: z.object({ archivedAt: z.string(), archivedBy: z.string() }) });
    expect(projection.parse(first.json).head).toMatchObject({ archivedBy: f.owner.userId });
    const repeated = await patch();
    expect(repeated.status).toBe(200);
    expect(projection.parse(repeated.json)).toEqual(projection.parse(first.json));
    const restored = await call(app, 'PATCH', `/api/v1/forms/${id}`, { as: f.owner.userId, body: { archived: false } });
    expect(restored.status).toBe(200);
    expect(restored.json).toMatchObject({ head: { archivedAt: null, archivedBy: null } });
  });

  it('package assignment choices omit archived packages and archived-only pages remain stable', async () => {
    const ids: string[] = [];
    for (let n = 0; n < 3; n++) {
      const created = await call(app, 'POST', '/api/v1/packages', { as: f.owner.userId, body: { name: { en: `Package ${n}` }, durationDays: 30 } });
      expect(created.status).toBe(201);
      ids.push(z.object({ id: z.string() }).parse(created.json).id);
    }
    for (const id of ids.slice(0, 2)) expect((await call(app, 'POST', `/api/v1/packages/${id}/archive`, { as: f.owner.userId })).status).toBe(200);
    const options = await withAuthTx(f.owner, tx => clientFormOptions(tx, f.owner, 'create'));
    expect(options.packages.map(row => row.id)).toEqual([ids[2]]);
    const pageSchema = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().nullable() });
    const first = await call(app, 'GET', '/api/v1/packages?archived=true&limit=1', { as: f.owner.userId });
    expect(first.status).toBe(200);
    const firstPage = pageSchema.parse(first.json);
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    const second = await call(app, 'GET', `/api/v1/packages?archived=true&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { as: f.owner.userId });
    expect(second.status).toBe(200);
    const secondPage = pageSchema.parse(second.json);
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect([...firstPage.items, ...secondPage.items].map(row => row.id).sort()).toEqual(ids.slice(0, 2).sort());
  });
});
