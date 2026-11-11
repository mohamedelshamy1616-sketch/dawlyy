import { addDays, zonedDueAt } from '@dawlyy/core/schedule';
import { transition } from '@dawlyy/core/state';
import { CalendarEventState, type CalendarEventState as State } from '@dawlyy/core/types';
import { unprocessable } from '../../api/errors';

/** Task 8 / §6.3: bridge core checkin edges to the frozen calendar completion vocabulary. */
export function calendarTransition(from: State, action: 'complete' | 'skip' | 'cancel' | 'reschedule' | 'become_due' | 'overdue'): State {
  if (action === 'complete') {
    // Core has no calendar_event machine; §6.3 explicitly permits these completion edges.
    if (from === 'scheduled' || from === 'due' || from === 'overdue') return 'completed';
    throw unprocessable('illegal_transition');
  }
  const result = transition('checkin', from, action);
  if (!result.ok) throw unprocessable('illegal_transition', result.message);
  return CalendarEventState.parse(result.to);
}

/** Task 8: a reminder is planned only when a persisted event changes due state, never daily. */
export function planReminder(event: { state: State; dueAt: Date; localDate: string; timezone: string; windowDays: number }, now: Date): 'due' | 'overdue' | null {
  if (event.state === 'scheduled' && event.dueAt <= now) return 'due';
  const closesAt = zonedDueAt(addDays(event.localDate, event.windowDays + 1), '00:00', event.timezone);
  if (event.state === 'due' && Date.parse(closesAt) <= now.getTime()) return 'overdue';
  return null;
}
