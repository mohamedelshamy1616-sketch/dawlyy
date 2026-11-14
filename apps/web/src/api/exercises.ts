import { setLibraryArchived } from '../server/archive';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { exerciseImportTemplate } from '@dawlyy/core/csv';
import { ExerciseSeed } from '@dawlyy/core/types';
import type { ApiEnv } from './env';
import { forbidden, validationError } from './errors';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotencyRequestHash, idempotencyMiddleware, idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { requirePermission } from '../server/require-permission';
import { exerciseInput, exercisePatch, importInput, columnMapping } from '../server/exercises/validation';
import { listExercises, getExercise, createExercise, updateExercise, customiseExercise, setExerciseHidden, getCategories, replaceCategories, previewExerciseImport, commitExerciseImport } from '../server/exercises/service';

const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const json = <T extends z.ZodType>(schema: T) => ({ description: 'Success', content: { 'application/json': { schema } } });
const idParams = z.object({ id: z.uuid() });
const detail = exerciseInput.extend({ id: z.uuid(), slug: z.string(), basedOnId: z.uuid().nullable(), source: z.string(), hidden: z.boolean(), editable: z.boolean(), thumbnailUrl: z.string().optional(), movementPattern: z.string(), difficulty: z.string(), plane: z.string() });
const item = z.object({ id: z.uuid(), name: z.object({ ar: z.string().optional(), en: z.string().optional() }), primaryMuscles: z.array(z.string()), equipment: z.array(z.string()), category: z.string(), source: z.string(), hidden: z.boolean(), editable: z.boolean(), thumbnailUrl: z.string().optional() });
const query = z.object({
  q: z.string().max(200).optional(), category: z.string().max(200).optional(), muscle: z.string().max(200).optional(),
  equipment: z.string().max(200).optional(), pattern: z.string().max(200).optional(), difficulty: z.string().max(200).optional(),
  archived: z.enum(['true', 'false']).optional(), source: z.enum(['system', 'coach']).optional(), includeHidden: z.enum(['true', 'false']).optional(),
  limit: z.string().optional(), cursor: z.string().max(2048).optional(),
});
const categoriesInput = z.object({ categories: z.array(z.string().trim().min(1).max(200)).max(100) }).strict();
const previewRow = z.object({ row: z.number().int(), status: z.enum(['ok', 'duplicate', 'error']), errors: z.array(z.object({ code: z.string(), field: z.string().optional() })), normalized: ExerciseSeed.optional() });
const previewResult = z.object({ headers: z.array(z.string()), mapping: columnMapping, missingRequiredMappings: z.array(z.string()), rows: z.array(previewRow), counts: z.object({ total: z.number().int(), ok: z.number().int(), duplicate: z.number().int(), error: z.number().int() }) });
const commitResult = z.object({ inserted: z.number().int(), skipped: z.number().int(), errors: z.array(previewRow) });
const importHashes = new WeakMap<Request, string>();

/** Task 4: authenticated coach exercise library and CSV import, mounted at /api/v1/exercises. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => {
  const auth = c.get('auth');
  const path = c.req.path.replace(/\/$/, '');
  const action = c.req.method === 'GET' ? 'view'
    : path.endsWith('/import/preview') || path.endsWith('/import/commit') || (c.req.method === 'POST' && path.endsWith('/exercises')) ? 'create' : 'edit';
  requirePermission(auth, 'exercises', action);
  if (path.endsWith('/customise')) requirePermission(auth, 'exercises', 'create');
  if (c.req.method === 'PUT' && path.endsWith('/categories') && auth.role !== 'owner') throw forbidden();
  await next();
});
router.use('*', idempotencyMiddleware);
router.use('*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path.endsWith('/import/commit')) {
    importHashes.set(c.req.raw, idempotencyRequestHash(c.get('auth'), c.req.method, c.req.path, new Uint8Array(await c.req.raw.clone().arrayBuffer())));
  }
  try { await next(); } finally { importHashes.delete(c.req.raw); }
});
router.use('*', idempotentReplay);

router.openapi(createRoute({ method: 'get', path: '/', request: { query }, responses: { 200: json(z.object({ items: z.array(item), nextCursor: z.string().nullable() })), ...errors } }), async (c) => {
  const input = c.req.valid('query');
  return c.json(await withAuthTx(c.get('auth'), (tx) => listExercises(tx, c.get('auth'), { ...input, includeHidden: input.includeHidden === 'true' })), 200);
});
// Static paths precede /{id} so categories and import never resolve as UUIDs.
router.openapi(createRoute({ method: 'get', path: '/categories', responses: { 200: json(z.object({ categories: z.array(z.string()) })), ...errors } }), async (c) =>
  c.json({ categories: await withAuthTx(c.get('auth'), (tx) => getCategories(tx, c.get('auth'))) }, 200));
router.openapi(createRoute({ method: 'put', path: '/categories', request: { body: { required: true, content: { 'application/json': { schema: categoriesInput } } } }, responses: { 200: json(categoriesInput), ...errors } }), async (c) =>
  c.json(await withAuthTx(c.get('auth'), (tx) => replaceCategories(tx, c.get('auth'), c.req.valid('json').categories)), 200));
router.openapi(createRoute({ method: 'get', path: '/import/template', responses: { 200: { description: 'Exercise CSV template', content: { 'text/csv': { schema: z.string() } } }, ...errors } }), (c) => {
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="exercises.csv"');
  return c.body(exerciseImportTemplate(), 200);
});
router.openapi(createRoute({ method: 'post', path: '/import/preview', request: { body: { required: true, content: { 'application/json': { schema: importInput } } } }, responses: { 200: json(previewResult), ...errors } }), async (c) => {
  const input = c.req.valid('json');
  return c.json(await withAuthTx(c.get('auth'), (tx) => previewExerciseImport(tx, c.get('auth'), input.csv, input.mapping)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/import/commit', request: { headers: z.object({ 'idempotency-key': z.string().trim().min(1).max(200) }), body: { required: true, content: { 'application/json': { schema: importInput.extend({ mapping: columnMapping, onDuplicate: z.enum(['skip', 'import_anyway']) }) } } } }, responses: { 200: json(commitResult), ...errors } }), async (c) => {
  const key = c.get('idempotencyKey');
  const requestHash = importHashes.get(c.req.raw);
  if (!key || !requestHash) throw validationError(undefined, 'Idempotency-Key is required for import commit');
  const input = c.req.valid('json');
  return c.json(await withAuthTx(c.get('auth'), (tx) => commitExerciseImport(tx, c.get('auth'), input.csv, input.mapping, input.onDuplicate, { key, requestHash })), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params: idParams }, responses: { 200: json(detail), ...errors } }), async (c) =>
  c.json(await withAuthTx(c.get('auth'), (tx) => getExercise(tx, c.get('auth'), c.req.valid('param').id)), 200));
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: exerciseInput } } } }, responses: { 201: json(detail), ...errors } }), async (c) =>
  c.json(await withAuthTx(c.get('auth'), (tx) => createExercise(tx, c.get('auth'), c.req.valid('json'))), 201));
router.openapi(createRoute({ method: 'patch', path: '/{id}', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: exercisePatch } } } }, responses: { 200: json(detail), ...errors } }), async (c) =>
  c.json(await withAuthTx(c.get('auth'), (tx) => updateExercise(tx, c.get('auth'), c.req.valid('param').id, c.req.valid('json'))), 200));
router.openapi(createRoute({ method: 'post', path: '/{id}/customise', request: { params: idParams }, responses: { 201: json(detail), ...errors } }), async (c) =>
  c.json(await withAuthTx(c.get('auth'), (tx) => customiseExercise(tx, c.get('auth'), c.req.valid('param').id)), 201));
for (const operation of ['hide', 'unhide'] as const) {
  router.openapi(createRoute({ method: 'post', path: `/{id}/${operation}`, request: { params: idParams }, responses: { 200: json(z.object({ id: z.uuid(), hidden: z.boolean() })), ...errors } }), async (c) =>
    c.json(await withAuthTx(c.get('auth'), (tx) => setExerciseHidden(tx, c.get('auth'), c.req.valid('param').id, operation === 'hide')), 200));
}

// R0c: 0008 owns attribution and audit; archive and restore return the head row.
router.openapi(createRoute({ method: 'post', path: '/{id}/archive', request: { params: idParams }, responses: { 200: json(z.unknown()), ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'exercises', c.req.valid('param').id, true)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/unarchive', request: { params: idParams }, responses: { 200: json(z.unknown()), ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => setLibraryArchived(tx, auth, 'exercises', c.req.valid('param').id, false)), 200);
});
