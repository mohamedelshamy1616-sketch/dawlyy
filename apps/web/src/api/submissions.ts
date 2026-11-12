import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { isTransitionRefusal, mapFormError } from '../server/forms/helpers';
import { coachSubmission, listSubmissions } from '../server/forms/read';
import { reviewSubmission } from '../server/forms/review';
import { reviewSchema, submissionListSchema } from '../server/forms/schemas';

/** Task 7 / §12.1: own-client answer sync and coach review of pinned form snapshots. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
const params = z.object({ id: z.uuid() });
const json = { description: 'Submission data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Submissions'];
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>, retrySubmit = false): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (error) {
    if (retrySubmit && isTransitionRefusal(error)) {
      try { return await withAuthTx(auth, fn); } catch (retry) { throw mapFormError(retry); }
    }
    throw mapFormError(error);
  }
}
router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: submissionListSchema }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => listSubmissions(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', tags, request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => coachSubmission(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/review', tags, request: { params, body: body(reviewSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => reviewSubmission(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
