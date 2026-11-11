import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapDashboardError } from '../server/dashboard/helpers';
import { completeTask, createTask, listTasks, patchTask, reopenTask, snoozeTask } from '../server/dashboard/tasks';
import { createTaskSchema, patchTaskSchema, snoozeSchema, taskListQuery, taskParams } from '../server/dashboard/schemas';

/** Task 10 / doc §12.1: manual and system tasks, snooze and completion (module `dashboard`). */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
// Clients never read or write coach tasks: refuse before validation, replay lookups or any query.
router.use('*', async (c, next) => {
  if (c.get('auth').role === 'client') throw forbidden();
  await next();
});
router.use('*', idempotentReplay);

const json = { description: 'Coach task data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Tasks'];

async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (failure) { throw mapDashboardError(failure); }
}

router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: taskListQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listTasks(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', tags, request: { body: body(createTaskSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => createTask(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', tags, request: { params: taskParams, body: body(patchTaskSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => patchTask(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/complete', tags, request: { params: taskParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => completeTask(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/snooze', tags, request: { params: taskParams, body: body(snoozeSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => snoozeTask(tx, auth, c.req.valid('param').id, c.req.valid('json').until)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/reopen', tags, request: { params: taskParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => reopenTask(tx, auth, c.req.valid('param').id)), 200);
});
