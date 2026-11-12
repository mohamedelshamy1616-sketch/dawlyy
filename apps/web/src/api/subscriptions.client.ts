import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { billingErrorHandler } from '../server/subscriptions/http';
import { mySubscription } from '../server/subscriptions/client-read';
import { errors, jsonResult } from '../server/subscriptions/contracts';

// Task 3: subscription lifecycle.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(billingErrorHandler);


router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/mine', responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => mySubscription(tx, auth)), 200);
});
