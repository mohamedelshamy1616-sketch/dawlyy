import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutboxDatabase } from './db';
import type { SessionOutbox, SetOutbox } from './queue';
import { MAX_OUTBOX_BATCH_BYTES } from '../../server/request-limits';
import { flushOutbox } from './flush';

function table<T extends { clientUuid: string }>(initial: T[]) {
  const rows = new Map(initial.map(row => [row.clientUuid, row]));
  return { toArray: async () => [...rows.values()], get: async (id: string) => rows.get(id),
    put: async (row: T) => { rows.set(row.clientUuid, row); return row.clientUuid; } };
}
function fixture(count: number, note = 'أ'.repeat(4000)) {
  const sets: SetOutbox[] = Array.from({ length: count }, (_, i) => ({ clientUuid: `set-${i}`,
    clientUpdatedAt: '2026-11-12T10:00:00Z', syncState: 'pending', attempts: 0,
    payload: { clientUuid: `set-${i}`, clientUpdatedAt: '2026-11-12T10:00:00Z', sessionClientUuid: 'session',
      exerciseId: 'exercise', setNo: i + 1, tag: 'working', completed: true, skipped: false, painFlag: false, note } }));
  const setLogs = table(sets); const sessions = table<SessionOutbox>([]);
  const db = { owner: 'owner', sessions, setLogs, transaction: async (...args: unknown[]) => {
    const callback = args.at(-1) as () => Promise<void>; await callback();
  } } as unknown as OutboxDatabase;
  return { db, setLogs };
}
type Batch = { sessions: Array<{ clientUuid: string }>; sets: Array<{ clientUuid: string }> };
function network(respond: (body: Batch, bytes: number) => Response) {
  const sizes: number[] = [];
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/v1/me') return Response.json({ userId: 'owner', role: 'client' });
    const body = String(init?.body); const bytes = new TextEncoder().encode(body).length; sizes.push(bytes);
    return respond(JSON.parse(body) as Batch, bytes);
  }));
  return sizes;
}
const accepted = (body: Batch) => Response.json({ accepted: [...body.sessions, ...body.sets].map(row => row.clientUuid), rejected: [], serverTime: new Date().toISOString() });
afterEach(() => { vi.unstubAllGlobals(); });

describe('P7 D3 and D2 foreground outbox regressions', () => {
  it('splits a large queue by encoded UTF-8 bytes and drains all accepted batches', async () => {
    const f = fixture(1000); const sizes = network((body, bytes) => {
      expect(bytes).toBeLessThanOrEqual(MAX_OUTBOX_BATCH_BYTES); return accepted(body);
    });
    await flushOutbox(f.db);
    expect(sizes.length).toBeGreaterThan(1);
    expect((await f.setLogs.toArray()).every(row => row.syncState === 'synced')).toBe(true);
  });
  it('splits a 413 response immediately, with fresh keys, until the server accepts', async () => {
    const f = fixture(8, 'small'); const sizes = network(body => body.sets.length > 2
      ? new Response(null, { status: 413 }) : accepted(body));
    await flushOutbox(f.db);
    expect(sizes).toHaveLength(7);
    expect((await f.setLogs.toArray()).every(row => row.syncState === 'synced')).toBe(true);
    const calls = vi.mocked(fetch).mock.calls.slice(1);
    expect(new Set(calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).size).toBe(7);
  });
  it('retains a single refused payload visibly instead of retrying it unchanged', async () => {
    const f = fixture(1); const sizes = network(() => new Response(null, { status: 413 }));
    await flushOutbox(f.db); await flushOutbox(f.db);
    expect(sizes).toHaveLength(1);
    expect(await f.setLogs.toArray()).toMatchObject([{ syncState: 'rejected', reason: 'payload_too_large' }]);
  });
  it('stops on a final 403 and keeps every queued set available as not uploaded', async () => {
    const f = fixture(1000); const sizes = network(() => new Response(null, { status: 403 }));
    await expect(flushOutbox(f.db)).rejects.toThrow('sync_403');
    await flushOutbox(f.db);
    expect(sizes).toHaveLength(1);
    const rows = await f.setLogs.toArray();
    expect(rows).toHaveLength(1000);
    expect(rows.every(row => row.syncState === 'rejected' && row.reason === 'sync_403')).toBe(true);
    expect(rows[0]?.payload.note).toBe('أ'.repeat(4000));
  });
  it('preserves a newer local edit while a terminal refusal is in flight', async () => {
    const f = fixture(1);
    network(() => new Response(null, { status: 403 }));
    const original = fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/sync')) {
        const row = (await f.setLogs.toArray())[0]!;
        await f.setLogs.put({ ...row, clientUpdatedAt: '2026-11-12T11:00:00Z' });
      }
      return original(url, init);
    }));
    await expect(flushOutbox(f.db)).rejects.toThrow('sync_403');
    expect((await f.setLogs.toArray())[0]?.syncState).toBe('pending');
  });
});
