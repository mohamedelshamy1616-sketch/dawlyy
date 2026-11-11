import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { listMealLogs, logMeal, logSupplement, logWater } from '../server/nutrition/logs';
import { logListSchema, mealLogSchema, supplementLogSchema, waterSchema } from '../server/nutrition/schemas';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => { if (c.req.method !== 'GET' && c.get('auth').role !== 'client') throw forbidden(); await next(); });
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
router.openapi(createRoute({ method: 'post', path: '/', request: { body: body(mealLogSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logMeal(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/supplements', request: { body: body(supplementLogSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logSupplement(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/water', request: { body: body(waterSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => logWater(tx, auth, c.req.valid('json'))), 200);
});
