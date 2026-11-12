import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { exercises, memberships, clients } from '@dawlyy/db/schema';
import { toCsv } from '@dawlyy/core/csv';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';

const input = { name: { en: 'Tenant squat', ar: 'سكوات خاص' }, category: 'legs', movementPattern: 'squat', difficulty: 'beginner' };
const item = z.object({ id: z.string(), name: z.object({ en: z.string().optional(), ar: z.string().optional() }), hidden: z.boolean(), editable: z.boolean() });
const resultList = z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const csv = (names: string[]) => toCsv(['name_en', 'category', 'difficulty'], names.map((name) => [name, 'legs', 'beginner']));

describe.runIf(Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL_SERVICE))('Task 4 database-backed exercises API', () => {
  let a: Awaited<ReturnType<typeof setupApiFixture>>;
  let b: Awaited<ReturnType<typeof setupApiFixture>>;
  let app: (typeof import('./index'))['app'];
  const systemId = randomUUID();
  const ownId = randomUUID();
  const otherId = randomUUID();
  const staffId = randomUUID();
  const clientId = randomUUID();
  const nameToken = `exercise-test-${randomUUID()}`;
  const asOwner = () => ({ as: a.owner.userId });

  beforeAll(async () => {
    vi.stubEnv('DAWLYY_DEV_LOGIN', '0');
    a = await setupApiFixture(); b = await setupApiFixture();
    await setupApiData(a.owner.tenantId, 'exercise library test fixtures', async (tx) => {
      await tx.insert(exercises).values([
        { ...input, id: systemId, tenantId: null, slug: `system-${systemId}`, name: { en: `${nameToken} system` }, source: 'system' },
        { ...input, id: ownId, tenantId: a.owner.tenantId, slug: ownId, name: { en: `${nameToken} own` }, source: 'coach' },
      ]);
      const memberClientId = randomUUID();
      await tx.insert(clients).values({ id: memberClientId, tenantId: a.owner.tenantId, firstName: 'Exercise test client', code: `EX-${memberClientId}` });
      await tx.insert(memberships).values([
        { tenantId: a.owner.tenantId, userId: staffId, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { exercises: ['view'] } } },
        { tenantId: a.owner.tenantId, userId: clientId, role: 'client', status: 'active', clientId: memberClientId },
      ]);
    });
    await setupApiData(b.owner.tenantId, 'other tenant exercise', async (tx) => {
      await tx.insert(exercises).values({ ...input, id: otherId, tenantId: b.owner.tenantId, slug: otherId, name: { en: `${nameToken} other` }, source: 'coach' });
    });
    app = (await import('./index')).app;
  });
  afterAll(async () => {
    try {
      await a?.cleanup(); await b?.cleanup();
      await setupApiData(null, 'remove only this suite system exercise', async (tx) => { await tx.delete(exercises).where(eq(exercises.id, systemId)); });
    } finally {
      const { closeDb } = await import('@dawlyy/db'); await closeDb(); vi.unstubAllEnvs();
    }
  });
  async function countTenantRows() {
    return setupApiData(a.owner.tenantId, 'count exercise rows for write assertions', async (tx) => {
      const [row] = await tx.select({ count: sql<number>`count(*)::int` }).from(exercises).where(eq(exercises.tenantId, a.owner.tenantId));
      return row?.count ?? 0;
    });
  }

  it('lists system and own rows with no other tenant data', async () => {
    const response = await call(app, 'GET', `/api/v1/exercises?q=${nameToken}`, asOwner());
    expect(response.status).toBe(200);
    const rows = resultList.parse(response.json).items;
    expect(rows.map((row) => row.id).sort()).toEqual([ownId, systemId].sort());
    expect(rows.find((row) => row.id === systemId)?.editable).toBe(false);
    expect(rows.find((row) => row.id === ownId)?.editable).toBe(true);
    expect((await call(app, 'GET', `/api/v1/exercises/${otherId}`, asOwner())).status).toBe(404);
  });
  it('uses a stable cursor with no repeated rows and rejects malformed cursors', async () => {
    const first = resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}&limit=1`, asOwner())).json);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const second = resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}&limit=1&cursor=${first.nextCursor}`, asOwner())).json);
    expect(second.items).toHaveLength(1); expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect((await call(app, 'GET', '/api/v1/exercises?cursor=broken', asOwner())).status).toBe(400);
  });
  it('hides and unhides system rows for tenant A without changing tenant B', async () => {
    expect((await call(app, 'POST', `/api/v1/exercises/${systemId}/hide`, asOwner())).status).toBe(200);
    const listA = resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}`, asOwner())).json);
    const listB = resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}`, { as: b.owner.userId })).json);
    expect(listA.items.some((row) => row.id === systemId)).toBe(false);
    expect(listB.items.some((row) => row.id === systemId)).toBe(true);
    const all = resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}&includeHidden=true`, asOwner())).json);
    expect(all.items.find((row) => row.id === systemId)?.hidden).toBe(true);
    expect((await call(app, 'POST', `/api/v1/exercises/${systemId}/unhide`, asOwner())).status).toBe(200);
    expect(resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}`, asOwner())).json).items.some((row) => row.id === systemId)).toBe(true);
  });
  it('customises a system exercise with its reference and hides the original atomically', async () => {
    const response = await call(app, 'POST', `/api/v1/exercises/${systemId}/customise`, asOwner());
    expect(response.status).toBe(201);
    const copy = z.object({ id: z.string(), basedOnId: z.string(), source: z.string() }).parse(response.json);
    expect(copy.basedOnId).toBe(systemId); expect(copy.source).toBe('coach'); expect(copy.id).not.toBe(systemId);
    await setupApiData(a.owner.tenantId, 'verify exercise copy tenant', async (tx) => {
      const [row] = await tx.select({ tenantId: exercises.tenantId }).from(exercises).where(eq(exercises.id, copy.id));
      expect(row?.tenantId).toBe(a.owner.tenantId);
    });
    expect(resultList.parse((await call(app, 'GET', `/api/v1/exercises?q=${nameToken}`, asOwner())).json).items.some((row) => row.id === systemId)).toBe(false);
  });
  it('refuses PATCH on system rows with system_item_readonly', async () => {
    const response = await call(app, 'PATCH', `/api/v1/exercises/${systemId}`, { ...asOwner(), body: { name: { en: 'Changed' } } });
    expect(response.status).toBe(403);
    expect(response.json).toMatchObject({ error: { code: 'system_item_readonly' } });
  });
  it('rejects server-owned fields and forces coach ownership on valid create', async () => {
    for (const forged of [{ source: 'system' }, { tenant_id: b.owner.tenantId }, { tenantId: b.owner.tenantId }]) {
      expect((await call(app, 'POST', '/api/v1/exercises', { ...asOwner(), body: { ...input, ...forged } })).status).toBe(400);
    }
    const created = await call(app, 'POST', '/api/v1/exercises', { ...asOwner(), body: input });
    expect(created.status).toBe(201); expect(created.json).toMatchObject({ source: 'coach', editable: true });
  });
  it('keeps omitted PATCH fields and supports retiring a coach row', async () => {
    const changed = await call(app, 'PATCH', `/api/v1/exercises/${ownId}`, { ...asOwner(), body: { name: { en: `${nameToken} renamed` } } });
    expect(changed.status).toBe(200); expect(changed.json).toMatchObject({ category: 'legs', difficulty: 'beginner' });
    expect((await call(app, 'POST', `/api/v1/exercises/${ownId}/hide`, asOwner())).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/exercises/${ownId}/unhide`, asOwner())).status).toBe(200);
  });
  it('previews without writing and commits only valid rows once on replay', async () => {
    const before = await countTenantRows();
    const text = csv([`import-a-${randomUUID()}`, `import-b-${randomUUID()}`]);
    const preview = await call(app, 'POST', '/api/v1/exercises/import/preview', { ...asOwner(), body: { csv: text } });
    expect(preview.status).toBe(200); expect(await countTenantRows()).toBe(before);
    const body = { csv: text, mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'skip' };
    const options = { ...asOwner(), body, headers: { 'Idempotency-Key': randomUUID() } };
    const first = await call(app, 'POST', '/api/v1/exercises/import/commit', options);
    expect(first.status).toBe(200); expect(first.json).toMatchObject({ inserted: 2, skipped: 0, errors: [] });
    expect(await countTenantRows()).toBe(before + 2);
    expect(await call(app, 'POST', '/api/v1/exercises/import/commit', options)).toEqual(first);
    expect(await countTenantRows()).toBe(before + 2);
  });
  // Import receipt contract: replay never repeats inserts, and changed payloads cannot reuse the key.
  it('replays the stored import receipt and rejects a different body with the same key', async () => {
    const before = await countTenantRows();
    const options = { ...asOwner(), headers: { 'Idempotency-Key': randomUUID() }, body: { csv: csv([`receipt-${randomUUID()}`]), mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'import_anyway' } };
    const first = await call(app, 'POST', '/api/v1/exercises/import/commit', options);
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ inserted: 1, skipped: 0, errors: [] });
    expect(await countTenantRows()).toBe(before + 1);

    const replay = await call(app, 'POST', '/api/v1/exercises/import/commit', options);
    expect(replay).toEqual(first);
    expect(await countTenantRows()).toBe(before + 1);

    const conflict = await call(app, 'POST', '/api/v1/exercises/import/commit', { ...options, body: { ...options.body, csv: csv([`changed-${randomUUID()}`]) } });
    expect(conflict.status).toBe(409);
    expect(conflict.json).toMatchObject({ error: { code: 'idempotency_key_reused' } });
    expect(await countTenantRows()).toBe(before + 1);
    expect(await call(app, 'POST', '/api/v1/exercises/import/commit', options)).toEqual(first);
  });
  it('skips duplicates or imports another copy only when explicitly requested', async () => {
    const name = `duplicate-${randomUUID()}`;
    const body = { csv: csv([name, name]), mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'skip' };
    const skipped = await call(app, 'POST', '/api/v1/exercises/import/commit', { ...asOwner(), body, headers: { 'Idempotency-Key': randomUUID() } });
    expect(skipped.json).toMatchObject({ inserted: 1, skipped: 1 });
    const anyway = await call(app, 'POST', '/api/v1/exercises/import/commit', { ...asOwner(), body: { ...body, onDuplicate: 'import_anyway' }, headers: { 'Idempotency-Key': randomUUID() } });
    expect(anyway.json).toMatchObject({ inserted: 2, skipped: 0 });
  });
  it('does not insert twice when first import requests overlap, including import_anyway', async () => {
    const before = await countTenantRows();
    const options = { ...asOwner(), headers: { 'Idempotency-Key': randomUUID() }, body: { csv: csv([`parallel-${randomUUID()}`]), mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'import_anyway' } };
    const [first, second] = await Promise.all([call(app, 'POST', '/api/v1/exercises/import/commit', options), call(app, 'POST', '/api/v1/exercises/import/commit', options)]);
    expect(first.status).toBe(200); expect(second).toEqual(first); expect(await countTenantRows()).toBe(before + 1);
    expect((await call(app, 'POST', '/api/v1/exercises/import/commit', { ...options, body: { ...options.body, csv: csv(['different']) } })).status).toBe(409);
    expect((await call(app, 'POST', '/api/v1/exercises/import/commit', { ...asOwner(), body: options.body })).status).toBe(400);
  });
  it('refuses 2,001 rows without inserting anything', async () => {
    const before = await countTenantRows();
    const response = await call(app, 'POST', '/api/v1/exercises/import/commit', { ...asOwner(), headers: { 'Idempotency-Key': randomUUID() }, body: { csv: csv(Array.from({ length: 2001 }, (_, index) => `too-large-${index}`)), mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'skip' } });
    expect(response.status).toBe(422); expect(response.json).toMatchObject({ error: { code: 'import_too_large' } }); expect(await countTenantRows()).toBe(before);
  });
  it('rejects staff creation without exercises:create before writing', async () => {
    expect((await call(app, 'POST', '/api/v1/exercises', { as: staffId, body: input })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/exercises/import/preview', { as: staffId, body: { csv: csv(['staff']) } })).status).toBe(403);
  });
  it('rejects clients on every coach route', async () => {
    const routes: [string, string, unknown?][] = [
      ['GET', ''], ['GET', `/${systemId}`], ['POST', '', input], ['PATCH', `/${systemId}`, { name: { en: 'No' } }],
      ['POST', `/${systemId}/customise`], ['POST', `/${systemId}/hide`], ['POST', `/${systemId}/unhide`],
      ['GET', '/categories'], ['PUT', '/categories', { categories: ['legs'] }], ['GET', '/import/template'],
      ['POST', '/import/preview', { csv: csv(['No']) }], ['POST', '/import/commit', { csv: csv(['No']), mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'skip' }],
    ];
    for (const [method, path, body] of routes) expect((await call(app, method, `/api/v1/exercises${path}`, { as: clientId, body })).status).toBe(403);
  });
  it('allows only owners to replace configured categories', async () => {
    expect((await call(app, 'PUT', '/api/v1/exercises/categories', { as: staffId, body: { categories: ['custom'] } })).status).toBe(403);
    expect((await call(app, 'PUT', '/api/v1/exercises/categories', { ...asOwner(), body: { categories: ['custom'] } })).status).toBe(200);
    const response = await call(app, 'GET', '/api/v1/exercises/categories', asOwner());
    expect(z.object({ categories: z.array(z.string()) }).parse(response.json).categories).toEqual(expect.arrayContaining(['custom', 'legs']));
  });
  it('requires authentication', async () => {
    expect((await call(app, 'GET', '/api/v1/exercises')).status).toBe(401);
  });
});
