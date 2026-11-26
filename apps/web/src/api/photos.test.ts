import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { consents, media } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { app } from './index';
import { trackingFixture } from '../server/tracking/test-fixture';

const error = z.object({ error: z.object({ code: z.string() }) });
const set = z.object({ id: z.string(), poses: z.array(z.object({ mediaId: z.string(), url: z.string() })) });
describe('Task 8 photo privacy, consent and media extension', () => {
  let fixture: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined); vi.stubEnv('DAWLYY_DEV_LOGIN', '0'); fixture = await trackingFixture(); });
  afterEach(async () => { try { await fixture?.cleanup(); } finally { vi.unstubAllEnvs(); } });
  async function consent(userId: string, accepted = true, acceptedAt = '2026-11-01T00:00:00Z') {
    await setupApiData(fixture.owner.tenantId, 'photos consent', async tx => { await tx.insert(consents).values({ tenantId: fixture.owner.tenantId, userId, kind: 'photos', version: acceptedAt, locale: 'en', accepted, acceptedAt: new Date(acceptedAt) }); });
  }
  function upload(as: string, clientId: string, purpose = 'progress_photo', contentType = 'image/jpeg') { return call(app, 'POST', '/api/v1/media/uploads', { as, body: { clientId, purpose, contentType, sizeBytes: 20, filename: 'test' } }); }
  async function photo(userId: string, clientId: string) {
    const asset = await upload(userId, clientId); expect(asset.status).toBe(201);
    const mediaId = z.object({ mediaId: z.string() }).parse(asset.json).mediaId;
    const created = await call(app, 'POST', '/api/v1/photos', { as: userId, body: { localDate: '2026-11-01', poses: [{ pose: 'front', mediaId }], clientUuid: randomUUID(), clientUpdatedAt: '2026-11-01T10:00:00Z' } });
    expect(created.status).toBe(201); return set.parse(created.json);
  }
  it('refuses photo set creation and progress uploads without current consent', async () => {
    const result = await upload(fixture.a.userId, fixture.a.clientId); expect(result.status).toBe(403); expect(error.parse(result.json).error.code).toBe('consent_required');
    const created = await call(app, 'POST', '/api/v1/photos', { as: fixture.a.userId, body: { localDate: '2026-11-01', poses: [{ pose: 'front', mediaId: randomUUID() }], clientUuid: randomUUID(), clientUpdatedAt: '2026-11-01T10:00:00Z' } });
    expect(created.status).toBe(403); expect(error.parse(created.json).error.code).toBe('consent_required');
    await consent(fixture.a.userId); await consent(fixture.a.userId, false, '2026-11-02T00:00:00Z');
    expect(error.parse((await upload(fixture.a.userId, fixture.a.clientId)).json).error.code).toBe('consent_required');
  });
  it('keeps B photos and signed URLs invisible to A and soft-deletes own sets', async () => {
    await consent(fixture.a.userId); await consent(fixture.b.userId);
    const b = await photo(fixture.b.userId, fixture.b.clientId);
    expect(b.poses[0]?.url).toContain('/api/v1/media/local-download/');
    expect((await call(app, 'GET', `/api/v1/photos?clientId=${fixture.b.clientId}`, { as: fixture.a.userId })).status).toBe(403);
    expect((await call(app, 'GET', `/api/v1/photos/compare?fromId=${b.id}&toId=${b.id}`, { as: fixture.a.userId })).status).toBe(404);
    expect((await call(app, 'GET', `/api/v1/media/${b.poses[0]?.mediaId}/url`, { as: fixture.a.userId })).status).toBe(404);
    const a = await photo(fixture.a.userId, fixture.a.clientId);
    expect((await call(app, 'DELETE', `/api/v1/photos/${a.id}`, { as: fixture.a.userId })).status).toBe(200);
    expect(z.object({ items: z.array(set) }).parse((await call(app, 'GET', '/api/v1/photos/timeline', { as: fixture.a.userId })).json).items).toHaveLength(0);
    expect((await call(app, 'GET', `/api/v1/media/${a.poses[0]?.mediaId}/url`, { as: fixture.a.userId })).status).toBe(404);
  });
  it('returns no download URL for a zero-byte placeholder photo', async () => {
    await consent(fixture.a.userId);
    const a = await photo(fixture.a.userId, fixture.a.clientId);
    const mediaId = a.poses[0]?.mediaId ?? '';
    await setupApiData(fixture.owner.tenantId, 'photo placeholder', async tx => { await tx.update(media).set({ bytes: 0 }).where(eq(media.id, mediaId)); });
    const listed = z.object({ items: z.array(z.object({ poses: z.array(z.object({ mediaId: z.string(), url: z.string().optional() })) })) })
      .parse((await call(app, 'GET', '/api/v1/photos/timeline', { as: fixture.a.userId })).json);
    expect(listed.items[0]?.poses[0]?.mediaId).toBe(mediaId);
    expect(listed.items[0]?.poses[0]?.url).toBeUndefined();
  });
  it('accepts form videos and progress images, and refuses unknown purposes and proof videos', async () => {
    await consent(fixture.a.userId);
    expect((await upload(fixture.a.userId, fixture.a.clientId, 'form_answer', 'video/mp4')).status).toBe(201);
    expect((await upload(fixture.a.userId, fixture.a.clientId)).status).toBe(201);
    expect((await upload(fixture.a.userId, fixture.a.clientId, 'unknown')).status).toBe(400);
    expect((await upload(fixture.owner.userId, fixture.a.clientId, 'payment_proof', 'video/mp4')).status).toBe(400);
    expect((await upload(fixture.a.userId, fixture.a.clientId, 'payment_proof')).status).toBe(403);
  });
});
