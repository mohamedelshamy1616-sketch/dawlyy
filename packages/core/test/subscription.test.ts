import { describe, it, expect } from 'vitest';
import { TZDate } from '@date-fns/tz';
import { ScheduleEvent, ScheduleRules, type CalendarEventState, type SubscriptionState } from '../src/types';
import { addDays } from '../src/schedule';
import { endsOnFor, graceEndsOnFor, buildSubscriptionSchedule, reconcileSchedule, accessStatus, dueTransition, SubscriptionError, type SubscriptionTimeline, type ExistingEvent } from '../src/subscription';

const rules = ScheduleRules.parse({});
function timeline(patch: Partial<SubscriptionTimeline> = {}): SubscriptionTimeline {
  return { startsOn: '2026-11-01', durationDays: 28, extensionDays: 0, freezes: [], graceDays: 0, timezone: 'Africa/Cairo', ...patch };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function dates(events: ScheduleEvent[], type = 'weekly_checkin'): string[] {
  return events.filter(e => e.type === type).map(e => e.localDate);
}
function rows(events: ScheduleEvent[]): ExistingEvent[] {
  return events.map((e, i) => ({ id: `event-${i}`, ruleKey: e.ruleKey, type: e.type, localDate: e.localDate, dueAt: e.dueAt, state: 'scheduled', source: 'package_rule' }));
}
function error(fn: () => unknown, code: SubscriptionError['code']): void {
  expect(fn).toThrow(SubscriptionError);
  try { fn(); } catch (e) { expect((e as SubscriptionError).code).toBe(code); }
}

describe('subscription timelines', () => {
  it('anchors Day 0, includes the end-day check-in, and derives grace and renewal dates', () => {
    const t = freeze(timeline({ graceDays: 3 }));
    const result = buildSubscriptionSchedule(t, freeze(rules));
    expect(endsOnFor(t)).toBe('2026-11-29');
    expect(graceEndsOnFor(t)).toBe('2026-12-02');
    expect(result.endsOn).toBe('2026-11-29');
    expect(result.graceEndsOn).toBe('2026-12-02');
    expect(dates(result.events)).toEqual([7, 14, 21, 28].map(d => addDays(t.startsOn, d)));
    expect(dates(result.events, 'renewal_reminder')).toEqual([21, 25, 27].map(d => addDays(t.startsOn, d)));
    expect(result.events.every(e => ScheduleEvent.safeParse(e).success)).toBe(true);
    expect(graceEndsOnFor(timeline())).toBeNull();
  });

  it('extends the underlying cadence and recomputes reminders against the new end', () => {
    const t = timeline({ extensionDays: 7 });
    const result = buildSubscriptionSchedule(t, rules);
    expect(result.endsOn).toBe(addDays(t.startsOn, 35));
    expect(dates(result.events)).toEqual([7, 14, 21, 28, 35].map(d => addDays(t.startsOn, d)));
    expect(dates(result.events, 'renewal_reminder')).toEqual([28, 32, 34].map(d => addDays(t.startsOn, d)));
  });

  it('shifts on and after the freeze boundary, preserving rule metadata and wall time', () => {
    const t = freeze(timeline({ freezes: [{ fromDate: '2026-11-11', days: 7 }] }));
    const result = buildSubscriptionSchedule(t, rules);
    expect(result.endsOn).toBe(addDays(t.startsOn, 35));
    expect(dates(result.events)).toEqual([7, 21, 28, 35].map(d => addDays(t.startsOn, d)));
    expect(dates(result.events, 'renewal_reminder')).toEqual([28, 32, 34].map(d => addDays(t.startsOn, d)));
    for (const event of result.events) {
      expect(event.ruleKey).toContain(`${event.type}:${event.localDate}`);
      expect(new TZDate(event.dueAt, t.timezone).getHours()).toBe(event.type === 'renewal_reminder' ? 10 : 9);
    }
    const atBoundary = buildSubscriptionSchedule(timeline({ freezes: [{ fromDate: '2026-11-08', days: 2 }] }), rules);
    expect(dates(atBoundary.events)[0]).toBe('2026-11-10');
  });

  it('applies two freezes in chronological order to already shifted dates without mutating the input', () => {
    const t = freeze(timeline({ extensionDays: 7, freezes: [{ fromDate: '2026-11-23', days: 3 }, { fromDate: '2026-11-11', days: 7 }] }));
    const result = buildSubscriptionSchedule(t, rules);
    expect(result.endsOn).toBe(addDays(t.startsOn, 45));
    expect(dates(result.events)).toEqual([7, 21, 31, 38, 45].map(d => addDays(t.startsOn, d)));
    expect(t.freezes[0]!.fromDate).toBe('2026-11-23');
    // A later freeze can begin in the range made available by an earlier freeze.
    expect(endsOnFor(timeline({ freezes: [{ fromDate: '2026-11-10', days: 7 }, { fromDate: '2026-12-02', days: 2 }] }))).toBe('2026-12-08');
  });

  it('accepts adjacent freezes and rejects overlapping, invalid and out-of-range freezes', () => {
    expect(endsOnFor(timeline({ freezes: [{ fromDate: '2026-11-10', days: 3 }, { fromDate: '2026-11-13', days: 2 }] }))).toBe('2026-12-04');
    for (const freezes of [
      [{ fromDate: '2026-11-10', days: 7 }, { fromDate: '2026-11-16', days: 2 }],
      [{ fromDate: '2026-10-31', days: 1 }],
      [{ fromDate: '2026-11-30', days: 1 }],
      [{ fromDate: '2026-11-10', days: 0 }],
      [{ fromDate: '2026-11-10', days: 1.5 }],
      [{ fromDate: 'bad-date', days: 2 }],
    ]) error(() => endsOnFor(timeline({ freezes })), 'invalid_freeze');
  });

  it('rejects invalid timeline numbers, dates and timezones using the module error', () => {
    for (const patch of [{ durationDays: 0 }, { durationDays: 1.5 }, { durationDays: Infinity }, { extensionDays: -1 }, { extensionDays: NaN }, { graceDays: -1 }, { graceDays: 0.5 }, { timezone: 'Not/AZone' }, { startsOn: '2026-02-30' }]) {
      error(() => endsOnFor(timeline(patch)), 'invalid_timeline');
    }
  });

  it('recomputes short-package reminders even when the original range had none', () => {
    const result = buildSubscriptionSchedule(timeline({ durationDays: 2, freezes: [{ fromDate: '2026-11-02', days: 14 }] }), rules);
    expect(dates(result.events, 'renewal_reminder')).toEqual(['2026-11-10', '2026-11-14', '2026-11-16']);
  });

  it('retains suffixed rule keys for repeated same-day events after a freeze', () => {
    const custom = ScheduleRules.parse({ weeklyCheckin: { firstAfterDays: 7, perCycle: 35, cycleWeeks: 4 }, renewalReminderDaysBefore: [1, 1] });
    const result = buildSubscriptionSchedule(timeline({ freezes: [{ fromDate: '2026-11-05', days: 7 }] }), custom);
    expect(new Set(result.events.map(e => e.ruleKey)).size).toBe(result.events.length);
    expect(result.events.filter(e => e.type === 'weekly_checkin' && e.localDate === '2026-11-15')).toHaveLength(35);
    expect(result.events.find(e => e.ruleKey === 'weekly_checkin:2026-11-15:35')?.payload).toMatchObject({ indexInCycle: 35 });
  });

  it('preserves 09:00 local time across the April and October 2026 Cairo DST changes', () => {
    for (const startsOn of ['2026-04-09', '2026-10-15']) {
      const t = timeline({ startsOn, freezes: [{ fromDate: addDays(startsOn, 10), days: 7 }] });
      const original = buildSubscriptionSchedule({ ...t, freezes: [] }, rules).events.filter(e => e.type === 'weekly_checkin');
      const shifted = buildSubscriptionSchedule(t, rules).events.filter(e => e.type === 'weekly_checkin');
      expect(shifted.map(e => e.localDate)).toEqual([7, 21, 28, 35].map(d => addDays(startsOn, d)));
      expect(shifted.every(e => new TZDate(e.dueAt, t.timezone).getHours() === 9)).toBe(true);
      expect(new TZDate(original[1]!.dueAt, t.timezone).getTimezoneOffset()).not.toBe(new TZDate(shifted[1]!.dueAt, t.timezone).getTimezoneOffset());
    }
  });
});

describe('schedule reconciliation', () => {
  it('cancels moved future keys, inserts new ones, and leaves completed past and manual events untouched', () => {
    const t = timeline();
    const before = buildSubscriptionSchedule(t, rules).events;
    const after = buildSubscriptionSchedule({ ...t, freezes: [{ fromDate: '2026-11-11', days: 7 }] }, rules).events;
    const existing = rows(before);
    existing[0]!.state = 'completed';
    existing.push({ ...existing[1]!, id: 'manual', ruleKey: null, source: 'manual' });
    const result = reconcileSchedule(freeze(existing), freeze(after), { today: '2026-11-11' });
    expect(result.cancel).toEqual(existing.filter(e => e.source === 'package_rule' && e.localDate >= '2026-11-11' && !after.some(a => a.ruleKey === e.ruleKey)).map(e => e.id));
    expect(result.insert.map(e => e.ruleKey)).toEqual(after.filter(e => e.localDate >= '2026-11-11' && !existing.some(r => r.ruleKey === e.ruleKey)).map(e => e.ruleKey));
    expect(result.untouched).toContain(existing[0]!.id);
    expect(result.untouched).toContain('manual');
    expect(result.cancel).toContain(existing.find(e => e.ruleKey === 'weekly_checkin:2026-11-15')!.id);
    expect(result.insert.some(e => e.ruleKey === 'weekly_checkin:2026-12-06')).toBe(true);
    expect(result.update).toEqual([]);
    const all = [...result.cancel, ...result.update.map(e => e.id), ...result.reopen.map(e => e.id), ...result.untouched];
    expect(new Set(all).size).toBe(existing.length);
    expect(all).toHaveLength(existing.length);
  });

  it('updates the time of open rows on today, ignores equivalent timestamp spellings, and sorts deterministically', () => {
    const generated = buildSubscriptionSchedule(timeline(), rules).events;
    const existing = rows(generated);
    const old = existing[0]!;
    const changed = generated.map(e => e.ruleKey === old.ruleKey ? { ...e, dueAt: e.dueAt.replace('T09:', 'T11:') } : e);
    const result = reconcileSchedule([...existing].reverse(), [...changed].reverse(), { today: old.localDate });
    expect(result.update).toEqual([{ id: old.id, dueAt: changed[0]!.dueAt, localDate: old.localDate }]);
    const utcRows = existing.map(e => ({ ...e, dueAt: new Date(e.dueAt).toISOString() }));
    expect(reconcileSchedule(utcRows, generated, { today: old.localDate }).update).toEqual([]);
    expect(reconcileSchedule(existing, changed, { today: old.localDate })).toEqual(result);
  });

  it('reopens cancelled keys after removing a freeze instead of attempting duplicate inserts', () => {
    const original = buildSubscriptionSchedule(timeline(), rules).events;
    const shifted = buildSubscriptionSchedule(timeline({ freezes: [{ fromDate: '2026-11-11', days: 7 }] }), rules).events;
    const existing = rows(original);
    const first = reconcileSchedule(existing, shifted, { today: '2026-11-11' });
    for (const row of existing) if (first.cancel.includes(row.id)) row.state = 'cancelled';
    existing.push(...rows(first.insert).map(e => ({ ...e, id: `shifted-${e.id}` })));
    const result = reconcileSchedule(existing, original, { today: '2026-11-11' });
    expect(result.insert).toEqual([]);
    expect(result.reopen.map(e => e.id)).toEqual(first.cancel);
    expect(result.cancel.length).toBeGreaterThan(0);
  });

  it('protects history, non-package rows and key-less package rows in every state, including cancelled past rows', () => {
    const event = buildSubscriptionSchedule(timeline(), rules).events[0]!;
    const states: CalendarEventState[] = ['scheduled', 'due', 'overdue', 'completed', 'skipped', 'rescheduled', 'cancelled'];
    const base = rows([event])[0]!;
    const existing: ExistingEvent[] = [
      ...states.map(state => ({ ...base, id: `past-${state}`, state, localDate: '2026-10-01' })),
      ...(['completed', 'skipped', 'rescheduled'] as const).map(state => ({ ...base, id: state, state })),
      ...(['manual', 'automation'] as const).flatMap(source => states.map(state => ({ ...base, id: `${source}-${state}`, source, state }))),
      { ...base, id: 'null-key', ruleKey: null },
    ];
    const result = reconcileSchedule(freeze(existing), [event], { today: '2026-11-01' });
    expect(result.reopen).toEqual([]); expect(result.update).toEqual([]); expect(result.insert).toEqual([]);
    // A row without a ruleKey was not produced by the rule engine, so it is never cancelled (review S22).
    expect(result.cancel).toEqual([]);
    expect(result.untouched).toHaveLength(existing.length);
  });

  it('classifies due and overdue rows as open and leaves absent cancelled keys untouched', () => {
    const event = rows(buildSubscriptionSchedule(timeline(), rules).events)[0]!;
    const existing: ExistingEvent[] = [
      { ...event, id: 'due', state: 'due' }, { ...event, id: 'overdue', state: 'overdue' }, { ...event, id: 'cancelled', state: 'cancelled' },
    ];
    expect(reconcileSchedule(existing, [], { today: event.localDate })).toMatchObject({ cancel: ['due', 'overdue'], untouched: ['cancelled'] });
    expect(reconcileSchedule([], buildSubscriptionSchedule(timeline(), rules).events, { today: '2027-01-01' }).insert).toEqual([]);
  });

  it('places each existing id in exactly one bucket when updates, reopens and cancellations coincide', () => {
    const generated = buildSubscriptionSchedule(timeline(), rules).events;
    const existing = rows(generated);
    const updated = existing[0]!;
    const reopened = existing[1]!;
    const cancelled = existing[existing.length - 1]!;
    updated.dueAt = updated.dueAt.replace('T09:', 'T08:');
    reopened.state = 'cancelled';
    existing.push({ ...updated, id: 'manual-row', source: 'manual' });
    const next = generated.filter(e => e.ruleKey !== cancelled.ruleKey);
    const result = reconcileSchedule(freeze(existing), freeze(next), { today: '2026-11-01' });
    expect(result.cancel).toEqual([cancelled.id]);
    expect(result.update).toEqual([{ id: updated.id, dueAt: generated[0]!.dueAt, localDate: updated.localDate }]);
    expect(result.reopen).toEqual([{ id: reopened.id, dueAt: reopened.dueAt, localDate: reopened.localDate }]);
    expect(result.untouched).toContain('manual-row');
    const buckets = [...result.cancel, ...result.update.map(e => e.id), ...result.reopen.map(e => e.id), ...result.untouched];
    expect(buckets.length).toBe(existing.length);
    expect([...buckets].sort()).toEqual(existing.map(e => e.id).sort());
    expect(result.insert).toEqual([]);
  });
});

describe('subscription access and nightly transitions', () => {
  const sub = { state: 'active' as const, startsOn: '2026-11-01', endsOn: '2026-11-29', graceEndsOn: '2026-12-02' };
  it.each([
    ['2026-11-24', 'active', 5, 'باقي 5 أيام', '5 days left'],
    ['2026-11-27', 'active', 2, 'باقي يومين', '2 days left'],
    ['2026-11-28', 'active', 1, 'باقي يوم', '1 day left'],
    ['2026-11-29', 'active', 0, 'آخر يوم النهارده', 'Ends today'],
    ['2026-11-30', 'grace', 0, 'فترة سماح: باقي يومين', 'Grace period: 2 days left'],
    ['2026-12-03', 'expired', 0, 'الاشتراك خلص', 'Subscription ended'],
    ['2026-10-31', 'not_started', 29, 'الاشتراك لسه مبدأش', 'Subscription has not started'],
  ] as const)('derives %s access and localized countdown', (today, access, daysLeft, ar, en) => {
    const result = accessStatus(freeze(sub), today);
    expect(result).toMatchObject({ access, daysLeft, totalDays: 28, endsOn: sub.endsOn, label: { ar, en }, hasAccess: access === 'active' || access === 'grace' });
    expect(result.daysElapsed).toBe(Math.max(0, (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${sub.startsOn}T00:00:00Z`)) / 86400000));
    expect(result.graceDaysLeft).toBe(access === 'grace' ? 2 : null);
  });

  it('uses Egyptian singular/dual/plural forms and includes the full final grace day', () => {
    expect(accessStatus(sub, '2026-11-18').label.ar).toBe('باقي 11 يوم');
    expect(accessStatus(sub, '2026-11-26').label.ar).toBe('باقي 3 أيام');
    expect(accessStatus(sub, '2026-12-02')).toMatchObject({ access: 'grace', hasAccess: true, graceDaysLeft: 0 });
    expect(accessStatus({ ...sub, graceEndsOn: null }, '2026-11-30')).toMatchObject({ access: 'expired', hasAccess: false });
    expect(accessStatus({ ...sub, state: 'grace' }, '2026-11-24').access).toBe('active');
  });

  it.each(['pending', 'paused', 'cancelled', 'suspended', 'expired'] as const)('preserves stored %s state regardless of dates', state => {
    const result = accessStatus({ ...sub, state }, '2026-11-20');
    expect(result.access).toBe(state); expect(result.hasAccess).toBe(false);
    expect(result.label.ar).toBeTruthy(); expect(result.label.en).toBeTruthy();
    if (state === 'pending') expect(result.label).toEqual({ ar: 'الاشتراك مستني التفعيل', en: 'Subscription pending' });
  });

  it('selects enter_grace or expire when a nightly cron is late', () => {
    expect(dueTransition(sub, '2026-11-29')).toBeNull();
    expect(dueTransition(sub, '2026-11-30')).toBe('enter_grace');
    expect(dueTransition(sub, '2026-12-02')).toBe('enter_grace');
    expect(dueTransition(sub, '2026-12-03')).toBe('expire');
    expect(dueTransition({ ...sub, graceEndsOn: null }, '2026-11-30')).toBe('expire');
    expect(dueTransition({ ...sub, state: 'grace' }, '2026-12-02')).toBeNull();
    expect(dueTransition({ ...sub, state: 'grace' }, '2026-12-03')).toBe('expire');
    for (const state of ['pending', 'paused', 'cancelled', 'suspended', 'expired'] satisfies SubscriptionState[]) {
      expect(dueTransition({ ...sub, state }, '2027-01-01')).toBeNull();
    }
  });
});
