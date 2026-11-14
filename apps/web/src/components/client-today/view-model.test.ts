import { describe, expect, it } from 'vitest';
import { CLIENT_MODULES, DEFAULT_CLIENT_MODULES, type ClientModules } from '@dawlyy/core/types';
import type { ClientNutrition } from '@/components/nutrition/types';
import type { PortalToday } from '@/src/server/workout/contracts';
import type { ThreadData } from '@/components/messaging/types';
import { buildClientTodayModel, pickCoachIdentity, toTodayLog } from '@/components/client-today/view-model';
import type { TodayLog } from '@/components/client-today/types';

const base = { locale: 'en', numerals: 'latn' } as const;
const planned: PortalToday = {
  date: '2026-11-14',
  workout: { state: 'planned', name: { en: 'Push day', ar: 'يوم الدفع' }, dayLabel: { en: 'Day 1' }, exerciseCount: 6 },
  meals: { planName: { en: 'Cut' }, kcalTarget: 2000, link: true },
  checkins: [{ eventId: 'e1', title: { en: 'Weekly' }, dueAt: '2026-11-14T08:00:00.000Z', state: 'due' }],
  intakePending: true, unreadMessages: 2, subscription: { state: 'active', daysLeft: 3 },
};
const nutrition = {
  head: { id: 'h', name: { en: 'Cut' } },
  version: { id: 'v', versionNo: 1, document: { meals: [
    { id: 'm1', name: { en: 'Breakfast' }, options: [{ id: 'o1', items: [] }, { id: 'o2', items: [] }] },
    { id: 'm2', name: { en: 'Lunch' }, options: [{ id: 'p1', items: [] }] },
  ] } },
  foods: [], localDate: '2026-11-14', timezone: 'Africa/Cairo', dayType: 'training', targets: null,
} as unknown as ClientNutrition;
const log = (patch: Partial<TodayLog>): TodayLog => ({ mealId: 'm1', optionId: 'o1', status: 'eaten', voidedAt: null, ...patch });
const build = (patch: Partial<Parameters<typeof buildClientTodayModel>[0]> = {}) =>
  buildClientTodayModel({ today: planned, nutrition, logs: [], modules: DEFAULT_CLIENT_MODULES, ...base, ...patch });
const off = (...keys: Array<keyof ClientModules>): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(keys.map(key => [key, false])) });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}

describe('buildClientTodayModel modules', () => {
  it('shows everything when every module is on', () => {
    const model = build();
    expect(model.workout?.state).toBe('planned');
    expect(model.meals.map(meal => meal.id)).toEqual(['m1', 'm2']);
    expect(model.checkins).toHaveLength(1);
    expect(model.intakePending).toBe(true);
    expect(model.subscription).toEqual({ state: 'active', daysLeft: 3 });
    expect(model.modules).toEqual(DEFAULT_CLIENT_MODULES);
  });

  it.each(CLIENT_MODULES)('module %s off is carried into the model and only removes its own content', (key) => {
    const model = build({ modules: off(key) });
    expect(model.modules[key]).toBe(false);
    expect(model.workout === null).toBe(key === 'workouts');
    expect(model.meals.length === 0).toBe(key === 'nutrition');
    expect(model.checkins.length === 0).toBe(key === 'checkins');
    expect(model.intakePending).toBe(key !== 'checkins');
    expect((model.subscription ?? null) === null).toBe(key === 'payments');
  });

  it('removes all module content when every module is off', () => {
    const model = build({ modules: off(...CLIENT_MODULES) });
    expect(model).toMatchObject({ workout: null, meals: [], checkins: [], intakePending: false, subscription: null });
  });

  it('leaves a subscription with plenty of time unflagged', () => {
    expect(build({ today: { ...planned, subscription: { state: 'active', daysLeft: 40 } } }).subscription).toBeNull();
    expect(build({ today: { ...planned, subscription: { state: 'expired' } } }).subscription).toEqual({ state: 'expired' });
  });
});

describe('buildClientTodayModel meals', () => {
  it('does not count voided logs as eaten', () => {
    expect(build({ logs: [log({ voidedAt: '2026-11-14T09:00:00.000Z' })] }).meals[0]).toMatchObject({ status: null, optionId: 'o1' });
  });

  it('uses the active row when a voided one sits beside it', () => {
    const model = build({ logs: [log({ voidedAt: '2026-11-14T09:00:00.000Z' }), log({ status: 'skipped', optionId: 'o2' })] });
    expect(model.meals[0]).toMatchObject({ status: 'skipped', optionId: 'o2' });
  });

  it('chooses the same active log whatever the input order', () => {
    const rows = [log({ status: 'skipped', optionId: 'o2' }), log({ status: 'eaten', optionId: 'o1' }), log({ status: 'partial', optionId: 'o2' })];
    const forward = build({ logs: rows }).meals[0];
    const backward = build({ logs: [...rows].reverse() }).meals[0];
    expect(forward).toEqual(backward);
    expect(forward).toMatchObject({ status: 'eaten', optionId: 'o1' });
  });

  it('falls back to the first option when the logged option is not on the plan', () => {
    expect(build({ logs: [log({ optionId: 'gone' })] }).meals[0]?.optionId).toBe('o1');
  });

  it('ignores logs of free entries and of statuses it does not know', () => {
    const model = build({ logs: [log({ mealId: null }), log({ status: 'mystery' })] });
    expect(model.meals[0]?.status).toBeNull();
  });

  it('has no meal rows without a published plan', () => {
    expect(build({ nutrition: null }).meals).toEqual([]);
    expect(build({ nutrition: { ...nutrition, head: null, version: null } }).meals).toEqual([]);
  });
});

describe('buildClientTodayModel workout and purity', () => {
  it.each(['rest', 'done', 'active', 'none'] as const)('passes the %s workout state through unchanged', (state) => {
    const workout = { state, ...(state === 'done' || state === 'active' ? { sessionId: 's1' } : {}) };
    expect(build({ today: { ...planned, workout } }).workout).toEqual(workout);
  });

  it('does not change its input and returns detached copies', () => {
    const today = deepFreeze(structuredClone(planned));
    const plan = deepFreeze(structuredClone(nutrition));
    const logs = deepFreeze([log({})]);
    const modules = deepFreeze({ ...DEFAULT_CLIENT_MODULES });
    const model = buildClientTodayModel({ today, nutrition: plan, logs, modules, ...base });
    expect(model.workout).not.toBe(today.workout);
    expect(model.modules).not.toBe(modules);
    expect(today).toEqual(planned);
  });
});

describe('toTodayLog', () => {
  it('normalizes dates and missing nullable fields', () => {
    expect(toTodayLog({ status: 'eaten', mealId: 'm1', voidedAt: new Date('2026-11-14T10:00:00Z') })).toEqual({ mealId: 'm1', optionId: null, status: 'eaten', voidedAt: '2026-11-14T10:00:00.000Z' });
    expect(toTodayLog({ status: 'skipped', voidedAt: undefined })).toEqual({ mealId: null, optionId: null, status: 'skipped', voidedAt: null });
    expect(toTodayLog({ status: 'eaten', voidedAt: '' })?.voidedAt).toBeNull();
    expect(toTodayLog({ status: 'eaten', voidedAt: new Date('nope') })?.voidedAt).toBeNull();
  });

  it('rejects rows that are not logs', () => {
    expect(toTodayLog(null)).toBeNull();
    expect(toTodayLog('x')).toBeNull();
    expect(toTodayLog({ mealId: 'm1' })).toBeNull();
  });
});

describe('pickCoachIdentity', () => {
  const thread = (senderUserId: string | null): ThreadData => ({
    conversation: { id: 'c', clientId: 'cl', clientName: null },
    messages: { nextCursor: null, items: senderUserId ? [{
      id: 'x', conversationId: 'c', senderUserId, senderRole: 'staff', body: 'hi', attachments: [], clientUuid: 'u',
      editedAt: null, deletedAt: null, readByClientAt: null, readByCoachAt: null, createdAt: '2026-11-14T00:00:00Z', mine: false,
    }] : [] },
  });
  const directory = [{ user_id: 'u1', display_name: 'Sara Ali' }, { user_id: 'u2', display_name: 'Omar' }, { user_id: 'u3', display_name: null }];

  it('matches the latest staff sender against the directory', () => {
    expect(pickCoachIdentity(directory, thread('u2'))).toEqual({ kind: 'coach', members: [{ userId: 'u2', displayName: 'Omar' }] });
  });

  it('knows the coach when the directory has one person', () => {
    expect(pickCoachIdentity([directory[0]!], thread(null))).toEqual({ kind: 'coach', members: [{ userId: 'u1', displayName: 'Sara Ali' }] });
  });

  it('shows only real public names as a team when several coaches are possible', () => {
    expect(pickCoachIdentity(directory, thread(null))).toEqual({ kind: 'team', members: [{ userId: 'u1', displayName: 'Sara Ali' }, { userId: 'u2', displayName: 'Omar' }] });
  });

  it('shows nothing invented when no name is public', () => {
    expect(pickCoachIdentity([{ user_id: 'u3', display_name: null }, { user_id: 'u4', display_name: '  ' }], null)).toEqual({ kind: 'unknown', members: [] });
    expect(pickCoachIdentity([], null)).toEqual({ kind: 'unknown', members: [] });
  });
});