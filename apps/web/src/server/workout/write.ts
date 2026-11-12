import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { exercises, programVersions, programs, setLogs, workoutSessions } from '@dawlyy/db/schema';
import { findDay } from '@dawlyy/core/program-edit';
import { ProgramDocument, type SessionState } from '@dawlyy/core/types';
import { transition } from '@dawlyy/core/state';
import { z } from 'zod';
import { ApiError, forbidden, notFound, unprocessable, validationError } from '../../api/errors';
import { withServiceTx, type AuthContext, type Tx } from '../db';
import { assertActiveAccess } from '../access';
import { assertWorkoutSyncAccess } from './access';
import { buildSummary, coreRecord, isNewer, sessionTarget } from './logic';
import { requireClient } from './portal';
import { comparisonHistory, getSession, readSets, sessionProjection } from './read';
import { finishSchema, patchSessionSchema, sessionSyncSchema, startSessionSchema, type SessionWrite, type SetWrite } from './contracts';

const conflict = () => new ApiError(409, 'session_conflict', 'Session identity conflicts with an existing session');

/** Task 5: preserve database refusals as API errors; never bypass a guard. */
export function workoutError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  let cause = error;
  for (let i = 0; i < 6 && cause && typeof cause === 'object'; i++) {
    const pg = cause as { code?: string; cause?: unknown };
    if (pg.code === '42501') return forbidden();
    if (pg.code === '23503') return notFound();
    if (pg.code === '23505') return conflict();
    if (pg.code === 'P0001') return unprocessable('illegal_transition');
    if (pg.code === '23514' || pg.code === '22007') return validationError();
    cause = pg.cause;
  }
  return error;
}

async function lockClient(tx: Tx, auth: AuthContext) {
  // Serialize this module's online edits and foreground batches, including concurrent create retries.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${auth.tenantId}:${requireClient(auth, true)}`}, 0))`);
}

async function ownSession(tx: Tx, auth: AuthContext, uuid: string) {
  const [row] = await tx.select(clientColumns.workoutSessions).from(workoutSessions).where(and(
    eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, requireClient(auth)), eq(workoutSessions.clientUuid, uuid))).limit(1).for('update');
  return row;
}

/** Task 5: create-or-resume by own UUID; prescriptions are copied from a published own-client version. */
export async function startSession(tx: Tx, auth: AuthContext, body: z.infer<typeof startSessionSchema>) {
  const clientId = requireClient(auth, true); await assertActiveAccess(tx, auth); await lockClient(tx, auth);
  const existing = await ownSession(tx, auth, body.clientUuid);
  if (existing) {
    if (existing.programId !== body.programId || existing.programVersionId !== body.programVersionId || existing.dayId !== body.dayId || existing.workoutId !== body.workoutId) throw conflict();
    return getSession(tx, auth, existing.id);
  }

  const [version] = await tx.select({ document: clientColumns.programVersions.document }).from(programVersions)
    .innerJoin(programs, and(eq(programs.id, programVersions.programId), eq(programs.publishedVersionId, programVersions.id)))
    .where(and(eq(programVersions.tenantId, auth.tenantId), eq(programVersions.clientId, clientId),
      eq(programVersions.programId, body.programId), eq(programVersions.id, body.programVersionId),
      eq(programVersions.status, 'published'), eq(programs.kind, 'client'), isNull(programs.archivedAt))).limit(1);
  if (!version) throw notFound();
  const day = findDay(ProgramDocument.parse(version.document), body.dayId);
  if (!day?.day.workout || day.day.kind !== 'training' || day.day.workout.id !== body.workoutId) throw conflict();
  const [row] = await tx.insert(workoutSessions).values({ tenantId: auth.tenantId, clientId,
    clientUuid: body.clientUuid, programId: body.programId, programVersionId: body.programVersionId,
    phaseId: day.phase.id, weekId: day.week.id, dayId: body.dayId, workoutId: body.workoutId,
    plannedWorkout: day.day.workout, localDate: body.localDate, timezone: body.timezone })
    .onConflictDoNothing({ target: [workoutSessions.tenantId, workoutSessions.clientId, workoutSessions.clientUuid] })
    .returning({ id: workoutSessions.id });
  const id = row?.id ?? (await ownSession(tx, auth, body.clientUuid))?.id;
  if (!id) throw conflict();
  return getSession(tx, auth, id);
}

function stateTo(from: SessionState, target: SessionState) {
  try { return sessionTarget(from, target); } catch { throw unprocessable('illegal_transition'); }
}

async function completionEvent(tx: Tx, id: string) {
  await tx.execute(sql`select app.audit('workout.complete', 'workout_sessions', ${id}::text, null, null, null)`);
  await tx.execute(sql`select app.emit_event('workout.completed', 'workout_sessions', ${id}::text, '{}'::jsonb)`);
}

async function syncSession(tx: Tx, auth: AuthContext, body: SessionWrite) {
  let row = await ownSession(tx, auth, body.clientUuid);
  if (!row) {
    const parsed = startSessionSchema.safeParse({ clientUuid: body.clientUuid, programId: body.programId, programVersionId: body.programVersionId,
      dayId: body.dayId, workoutId: body.workoutId, localDate: body.localDate, timezone: body.timezone });
    if (!parsed.success) throw notFound();
    await startSession(tx, auth, parsed.data); row = await ownSession(tx, auth, body.clientUuid);
  }
  if (!row) throw notFound();
  for (const key of ['programId', 'programVersionId', 'dayId', 'workoutId'] as const) {
    if (body[key] !== undefined && body[key] !== row[key]) throw conflict();
  }
  if (!isNewer(row.clientUpdatedAt, body.clientUpdatedAt)) return row.id;
  const state = body.state ? stateTo(row.state, body.state) : row.state;
  const mutable = { state, localDate: body.localDate ?? row.localDate, timezone: body.timezone ?? row.timezone,
    startedAt: body.startedAt === undefined ? row.startedAt : body.startedAt ? new Date(body.startedAt) : null,
    endedAt: body.endedAt === undefined ? row.endedAt : body.endedAt ? new Date(body.endedAt) : null,
    activeSeconds: body.activeSeconds ?? row.activeSeconds, rpeOverall: body.rpeOverall === undefined ? row.rpeOverall : body.rpeOverall,
    mood: body.mood === undefined ? row.mood : body.mood, painNote: body.painNote === undefined ? row.painNote : body.painNote,
    clientNote: body.clientNote === undefined ? row.clientNote : body.clientNote, clientUpdatedAt: new Date(body.clientUpdatedAt) };
  // §12.1(12): conflict UPDATE names exactly client_update; immutable snapshot columns only appear on INSERT.
  await tx.insert(workoutSessions).values({ tenantId: auth.tenantId, clientId: requireClient(auth, true), clientUuid: body.clientUuid,
    programId: row.programId, programVersionId: row.programVersionId, phaseId: row.phaseId, weekId: row.weekId,
    dayId: row.dayId, workoutId: row.workoutId, plannedWorkout: row.plannedWorkout, ...mutable })
    .onConflictDoUpdate({ target: [workoutSessions.tenantId, workoutSessions.clientId, workoutSessions.clientUuid], set: mutable,
      setWhere: sql`${workoutSessions.clientUpdatedAt} is null or ${workoutSessions.clientUpdatedAt} < ${mutable.clientUpdatedAt.toISOString()}::timestamptz` });
  if (state !== row.state && ['completed', 'partially_completed', 'abandoned'].includes(state)) await completionEvent(tx, row.id);
  return row.id;
}

async function syncSet(tx: Tx, auth: AuthContext, body: SetWrite) {
  const clientId = requireClient(auth, true); const session = await ownSession(tx, auth, body.sessionClientUuid);
  if (!session) throw notFound();
  const ids = [body.exerciseId, ...(body.substitutedFor ? [body.substitutedFor] : [])];
  const visible = await tx.select({ id: clientColumns.exercises.id }).from(exercises).where(inArray(exercises.id, ids));
  if (ids.some(id => !visible.some(e => e.id === id))) throw notFound();
  if (body.substitutedFor) {
    const item = session.plannedWorkout?.blocks.flatMap(b => b.items).find(i => i.id === body.itemId && i.exerciseId === body.substitutedFor);
    if (!item?.alternatives?.includes(body.exerciseId)) throw forbidden('substitution_not_allowed');
  }
  const [existing] = await tx.select({ sessionId: clientColumns.setLogs.sessionId }).from(setLogs).where(and(
    eq(setLogs.tenantId, auth.tenantId), eq(setLogs.clientId, clientId), eq(setLogs.clientUuid, body.clientUuid))).limit(1);
  if (existing && existing.sessionId !== session.id) throw conflict();
  const mutable = { exerciseId: body.exerciseId, blockId: body.blockId ?? null, itemId: body.itemId ?? null, setNo: body.setNo,
    tag: body.tag, reps: body.reps ?? null, load: body.load ?? null, loadUnit: body.loadUnit ?? null,
    durationSec: body.durationSec ?? null, distanceM: body.distanceM ?? null, rpe: body.rpe ?? null,
    rir: body.rir ?? null, restSec: body.restSec ?? null, completed: body.completed, skipped: body.skipped,
    substitutedFor: body.substitutedFor ?? null, painFlag: body.painFlag, note: body.note ?? null,
    clientUpdatedAt: new Date(body.clientUpdatedAt), deletedAt: body.deletedAt ? new Date(body.deletedAt) : null };
  await tx.insert(setLogs).values({ tenantId: auth.tenantId, clientId, sessionId: session.id, clientUuid: body.clientUuid, ...mutable })
    .onConflictDoUpdate({ target: [setLogs.tenantId, setLogs.clientId, setLogs.clientUuid], set: mutable,
      setWhere: sql`${setLogs.clientUpdatedAt} is null or ${setLogs.clientUpdatedAt} < ${mutable.clientUpdatedAt.toISOString()}::timestamptz` });
  return session.id;
}

/** Task 5 / §12.1(12): atomic batch, sessions first, row savepoints, stale LWW writes acknowledged. */
export async function syncWorkout(tx: Tx, auth: AuthContext, body: { sessions: SessionWrite[]; sets: SetWrite[] }) {
  requireClient(auth, true); await lockClient(tx, auth);
  const eligible = await assertWorkoutSyncAccess(tx, auth, body);
  const accepted: string[] = []; const rejected: Array<{ clientUuid: string; reason: string }> = []; const sessionIds = new Set<string>();
  for (const entry of [...body.sessions.map(record => ({ kind: 'session' as const, record })), ...body.sets.map(record => ({ kind: 'set' as const, record }))]) {
    try {
      const sessionUuid = entry.kind === 'session' ? entry.record.clientUuid : entry.record.sessionClientUuid;
      if (eligible && !eligible.has(sessionUuid)) throw forbidden('access_expired');
      const id = await tx.transaction(savepoint => entry.kind === 'session' ? syncSession(savepoint, auth, entry.record) : syncSet(savepoint, auth, entry.record));
      sessionIds.add(id); accepted.push(entry.record.clientUuid);
    } catch (error) {
      const mapped = workoutError(error);
      if (!(mapped instanceof ApiError)) throw error;
      rejected.push({ clientUuid: entry.record.clientUuid, reason: mapped.code });
    }
  }
  return { accepted, rejected, serverTime: new Date().toISOString(), sessionIds: [...sessionIds] };
}

/** Task 5: online pause/resume or personal notes; terminal sessions cannot return to active. */
export async function patchSession(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof patchSessionSchema>) {
  requireClient(auth, true); await lockClient(tx, auth);
  const detail = await getSession(tx, auth, id); const session = detail.session;
  let state = session.state;
  if (body.event) {
    const result = transition('session', state, body.event);
    if (!result.ok) throw unprocessable('illegal_transition');
    state = result.to as SessionState;
  }
  const stamp = new Date(Math.max(Date.now(), Date.parse(session.clientUpdatedAt ?? '') + 1 || 0)).toISOString();
  const { event: _event, ...facts } = body;
  await syncSession(tx, auth, sessionSyncSchema.parse({ ...facts, clientUuid: session.clientUuid, clientUpdatedAt: stamp, state }));
  return getSession(tx, auth, id);
}

/** Task 5: finish persists an allowed state; its summary is computed after commit under §12.1(15). */
export async function finishSession(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof finishSchema>) {
  requireClient(auth, true); await lockClient(tx, auth);
  const { session } = await getSession(tx, auth, id);
  if (session.state !== body.outcome) stateTo(session.state, body.outcome);
  const { outcome, ...facts } = body;
  const stamp = new Date(Math.max(Date.now(), Date.parse(session.clientUpdatedAt ?? '') + 1 || 0)).toISOString();
  await syncSession(tx, auth, { ...facts, clientUuid: session.clientUuid, clientUpdatedAt: stamp, state: outcome });
}

/** Doc §12.1(15): the only privileged path; IDs come from authenticated writes, every query is tenant/client scoped. */
export async function refreshSummaries(auth: AuthContext, ids: string[]) {
  const clientId = requireClient(auth, true);
  if (!ids.length) return;
  await withServiceTx(auth.tenantId, 'doc 12.1(15): derive workout summary from persisted sets after client sync', async tx => {
    await lockClient(tx, auth);
    const rows = await tx.select(clientColumns.workoutSessions).from(workoutSessions).where(and(
      eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId), inArray(workoutSessions.id, ids),
      inArray(workoutSessions.state, ['completed', 'partially_completed', 'abandoned']))).for('update');
    for (const row of rows) {
      const session = sessionProjection(row); const sets = await readSets(tx, auth, clientId, [session]);
      const { previous, previousPlan } = await comparisonHistory(tx, auth, clientId, session);
      const summary = buildSummary(coreRecord(session, sets), previous, JSON.stringify(previousPlan) === JSON.stringify(session.plannedWorkout));
      await tx.update(workoutSessions).set({ summary }).where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId), eq(workoutSessions.id, row.id)));
    }
  });
}
