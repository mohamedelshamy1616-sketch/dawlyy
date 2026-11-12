import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { requireActiveAccess } from './middleware/access';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { myNutrition } from '../server/nutrition/client';
import { substituteClientFood } from '../server/nutrition/client-substitute';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
const json = { description: 'Nutrition data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapNutritionError(error); }
}
router.openapi(createRoute({ middleware: [requireAuthMiddleware, requireActiveAccess, idempotentReplay] as const, method: 'get', path: '/me', request: {  }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => myNutrition(tx, auth)), 200);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'post', path: '/substitute', request: { body: body(z.object({ foodId: z.uuid(), toFoodId: z.uuid(), grams: z.number().positive().max(100000), rule: z.enum(['protein', 'carbs', 'fat', 'kcal']) }).strict()) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => substituteClientFood(tx, auth, c.req.valid('json'))), 200);
});
