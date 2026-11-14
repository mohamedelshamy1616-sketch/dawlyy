import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { idempotentReplay } from './middleware/idempotency';
import { requireAuthMiddleware } from './middleware/auth';
import { withAuthTx } from '../server/db';
import { voidEntry, voidInput } from '../server/history-controls';
import { clientModuleWriteGate } from '../server/client-module-gate';

/** R0c: mount identical authenticated void contracts in each history router. */
export function mountVoidRoute(router: OpenAPIHono<ApiEnv>, table: 'meal_logs' | 'measurement_sets' | 'metric_entries' | 'workout_sessions', alreadyReplays = false) {
  const clientModule = table === 'meal_logs' ? 'nutrition' : table === 'workout_sessions' ? 'workouts' : 'measurements';
  const error = { description: 'Standard error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
  router.openapi(createRoute({ method: 'post', path: '/{id}/void', middleware: alreadyReplays ? [requireAuthMiddleware] as const : [requireAuthMiddleware, clientModuleWriteGate(clientModule), idempotentReplay] as const,
    request: { params: z.object({ id: z.uuid() }), body: { required: true, content: { 'application/json': { schema: voidInput } } } },
    responses: { 200: { description: 'Voided entry', content: { 'application/json': { schema: z.unknown() } } }, 400: error, 401: error, 403: error, 409: error },
  }), async c => {
    const auth = c.get('auth');
    return c.json(await withAuthTx(auth, tx => voidEntry(tx, auth, table, c.req.valid('param').id, c.req.valid('json').reason)), 200);
  });
}
