import 'server-only';
import { requireClientModule } from '../client-modules';
import { historyError, requireHistoryWrite } from '../history-controls';
import { raiseRedFlags } from '../red-flags';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients, mealLogs, supplementLogs, metricEntries, nutritionPlans, nutritionPlanVersions } from '@dawlyy/db/schema';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound, unprocessable, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import type { mealLogSchema, supplementLogSchema, waterSchema, logListSchema } from './schemas';

function own(auth: AuthContext): string {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  requirePermission(auth, 'nutrition', 'view'); return auth.clientId;
}
// Validate references for log writes without returning the current nutrition view or changing log access rules.
async function logPlan(tx: Tx, auth: AuthContext, clientId: string) {
  const [head] = await tx.select({ id: clientColumns.nutritionPlans.id, publishedVersionId: clientColumns.nutritionPlans.publishedVersionId })
    .from(nutritionPlans).where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, clientId), isNull(nutritionPlans.archivedAt)))
    .orderBy(desc(nutritionPlans.createdAt), desc(nutritionPlans.id)).limit(1);
  const [version] = head?.publishedVersionId ? await tx.select({ id: clientColumns.nutritionPlanVersions.id, document: clientColumns.nutritionPlanVersions.document })
    .from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.id, head.publishedVersionId), eq(nutritionPlanVersions.planId, head.id),
      eq(nutritionPlanVersions.tenantId, auth.tenantId), eq(nutritionPlanVersions.clientId, clientId), eq(nutritionPlanVersions.status, 'published'))).limit(1) : [];
  return { version };
}
/** Task 6 / §12.1.12: null-safe monotonic upsert of exactly the meal client-update columns. */
export async function logMeal(tx: Tx, auth: AuthContext, body: z.infer<typeof mealLogSchema>) {
  await requireClientModule(tx, auth, 'nutrition');
  const clientId = own(auth); const plan = await logPlan(tx, auth, clientId);
  // R0a supersedes timestamp overwrites: a UUID always identifies its original facts.
  const [existing] = await tx.select(clientColumns.mealLogs).from(mealLogs).where(and(
    eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.clientId, clientId), eq(mealLogs.clientUuid, body.clientUuid))).limit(1);
  if (existing) return existing;
  const meal = plan.version?.document.meals.find(m => m.id === body.mealId);
  if (body.mealId && (!meal || (body.optionId && !meal.options.some(o => o.id === body.optionId)))) throw unprocessable('meal_unknown');
  const values = { planVersionId: body.mealId ? plan.version?.id ?? null : null, localDate: body.localDate, mealId: body.mealId ?? null, optionId: body.optionId ?? meal?.options[0]?.id ?? null, freeEntry: body.freeEntry ?? null, status: body.status, note: body.note ?? null, clientUpdatedAt: new Date(body.clientUpdatedAt), recordedAt: new Date() };
  const [inserted] = await tx.insert(mealLogs).values({ tenantId: auth.tenantId, clientId, clientUuid: body.clientUuid, ...values })
    .onConflictDoNothing({ target: [mealLogs.tenantId, mealLogs.clientId, mealLogs.clientUuid] }).returning({ id: mealLogs.id });
  const [row] = await tx.select(clientColumns.mealLogs).from(mealLogs).where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.clientId, clientId), eq(mealLogs.clientUuid, body.clientUuid))).limit(1); if (!row) throw notFound();
  if (inserted) await raiseRedFlags(tx, 'meal_note', row.id, row.note); return row;
}
/** R0a: supplement status events preserve history and validate the caller's plan on creation. */
export async function logSupplement(tx: Tx, auth: AuthContext, body: z.infer<typeof supplementLogSchema>) {
  await requireClientModule(tx, auth, 'nutrition');
  const clientId = own(auth); const plan = await logPlan(tx, auth, clientId);
  const [existing] = await tx.select(clientColumns.supplementLogs).from(supplementLogs).where(and(
    eq(supplementLogs.tenantId, auth.tenantId), eq(supplementLogs.clientId, clientId), eq(supplementLogs.clientUuid, body.clientUuid))).limit(1);
  if (existing) return existing;
  if (!plan.version?.document.supplements.some(s => s.id === body.supplementId)) throw unprocessable('supplement_unknown');
  const values = { planVersionId: plan.version.id, supplementId: body.supplementId, localDate: body.localDate, taken: body.taken, clientUpdatedAt: new Date(body.clientUpdatedAt), recordedAt: new Date() };
  await tx.insert(supplementLogs).values({ tenantId: auth.tenantId, clientId, clientUuid: body.clientUuid, ...values })
    .onConflictDoNothing({ target: [supplementLogs.tenantId, supplementLogs.clientId, supplementLogs.clientUuid] });
  const [row] = await tx.select(clientColumns.supplementLogs).from(supplementLogs).where(and(eq(supplementLogs.tenantId, auth.tenantId), eq(supplementLogs.clientId, clientId), eq(supplementLogs.clientUuid, body.clientUuid))).limit(1); if (!row) throw notFound(); return row;
}
/** Task 6: water is append-only; duplicate UUIDs never update existing measurements. */
export async function logWater(tx: Tx, auth: AuthContext, body: z.infer<typeof waterSchema>) {
  await requireClientModule(tx, auth, 'nutrition');
  const clientId = own(auth); requirePermission(auth, 'tracking', 'create');
  const [client] = await tx.select({ timezone: clientColumns.clients.timezone }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, auth.tenantId))).limit(1); if (!client) throw notFound();
  await tx.insert(metricEntries).values({ tenantId: auth.tenantId, clientId, metric: 'water', metricKey: null, value: body.amountMl, unit: 'ml', source: 'manual', localDate: body.localDate, timezone: client.timezone, recordedAt: new Date(), clientUuid: body.clientUuid }).onConflictDoNothing({ target: [metricEntries.tenantId, metricEntries.clientId, metricEntries.clientUuid] });
  const [row] = await tx.select(clientColumns.metricEntries).from(metricEntries).where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId), eq(metricEntries.clientUuid, body.clientUuid))).limit(1); if (!row) throw notFound(); return row;
}
/** Task 6: own-client daily logs or an explicitly accessible coach client, with keyset meal pagination. */
export async function listMealLogs(tx: Tx, auth: AuthContext, query: z.infer<typeof logListSchema>) {
  let clientId: string;
  if (auth.role === 'client') { clientId = own(auth); if (query.clientId && query.clientId !== clientId) throw forbidden(); }
  else { requirePermission(auth, 'nutrition', 'view'); if (!query.clientId) throw validationError(); clientId = query.clientId; }
  const [client] = await tx.select({ id: clientColumns.clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1); if (!client) throw notFound();
  const { limit, cursor } = parseListQuery(query); if (cursor && (cursor.k !== cursor.id || !z.uuid().safeParse(cursor.id).success)) throw validationError();
  const rows = await tx.select(clientColumns.mealLogs).from(mealLogs).where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.clientId, clientId), eq(mealLogs.localDate, query.date), cursor ? lt(mealLogs.id, cursor.id) : undefined)).orderBy(desc(mealLogs.id)).limit(limit + 1);
  const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(mealLogs).where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.clientId, clientId), eq(mealLogs.localDate, query.date), isNull(mealLogs.voidedAt)));
  const supplements = await tx.select(clientColumns.supplementLogs).from(supplementLogs).where(and(eq(supplementLogs.tenantId, auth.tenantId), eq(supplementLogs.clientId, clientId), eq(supplementLogs.localDate, query.date))).orderBy(desc(supplementLogs.recordedAt), desc(supplementLogs.id));
  const water = await tx.select(clientColumns.metricEntries).from(metricEntries).where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId), eq(metricEntries.localDate, query.date), eq(metricEntries.metric, 'water'))).orderBy(desc(metricEntries.recordedAt), desc(metricEntries.id));
  return { ...page(rows, limit, row => row.id), activeCount: count?.value ?? 0, supplements, water, waterMl: water.filter(r => r.voidedAt === null).reduce((n, r) => n + r.value, 0), localDate: query.date };
}

/** R0c: correction is one INSERT; 0008 atomically voids the original and writes its audit. */
export async function correctMeal(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof mealLogSchema>) {
  await requireHistoryWrite(tx, auth, 'meal_logs');
  const [original] = await tx.select({ clientId: clientColumns.mealLogs.clientId }).from(mealLogs)
    .where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.id, id))).limit(1);
  if (!original || auth.role === 'client' && original.clientId !== auth.clientId) throw forbidden('void_not_allowed');
  const plan = await logPlan(tx, auth, original.clientId);
  const meal = plan.version?.document.meals.find(m => m.id === body.mealId);
  if (body.mealId && (!meal || body.optionId && !meal.options.some(o => o.id === body.optionId))) throw unprocessable('meal_unknown');
  try {
    const [row] = await tx.insert(mealLogs).values({ tenantId: auth.tenantId, clientId: original.clientId, replacesId: id,
      clientUuid: body.clientUuid, localDate: body.localDate, planVersionId: body.mealId ? plan.version?.id ?? null : null,
      mealId: body.mealId ?? null, optionId: body.optionId ?? meal?.options[0]?.id ?? null,
      freeEntry: body.freeEntry ?? null, status: body.status, note: body.note ?? null,
      clientUpdatedAt: new Date(body.clientUpdatedAt) }).returning(clientColumns.mealLogs);
    if (!row) throw notFound();
    await raiseRedFlags(tx, 'meal_note', row.id, row.note); return row;
  } catch (error) { throw historyError(error, true); }
}
