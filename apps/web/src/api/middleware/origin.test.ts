import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { requireSameOrigin } from './origin';

const ownOrigin = 'https://app.example.test';

function fixture() {
  const downstream = vi.fn();
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status);
    throw error;
  });
  app.use('*', requireSameOrigin);
  // Represents downstream auth/validation: refused requests must never reach it.
  app.use('*', async (_c, next) => { downstream(); await next(); });
  app.all('/resource', c => c.json({ ok: true }));
  return { app, downstream };
}

beforeEach(() => {
  vi.stubEnv('DAWLYY_ALLOWED_ORIGINS', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('requireSameOrigin', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('allows a same-origin %s', async method => {
    const { app, downstream } = fixture();
    const response = await app.request(`${ownOrigin}/resource`, { method, headers: { Origin: ownOrigin } });
    expect(response.status).toBe(200);
    expect(downstream).toHaveBeenCalledOnce();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects a foreign-origin %s before downstream work', async method => {
    const { app, downstream } = fixture();
    const response = await app.request(`${ownOrigin}/resource`, { method, headers: { Origin: 'https://evil.example.test' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden', message: 'cross_origin' } });
    expect(downstream).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s with foreign Origin and Fetch Metadata', async method => {
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, {
      method, headers: { Origin: 'https://evil.example.test', 'Sec-Fetch-Site': 'cross-site' },
    })).status).toBe(200);
  });

  it.each(['cross-site', 'same-site', 'unexpected'])('rejects origin-less %s Fetch Metadata', async site => {
    const { app, downstream } = fixture();
    const response = await app.request(`${ownOrigin}/resource`, { method: 'POST', headers: { 'Sec-Fetch-Site': site } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { message: 'cross_origin' } });
    expect(downstream).not.toHaveBeenCalled();
  });

  it.each(['none', 'same-origin'])('allows origin-less %s Fetch Metadata', async site => {
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, { method: 'POST', headers: { 'Sec-Fetch-Site': site } })).status).toBe(200);
  });

  it('allows clients with neither header', async () => {
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, { method: 'POST' })).status).toBe(200);
  });

  it('allows a trimmed entry from the comma-separated origin list', async () => {
    vi.stubEnv('DAWLYY_ALLOWED_ORIGINS', ' https://first.example.test, , https://trusted.example.test ');
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, {
      method: 'POST', headers: { Origin: 'https://trusted.example.test', 'Sec-Fetch-Site': 'cross-site' },
    })).status).toBe(200);
  });

  it('allows NEXT_PUBLIC_APP_URL when the request URL has a different origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://public.example.test');
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, { method: 'POST', headers: { Origin: 'https://public.example.test' } })).status).toBe(200);
  });

  it.each(['null', '', 'https://app.example.test.evil.test', 'https://app.example.test:8443'])('rejects an untrusted Origin %j even with same-origin metadata', async origin => {
    const { app } = fixture();
    expect((await app.request(`${ownOrigin}/resource`, {
      method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' },
    })).status).toBe(403);
  });
});
