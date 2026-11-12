import { clientColumns } from '@dawlyy/db';
import { subscriptions, tenants } from '@dawlyy/db/schema';
import { accessStatus } from '@dawlyy/core/subscription';
import { and, desc, eq } from 'drizzle-orm';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound } from '../../api/errors';
import { todayIn } from './timeline';

/** T3b: tenant date used by countdowns and expiry checks. */
export async function tenantToday(tx: Tx, tenantId: string) {
  const [tenant] = await tx.select({ timezone: clientColumns.tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw notFound();
  return { today: todayIn(tenant.timezone), timezone: tenant.timezone };
}

/** T3b / §12.1(2): countdown-only portal response, selected through clientColumns. */
export async function mySubscription(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  const rows = await tx.select(clientColumns.subscriptions).from(subscriptions)
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, auth.clientId)))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id));
  const { today } = await tenantToday(tx, auth.tenantId);
  const sub = rows.find((row) => accessStatus(row, today).hasAccess) ?? rows[0];
  return sub ? { subscription: sub, accessStatus: accessStatus(sub, today) } : { subscription: null, accessStatus: null };
}
