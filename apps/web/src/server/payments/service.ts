import { clientColumns } from '@dawlyy/db';
import { payments, subscriptions, subscriptionEvents, media } from '@dawlyy/db/schema';
import { transition } from '@dawlyy/core/state';
import { PaymentState, SubscriptionState } from '@dawlyy/core/types';
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import type { AuthContext, Tx } from '../db';
import { requireBillingPermission } from './permission';
import { conflict, forbidden, notFound, unprocessable, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { paymentInput, paymentQuery } from '../subscriptions/contracts';
import { moneyMinor, moneyNumber } from './money';

type Payment = typeof payments.$inferSelect;
type Input = z.infer<typeof paymentInput>;

function pgCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? pgCode(error.cause) : undefined;
}

/** T3b / §12.1: RLS-visible payment history with stable (created_at,id) keyset pagination. */
export async function listPayments(tx: Tx, auth: AuthContext, query: z.infer<typeof paymentQuery>, mine = false) {
  if (mine) { if (auth.role !== 'client' || !auth.clientId) throw forbidden(); }
  else requireBillingPermission(auth, 'view');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !/^[01]:/.test(cursor.k) || !z.iso.datetime().safeParse(cursor.k.slice(2)).success || !z.uuid().safeParse(cursor.id).success)) throw validationError(undefined, 'Invalid payment cursor');
  // One composite sort key puts pending rows first, with millisecond precision matching the cursor representation.
  const sortKey = sql<string>`(case when ${payments.state} = 'pending' then '0:' else '1:' end) || to_char(${payments.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  const conditions = [eq(payments.tenantId, auth.tenantId)];
  if (mine && auth.clientId) conditions.push(eq(payments.clientId, auth.clientId));
  if (!mine && query.clientId) conditions.push(eq(payments.clientId, query.clientId));
  if (query.state) conditions.push(eq(payments.state, query.state));
  if (query.method) conditions.push(eq(payments.method, query.method));
  if (cursor) conditions.push(or(gt(sortKey, String(cursor.k)), and(eq(sortKey, String(cursor.k)), gt(payments.id, cursor.id)))!);
  const rows = await tx.select(clientColumns.payments).from(payments).where(and(...conditions))
    .orderBy(asc(sortKey), asc(payments.id)).limit(limit + 1);
  return page(rows, limit, (row) => `${row.state === 'pending' ? '0' : '1'}:${row.createdAt.toISOString()}`);
}

/** T3b: coach detail; clients use mine and never receive internal notes. */
export async function getPayment(tx: Tx, auth: AuthContext, id: string) {
  requireBillingPermission(auth, 'view');
  const [row] = await tx.select(clientColumns.payments).from(payments)
    .where(and(eq(payments.tenantId, auth.tenantId), eq(payments.id, id))).limit(1);
  if (!row) throw notFound();
  return row;
}

/** T3b: record a pending manual payment; receipt allocation is exclusively the verification trigger. */
export async function createPayment(tx: Tx, auth: AuthContext, subscriptionId: string, input: Input) {
  requireBillingPermission(auth, 'create');
  const [sub] = await tx.select({ id: subscriptions.id, clientId: subscriptions.clientId, currency: subscriptions.currency })
    .from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, subscriptionId))).limit(1);
  if (!sub) throw notFound();
  if (input.currency !== sub.currency) throw validationError(undefined, 'Payment currency must match the subscription');
  if (input.proofMediaId) {
    const [proof] = await tx.select({ id: media.id }).from(media).where(and(eq(media.tenantId, auth.tenantId),
      eq(media.clientId, sub.clientId), eq(media.id, input.proofMediaId), eq(media.purpose, 'payment_proof'), sql`${media.deletedAt} is null`)).limit(1);
    if (!proof) throw notFound('Payment proof not found');
  }
  try {
    // §12.1(13): never upsert payments; rollback counter changes before translating unique violations.
    return await tx.transaction(async (savepoint) => {
      const [row] = await savepoint.insert(payments).values({ tenantId: auth.tenantId, clientId: sub.clientId,
        subscriptionId, amount: moneyNumber(moneyMinor(input.amount)), currency: input.currency, method: input.method,
        proofMediaId: input.proofMediaId, reference: input.reference }).returning(clientColumns.payments);
      if (!row) throw notFound();
      return row;
    });
  } catch (error) {
    if (pgCode(error) === '23505') throw conflict('Payment already exists');
    throw error;
  }
}

/** T3b / §9.2: semantic money history, in the same transaction as the write. */
export async function paymentSemantic(tx: Tx, action: 'verify' | 'reject' | 'refund', id: string, reason?: string) {
  const audit = { verify: 'payment.verify', reject: 'payment.reject', refund: 'payment.refund' } as const;
  const event = { verify: 'payment.verified', reject: 'payment.rejected', refund: 'payment.refunded' } as const;
  await tx.execute(sql`select app.audit(${audit[action]}, 'payments', ${id}, null, null, ${reason ?? null})`);
  await tx.execute(sql`select app.emit_event(${event[action]}, 'payments', ${id})`);
}

/** T3b: serialised verification; duplicate verifies return the existing receipt and activate at most once. */
export async function verifyPayment(tx: Tx, auth: AuthContext, id: string) {
  requireBillingPermission(auth, 'verify');
  requireBillingPermission(auth, 'edit'); // payments/subscriptions guards require this independently.
  const [row] = await tx.select(clientColumns.payments).from(payments)
    .where(and(eq(payments.tenantId, auth.tenantId), eq(payments.id, id))).for('update');
  if (!row) throw notFound();
  if (row.state === 'verified') return row;
  const result = transition('payment', row.state, 'verify');
  if (!result.ok) throw unprocessable('transition_refused', result.message, { from: row.state, event: 'verify' });
  const [updated] = await tx.update(payments).set({ state: PaymentState.parse(result.to) })
    .where(and(eq(payments.tenantId, auth.tenantId), eq(payments.id, id))).returning(clientColumns.payments);
  if (!updated) throw notFound();
  if (row.subscriptionId) {
    const [sub] = await tx.select().from(subscriptions)
      .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, row.subscriptionId))).for('update');
    if (!sub) throw notFound();
    if (sub.state === 'pending') {
      const activation = transition('subscription', sub.state, 'activate');
      if (!activation.ok) throw unprocessable('transition_refused', activation.message, { from: sub.state, event: 'activate' });
      await tx.update(subscriptions).set({ state: SubscriptionState.parse(activation.to) })
        .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, sub.id)));
      await tx.insert(subscriptionEvents).values({ tenantId: auth.tenantId, clientId: sub.clientId, subscriptionId: sub.id,
        kind: 'activated', fromState: sub.state, toState: 'active', oldEndsOn: sub.endsOn, newEndsOn: sub.endsOn });
    }
  }
  await paymentSemantic(tx, 'verify', id);
  return updated;
}

/** T3b: reject a pending payment or add an exact cumulative refund; full refunds follow the core machine. */
export async function changePayment(tx: Tx, auth: AuthContext, id: string, action: 'reject' | 'refund', input: { reason?: string; amount?: string | number }) {
  requireBillingPermission(auth, 'verify'); // refund is not an Action; §6.3 / §7.11.4 use verify.
  requireBillingPermission(auth, 'edit');
  const [row] = await tx.select(clientColumns.payments).from(payments)
    .where(and(eq(payments.tenantId, auth.tenantId), eq(payments.id, id))).for('update');
  if (!row) throw notFound();
  const result = transition('payment', row.state, action);
  if (!result.ok) throw unprocessable('transition_refused', result.message, { from: row.state, event: action });
  let changes: Partial<Payment>;
  if (action === 'reject') {
    if (!input.reason?.trim()) throw validationError(undefined, 'A rejection reason is required');
    changes = { state: 'rejected', rejectedReason: input.reason.trim() };
  } else {
    const paid = moneyMinor(row.amount);
    const previous = row.refundAmount === null ? 0 : moneyMinor(row.refundAmount);
    const amount = input.amount === undefined ? paid - previous : moneyMinor(input.amount);
    if (amount <= 0 || previous + amount > paid) throw validationError(undefined, 'Refund must be positive and no more than the remaining payment');
    const total = previous + amount;
    changes = { refundAmount: moneyNumber(total), state: total === paid ? 'refunded' : 'verified' };
  }
  const [updated] = await tx.update(payments).set(changes)
    .where(and(eq(payments.tenantId, auth.tenantId), eq(payments.id, id))).returning(clientColumns.payments);
  if (!updated) throw notFound();
  await paymentSemantic(tx, action, id, input.reason);
  return updated;
}
