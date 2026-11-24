import { clientModuleWriteGate } from '../server/client-module-gate';
import { mountVoidRoute } from './history-controls';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { errors, metricInput, metricKinds, rangeQuery, resultResponse } from '../server/tracking/contracts';
import { listMetrics, logMetric } from '../server/tracking/entries';
import { getCadence } from '../server/tracking/client-read';
import { createMiddleware } from 'hono/factory';
import { requireClientModule } from '../server/client-modules';
import { metricClientModule } from '../server/tracking/metric-module';

/** Resolve the owning module before an idempotent response can be replayed. */
const metricWriteGate = createMiddleware<ApiEnv>(async (c, next) => {
  const auth = c.get('auth');
  if (auth.role === 'client') {
    const body: unknown = await c.req.json<unknown>().catch(() => undefined);
    const input = metricInput.safeParse(body);
    if (!input.success) throw validationError(input.error.issues);
    await withAuthTx(auth, tx => requireClientModule(tx, auth, metricClientModule(input.data.metric)));
  }
  await next();
});

/** Task 8: metric history, immutable scalar logging and coach cadence configuration. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
const params = z.object({ clientId: z.uuid() });
router.openapi(createRoute({ middleware: [requireAuthMiddleware, clientModuleWriteGate('measurements'), idempotentReplay] as const, method: 'get', path: '/', request: { query: rangeQuery.extend({ metric: z.enum(metricKinds).optional(), metricKey: z.string().min(1).max(80).optional() }) }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listMetrics(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, metricWriteGate, idempotentReplay] as const, method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: metricInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => logMetric(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, clientModuleWriteGate('measurements'), idempotentReplay] as const, method: 'get', path: '/cadence/{clientId}', request: { params }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => getCadence(tx, auth, c.req.valid('param').clientId)), 200);
});

mountVoidRoute(router, 'metric_entries');
