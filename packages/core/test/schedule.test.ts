import { describe, it, expect } from 'vitest';
import { ScheduleError, generateSchedule, upcoming, addDays, localDateOf } from '../src/schedule';
import { ScheduleEvent, ScheduleRules, type ScheduleRulesInput, type ScheduleInput } from '../src/types';

function input(rules: ScheduleRulesInput = {}, startDate = '2026-11-01', endDate = '2026-11-28'): ScheduleInput {
  return { startDate, endDate, timezone: 'Africa/Cairo', rules: ScheduleRules.parse(rules) };
}

describe('generateSchedule', () => {
  it('starts weekly check-ins on Day 7, keeps daily check-ins disabled and schedules renewal reminders', () => {
    const events = generateSchedule(input());
    expect(events.filter(e => e.type === 'weekly_checkin').map(e => e.localDate)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22']);
    expect(events.filter(e => e.type === 'daily_checkin')).toEqual([]);
    expect(events.filter(e => e.type === 'renewal_reminder').map(e => [e.localDate, e.dueAt, e.payload, e.windowDays])).toEqual([
      ['2026-11-21', '2026-11-21T10:00:00.000+02:00', { daysBefore: 7 }, 0],
      ['2026-11-25', '2026-11-25T10:00:00.000+02:00', { daysBefore: 3 }, 0],
      ['2026-11-27', '2026-11-27T10:00:00.000+02:00', { daysBefore: 1 }, 0],
    ]);
    expect(events.every(e => ScheduleEvent.safeParse(e).success)).toBe(true);
  });

  it('produces four evenly spaced check-ins per 28-day cycle, including the Day 56 endpoint', () => {
    const events = generateSchedule(input({ weeklyCheckin: { perCycle: 4, cycleWeeks: 4, windowDays: 2 } }, '2026-11-01', '2026-12-27'))
      .filter(e => e.type === 'weekly_checkin');
    expect(events.map(e => e.localDate)).toEqual([
      '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29',
      '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27',
    ]);
    expect(events.map(e => e.payload)).toEqual([
      { cycle: 1, indexInCycle: 1 }, { cycle: 1, indexInCycle: 2 }, { cycle: 1, indexInCycle: 3 }, { cycle: 1, indexInCycle: 4 },
      { cycle: 2, indexInCycle: 1 }, { cycle: 2, indexInCycle: 2 }, { cycle: 2, indexInCycle: 3 }, { cycle: 2, indexInCycle: 4 },
    ]);
    expect(events.every(e => e.windowDays === 2)).toBe(true);
  });

  it('uses floor spacing for perCycle and truncates the final partial cycle at endDate', () => {
    const events = generateSchedule(input({ weeklyCheckin: { perCycle: 3, cycleWeeks: 4, firstAfterDays: 2 } }, '2026-11-01', '2026-12-05'))
      .filter(e => e.type === 'weekly_checkin');
    expect(events.map(e => e.localDate)).toEqual(['2026-11-03', '2026-11-12', '2026-11-21', '2026-12-01']);
  });

  it('honors firstAfterDays, everyDays, rule times and explicit daily enablement', () => {
    const events = generateSchedule(input({ weeklyCheckin: { firstAfterDays: 2, everyDays: 3, timeOfDay: '11:15' }, dailyCheckin: { enabled: true, timeOfDay: '21:30' } }, '2026-11-01', '2026-11-08'));
    expect(events.filter(e => e.type === 'weekly_checkin').map(e => e.dueAt)).toEqual([
      '2026-11-03T11:15:00.000+02:00', '2026-11-06T11:15:00.000+02:00',
    ]);
    const daily = events.filter(e => e.type === 'daily_checkin');
    expect(daily).toHaveLength(7);
    expect(daily[0]?.dueAt).toBe('2026-11-02T21:30:00.000+02:00');
    expect(daily[6]?.localDate).toBe('2026-11-08');
  });

  it('weighs only on selected weekdays and never on Day 0', () => {
    const events = generateSchedule(input({ weighIn: { kind: 'days_of_week', days: [0, 3] } }, '2026-11-01', '2026-11-11'));
    expect(events.filter(e => e.type === 'weigh_in').map(e => e.localDate)).toEqual(['2026-11-04', '2026-11-08', '2026-11-11']);
    expect(generateSchedule(input({ weighIn: { kind: 'weekly', day: 0 } }, '2026-11-01', '2026-11-15'))
      .filter(e => e.type === 'weigh_in').map(e => e.localDate)).toEqual(['2026-11-08', '2026-11-15']);
  });

  it('drops custom weigh-ins outside [Day 1, endDate] and keeps duplicate dates addressable', () => {
    const events = generateSchedule(input({ weighIn: { kind: 'custom', dates: ['2026-11-29', '2026-11-01', '2026-10-31', '2026-11-28', '2026-11-02', '2026-11-02'] } }))
      .filter(e => e.type === 'weigh_in');
    expect(events.map(e => [e.localDate, e.ruleKey])).toEqual([
      ['2026-11-02', 'weigh_in:2026-11-02:1'], ['2026-11-02', 'weigh_in:2026-11-02:2'], ['2026-11-28', 'weigh_in:2026-11-28'],
    ]);
  });

  it('keeps daily weigh-in clock time across Cairo spring DST', () => {
    const events = generateSchedule(input({ weighIn: { kind: 'daily_fasted' } }, '2026-04-22', '2026-04-25'))
      .filter(e => e.type === 'weigh_in');
    expect(events.map(e => e.dueAt)).toEqual([
      '2026-04-23T07:00:00.000+02:00', '2026-04-24T07:00:00.000+03:00', '2026-04-25T07:00:00.000+03:00',
    ]);
  });

  it('keeps daily weigh-in clock time across Cairo autumn DST', () => {
    const events = generateSchedule(input({ weighIn: { kind: 'daily_fasted' } }, '2026-10-28', '2026-10-31'))
      .filter(e => e.type === 'weigh_in');
    expect(events.map(e => e.dueAt)).toEqual([
      '2026-10-29T07:00:00.000+03:00', '2026-10-30T07:00:00.000+02:00', '2026-10-31T07:00:00.000+02:00',
    ]);
  });

  it('places seven-day intervals correctly in leap-year February, including baseline Day 0', () => {
    const events = generateSchedule(input({ measurements: { everyDays: 7 }, progressPhotos: { firstAfterDays: 1, everyDays: 7 } }, '2028-02-01', '2028-02-29'));
    expect(events.filter(e => e.type === 'measurements').map(e => e.localDate)).toEqual(['2028-02-01', '2028-02-08', '2028-02-15', '2028-02-22', '2028-02-29']);
    expect(events.filter(e => e.type === 'progress_photos').map(e => e.localDate)).toEqual(['2028-02-02', '2028-02-09', '2028-02-16', '2028-02-23']);
  });

  it('generates technique reviews on Day 3 of the configured first weeks and program reviews from Day 0', () => {
    const events = generateSchedule(input({ techniqueReview: { enabled: true, firstWeeks: 2, maxPerWeek: 3 }, programReviewEveryDays: 10 }, '2026-11-01', '2026-11-28'));
    expect(events.filter(e => e.type === 'technique_review').map(e => [e.localDate, e.windowDays, e.payload])).toEqual([
      ['2026-11-04', 6, { maxPerWeek: 3 }], ['2026-11-11', 6, { maxPerWeek: 3 }],
    ]);
    expect(events.filter(e => e.type === 'program_review').map(e => e.dueAt)).toEqual(['2026-11-11T09:00:00.000+02:00', '2026-11-21T09:00:00.000+02:00']);
  });

  it('honors disabled rules and excludes renewal reminders on or before Day 0', () => {
    const events = generateSchedule(input({ weeklyCheckin: { enabled: false }, measurements: { enabled: false, everyDays: 7 }, progressPhotos: { enabled: false, everyDays: 7 }, renewalReminderDaysBefore: [7, 3, 1] }, '2026-11-01', '2026-11-04'));
    expect(events.map(e => [e.type, e.localDate])).toEqual([['renewal_reminder', '2026-11-03']]);
    expect(generateSchedule(input({}, '2026-11-01', '2026-11-01'))).toEqual([]);
    expect(generateSchedule(input({ measurements: { everyDays: 7 }, progressPhotos: { everyDays: 7 } }, '2026-11-01', '2026-11-01')).map(e => e.type)).toEqual(['measurements', 'progress_photos']);
  });

  it('is deterministic, leaves input untouched and sorts ties by type with unique ruleKeys', () => {
    const value = input({ weeklyCheckin: { perCycle: 8, cycleWeeks: 1, firstAfterDays: 1 }, dailyCheckin: { enabled: true, timeOfDay: '09:00' }, renewalReminderDaysBefore: [1, 1] }, '2026-11-01', '2026-11-09');
    const before = JSON.stringify(value);
    const first = generateSchedule(value);
    expect(generateSchedule(value)).toEqual(first);
    expect(JSON.stringify(value)).toBe(before);
    expect(new Set(first.map(e => e.ruleKey)).size).toBe(first.length);
    expect(first.filter(e => e.localDate === '2026-11-02').map(e => e.type)).toEqual(['daily_checkin', ...Array<string>(8).fill('weekly_checkin')]);
    for (let i = 1; i < first.length; i++) {
      const previous = first[i - 1]!;
      const current = first[i]!;
      expect(Date.parse(previous.dueAt)).toBeLessThanOrEqual(Date.parse(current.dueAt));
      if (Date.parse(previous.dueAt) === Date.parse(current.dueAt)) expect(previous.type <= current.type).toBe(true);
    }
  });

  it('throws stable errors for reversed ranges and invalid timezones', () => {
    expect(() => generateSchedule(input({}, '2026-11-02', '2026-11-01'))).toThrow(ScheduleError);
    expect(() => generateSchedule(input({}, '2026-11-02', '2026-11-01'))).toThrow(expect.objectContaining({ code: 'invalid_range' }));
    expect(() => generateSchedule({ ...input(), timezone: 'Not/AZone' })).toThrow(expect.objectContaining({ code: 'invalid_timezone' }));
    expect(() => localDateOf('2026-11-01T00:00:00Z', 'Not/AZone')).toThrow(expect.objectContaining({ code: 'invalid_timezone' }));
  });

  it('validates schedule documents, including clock times that the shared regex permits', () => {
    const invalid = input();
    invalid.rules.weeklyCheckin.everyDays = 0;
    expect(() => generateSchedule(invalid)).toThrow(expect.objectContaining({ code: 'invalid_range' }));
    expect(() => generateSchedule({ ...input(), startDate: '2026-02-30' })).toThrow(expect.objectContaining({ code: 'invalid_range' }));
    expect(() => generateSchedule(input({ weighInTimeOfDay: '25:90' }))).toThrow(expect.objectContaining({ code: 'invalid_range' }));
  });
});

describe('schedule helpers', () => {
  it('adds calendar days over month, leap-day and year boundaries without mutating the date', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-04-23', 2)).toBe('2026-04-25');
  });

  it('finds a local date using the instant and target zone', () => {
    expect(localDateOf('2026-11-01T23:30:00Z', 'Africa/Cairo')).toBe('2026-11-02');
    expect(localDateOf('2026-11-01T01:00:00+02:00', 'UTC')).toBe('2026-10-31');
  });

  it('returns the next N events strictly after an instant, sorting without mutating', () => {
    const events = generateSchedule(input({ weighIn: { kind: 'daily_fasted' } }, '2026-11-01', '2026-11-05')).reverse();
    const before = events.map(e => e.ruleKey);
    expect(upcoming(events, '2026-11-02T05:00:00Z', 2).map(e => [e.type, e.localDate])).toEqual([
      ['renewal_reminder', '2026-11-02'], ['weigh_in', '2026-11-03'],
    ]);
    expect(events.map(e => e.ruleKey)).toEqual(before);
    expect(upcoming(events, '2026-12-01T00:00:00Z', 10)).toEqual([]);
    expect(upcoming(events, '2026-11-01T00:00:00Z', 0)).toEqual([]);
    expect(upcoming(events, '2026-11-01T00:00:00Z', -1)).toEqual([]);
  });

  it('orders upcoming events by instant even when their textual offsets differ', () => {
    const template = generateSchedule(input({ weighIn: { kind: 'daily_fasted' } }, '2026-11-01', '2026-11-02'))[0]!;
    const events: ScheduleEvent[] = [
      { ...template, type: 'weekly_checkin', dueAt: '2026-11-02T08:00:00+02:00' },
      { ...template, type: 'weigh_in', dueAt: '2026-11-02T07:30:00+03:00' },
      { ...template, type: 'daily_checkin', dueAt: '2026-11-02T06:00:00Z' },
    ];
    expect(upcoming(events, '2026-11-02T04:00:00Z', 3).map(e => e.type)).toEqual(['weigh_in', 'daily_checkin', 'weekly_checkin']);
  });
});
