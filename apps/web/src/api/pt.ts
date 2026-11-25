import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { withAuthTx } from '../server/db';
import { closeVisit, correct, ledgerError, openPackage, respond } from '../server/pt/ledger';
import { handleRenewal, requestRenewal } from '../server/pt/renewal';
import { errors } from '../server/subscriptions/contracts';
import { validationError } from './errors';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';

function router() {
  return new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
}
const visit = z.object({ visitId: z.uuid() });
const reason = z.string().trim().min(1).max(500);
const body = <S extends z.ZodType>(schema: S) => ({ required: true as const, content: { 'application/json': { schema } } });
const responses = { 200: { description: 'Recorded', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } }, ...errors };
const receiptResponses = { 200: { description: 'Original session receipt, including on replay', content: {
  'application/json': { schema: z.object({ visit: z.uuid(), date: z.string(), session: z.int(), balance: z.int() }) },
} }, ...errors };

export const ptRouter = router();
ptRouter.use('*', requireAuthMiddleware);
ptRouter.use('*', requireStaffRole);
ptRouter.openapi(createRoute({ method: 'post', path: '/subscriptions/{subscriptionId}/opening-credit', request: {
  params: z.object({ subscriptionId: z.uuid() }), body: body(z.object({ count: z.int().min(0).max(2147483647), reason }).strict()),
}, responses }), async c => {
  const auth = c.get('auth'), { count, reason } = c.req.valid('json');
  await withAuthTx(auth, tx => openPackage(tx, auth, c.req.valid('param').subscriptionId, count, reason)).catch(ledgerError);
  return c.json({ ok: true }, 200);
});
ptRouter.openapi(createRoute({ method: 'post', path: '/visits/{visitId}/close', request: {
  params: visit, body: body(z.object({ subscriptionId: z.uuid() }).strict()),
}, responses: receiptResponses }), async c => {
  const auth = c.get('auth');
  const result = await withAuthTx(auth, tx => closeVisit(tx, auth, c.req.valid('json').subscriptionId, c.req.valid('param').visitId)).catch(ledgerError);
  return c.json(result, 200);
});
ptRouter.openapi(createRoute({ method: 'post', path: '/visits/{visitId}/correction', request: {
  params: visit, body: body(z.object({ reason }).strict()),
}, responses }), async c => {
  const auth = c.get('auth');
  await withAuthTx(auth, tx => correct(tx, auth, c.req.valid('param').visitId, c.req.valid('json').reason)).catch(ledgerError);
  return c.json({ ok: true }, 200);
});

export const ptReceiptsRouter = router();
ptReceiptsRouter.use('*', requireAuthMiddleware);
ptReceiptsRouter.openapi(createRoute({ method: 'post', path: '/{visitId}/{action}', request: {
  params: visit.extend({ action: z.enum(['view', 'confirm', 'dispute']) }),
  body: body(z.object({ note: z.string().trim().max(500).optional() }).strict()),
}, responses }), async c => {
  const auth = c.get('auth'), { visitId, action } = c.req.valid('param'), { note } = c.req.valid('json');
  if (action === 'view' && note !== undefined) throw validationError();
  await withAuthTx(auth, tx => respond(tx, auth, visitId, action, note)).catch(ledgerError);
  return c.json({ ok: true }, 200);
});

const renewalResponse = { 200: { description: 'Open or handled renewal request', content: { 'application/json': { schema: z.object({
  id: z.uuid(), status: z.enum(['open', 'handled']), delivered: z.int(), balance: z.int(), requested: z.string(),
}) } } }, ...errors };
// Mounted before ptRouter: the client asks, the owner or assigned coach marks it handled.
export const ptRenewalsRouter = router();
ptRenewalsRouter.use('*', requireAuthMiddleware);
ptRenewalsRouter.openapi(createRoute({ method: 'post', path: '/', request: {
  body: body(z.object({ subscriptionId: z.uuid() }).strict()),
}, responses: renewalResponse }), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => requestRenewal(tx, auth, c.req.valid('json').subscriptionId)).catch(ledgerError), 200);
});
ptRenewalsRouter.openapi(createRoute({ method: 'post', path: '/{renewalId}/handled', request: {
  params: z.object({ renewalId: z.uuid() }), body: body(z.object({}).strict()),
}, responses }), async c => {
  const auth = c.get('auth');
  await withAuthTx(auth, tx => handleRenewal(tx, auth, c.req.valid('param').renewalId)).catch(ledgerError);
  return c.json({ ok: true }, 200);
});
