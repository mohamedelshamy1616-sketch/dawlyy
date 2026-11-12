import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { foodsByIds } from '../server/nutrition/client-read';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
const json = { description: 'Nutrition data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapNutritionError(error); }
}
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/by-ids', request: { query: z.object({ ids: z.string().transform(v => v.split(',')).pipe(z.array(z.uuid()).min(1).max(100)) }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => foodsByIds(tx, auth, c.req.valid('query').ids)), 200);
});
