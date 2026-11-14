import { requireClientModule } from '../client-modules';
import { historyError, requireHistoryWrite } from '../history-controls';
import { and, desc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { metricEntries, measurementSets } from '@dawlyy/db/schema';
import { localDateOf } from '@dawlyy/core/schedule';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { conflict, forbidden, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { measurementInput, metricInput, metricKinds, rangeQuery } from './contracts';
import { trackingClient, visibleClient } from './access';
import { completeTrackingEvents } from './client-read';
import { measurementDeltas } from './helpers';

/** Task 8: range query plus optional scalar kind/key filters. */
export type EntryQuery = z.infer<typeof rangeQuery> & { metric?: typeof metricKinds[number]; metricKey?: string };
/** Task 8: validate cursor position before any SQL casts or date construction. */
export function listPosition(input: EntryQuery, instant = false) {
  if (input.from && input.to && input.from > input.to) throw validationError(undefined, 'Invalid range');
  const parsed = parseListQuery(input);
  if (parsed.cursor && (!z.uuid().safeParse(parsed.cursor.id).success || typeof parsed.cursor.k !== 'string' || !(instant ? z.iso.datetime({ offset: true }) : z.iso.date()).safeParse(parsed.cursor.k).success)) throw validationError();
  return parsed;
}
/** Task 8: own/scoped scalar history; health rows use explicit client maps. */
export async function listMetrics(tx: Tx, auth: AuthContext, input: EntryQuery) {
  const clientId = trackingClient(auth, input.clientId); await visibleClient(tx, auth, clientId);
  const { limit, cursor } = listPosition(input, true);
  const clauses = [eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId)];
  if (input.from) clauses.push(gte(metricEntries.localDate, input.from));
  if (input.to) clauses.push(lte(metricEntries.localDate, input.to));
  if (input.metric) clauses.push(eq(metricEntries.metric, input.metric));
  if (input.metricKey) clauses.push(input.metricKey === 'weight' || metricKinds.some(key => key === input.metricKey) ? eq(metricEntries.metric, z.enum(metricKinds).parse(input.metricKey)) : eq(metricEntries.metricKey, input.metricKey));
  const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(metricEntries).where(and(...clauses, isNull(metricEntries.voidedAt)));
  if (cursor) clauses.push(or(lt(metricEntries.recordedAt, new Date(String(cursor.k))), and(eq(metricEntries.recordedAt, new Date(String(cursor.k))), lt(metricEntries.id, cursor.id)))!);
  const rows = await tx.select(clientColumns.metricEntries).from(metricEntries).where(and(...clauses)).orderBy(desc(metricEntries.recordedAt), desc(metricEntries.id)).limit(limit + 1);
  return { ...page(rows, limit, row => row.recordedAt.toISOString()), activeCount: count?.value ?? 0 };
}
/** Task 8 / §12.1(12): append-only metric UUID dedupe; retries cannot rewrite history. */
export async function logMetric(tx: Tx, auth: AuthContext, input: z.infer<typeof metricInput>) {
  await requireClientModule(tx, auth, 'measurements');
  const clientId = trackingClient(auth, input.clientId, 'create'); await visibleClient(tx, auth, clientId);
  if (input.correctionOf) {
    const [target] = await tx.select({ metric: clientColumns.metricEntries.metric, metricKey: clientColumns.metricEntries.metricKey }).from(metricEntries).where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId), eq(metricEntries.id, input.correctionOf))).limit(1);
    if (!target) throw notFound();
    if (target.metric !== input.metric || target.metricKey !== (input.metricKey ?? null)) throw validationError(undefined, 'Correction must reference the same metric');
  }
  const localDate = localDateOf(input.recordedAt, input.timezone);
  await tx.insert(metricEntries).values({ tenantId: auth.tenantId, clientId, metric: input.metric, metricKey: input.metricKey, value: input.value, unit: input.unit, source: 'manual', recordedAt: new Date(input.recordedAt), timezone: input.timezone, localDate, clientUuid: input.clientUuid, correctionOf: input.correctionOf }).onConflictDoNothing({ target: [metricEntries.tenantId, metricEntries.clientId, metricEntries.clientUuid] });
  const [row] = await tx.select(clientColumns.metricEntries).from(metricEntries).where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId), eq(metricEntries.clientUuid, input.clientUuid))).limit(1);
  if (!row) throw notFound();
  if (row.metric !== input.metric || row.metricKey !== (input.metricKey ?? null) || row.value !== input.value || row.unit !== input.unit || row.recordedAt.getTime() !== Date.parse(input.recordedAt) || row.timezone !== input.timezone || row.correctionOf !== (input.correctionOf ?? null)) throw conflict('Client UUID already identifies a different entry');
  if (row.voidedAt === null) await completeTrackingEvents(tx, auth, clientId, localDate, input.metric, input.metricKey);
  return row;
}
/** Task 8: paginated measurement sets with deltas against the chronologically preceding set. */
export async function listMeasurements(tx: Tx, auth: AuthContext, input: EntryQuery) {
  const clientId = trackingClient(auth, input.clientId); await visibleClient(tx, auth, clientId);
  const { limit, cursor } = listPosition(input);
  const scope = and(eq(measurementSets.tenantId, auth.tenantId), eq(measurementSets.clientId, clientId));
  const rows = await tx.select(clientColumns.measurementSets).from(measurementSets).where(and(scope, input.from ? gte(measurementSets.localDate, input.from) : undefined, input.to ? lte(measurementSets.localDate, input.to) : undefined,
    cursor ? or(lt(measurementSets.localDate, String(cursor.k)), and(eq(measurementSets.localDate, String(cursor.k)), lt(measurementSets.id, cursor.id))) : undefined)).orderBy(desc(measurementSets.localDate), desc(measurementSets.id)).limit(limit + 1);
  const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(measurementSets).where(and(scope, isNull(measurementSets.voidedAt), input.from ? gte(measurementSets.localDate, input.from) : undefined, input.to ? lte(measurementSets.localDate, input.to) : undefined));
  const result = page(rows, limit, row => row.localDate);
  const items = [];
  for (const row of result.items) {
    const [previous] = await tx.select({ values: clientColumns.measurementSets.values }).from(measurementSets).where(and(scope, isNull(measurementSets.voidedAt), or(lt(measurementSets.localDate, row.localDate), and(eq(measurementSets.localDate, row.localDate), lt(measurementSets.id, row.id))))).orderBy(desc(measurementSets.localDate), desc(measurementSets.id)).limit(1);
    items.push({ ...row, deltas: row.voidedAt ? [] : measurementDeltas(row.values, previous?.values ?? []) });
  }
  return { ...result, items, activeCount: count?.value ?? 0 };
}

/** R0c: a new measurement row replaces its original inside 0008's INSERT trigger. */
export async function correctMeasurements(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof measurementInput>) {
  await requireHistoryWrite(tx, auth, 'measurement_sets');
  const [original] = await tx.select({ clientId: clientColumns.measurementSets.clientId }).from(measurementSets)
    .where(and(eq(measurementSets.tenantId, auth.tenantId), eq(measurementSets.id, id))).limit(1);
  if (!original || auth.role === 'client' && original.clientId !== auth.clientId || input.clientId && input.clientId !== original.clientId) throw forbidden('void_not_allowed');
  try {
    const [row] = await tx.insert(measurementSets).values({ tenantId: auth.tenantId, clientId: original.clientId,
      localDate: input.localDate, values: input.values, takenBy: auth.role === 'client' ? 'client' : 'coach',
      clientUuid: input.clientUuid, clientUpdatedAt: new Date(input.clientUpdatedAt), replacesId: id }).returning(clientColumns.measurementSets);
    if (!row) throw notFound();
    await completeTrackingEvents(tx, auth, original.clientId, row.localDate, 'measurements'); return row;
  } catch (error) { throw historyError(error, true); }
}
/** Task 8 / §12.1(12): monotonic measurement sync with the exact permitted update column list. */
export async function saveMeasurements(tx: Tx, auth: AuthContext, input: z.infer<typeof measurementInput>) {
  await requireClientModule(tx, auth, 'measurements');
  const clientId = trackingClient(auth, input.clientId, 'create'); await visibleClient(tx, auth, clientId);
  const clientUpdatedAt = new Date(input.clientUpdatedAt);
  await tx.insert(measurementSets).values({ tenantId: auth.tenantId, clientId, localDate: input.localDate, values: input.values, takenBy: auth.role === 'client' ? 'client' : 'coach', clientUuid: input.clientUuid, clientUpdatedAt }).onConflictDoUpdate({ target: [measurementSets.tenantId, measurementSets.clientId, measurementSets.clientUuid], set: { localDate: input.localDate, values: input.values, note: null, clientUpdatedAt }, setWhere: sql`excluded.client_updated_at is not null and (${measurementSets.clientUpdatedAt} is null or ${measurementSets.clientUpdatedAt} < excluded.client_updated_at)` });
  const [row] = await tx.select(clientColumns.measurementSets).from(measurementSets).where(and(eq(measurementSets.tenantId, auth.tenantId), eq(measurementSets.clientId, clientId), eq(measurementSets.clientUuid, input.clientUuid))).limit(1);
  if (!row) throw notFound();
  await completeTrackingEvents(tx, auth, clientId, row.localDate, 'measurements');
  return row;
}
