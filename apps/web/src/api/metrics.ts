import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { cadenceInput, errors, metricInput, metricKinds, rangeQuery, resultResponse } from '../server/tracking/contracts';
import { listMetrics, logMetric } from '../server/tracking/entries';
import { getCadence, putCadence } from '../server/tracking/cadence';

/** Task 8: metric history, immutable scalar logging and coach cadence configuration. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);
router.openapi(createRoute({ method: 'get', path: '/', request: { query: rangeQuery.extend({ metric: z.enum(metricKinds).optional(), metricKey: z.string().min(1).max(80).optional() }) }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listMetrics(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: metricInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => logMetric(tx, auth, c.req.valid('json'))), 201);
});
const params = z.object({ clientId: z.uuid() });
router.openapi(createRoute({ method: 'get', path: '/cadence/{clientId}', request: { params }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => getCadence(tx, auth, c.req.valid('param').clientId)), 200);
});
router.openapi(createRoute({ method: 'put', path: '/cadence/{clientId}', request: { params, body: { required: true, content: { 'application/json': { schema: cadenceInput } } } }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => putCadence(tx, auth, c.req.valid('param').clientId, c.req.valid('json'))), 200);
});
