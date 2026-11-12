'use client';

async function cleanupPush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<void>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(); }, 3000);
  });
  const cleanup = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (controller.signal.aborted) return;
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription || controller.signal.aborted) return;
    // Independent best efforts: a browser failure must not skip own-row cleanup, or vice versa.
    await Promise.allSettled([
      Promise.resolve().then(() => subscription.unsubscribe()),
      Promise.resolve().then(() => fetch('/api/v1/notifications/push-subscriptions', { method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ endpoint: subscription.endpoint }), signal: controller.signal })),
    ]);
  };
  try { await Promise.race([cleanup(), expired]); } catch { /* Logout remains available without push support. */ }
  finally { clearTimeout(timer); }
}

/** P7 D4 / security §12.1(9): best-effort browser and own-row cleanup while authentication still exists. */
export async function signOutWithPushCleanup(signOut: () => Promise<unknown>): Promise<void> {
  try { await cleanupPush(); } finally { await signOut(); }
}
