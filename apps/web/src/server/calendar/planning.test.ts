import { describe, expect, it } from 'vitest';
import { generateSchedule } from '@dawlyy/core/schedule';
import { ScheduleRules } from '@dawlyy/core/types';
import { calendarTransition, planReminder } from './planning';

describe('Task 8 reminder planning', () => {
  it('generates four weekly check-ins starting on Start Date + 7', () => {
    const events = generateSchedule({ startDate: '2026-11-01', endDate: '2026-11-29', timezone: 'Africa/Cairo', rules: ScheduleRules.parse({ weeklyCheckin: { perCycle: 4 }, renewalReminderDaysBefore: [] }) });
    expect(events.map(event => event.localDate)).toEqual(['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  });
  it('stops reminders in every terminal calendar state', () => {
    for (const state of ['completed', 'skipped', 'rescheduled', 'cancelled'] as const) {
      expect(planReminder({ state, dueAt: new Date('2026-11-01T07:00:00Z'), localDate: '2026-11-01', timezone: 'Africa/Cairo', windowDays: 1 }, new Date('2026-12-01'))).toBeNull();
    }
  });
  it('marks due then overdue once, with no daily reminder loop', () => {
    const event = { state: 'scheduled' as const, dueAt: new Date('2026-11-01T07:00:00Z'), localDate: '2026-11-01', timezone: 'Africa/Cairo', windowDays: 1 };
    expect(planReminder(event, new Date('2026-11-01T08:00:00Z'))).toBe('due');
    expect(planReminder({ ...event, state: 'due' }, new Date('2026-11-01T09:00:00Z'))).toBeNull();
    expect(planReminder({ ...event, state: 'due' }, new Date('2026-11-03T09:00:00Z'))).toBe('overdue');
    expect(planReminder({ ...event, state: 'overdue' }, new Date('2026-11-04T09:00:00Z'))).toBeNull();
  });
  it('adapts the database completion edge and refuses terminal changes', () => {
    expect(calendarTransition('scheduled', 'complete')).toBe('completed');
    expect(calendarTransition('due', 'skip')).toBe('skipped');
    expect(() => calendarTransition('completed', 'reschedule')).toThrow();
  });
});
