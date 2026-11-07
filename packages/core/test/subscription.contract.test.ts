import { describe, it, expect } from 'vitest';
import { ScheduleRules, SUBSCRIPTION_STATES, ScheduleEvent, type CalendarEventState, type SubscriptionState } from '../src/types';
import { generateSchedule } from '../src/schedule';
import {
  endsOnFor, graceEndsOnFor, buildSubscriptionSchedule, reconcileSchedule, accessStatus, dueTransition, SubscriptionError,
  type SubscriptionTimeline, type ExistingEvent, type Reconciliation,
} from '../src/subscription';

// ---------------------------------------------------------------- helpers
const rules = ScheduleRules.parse({});
const T = (p: Partial<SubscriptionTimeline> = {}): SubscriptionTimeline => ({ startsOn: '2026-11-01', durationDays: 28, extensionDays: 0, freezes: [], graceDays: 0, timezone: 'Africa/Cairo', ...p });
/** Independent calendar arithmetic (no import from src). */
function plus(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function diff(from: string, to: string): number { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000); }
/** Wall-clock date and HH:mm of an instant in a zone, computed with Intl only. */
function wall(instant: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function deepFreeze<V>(value: V): V {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
function datesOf(events: ScheduleEvent[], type = 'weekly_checkin'): string[] { return events.filter(e => e.type === type).map(e => e.localDate).sort(); }
function rowsOf(events: ScheduleEvent[], prefix = 'r'): ExistingEvent[] {
  return events.map((e, i) => ({ id: `${prefix}${i}`, ruleKey: e.ruleKey, type: e.type, localDate: e.localDate, dueAt: e.dueAt, state: 'scheduled' as CalendarEventState, source: 'package_rule' as const }));
}
function thrown(fn: () => unknown): unknown { try { fn(); } catch (e) { return e; } return undefined; }
function expectCode(fn: () => unknown, code: SubscriptionError['code']): void {
  const e = thrown(fn);
  expect(e, 'expected SubscriptionError, got ' + String(e)).toBeInstanceOf(SubscriptionError);
  expect((e as SubscriptionError).code).toBe(code);
}
function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ids = (r: Reconciliation) => [...r.cancel, ...r.update.map(x => x.id), ...r.reopen.map(x => x.id), ...r.untouched];
function applyRec(existing: ExistingEvent[], generated: ScheduleEvent[], r: Reconciliation): ExistingEvent[] {
  const next = clone(existing);
  for (const id of r.cancel) next.find(x => x.id === id)!.state = 'cancelled';
  for (const u of r.update) Object.assign(next.find(x => x.id === u.id)!, { dueAt: u.dueAt, localDate: u.localDate });
  for (const u of r.reopen) Object.assign(next.find(x => x.id === u.id)!, { dueAt: u.dueAt, localDate: u.localDate, state: 'scheduled' });
  r.insert.forEach((e, i) => next.push({ id: `ins-${e.ruleKey}-${i}`, ruleKey: e.ruleKey, type: e.type, localDate: e.localDate, dueAt: e.dueAt, state: 'scheduled', source: 'package_rule' }));
  void generated;
  return next;
}
const empty = (r: Reconciliation) => r.insert.length + r.cancel.length + r.update.length + r.reopen.length === 0;

const richRules = ScheduleRules.parse({
  dailyCheckin: { enabled: true }, weighIn: { kind: 'weekly', day: 1 },
  measurements: { everyDays: 14, firstAfterDays: 0 }, progressPhotos: { everyDays: 10, firstAfterDays: 0, timeOfDay: '08:15' },
  techniqueReview: { enabled: true }, programReviewEveryDays: 10,
});
const days = Array.from({ length: 40 }, (_, i) => plus('2026-10-25', i)); // 2026-10-25 .. 2026-12-03
const WALL: Record<string, string> = { weekly_checkin: '09:00', daily_checkin: '20:00', weigh_in: '07:00', measurements: '09:00', progress_photos: '08:15', technique_review: '09:00', renewal_reminder: '10:00', program_review: '09:00' };

// ---------------------------------------------------------------- A. dates, endsOn, grace
describe('A. date model', () => {
  it('S1 endsOn and graceEndsOn arithmetic across a month end, a year end and a leap day', () => {
    expect(endsOnFor(T({ startsOn: '2026-12-20' }))).toBe('2027-01-17');
    expect(endsOnFor(T({ startsOn: '2028-02-15', durationDays: 28 }))).toBe('2028-03-14');
    expect(endsOnFor(T({ startsOn: '2027-02-15', durationDays: 28 }))).toBe('2027-03-15');
    expect(graceEndsOnFor(T({ graceDays: 1 }))).toBe('2026-11-30');
    expect(graceEndsOnFor(T({ graceDays: 0 }))).toBeNull();
    expect(endsOnFor(T({ durationDays: 1 }))).toBe('2026-11-02');
  });

  it('S2 endsOn equals startsOn + duration + extension + sum of freeze days; graceEndsOn follows the final end', () => {
    const t = T({ extensionDays: 5, graceDays: 4, freezes: [{ fromDate: '2026-11-10', days: 3 }, { fromDate: '2026-11-20', days: 2 }] });
    expect(endsOnFor(t)).toBe(plus('2026-11-01', 28 + 5 + 3 + 2));
    expect(graceEndsOnFor(t)).toBe(plus('2026-11-01', 28 + 5 + 3 + 2 + 4));
    const built = buildSubscriptionSchedule(t, rules);
    expect(built.endsOn).toBe(endsOnFor(t));
    expect(built.graceEndsOn).toBe(graceEndsOnFor(t));
  });

  it('S3 a 1-day package keeps a valid schedule and accessStatus has totalDays 1', () => {
    const r = buildSubscriptionSchedule(T({ durationDays: 1 }), rules);
    expect(r.endsOn).toBe('2026-11-02');
    expect(datesOf(r.events)).toEqual([]);
    expect(accessStatus({ state: 'active', startsOn: '2026-11-01', endsOn: '2026-11-02' }, '2026-11-02')).toMatchObject({ totalDays: 1, daysLeft: 0, daysElapsed: 1, access: 'active' });
  });
});

// ---------------------------------------------------------------- B. extensions and freezes
describe('B. extensions and freezes', () => {
  it('S4 a freeze starting on startsOn shifts the first check-in and moves endsOn', () => {
    const r = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-01', days: 3 }] }), rules);
    expect(datesOf(r.events)).toEqual([10, 17, 24, 31].map(d => plus('2026-11-01', d)));
    expect(r.endsOn).toBe(plus('2026-11-01', 31));
  });

  it('S5 a freeze on endsOn shifts the end-day check-in onto the new endsOn', () => {
    const r = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-29', days: 7 }] }), rules);
    expect(r.endsOn).toBe('2026-12-06');
    expect(datesOf(r.events)).toEqual([7, 14, 21, 35].map(d => plus('2026-11-01', d)));
    expect(datesOf(r.events, 'renewal_reminder')).toEqual([28, 32, 34].map(d => plus('2026-11-01', d)));
  });

  it('S6 three freezes, adjacent and given out of order, equal the sorted result', () => {
    const fz = [{ fromDate: '2026-11-14', days: 2 }, { fromDate: '2026-11-10', days: 4 }, { fromDate: '2026-11-16', days: 1 }];
    const a = buildSubscriptionSchedule(T({ freezes: fz }), richRules);
    const b = buildSubscriptionSchedule(T({ freezes: [...fz].sort((x, y) => x.fromDate.localeCompare(y.fromDate)) }), richRules);
    expect(a).toEqual(b);
    expect(a.endsOn).toBe(plus('2026-11-01', 28 + 7));
  });

  it('S7 extension plus a freeze: check-ins continue through the extended range and reminders follow the final end', () => {
    const r = buildSubscriptionSchedule(T({ extensionDays: 7, freezes: [{ fromDate: '2026-11-11', days: 7 }] }), rules);
    expect(r.endsOn).toBe(plus('2026-11-01', 42));
    expect(datesOf(r.events)).toEqual([7, 21, 28, 35, 42].map(d => plus('2026-11-01', d)));
    expect(datesOf(r.events, 'renewal_reminder')).toEqual([35, 39, 41].map(d => plus('2026-11-01', d)));
  });

  it('S8 reminders after a freeze equal the reminders of an equivalent extension (recomputed, never shifted)', () => {
    const frozen = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-05', days: 9 }] }), rules);
    const extended = buildSubscriptionSchedule(T({ extensionDays: 9 }), rules);
    const keys = (r: ReturnType<typeof buildSubscriptionSchedule>) => r.events.filter(e => e.type === 'renewal_reminder').map(e => [e.ruleKey, e.dueAt]);
    expect(keys(frozen)).toEqual(keys(extended));
  });

  it('S9 events strictly before fromDate are byte-identical to the freeze-less schedule; events on/after it all moved by F', () => {
    const plain = buildSubscriptionSchedule(T(), richRules).events.filter(e => e.type !== 'renewal_reminder');
    const frozen = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-12', days: 5 }] }), richRules).events.filter(e => e.type !== 'renewal_reminder');
    expect(frozen.filter(e => e.localDate < '2026-11-12')).toEqual(plain.filter(e => e.localDate < '2026-11-12'));
    const moved = plain.filter(e => e.localDate >= '2026-11-12').map(e => `${e.type}:${plus(e.localDate, 5)}`).sort();
    expect(frozen.filter(e => e.localDate >= '2026-11-12').map(e => `${e.type}:${e.localDate}`).sort()).toEqual(moved);
    expect(frozen.length).toBe(plain.length);
  });

  it('S10 no non-reminder event falls inside the frozen window', () => {
    const r = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-05', days: 6 }] }), richRules);
    const inside = r.events.filter(e => e.type !== 'renewal_reminder' && e.localDate >= '2026-11-05' && e.localDate < '2026-11-11');
    expect(inside.map(e => e.ruleKey)).toEqual([]);
  });

  it('S11 daily check-in count is conserved by a freeze and the last one lands on endsOn', () => {
    const daily = ScheduleRules.parse({ dailyCheckin: { enabled: true }, weeklyCheckin: { enabled: false } });
    const r = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-10', days: 4 }] }), daily);
    const days = datesOf(r.events, 'daily_checkin');
    expect(days).toHaveLength(28);
    expect(days.at(-1)).toBe(r.endsOn);
  });

  it('S12 day-0 baseline measurements stay on startsOn unless the freeze starts on startsOn', () => {
    const m = ScheduleRules.parse({ measurements: { everyDays: 14, firstAfterDays: 0 } });
    expect(datesOf(buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-02', days: 3 }] }), m).events, 'measurements')[0]).toBe('2026-11-01');
    expect(datesOf(buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-01', days: 3 }] }), m).events, 'measurements')[0]).toBe('2026-11-04');
  });

  it('S13 per-cycle payloads and same-day suffix keys survive a shift unchanged', () => {
    const per = ScheduleRules.parse({ weeklyCheckin: { firstAfterDays: 7, perCycle: 3, cycleWeeks: 2 } });
    const plain = buildSubscriptionSchedule(T(), per).events.filter(e => e.type === 'weekly_checkin');
    const frozen = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-01', days: 2 }] }), per).events.filter(e => e.type === 'weekly_checkin');
    expect(frozen.map(e => e.payload)).toEqual(plain.map(e => e.payload));
    expect(frozen.map(e => e.windowDays)).toEqual(plain.map(e => e.windowDays));
  });

  it('S14 [question] weekday-anchored weigh-ins move to other weekdays after a freeze that is not a multiple of 7', () => {
    // Contract literally shifts every event by F, so this PINS the current behaviour. Reading 2: weekday cadences should re-anchor.
    const w = ScheduleRules.parse({ weighIn: { kind: 'weekly', day: 1 } });
    const plain = buildSubscriptionSchedule(T(), w).events.filter(e => e.type === 'weigh_in');
    const frozen = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-01', days: 3 }] }), w).events.filter(e => e.type === 'weigh_in');
    expect(plain.every(e => new Date(`${e.localDate}T00:00:00Z`).getUTCDay() === 1)).toBe(true);
    expect(frozen.map(e => e.localDate)).toEqual(plain.map(e => plus(e.localDate, 3)));
  });

  it('S15 build is independent of freeze input order and does not alias or mutate the inputs', () => {
    const t = deepFreeze(T({ extensionDays: 3, freezes: [{ fromDate: '2026-11-20', days: 2 }, { fromDate: '2026-11-08', days: 2 }] }));
    const before = clone(t);
    const out = buildSubscriptionSchedule(t, deepFreeze(clone(richRules)));
    expect(t).toEqual(before);
    expect(out.events.every(e => ScheduleEvent.safeParse(e).success)).toBe(true);
  });
});

// ---------------------------------------------------------------- C. time zones
describe('C. time zones and DST', () => {
  it('S16 DST gap: wall-clock time of day is preserved when a shifted event originated on the spring-forward day', () => {
    // Cairo clocks jump 00:00 -> 01:00 on Fri 2026-04-24, so 00:30 does not exist that day.
    const early = ScheduleRules.parse({ weeklyCheckin: { timeOfDay: '00:30' } });
    const t = T({ startsOn: '2026-04-10', freezes: [{ fromDate: '2026-04-15', days: 7 }] });
    const bad = buildSubscriptionSchedule(t, early).events
      .filter(e => e.type === 'weekly_checkin' && e.localDate !== '2026-04-24')
      .filter(e => wall(e.dueAt, 'Africa/Cairo').time !== '00:30')
      .map(e => `${e.localDate} ${e.dueAt}`);
    expect(bad).toEqual([]);
  });

  it('S16b same defect in America/New_York (02:30 on 2026-03-08 does not exist)', () => {
    const early = ScheduleRules.parse({ weeklyCheckin: { timeOfDay: '02:30' } });
    const t = T({ startsOn: '2026-03-01', timezone: 'America/New_York', freezes: [{ fromDate: '2026-03-05', days: 14 }] });
    const bad = buildSubscriptionSchedule(t, early).events
      .filter(e => e.type === 'weekly_checkin' && e.localDate !== '2026-03-08')
      .filter(e => wall(e.dueAt, 'America/New_York').time !== '02:30')
      .map(e => `${e.localDate} ${e.dueAt}`);
    expect(bad).toEqual([]);
  });

  it('S17 autumn fall-back 2026-10-29 in Cairo: 09:00 and 23:30 stay put across a freeze that crosses the change', () => {
    for (const timeOfDay of ['09:00', '23:30']) {
      const r = ScheduleRules.parse({ weeklyCheckin: { timeOfDay } });
      const evs = buildSubscriptionSchedule(T({ startsOn: '2026-10-15', freezes: [{ fromDate: '2026-10-20', days: 3 }] }), r).events.filter(e => e.type === 'weekly_checkin');
      for (const e of evs) {
        const w = wall(e.dueAt, 'Africa/Cairo');
        expect({ d: e.localDate, ...w }).toEqual({ d: e.localDate, date: e.localDate, time: timeOfDay });
      }
    }
  });

  it('S18 spring-forward 2026-04-24 in Cairo: 09:00 / 10:00 events are at the intended wall time on both sides, offsets differ', () => {
    const r = buildSubscriptionSchedule(T({ startsOn: '2026-04-10', freezes: [{ fromDate: '2026-04-12', days: 5 }] }), rules);
    for (const e of r.events) expect(wall(e.dueAt, 'Africa/Cairo')).toEqual({ date: e.localDate, time: WALL[e.type] });
    const offsets = new Set(r.events.map(e => e.dueAt.slice(-6)));
    expect([...offsets].sort()).toEqual(['+02:00', '+03:00']);
  });

  it('S19 half-hour, 45-minute and southern-hemisphere zones keep rule times across a freeze', () => {
    const cases: Array<[string, string, string]> = [['Asia/Kolkata', '2026-04-01', '09:30'], ['Asia/Kathmandu', '2026-04-01', '09:00'], ['Australia/Lord_Howe', '2026-03-25', '09:00'], ['America/Santiago', '2026-08-25', '09:00'], ['Pacific/Auckland', '2026-09-15', '09:00'], ['Europe/London', '2026-10-20', '09:00']];
    for (const [timezone, startsOn, tod] of cases) {
      const r = ScheduleRules.parse({ weeklyCheckin: { timeOfDay: tod } });
      const evs = buildSubscriptionSchedule(T({ timezone, startsOn, freezes: [{ fromDate: plus(startsOn, 5), days: 6 }, { fromDate: plus(startsOn, 20), days: 3 }] }), r).events;
      for (const e of evs.filter(x => x.type === 'weekly_checkin')) expect({ timezone, ...wall(e.dueAt, timezone) }).toEqual({ timezone, date: e.localDate, time: tod });
      for (const e of evs.filter(x => x.type === 'renewal_reminder')) expect({ timezone, ...wall(e.dueAt, timezone) }).toEqual({ timezone, date: e.localDate, time: '10:00' });
      expect(evs.every(e => e.timezone === timezone)).toBe(true);
    }
  });

  it('S20 the event instant never changes the local date: localDate always equals the wall date of dueAt (fuzz over zones and freezes)', () => {
    const rnd = mulberry32(7);
    const zones = ['Africa/Cairo', 'America/New_York', 'Europe/London', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo', 'Asia/Dubai'];
    const starts = ['2026-03-20', '2026-04-15', '2026-09-20', '2026-10-20', '2026-10-27'];
    for (let i = 0; i < 40; i++) {
      const timezone = zones[Math.floor(rnd() * zones.length)]!;
      const startsOn = starts[Math.floor(rnd() * starts.length)]!;
      const durationDays = 14 + Math.floor(rnd() * 30);
      const from = plus(startsOn, Math.floor(rnd() * 14));
      const t = T({ timezone, startsOn, durationDays, freezes: [{ fromDate: from, days: 1 + Math.floor(rnd() * 9) }] });
      for (const e of buildSubscriptionSchedule(t, richRules).events) {
        expect({ i, timezone, k: e.ruleKey, ...wall(e.dueAt, timezone) }).toEqual({ i, timezone, k: e.ruleKey, date: e.localDate, time: WALL[e.type] });
      }
    }
  });
});

// ---------------------------------------------------------------- D. build fuzz against an independent oracle
describe('D. buildSubscriptionSchedule oracle', () => {
  it('S21 matches an independent model of the contract (cadence over base range, cumulative freeze shifts, reminders from the final end)', () => {
    const rnd = mulberry32(42);
    const ruleSets = [rules, richRules, ScheduleRules.parse({ weeklyCheckin: { firstAfterDays: 3, everyDays: 5 }, techniqueReview: { enabled: true, firstWeeks: 3 } })];
    for (let i = 0; i < 60; i++) {
      const durationDays = 3 + Math.floor(rnd() * 60);
      const extensionDays = Math.floor(rnd() * 10);
      const startsOn = plus('2026-09-01', Math.floor(rnd() * 90));
      let end = plus(startsOn, durationDays + extensionDays);
      const freezes: SubscriptionTimeline['freezes'] = [];
      let cursor = startsOn;
      for (let k = 0; k < Math.floor(rnd() * 4); k++) {
        const room = diff(cursor, end);
        if (room < 0) break;
        const fromDate = plus(cursor, Math.floor(rnd() * (room + 1)));
        const days = 1 + Math.floor(rnd() * 8);
        freezes.push({ fromDate, days });
        cursor = plus(fromDate, days);
        end = plus(end, days);
      }
      const shuffled = [...freezes].reverse();
      const t = T({ startsOn, durationDays, extensionDays, freezes: shuffled });
      const rs = ruleSets[i % ruleSets.length]!;
      const out = buildSubscriptionSchedule(t, rs);
      // oracle
      const base = generateSchedule({ startDate: startsOn, endDate: plus(startsOn, durationDays + extensionDays), timezone: t.timezone, rules: { ...rs, renewalReminderDaysBefore: [] } });
      const expected = base.map(e => { let d = e.localDate; for (const f of freezes) if (d >= f.fromDate) d = plus(d, f.days); return `${e.type}:${d}`; });
      const lastDay = diff(startsOn, end);
      for (const b of rs.renewalReminderDaysBefore) if (lastDay - b >= 1) expected.push(`renewal_reminder:${plus(end, -b)}`);
      const got = out.events.map(e => `${e.type}:${e.localDate}`);
      const ctx = JSON.stringify({ i, t });
      expect(got.sort(), ctx).toEqual(expected.sort());
      expect(out.endsOn, ctx).toBe(end);
      expect(new Set(out.events.map(e => e.ruleKey)).size, ctx).toBe(out.events.length);
      for (const e of out.events) {
        expect(e.localDate >= startsOn && e.localDate <= end, ctx + e.ruleKey).toBe(true);
        expect(e.ruleKey.startsWith(`${e.type}:${e.localDate}`), ctx + e.ruleKey).toBe(true);
        expect(wall(e.dueAt, t.timezone), ctx + e.ruleKey).toEqual({ date: e.localDate, time: WALL[e.type] });
      }
    }
  });
});

// ---------------------------------------------------------------- E. reconcile
describe('E. reconcileSchedule', () => {
  const plain = buildSubscriptionSchedule(T(), rules).events;
  const frozen = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-11', days: 7 }] }), rules).events;

  it('S22 a package_rule row with ruleKey null is never cancelled (manual / key-less rows are history we do not own)', () => {
    const row: ExistingEvent = { id: 'nk', ruleKey: null, type: 'custom', localDate: '2026-11-20', dueAt: '2026-11-20T09:00:00.000+02:00', state: 'scheduled', source: 'package_rule' };
    const r = reconcileSchedule([row], plain, { today: '2026-11-01' });
    expect(r.cancel).not.toContain('nk');
    expect(r.untouched).toContain('nk');
  });

  it('S23 reconciling after applying a reconcile is a no-op (freeze, un-freeze, extension, time change)', () => {
    const scenarios: Array<[string, ScheduleEvent[], ScheduleEvent[]]> = [
      ['freeze', plain, frozen],
      ['unfreeze', frozen, plain],
      ['extend', plain, buildSubscriptionSchedule(T({ extensionDays: 7 }), rules).events],
      ['time', plain, buildSubscriptionSchedule(T(), ScheduleRules.parse({ weeklyCheckin: { timeOfDay: '18:00' } })).events],
    ];
    for (const [name, a, b] of scenarios) {
      const existing = rowsOf(a);
      const first = reconcileSchedule(existing, b, { today: '2026-11-03' });
      const applied = applyRec(existing, b, first);
      expect(empty(reconcileSchedule(applied, b, { today: '2026-11-03' })), name).toBe(true);
    }
  });

  it('S24 freeze, un-freeze, freeze again: no ruleKey is ever inserted twice and the DB unique index holds', () => {
    let db = rowsOf(plain);
    const seq = [frozen, plain, frozen, plain];
    for (const target of seq) {
      const r = reconcileSchedule(db, target, { today: '2026-11-03' });
      db = applyRec(db, target, r);
      const keys = db.map(x => x.ruleKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
    // final state equals plain for all future dates
    const open = db.filter(x => x.state !== 'cancelled' && x.localDate >= '2026-11-03').map(x => x.ruleKey).sort();
    expect(open).toEqual(plain.filter(e => e.localDate >= '2026-11-03').map(e => e.ruleKey).sort());
  });

  it('S25 [today boundary] a row dated today is managed; a row dated yesterday is untouched; generated events dated yesterday are not inserted', () => {
    const e = plain.find(x => x.type === 'weekly_checkin')!; // 2026-11-08
    const row = rowsOf([e])[0]!;
    expect(reconcileSchedule([row], [], { today: e.localDate }).cancel).toEqual([row.id]);
    expect(reconcileSchedule([row], [], { today: plus(e.localDate, 1) })).toMatchObject({ cancel: [], untouched: [row.id] });
    expect(reconcileSchedule([], [e], { today: e.localDate }).insert).toHaveLength(1);
    expect(reconcileSchedule([], [e], { today: plus(e.localDate, 1) }).insert).toHaveLength(0);
  });

  it('S26 everything is in the past relative to today: nothing is inserted, cancelled, updated or reopened', () => {
    const existing = rowsOf(plain).map((r, i) => ({ ...r, state: (['scheduled', 'due', 'overdue', 'cancelled'] as const)[i % 4]! }));
    const r = reconcileSchedule(existing, frozen, { today: '2027-06-01' });
    expect(empty(r)).toBe(true);
    expect(r.untouched.slice().sort()).toEqual(existing.map(x => x.id).sort());
  });

  it('S27 history, other-source and past rows are never cancelled, updated or reopened, whatever the new schedule says', () => {
    const rnd = mulberry32(99);
    const states: CalendarEventState[] = ['scheduled', 'due', 'overdue', 'completed', 'skipped', 'rescheduled', 'cancelled'];
    const sources = ['package_rule', 'manual', 'automation'] as const;
    for (let i = 0; i < 80; i++) {
      const a = buildSubscriptionSchedule(T({ freezes: rnd() < 0.5 ? [{ fromDate: plus('2026-11-01', 3 + Math.floor(rnd() * 20)), days: 1 + Math.floor(rnd() * 8) }] : [] }), richRules).events;
      const b = buildSubscriptionSchedule(T({ extensionDays: Math.floor(rnd() * 8), freezes: rnd() < 0.7 ? [{ fromDate: plus('2026-11-01', 2 + Math.floor(rnd() * 20)), days: 1 + Math.floor(rnd() * 8) }] : [] }), richRules).events;
      const today = plus('2026-11-01', Math.floor(rnd() * 30));
      const existing = rowsOf(a).map(r => ({ ...r, state: states[Math.floor(rnd() * states.length)]!, source: sources[Math.floor(rnd() * 3)]! }));
      existing.push({ id: 'nokey', ruleKey: null, type: 'custom', localDate: plus(today, 2), dueAt: `${plus(today, 2)}T12:00:00.000+02:00`, state: 'scheduled', source: 'manual' });
      const r = reconcileSchedule(deepFreeze(clone(existing)), deepFreeze(clone(b)), { today });
      const ctx = JSON.stringify({ i, today });
      // exactly one bucket
      expect(ids(r).slice().sort(), ctx).toEqual(existing.map(x => x.id).sort());
      const byId = new Map(existing.map(x => [x.id, x]));
      const mutable = [...r.cancel, ...r.update.map(x => x.id), ...r.reopen.map(x => x.id)].map(id => byId.get(id)!);
      for (const row of mutable) {
        expect(row.source, ctx).toBe('package_rule');
        expect(row.localDate >= today, ctx).toBe(true);
        expect(['completed', 'skipped', 'rescheduled'].includes(row.state), ctx).toBe(false);
        expect(row.ruleKey, ctx).not.toBeNull();
      }
      for (const id of r.cancel) { const row = byId.get(id)!; expect(['scheduled', 'due', 'overdue'], ctx).toContain(row.state); expect(b.some(e => e.ruleKey === row.ruleKey), ctx).toBe(false); }
      for (const u of r.reopen) expect(byId.get(u.id)!.state, ctx).toBe('cancelled');
      for (const u of r.update) expect(['scheduled', 'due', 'overdue'], ctx).toContain(byId.get(u.id)!.state);
      for (const e of r.insert) { expect(e.localDate >= today, ctx).toBe(true); expect(existing.some(x => x.ruleKey === e.ruleKey), ctx).toBe(false); }
      // insert is complete
      const expectedInsert = b.filter(e => e.localDate >= today && !existing.some(x => x.ruleKey === e.ruleKey)).map(e => e.ruleKey).sort();
      expect(r.insert.map(e => e.ruleKey).sort(), ctx).toEqual(expectedInsert);
      // idempotent
      const applied = applyRec(existing, b, r);
      expect(empty(reconcileSchedule(applied, b, { today })), ctx).toBe(true);
    }
  });

  it('S28 a cancelled package_rule row whose key comes back goes to reopen even when it is dated exactly today, never to insert', () => {
    const e = plain.find(x => x.type === 'weekly_checkin')!;
    const row = { ...rowsOf([e])[0]!, state: 'cancelled' as const };
    const r = reconcileSchedule([row], [e], { today: e.localDate });
    expect(r.insert).toEqual([]);
    expect(r.reopen).toEqual([{ id: row.id, dueAt: e.dueAt, localDate: e.localDate }]);
  });

  it('S29 a cancelled row reopens with the NEW dueAt when only the time of day changed', () => {
    const e = plain.find(x => x.type === 'weekly_checkin')!;
    const row = { ...rowsOf([e])[0]!, state: 'cancelled' as const, dueAt: e.dueAt.replace('T09:', 'T07:') };
    const r = reconcileSchedule([row], [e], { today: '2026-11-01' });
    expect(r.reopen[0]!.dueAt).toBe(e.dueAt);
  });

  it('S30 output order is deterministic by dueAt then type and independent of input order, including same-instant ties', () => {
    const tie = ScheduleRules.parse({ measurements: { everyDays: 7, firstAfterDays: 7 }, programReviewEveryDays: 7 }); // all 09:00 on the same days
    const gen = buildSubscriptionSchedule(T(), tie).events;
    const existing = rowsOf(gen);
    // change every dueAt so every row is an update, and give ids in reverse alphabetical-type order
    const changed = gen.map(e => ({ ...e, dueAt: e.dueAt.replace('T09:', 'T10:') }));
    const rnd = mulberry32(5);
    const shuffle = <V,>(a: V[]) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j]!, c[i]!]; } return c; };
    const base = reconcileSchedule(existing, changed, { today: '2026-11-01' });
    for (let i = 0; i < 5; i++) expect(reconcileSchedule(shuffle(existing), shuffle(changed), { today: '2026-11-01' })).toEqual(base);
    const typeAt = new Map(existing.map(x => [x.id, x.type]));
    const seq = base.update.map(u => `${u.dueAt}|${typeAt.get(u.id)}`);
    expect(seq).toEqual([...seq].sort((p, q) => { const [pd, pt] = p.split('|') as [string, string]; const [qd, qt] = q.split('|') as [string, string]; return Date.parse(pd) - Date.parse(qd) || (pt < qt ? -1 : pt > qt ? 1 : 0); }));
  });

  it('S31 equal instants written with different offsets are not an update; a different instant with the same wall text is', () => {
    const e = plain.find(x => x.type === 'weekly_checkin')!;
    const row = rowsOf([e])[0]!;
    expect(reconcileSchedule([{ ...row, dueAt: new Date(e.dueAt).toISOString() }], [e], { today: '2026-11-01' }).update).toEqual([]);
    expect(reconcileSchedule([{ ...row, dueAt: e.dueAt.replace('+02:00', '+03:00') }], [e], { today: '2026-11-01' }).update).toHaveLength(1);
  });

  it('S32 retroactive freeze: an overdue open row from before today is left alone (never rewritten) while the shifted future rows are inserted', () => {
    const existing = rowsOf(plain).map(r => (r.localDate === '2026-11-08' ? { ...r, state: 'overdue' as const } : r));
    const retro = buildSubscriptionSchedule(T({ freezes: [{ fromDate: '2026-11-05', days: 7 }] }), rules).events;
    const r = reconcileSchedule(existing, retro, { today: '2026-11-10' });
    const overdue = existing.find(x => x.localDate === '2026-11-08')!;
    expect(r.untouched).toContain(overdue.id);
    expect(r.insert.map(e => e.ruleKey)).toContain('weekly_checkin:2026-12-06');
    expect(r.cancel).not.toContain(overdue.id);
  });

  it('S33 inputs are not mutated and result.insert holds valid ScheduleEvents', () => {
    const existing = deepFreeze(rowsOf(plain));
    const gen = deepFreeze(clone(frozen));
    const r = reconcileSchedule(existing, gen, { today: '2026-11-03' });
    expect(r.insert.every(e => ScheduleEvent.safeParse(e).success)).toBe(true);
  });

  it('S34 a key present twice in generated (suffix keys) is matched per exact key, not per prefix', () => {
    const custom = ScheduleRules.parse({ weeklyCheckin: { firstAfterDays: 7, perCycle: 3, cycleWeeks: 1 } });
    const gen = buildSubscriptionSchedule(T({ durationDays: 14 }), custom).events.filter(e => e.type === 'weekly_checkin');
    expect(new Set(gen.map(e => e.ruleKey)).size).toBe(gen.length);
    const r = reconcileSchedule(rowsOf(gen), gen, { today: '2026-11-01' });
    expect(empty(r)).toBe(true);
  });
});

// ---------------------------------------------------------------- F. access status
describe('F. accessStatus', () => {
  const sub = { startsOn: '2026-11-01', endsOn: '2026-11-29', graceEndsOn: '2026-12-02' };

  it('S35 active: exact boundary table (day before start, Day 0, last day, grace first/last, day after grace)', () => {
    const table: Array<[string, string, boolean, number, number, number | null]> = [
      ['2026-10-31', 'not_started', false, 0, 29, null],
      ['2026-11-01', 'active', true, 0, 28, null],
      ['2026-11-02', 'active', true, 1, 27, null],
      ['2026-11-28', 'active', true, 27, 1, null],
      ['2026-11-29', 'active', true, 28, 0, null],
      ['2026-11-30', 'grace', true, 29, 0, 2],
      ['2026-12-01', 'grace', true, 30, 0, 1],
      ['2026-12-02', 'grace', true, 31, 0, 0],
      ['2026-12-03', 'expired', false, 32, 0, null],
    ];
    for (const [today, access, hasAccess, elapsed, left, grace] of table) {
      expect(accessStatus({ state: 'active', ...sub }, today), today).toMatchObject({ access, hasAccess, daysElapsed: elapsed, daysLeft: left, graceDaysLeft: grace, totalDays: 28, endsOn: '2026-11-29' });
    }
  });

  it('S36 hasAccess is true exactly for active and grace across every stored state and date', () => {
    for (const state of SUBSCRIPTION_STATES) for (const today of days) {
      const r = accessStatus({ state, ...sub }, today);
      expect(r.hasAccess, `${state} ${today}`).toBe(r.access === 'active' || r.access === 'grace');
      if (!['active', 'grace'].includes(state)) expect(r.access, `${state} ${today}`).toBe(state);
      if (['active', 'grace'].includes(state)) expect(['not_started', 'active', 'grace', 'expired'], `${state} ${today}`).toContain(r.access);
    }
  });

  it('S37 stored grace behaves like stored active: dates decide', () => {
    for (const today of days) expect(accessStatus({ state: 'grace', ...sub }, today)).toEqual(accessStatus({ state: 'active', ...sub }, today));
  });

  it('S38 stored expired, paused, cancelled, suspended, pending never gain access from the dates, and carry no countdown label', () => {
    for (const state of ['expired', 'paused', 'cancelled', 'suspended', 'pending'] as const) {
      const r = accessStatus({ state, ...sub }, '2026-11-15');
      expect(r.hasAccess).toBe(false);
      expect(r.label.en).not.toMatch(/left|Ends today/);
      expect(r.label.ar).not.toMatch(/باقي|آخر يوم/);
      expect(r.graceDaysLeft).toBeNull();
    }
  });

  it('S39 Arabic labels use the right singular / dual / plural for every count from 1 to 30 and for 100', () => {
    const ar = (n: number) => (n === 1 ? 'يوم' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوم`);
    for (const n of [...Array.from({ length: 30 }, (_, i) => i + 1), 100]) {
      const s = { state: 'active' as const, startsOn: '2026-01-01', endsOn: plus('2026-06-01', 0) };
      const today = plus('2026-06-01', -n);
      expect(accessStatus(s, today).label, `n=${n}`).toEqual({ ar: `باقي ${ar(n)}`, en: `${n} ${n === 1 ? 'day' : 'days'} left` });
    }
  });

  it('S40 grace labels: 2 days (dual), 1 day, last grace day; and plural for 3..10 / 11+', () => {
    const g = (n: number) => accessStatus({ state: 'active', startsOn: '2026-01-01', endsOn: '2026-06-01', graceEndsOn: plus('2026-06-01', n) }, '2026-06-02');
    expect(g(3).label).toEqual({ ar: 'فترة سماح: باقي يومين', en: 'Grace period: 2 days left' });
    expect(g(2).label).toEqual({ ar: 'فترة سماح: باقي يوم', en: 'Grace period: 1 day left' });
    expect(g(4).label).toEqual({ ar: 'فترة سماح: باقي 3 أيام', en: 'Grace period: 3 days left' });
    expect(g(12).label).toEqual({ ar: 'فترة سماح: باقي 11 يوم', en: 'Grace period: 11 days left' });
    expect(g(1).graceDaysLeft).toBe(0);
    expect(g(1).hasAccess).toBe(true);
  });

  it('S41 the other fixed labels are present and distinct per state (Arabic and English)', () => {
    const labels = (['paused', 'cancelled', 'suspended', 'pending'] as const).map(state => accessStatus({ state, ...sub }, '2026-11-15').label);
    expect(new Set(labels.map(l => l.ar)).size).toBe(4);
    expect(new Set(labels.map(l => l.en)).size).toBe(4);
    expect(accessStatus({ state: 'active', ...sub }, '2026-12-10').label).toEqual({ ar: 'الاشتراك خلص', en: 'Subscription ended' });
    expect(accessStatus({ state: 'expired', ...sub }, '2026-11-15').label).toEqual({ ar: 'الاشتراك خلص', en: 'Subscription ended' });
  });

  it('S42 a missing grace end (undefined or null) means expired the day after endsOn; grace end equal to endsOn grants no grace day', () => {
    for (const graceEndsOn of [undefined, null, '2026-11-29']) expect(accessStatus({ state: 'active', startsOn: sub.startsOn, endsOn: sub.endsOn, graceEndsOn }, '2026-11-30')).toMatchObject({ access: 'expired', hasAccess: false, graceDaysLeft: null });
  });

  it('S43 day counts across a leap day and DST-free UTC arithmetic', () => {
    const s = { state: 'active' as const, startsOn: '2028-02-20', endsOn: '2028-03-19' };
    expect(accessStatus(s, '2028-03-01')).toMatchObject({ daysElapsed: 10, daysLeft: 18, totalDays: 28 });
    expect(accessStatus({ ...s, startsOn: '2026-03-20', endsOn: '2026-04-17' }, '2026-04-17')).toMatchObject({ daysLeft: 0, totalDays: 28 });
  });

  it('S44 accessStatus does not mutate its input and its numbers are always finite integers', () => {
    const frozenSub = deepFreeze({ state: 'active' as SubscriptionState, ...sub });
    for (const today of days) {
      const r = accessStatus(frozenSub, today);
      for (const n of [r.daysElapsed, r.daysLeft, r.totalDays]) expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('S45 a malformed today throws SubscriptionError instead of returning NaN counters and a "باقي NaN" label', () => {
    const r = thrown(() => accessStatus({ state: 'active', ...sub }, 'garbage'));
    expect(r).toBeInstanceOf(SubscriptionError);
  });
});

// ---------------------------------------------------------------- G. dueTransition
describe('G. dueTransition', () => {
  const sub = { endsOn: '2026-11-29', graceEndsOn: '2026-12-02' };
  it('S46 exact boundary table for stored active and stored grace', () => {
    const table: Array<[string, 'enter_grace' | 'expire' | null, 'enter_grace' | 'expire' | null]> = [
      ['2026-11-28', null, null],
      ['2026-11-29', null, null],
      ['2026-11-30', 'enter_grace', null],
      ['2026-12-02', 'enter_grace', null],
      ['2026-12-03', 'expire', 'expire'],
      ['2027-03-01', 'expire', 'expire'],
    ];
    for (const [today, active, grace] of table) {
      expect(dueTransition({ state: 'active', ...sub }, today), `active ${today}`).toBe(active);
      expect(dueTransition({ state: 'grace', ...sub }, today), `grace ${today}`).toBe(grace);
    }
  });

  it('S47 no grace configured: expire on the day after endsOn for undefined, null and equal grace end', () => {
    for (const graceEndsOn of [undefined, null, '2026-11-29']) {
      expect(dueTransition({ state: 'active', endsOn: sub.endsOn, graceEndsOn }, '2026-11-29')).toBeNull();
      expect(dueTransition({ state: 'active', endsOn: sub.endsOn, graceEndsOn }, '2026-11-30')).toBe('expire');
      expect(dueTransition({ state: 'grace', endsOn: sub.endsOn, graceEndsOn }, '2026-11-30')).toBe('expire');
    }
  });

  it('S48 no transition applies for pending, paused, cancelled, suspended, expired on any date', () => {
    for (const state of ['pending', 'paused', 'cancelled', 'suspended', 'expired'] as const) for (const today of days) expect(dueTransition({ state, ...sub }, today), `${state} ${today}`).toBeNull();
  });

  it('S49 dueTransition and accessStatus never disagree, and each transition is a legal state-machine event', () => {
    for (const state of ['active', 'grace'] as const) for (const today of days) {
      const t = dueTransition({ state, ...sub }, today);
      const a = accessStatus({ state, startsOn: '2026-11-01', ...sub }, today).access;
      if (t === 'enter_grace') { expect(state).toBe('active'); expect(a, today).toBe('grace'); }
      else if (t === 'expire') expect(a, today).toBe('expired');
      else if (state === 'active') expect(['not_started', 'active'], today).toContain(a);
      else expect(['not_started', 'active', 'grace'], today).toContain(a);
    }
  });

  it('S50 does not mutate its input', () => {
    const s = deepFreeze({ state: 'active' as const, ...sub });
    expect(() => dueTransition(s, '2026-12-01')).not.toThrow();
  });
});

// ---------------------------------------------------------------- H. invalid input
describe('H. invalid input', () => {
  const rulesOk = rules;
  it('S51 invalid timeline numbers throw invalid_timeline from every entry point', () => {
    const bad: Array<Partial<SubscriptionTimeline>> = [
      { durationDays: 0 }, { durationDays: -5 }, { durationDays: NaN }, { durationDays: Infinity }, { durationDays: 1.5 }, { durationDays: '28' as unknown as number },
      { extensionDays: -1 }, { extensionDays: NaN }, { extensionDays: 0.5 }, { extensionDays: null as unknown as number },
      { graceDays: -1 }, { graceDays: NaN }, { graceDays: 1.2 }, { graceDays: undefined as unknown as number },
      { durationDays: Number.MAX_SAFE_INTEGER, extensionDays: 1 }, { durationDays: 1e9 },
    ];
    for (const p of bad) for (const fn of [() => endsOnFor(T(p)), () => graceEndsOnFor(T(p)), () => buildSubscriptionSchedule(T(p), rulesOk)]) expectCode(fn, 'invalid_timeline');
  });

  it('S52 invalid start dates throw invalid_timeline', () => {
    for (const startsOn of ['', 'x', '2026-13-01', '2026-02-29', '2026-00-10', '2026-11-31', '2026-1-1', '20261101', '2026-11-01T00:00:00Z', ' 2026-11-01', null, undefined, 20261101, new Date(0)]) {
      expectCode(() => endsOnFor(T({ startsOn: startsOn as unknown as string })), 'invalid_timeline');
    }
  });

  it('S53 invalid timezones throw invalid_timeline from build, endsOnFor and graceEndsOnFor', () => {
    for (const timezone of ['', 'Mars/Phobos', 'Africa/Cairo/', ' Africa/Cairo', null, undefined, 3, {}]) {
      for (const fn of [() => endsOnFor(T({ timezone: timezone as unknown as string })), () => graceEndsOnFor(T({ timezone: timezone as unknown as string })), () => buildSubscriptionSchedule(T({ timezone: timezone as unknown as string }), rulesOk)]) expectCode(fn, 'invalid_timeline');
    }
  });

  it('S54 invalid freezes throw invalid_freeze: zero, negative, fractional, NaN, Infinity, string, bad dates', () => {
    const bad = [
      { fromDate: '2026-11-10', days: 0 }, { fromDate: '2026-11-10', days: -3 }, { fromDate: '2026-11-10', days: 0.5 }, { fromDate: '2026-11-10', days: NaN },
      { fromDate: '2026-11-10', days: Infinity }, { fromDate: '2026-11-10', days: '3' }, { fromDate: '2026-11-10', days: null }, { fromDate: '2026-11-10' },
      { fromDate: '2026-02-30', days: 2 }, { fromDate: '', days: 2 }, { fromDate: null, days: 2 }, { days: 2 }, { fromDate: '2026-11-10T00:00:00Z', days: 2 },
    ];
    for (const f of bad) for (const fn of [() => endsOnFor(T({ freezes: [f as never] })), () => buildSubscriptionSchedule(T({ freezes: [f as never] }), rulesOk)]) expectCode(fn, 'invalid_freeze');
  });

  it('S55 freeze outside the subscription (before startsOn, after endsOn, after the cumulative end) throws invalid_freeze', () => {
    expectCode(() => endsOnFor(T({ freezes: [{ fromDate: '2026-10-31', days: 2 }] })), 'invalid_freeze');
    expectCode(() => endsOnFor(T({ freezes: [{ fromDate: '2026-11-30', days: 2 }] })), 'invalid_freeze');
    expectCode(() => endsOnFor(T({ freezes: [{ fromDate: '2026-11-10', days: 2 }, { fromDate: '2026-12-02', days: 1 }] })), 'invalid_freeze'); // cumulative end is 2026-12-01
    expect(endsOnFor(T({ freezes: [{ fromDate: '2026-11-10', days: 2 }, { fromDate: '2026-12-01', days: 1 }] }))).toBe('2026-12-02');
  });

  it('S55b a freeze may start in the extension range but not after the extended end', () => {
    expect(endsOnFor(T({ extensionDays: 7, freezes: [{ fromDate: '2026-12-06', days: 1 }] }))).toBe('2026-12-07');
    expectCode(() => endsOnFor(T({ extensionDays: 7, freezes: [{ fromDate: '2026-12-07', days: 1 }] })), 'invalid_freeze');
  });

  it('S56 overlapping freezes throw invalid_freeze: partial overlap, nested, identical start, 1-day overlap', () => {
    const pairs = [
      [{ fromDate: '2026-11-10', days: 5 }, { fromDate: '2026-11-12', days: 5 }],
      [{ fromDate: '2026-11-10', days: 10 }, { fromDate: '2026-11-12', days: 2 }],
      [{ fromDate: '2026-11-10', days: 3 }, { fromDate: '2026-11-10', days: 3 }],
      [{ fromDate: '2026-11-10', days: 3 }, { fromDate: '2026-11-12', days: 1 }],
    ];
    for (const fz of pairs) for (const order of [fz, [...fz].reverse()]) expectCode(() => endsOnFor(T({ freezes: order })), 'invalid_freeze');
    expect(endsOnFor(T({ freezes: [{ fromDate: '2026-11-10', days: 3 }, { fromDate: '2026-11-13', days: 1 }] }))).toBe('2026-12-03');
  });

  it('S57 a malformed freeze list or malformed freeze entry throws SubscriptionError (invalid_freeze), not a TypeError', () => {
    for (const freezes of [undefined, null, 'x', 5, {}, [null], [undefined], [5], ['2026-11-10']]) {
      const e = thrown(() => endsOnFor(T({ freezes: freezes as never })));
      expect(e, JSON.stringify(freezes)).toBeInstanceOf(SubscriptionError);
      expect((e as SubscriptionError).code).toBe('invalid_freeze');
    }
  });

  it('S58 a missing or non-object timeline throws SubscriptionError (invalid_timeline), not a TypeError', () => {
    for (const bad of [null, undefined, 5, 'x']) {
      for (const fn of [() => endsOnFor(bad as never), () => graceEndsOnFor(bad as never), () => buildSubscriptionSchedule(bad as never, rulesOk)]) {
        const e = thrown(fn);
        expect(e, String(bad)).toBeInstanceOf(SubscriptionError);
        expect((e as SubscriptionError).code).toBe('invalid_timeline');
      }
    }
  });

  it('S59 invalid schedule rules throw SubscriptionError, never ScheduleError / ZodError / TypeError', () => {
    const badRules: unknown[] = [null, undefined, 5, { weeklyCheckin: { timeOfDay: '99:99' } }, { weeklyCheckin: { timeOfDay: '9:00' } }, { weeklyCheckin: { everyDays: 0 } }, { renewalReminderDaysBefore: [-1] }, { weighIn: { kind: 'bogus' } }, { measurements: { everyDays: 0 } }, { dailyCheckin: { enabled: true, timeOfDay: '24:00' } }];
    for (const r of badRules) {
      const e = thrown(() => buildSubscriptionSchedule(T(), r as never));
      expect(e, JSON.stringify(r)).toBeInstanceOf(SubscriptionError);
    }
  });

  it('S60 a freeze whose day count overflows the calendar reports invalid_freeze (decided 2026-11-07: the freeze is what pushed the date out of range)', () => {
    expectCode(() => endsOnFor(T({ freezes: [{ fromDate: '2026-11-10', days: 1e12 }] })), 'invalid_freeze');
    expectCode(() => endsOnFor(T({ freezes: [{ fromDate: '2026-11-10', days: 3e6 }] })), 'invalid_freeze');
  });

  it('S61 validation never partially evaluates: a bad timeline plus a bad freeze reports the timeline error first', () => {
    expectCode(() => endsOnFor(T({ durationDays: 0, freezes: [{ fromDate: 'bad', days: 0 }] })), 'invalid_timeline');
  });

  it('S62 an unsorted freeze list is not reordered in place', () => {
    const fz = deepFreeze([{ fromDate: '2026-11-20', days: 2 }, { fromDate: '2026-11-10', days: 2 }]);
    expect(endsOnFor(T({ freezes: fz as never }))).toBe('2026-12-03');
    expect(fz[0]!.fromDate).toBe('2026-11-20');
  });

  it('S63 endsOnFor, graceEndsOnFor and buildSubscriptionSchedule agree for random valid timelines', () => {
    const rnd = mulberry32(2026);
    for (let i = 0; i < 40; i++) {
      const durationDays = 1 + Math.floor(rnd() * 90);
      const t = T({ startsOn: plus('2026-01-01', Math.floor(rnd() * 300)), durationDays, extensionDays: Math.floor(rnd() * 15), graceDays: Math.floor(rnd() * 6) });
      const fromDate = plus(t.startsOn, Math.floor(rnd() * (durationDays + t.extensionDays + 1)));
      const withFreeze = { ...t, freezes: [{ fromDate, days: 1 + Math.floor(rnd() * 12) }] };
      const b = buildSubscriptionSchedule(withFreeze, rules);
      expect(b.endsOn).toBe(endsOnFor(withFreeze));
      expect(b.graceEndsOn).toBe(graceEndsOnFor(withFreeze));
      expect(diff(t.startsOn, b.endsOn)).toBe(durationDays + t.extensionDays + withFreeze.freezes[0]!.days);
    }
  });
});
