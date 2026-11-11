import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapFormError } from '../server/forms/helpers';
import { clientEvents, clientFormForEvent, clientIntake, getForm, getFormVersion, listForms, listFormVersions } from '../server/forms/read';
import { copyForm, createForm, markKnown, patchForm, publishForm, putFormDraft, revertForm, sendForm, skipForm } from '../server/forms/service';
import { createFormSchema, customizeSchema, draftSchema, formListSchema, knownSchema, patchFormSchema, publishSchema, revertSchema, sendSchema, skipSchema } from '../server/forms/schemas';

/** Task 7 / §12.1: versioned templates and explicit own-client form projections. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => {
  if (c.get('auth').role === 'client' && !(c.req.method === 'GET' && /\/forms\/(for-client\/[^/]+|intake|events)\/?$/.test(c.req.path))) throw forbidden();
  await next();
});
router.use('*', idempotentReplay);
const params = z.object({ id: z.uuid() });
const query = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
const json = { description: 'Form data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Forms'];
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>) {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapFormError(error); }
}
router.openapi(createRoute({ method: 'get', path: '/intake', tags, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientIntake(tx, auth)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/events', tags, request: { query: query.extend({ formKind: z.enum(['checkin', 'assessment']) }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientEvents(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/for-client/{eventId}', tags, request: { params: z.object({ eventId: z.uuid() }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientFormForEvent(tx, auth, c.req.valid('param').eventId)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/send', tags, request: { body: body(sendSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => sendForm(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'post', path: '/skip', tags, request: { body: body(skipSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => skipForm(tx, auth, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/mark-known', tags, request: { body: body(knownSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => markKnown(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: formListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listForms(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', tags, request: { body: body(createFormSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => createForm(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', tags, request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getForm(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', tags, request: { params, body: body(patchFormSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => patchForm(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'put', path: '/{id}/draft', tags, request: { params, body: body(draftSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => putFormDraft(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/publish', tags, request: { params, body: body(publishSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => publishForm(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions', tags, request: { params, query }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listFormVersions(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions/{n}', tags, request: { params: params.extend({ n: z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2147483647)) }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const { id, n } = c.req.valid('param'); return c.json(await transaction(auth, tx => getFormVersion(tx, auth, id, n)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/revert', tags, request: { params, body: body(revertSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => revertForm(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/duplicate', tags, request: { params }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => copyForm(tx, auth, c.req.valid('param').id)), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/customize', tags, request: { params, body: body(customizeSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => copyForm(tx, auth, c.req.valid('param').id, c.req.valid('json').clientId)), 201);
});
