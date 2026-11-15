import { formatNumber, numeralPolicy, type NumberLocale } from '@/src/lib/numbers';
import { revertSchema as programRevert } from '@/src/server/programs/schemas';
import { revertSchema as nutritionRevert } from '@/src/server/nutrition/schemas';
import { revertSchema as formRevert } from '@/src/server/forms/schemas';
import type { ActivityItem, ActivityPage, ActivityQuery } from './types';

export type ActivityAction = 'create' | 'update' | 'delete' | 'archive' | 'restore' | 'cancel' | 'void' | 'correct' | 'approve' | 'reject' | 'stale' | 'publish' | 'review' | 'submit' | 'complete' | 'refund' | 'verify';
const actions: Readonly<Record<string, ActivityAction>> = {
  insert: 'create', create: 'create', update: 'update', delete: 'delete', archive: 'archive', restore: 'restore', unarchive: 'restore',
  cancel: 'cancel', void: 'void', correct: 'correct', approve: 'approve', reject: 'reject', stale: 'stale',
  'client.archive': 'archive', 'client.unarchive': 'restore', 'exercise.archive': 'archive', 'exercise.unarchive': 'restore',
  'program.archive': 'archive', 'program.unarchive': 'restore', 'nutrition_plan.archive': 'archive', 'nutrition_plan.unarchive': 'restore',
  'form.archive': 'archive', 'form.unarchive': 'restore', 'package.archive': 'archive', 'package.unarchive': 'restore',
  'calendar.cancel': 'cancel', 'calendar.restore': 'restore', 'meal.void': 'void', 'meal.correct': 'correct',
  'measurement.void': 'void', 'measurement.correct': 'correct', 'workout.void': 'void',
  'ai.approved': 'approve', 'ai.approve': 'approve', 'ai.rejected': 'reject', 'ai.stale': 'stale',
  'program.publish': 'publish', 'nutrition_plan.publish': 'publish', 'form.publish': 'publish',
  'checkin.review': 'review', 'checkin.submit': 'submit', 'workout.complete': 'complete',
  'payment.verify': 'verify', 'payment.reject': 'reject', 'payment.refund': 'refund',
};

/** Unknown action text never becomes product copy, even when its suffix resembles a known action. */
export function actionKey(action: string): ActivityAction { return Object.hasOwn(actions, action) ? actions[action]! : 'update'; }

export function actorLabel(actor: ActivityItem['actor'], t: (key: string) => string): string {
  if (actor.displayName?.trim()) return actor.displayName;
  if (!actor.userId && (!actor.role || actor.role === 'service' || actor.role === 'system')) return t('systemActor');
  return t(`roles.${actor.role === 'owner' || actor.role === 'staff' || actor.role === 'client' ? actor.role : 'unknown'}`);
}

export type ActivityFormat = { locale: NumberLocale; timezone: string; preferences: unknown };
export function activityTimestamp(value: string, opts: ActivityFormat): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(opts.locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone: opts.timezone, numberingSystem: numeralPolicy(opts.preferences) }).format(date);
  } catch { return null; }
}
export function versionNumber(value: number, opts: Pick<ActivityFormat, 'locale' | 'preferences'>): string {
  return formatNumber(value, { locale: opts.locale, numerals: numeralPolicy(opts.preferences), maximumFractionDigits: 0 });
}

export function activityUrl(query: ActivityQuery): string {
  const params = new URLSearchParams({ limit: query.limit ?? '50' });
  if (query.clientId) params.set('clientId', query.clientId);
  if (query.entity) params.set('entity', query.entity);
  if (query.cursor) params.set('cursor', query.cursor);
  return `/api/v1/activity?${params}`;
}
export function appendActivity(current: readonly ActivityItem[], incoming: readonly ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  return [...current, ...incoming].filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
}

export type ActivityError = 'requestFailed' | 'forbidden' | 'notFound';
export type ActivityState = ActivityPage & { scope: string; loading: boolean; append: boolean; error: ActivityError | null };
export function beginActivity(previous: ActivityState | undefined, scope: string, append: boolean): ActivityState {
  const keep = append && previous?.scope === scope;
  return { scope, items: keep ? previous.items : [], nextCursor: keep ? previous.nextCursor : null, append: !!keep, loading: true, error: null };
}
export function settleActivity(previous: ActivityState, scope: string, page: ActivityPage): ActivityState {
  if (previous.scope !== scope) return previous;
  return { ...previous, items: previous.append ? appendActivity(previous.items, page.items) : appendActivity([], page.items), nextCursor: page.nextCursor, loading: false, error: null };
}
export function failActivity(previous: ActivityState, scope: string, error: ActivityError): ActivityState {
  return previous.scope === scope ? { ...previous, loading: false, error } : previous;
}

/** Reuse the exact existing route schemas; a log action never has its own mutation contract. */
export function revertBody(kind: 'program' | 'nutrition' | 'form', toVersionNo: number, changeNote: string): { toVersionNo: number; changeNote?: string } | null {
  const schema = kind === 'program' ? programRevert : kind === 'nutrition' ? nutritionRevert : formRevert;
  const note = changeNote.trim();
  const parsed = schema.safeParse({ toVersionNo, ...(note ? { changeNote: note } : {}) });
  return parsed.success ? parsed.data : null;
}
