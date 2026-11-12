import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { pushSubscriptions } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { signOutWithPushCleanup } from '../lib/push-sign-out';
import { app } from './index';

afterEach(() => vi.unstubAllGlobals());
describe('P7 D4 logout through the real authenticated push API', () => {
  it('removes just this caller and endpoint, preserving the same endpoint in another tenant', async () => {
    const a = await setupApiFixture(); const b = await setupApiFixture();
    try {
      const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
      const otherEndpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
      const keys = { p256dh: 'public', auth: 'auth' };
      const subscribe = (as: string, value: string) => call(app, 'POST', '/api/v1/notifications/push-subscriptions', { as, body: { endpoint: value, keys } });
      expect((await subscribe(a.owner.userId, endpoint)).status).toBe(201);
      expect((await subscribe(a.owner.userId, otherEndpoint)).status).toBe(201);
      expect((await subscribe(b.owner.userId, endpoint)).status).toBe(201);
      const unsubscribe = vi.fn(async () => true);
      vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint, unsubscribe }) } }) } });
      vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
        const response = await call(app, init?.method ?? 'GET', path, { as: a.owner.userId,
          body: JSON.parse(String(init?.body)) as unknown, headers: init?.headers });
        expect(response.status).toBe(200); return Response.json(response.json, { status: response.status });
      }));
      const ownRows = () => setupApiData(a.owner.tenantId, 'D4 own readback', tx => tx.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, a.owner.userId)));
      const signOut = vi.fn(async () => { expect(await ownRows()).toEqual([{ endpoint: otherEndpoint }]); });
      await signOutWithPushCleanup(signOut);
      expect(signOut).toHaveBeenCalledOnce(); expect(unsubscribe).toHaveBeenCalledOnce();
      expect(await setupApiData(b.owner.tenantId, 'D4 other tenant readback', tx => tx.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, b.owner.userId))))
        .toEqual([{ endpoint }]);
      // Repeated cleanup is safe; a foreign endpoint is never authority to remove its row.
      expect((await call(app, 'DELETE', '/api/v1/notifications/push-subscriptions', { as: a.owner.userId, body: { endpoint } })).status).toBe(200);
    } finally { await a.cleanup(); await b.cleanup(); }
  });
});
