import { and, asc, eq, gt, gte, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents } from '@dawlyy/db/schema';
import type { CalendarEventState, ScheduleEventType } from '@dawlyy/core/types';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { forbidden, validationError } from '../../api/errors';
import { parseListQuery, page } from '../../api/lib/pagination';
import { requirePermission } from '../require-permission';

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
  const events = rows.map(({ attachedFormId, pinnedVersionId, ...event }) => {
    void attachedFormId; void pinnedVersionId; return event;
  });
  return page(events, limit, value => value.dueAt.toISOString());
}
