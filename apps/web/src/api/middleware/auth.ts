import { createMiddleware } from 'hono/factory';
import type { AuthContext } from '@dawlyy/db';
import { getAuthContext } from '@/src/server/auth';
import { unauthorized } from '../errors';

export type AuthVariables = { auth: AuthContext };

/** Requires a signed-in caller with an active membership; exposes it as `c.get('auth')`. */
export const requireAuthMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorized();
  c.set('auth', ctx);
  await next();
});
