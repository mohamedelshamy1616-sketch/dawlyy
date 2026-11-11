import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapMessagingError } from '../server/messaging/errors';
import { idParams, notificationsQuery, preferencesBody, pushSubscriptionBody } from '../server/messaging/schemas';
import { deletePushSubscription, getPreferences, listNotifications, markAllNotificationsRead, markNotificationRead, putPreferences, registerPushSubscription } from '../server/notify/center';

/**
 * Task 9 / doc section 12.1: the signed-in user's notification center, preferences and Web Push subscriptions.
 * Every route is for any active member and touches only the caller's own rows (RLS `ME(user_id)`), so no module permission applies.
 */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);

const json = { description: 'Notification data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Notifications'];

async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (failure) { throw mapMessagingError(failure); }
}

// Own list with unread count, newest first. 400 bad cursor.
router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: notificationsQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listNotifications(tx, auth, c.req.valid('query'))), 200);
});

// Mark every own notification read.
router.openapi(createRoute({ method: 'post', path: '/read-all', tags, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => markAllNotificationsRead(tx, auth)), 200);
});

// Preferences: quiet hours, channels, language, time zone (stored in user_preferences).
router.openapi(createRoute({ method: 'get', path: '/preferences', tags, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => getPreferences(tx, auth)), 200);
});
router.openapi(createRoute({ method: 'put', path: '/preferences', tags, request: { body: body(preferencesBody) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => putPreferences(tx, auth, c.req.valid('json'))), 200);
});

// Web Push subscriptions. 422 invalid_push_endpoint for a non-https endpoint; 404 deleting someone else's.
router.openapi(createRoute({ method: 'post', path: '/push-subscriptions', tags, request: { body: body(pushSubscriptionBody) }, responses: { 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => registerPushSubscription(tx, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'delete', path: '/push-subscriptions/{id}', tags, request: { params: idParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => deletePushSubscription(tx, auth, c.req.valid('param').id)), 200);
});

// Mark one own notification read. 404 for a missing or foreign id.
router.openapi(createRoute({ method: 'post', path: '/{id}/read', tags, request: { params: idParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => markNotificationRead(tx, auth, c.req.valid('param').id)), 200);
});
