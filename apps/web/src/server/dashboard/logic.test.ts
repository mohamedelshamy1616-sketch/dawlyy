import { describe, expect, it } from 'vitest';
import { isAdherenceDecline, queueHref, queueRowHref, snoozeTarget, taskMatchesFilter, timelineHref } from './logic';

describe('Task 10 adherence decline', () => {
  it('flags a drop of at least 30 points and ignores smaller drops', () => {
    expect(isAdherenceDecline({ completed: 4, total: 4 }, { completed: 2, total: 4 })).toBe(true); // 100 -> 50
    expect(isAdherenceDecline({ completed: 4, total: 4 }, { completed: 3, total: 4 })).toBe(false); // 100 -> 75
    expect(isAdherenceDecline({ completed: 10, total: 10 }, { completed: 7, total: 10 })).toBe(true); // exactly 30
    expect(isAdherenceDecline({ completed: 10, total: 10 }, { completed: 8, total: 10 })).toBe(false); // 20
  });
  it('needs a previous window and treats an empty current window as zero', () => {
    expect(isAdherenceDecline({ completed: 0, total: 0 }, { completed: 0, total: 3 })).toBe(false);
    expect(isAdherenceDecline({ completed: 2, total: 3 }, { completed: 0, total: 0 })).toBe(true);
    expect(isAdherenceDecline({ completed: 1, total: 4 }, { completed: 0, total: 0 })).toBe(false); // 25 points
    expect(isAdherenceDecline({ completed: 0, total: 4 }, { completed: 0, total: 4 })).toBe(false);
  });
  it('builds queue and timeline links by path', () => {
    expect(queueHref('missing_data')).toBe('/coach?queue=missing_data');
    expect(queueRowHref('waiting_review', 'c1', 's1')).toBe('/coach/checkins/review/s1');
    expect(queueRowHref('pending_payments', 'c1', 'p1')).toBe('/coach/billing');
    expect(timelineHref('version', 'c1', 'v1', 'p1')).toBe('/coach/programs/p1');
    expect(timelineHref('note', 'c1', 'n1')).toBe('/coach/clients/c1');
  });
});

describe('Task 10 task list helpers', () => {
  const now = Date.parse('2030-01-01T12:00:00Z');
  it('mirrors the API filters, including expired snoozes', () => {
    const open = { state: 'open', snoozedUntil: null };
    const asleep = { state: 'snoozed', snoozedUntil: '2030-01-02T00:00:00Z' };
    const woke = { state: 'snoozed', snoozedUntil: '2030-01-01T11:00:00Z' };
    expect([open, asleep, woke].map(task => taskMatchesFilter(task, 'open', now))).toEqual([true, false, true]);
    expect([open, asleep, woke].map(task => taskMatchesFilter(task, 'snoozed', now))).toEqual([false, true, false]);
    expect(taskMatchesFilter({ state: 'done', snoozedUntil: null }, 'done', now)).toBe(true);
    expect(taskMatchesFilter({ state: 'done', snoozedUntil: null }, 'open', now)).toBe(false);
    expect(taskMatchesFilter({ state: 'done', snoozedUntil: null }, 'all', now)).toBe(true);
  });
  it('snoozes to 09:00 local tomorrow or next week, always in the future', () => {
    const base = new Date(2030, 0, 1, 20, 30);
    const tomorrow = snoozeTarget('tomorrow', base);
    expect([tomorrow.getDate(), tomorrow.getHours(), tomorrow.getMinutes()]).toEqual([2, 9, 0]);
    const week = snoozeTarget('nextWeek', base);
    expect([week.getDate(), week.getHours()]).toEqual([8, 9]);
    expect(tomorrow.getTime()).toBeGreaterThan(base.getTime());
  });
});
