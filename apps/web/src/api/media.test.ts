import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { media } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { setupBillingFixture } from '../server/subscriptions/test-fixture';
import { LocalFsStorage } from '../server/storage';

describe.runIf(Boolean(process.env.DATABASE_URL))('T3b proof upload authorisation', () => {
  let fixture: Awaited<ReturnType<typeof setupBillingFixture>>; let app: (typeof import('./index'))['app'];
  beforeAll(async () => {
    vi.stubEnv('DAWLYY_DEV_LOGIN', '0'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined); vi.stubEnv('NODE_ENV', 'test');
    fixture = await setupBillingFixture(); app = (await import('./index')).app;
  });
  afterAll(async () => { try { await fixture?.cleanup(); } finally { await (await import('@dawlyy/db')).closeDb(); vi.unstubAllEnvs(); } });
  function upload(clientId = fixture.clientId, extra: Record<string, unknown> = {}) {
    return call(app, 'POST', '/api/v1/media/uploads', { as: fixture.owner.userId, body: { clientId, purpose: 'payment_proof', contentType: 'image/png', sizeBytes: 20, filename: '../../ignored.png', ...extra } });
  }
  it('creates an opaque tenant/client proof path and returns only upload instructions', async () => {
    const result = await upload(); expect(result.status).toBe(201);
    const body = result.json as { mediaId: string; upload: { method: string; url: string } }; expect(body.upload.method).toBe('PUT');
    const [row] = await setupApiData(fixture.owner.tenantId, 'inspect proof path', (tx) => tx.select({ path: media.path }).from(media).where(and(eq(media.tenantId, fixture.owner.tenantId), eq(media.id, body.mediaId))));
    expect(row?.path).toMatch(new RegExp(`^${fixture.owner.tenantId}/clients/${fixture.clientId}/payments/[\\da-f-]+\\.png$`));
    const own = await call(app, 'GET', `/api/v1/media/${body.mediaId}/url`, { as: fixture.clientUser }); expect(own.status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/media/${body.mediaId}/url`, { as: fixture.otherClientUser })).status).toBe(404);
    expect((await call(app, 'GET', `/api/v1/media/${randomUUID()}/url`, { as: fixture.owner.userId })).status).toBe(404);
  });
  it('rejects invalid MIME/size, invisible clients and client-role creation', async () => {
    expect((await upload(fixture.clientId, { contentType: 'text/html' })).status).toBe(400);
    expect((await upload(fixture.clientId, { sizeBytes: 8388609 })).status).toBe(400);
    expect((await upload(randomUUID())).status).toBe(404);
    expect((await call(app, 'POST', '/api/v1/media/uploads', { as: fixture.clientUser, body: { clientId: fixture.clientId, purpose: 'payment_proof', contentType: 'image/png', sizeBytes: 20, filename: 'proof.png' } })).status).toBe(403);
  });
  it('receives and downloads local bytes with an RLS check on both transports', async () => {
    const instruction = await upload(); const body = instruction.json as { mediaId: string; upload: { url: string } };
    const bytes = new Uint8Array(20).fill(1);
    const response = await app.request(new Request(new URL(body.upload.url, 'http://localhost'), { method: 'PUT', body: bytes,
      headers: { authorization: `Bearer ${fixture.owner.userId}`, 'content-type': 'image/png' } }));
    expect(response.status).toBe(200);
    try {
      const download = await call(app, 'GET', `/api/v1/media/${body.mediaId}/url`, { as: fixture.clientUser });
      expect(download.status).toBe(200); const url = (download.json as { url: string }).url;
      const read = await app.request(new Request(new URL(url, 'http://localhost'), { headers: { authorization: `Bearer ${fixture.clientUser}` } }));
      expect(read.status).toBe(200); expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes);
      const foreign = await app.request(new Request(new URL(url, 'http://localhost'), { headers: { authorization: `Bearer ${fixture.otherClientUser}` } }));
      expect(foreign.status).toBe(404);
    } finally {
      const [row] = await setupApiData(fixture.owner.tenantId, 'find local proof for removal', (tx) => tx.select({ path: media.path }).from(media).where(and(eq(media.tenantId, fixture.owner.tenantId), eq(media.id, body.mediaId))));
      if (row) await new LocalFsStorage().remove(row.path);
    }
  });
  it('local transport is absent in production and refuses tampered capabilities', async () => {
    const result = await upload(); const body = result.json as { upload: { url: string } };
    const bad = body.upload.url.slice(0, -1) + (body.upload.url.endsWith('a') ? 'b' : 'a');
    expect((await call(app, 'PUT', bad, { as: fixture.owner.userId })).status).toBe(403);
    vi.stubEnv('NODE_ENV', 'production');
    try { expect((await call(app, 'PUT', body.upload.url, { as: fixture.owner.userId })).status).toBe(404); }
    finally { vi.stubEnv('NODE_ENV', 'test'); }
  });
});
