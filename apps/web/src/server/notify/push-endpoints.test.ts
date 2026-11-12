import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/src/api/errors';
import type { Tx } from '../db';
import { registerPushSubscription } from './center';
import { isAllowedPushEndpoint } from './push-endpoints';

const allowed = [
  'https://fcm.googleapis.com/fcm/send/device',
  'https://push.services.mozilla.com/wpush/v2/device',
  'https://updates.push.services.mozilla.com/wpush/v2/device',
  'https://notify.windows.com/device',
  'https://wns.notify.windows.com/device',
  'https://push.apple.com/device',
  'https://web.push.apple.com/device',
  'https://region.web.push.apple.com/device',
  'https://FCM.GOOGLEAPIS.COM:443/device',
];
const refused = [
  'not a URL',
  'https://evilfcm.googleapis.com/device',
  'https://fcm.googleapis.com.evil.test/device',
  'https://evilpush.services.mozilla.com/device',
  'https://notify.windows.com.evil.test/device',
  'https://evilpush.apple.com/device',
  'http://fcm.googleapis.com/device',
  'https://user@fcm.googleapis.com/device',
  'https://user:password@fcm.googleapis.com/device',
  'https://fcm.googleapis.com:8443/device',
  'https://127.0.0.1/device',
  'https://[::1]/device',
  'https://localhost/device',
];

describe('isAllowedPushEndpoint', () => {
  it.each(allowed)('allows provider endpoint %s', endpoint => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });
  it.each(refused)('refuses endpoint %s', endpoint => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

function registrationApp() {
  const execute = vi.fn().mockResolvedValue([{ id: 'subscription' }]);
  const tx = { execute } as unknown as Tx;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.toBody(), error.status);
    throw error;
  });
  app.post('/subscriptions', async c => {
    const input = await c.req.json<{ endpoint: string; keys: { p256dh: string; auth: string } }>();
    return c.json(await registerPushSubscription(tx, input), 201);
  });
  return {
    execute,
    register: (endpoint: string) => app.request('/subscriptions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys: { p256dh: 'public', auth: 'auth' } }),
    }),
  };
}

describe('push subscription registration', () => {
  it.each(refused)('refuses %s with 422 and without executing registration SQL', async endpoint => {
    const f = registrationApp();
    const response = await f.register(endpoint);
    expect(response.status).toBe(422);
    // Plain-http and credentialed URLs keep the original code; other refused https hosts are invalid_endpoint.
    const code = /^https:\/\/[^/@]+\//.test(endpoint) ? 'invalid_endpoint' : 'invalid_push_endpoint';
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('registers an allowed provider endpoint', async () => {
    const f = registrationApp();
    const response = await f.register('https://fcm.googleapis.com/fcm/send/device');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'subscription' });
    expect(f.execute).toHaveBeenCalledOnce();
  });
});
