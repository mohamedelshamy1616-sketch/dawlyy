import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { clientListSchema, createClientSchema, updateClientSchema } from '../server/clients/schemas';
import { overrideBodySchema } from '../server/packages/schemas';
import { createClient, getClient, getClientOverrides, listClients, putClientOverride, resetClientOverride, setClientArchived, updateClient } from '../server/clients/service';

// Task 3: client management.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);

const params = z.object({ clientId: z.string().uuid() });
const overrideParams = params.extend({ key: z.string().min(1).max(200) });
const jsonResponse = { description: 'Coach client data', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };

router.openapi(createRoute({ method: 'get', path: '/', tags: ['Clients'], request: { query: clientListSchema }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => listClients(tx, auth, c.req.valid('query'))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/', tags: ['Clients'], request: { body: { required: true, content: { 'application/json': { schema: createClientSchema } } } }, responses: { 201: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => createClient(tx, auth, c.req.valid('json'))), 201);
});

router.openapi(createRoute({ method: 'get', path: '/{clientId}', tags: ['Clients'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => getClient(tx, auth, c.req.valid('param').clientId)), 200);
});

router.openapi(createRoute({ method: 'patch', path: '/{clientId}', tags: ['Clients'], request: { params, body: { required: true, content: { 'application/json': { schema: updateClientSchema } } } }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => updateClient(tx, auth, c.req.valid('param').clientId, c.req.valid('json'))), 200);
});

for (const action of ['archive', 'unarchive'] as const) {
  router.openapi(createRoute({ method: 'post', path: `/{clientId}/${action}`, tags: ['Clients'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async c => {
    const auth = c.get('auth');
    return c.json(await withAuthTx(auth, tx => setClientArchived(tx, auth, c.req.valid('param').clientId, action === 'archive')), 200);
  });
}

router.openapi(createRoute({ method: 'get', path: '/{clientId}/overrides', tags: ['Clients'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => getClientOverrides(tx, auth, c.req.valid('param').clientId)), 200);
});

router.openapi(createRoute({ method: 'put', path: '/{clientId}/overrides/{key}', tags: ['Clients'], request: { params: overrideParams, body: { required: true, content: { 'application/json': { schema: overrideBodySchema } } } }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  const { clientId, key } = c.req.valid('param');
  return c.json(await withAuthTx(auth, tx => putClientOverride(tx, auth, clientId, key, c.req.valid('json'))), 200);
});

router.openapi(createRoute({ method: 'delete', path: '/{clientId}/overrides/{key}', tags: ['Clients'], request: { params: overrideParams }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  const { clientId, key } = c.req.valid('param');
  return c.json(await withAuthTx(auth, tx => resetClientOverride(tx, auth, clientId, key)), 200);
});
