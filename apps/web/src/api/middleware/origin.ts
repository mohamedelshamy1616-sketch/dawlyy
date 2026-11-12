import { createMiddleware } from 'hono/factory';
import { forbidden } from '../errors';

/** Reject browser mutations from untrusted origins before auth, validation or replay. */
export const requireSameOrigin = createMiddleware(async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header('Origin');
  if (origin !== undefined) {
    const allowed = [
      new URL(c.req.url).origin,
      ...(process.env.DAWLYY_ALLOWED_ORIGINS ?? '').split(','),
      process.env.NEXT_PUBLIC_APP_URL ?? '',
    ].map(value => value.trim()).filter(Boolean);
    if (!allowed.includes(origin)) throw forbidden('forbidden', 'cross_origin');
  } else {
    const site = c.req.header('Sec-Fetch-Site');
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
      throw forbidden('forbidden', 'cross_origin');
    }
  }
  await next();
});
