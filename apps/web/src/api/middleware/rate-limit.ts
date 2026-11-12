import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ApiErrorBody } from '../errors';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  key?: (c: Context) => string;
  /** Inject milliseconds since epoch for deterministic window tests. */
  now?: () => number;
};

function addressKey(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')?.trim() || 'local';
}

/** Per-instance fixed windows; the deployment proxy must supply trusted client-IP headers. */
export function rateLimit({ windowMs, max, key = addressKey, now = Date.now }: RateLimitOptions) {
  const windows = new Map<string, { expiresAt: number; count: number }>();
  return createMiddleware(async (c, next) => {
    const time = now();
    for (const [id, window] of windows) {
      if (window.expiresAt <= time) windows.delete(id);
    }
    const id = key(c);
    let window = windows.get(id);
    if (!window) {
      window = { expiresAt: time + windowMs, count: 0 };
      windows.set(id, window);
    }
    if (window.count >= max) {
      const body: ApiErrorBody = { error: { code: 'rate_limited', message: 'Too many requests' } };
      return c.json(body, 429, { 'Retry-After': String(Math.ceil((window.expiresAt - time) / 1_000)) });
    }
    window.count += 1;
    await next();
  });
}
