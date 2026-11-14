import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { mealLogs, measurementSets, metricEntries, workoutSessions } from '@dawlyy/db/schema';
import { clientColumns } from '@dawlyy/db';
import type { AuthContext, Tx } from './db';
import { ApiError, forbidden, notFound } from '../api/errors';
import { requirePermission } from './require-permission';
import { requireClientModule } from './client-modules';
import { postgresCode } from './postgres-code';

/** R0c: the optional explanation is bounded before reaching app.void_entry. */
export const voidInput = z.object({ reason: z.string().max(500).optional() }).strict();
/** R0c: preserve the database's intentionally indistinguishable scope/window refusal. */
export function historyError(error: unknown, correcting = false): unknown {
  if (error instanceof ApiError) return error;
  const code = postgresCode(error);
  if (code === '42501') return forbidden('void_not_allowed');
  if (code === 'P0001' || correcting && code === '23505') return new ApiError(409, correcting ? 'already_corrected' : 'already_voided', 'The entry has already been voided or corrected');
  if (correcting && code === '23503') return notFound();
  return error;
}
/** R0c: use edit for staff; clients are checked by the function and their resolved module. */
export async function requireHistoryWrite(tx: Tx, auth: AuthContext, table: 'meal_logs' | 'measurement_sets' | 'metric_entries' | 'workout_sessions') {
  if (auth.role === 'client') {
    await requireClientModule(tx, auth, table === 'meal_logs' ? 'nutrition' : table === 'workout_sessions' ? 'workouts' : 'measurements');
  } else {
    try { requirePermission(auth, table === 'meal_logs' ? 'nutrition' : 'tracking', 'edit'); }
    catch { throw forbidden('void_not_allowed'); }
  }
}
/** R0c: one authenticated definer call; no pre-read that could disclose another client's row. */
export async function voidEntry(tx: Tx, auth: AuthContext, table: 'meal_logs' | 'measurement_sets' | 'metric_entries' | 'workout_sessions', id: string, reason?: string) {
  await requireHistoryWrite(tx, auth, table);
  try {
    await tx.execute(sql`select app.void_entry(${table}, ${id}::uuid, ${reason ?? null})`);
    // C15: each readback names its clientColumns map directly so the source scan can prove the projection.
    const read = {
      meal_logs: () => tx.select({ id: clientColumns.mealLogs.id, voidedAt: clientColumns.mealLogs.voidedAt }).from(mealLogs)
        .where(and(eq(mealLogs.tenantId, auth.tenantId), eq(mealLogs.id, id))).limit(1),
      measurement_sets: () => tx.select({ id: clientColumns.measurementSets.id, voidedAt: clientColumns.measurementSets.voidedAt }).from(measurementSets)
        .where(and(eq(measurementSets.tenantId, auth.tenantId), eq(measurementSets.id, id))).limit(1),
      metric_entries: () => tx.select({ id: clientColumns.metricEntries.id, voidedAt: clientColumns.metricEntries.voidedAt }).from(metricEntries)
        .where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.id, id))).limit(1),
      workout_sessions: () => tx.select({ id: clientColumns.workoutSessions.id, voidedAt: clientColumns.workoutSessions.voidedAt }).from(workoutSessions)
        .where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.id, id))).limit(1),
    }[table];
    const [row] = await read();
    if (!row) throw notFound(); return row;
  } catch (error) { throw historyError(error); }
}

