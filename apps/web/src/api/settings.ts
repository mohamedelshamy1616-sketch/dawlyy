import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { parseListQuery } from './lib/pagination';
import { withAuthTx } from '../server/db';
import { guarded } from '../server/settings/guarded';
import { businessUpdateSchema, consentInputSchema, preferencesUpdateSchema } from '../server/settings/schemas';
import {
  getBusiness, getPreferences, listOwnConsents, listTenantConsents, recordConsent, updateBusiness, updatePreferences,
} from '../server/settings/service';

// Task 11: business settings, branding, user preferences and consent records.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);

const jsonResponse = { description: 'Settings data', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });

router.openapi(createRoute({ method: 'get', path: '/business', tags: ['Settings'], responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => getBusiness(tx, auth))), 200);
});

router.openapi(createRoute({ method: 'put', path: '/business', tags: ['Settings'], request: { body: body(businessUpdateSchema) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const patch = c.req.valid('json');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => updateBusiness(tx, auth, patch))), 200);
});

router.openapi(createRoute({ method: 'get', path: '/preferences', tags: ['Settings'], responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => getPreferences(tx, auth))), 200);
});

router.openapi(createRoute({ method: 'put', path: '/preferences', tags: ['Settings'], request: { body: body(preferencesUpdateSchema) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const patch = c.req.valid('json');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => updatePreferences(tx, auth, patch))), 200);
});

router.openapi(createRoute({ method: 'get', path: '/consents', tags: ['Settings'], responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => listOwnConsents(tx, auth))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/consents', tags: ['Settings'], request: { body: body(consentInputSchema) }, responses: { 201: jsonResponse, 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const input = c.req.valid('json');
  const address = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip')?.trim() || null;
  const meta = { address: address || null, userAgent: c.req.header('user-agent')?.trim() || null };
  const result = await guarded(() => withAuthTx(auth, (tx) => recordConsent(tx, auth, input, meta)));
  return c.json(result, input.accepted ? 201 : 200);
});

router.openapi(createRoute({ method: 'get', path: '/consents/all', tags: ['Settings'], request: { query: z.object({ limit: z.string().optional(), cursor: z.string().optional() }) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const query = parseListQuery(c.req.valid('query'));
  return c.json(await guarded(() => withAuthTx(auth, (tx) => listTenantConsents(tx, auth, query))), 200);
});
