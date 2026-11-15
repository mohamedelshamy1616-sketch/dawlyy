import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { requirePermission } from '../server/require-permission';
import { listActivity } from '../server/activity/read';
import { activityPageSchema, activityQuerySchema } from '../server/activity/schemas';

/** R3b / C15: all middleware stays beneath the /activity mount; no mutation or replay handler exists. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  requirePermission(c.get('auth'), 'clients', 'view');
  // Reject duplicate parameters as well as unknown keys before validation or a transaction.
  for (const values of Object.values(c.req.queries())) if (values.length !== 1) throw validationError();
  await next();
});
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
router.openapi(createRoute({
  method: 'get', path: '/', tags: ['Activity'], request: { query: activityQuerySchema },
  responses: { 200: { description: 'Caller-scoped safe activity metadata', content: { 'application/json': { schema: activityPageSchema } } }, 400: error, 401: error, 403: error, 404: error },
}), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => listActivity(tx, auth, c.req.valid('query'))), 200);
});
