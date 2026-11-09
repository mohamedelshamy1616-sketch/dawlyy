import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { createPackageSchema, packageListSchema, updatePackageSchema } from '../server/packages/schemas';
import { archivePackage, createPackage, duplicatePackage, getPackage, listPackages, updatePackage } from '../server/packages/service';

// Task 3: package and entitlement management.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);

const params = z.object({ id: z.string().uuid() });
const jsonResponse = { description: 'Coach package data', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };

router.openapi(createRoute({ method: 'get', path: '/', tags: ['Packages'], request: { query: packageListSchema }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => listPackages(tx, auth, c.req.valid('query'))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/', tags: ['Packages'], request: { body: { required: true, content: { 'application/json': { schema: createPackageSchema } } } }, responses: { 201: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => createPackage(tx, auth, c.req.valid('json'))), 201);
});

router.openapi(createRoute({ method: 'get', path: '/{id}', tags: ['Packages'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => getPackage(tx, auth, c.req.valid('param').id)), 200);
});

router.openapi(createRoute({ method: 'patch', path: '/{id}', tags: ['Packages'], request: { params, body: { required: true, content: { 'application/json': { schema: updatePackageSchema } } } }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => updatePackage(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/{id}/archive', tags: ['Packages'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => archivePackage(tx, auth, c.req.valid('param').id)), 200);
});

router.openapi(createRoute({ method: 'post', path: '/{id}/duplicate', tags: ['Packages'], request: { params }, responses: { 201: jsonResponse, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => duplicatePackage(tx, auth, c.req.valid('param').id)), 201);
});
