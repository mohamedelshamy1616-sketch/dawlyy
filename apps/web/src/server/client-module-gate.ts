import 'server-only';
import { createMiddleware } from 'hono/factory';
import type { ClientModule } from '@dawlyy/core/types';
import type { ApiEnv } from '../api/env';
import { withAuthTx } from './db';
import { requireClientModule } from './client-modules';

/** R0c/R2a: check current switches before replay; services repeat the check inside the write transaction. */
export function clientModuleWriteGate(module: ClientModule) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const auth = c.get('auth');
    if (auth.role === 'client' && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      await withAuthTx(auth, tx => requireClientModule(tx, auth, module));
    }
    await next();
  });
}
