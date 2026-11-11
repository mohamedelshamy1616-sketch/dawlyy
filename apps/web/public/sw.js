/* Task 5: versioned, foreground-only PWA shell. No mutation or workout API response is cached. */
'use strict';
const VERSION = 'dawlyy-pwa-v1';
const ASSETS = `${VERSION}-assets`;
const META = `${VERSION}-identity`;
const OWNER_KEY = new URL('/__pwa_owner__', self.location.origin).href;
const portalPath = pathname => /^\/(?:ar|en)\/app(?:\/|$)/.test(pathname);
let identityWork = null;
let generation = 0;

async function foregroundFetch(request, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try { return await fetch(request, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function savedOwner() {
  const saved = await (await caches.open(META)).match(OWNER_KEY);
  return saved ? (await saved.json()).userId : null;
}
async function clearOwner() {
  generation++;
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(`${VERSION}-user-`)).map(key => caches.delete(key)));
  await caches.delete(META);
}
async function verifyOwner() {
  if (identityWork) return identityWork;
  let epoch = generation;
  identityWork = (async () => {
    try {
      const response = await foregroundFetch('/api/v1/me', { credentials: 'same-origin', cache: 'no-store' });
      if (epoch !== generation) return null;
      if (response.status === 401 || response.status === 403) { await clearOwner(); return null; }
      if (!response.ok) return epoch === generation ? savedOwner() : null;
      const caller = await response.json();
      if (epoch !== generation) return null;
      if (caller.role !== 'client' || typeof caller.userId !== 'string' || !/^[\da-f-]{36}$/i.test(caller.userId)) { await clearOwner(); return null; }
      const old = await savedOwner();
      if (epoch !== generation) return null;
      if (old && old !== caller.userId) { await clearOwner(); epoch = generation; }
      if (epoch !== generation) return null;
      await (await caches.open(META)).put(OWNER_KEY, new Response(JSON.stringify({ userId: caller.userId }), { headers: { 'Content-Type': 'application/json' } }));
      return caller.userId;
    } catch { return epoch === generation ? savedOwner() : null; }
  })().finally(() => { identityWork = null; });
  return identityWork;
}

self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('dawlyy-pwa-') && !key.startsWith(`${VERSION}-`)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_OWNER') event.waitUntil(clearOwner());
  // Never trust a user id supplied in a postMessage; re-establish it using the authenticated endpoint.
  if (event.data?.type === 'SET_OWNER') event.waitUntil(verifyOwner());
});

async function networkFirst(request) {
  const owner = await verifyOwner();
  const epoch = generation;
  const cache = owner ? await caches.open(`${VERSION}-user-${owner}`) : null;
  const fallback = cache ? await cache.match(request) : null;
  try {
    // First visits may need a slow compile/download; only bound requests with a usable offline fallback.
    const response = await (fallback ? foregroundFetch(request) : fetch(request));
    const contentType = response.headers.get('content-type') || '';
    if (response.status === 401 || response.status === 403 || response.redirected && !portalPath(new URL(response.url).pathname)) await clearOwner();
    if (response.status >= 500 && epoch === generation && cache) {
      if (fallback) return fallback;
    }
    const canCache = response.ok && !response.redirected && (request.mode === 'navigate' ? contentType.includes('text/html') && portalPath(new URL(response.url).pathname) : contentType.includes('application/json'));
    if (cache && canCache && epoch === generation && await savedOwner() === owner) {
      try { await cache.put(request, response.clone()); } catch { /* Storage pressure never breaks the online app. */ }
    }
    return response;
  } catch {
    return epoch === generation && fallback ? fallback : Response.error();
  }
}
self.addEventListener('fetch', event => {
  const request = event.request; const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Clear on login, logout and dev account switches, before a new identity can enter the app.
  if (/\/(?:logout|signout|sign-out)(?:\/|$)/i.test(url.pathname) || url.pathname === '/api/dev-login' || /\/(?:ar|en)\/login(?:\/|$)/.test(url.pathname)) {
    event.respondWith((async () => { await clearOwner(); return fetch(request); })()); return;
  }
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS); const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) { try { await cache.put(request, response.clone()); } catch { /* Quota full. */ } }
      return response;
    })()); return;
  }
  // RSC/prefetch responses are deliberately excluded: a fragment is not a navigable shell.
  if (request.mode === 'navigate' && portalPath(url.pathname)) { event.respondWith(networkFirst(request)); return; }
  if (url.pathname === '/api/v1/me/program' || url.pathname === '/api/v1/me/today') event.respondWith(networkFirst(request));
});
