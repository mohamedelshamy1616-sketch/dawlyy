import { setLibraryArchived } from '../server/archive';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapNutritionError } from '../server/nutrition/errors';
import { assignmentClients, getNutrition, getNutritionVersion, listNutrition, listNutritionVersions, nutritionDiff } from '../server/nutrition/read';
import { assignNutrition, createNutrition, duplicateNutrition, patchNutrition, publishNutrition, putNutritionDraft, refuseNutritionVersionWrite, reuseCheck, revertNutrition } from '../server/nutrition/service';
import { assignSchema, createPlanSchema, draftDocumentSchema, draftSchema, patchPlanSchema, planListSchema, publishSchema, revertSchema } from '../server/nutrition/schemas';

/** Task 6 / ?12.1: authenticated, validated nutrition boundaries. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
const params = z.object({ id: z.uuid() });
const listQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
const json = { description: 'Nutrition data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapNutritionError(error); }
}
const versionNo = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2147483647));
const versionParams = params.extend({ versionNo });
router.openapi(createRoute({ method: 'post', path: '/reuse-check', request: { body: body(z.object({ planId: z.uuid(), clientId: z.uuid() }).strict()) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => reuseCheck(tx, auth, c.req.valid('json').planId, c.req.valid('json').clientId)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/', request: { query: planListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listNutrition(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: body(createPlanSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => createNutrition(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getNutrition(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', request: { params, body: body(patchPlanSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => patchNutrition(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'put', path: '/{id}/draft', request: { params, body: body(draftSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => putNutritionDraft(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/publish', request: { params, body: body(publishSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => publishNutrition(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/revert', request: { params, body: body(revertSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => revertNutrition(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/assign', request: { params, body: body(assignSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => assignNutrition(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/duplicate', request: { params }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => duplicateNutrition(tx, auth, c.req.valid('param').id)), 201);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions', request: { params, query: listQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listNutritionVersions(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/assignment-clients', request: { params, query: listQuery.extend({ q: z.string().trim().max(200).optional() }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => assignmentClients(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions/{versionNo}', request: { params: versionParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => getNutritionVersion(tx, auth, c.req.valid('param').id, c.req.valid('param').versionNo)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions/{a}/diff/{b}', request: { params: params.extend({ a: versionNo, b: versionNo }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => nutritionDiff(tx, auth, c.req.valid('param').id, c.req.valid('param').a, c.req.valid('param').b)), 200);
});
router.openapi(createRoute({ method: 'put', path: '/{id}/versions/{versionNo}', request: { params: versionParams, body: body(z.object({ document: draftDocumentSchema }).strict()) }, responses: errors }), async c => {
  const auth = c.get('auth'); return transaction(auth, tx => refuseNutritionVersionWrite(tx, auth, c.req.valid('param').id, c.req.valid('param').versionNo));
});

// R0c: 0008 owns attribution and audit; archive and restore return the head row.
router.openapi(createRoute({ method: 'post', path: '/{id}/archive', request: { params: params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'nutrition', c.req.valid('param').id, true)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/unarchive', request: { params: params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'nutrition', c.req.valid('param').id, false)), 200);
});
