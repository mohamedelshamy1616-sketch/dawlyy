import { clientModuleWriteGate } from '../server/client-module-gate';
import { mountVoidRoute } from './history-controls';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { correctMeal, listMealLogs, logMeal, logSupplement, logWater } from '../server/nutrition/logs';
import { logListSchema, mealLogSchema, supplementLogSchema, waterSchema } from '../server/nutrition/schemas';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', clientModuleWriteGate('nutrition'));
router.use('*', async (c, next) => { if (c.req.method !== 'GET' && !/\/(void|correct)\/?$/.test(c.req.path) && c.get('auth').role !== 'client') throw forbidden(); await next(); });
router.use('*', idempotentReplay);
const json = { description: 'Nutrition data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapNutritionError(error); }
}
router.openapi(createRoute({ method: 'get', path: '/', request: { query: logListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listMealLogs(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', description: 'Creates a meal log. Reusing a clientUuid returns the stored row unchanged, even when facts or timestamps differ or the row is voided. Edit through /{id}/correct.', request: { body: body(mealLogSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logMeal(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/supplements', description: 'Appends a supplement status event. Reusing a clientUuid returns the stored row unchanged even when the payload differs. A later taken/skipped action uses a new clientUuid and retains earlier events.', request: { body: body(supplementLogSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logSupplement(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/water', request: { body: body(waterSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logWater(tx, auth, c.req.valid('json'))), 200);
});

mountVoidRoute(router, 'meal_logs', true);

router.openapi(createRoute({ method: 'post', path: '/{id}/correct', request: { params: z.object({ id: z.uuid() }), body: body(mealLogSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => correctMeal(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
