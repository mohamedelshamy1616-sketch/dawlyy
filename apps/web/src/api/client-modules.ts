import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { ClientModules } from '@dawlyy/core/types';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { requirePermission } from '../server/require-permission';
import { getTenantClientModules, putTenantClientModules } from '../server/client-modules';

/** R0c/R2a: tenant module configuration, mounted at /settings/client-modules. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
const result = { description: 'Client module switches', content: { 'application/json': { schema: ClientModules } } };
const error = { description: 'Standard error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
const errors = { 400: error, 401: error, 403: error };
router.openapi(createRoute({ method: 'get', path: '/', responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth'); requirePermission(auth, 'settings', 'view');
  return c.json(await withAuthTx(auth, tx => getTenantClientModules(tx, auth)), 200);
});
router.openapi(createRoute({ method: 'put', path: '/', request: { body: { required: true, content: { 'application/json': { schema: ClientModules } } } }, responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => putTenantClientModules(tx, auth, c.req.valid('json'))), 200);
});
