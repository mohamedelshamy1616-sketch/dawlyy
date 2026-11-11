import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapDashboardError } from '../server/dashboard/helpers';
import { dashboardQueue, dashboardSummary } from '../server/dashboard/queue';
import { clientTimeline } from '../server/dashboard/timeline';
import { pagingQuery, queueParams, timelineParams } from '../server/dashboard/schemas';

/** Task 10 / doc §12.1: coach dashboard counts, filtered queues and the Client 360 timeline (module `dashboard`, view). */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
// Clients never read coach dashboard data: refuse before validation or any query.
router.use('*', async (c, next) => {
  if (c.get('auth').role === 'client') throw forbidden();
  await next();
});

const json = { description: 'Coach dashboard data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const tags = ['Dashboard'];

async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (failure) { throw mapDashboardError(failure); }
}

router.openapi(createRoute({ method: 'get', path: '/summary', tags, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => dashboardSummary(tx, auth)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/queue/{kind}', tags, request: { params: queueParams, query: pagingQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => dashboardQueue(tx, auth, c.req.valid('param').kind, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/timeline/{clientId}', tags, request: { params: timelineParams, query: pagingQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => clientTimeline(tx, auth, c.req.valid('param').clientId, c.req.valid('query'))), 200);
});
