import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, Tx } from '../server/db';
import type { ApiEnv } from './env';
import { ApiError, notFound } from './errors';
import { ACTIVITY_ENTITY_NAMES } from '../server/activity/types';
import { encodeActivityCursor } from '../server/activity/schemas';

const mock = vi.hoisted(() => ({ getAuth: vi.fn(), withAuthTx: vi.fn(), withServiceTx: vi.fn(), list: vi.fn() }));
vi.mock('@/src/server/auth', () => ({ getAuthContext: mock.getAuth }));
vi.mock('../server/db', () => ({ withAuthTx: mock.withAuthTx, withServiceTx: mock.withServiceTx }));
vi.mock('../server/activity/read', () => ({ listActivity: mock.list }));
import { router } from './activity';
const id = '11111111-1111-4111-8111-111111111111';
const owner: AuthContext = { userId: id, tenantId: id, membershipId: id, role: 'owner', permissions: null };
const staff: AuthContext = { ...owner, role: 'staff', permissions: { client_scope: 'assigned', modules: { clients: ['view'] } } };
const tx = {} as Tx;
function application() {
  const app = new OpenAPIHono<ApiEnv>();
  app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: { code: 'unexpected' } }, 500));
  app.route('/api/v1/activity', router);
  app.get('/api/v1/unrelated', c => c.json({ ok: true }));
  return app;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.getAuth.mockResolvedValue(owner);
  mock.withAuthTx.mockImplementation(async (_auth: AuthContext, callback: (tx: Tx) => Promise<unknown>) => callback(tx));
  mock.withServiceTx.mockImplementation(() => { throw new Error('Service transaction forbidden'); });
  mock.list.mockResolvedValue({ items: [], nextCursor: null });
});

describe('R3b activity GET mounted router with mocked authentication/read boundary', () => {
  it('requires auth, rejects client roles and missing clients view before transactions', async () => {
    const app = application();
    mock.getAuth.mockResolvedValue(null);
    expect((await app.request('/api/v1/activity')).status).toBe(401);
    mock.getAuth.mockResolvedValue({ ...owner, role: 'client', clientId: id });
    expect((await app.request('/api/v1/activity')).status).toBe(403);
    mock.getAuth.mockResolvedValue({ ...staff, permissions: { client_scope: 'assigned', modules: {} } });
    const forbidden = await app.request('/api/v1/activity?entity=untrusted');
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: 'forbidden' } });
    expect(mock.withAuthTx).not.toHaveBeenCalled();
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('passes the real authenticated staff scope unchanged into the read and is private/no-store', async () => {
    mock.getAuth.mockResolvedValue(staff);
    const response = await application().request('/api/v1/activity?clientId=' + id + '&entity=clients&limit=1');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
    expect(mock.withAuthTx).toHaveBeenCalledWith(staff, expect.any(Function));
    expect(mock.list).toHaveBeenCalledWith(tx, staff, { clientId: id, entity: 'clients', limit: '1' });
    expect(mock.withServiceTx).not.toHaveBeenCalled();
  });
  it.each([
    'unknown=x', 'clientId=bad', 'entity=memberships', 'entity=clients%3Bdrop', 'entity=',
    'limit=0', 'limit=101', 'limit=-1', 'limit=1.5', 'limit=01', 'limit=NaN', 'limit=',
    'cursor=bad', 'limit=1&limit=2', 'clientId=' + id + '&clientId=' + id,
  ])('strictly rejects malformed or unknown query %s without querying', async query => {
    const response = await application().request('/api/v1/activity?' + query);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(mock.withAuthTx).not.toHaveBeenCalled();
  });
  it('accepts all registered entity filters and both limit bounds', async () => {
    const app = application();
    for (const entity of ACTIVITY_ENTITY_NAMES) expect((await app.request('/api/v1/activity?entity=' + entity)).status).toBe(200);
    for (const limit of ['1', '100']) expect((await app.request('/api/v1/activity?limit=' + limit)).status).toBe(200);
  });
  it('rejects filter/cursor mismatch before entering the transaction', async () => {
    const cursor = encodeActivityCursor({ id: '9007199254740993', createdAt: '2026-11-15T00:00:00.123456Z' }, { entity: 'clients' });
    const response = await application().request('/api/v1/activity?entity=payments&cursor=' + cursor);
    expect(response.status).toBe(400);
    expect(mock.withAuthTx).not.toHaveBeenCalled();
  });
  it('preserves the inaccessible client 404 standard envelope', async () => {
    mock.list.mockRejectedValue(notFound());
    const response = await application().request('/api/v1/activity?clientId=' + id);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'not_found', message: 'Resource not found' } });
  });
  it('does not capture unrelated routes and has no mutation handlers', async () => {
    const app = application();
    mock.getAuth.mockResolvedValue(null);
    const unrelated = await app.request('/api/v1/unrelated');
    expect(unrelated.status).toBe(200);
    expect(mock.getAuth).not.toHaveBeenCalled();
    mock.getAuth.mockResolvedValue(owner);
    expect((await app.request('/api/v1/activity', { method: 'POST' })).status).toBe(404);
    expect(mock.list).not.toHaveBeenCalled();
    expect(mock.withAuthTx).not.toHaveBeenCalled();
  });
});
