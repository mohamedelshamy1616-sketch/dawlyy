import { and, asc, eq, gt, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients } from '@dawlyy/db/schema';
import { localDateOf } from '@dawlyy/core/schedule';
import type { CalendarEventState, ScheduleEventType } from '@dawlyy/core/types';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound, validationError } from '../../api/errors';
import { parseListQuery, page } from '../../api/lib/pagination';
import { requirePermission } from '../require-permission';
import { calendarTransition } from './planning';

/** Task 8: configuration rows remain private and never appear as client calendar events. */
export const visibleCalendarEvent = sql`coalesce(${calendarEvents.payload}->>'kind', '') <> 'tracking_cadence_v1'`;
/** Task 8: standard calendar range and pagination input. */
export type CalendarQuery = { from?: string; to?: string; clientId?: string; type?: ScheduleEventType; state?: CalendarEventState; cursor?: string; limit?: string };
/** Task 8 / §12.1: client projection and stable (due_at,id) keyset pagination. */
export async function listCalendar(tx: Tx, auth: AuthContext, input: CalendarQuery, mine = false) {
  if (auth.role === 'client' && !mine) throw forbidden();
  if (mine && (auth.role !== 'client' || !auth.clientId)) throw forbidden();
  if (!mine) requirePermission(auth, 'calendar', 'view');
  if (input.from && input.to && Date.parse(input.from) > Date.parse(input.to)) throw validationError(undefined, 'Invalid range');
  const { limit, cursor } = parseListQuery(input);
  const clauses = [eq(calendarEvents.tenantId, auth.tenantId), visibleCalendarEvent];
  const clientId = mine ? auth.clientId : input.clientId;
  if (clientId) clauses.push(eq(calendarEvents.clientId, clientId));
  if (input.from) clauses.push(gte(calendarEvents.dueAt, new Date(input.from)));
  if (input.to) clauses.push(lte(calendarEvents.dueAt, new Date(input.to)));
  if (input.type) clauses.push(eq(calendarEvents.type, input.type));
  if (input.state) clauses.push(eq(calendarEvents.state, input.state));
  if (cursor) {
    if (typeof cursor.k !== 'string' || !z.iso.datetime({ offset: true }).safeParse(cursor.k).success || !z.uuid().safeParse(cursor.id).success) throw validationError();
    clauses.push(or(gt(calendarEvents.dueAt, new Date(cursor.k)), and(eq(calendarEvents.dueAt, new Date(cursor.k)), gt(calendarEvents.id, cursor.id)))!);
  }
  const rows = await tx.select(clientColumns.calendarEvents).from(calendarEvents).where(and(...clauses)).orderBy(asc(calendarEvents.dueAt), asc(calendarEvents.id)).limit(limit + 1);
  return page(rows, limit, value => value.dueAt.toISOString());
}

type ManualInput = { clientId: string; type: ScheduleEventType; dueAt: string; timezone: string; windowDays: number; title?: { ar?: string; en?: string } };
/** Task 8: manual events have no package rule key or caller-controlled stamps. */
export async function createCalendarEvent(tx: Tx, auth: AuthContext, input: ManualInput) {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'calendar', 'create');
  const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, input.clientId))).limit(1);
  if (!client) throw notFound();
  const [row] = await tx.insert(calendarEvents).values({ tenantId: auth.tenantId, clientId: client.id, type: input.type, dueAt: new Date(input.dueAt), localDate: localDateOf(input.dueAt, input.timezone), timezone: input.timezone, windowDays: input.windowDays, title: input.title, source: 'manual' }).returning(clientColumns.calendarEvents);
  if (!row) throw notFound(); return row;
}

/** Task 8: edit only an open occurrence, leaving the package template untouched. */
export async function editCalendarEvent(tx: Tx, auth: AuthContext, id: string, patch: { type?: ScheduleEventType; title?: { ar?: string; en?: string }; windowDays?: number }) {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'calendar', 'edit');
  const [row] = await tx.update(calendarEvents).set(patch).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, id), visibleCalendarEvent, inArray(calendarEvents.state, ['scheduled', 'due', 'overdue']))).returning(clientColumns.calendarEvents);
  if (!row) {
    const [exists] = await tx.select({ state: calendarEvents.state }).from(calendarEvents).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, id), visibleCalendarEvent));
    if (!exists) throw notFound(); calendarTransition(exists.state, 'reschedule');
    throw validationError();
  }
  return row;
}

/** Task 8: serialize actions against cron; rescheduling preserves the original occurrence. */
export async function actOnCalendarEvent(tx: Tx, auth: AuthContext, id: string, action: 'complete' | 'skip' | 'cancel' | 'reschedule', replacement?: { dueAt: string; timezone: string }) {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'calendar', 'edit');
  const scope = and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, id), visibleCalendarEvent);
  const [before] = await tx.select().from(calendarEvents).where(scope).for('update');
  if (!before) throw notFound();
  const state = calendarTransition(before.state, action);
  const [row] = await tx.update(calendarEvents).set({ state }).where(scope).returning(clientColumns.calendarEvents);
  if (!row) throw notFound();
  if (action !== 'reschedule') return row;
  if (!replacement) throw validationError();
  const [next] = await tx.insert(calendarEvents).values({ tenantId: auth.tenantId, clientId: before.clientId, subscriptionId: before.subscriptionId, source: 'manual', type: before.type, title: before.title, payload: before.payload, windowDays: before.windowDays, dueAt: new Date(replacement.dueAt), localDate: localDateOf(replacement.dueAt, replacement.timezone), timezone: replacement.timezone, rescheduledFrom: before.id }).returning(clientColumns.calendarEvents);
  if (!next) throw notFound(); return next;
}
