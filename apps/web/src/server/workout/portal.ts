import 'server-only';
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients, conversations, forms, formSubmissions, nutritionPlans, nutritionPlanVersions, programs, programVersions, subscriptions, tenants, workoutSessions } from '@dawlyy/db/schema';
import { programStats } from '@dawlyy/core/program-edit';
import { ProgramDocument } from '@dawlyy/core/types';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { assertActiveAccess } from '../access';
import { resolveProgramDay } from './logic';
import type { PortalProgram, PortalToday } from './contracts';

/** Task 5: coaches never enter the client mutation/portal boundary. */
export function requireClient(auth: AuthContext, write = false): string {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  requirePermission(auth, 'tracking', write ? 'edit' : 'view');
  return auth.clientId;
}

/** Task 5: timezone and units are resolved from the existing T3 client profile. */
export async function portalIdentity(tx: Tx, auth: AuthContext) {
  const clientId = requireClient(auth);
  
  const [client] = await tx.select({ timezone: clientColumns.clients.timezone, profile: clientColumns.clients.profile }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
  if (!client) throw notFound();
  const [tenant] = await tx.select({ timezone: clientColumns.tenants.timezone }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
  const timezone = client.timezone || tenant?.timezone || 'Africa/Cairo';
  return { timezone, unit: client.profile.units?.weight ?? 'kg' as const };
}

/** Task 5: ISO local calendar day, independent of the process timezone. */
export function localDay(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Task 5: select only the published pointer of the caller's live client copy, never its draft pointer. */
export async function publishedProgram(tx: Tx, auth: AuthContext) {
  const clientId = requireClient(auth); 
  const [row] = await tx.select({ programId: clientColumns.programs.id, name: clientColumns.programs.name, versionId: clientColumns.programVersions.id, versionNo: clientColumns.programVersions.versionNo, document: clientColumns.programVersions.document })
    .from(programs).innerJoin(programVersions, and(eq(programVersions.id, programs.publishedVersionId), eq(programVersions.programId, programs.id), eq(programVersions.tenantId, programs.tenantId), eq(programVersions.clientId, clientId)))
    .where(and(eq(programs.tenantId, auth.tenantId), eq(programs.clientId, clientId), eq(programs.kind, 'client'), isNull(programs.archivedAt), eq(programVersions.status, 'published')))
    .orderBy(desc(programVersions.publishedAt), desc(programs.id)).limit(1);
  if (!row) return null;
  // Parse into the public core shape, removing unknown/internal JSON fields from every level.
  const document = ProgramDocument.parse(row.document);
  delete document.notes;
  return { ...row, document };
}

/** Task 5: completed day ids drive undated plans without shifting calendar-anchored plans. */
export async function completedDays(tx: Tx, auth: AuthContext, programId: string): Promise<string[]> {
  const rows = await tx.select({ dayId: clientColumns.workoutSessions.dayId }).from(workoutSessions)
    .where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, requireClient(auth)), eq(workoutSessions.programId, programId), isNull(workoutSessions.voidedAt), inArray(workoutSessions.state, ['completed', 'partially_completed'])));
  return rows.flatMap(row => row.dayId ? [row.dayId] : []);
}

/** Task 5 cross-task GET /me/program contract. */
export async function getPortalProgram(tx: Tx, auth: AuthContext): Promise<PortalProgram | null> {
  await assertActiveAccess(tx, auth);
  const program = await publishedProgram(tx, auth);
  if (!program) return null;
  const identity = await portalIdentity(tx, auth);
  const selection = resolveProgramDay(program.document, program.document.startDate, localDay(identity.timezone), await completedDays(tx, auth, program.programId));
  return { programId: program.programId, name: program.name, versionNo: program.versionNo, document: program.document,
    ...(program.document.startDate ? { startDate: program.document.startDate } : {}),
    progress: { weeksTotal: programStats(program.document).weeks, currentWeekIndex: selection.weekIndex } };
}

/** Task 5 cross-task GET /me/today contract; all cards are read-only under caller RLS. */
export async function getToday(tx: Tx, auth: AuthContext, requestedDate?: string): Promise<PortalToday> {
  const clientId = requireClient(auth); const identity = await portalIdentity(tx, auth); const date = requestedDate ?? localDay(identity.timezone);
  const program = await publishedProgram(tx, auth);
  const selected = program ? resolveProgramDay(program.document, program.document.startDate, date, await completedDays(tx, auth, program.programId)) : null;
  
  const [session] = await tx.select({ id: clientColumns.workoutSessions.id, state: clientColumns.workoutSessions.state, plannedWorkout: clientColumns.workoutSessions.plannedWorkout }).from(workoutSessions)
    .where(and(eq(workoutSessions.tenantId, auth.tenantId), eq(workoutSessions.clientId, clientId), eq(workoutSessions.localDate, date), isNull(workoutSessions.voidedAt)))
    .orderBy(desc(workoutSessions.createdAt), desc(workoutSessions.id)).limit(1);
  
  const [nutrition] = await tx.select({ name: clientColumns.nutritionPlans.name, document: clientColumns.nutritionPlanVersions.document }).from(nutritionPlans)
    .innerJoin(nutritionPlanVersions, and(eq(nutritionPlanVersions.id, nutritionPlans.publishedVersionId), eq(nutritionPlanVersions.planId, nutritionPlans.id)))
    .where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, clientId), isNull(nutritionPlans.archivedAt), eq(nutritionPlanVersions.status, 'published'))).orderBy(desc(nutritionPlanVersions.publishedAt)).limit(1);
  
  const due = await tx.select({ eventId: clientColumns.calendarEvents.id, title: clientColumns.calendarEvents.title, dueAt: clientColumns.calendarEvents.dueAt, state: clientColumns.calendarEvents.state }).from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId), eq(calendarEvents.type, 'checkin'), lte(calendarEvents.localDate, date), inArray(calendarEvents.state, ['scheduled', 'due', 'overdue'])))
    .orderBy(calendarEvents.dueAt, calendarEvents.id);
  
  const assignedIntakes = await tx.select({ id: clientColumns.forms.id }).from(forms).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.clientId, clientId), eq(forms.formKind, 'intake'), isNotNull(forms.publishedVersionId), isNull(forms.archivedAt)));
  const submitted = assignedIntakes.length ? await tx.select({ formId: clientColumns.formSubmissions.formId }).from(formSubmissions)
    .where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), inArray(formSubmissions.formId, assignedIntakes.map(row => row.id)), inArray(formSubmissions.state, ['submitted', 'waiting_for_coach', 'reviewed']))) : [];
  const unread = await tx.select({ count: clientColumns.conversations.unreadForClient }).from(conversations)
    .where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.clientId, clientId), isNull(conversations.archivedAt)));
  
  const [subscription] = await tx.select({ state: clientColumns.subscriptions.state, endsOn: clientColumns.subscriptions.endsOn }).from(subscriptions)
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId))).orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
  const workout = session?.plannedWorkout ?? selected?.day?.workout;
  const state: PortalToday['workout']['state'] = session ? (['active', 'paused', 'not_started'].includes(session.state) ? 'active' : 'done') : selected?.state ?? 'none';
  return { date, workout: { state, ...(session ? { sessionId: session.id } : {}), ...(workout ? { name: workout.name, exerciseCount: workout.blocks.reduce((n, block) => n + block.items.length, 0) } : {}), ...(selected ? { dayLabel: program?.document.phases.find(p => p.id === selected.phaseId)?.name } : {}) },
    meals: nutrition ? { planName: nutrition.name, kcalTarget: (state === 'rest' ? nutrition.document.dayTypes?.rest : nutrition.document.dayTypes?.training)?.kcal ?? nutrition.document.targets.kcal, link: true } : null,
    checkins: due.map(row => ({ ...row, dueAt: row.dueAt.toISOString() })),
    intakePending: assignedIntakes.some(row => !submitted.some(value => value.formId === row.id)), unreadMessages: unread.reduce((n, row) => n + row.count, 0),
    subscription: subscription ? { state: subscription.state, daysLeft: Math.ceil((Date.parse(subscription.endsOn) - Date.parse(date)) / 86_400_000) } : { state: 'none' } };
}
