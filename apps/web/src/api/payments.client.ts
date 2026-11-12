import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { billingErrorHandler } from '../server/subscriptions/http';
import { myPayments } from '../server/payments/client-read';
import { paymentQuery, errors, jsonResult } from '../server/subscriptions/contracts';

// Task 3: manual payments.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(billingErrorHandler);

router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/mine', request: { query: paymentQuery }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => myPayments(tx, auth, c.req.valid('query'))), 200);
});
