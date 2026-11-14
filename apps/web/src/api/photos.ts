import { clientModuleWriteGate } from '../server/client-module-gate';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { errors, idParams, photoInput, rangeQuery, resultResponse } from '../server/tracking/contracts';
import { comparePhotos, deletePhotos, listPhotos, savePhotos } from '../server/tracking/photos';

/** Task 8: private photo sets, signed timelines, comparisons and soft deletion. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', clientModuleWriteGate('progress_photos'));
router.use('*', idempotentReplay);
for (const path of ['/', '/timeline'] as const) router.openapi(createRoute({ method: 'get', path, request: { query: rangeQuery }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listPhotos(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/compare', request: { query: z.object({ clientId: z.uuid().optional(), fromId: z.uuid(), toId: z.uuid() }) }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); const query = c.req.valid('query'); return c.json(await withAuthTx(auth, tx => comparePhotos(tx, auth, query.clientId, query.fromId, query.toId)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: photoInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => savePhotos(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'delete', path: '/{id}', request: { params: idParams }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => deletePhotos(tx, auth, c.req.valid('param').id)), 200);
});
