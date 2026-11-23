import { clientModuleWriteGate } from '../server/client-module-gate';
import { mountVoidRoute } from './history-controls';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { errors, measurementInput, rangeQuery, resultResponse } from '../server/tracking/contracts';
import { correctMeasurements, listMeasurements, saveMeasurements } from '../server/tracking/entries';

/** Task 8: measurement sets, UUID synchronization and deltas against the previous set. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', clientModuleWriteGate('measurements'));
router.use('*', idempotentReplay);
router.openapi(createRoute({ method: 'get', path: '/', request: { query: rangeQuery }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listMeasurements(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', description: 'Creates a measurement set. Reusing a clientUuid returns the stored row unchanged, even when facts or timestamps differ or the row is voided. Edit through /{id}/correct.', request: { body: { required: true, content: { 'application/json': { schema: measurementInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => saveMeasurements(tx, auth, c.req.valid('json'))), 201);
});

mountVoidRoute(router, 'measurement_sets', true);

router.openapi(createRoute({ method: 'post', path: '/{id}/correct', request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: measurementInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => correctMeasurements(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
