import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { mapMessagingError } from '../server/messaging/errors';
import { getReviewPreferences, putReviewPreferences } from '../server/review/preferences';
import { applyReviewProposal } from '../server/review/proposals';
import { draftParamsSchema, buildReviewSchema, editReviewSchema, approveReviewSchema, proposalReviewSchema, reviewParamsSchema, reviewPreferencesSchema } from '../server/review/schemas';
import { textHashSchema } from '../server/review/schemas';
import { approveReview, buildReview, editReview, finalizeReviewApproval, getLatestReview } from '../server/review/service';

const result = { description: 'Weekly review data', content: { 'application/json': { schema: z.unknown() } } };
const draftSchema = z.object({
  id: z.uuid(), clientId: z.uuid(), status: z.enum(['draft', 'approved', 'rejected', 'stale']),
  provider: z.enum(['none', 'anthropic', 'openrouter']), inputVersion: z.string(), createdAt: z.string(),
  review: z.unknown(), text: z.string(), textHash: textHashSchema, evidenceUnavailable: z.array(z.string()),
  proposalDraft: z.object({ planId: z.uuid(), versionId: z.uuid(), versionNo: z.number().int().positive() }).nullable(),
});
const jsonResult = <T extends z.ZodType>(description: string, schema: T) => ({ description, content: { 'application/json': { schema } } });
const draftResult = jsonResult('Review draft and digest of its stored text', draftSchema);
const approvalResult = jsonResult('Approved message', z.object({
  draftId: z.uuid(), status: z.literal('approved'), conversationId: z.uuid(), messageId: z.uuid(), notified: z.boolean(),
}));
const draftConflict = jsonResult('Review conflict. A draft_changed error includes the current draft.', z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.object({ draft: draftSchema }).optional() }),
}));
const error = { description: 'Standard error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const hook = { defaultHook: (outcome: { success: boolean; error?: { issues: unknown } }) => { if (!outcome.success) throw validationError(outcome.error?.issues); } };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });

/**
 * R4b / C15: fail-closed staff-only weekly review. Mounted at `/clients`, so every path below is
 * `/api/v1/clients/{clientId}/review...`. The service enforces clients view plus checkins review before any read.
 */
export const router = new OpenAPIHono<ApiEnv>(hook);
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });

router.openapi(createRoute({ method: 'get', path: '/{clientId}/review', tags: ['Review'], request: { params: reviewParamsSchema }, responses: { 200: jsonResult('Latest review', z.object({ draft: draftSchema.nullable() })), ...errors } }), async c => {
  const auth = c.get('auth'); const { clientId } = c.req.valid('param');
  return c.json({ draft: await withAuthTx(auth, tx => getLatestReview(tx, auth, clientId)) }, 200);
});
router.openapi(createRoute({ method: 'post', path: '/{clientId}/review', tags: ['Review'], middleware: [idempotentReplay] as const, request: { params: reviewParamsSchema, body: body(buildReviewSchema) }, responses: { 201: draftResult, ...errors } }), async c => {
  const auth = c.get('auth'); const { clientId } = c.req.valid('param'); const input = c.req.valid('json');
  return c.json(await withAuthTx(auth, tx => buildReview(tx, auth, clientId, input)), 201);
});
router.openapi(createRoute({ method: 'patch', path: '/{clientId}/review/{draftId}', tags: ['Review'], middleware: [idempotentReplay] as const, request: { params: draftParamsSchema, body: body(editReviewSchema) }, responses: { 200: draftResult, ...errors, 409: draftConflict } }), async c => {
  const auth = c.get('auth'); const { clientId, draftId } = c.req.valid('param'); const input = c.req.valid('json');
  return c.json(await withAuthTx(auth, tx => editReview(tx, auth, clientId, draftId, input)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{clientId}/review/{draftId}/approve', tags: ['Review'], middleware: [idempotentReplay] as const, request: { params: draftParamsSchema, body: body(approveReviewSchema) }, responses: { 200: approvalResult, ...errors, 409: draftConflict } }), async c => {
  const auth = c.get('auth'); const { clientId, draftId } = c.req.valid('param');
  const { expectedTextHash } = c.req.valid('json');
  // The stale mark must COMMIT: the transaction returns a typed result and only then is it mapped to 409.
  const outcome = await withAuthTx(auth, tx => approveReview(tx, auth, clientId, draftId, expectedTextHash)).catch((failure: unknown) => { throw mapMessagingError(failure); });
  return c.json(await finalizeReviewApproval(auth, outcome), 200);
});
const proposalResponse = { 200: result, 201: result, ...errors };
router.openapi(createRoute({ method: 'post', path: '/{clientId}/review/{draftId}/proposal', tags: ['Review'], middleware: [idempotentReplay] as const, request: { params: draftParamsSchema, body: body(proposalReviewSchema) }, responses: proposalResponse }), async c => {
  const auth = c.get('auth'); const { clientId, draftId } = c.req.valid('param'); const input = c.req.valid('json');
  const outcome = await withAuthTx(auth, tx => applyReviewProposal(tx, auth, clientId, draftId, input));
  if (outcome.kind === 'stale') return c.json({ error: { code: 'review_stale', message: 'Data changed; rebuild this review' } }, 409);
  return outcome.created ? c.json(outcome.result, 201) : c.json(outcome.result, 200);
});

/** R4b / C15: the caller's own review preferences; mounted at `/settings/review-preferences`. */
export const reviewPreferencesRouter = new OpenAPIHono<ApiEnv>(hook);
reviewPreferencesRouter.use('*', requireAuthMiddleware);
reviewPreferencesRouter.use('*', requireStaffRole);
reviewPreferencesRouter.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
reviewPreferencesRouter.openapi(createRoute({ method: 'get', path: '/', tags: ['Review'], responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => getReviewPreferences(tx, auth)), 200);
});
reviewPreferencesRouter.openapi(createRoute({ method: 'put', path: '/', tags: ['Review'], middleware: [idempotentReplay] as const, request: { body: body(reviewPreferencesSchema) }, responses: { 200: result, ...errors } }), async c => {
  const auth = c.get('auth'); const input = c.req.valid('json');
  return c.json(await withAuthTx(auth, tx => putReviewPreferences(tx, auth, input)), 200);
});
