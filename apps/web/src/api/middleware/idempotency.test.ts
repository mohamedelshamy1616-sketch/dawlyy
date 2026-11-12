import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthContext } from '@dawlyy/db';
import type { ApiEnv } from '../env';
import { ApiError } from '../errors';
import {
  createIdempotentReplay, hashIdempotencyRequest, idempotencyMiddleware,
  type IdempotencyStore, type StoredReplay,
} from './idempotency';

const auth: AuthContext = {
  userId: 'user-a', tenantId: 'tenant-a', membershipId: 'membership-a', role: 'client',
  clientId: 'client-a', permissions: null,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(beforeResponse: () => Promise<void> = async () => {}) {
  const records = new Map<string, StoredReplay & { createdAt: Date }>();
  const identity = (caller: AuthContext, key: string) => JSON.stringify([caller.tenantId, caller.userId, key]);
  let reads = 0;
  let writes = 0;
  const store: IdempotencyStore = {
    async find(caller, key, newerThan) {
      reads++;
      const row = records.get(identity(caller, key));
      return row && row.createdAt > newerThan ? row : undefined;
    },
    async reserve(caller, key, requestHash, newerThan) {
      const id = identity(caller, key);
      const row = records.get(id);
      if (row && row.createdAt > newerThan) return undefined;
      const createdAt = new Date();
      records.set(id, { requestHash, status: 102, body: null, createdAt });
      return createdAt;
    },
    async release(caller, key, requestHash, reservedAt) {
      const id = identity(caller, key);
      const row = records.get(id);
      if (row?.status === 102 && row.requestHash === requestHash && row.createdAt.getTime() === reservedAt.getTime()) records.delete(id);
    },
    async save(caller, key, record, reservedAt) {
      writes++;
      const id = identity(caller, key);
      const row = records.get(id);
      if (row?.status === 102 && row.requestHash === record.requestHash && row.createdAt.getTime() === reservedAt.getTime()) {
        records.set(id, { ...record, createdAt: new Date() });
      }
    },
  };
  const app = new Hono<ApiEnv>();
  let caller = auth;
  let calls = 0;
  let status: 201 | 409 | 500 = 201;
  app.use('*', idempotencyMiddleware);
  app.use('*', async (c, next) => { c.set('auth', caller); await next(); });
  app.use('*', createIdempotentReplay(store));
  app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: 'unexpected' }, 500));
  app.post('/items', async (c) => {
    calls++;
    const input: unknown = await c.req.json();
    await beforeResponse();
    return c.json({ input, calls }, status);
  });
  app.delete('/items', (c) => { calls++; return c.body(null, 204); });
  app.get('/items', (c) => { calls++; return c.json({ calls }); });
  const request = (body = '{"value":1}', key?: string) => app.request('/items', {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', ...(key === undefined ? {} : { 'Idempotency-Key': key }) },
  });
  return {
    app, records, request, identity,
    calls: () => calls, reads: () => reads, writes: () => writes,
    setCaller: (value: AuthContext) => { caller = value; },
    setStatus: (value: typeof status) => { status = value; },
  };
}

describe('hashIdempotencyRequest', () => {
  const body = Buffer.from('{"value":1}');
  it('hashes a framed method and path followed by exact raw bytes with SHA-256', () => {
    expect(hashIdempotencyRequest('POST', '/items', body)).toBe(
      '77348bf1ad31603d1fcc61d1178c8d66209dbfcfe6aaa3a8770fb02ba4e55c3f',
    );
  });
  it('distinguishes method, path, whitespace and non-UTF8 body bytes', () => {
    const baseline = hashIdempotencyRequest('POST', '/items', body);
    expect(hashIdempotencyRequest('PUT', '/items', body)).not.toBe(baseline);
    expect(hashIdempotencyRequest('POST', '/other', body)).not.toBe(baseline);
    expect(hashIdempotencyRequest('POST', '/items', Buffer.from('{ "value":1}'))).not.toBe(baseline);
    expect(hashIdempotencyRequest('POST', '/items', Buffer.from([255]))).not.toBe(hashIdempotencyRequest('POST', '/items', Buffer.from([254])));
  });
});

describe('idempotent replay with an injected store', () => {
  it('does nothing without a key', async () => {
    const f = fixture();
    expect((await f.request()).status).toBe(201);
    expect((await f.request()).status).toBe(201);
    expect(f.calls()).toBe(2);
    expect(f.reads()).toBe(0);
    expect(f.writes()).toBe(0);
  });

  it('stores and replays JSON and status without consuming the handler request body', async () => {
    const f = fixture();
    const first = await f.request(undefined, 'key');
    const original = await first.json();
    const replay = await f.request(undefined, 'key');
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(original);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(f.calls()).toBe(1);
    expect(f.writes()).toBe(1);
  });

  it('reserves a concurrent key before the handler and replays the unchanged final response', async () => {
    const entered = deferred(); const finish = deferred();
    let handlerCalls = 0;
    const f = fixture(async () => {
      if (++handlerCalls === 1) { entered.resolve(); await finish.promise; }
    });
    const first = f.request(undefined, 'key');
    try {
      await entered.promise;
      const second = await f.request(undefined, 'key');
      expect(second.status).toBe(409);
      expect(await second.json()).toMatchObject({ error: { code: 'idempotency_in_progress' } });
      expect(second.headers.get('Retry-After')).toBe('1');
      expect(second.headers.get('Idempotent-Replayed')).toBeNull();
      expect(f.calls()).toBe(1);
    } finally { finish.resolve(); }
    const original = await first;
    const replay = await f.request(undefined, 'key');
    expect(replay.status).toBe(original.status);
    expect(await replay.json()).toEqual(await original.json());
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(f.calls()).toBe(1);
  });

  it.each([
    { name: 'unexpected exception', error: new Error('handler failed'), status: 500 },
    { name: 'handled API exception', error: new ApiError(403, 'forbidden', 'Denied'), status: 403 },
  ])('releases the key after a $name', async ({ error, status }) => {
    let fail = true;
    const f = fixture(async () => { if (fail) throw error; });
    expect((await f.request(undefined, 'key')).status).toBe(status);
    expect(f.records.size).toBe(0);
    expect(f.writes()).toBe(0);
    fail = false;
    expect((await f.request(undefined, 'key')).status).toBe(201);
    expect(f.calls()).toBe(2);
  });

  it('releases the key after a non-JSON response', async () => {
    const f = fixture(); let calls = 0;
    f.app.post('/text', (c) => { calls++; return c.text('plain response', 201); });
    const request = () => f.app.request('/text', { method: 'POST', headers: { 'Idempotency-Key': 'text' } });
    expect(await (await request()).text()).toBe('plain response');
    expect(f.records.size).toBe(0);
    expect(await (await request()).text()).toBe('plain response');
    expect(calls).toBe(2);
    expect(f.writes()).toBe(0);
  });

  it('takes over a placeholder older than 120 seconds and saves a replayable final response', async () => {
    const f = fixture();
    await f.request(undefined, 'key');
    const id = f.identity(auth, 'key');
    const previous = f.records.get(id)!;
    f.records.set(id, { ...previous, status: 102, body: null, createdAt: new Date(Date.now() - 121_000) });
    const fresh = await f.request(undefined, 'key');
    expect(fresh.status).toBe(201);
    expect(fresh.headers.get('Idempotent-Replayed')).toBeNull();
    const replay = await f.request(undefined, 'key');
    expect(await replay.json()).toEqual(await fresh.json());
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(f.calls()).toBe(2);
  });

  it('does not let a late handler replace the response of a newer reservation', async () => {
    const entered = deferred(); const finish = deferred();
    let handlerCalls = 0;
    const f = fixture(async () => {
      if (++handlerCalls === 1) { entered.resolve(); await finish.promise; }
    });
    const first = f.request(undefined, 'key');
    try {
      await entered.promise;
      const id = f.identity(auth, 'key');
      f.records.set(id, { ...f.records.get(id)!, createdAt: new Date(Date.now() - 121_000) });
      f.setStatus(409);
      const replacement = await f.request(undefined, 'key');
      expect(replacement.status).toBe(409);
      const body = await replacement.json();
      f.setStatus(201);
      finish.resolve();
      expect((await first).status).toBe(201);
      const replay = await f.request(undefined, 'key');
      expect(replay.status).toBe(409);
      expect(await replay.json()).toEqual(body);
      expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
      expect(f.calls()).toBe(2);
    } finally { finish.resolve(); }
  });

  it('rejects replay after a staff module grant is removed', async () => {
    const f = fixture();
    const staff: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'assigned', modules: { forms: ['create', 'edit'] } } };
    f.setCaller(staff);
    expect((await f.request(undefined, 'key')).status).toBe(201);
    f.setCaller({ ...staff, permissions: { client_scope: 'assigned', modules: { forms: ['edit'] } } });
    const replay = await f.request(undefined, 'key');
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({ error: { code: 'idempotency_key_reused' } });
    expect(replay.headers.get('Idempotent-Replayed')).toBeNull();
    expect(f.calls()).toBe(1);
    expect((await f.request(undefined, 'new-key')).status).toBe(201);
    expect(f.calls()).toBe(2);
  });

  it('uses stable JSON for permission keys at every level', async () => {
    const f = fixture();
    f.setCaller({ ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { forms: ['create'], billing: ['view'] }, preset: 'custom' } });
    const first = await f.request(undefined, 'key');
    f.setCaller({ ...auth, role: 'staff', permissions: { preset: 'custom', modules: { billing: ['view'], forms: ['create'] }, client_scope: 'all' } });
    const replay = await f.request(undefined, 'key');
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await first.json());
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(f.calls()).toBe(1);
  });

  it.each([
    { field: 'role', caller: { ...auth, role: 'owner' as const } },
    { field: 'membership', caller: { ...auth, membershipId: 'membership-b' } },
    { field: 'client', caller: { ...auth, clientId: 'client-b' } },
  ])('rejects replay after the $field changes', async ({ caller }) => {
    const f = fixture();
    await f.request(undefined, 'key');
    f.setCaller(caller);
    const replay = await f.request(undefined, 'key');
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({ error: { code: 'idempotency_key_reused' } });
    expect(f.calls()).toBe(1);
  });

  it('rejects a reused key with a different body', async () => {
    const f = fixture();
    await f.request(undefined, 'key');
    const conflict = await f.request('{"value":2}', 'key');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: 'idempotency_key_reused' } });
    expect(f.calls()).toBe(1);
  });

  it('scopes replay to both tenant and user', async () => {
    const f = fixture();
    await f.request(undefined, 'key');
    f.setCaller({ ...auth, userId: 'user-b' });
    expect((await f.request('{"value":2}', 'key')).status).toBe(201);
    f.setCaller({ ...auth, tenantId: 'tenant-b' });
    expect((await f.request('{"value":3}', 'key')).status).toBe(201);
    expect(f.calls()).toBe(3);
  });

  it('rejects keys over 200 characters before querying or handling', async () => {
    const f = fixture();
    const response = await f.request(undefined, 'x'.repeat(201));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(f.calls()).toBe(0);
    expect(f.reads()).toBe(0);
    expect((await f.request(undefined, 'x'.repeat(200))).status).toBe(201);
  });

  it('reuses keys after 24 hours and retains the newly stored response', async () => {
    const f = fixture();
    f.records.set(f.identity(auth, 'old'), {
      requestHash: 'old-hash', status: 201, body: { old: true }, createdAt: new Date(Date.now() - 86_400_001),
    });
    const fresh = await f.request(undefined, 'old');
    const body = await fresh.json();
    const replay = await f.request(undefined, 'old');
    expect(await replay.json()).toEqual(body);
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    expect(f.calls()).toBe(1);
  });

  it('does not store server failures, and stores client errors', async () => {
    const f = fixture();
    f.setStatus(500);
    await f.request(undefined, 'key');
    expect(f.writes()).toBe(0);
    f.setStatus(409);
    await f.request(undefined, 'key');
    expect((await f.request(undefined, 'key')).status).toBe(409);
    expect(f.calls()).toBe(2);
    expect(f.writes()).toBe(1);
  });

  it('supports empty 204 responses and ignores keys on GET', async () => {
    const f = fixture();
    const remove = () => f.app.request('/items', { method: 'DELETE', headers: { 'Idempotency-Key': 'delete-key' } });
    expect((await remove()).status).toBe(204);
    const replay = await remove();
    expect(replay.status).toBe(204);
    expect(await replay.text()).toBe('');
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true');
    const calls = f.calls();
    await f.app.request('/items', { headers: { 'Idempotency-Key': 'delete-key' } });
    expect(f.calls()).toBe(calls + 1);
  });
});
