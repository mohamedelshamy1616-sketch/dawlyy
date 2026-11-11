import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@dawlyy/db';
import { Hono } from 'hono';
import { ApiError } from '../errors';
import type { AuthVariables } from './auth';
import { decideAccess, requireActiveAccess, type AccessSubscription } from './access';

// Partial mock: routers imported through ../index read other @dawlyy/db exports (e.g. clientColumns) at module scope.
vi.mock('@dawlyy/db', async (importOriginal) => ({ ...(await importOriginal<typeof import('@dawlyy/db')>()), withAuthTx: vi.fn() }));
vi.mock('@/src/server/auth', () => ({ getAuthContext: vi.fn() }));

const today = '2026-11-08';
const active: AccessSubscription = {
  id: 'subscription-a', state: 'active', startsOn: '2026-11-01', endsOn: today,
  graceEndsOn: null, createdAt: new Date('2026-11-01T00:00:00Z'),
};

describe('decideAccess', () => {
  it('allows inclusive start and end dates', () => {
    expect(decideAccess([active], active.startsOn)).toEqual({ allowed: true });
    expect(decideAccess([active], today)).toEqual({ allowed: true });
  });

  it('denies not-yet-started and stale active subscriptions', () => {
    expect(decideAccess([{ ...active, startsOn: '2026-11-09', endsOn: '2026-12-09' }], today).allowed).toBe(false);
    expect(decideAccess([active], '2026-11-09')).toEqual({
      allowed: false, details: { state: 'active', endsOn: today },
    });
  });

  it('uses explicit inclusive grace dates even if cron has not updated active state', () => {
    for (const state of ['active', 'grace'] as const) {
      const sub = { ...active, state, graceEndsOn: '2026-11-10' };
      expect(decideAccess([sub], '2026-11-10')).toEqual({ allowed: true });
      expect(decideAccess([sub], '2026-11-11').allowed).toBe(false);
    }
    expect(decideAccess([{ ...active, state: 'grace' }], '2026-11-09').allowed).toBe(false);
  });

  it.each(['pending', 'expired', 'paused', 'cancelled', 'suspended'] as const)('denies %s despite a covering window', (state) => {
    expect(decideAccess([{ ...active, state }], today)).toEqual({
      allowed: false, details: { state, endsOn: today },
    });
  });

  it('reports no subscription distinctly', () => {
    expect(decideAccess([], today)).toEqual({ allowed: false, details: { state: null } });
  });

  it('reports the newest created subscription without mutating the input', () => {
    const old = { ...active, state: 'expired' as const, endsOn: '2026-11-01' };
    const latest = { ...active, id: 'subscription-b', state: 'pending' as const, createdAt: new Date('2026-11-07T00:00:00Z') };
    const rows = [old, latest];
    expect(decideAccess(rows, today)).toEqual({ allowed: false, details: { state: 'pending', endsOn: today } });
    expect(rows).toEqual([old, latest]);
  });

  it('allows any covering subscription even when a newer one is pending', () => {
    expect(decideAccess([active, { ...active, state: 'pending', createdAt: new Date('2026-11-07T00:00:00Z') }], today)).toEqual({ allowed: true });
  });

  it('rejects malformed stored dates through the core validator', () => {
    expect(() => decideAccess([{ ...active, endsOn: '2026-02-30' }], today)).toThrow();
  });
});

describe('requireActiveAccess placement', () => {
  it.each(['owner', 'staff'] as const)('lets %s through without a subscription query', async (role) => {
    const { withAuthTx } = await import('@dawlyy/db');
    vi.mocked(withAuthTx).mockClear();
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'u', tenantId: 't', membershipId: 'm', role, permissions: null } satisfies AuthContext);
      await next();
    });
    app.get('/program', requireActiveAccess, (c) => c.json({ ok: true }));
    expect((await app.request('/program')).status).toBe(200);
    expect(withAuthTx).not.toHaveBeenCalled();
  });

  it('fails closed for a client missing clientId and leaves history available', async () => {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'u', tenantId: 't', membershipId: 'm', role: 'client', permissions: null } satisfies AuthContext);
      await next();
    });
    app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: 'unexpected' }, 500));
    app.get('/program', requireActiveAccess, (c) => c.json({ ok: true }));
    app.get('/history', (c) => c.json({ items: [] }));
    const response = await app.request('/program');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: 'access_expired', message: 'Active subscription required', details: { state: null } } });
    expect((await app.request('/history')).status).toBe(200);
  });

  it('denies an expired client program request while history remains available', async () => {
    const { withAuthTx } = await import('@dawlyy/db');
    vi.mocked(withAuthTx).mockResolvedValueOnce(decideAccess([{ ...active, state: 'expired' }], today));
    const app = new Hono<{ Variables: AuthVariables }>();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'u', tenantId: 't', membershipId: 'm', role: 'client', clientId: 'client-a', permissions: null });
      await next();
    });
    app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: 'unexpected' }, 500));
    app.get('/api/v1/me/program', requireActiveAccess, (c) => c.json({ ok: true }));
    app.get('/api/v1/me/history', (c) => c.json({ items: [] }));
    const response = await app.request('/api/v1/me/program');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'access_expired', details: { state: 'expired', endsOn: today } } });
    expect((await app.request('/api/v1/me/history')).status).toBe(200);
  });
});

describe('foundation router preservation', () => {
  it('keeps health and me in the served OpenAPI document', async () => {
    const { app } = await import('../index');
    const response = await app.request('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ paths: { '/api/v1/health': { get: {} }, '/api/v1/me': { get: {} } } });
  });

  it('keeps GET /me authenticated with the original public projection', async () => {
    const { getAuthContext } = await import('@/src/server/auth');
    const { app } = await import('../index');
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const unsigned = await app.request('/api/v1/me');
    expect(unsigned.status).toBe(401);
    expect(await unsigned.json()).toMatchObject({ error: { code: 'unauthenticated' } });
    vi.mocked(getAuthContext).mockResolvedValueOnce({
      userId: 'u', tenantId: 't', membershipId: 'm', role: 'client', clientId: 'client-a', permissions: null,
    });
    const signed = await app.request('/api/v1/me');
    expect(signed.status).toBe(200);
    expect(await signed.json()).toEqual({ userId: 'u', tenantId: 't', membershipId: 'm', role: 'client', clientId: 'client-a' });
  });
});
