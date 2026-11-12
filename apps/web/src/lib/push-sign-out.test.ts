import { afterEach, describe, expect, it, vi } from 'vitest';
import { signOutWithPushCleanup } from './push-sign-out';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function browser() {
  const unsubscribe = vi.fn(async () => true);
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: {
    getSubscription: async () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/device', unsubscribe }),
  } }) } });
  return unsubscribe;
}
describe('P7 D4 push cleanup before logout', () => {
  it('deletes the endpoint and unsubscribes before ending the authenticated session', async () => {
    const unsubscribe = browser(); const request = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', request);
    const signOut = vi.fn(async () => { expect(unsubscribe).toHaveBeenCalledOnce(); expect(request).toHaveBeenCalledOnce(); });
    await signOutWithPushCleanup(signOut);
    expect(signOut).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith('/api/v1/notifications/push-subscriptions', expect.objectContaining({
      method: 'DELETE', credentials: 'same-origin', body: JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/device' }),
    }));
  });
  it('still unsubscribes and signs out if the authenticated API fails', async () => {
    const unsubscribe = browser(); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const signOut = vi.fn(async () => {});
    await signOutWithPushCleanup(signOut);
    expect(unsubscribe).toHaveBeenCalledOnce(); expect(signOut).toHaveBeenCalledOnce();
  });
  it('still deletes the own row if browser unsubscription fails', async () => {
    const unsubscribe = browser(); unsubscribe.mockRejectedValue(new Error('browser unavailable'));
    const request = vi.fn(async () => new Response(null, { status: 200 })); vi.stubGlobal('fetch', request);
    const signOut = vi.fn(async () => {}); await signOutWithPushCleanup(signOut);
    expect(request).toHaveBeenCalledOnce(); expect(signOut).toHaveBeenCalledOnce();
  });
  it('signs out on unsupported browsers', async () => {
    vi.stubGlobal('navigator', {}); const signOut = vi.fn(async () => {});
    await signOutWithPushCleanup(signOut); expect(signOut).toHaveBeenCalledOnce();
  });
  it('bounds cleanup time and prevents a delayed lookup from deleting under the next session', async () => {
    vi.useFakeTimers();
    let resolveRegistration!: (value: ServiceWorkerRegistration | undefined) => void;
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: () => new Promise<ServiceWorkerRegistration | undefined>(resolve => { resolveRegistration = resolve; }) } });
    const request = vi.fn(); vi.stubGlobal('fetch', request);
    const signOut = vi.fn(async () => {}); const work = signOutWithPushCleanup(signOut);
    await vi.advanceTimersByTimeAsync(5000); await work;
    expect(signOut).toHaveBeenCalledOnce();
    resolveRegistration(undefined); await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
});
