import { createMiddleware } from 'hono/factory';
import type { AuthContext } from '@dawlyy/db';
import { getAuthContext } from '@/src/server/auth';
import { unauthorized } from '../errors';

export type AuthVariables = { auth: AuthContext };

/** doc §14: resolve request headers and require an active membership, exposed as `c.get('auth')`. */
export const requireAuthMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const ctx = await getAuthContext(c.req.raw.headers);
  if (!ctx) throw unauthorized();
  c.set('auth', ctx);
  await next();
});
