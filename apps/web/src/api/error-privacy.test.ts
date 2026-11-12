import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { withAuthTx } from '@dawlyy/db';
import { clientNotes } from '@dawlyy/db/schema';
import { call, setupApiFixture } from '../test/api-harness';
import { requireAuthMiddleware } from './middleware/auth';
import { app } from './index';

const marker = 'N3_PRIVATE_HEALTH_NOTE_DO_NOT_LOG';
app.post('/__n3-query-error', requireAuthMiddleware, async c => {
  const auth = c.get('auth');
  // A real failed insert: the client FK is absent and the bound body is private.
  await withAuthTx(auth, tx => tx.insert(clientNotes).values({ tenantId: auth.tenantId,
    clientId: randomUUID(), authorUserId: auth.userId, body: marker }));
  return c.json({ ok: true });
});
let f: Awaited<ReturnType<typeof setupApiFixture>>;
beforeEach(async () => { f = await setupApiFixture(); });
afterEach(async () => { vi.restoreAllMocks(); await f?.cleanup(); });
it('N3 logs only safe error metadata when Drizzle includes private parameters', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await call(app, 'POST', '/api/v1/__n3-query-error', { as: f.owner.userId });
  expect(response.status).toBe(500);
  expect(log).toHaveBeenCalledTimes(1);
  expect(inspect(log.mock.calls, { depth: null })).not.toContain(marker);
  expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
  const metadata = log.mock.calls[0]![1] as Record<string, unknown>;
  expect(Object.keys(metadata).sort()).toEqual(['code', 'name', 'requestId', 'route', 'status']);
  expect(metadata).toMatchObject({ code: '23503', route: '/api/v1/__n3-query-error', status: 500 });
  expect(metadata.requestId).toEqual(expect.any(String));
  expect(JSON.stringify(response.json)).not.toContain(marker);
});
