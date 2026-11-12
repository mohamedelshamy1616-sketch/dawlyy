import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { requireBillingPermission } from '../server/payments/permission';
import { billingErrorHandler } from '../server/subscriptions/http';
import { syncSubscriptionCalendar } from '../server/subscriptions/calendar';
import { listSubscriptions, getSubscription, sellPackage, changeSubscription } from '../server/subscriptions/service';
import { subscriptionQuery, saleInput, extensionInput, freezeInput, resumeInput, reasonInput, idParams, errors, jsonResult } from '../server/subscriptions/contracts';

// Task 3: subscription lifecycle.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(billingErrorHandler);

router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => {
  if (c.req.method === 'POST') requireBillingPermission(c.get('auth'), /\/(extend|freeze|resume|cancel)$/.test(c.req.path) ? 'edit' : 'create');
  await next();
});
router.use('*', idempotentReplay);

router.openapi(createRoute({ method: 'get', path: '/', request: { query: subscriptionQuery }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => listSubscriptions(tx, auth, c.req.valid('query'))), 200);
});
// Static routes must precede /{id}.
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params: idParams }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => getSubscription(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: saleInput } } } }, responses: { 201: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const result = await withAuthTx(auth, (tx) => sellPackage(tx, auth, c.req.valid('json')));
  await syncSubscriptionCalendar(auth.tenantId, result.subscription.id, 'package sale');
  return c.json(result, 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/extend', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: extensionInput } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); const { id } = c.req.valid('param');
  const result = await withAuthTx(auth, (tx) => changeSubscription(tx, auth, id, 'extend', c.req.valid('json')));
  await syncSubscriptionCalendar(auth.tenantId, id, 'subscription extension');
  return c.json(result, 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/freeze', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: freezeInput } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); const { id } = c.req.valid('param');
  const result = await withAuthTx(auth, (tx) => changeSubscription(tx, auth, id, 'freeze', c.req.valid('json')));
  await syncSubscriptionCalendar(auth.tenantId, id, 'subscription freeze');
  return c.json(result, 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/resume', request: { params: idParams, body: { required: false, content: { 'application/json': { schema: resumeInput } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); const { id } = c.req.valid('param');
  const result = await withAuthTx(auth, (tx) => changeSubscription(tx, auth, id, 'resume', c.req.valid('json') ?? {}));
  await syncSubscriptionCalendar(auth.tenantId, id, 'subscription resume');
  return c.json(result, 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/cancel', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: reasonInput } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); const { id } = c.req.valid('param');
  const result = await withAuthTx(auth, (tx) => changeSubscription(tx, auth, id, 'cancel', c.req.valid('json')));
  await syncSubscriptionCalendar(auth.tenantId, id, 'subscription cancellation');
  return c.json(result, 200);
});
