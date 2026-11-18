import 'server-only';

import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { clients, exercises, setLogs, workoutSessions } from '@dawlyy/db/schema';
import { exerciseHistory, findLastComparable, type SessionRecord } from '@dawlyy/core/workout';
import type { Workout } from '@dawlyy/core/types';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { coreRecord } from './logic';
import type { PortalExercise, PortalSession, SessionDetail, SetWrite, WorkoutSummary } from './contracts';

/** Task 5: clients read themselves; coach reads require clients:view and remain RLS scoped. */
export function historyClient(auth: AuthContext, clientId?: string): string {
  if (auth.role === 'client' && auth.clientId) return auth.clientId;
  requirePermission(auth, 'clients', 'view');
  if (!clientId) throw validationError(undefined, 'clientId is required');
  return clientId;
}

/** Task 5 / doc §12.1: safe session projection with portable ISO stamps. */
export function sessionProjection(row: Omit<typeof workoutSessions.$inferSelect, 'voidedBy' | 'voidReason'>): PortalSession {
  return { voidedAt: row.voidedAt?.toISOString() ?? null, id: row.id, clientUuid: row.clientUuid, createdAt: row.createdAt.toISOString(), programId: row.programId, programVersionId: row.programVersionId,
    dayId: row.dayId, workoutId: row.workoutId, plannedWorkout: row.plannedWorkout, state: row.state,
    localDate: row.localDate, timezone: row.timezone, startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null, activeSeconds: row.activeSeconds,
    clientUpdatedAt: row.clientUpdatedAt?.toISOString() ?? null, rpeOverall: row.rpeOverall,
    mood: row.mood, painNote: row.painNote, clientNote: row.clientNote, summary: row.summary as WorkoutSummary | null };
}

/** Task 5: every set read goes through the public projection, including tombstone filtering. */
export async function readSets(tx: Tx, auth: AuthContext, clientId: string, sessions: PortalSession[]) {
  if (!sessions.length) return [];
  const rows = await tx.select(clientColumns.setLogs).from(setLogs).where(and(eq(setLogs.tenantId, auth.tenantId),
    eq(setLogs.clientId, clientId), inArray(setLogs.sessionId, sessions.map(s => s.id)), isNull(setLogs.deletedAt)))
    .orderBy(setLogs.setNo, setLogs.id);
  return rows.map(row => ({ id: row.id, clientUuid: row.clientUuid, exerciseId: row.exerciseId, blockId: row.blockId, itemId: row.itemId,
    setNo: row.setNo, tag: row.tag as SetWrite['tag'], reps: row.reps, load: row.load, loadUnit: row.loadUnit as SetWrite['loadUnit'],
    durationSec: row.durationSec, distanceM: row.distanceM, rpe: row.rpe, rir: row.rir, restSec: row.restSec,
    completed: row.completed, skipped: row.skipped, substitutedFor: row.substitutedFor, painFlag: row.painFlag, note: row.note,
    clientUpdatedAt: row.clientUpdatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null,
    sessionClientUuid: sessions.find(s => s.id === row.sessionId)!.clientUuid }));
}

/** Task 5: resolve exercise IDs under RLS; internal library tags/source never enter the response. */
export async function readExercises(tx: Tx, ids: string[]): Promise<PortalExercise[]> {
  if (!ids.length) return [];
  
  return tx.select({ id: clientColumns.exercises.id, name: clientColumns.exercises.name, cues: clientColumns.exercises.cues, primaryMuscles: clientColumns.exercises.primaryMuscles,
    secondaryMuscles: clientColumns.exercises.secondaryMuscles, videoUrl: clientColumns.exercises.videoUrl, thumbnailMediaId: clientColumns.exercises.thumbnailMediaId })
    .from(exercises).where(inArray(exercises.id, [...new Set(ids)]));
}

/** Task 5: includes approved alternatives so offline substitution never needs a library request. */
export function workoutExerciseIds(workout: Workout | null): string[] {
  return workout?.blocks.flatMap(b => b.items.flatMap(i => [i.exerciseId, ...(i.alternatives ?? [])])) ?? [];
}

/** Task 5: historical snapshots remain comparable after the current program is republished. */
export async function comparisonHistory(tx: Tx, auth: AuthContext, clientId: string, session: PortalSession) {
  const rows = await tx.select(clientColumns.workoutSessions).from(workoutSessions).where(and(
    eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId),
    session.workoutId ? eq(workoutSessions.workoutId, session.workoutId) : undefined,
    sql`${workoutSessions.localDate} < ${session.localDate}`,
    isNull(workoutSessions.voidedAt), inArray(workoutSessions.state, ['completed', 'partially_completed'])))
    .orderBy(desc(workoutSessions.localDate), desc(workoutSessions.id));
  const sessions = rows.map(sessionProjection); const sets = await readSets(tx, auth, clientId, sessions);
  const records = sessions.map(s => coreRecord(s, sets.filter(set => set.sessionClientUuid === s.clientUuid)));
  const previous = findLastComparable(coreRecord(session, []), records);
  return { previous, previousPlan: sessions.find(s => s.id === previous?.id)?.plannedWorkout ?? null };
}

/** Task 5: own-client detail or accessible coach detail; no private coach columns. */
export async function getSession(tx: Tx, auth: AuthContext, id: string): Promise<SessionDetail> {
  if (auth.role !== 'client') requirePermission(auth, 'clients', 'view');
  const [row] = await tx.select(clientColumns.workoutSessions).from(workoutSessions)
    .where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.id, id),
      auth.role === 'client' ? eq(workoutSessions.clientId, auth.clientId ?? '') : undefined)).limit(1);
  if (!row) throw notFound();
  const session = sessionProjection(row); const sets = await readSets(tx, auth, row.clientId, [session]);
  const { previous } = await comparisonHistory(tx, auth, row.clientId, session);
  const [client] = await tx.select({ profile: clientColumns.clients.profile }).from(clients)
    .where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, row.clientId))).limit(1);
  return { session, sets, lastComparable: previous, exercises: await readExercises(tx, [...workoutExerciseIds(session.plannedWorkout), ...sets.map(s => s.exerciseId)]),
    unit: client?.profile.units?.weight ?? 'kg' };
}

/** Task 5: finished history uses a stable descending (local_date,id) cursor without a date cap. */
export async function listSessions(tx: Tx, auth: AuthContext, query: { clientId?: string; from?: string; to?: string; cursor?: string; limit?: string }) {
  const clientId = historyClient(auth, query.clientId); const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.k) || !/^[\da-f-]{36}$/i.test(cursor.id))) throw validationError();
  const rows = await tx.select(clientColumns.workoutSessions).from(workoutSessions).where(and(
    eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId),
    or(inArray(workoutSessions.state, ['completed', 'partially_completed', 'abandoned', 'skipped']), isNotNull(workoutSessions.voidedAt)),
    query.from ? gte(workoutSessions.localDate, query.from) : undefined, query.to ? lte(workoutSessions.localDate, query.to) : undefined,
    cursor ? or(sql`${workoutSessions.localDate} < ${cursor.k}`, and(eq(workoutSessions.localDate, String(cursor.k)), sql`${workoutSessions.id} < ${cursor.id}::uuid`)) : undefined))
    .orderBy(desc(workoutSessions.localDate), desc(workoutSessions.id)).limit(limit + 1);
  const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(workoutSessions).where(and(
    eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId), isNull(workoutSessions.voidedAt),
    inArray(workoutSessions.state, ['completed', 'partially_completed', 'abandoned', 'skipped']),
    query.from ? gte(workoutSessions.localDate, query.from) : undefined, query.to ? lte(workoutSessions.localDate, query.to) : undefined));
  return { ...page(rows.map(sessionProjection), limit, row => row.localDate), activeCount: count?.value ?? 0 };
}

/** Task 5 / G3: last five finished sessions containing this exercise, including old program versions. */
export async function getExerciseHistory(tx: Tx, auth: AuthContext, exerciseId: string, requestedClientId?: string) {
  const clientId = historyClient(auth, requestedClientId);
  const rows = await tx.select(clientColumns.workoutSessions).from(workoutSessions).where(and(
    eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId),
    isNull(workoutSessions.voidedAt), inArray(workoutSessions.state, ['completed', 'partially_completed']),
    sql`exists (select 1 from ${setLogs} where ${setLogs.sessionId} = ${workoutSessions.id} and ${setLogs.exerciseId} = ${exerciseId}::uuid and ${setLogs.deletedAt} is null)`))
    .orderBy(desc(workoutSessions.localDate), desc(workoutSessions.id)).limit(5);
  const sessions = rows.map(sessionProjection); const sets = await readSets(tx, auth, clientId, sessions);
  return exerciseHistory(exerciseId, sessions.map(s => coreRecord(s, sets.filter(set => set.sessionClientUuid === s.clientUuid))), 5);
}
