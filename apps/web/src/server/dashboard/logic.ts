/** Task 10: the seven dashboard attention counts, in display order. */
export const QUEUE_KINDS = [
  'attention', 'overdue_checkins', 'waiting_review', 'missing_data', 'expiring_subscriptions', 'pending_payments', 'adherence_decline',
] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

/** Task 10: the dashboard filtered-queue link every count carries. */
export function queueHref(kind: QueueKind): string {
  return `/coach?queue=${kind}`;
}

/** Task 10: where a queue row leads; other modules own the destination pages. */
export function queueRowHref(kind: QueueKind, clientId: string, refId: string): string {
  switch (kind) {
    case 'waiting_review': return `/coach/checkins/review/${refId}`;
    case 'pending_payments': return '/coach/billing';
    case 'expiring_subscriptions': return `/coach/clients/${clientId}/subscription`;
    case 'overdue_checkins': return `/coach/clients/${clientId}`;
    default: return `/coach/clients/${clientId}/timeline`;
  }
}

/** Task 10: adherence is the completed share of finished workout sessions in a window; an empty window is 0 percent. */
export type AdherenceWindow = { completed: number; total: number };

/** Task 10: percentage points between the previous and the current 7-day window that count as a decline. */
export const ADHERENCE_DECLINE_POINTS = 30;

/**
 * Task 10: adherence decline. The previous window must hold at least one finished session; the current share
 * (0 when it holds none) must be at least 30 points lower. Integer cross-multiplication avoids float edge cases;
 * the SQL in queue.ts mirrors this exactly.
 */
export function isAdherenceDecline(previous: AdherenceWindow, current: AdherenceWindow): boolean {
  if (previous.total <= 0) return false;
  if (current.total <= 0) return 100 * previous.completed >= ADHERENCE_DECLINE_POINTS * previous.total;
  return 100 * previous.completed * current.total - 100 * current.completed * previous.total
    >= ADHERENCE_DECLINE_POINTS * previous.total * current.total;
}

/** Task 10: which timeline sections a caller may read, derived from module grants (RLS still scopes the client). */
export type TimelineKind = 'subscription' | 'submission' | 'version' | 'session' | 'metric' | 'message' | 'payment' | 'note';
export const TIMELINE_KINDS: readonly TimelineKind[] = ['subscription', 'submission', 'version', 'session', 'metric', 'message', 'payment', 'note'];

/** Task 10: where a timeline entry links; `sourceId` is the row id, `parentId` the owning program when relevant. */
export function timelineHref(kind: TimelineKind, clientId: string, sourceId: string, parentId?: string | null): string {
  switch (kind) {
    case 'subscription': return `/coach/clients/${clientId}/subscription`;
    case 'submission': return `/coach/checkins/review/${sourceId}`;
    case 'version': return parentId ? `/coach/programs/${parentId}` : `/coach/clients/${clientId}`;
    case 'message': return '/coach/messages';
    case 'payment': return '/coach/billing';
    default: return `/coach/clients/${clientId}`;
  }
}

/** Task 10: task list views; `open` also shows snoozed tasks whose snooze has passed. */
export type TaskFilter = 'open' | 'snoozed' | 'done' | 'cancelled' | 'all';
export const TASK_FILTERS: readonly TaskFilter[] = ['open', 'snoozed', 'done', 'all'];

/** Task 10: client-side mirror of the API list filter, used to drop a task from the visible list after an action. */
export function taskMatchesFilter(task: { state: string; snoozedUntil: string | null }, filter: TaskFilter, nowMs: number): boolean {
  const snoozeActive = task.state === 'snoozed' && task.snoozedUntil !== null && Date.parse(task.snoozedUntil) > nowMs;
  switch (filter) {
    case 'all': return true;
    case 'open': return task.state === 'open' || (task.state === 'snoozed' && !snoozeActive);
    case 'snoozed': return snoozeActive;
    default: return task.state === filter;
  }
}

/** Task 10: quick snooze targets in the viewer's local time: tomorrow 09:00 or the same weekday next week at 09:00. */
export function snoozeTarget(preset: 'tomorrow' | 'nextWeek', now: Date): Date {
  const target = new Date(now.getTime());
  target.setDate(target.getDate() + (preset === 'tomorrow' ? 1 : 7));
  target.setHours(9, 0, 0, 0);
  return target;
}
