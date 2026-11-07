/**
 * Date model (spec §§22, 24, 30): startsOn is Day 0; a D-day package ends on
 * startsOn + D, including that whole local end day. Grace runs endsOn + 1
 * through endsOn + graceDays. Extensions add to the underlying schedule range.
 * A freeze shifts events on/after fromDate and endsOn by its calendar-day length.
 * Freezes apply in chronological order to already shifted dates; renewal
 * reminders are recomputed relative to the final end, never shifted.
 */
import { TZDate } from '@date-fns/tz';
import { IsoDate, ScheduleRules, SubscriptionState, type IsoDateTime, type CalendarEventState, type ScheduleEvent, type LocalizedText } from '../types';
import { generateSchedule, addDays, localDateOf, timeOfDayFor, zonedDueAt } from '../schedule';

export type Freeze = { fromDate: IsoDate; days: number };
export type SubscriptionTimeline = {
  startsOn: IsoDate;
  durationDays: number;
  /** The caller retains the individual extension approvals and their old/new dates. */
  extensionDays: number;
  freezes: Freeze[];
  graceDays: number;
  timezone: string;
};
export type ExistingEvent = { id: string; ruleKey: string | null; type: string; localDate: IsoDate; dueAt: IsoDateTime; state: CalendarEventState; source: 'package_rule' | 'manual' | 'automation' };
export type Reconciliation = {
  insert: ScheduleEvent[];
  cancel: string[];
  update: Array<{ id: string; dueAt: IsoDateTime; localDate: IsoDate }>;
  reopen: Array<{ id: string; dueAt: IsoDateTime; localDate: IsoDate }>;
  untouched: string[];
};
export type AccessKind = 'not_started' | 'active' | 'grace' | 'paused' | 'expired' | 'cancelled' | 'suspended' | 'pending';
export type AccessStatus = {
  access: AccessKind;
  hasAccess: boolean;
  daysElapsed: number;
  daysLeft: number;
  totalDays: number;
  graceDaysLeft: number | null;
  endsOn: IsoDate;
  label: LocalizedText;
};

export class SubscriptionError extends Error {
  constructor(public readonly code: 'invalid_timeline' | 'invalid_freeze', message: string) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

function calendarDays(from: IsoDate, to: IsoDate): number {
  // UTC is only a date ordinal here; access is based on the caller's local date.
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
/** A date that overflows the calendar is blamed on what pushed it there: the timeline itself or a freeze. */
function checkedAdd(date: IsoDate, days: number, code: SubscriptionError['code'] = 'invalid_timeline'): IsoDate {
  try {
    const result = addDays(date, days);
    if (!IsoDate.safeParse(result).success) throw new Error('Date overflow');
    return result;
  } catch {
    throw new SubscriptionError(code, 'Timeline dates exceed the supported calendar range.');
  }
}
function validated(t: SubscriptionTimeline): { freezes: Freeze[]; baseEnd: IsoDate; endsOn: IsoDate; graceEndsOn: IsoDate | null } {
  if (typeof t !== 'object' || t === null) throw new SubscriptionError('invalid_timeline', 'A subscription timeline is required.');
  if (!IsoDate.safeParse(t.startsOn).success || !Number.isSafeInteger(t.durationDays) || t.durationDays < 1 || !Number.isSafeInteger(t.extensionDays) || t.extensionDays < 0 || !Number.isSafeInteger(t.graceDays) || t.graceDays < 0 || !Number.isSafeInteger(t.durationDays + t.extensionDays)) {
    throw new SubscriptionError('invalid_timeline', 'Timeline requires a valid start date and integer day counts.');
  }
  try {
    if (typeof t.timezone !== 'string' || !t.timezone.length) throw new Error('Missing timezone');
    new Intl.DateTimeFormat('en', { timeZone: t.timezone });
  } catch {
    throw new SubscriptionError('invalid_timeline', 'A valid timezone is required.');
  }
  if (!Array.isArray(t.freezes)) throw new SubscriptionError('invalid_freeze', 'Freezes must be a list.');
  for (const freeze of t.freezes as unknown[]) {
    if (typeof freeze !== 'object' || freeze === null || !IsoDate.safeParse((freeze as Freeze).fromDate).success || !Number.isSafeInteger((freeze as Freeze).days) || (freeze as Freeze).days < 1) {
      throw new SubscriptionError('invalid_freeze', 'A freeze requires a valid date and a positive integer day count.');
    }
  }
  const freezes = [...t.freezes].sort((a, b) => compareText(a.fromDate, b.fromDate));
  const baseEnd = checkedAdd(t.startsOn, t.durationDays + t.extensionDays);
  let endsOn = baseEnd;
  let previousEnd: IsoDate | undefined;
  for (const freeze of freezes) {
    // Ranges are [fromDate, fromDate + days), so adjacent freezes are valid.
    if (freeze.fromDate < t.startsOn || freeze.fromDate > endsOn || (previousEnd !== undefined && freeze.fromDate < previousEnd)) {
      throw new SubscriptionError('invalid_freeze', 'Freeze dates must be within the current subscription and must not overlap.');
    }
    previousEnd = checkedAdd(freeze.fromDate, freeze.days, 'invalid_freeze');
    endsOn = checkedAdd(endsOn, freeze.days, 'invalid_freeze');
  }
  return { freezes, baseEnd, endsOn, graceEndsOn: t.graceDays === 0 ? null : checkedAdd(endsOn, t.graceDays) };
}

/** Return the inclusive local end date after extensions and all valid freezes. */
export function endsOnFor(t: SubscriptionTimeline): IsoDate {
  return validated(t).endsOn;
}

/** Return the inclusive grace end date, or null when no grace is configured. */
export function graceEndsOnFor(t: SubscriptionTimeline): IsoDate | null {
  return validated(t).graceEndsOn;
}

function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function compareEvents(a: { dueAt: IsoDateTime; type: string }, b: { dueAt: IsoDateTime; type: string }): number {
  return Date.parse(a.dueAt) - Date.parse(b.dueAt) || compareText(a.type, b.type);
}
function shifted(event: ScheduleEvent, days: number, timezone: string, ruleTime: string | undefined): ScheduleEvent {
  const date = addDays(event.localDate, days);
  let dueAt: IsoDateTime;
  if (ruleTime !== undefined) {
    // Rebuild from the rule's clock time, not from dueAt: on a DST-gap day the generator moved the missing time
    // forward, and carrying that moved time to another date would put the event at the wrong hour.
    dueAt = zonedDueAt(date, ruleTime, timezone);
  } else {
    const original = new TZDate(event.dueAt, timezone);
    const ordinal = new Date(`${date}T00:00:00Z`);
    dueAt = new TZDate(ordinal.getUTCFullYear(), ordinal.getUTCMonth(), ordinal.getUTCDate(), original.getHours(), original.getMinutes(), original.getSeconds(), original.getMilliseconds(), timezone).toISOString();
  }
  const localDate = localDateOf(dueAt, timezone);
  // Preserve same-day occurrence suffixes generated by rules with multiple slots.
  const suffix = event.ruleKey.slice(`${event.type}:${event.localDate}`.length);
  return { ...event, dueAt, localDate, timezone, ruleKey: `${event.type}:${localDate}${suffix}` };
}

/** Build the extended cadence, apply freezes, then recompute final-end reminders. */
export function buildSubscriptionSchedule(t: SubscriptionTimeline, rules: ScheduleRules): { endsOn: IsoDate; graceEndsOn: IsoDate | null; events: ScheduleEvent[] } {
  const timeline = validated(t);
  const parsedRules = ScheduleRules.safeParse(rules);
  if (!parsedRules.success) throw new SubscriptionError('invalid_timeline', 'Invalid subscription schedule rules.');
  const scheduleRules = parsedRules.data;
  let events: ScheduleEvent[];
  try {
    events = generateSchedule({ startDate: t.startsOn, endDate: timeline.baseEnd, timezone: t.timezone, rules: { ...scheduleRules, renewalReminderDaysBefore: [] } });
    for (const freeze of timeline.freezes) events = events.map(event => event.localDate >= freeze.fromDate ? shifted(event, freeze.days, t.timezone, timeOfDayFor(event.type, scheduleRules)) : event);
    // Disable other cadences here: freezes shift their occurrences rather than
    // adding occurrences during the extra frozen range (spec §24).
    const reminderRules: ScheduleRules = {
      ...scheduleRules,
      weeklyCheckin: { ...scheduleRules.weeklyCheckin, enabled: false },
      dailyCheckin: { ...scheduleRules.dailyCheckin, enabled: false },
      weighIn: { kind: 'none' },
      measurements: undefined,
      progressPhotos: undefined,
      techniqueReview: { ...scheduleRules.techniqueReview, enabled: false },
      programReviewEveryDays: undefined,
    };
    events.push(...generateSchedule({ startDate: t.startsOn, endDate: timeline.endsOn, timezone: t.timezone, rules: reminderRules }));
  } catch (cause) {
    if (cause instanceof SubscriptionError) throw cause;
    throw new SubscriptionError('invalid_timeline', 'The subscription schedule could not be generated.');
  }
  events.sort((a, b) => compareEvents(a, b) || compareText(a.ruleKey, b.ruleKey));
  return { endsOn: timeline.endsOn, graceEndsOn: timeline.graceEndsOn, events };
}

/** Reconcile package events without rewriting history or duplicating existing keys. */
export function reconcileSchedule(existing: ExistingEvent[], generated: ScheduleEvent[], opts: { today: IsoDate }): Reconciliation {
  const result: Reconciliation = { insert: [], cancel: [], update: [], reopen: [], untouched: [] };
  const generatedByKey = new Map(generated.map(event => [event.ruleKey, event]));
  // All existing rows reserve their key, including history and manual rows.
  const existingKeys = new Set(existing.flatMap(event => event.ruleKey === null ? [] : [event.ruleKey]));
  result.insert = generated.filter(event => event.localDate >= opts.today && !existingKeys.has(event.ruleKey)).sort((a, b) => compareEvents(a, b) || compareText(a.ruleKey, b.ruleKey));
  const updates: Array<{ id: string; dueAt: IsoDateTime; localDate: IsoDate; type: string }> = [];
  const reopens: typeof updates = [];
  for (const row of [...existing].sort((a, b) => compareEvents(a, b) || compareText(a.id, b.id))) {
    const match = row.ruleKey === null ? undefined : generatedByKey.get(row.ruleKey);
    // A row without a ruleKey was not produced by the rule engine, so it is never cancelled or rewritten here
    // (migration 0003 also forbids package_rule rows without a key).
    if (row.source !== 'package_rule' || row.ruleKey === null || row.localDate < opts.today || row.state === 'completed' || row.state === 'skipped' || row.state === 'rescheduled') {
      result.untouched.push(row.id);
    } else if (row.state === 'cancelled') {
      if (match && match.localDate >= opts.today) reopens.push({ id: row.id, dueAt: match.dueAt, localDate: match.localDate, type: row.type });
      else result.untouched.push(row.id);
    } else if (!match) {
      result.cancel.push(row.id);
    } else if (match.localDate >= opts.today && (Date.parse(match.dueAt) !== Date.parse(row.dueAt) || match.localDate !== row.localDate)) {
      updates.push({ id: row.id, dueAt: match.dueAt, localDate: match.localDate, type: row.type });
    } else {
      result.untouched.push(row.id);
    }
  }
  const orderedChanges = (changes: typeof updates) => changes.sort((a, b) => compareEvents(a, b) || compareText(a.id, b.id)).map(({ id, dueAt, localDate }) => ({ id, dueAt, localDate }));
  result.update = orderedChanges(updates);
  result.reopen = orderedChanges(reopens);
  return result;
}

function arabicDays(days: number): string {
  if (days === 1) return 'يوم';
  if (days === 2) return 'يومين';
  return `${days} ${days >= 3 && days <= 10 ? 'أيام' : 'يوم'}`;
}
function remainingLabel(days: number, grace: boolean): LocalizedText {
  if (days === 0) return grace
    ? { ar: 'فترة السماح بتخلص النهارده', en: 'Grace period ends today' }
    : { ar: 'آخر يوم النهارده', en: 'Ends today' };
  return { ar: `${grace ? 'فترة سماح: ' : ''}باقي ${arabicDays(days)}`, en: `${grace ? 'Grace period: ' : ''}${days} ${days === 1 ? 'day' : 'days'} left` };
}

/** Malformed stored dates or states must fail loudly, never turn into NaN counters or a silent "expired". */
function checkedRecord(sub: unknown, today: unknown, requireStart: boolean): void {
  const record = typeof sub === 'object' && sub !== null ? sub as Record<string, unknown> : undefined;
  const dates = record ? [today, record.endsOn, ...(requireStart ? [record.startsOn] : []), ...(record.graceEndsOn == null ? [] : [record.graceEndsOn])] : [];
  if (!record || !SubscriptionState.safeParse(record.state).success || dates.some(date => !IsoDate.safeParse(date).success)) {
    throw new SubscriptionError('invalid_timeline', 'A subscription needs a known state and valid YYYY-MM-DD dates.');
  }
}

/** Resolve access from stored state and inclusive local dates, even when cron lags. */
export function accessStatus(sub: { state: SubscriptionState; startsOn: IsoDate; endsOn: IsoDate; graceEndsOn?: IsoDate | null }, today: IsoDate): AccessStatus {
  checkedRecord(sub, today, true);
  let access: AccessKind = sub.state;
  if (sub.state === 'active' || sub.state === 'grace') {
    if (today < sub.startsOn) access = 'not_started';
    else if (today <= sub.endsOn) access = 'active';
    else if (sub.graceEndsOn && today <= sub.graceEndsOn) access = 'grace';
    else access = 'expired';
  }
  const daysLeft = Math.max(0, calendarDays(today, sub.endsOn));
  const graceDaysLeft = access === 'grace' && sub.graceEndsOn ? Math.max(0, calendarDays(today, sub.graceEndsOn)) : null;
  const labels: Record<Exclude<AccessKind, 'active' | 'grace'>, LocalizedText> = {
    not_started: { ar: 'الاشتراك لسه مبدأش', en: 'Subscription has not started' },
    paused: { ar: 'الاشتراك متوقف مؤقتًا', en: 'Subscription paused' },
    expired: { ar: 'الاشتراك خلص', en: 'Subscription ended' },
    cancelled: { ar: 'الاشتراك اتلغى', en: 'Subscription cancelled' },
    suspended: { ar: 'الاشتراك موقوف', en: 'Subscription suspended' },
    pending: { ar: 'الاشتراك مستني التفعيل', en: 'Subscription pending' },
  };
  const label = access === 'active' ? remainingLabel(daysLeft, false) : access === 'grace' ? remainingLabel(graceDaysLeft ?? 0, true) : labels[access];
  return { access, hasAccess: access === 'active' || access === 'grace', daysElapsed: Math.max(0, calendarDays(sub.startsOn, today)), daysLeft, totalDays: calendarDays(sub.startsOn, sub.endsOn), graceDaysLeft, endsOn: sub.endsOn, label };
}

/** Select the nightly state-machine event after the inclusive active/grace end. */
export function dueTransition(sub: { state: SubscriptionState; endsOn: IsoDate; graceEndsOn?: IsoDate | null }, today: IsoDate): 'enter_grace' | 'expire' | null {
  checkedRecord(sub, today, false);
  if ((sub.state !== 'active' && sub.state !== 'grace') || today <= sub.endsOn) return null;
  if (sub.graceEndsOn && today <= sub.graceEndsOn) return sub.state === 'active' ? 'enter_grace' : null;
  return 'expire';
}
