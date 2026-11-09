import { buildSubscriptionSchedule, type SubscriptionTimeline } from '@dawlyy/core/subscription';
import { addDays, generateSchedule, localDateOf } from '@dawlyy/core/schedule';
import { IsoDate, type ScheduleRules } from '@dawlyy/core/types';
import type { subscriptions, subscriptionEvents } from '@dawlyy/db/schema';
import { unprocessable } from '../../api/errors';

type Subscription = typeof subscriptions.$inferSelect;
type Ledger = Pick<typeof subscriptionEvents.$inferSelect, 'id' | 'kind' | 'days' | 'reason' | 'createdAt'>;
const prefix = 'DAWLYY_FREEZE_V1:';

/** T3b: the frozen schema has no from_date; retain freeze metadata alongside the human ledger reason. */
export function freezeReason(fromDate: string, reason: string): string {
  return prefix + JSON.stringify({ fromDate, reason });
}

/** T3b: decode the ledger envelope; legacy human reasons remain readable. */
export function readReason(value: string | null): { reason: string | null; fromDate?: string } {
  if (!value?.startsWith(prefix)) return { reason: value };
  try {
    const record: unknown = JSON.parse(value.slice(prefix.length));
    if (typeof record === 'object' && record !== null && 'fromDate' in record && 'reason' in record
      && typeof record.reason === 'string' && IsoDate.safeParse(record.fromDate).success) {
      return { reason: record.reason, fromDate: String(record.fromDate) };
    }
  } catch { /* Invalid stored metadata must not silently move the calendar. */ }
  throw unprocessable('invalid_timeline', 'Invalid freeze metadata');
}

/** T3b: local tenant date, independent of the application host's timezone. */
export function todayIn(timezone: string, now = new Date()): string {
  return localDateOf(now.toISOString(), timezone);
}

/** T3b: reconstruct immutable package duration plus approved extensions and freezes. */
export function timelineFor(sub: Subscription, ledger: readonly Ledger[]): SubscriptionTimeline {
  const graceDays = sub.graceEndsOn === null ? 0 : Math.round((Date.parse(sub.graceEndsOn) - Date.parse(sub.endsOn)) / 86400000);
  const freezes: SubscriptionTimeline['freezes'] = [];
  for (const event of ledger) {
    if (event.kind === 'resume' && event.days !== null && event.days < 0) {
      const last = freezes.at(-1);
      if (!last || last.days + event.days < 0) throw unprocessable('invalid_timeline', 'Invalid resumed freeze');
      last.days += event.days;
      if (last.days === 0) freezes.pop();
    }
    if (event.kind !== 'freeze') continue;
    const { fromDate } = readReason(event.reason);
    if (!fromDate || event.days === null) throw unprocessable('invalid_timeline', 'Freeze ledger needs a start date and days');
    freezes.push({ fromDate, days: event.days });
  }
  return { startsOn: sub.startsOn, durationDays: sub.packageSnapshot.durationDays,
    extensionDays: ledger.reduce((sum, e) => sum + (e.kind === 'extension' ? e.days ?? 0 : 0), 0),
    freezes, graceDays, timezone: sub.timezone };
}

/** T3b / defaults 3–4: core timeline with weekday-preserving weigh-ins; day-count cadences use core shifts. */
export function buildCalendar(timeline: SubscriptionTimeline, rules: ScheduleRules) {
  const result = buildSubscriptionSchedule(timeline, rules);
  result.events = result.events.filter((event) => !timeline.freezes.some((freeze) =>
    event.localDate >= freeze.fromDate && event.localDate < addDays(freeze.fromDate, freeze.days)));
  if (!timeline.freezes.length || (rules.weighIn.kind !== 'weekly' && rules.weighIn.kind !== 'days_of_week')) return result;
  // Core currently shifts all event types. Only the weekday cadence needs this adapter.
  const weekdays = generateSchedule({ startDate: timeline.startsOn, endDate: result.endsOn, timezone: timeline.timezone, rules })
    .filter((event) => event.type === 'weigh_in' && !timeline.freezes.some((freeze) =>
      event.localDate >= freeze.fromDate && event.localDate < addDays(freeze.fromDate, freeze.days)));
  return { ...result, events: [...result.events.filter((event) => event.type !== 'weigh_in'), ...weekdays]
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.ruleKey.localeCompare(b.ruleKey)) };
}
