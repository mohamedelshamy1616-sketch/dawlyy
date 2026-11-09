import { describe, expect, it } from 'vitest';
import { ScheduleRules } from '@dawlyy/core/types';
import { buildCalendar, freezeReason, readReason } from './timeline';

describe('T3b schedule wiring', () => {
  it('keeps weekday weigh-ins while shifting day-count check-ins by a three-day freeze', () => {
    const rules = ScheduleRules.parse({ weighIn: { kind: 'weekly', day: 1 }, weeklyCheckin: { enabled: true } });
    const calendar = buildCalendar({ startsOn: '2026-11-02', durationDays: 28, extensionDays: 0,
      freezes: [{ fromDate: '2026-11-09', days: 3 }], graceDays: 2, timezone: 'Africa/Cairo' }, rules);
    expect(calendar.endsOn).toBe('2026-12-03');
    expect(calendar.events.find((e) => e.type === 'weekly_checkin')?.localDate).toBe('2026-11-12');
    const weighs = calendar.events.filter((e) => e.type === 'weigh_in');
    expect(weighs.length).toBeGreaterThan(0);
    expect(weighs.every((e) => new Date(`${e.localDate}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(weighs.some((e) => e.localDate === '2026-11-09')).toBe(false);
  });
  it('round trips freeze metadata without changing the displayed reason', () => {
    const stored = freezeReason('2026-11-09', 'Travel');
    expect(readReason(stored)).toEqual({ reason: 'Travel', fromDate: '2026-11-09' });
    expect(readReason('Legacy reason')).toEqual({ reason: 'Legacy reason' });
  });
});
