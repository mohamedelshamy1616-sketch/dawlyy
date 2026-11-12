import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { requireActiveAccess } from './middleware/access';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { requireClient } from '../server/workout/portal';
import { getExerciseHistory, getSession, listSessions } from '../server/workout/read';
import { finishSchema, historyQuerySchema, patchSessionSchema, startSessionSchema, syncSchema } from '../server/workout/contracts';
import { finishSession, patchSession, refreshSummaries, startSession, syncWorkout, workoutError } from '../server/workout/write';

// Task 5: workout sessions and offline history.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => {
  if (['POST', 'PATCH'].includes(c.req.method)) requireClient(c.get('auth'), true);
  await next();
});
const json = { description: 'Workout data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const params = z.object({ id: z.string().uuid() });
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>) {
  try { return await withAuthTx(auth, fn); } catch (error) { throw workoutError(error); }
}
router.openapi(createRoute({ middleware: [requireActiveAccess, idempotentReplay] as const, method: 'post', path: '/', request: { body: body(startSessionSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => startSession(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ middleware: [requireActiveAccess, idempotentReplay] as const, method: 'post', path: '/sync', request: { body: body(syncSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const result = await transaction(auth, tx => syncWorkout(tx, auth, c.req.valid('json')));
  await refreshSummaries(auth, result.sessionIds);
  return c.json({ accepted: result.accepted, rejected: result.rejected, serverTime: result.serverTime }, 200);
});
router.openapi(createRoute({ method: 'get', path: '/', request: { query: historyQuerySchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listSessions(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/exercise-history/{exerciseId}', request: { params: z.object({ exerciseId: z.string().uuid() }), query: z.object({ clientId: z.string().uuid().optional() }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getExerciseHistory(tx, auth, c.req.valid('param').exerciseId, c.req.valid('query').clientId)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getSession(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ middleware: [idempotentReplay] as const, method: 'patch', path: '/{id}', request: { params, body: body(patchSessionSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => patchSession(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ middleware: [idempotentReplay] as const, method: 'post', path: '/{id}/finish', request: { params, body: body(finishSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const id = c.req.valid('param').id;
  await transaction(auth, tx => finishSession(tx, auth, id, c.req.valid('json'))); await refreshSummaries(auth, [id]);
  return c.json((await transaction(auth, tx => getSession(tx, auth, id))).session.summary, 200);
});
