import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { cloneFood, createFood, foodsByIds, getFood, hideFood, listFoods, patchFood } from '../server/nutrition/foods';
import { foodInput, foodListSchema, foodPatch } from '../server/nutrition/schemas';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => { if (c.get('auth').role === 'client' && !(c.req.method === 'GET' && c.req.path.endsWith('/by-ids'))) throw forbidden(); await next(); });
router.use('*', idempotentReplay);
const params = z.object({ id: z.uuid() });
const json = { description: 'Nutrition data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapNutritionError(error); }
}
router.openapi(createRoute({ method: 'get', path: '/', request: { query: foodListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listFoods(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/by-ids', request: { query: z.object({ ids: z.string().transform(v => v.split(',')).pipe(z.array(z.uuid()).min(1).max(100)) }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => foodsByIds(tx, auth, c.req.valid('query').ids)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: body(foodInput) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => createFood(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getFood(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', request: { params, body: body(foodPatch) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => patchFood(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/clone', request: { params }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => cloneFood(tx, auth, c.req.valid('param').id)), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/hide', request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => hideFood(tx, auth, c.req.valid('param').id, true)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/unhide', request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => hideFood(tx, auth, c.req.valid('param').id, false)), 200);
});
