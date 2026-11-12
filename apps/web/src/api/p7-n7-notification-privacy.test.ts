import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { messages } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { workoutFixture } from '../server/workout/test-fixture';
import { notifyMessage } from '../server/messaging/service';
import { app } from './index';

// Keep message persistence real; fail only the separate post-commit notification step.
vi.mock('../server/messaging/service', async importOriginal => ({
  ...await importOriginal<typeof import('../server/messaging/service')>(),
  notifyMessage: vi.fn(),
}));

const marker = 'N7_PRIVATE_CLIENT_HEALTH_CONTENT';
let f: Awaited<ReturnType<typeof workoutFixture>>;
beforeEach(async () => { f = await workoutFixture(); });
afterEach(async () => { vi.restoreAllMocks(); await f?.cleanup(); });

it.each(['error', 'non-error'] as const)('N7 %s notification failure keeps the message saved and private content out of every log argument', async kind => {
  const opened = await call(app, 'POST', '/api/v1/conversations', { as: f.a.userId, body: {} });
  expect(opened.status).toBe(201);
  const conversation = opened.json as { id: string };
  const failure = kind === 'error'
    ? new Error(`Failed query with params: ${marker}`, { cause: Object.assign(new Error(marker), { code: '23503' }) })
    : marker;
  vi.mocked(notifyMessage).mockRejectedValueOnce(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const clientUuid = randomUUID();
  const sent = await call(app, 'POST', `/api/v1/conversations/${conversation.id}/messages`, {
    as: f.a.userId, body: { clientUuid, body: marker },
  });
  expect(sent.status).toBe(201);
  expect(sent.json).toMatchObject({ body: marker, mine: true, notified: false });
  const saved = await setupApiData(f.owner.tenantId, 'N7 message read-back', tx => tx.select({ id: messages.id, body: messages.body })
    .from(messages).where(eq(messages.clientUuid, clientUuid)));
  expect(saved).toEqual([{ id: (sent.json as { id: string }).id, body: marker }]);
  expect(log).toHaveBeenCalledTimes(1);
  for (const args of log.mock.calls) for (const arg of args) {
    expect(inspect(arg, { depth: null })).not.toContain(marker);
    expect(JSON.stringify(arg)).not.toContain(marker);
  }
  const metadata = log.mock.calls[0]![1] as Record<string, unknown>;
  expect(Object.keys(metadata).sort()).toEqual(['code', 'name', 'requestId', 'route', 'status']);
  expect(metadata).toMatchObject({ name: 'Error', code: kind === 'error' ? '23503' : null, requestId: expect.any(String), status: 500 });
  expect(metadata.route).toEqual(expect.stringContaining('/conversations/'));
});
