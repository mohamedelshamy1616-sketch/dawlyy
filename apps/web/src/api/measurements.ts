import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { errors, measurementInput, rangeQuery, resultResponse } from '../server/tracking/contracts';
import { listMeasurements, saveMeasurements } from '../server/tracking/entries';

/** Task 8: measurement sets, UUID synchronization and deltas against the previous set. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);
router.openapi(createRoute({ method: 'get', path: '/', request: { query: rangeQuery }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listMeasurements(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: measurementInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => saveMeasurements(tx, auth, c.req.valid('json'))), 201);
});
