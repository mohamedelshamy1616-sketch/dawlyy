import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapFormError } from '../server/forms/helpers';
import { clientEvents, clientFormForEvent, clientIntake } from '../server/forms/client-read';

/** Task 7 / §12.1: versioned templates and explicit own-client form projections. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
const query = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
const json = { description: 'Form data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const tags = ['Forms'];
async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>) {
  try { return await withAuthTx(auth, fn); } catch (error) { throw mapFormError(error); }
}
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/intake', tags, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientIntake(tx, auth)), 200);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/events', tags, request: { query: query.extend({ formKind: z.enum(['checkin', 'assessment']) }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientEvents(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/for-client/{eventId}', tags, request: { params: z.object({ eventId: z.uuid() }) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await transaction(auth, tx => clientFormForEvent(tx, auth, c.req.valid('param').eventId)), 200);
});
