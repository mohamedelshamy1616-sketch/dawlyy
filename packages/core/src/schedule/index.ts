import { TZDate } from '@date-fns/tz';
import { ScheduleInput, type ScheduleEvent, type ScheduleEventType, type IsoDate, type IsoDateTime } from '../types';

export class ScheduleError extends Error {
  constructor(public readonly code: 'invalid_range' | 'invalid_timezone', message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new ScheduleError('invalid_timezone', 'A valid timezone is required.');
  }
}

/** Calendar arithmetic uses UTC only as a zone-independent date ordinal. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function localDateOf(instant: IsoDateTime, timezone: string): IsoDate {
  validateTimezone(timezone);
  return new TZDate(instant, timezone).toISOString().slice(0, 10);
}

function dueAt(date: IsoDate, time: string, timezone: string): IsoDateTime {
  const utc = new Date(`${date}T00:00:00.000Z`);
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  return new TZDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), hour, minute, 0, 0, timezone).toISOString();
}

function compareEvents(left: ScheduleEvent, right: ScheduleEvent): number {
  const timeDifference = Date.parse(left.dueAt) - Date.parse(right.dueAt);
  return timeDifference || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0);
}

/** Generate Day-0-anchored rules, retaining wall-clock times across zone changes. */
export function generateSchedule(input: ScheduleInput): ScheduleEvent[] {
  const parsed = ScheduleInput.safeParse(input);
  if (!parsed.success) {
    const timezoneError = parsed.error.issues.some(issue => issue.path[0] === 'timezone');
    throw new ScheduleError(timezoneError ? 'invalid_timezone' : 'invalid_range', 'Invalid schedule input.');
  }
  const { startDate, endDate, timezone, rules } = parsed.data;
  if (endDate < startDate) throw new ScheduleError('invalid_range', 'endDate must not precede startDate.');
  validateTimezone(timezone);
  // Shared schemas check the shape HH:mm; also reject impossible clock values.
  const times = [rules.weeklyCheckin.timeOfDay, rules.dailyCheckin.timeOfDay, rules.weighInTimeOfDay, rules.measurements?.timeOfDay, rules.progressPhotos?.timeOfDay];
  if (times.some(time => time !== undefined && (Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59))) {
    throw new ScheduleError('invalid_range', 'Rule times must be valid local HH:mm clock times.');
  }

  const events: ScheduleEvent[] = [];
  const lastDay = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  function emit(type: ScheduleEventType, day: number, time: string, windowDays: number, payload?: Record<string, unknown>): void {
    const baseline = day === 0 && (type === 'measurements' || type === 'progress_photos');
    if ((!baseline && day < 1) || day > lastDay) return;
    const localDate = addDays(startDate, day);
    events.push({ type, dueAt: dueAt(localDate, time, timezone), localDate, timezone, windowDays, ruleKey: `${type}:${localDate}`, ...(payload === undefined ? {} : { payload }) });
  }

  const checkin = rules.weeklyCheckin;
  if (checkin.enabled) {
    if (checkin.perCycle === undefined) {
      // spec §22: the default first check-in is Start Date + 7, never Day 0.
      for (let day = checkin.firstAfterDays; day <= lastDay; day += checkin.everyDays) {
        emit('weekly_checkin', day, checkin.timeOfDay, checkin.windowDays);
      }
    } else {
      const cycleDays = checkin.cycleWeeks * 7;
      const spacing = Math.floor(cycleDays / checkin.perCycle);
      for (let cycle = 0; cycle * cycleDays + checkin.firstAfterDays <= lastDay; cycle++) {
        for (let index = 0; index < checkin.perCycle; index++) {
          const day = cycle * cycleDays + checkin.firstAfterDays + index * spacing;
          if (day > lastDay) break;
          emit('weekly_checkin', day, checkin.timeOfDay, checkin.windowDays, { cycle: cycle + 1, indexInCycle: index + 1 });
        }
      }
    }
  }

  if (rules.dailyCheckin.enabled) {
    for (let day = 1; day <= lastDay; day++) emit('daily_checkin', day, rules.dailyCheckin.timeOfDay, 0);
  }

  const cadence = rules.weighIn;
  if (cadence.kind === 'custom') {
    for (const date of cadence.dates) {
      if (date <= startDate || date > endDate) continue;
      const day = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
      emit('weigh_in', day, rules.weighInTimeOfDay, 0);
    }
  } else if (cadence.kind !== 'none') {
    for (let day = 1; day <= lastDay; day++) {
      const weekday = new Date(`${addDays(startDate, day)}T00:00:00Z`).getUTCDay();
      if (cadence.kind === 'daily_fasted' || (cadence.kind === 'days_of_week' && cadence.days.includes(weekday)) || (cadence.kind === 'weekly' && cadence.day === weekday)) {
        emit('weigh_in', day, rules.weighInTimeOfDay, 0);
      }
    }
  }

  for (const [type, rule] of [['measurements', rules.measurements], ['progress_photos', rules.progressPhotos]] as const) {
    if (!rule?.enabled) continue;
    for (let day = rule.firstAfterDays; day <= lastDay; day += rule.everyDays) emit(type, day, rule.timeOfDay, rule.windowDays);
  }

  // These rules carry no clock field in the shared contract; use 09:00 local.
  if (rules.techniqueReview.enabled) {
    for (let week = 0; week < rules.techniqueReview.firstWeeks && 3 + week * 7 <= lastDay; week++) {
      emit('technique_review', 3 + week * 7, '09:00', 6, { maxPerWeek: rules.techniqueReview.maxPerWeek });
    }
  }
  for (const daysBefore of rules.renewalReminderDaysBefore) emit('renewal_reminder', lastDay - daysBefore, '10:00', 0, { daysBefore });
  if (rules.programReviewEveryDays !== undefined) {
    for (let day = rules.programReviewEveryDays; day <= lastDay; day += rules.programReviewEveryDays) emit('program_review', day, '09:00', 0);
  }

  const totals = new Map<string, number>();
  const occurrences = new Map<string, number>();
  for (const event of events) totals.set(event.ruleKey, (totals.get(event.ruleKey) ?? 0) + 1);
  for (const event of events) {
    const key = event.ruleKey;
    if ((totals.get(key) ?? 0) > 1) {
      const n = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, n);
      event.ruleKey = `${key}:${n}`;
    }
  }
  return events.sort(compareEvents);
}

/** Strictly after the given instant; returns a sorted copy without changing input. */
export function upcoming(events: ScheduleEvent[], after: IsoDateTime, limit: number): ScheduleEvent[] {
  if (!(limit > 0)) return [];
  return events.filter(event => Date.parse(event.dueAt) > Date.parse(after)).sort(compareEvents).slice(0, Math.floor(limit));
}
