import { withAuthTx } from '@dawlyy/db';
import { createMiddleware } from 'hono/factory';
import { checkActiveAccess } from '../../server/access';
import { ApiError } from '../errors';
import type { AuthVariables } from './auth';

export { decideAccess, type AccessSubscription, type AccessDecision } from '../../server/access';

/** doc §12.1 / spec §30: mount after auth only on live-access routes; staff/owners pass and history stays ungated. */
export const requireActiveAccess = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const auth = c.get('auth');
  if (auth.role === 'owner' || auth.role === 'staff') {
    await next();
    return;
  }
  const clientId = auth.clientId;
  if (!clientId) throw new ApiError(403, 'access_expired', 'Active subscription required', { state: null });

  const decision = await withAuthTx(auth, tx => checkActiveAccess(tx, auth));
  if (!decision.allowed) throw new ApiError(403, 'access_expired', 'Active subscription required', decision.details);
  await next();
});
