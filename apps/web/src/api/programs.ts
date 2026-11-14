import { setLibraryArchived } from '../server/archive';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { ProgramDocument } from '@dawlyy/core/types';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapProgramError } from '../server/programs/helpers';
import { getProgram, getProgramVersion, listPrograms, listProgramAssignmentClients, listProgramVersions, programDiff } from '../server/programs/read';
import { applyProgramOperations, assignProgram, createProgram, duplicateProgram, patchProgram, publishProgram, putProgramDraft, refuseVersionWrite, revertProgram, transitionProgram } from '../server/programs/service';
import { assignSchema, createProgramSchema, draftSchema, opsSchema, patchProgramSchema, programListSchema, publishSchema, revertSchema } from '../server/programs/schemas';

/** Task 4 / doc §12.1: authenticated coach program templates, versions, publishing and private assignment. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
// Deny client-role callers before validation, replay lookups or any coach-data read.
router.use('*', idempotentReplay);

const params = z.object({ id: z.string().uuid() });
const numberParam = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().positive().max(2147483647));
const versionParams = params.extend({ versionNo: numberParam });
const diffParams = params.extend({ a: numberParam, b: numberParam });
const listQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
const json = { description: 'Coach program data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Programs'];

async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (error) { throw mapProgramError(error); }
}

router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: programListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listPrograms(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', tags, request: { body: body(createProgramSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => createProgram(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', tags, request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => getProgram(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', tags, request: { params, body: body(patchProgramSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => patchProgram(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'put', path: '/{id}/draft', tags, request: { params, body: body(draftSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => putProgramDraft(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/ops', tags, request: { params, body: body(opsSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => applyProgramOperations(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
for (const action of ['submit-review', 'approve'] as const) {
  router.openapi(createRoute({ method: 'post', path: `/{id}/${action}`, tags, request: { params }, responses: { 200: json, ...errors } }), async c => {
    const auth = c.get('auth');
    return c.json(await transaction(auth, tx => transitionProgram(tx, auth, c.req.valid('param').id, action)), 200);
  });
}
router.openapi(createRoute({ method: 'post', path: '/{id}/publish', tags, request: { params, body: body(publishSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => publishProgram(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions', tags, request: { params, query: listQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listProgramVersions(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/assignment-clients', tags, request: { params, query: listQuery.extend({ q: z.string().trim().max(200).optional() }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listProgramAssignmentClients(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions/{versionNo}', tags, request: { params: versionParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const { id, versionNo } = c.req.valid('param');
  return c.json(await transaction(auth, tx => getProgramVersion(tx, auth, id, versionNo)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}/versions/{a}/diff/{b}', tags, request: { params: diffParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const { id, a, b } = c.req.valid('param');
  return c.json(await transaction(auth, tx => programDiff(tx, auth, id, a, b)), 200);
});
for (const method of ['patch', 'put'] as const) {
  router.openapi(createRoute({ method, path: '/{id}/versions/{versionNo}', tags, request: { params: versionParams, body: body(z.object({ document: ProgramDocument }).strict()) }, responses: errors }), async c => {
    const auth = c.get('auth'); const { id, versionNo } = c.req.valid('param');
    return transaction(auth, tx => refuseVersionWrite(tx, auth, id, versionNo));
  });
}
router.openapi(createRoute({ method: 'post', path: '/{id}/revert', tags, request: { params, body: body(revertSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => revertProgram(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/duplicate', tags, request: { params }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => duplicateProgram(tx, auth, c.req.valid('param').id)), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/assign', tags, request: { params, body: body(assignSchema) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => assignProgram(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 201);
});

// R0c: 0008 owns attribution and audit; archive and restore return the head row.
router.openapi(createRoute({ method: 'post', path: '/{id}/archive', request: { params: params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'programs', c.req.valid('param').id, true)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/unarchive', request: { params: params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'programs', c.req.valid('param').id, false)), 200);
});
