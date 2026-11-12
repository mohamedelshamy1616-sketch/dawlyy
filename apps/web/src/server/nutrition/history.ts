import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients, mealLogs, supplementLogs, nutritionPlanVersions } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound } from '../../api/errors';
import { nutritionDate } from './client';

/** History needs a local date and labels from logged versions, without exposing the current plan. */
export async function nutritionHistoryContext(tx: Tx, auth: AuthContext) {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  const [client] = await tx.select({ timezone: clientColumns.clients.timezone }).from(clients)
    .where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, auth.clientId))).limit(1);
  if (!client) throw notFound();
  const meals = await tx.selectDistinct({ id: clientColumns.mealLogs.planVersionId }).from(mealLogs)
    .where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.clientId, auth.clientId)));
  const supplements = await tx.selectDistinct({ id: clientColumns.supplementLogs.planVersionId }).from(supplementLogs)
    .where(and(eq(supplementLogs.tenantId, auth.tenantId), eq(supplementLogs.clientId, auth.clientId)));
  const ids = [...new Set([...meals, ...supplements].flatMap(row => row.id ? [row.id] : []))];
  const versions = ids.length ? await tx.select({ document: clientColumns.nutritionPlanVersions.document }).from(nutritionPlanVersions)
    .where(and(eq(nutritionPlanVersions.tenantId, auth.tenantId), eq(nutritionPlanVersions.clientId, auth.clientId), inArray(nutritionPlanVersions.id, ids))) : [];
  return { localDate: nutritionDate(client.timezone),
    mealNames: Object.fromEntries(versions.flatMap(v => v.document.meals.map(m => [m.id, m.name]))),
    supplementNames: Object.fromEntries(versions.flatMap(v => v.document.supplements.map(s => [s.id, s.name]))),
  };
}
