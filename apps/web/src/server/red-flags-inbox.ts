import 'server-only';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isAllowed } from '@dawlyy/core/authz';
import { redFlags } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from './db';
import { forbidden, notFound, validationError } from '../api/errors';
import { page, parseListQuery } from '../api/lib/pagination';
import { requirePermission } from './require-permission';

/** C15: staff-only; reachable solely from the requireStaffRole red-flags router, never from client-facing code. */
const columns = { id: redFlags.id, clientId: redFlags.clientId, source: redFlags.source, sourceId: redFlags.sourceId,
  category: redFlags.category, matched: redFlags.matched, status: redFlags.status, handledBy: redFlags.handledBy,
  handledAt: redFlags.handledAt, createdAt: redFlags.createdAt };
/** R0c/R4c: staff-only newest-first inbox; RLS supplies assigned scope. */
export async function listRedFlags(tx: Tx, auth: AuthContext, query: { status?: 'open' | 'handled'; clientId?: string; limit?: string; cursor?: string }) {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'clients', 'view');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (!z.uuid().safeParse(cursor.id).success || typeof cursor.k !== 'string' || !z.iso.datetime({ offset: true }).safeParse(cursor.k).success)) throw validationError();
  const stamp = sql<string>`to_char(${redFlags.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const rows = await tx.select({ ...columns, cursorStamp: stamp }).from(redFlags).where(and(eq(redFlags.tenantId, auth.tenantId),
    eq(redFlags.status, query.status ?? 'open'), query.clientId ? eq(redFlags.clientId, query.clientId) : undefined,
    cursor ? or(sql`${redFlags.createdAt} < ${cursor.k}::timestamptz`, and(sql`${redFlags.createdAt} = ${cursor.k}::timestamptz`, lt(redFlags.id, cursor.id))) : undefined))
    .orderBy(desc(redFlags.createdAt), desc(redFlags.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.cursorStamp);
  return { ...result, items: result.items.map(({ cursorStamp, ...row }) => { void cursorStamp; return row; }) };
}
/** R0c/R4c: handling grants are alternatives; the trigger stamps identity/time and writes the audit. */
export async function handleRedFlag(tx: Tx, auth: AuthContext, id: string) {
  if (auth.role === 'client' || !(isAllowed(auth, 'clients', 'review') || isAllowed(auth, 'checkins', 'review'))) throw forbidden();
  requirePermission(auth, isAllowed(auth, 'clients', 'review') ? 'clients' : 'checkins', 'review');
  const scope = and(eq(redFlags.tenantId, auth.tenantId), eq(redFlags.id, id));
  const [row] = await tx.select(columns).from(redFlags).where(scope).for('update');
  if (!row) throw notFound(); if (row.status === 'handled') return row;
  const [handled] = await tx.update(redFlags).set({ status: 'handled' }).where(scope).returning(columns);
  if (!handled) throw notFound(); return handled;
}
