import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { handleRedFlag, listRedFlags } from '../server/red-flags-inbox';

/** R0c/R4c: private staff red-flag inbox and handling. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
const result = { description: 'Red flag data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error };
router.openapi(createRoute({ method: 'get', path: '/', request: { query: z.object({ status: z.enum(['open', 'handled']).optional(), clientId: z.uuid().optional(), limit: z.string().optional(), cursor: z.string().optional() }) }, responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listRedFlags(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/handle', request: { params: z.object({ id: z.uuid() }) }, responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => handleRedFlag(tx, auth, c.req.valid('param').id)), 200);
});
