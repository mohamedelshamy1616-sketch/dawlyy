import { clientColumns } from '@dawlyy/db';
import { payments } from '@dawlyy/db/schema';
import { and, asc, eq, gt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import type { AuthContext, Tx } from '../db';
import { requireBillingPermission } from './permission';
import { forbidden, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { paymentQuery } from '../subscriptions/contracts';

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

/** Own-client payment history keeps rejectedReason visible. */
export function myPayments(tx: Tx, auth: AuthContext, query: z.infer<typeof paymentQuery>) {
  return listPayments(tx, auth, query, true);
}
