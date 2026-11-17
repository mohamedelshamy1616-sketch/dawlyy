import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_MODULES, DEFAULT_CLIENT_MODULES } from '@dawlyy/core/types';
import { createComposerTransport, type FetchLike } from './transport';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const row = (id: string, override: unknown, revokedAt: string | null = null) => ({ id, createdAt: '2026-11-18T10:00:00.000Z', revokedAt, override });
const overridesBody = { packageId: null, entitlements: [], resolved: [], overrides: [
  row('b', { key: 'custom', customKey: 'client_app', enabled: true, modules: { nutrition: false } }),
  row('a', { key: 'chat', enabled: true }),
  row('x', { key: 'chat', enabled: true, modules: { messages: false } }, '2026-11-18T09:00:00.000Z'),
] };

type Call = { url: string; init: RequestInit };
function harness(respond: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetch: FetchLike = (url, init) => { calls.push({ url, init }); return respond(); };
  let n = 0;
  const transport = createComposerTransport({ fetch, newKey: () => `key-${++n}` });
  const header = (i: number, name: string) => (calls[i]!.init.headers as Record<string, string>)[name];
  return { calls, transport, header };
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this test'); })); });
afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); }
});

describe('requests', () => {
  it('uses the exact tenant paths and sends all seven keys', async () => {
    const h = harness(() => json(200, DEFAULT_CLIENT_MODULES));
    expect(await h.transport.getTenantModules()).toEqual({ ok: true, data: DEFAULT_CLIENT_MODULES });
    await h.transport.putTenantModules({ ...DEFAULT_CLIENT_MODULES, nutrition: false });
    expect(h.calls.map(c => [c.init.method, c.url])).toEqual([['GET', '/api/v1/settings/client-modules'], ['PUT', '/api/v1/settings/client-modules']]);
    const body = JSON.parse(h.calls[1]!.init.body as string) as Record<string, boolean>;
    expect(Object.keys(body)).toEqual([...CLIENT_MODULES]);
    expect(body).toEqual({ ...DEFAULT_CLIENT_MODULES, nutrition: false });
    expect(h.header(0, 'Idempotency-Key')).toBeUndefined();
    expect(h.header(1, 'Idempotency-Key')).toBe('key-1');
  });
  it('rejects an incomplete tenant map before any request', () => {
    const h = harness(() => json(200, {}));
    expect(() => h.transport.putTenantModules({ workouts: true } as never)).toThrow();
    expect(h.calls).toHaveLength(0);
  });
  it('encodes the custom key, sends enabled true with modules only, and never an identity or a delete body', async () => {
    const h = harness(() => json(200, overridesBody));
    const put = await h.transport.putClientOverride(CLIENT, { nutrition: false });
    await h.transport.deleteClientOverride(CLIENT);
    await h.transport.getClientOverrides(CLIENT);
    expect(h.calls.map(c => [c.init.method, c.url])).toEqual([
      ['PUT', `/api/v1/clients/${CLIENT}/overrides/custom%3Aclient_app`],
      ['DELETE', `/api/v1/clients/${CLIENT}/overrides/custom%3Aclient_app`],
      ['GET', `/api/v1/clients/${CLIENT}/overrides`],
    ]);
    const body = JSON.parse(h.calls[0]!.init.body as string) as Record<string, unknown>;
    expect(body).toEqual({ enabled: true, modules: { nutrition: false } });
    expect(body).not.toHaveProperty('key');
    expect(body).not.toHaveProperty('customKey');
    expect(h.calls[1]!.init.body).toBeUndefined();
    expect(h.calls[2]!.init.body).toBeUndefined();
    expect(put.ok && put.data.map(r => r.id)).toEqual(['a', 'b']);
  });
  it('projects only live rows', async () => {
    const h = harness(() => json(200, overridesBody));
    const result = await h.transport.getClientOverrides(CLIENT);
    expect(result.ok && result.data.map(r => r.id)).toEqual(['a', 'b']);
    expect(result.ok && Object.keys(result.data[0]!).sort()).toEqual(['createdAt', 'id', 'override']);
  });
});

describe('idempotency keys', () => {
  it('reuses the key for the identical retry after an unknown outcome and drops it once settled', async () => {
    let attempt = 0;
    const h = harness(() => (++attempt === 1 ? Promise.reject(new TypeError('offline')) : json(200, overridesBody)));
    const first = await h.transport.putClientOverride(CLIENT, { nutrition: false });
    expect(first).toMatchObject({ ok: false, kind: 'network', indeterminate: true });
    await h.transport.putClientOverride(CLIENT, { nutrition: false });
    expect(h.header(0, 'Idempotency-Key')).toBe(h.header(1, 'Idempotency-Key'));
    await h.transport.putClientOverride(CLIENT, { nutrition: false });
    expect(h.header(2, 'Idempotency-Key')).not.toBe(h.header(1, 'Idempotency-Key'));
  });
  it('uses a new key when the payload changes, and keeps the old one for its own retry', async () => {
    let attempt = 0;
    const h = harness(() => (++attempt <= 2 ? json(503, { error: { code: 'unavailable', message: 'x' } }) : json(200, overridesBody)));
    await h.transport.putClientOverride(CLIENT, { nutrition: false });
    await h.transport.putClientOverride(CLIENT, { nutrition: true });
    await h.transport.putClientOverride(CLIENT, { nutrition: false });
    expect(h.header(1, 'Idempotency-Key')).not.toBe(h.header(0, 'Idempotency-Key'));
    expect(h.header(2, 'Idempotency-Key')).toBe(h.header(0, 'Idempotency-Key'));
  });
  it('keeps the key while the same request is still in progress', async () => {
    let attempt = 0;
    const h = harness(() => (++attempt === 1 ? json(409, { error: { code: 'idempotency_in_progress', message: 'x' } }) : json(200, overridesBody)));
    const first = await h.transport.deleteClientOverride(CLIENT);
    expect(first).toMatchObject({ ok: false, kind: 'in_progress', indeterminate: true });
    await h.transport.deleteClientOverride(CLIENT);
    expect(h.header(1, 'Idempotency-Key')).toBe(h.header(0, 'Idempotency-Key'));
  });
});

describe('failures', () => {
  it.each([
    [400, 'validation_error', 'validation'], [401, 'unauthenticated', 'unauthenticated'], [403, 'forbidden', 'forbidden'],
    [404, 'not_found', 'not_found'], [422, 'unprocessable', 'unprocessable'], [409, 'conflict', 'conflict'],
  ] as const)('maps %s to a definite %s failure with the code', async (status, code, kind) => {
    const h = harness(() => json(status, { error: { code, message: 'm', details: [] } }));
    const result = await h.transport.putClientOverride(CLIENT, { workouts: false });
    expect(result).toMatchObject({ ok: false, kind, status, code, indeterminate: false });
    // A definite refusal is not a retry: the same payload gets a fresh key.
    await h.transport.putClientOverride(CLIENT, { workouts: false });
    expect(h.header(1, 'Idempotency-Key')).not.toBe(h.header(0, 'Idempotency-Key'));
  });
  it('treats 403 module_disabled and a 5xx or thrown fetch as separate cases', async () => {
    const refused = await harness(() => json(403, { error: { code: 'module_disabled', message: 'm' } })).transport.getTenantModules();
    expect(refused).toMatchObject({ ok: false, kind: 'forbidden', code: 'module_disabled', indeterminate: false });
    const server = await harness(() => json(500, { error: { code: 'internal', message: 'm' } })).transport.deleteClientOverride(CLIENT);
    expect(server).toMatchObject({ ok: false, kind: 'server', indeterminate: true });
    const down = await harness(() => Promise.reject(new Error('down'))).transport.getTenantModules();
    expect(down).toMatchObject({ ok: false, kind: 'network', indeterminate: true });
  });
  it('never calls a success a save when the body cannot be read', async () => {
    const result = await harness(() => json(200, { nothing: true })).transport.putTenantModules(DEFAULT_CLIENT_MODULES);
    expect(result).toMatchObject({ ok: false, kind: 'server', code: 'bad_response', indeterminate: true });
  });
});
