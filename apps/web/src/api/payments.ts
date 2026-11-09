import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { requireBillingPermission } from '../server/payments/permission';
import { billingErrorHandler } from '../server/subscriptions/http';
import { listPayments, getPayment } from '../server/payments/service';
import { manualPaymentProvider } from '../server/payments/provider';
import { syncSubscriptionCalendar } from '../server/subscriptions/calendar';
import { paymentInput, paymentQuery, reasonInput, amountSchema, idParams, errors, jsonResult } from '../server/subscriptions/contracts';

// Task 3: manual payments.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(billingErrorHandler);
router.use('*', requireAuthMiddleware);
router.use('*', async (c, next) => {
  if (c.req.method === 'POST') {
    const auth = c.get('auth');
    if (/\/(verify|reject|refund)$/.test(c.req.path)) {
      requireBillingPermission(auth, 'verify'); requireBillingPermission(auth, 'edit');
    } else requireBillingPermission(auth, 'create');
  }
  await next();
});
router.use('*', idempotentReplay);

router.openapi(createRoute({ method: 'get', path: '/', request: { query: paymentQuery }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => listPayments(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'get', path: '/mine', request: { query: paymentQuery }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => listPayments(tx, auth, c.req.valid('query'), true)), 200);
});
router.openapi(createRoute({ method: 'get', path: '/{id}', request: { params: idParams }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => getPayment(tx, auth, c.req.valid('param').id)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: paymentInput.extend({ subscriptionId: z.uuid() }) } } } }, responses: { 201: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth'); const body = c.req.valid('json');
  return c.json(await withAuthTx(auth, (tx) => manualPaymentProvider.record(tx, auth, body.subscriptionId, body)), 201);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/verify', request: { params: idParams, body: { required: false, content: { 'application/json': { schema: z.object({}).strict().optional() } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const payment = await withAuthTx(auth, (tx) => manualPaymentProvider.verify(tx, auth, c.req.valid('param').id));
  if (payment.subscriptionId) await syncSubscriptionCalendar(auth.tenantId, payment.subscriptionId, 'payment verification');
  return c.json(payment, 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/reject', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: reasonInput } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => manualPaymentProvider.reject(tx, auth, c.req.valid('param').id, c.req.valid('json').reason)), 200);
});
router.openapi(createRoute({ method: 'post', path: '/{id}/refund', request: { params: idParams, body: { required: false, content: { 'application/json': { schema: z.object({ amount: amountSchema.optional() }).strict().optional() } } } }, responses: { 200: jsonResult, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, (tx) => manualPaymentProvider.refund(tx, auth, c.req.valid('param').id, c.req.valid('json')?.amount)), 200);
});
