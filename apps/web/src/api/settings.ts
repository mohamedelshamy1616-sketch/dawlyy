import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { parseListQuery } from './lib/pagination';
import { withAuthTx } from '../server/db';
import { guarded } from '../server/settings/guarded';
import { businessUpdateSchema } from '../server/settings/schemas';
import {
  listTenantConsents, updateBusiness,
} from '../server/settings/service';

// Task 11: business settings, branding, user preferences and consent records.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);

const jsonResponse = { description: 'Settings data', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });


router.openapi(createRoute({ method: 'put', path: '/business', tags: ['Settings'], request: { body: body(businessUpdateSchema) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const patch = c.req.valid('json');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => updateBusiness(tx, auth, patch))), 200);
});





router.openapi(createRoute({ method: 'get', path: '/consents/all', tags: ['Settings'], request: { query: z.object({ limit: z.string().optional(), cursor: z.string().optional() }) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const query = parseListQuery(c.req.valid('query'));
  return c.json(await guarded(() => withAuthTx(auth, (tx) => listTenantConsents(tx, auth, query))), 200);
});
