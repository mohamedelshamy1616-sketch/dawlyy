import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../errors';
import { rateLimit } from './rate-limit';
import { router as invitations } from '../invitations.client';
import { getSessionUser } from '@/src/server/auth';
import { previewInvitation } from '@/src/server/invitations/client-read';

vi.mock('@/src/server/auth', () => ({ getSessionUser: vi.fn() }));
vi.mock('@/src/server/invitations/client-read', () => ({ previewInvitation: vi.fn(), acceptInvitationForUser: vi.fn() }));

function fixture(options: { max?: number; key?: Parameters<typeof rateLimit>[0]['key'] } = {}) {
  let time = 0;
  const reached = vi.fn();
  const app = new Hono();
  app.post('/preview', rateLimit({ windowMs: 60_000, max: options.max ?? 2, now: () => time,
    ...(options.key ? { key: options.key } : {}),
  }), c => { reached(); return c.json({ ok: true }); });
  return {
    reached,
    request: (headers: Record<string, string> = {}) => app.request('/preview', { method: 'POST', headers }),
    advance: (ms: number) => { time += ms; },
  };
}

afterEach(() => { vi.clearAllMocks(); });

describe('rateLimit', () => {
  it('allows the window budget, then returns the standard 429 body without running the handler', async () => {
    const f = fixture({ max: 30 });
    for (let i = 0; i < 30; i++) expect((await f.request()).status).toBe(200);
    const blocked = await f.request();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests' } });
    expect(blocked.headers.get('Retry-After')).toBe('60');
    expect(f.reached).toHaveBeenCalledTimes(30);
  });

  it('keeps a fixed expiry, rounds Retry-After up, and resets at the boundary', async () => {
    const f = fixture({ max: 1 });
    expect((await f.request()).status).toBe(200);
    f.advance(1_001);
    expect((await f.request()).headers.get('Retry-After')).toBe('59');
    f.advance(58_998);
    expect((await f.request()).headers.get('Retry-After')).toBe('1');
    f.advance(1);
    const reset = await f.request();
    expect(reset.status).toBe(200);
    expect(reset.headers.get('Retry-After')).toBeNull();
  });

  it('keys by the trimmed first forwarded address, ignoring later hops and real-ip', async () => {
    const f = fixture({ max: 1 });
    expect((await f.request({ 'x-forwarded-for': ' 192.0.2.1, 192.0.2.2', 'x-real-ip': '192.0.2.3' })).status).toBe(200);
    expect((await f.request({ 'x-forwarded-for': '192.0.2.1, 192.0.2.4', 'x-real-ip': '192.0.2.5' })).status).toBe(429);
    expect((await f.request({ 'x-forwarded-for': '192.0.2.6' })).status).toBe(200);
  });

  it('falls back to real-ip and then local when forwarded addresses are absent or empty', async () => {
    const f = fixture({ max: 1 });
    expect((await f.request({ 'x-real-ip': '192.0.2.1' })).status).toBe(200);
    expect((await f.request({ 'x-forwarded-for': ', 192.0.2.2', 'x-real-ip': '192.0.2.1' })).status).toBe(429);
    expect((await f.request()).status).toBe(200);
    expect((await f.request({ 'x-forwarded-for': ' ', 'x-real-ip': ' ' })).status).toBe(429);
  });

  it('supports a custom key and independent limiter instances', async () => {
    const first = fixture({ max: 1, key: c => c.req.header('x-client') ?? 'fallback' });
    expect((await first.request({ 'x-client': 'a' })).status).toBe(200);
    expect((await first.request({ 'x-client': 'a' })).status).toBe(429);
    expect((await first.request({ 'x-client': 'b' })).status).toBe(200);
    expect((await fixture({ max: 1 }).request()).status).toBe(200);
  });
});

describe('invitation preview limiter placement', () => {
  it('limits POST preview before validation/lookup and leaves acceptance outside the limiter', async () => {
    const app = new Hono();
    app.onError((error, c) => {
      if (error instanceof ApiError) return c.json(error.toBody(), error.status);
      throw error;
    });
    app.route('/invitations', invitations);
    vi.mocked(previewInvitation).mockResolvedValue({ businessName: 'Business', role: 'client', displayName: null, expired: false, status: 'pending' });
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const headers = { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.70' };
    for (let i = 0; i < 30; i++) {
      expect((await app.request('/invitations/preview', { method: 'POST', headers, body: JSON.stringify({ token: 'a'.repeat(43) }) })).status).toBe(200);
    }
    // Malformed JSON would fail validation if the exhausted limiter ran too late.
    const blocked = await app.request('/invitations/preview', { method: 'POST', headers, body: '{' });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ error: { code: 'rate_limited' } });
    expect(blocked.headers.get('Retry-After')).toMatch(/^([1-9]|[1-5]\d|60)$/);
    expect(blocked.headers.get('Cache-Control')).toBe('no-store');
    expect(previewInvitation).toHaveBeenCalledTimes(30);
    expect(getSessionUser).not.toHaveBeenCalled();
    expect((await app.request('/invitations/accept', { method: 'POST', headers, body: '{}' })).status).toBe(401);
    expect((await app.request('/invitations/preview', { headers })).status).toBe(404);
    expect((await app.request('/invitations/preview', {
      method: 'POST', headers: { ...headers, 'x-forwarded-for': '192.0.2.71' }, body: JSON.stringify({ token: 'b'.repeat(43) }),
    })).status).toBe(200);
  });
});
