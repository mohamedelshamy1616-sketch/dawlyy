import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { cadenceInput, errors, resultResponse } from '../server/tracking/contracts';
import { putCadence } from '../server/tracking/cadence';

/** Task 8: metric history, immutable scalar logging and coach cadence configuration. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
const params = z.object({ clientId: z.uuid() });
router.openapi(createRoute({ method: 'put', path: '/cadence/{clientId}', request: { params, body: { required: true, content: { 'application/json': { schema: cadenceInput } } } }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => putCadence(tx, auth, c.req.valid('param').clientId, c.req.valid('json'))), 200);
});
