import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ApiEnv } from '../env';
import { ApiError } from '../errors';
import { createIdempotentReplay, idempotencyMiddleware, type IdempotencyStore, type StoredReplay } from './idempotency';

const JSON_LIMIT = 1024 * 1024;
const MEDIA_LIMIT = 8 * 1024 * 1024;
function fixture() {
  let record: (StoredReplay & { createdAt: Date }) | undefined;
  const reserve = vi.fn<IdempotencyStore['reserve']>(async (_auth, _key, requestHash) => {
    if (record) return undefined;
    const createdAt = new Date(); record = { requestHash, status: 102, body: null, createdAt }; return createdAt;
  });
  const store: IdempotencyStore = { reserve, find: async () => record, release: async () => { record = undefined; },
    save: async (_auth, _key, value) => { record = { ...value, createdAt: new Date() }; } };
  const app = new Hono<ApiEnv>(); const handler = vi.fn();
  app.use('*', idempotencyMiddleware);
  app.use('*', async (c, next) => { c.set('auth', { userId: 'u', tenantId: 't', membershipId: 'm', role: 'owner', permissions: null }); await next(); });
  app.use('*', createIdempotentReplay(store));
  app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: 'unexpected' }, 500));
  app.post('/items', async c => { handler(); return c.json(await c.req.json(), 201); });
  app.put('/api/v1/media/local-upload/:token', async c => { handler(); return c.json({ length: (await c.req.arrayBuffer()).byteLength }); });
  return { app, handler, reserve };
}
function streamRequest(path: string, limit: number, lengthHeader: boolean, key = true) {
  let pulls = 0; const cancelled = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(64 * 1024)); if (pulls === 200) controller.close(); },
    cancel: cancelled,
  }, { highWaterMark: 0 });
  const request = new Request(`http://localhost${path}`, { method: path === '/items' ? 'POST' : 'PUT', body,
    headers: { 'Content-Type': 'application/json', ...(lengthHeader ? { 'Content-Length': String(limit + 1) } : {}),
      ...(key ? { 'Idempotency-Key': 'large' } : {}) }, duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  return { request, cancelled, pulls: () => pulls };
}
describe('N4 bounded body reading before idempotency and handlers', () => {
  for (const declared of [true, false]) for (const key of [true, false]) it(`oversized JSON: Content-Length=${declared}, key=${key}`, async () => {
    const f = fixture(); const input = streamRequest('/items', JSON_LIMIT, declared, key);
    const clone = vi.spyOn(input.request, 'clone');
    const response = await f.app.request(input.request);
    expect(response.status).toBe(413);
    expect(f.handler).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled();
    expect(input.cancelled).toHaveBeenCalled();
    expect(input.pulls()).toBeLessThanOrEqual(declared ? 0 : JSON_LIMIT / (64 * 1024) + 1);
  });
  for (const declared of [true, false]) it(`uses media ceiling for binary uploads: Content-Length=${declared}`, async () => {
    const f = fixture(); const input = streamRequest('/api/v1/media/local-upload/token', MEDIA_LIMIT, declared);
    expect((await f.app.request(input.request)).status).toBe(413);
    expect(f.handler).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled();
    expect(input.cancelled).toHaveBeenCalled(); expect(input.pulls()).toBeLessThanOrEqual(declared ? 0 : MEDIA_LIMIT / (64 * 1024) + 1);
  });
  it('normal JSON still reaches validation and replays the same response', async () => {
    const f = fixture(); const send = () => f.app.request('/items', { method: 'POST', body: '{"value":1}',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'normal' } });
    const first = await send(); expect(first.status).toBe(201); expect(await first.json()).toEqual({ value: 1 });
    const replay = await send(); expect(replay.status).toBe(201); expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await replay.json()).toEqual({ value: 1 }); expect(f.handler).toHaveBeenCalledTimes(1);
  });
  it('counts streamed bytes even when Content-Length claims a small body', async () => {
    const f = fixture(); const input = streamRequest('/items', JSON_LIMIT, false);
    input.request.headers.set('Content-Length', '1');
    expect((await f.app.request(input.request)).status).toBe(413);
    expect(f.handler).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled();
    expect(input.cancelled).toHaveBeenCalled(); expect(input.pulls()).toBe(JSON_LIMIT / (64 * 1024) + 1);
  });
  it('allows a JSON body exactly at the byte ceiling', async () => {
    const f = fixture(); const body = JSON.stringify({ value: 'x'.repeat(JSON_LIMIT - 12) });
    expect(new TextEncoder().encode(body).byteLength).toBe(JSON_LIMIT);
    expect((await f.app.request('/items', { method: 'POST', body,
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(JSON_LIMIT), 'Idempotency-Key': 'boundary' } })).status).toBe(201);
    expect(f.handler).toHaveBeenCalledTimes(1);
  });
  it('permits a binary upload larger than the JSON ceiling', async () => {
    const f = fixture(); const response = await f.app.request('/api/v1/media/local-upload/token', { method: 'PUT',
      body: new Uint8Array(JSON_LIMIT + 1), headers: { 'Content-Type': 'image/jpeg', 'Idempotency-Key': 'upload' } });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ length: JSON_LIMIT + 1 });
    expect(f.handler).toHaveBeenCalledTimes(1);
  });
});
