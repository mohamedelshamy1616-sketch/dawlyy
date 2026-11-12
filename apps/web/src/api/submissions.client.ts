import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { isTransitionRefusal, mapFormError } from '../server/forms/helpers';
import { saveAnswers, submitAnswers } from '../server/forms/submissions';
import { answersSchema } from '../server/forms/schemas';

/** Task 7 / §12.1: own-client answer sync and coach review of pinned form snapshots. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
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
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'put', path: '/{id}/answers', tags, request: { params, body: body(answersSchema) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => saveAnswers(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'post', path: '/{id}/submit', tags, request: { params }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => submitAnswers(tx, auth, c.req.valid('param').id), true), 200);
});
