import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_MODULES, DEFAULT_CLIENT_MODULES, type ClientModules } from '@dawlyy/core/types';
import ar from '../../../messages/ar/clientToday.json';
import en from '../../../messages/en/clientToday.json';
import { ClientTodayView } from '@/components/client-today/today-view';
import { CoachAvatar, CoachHub, HubError, HubUnavailable, MeHub, PlanHub } from '@/components/client-today/client-hubs';
import type { ClientTodayModel } from '@/components/client-today/types';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: unknown; [key: string]: unknown }) => createElement('a', { href, ...rest }, children as never),
  usePathname: () => '/app/today',
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));
vi.mock('@/components/messaging/thread', () => ({ Thread: ({ title }: { title: string }) => createElement('section', { 'data-testid': 'thread-stub' }, title) }));

const off = (...keys: Array<keyof ClientModules>): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(keys.map(key => [key, false])) });
const LONG_AR = 'وجبة الإفطار الغنية بالبروتين والألياف مع الخضروات الطازجة والمكسرات المحمصة والزبادي اليوناني قليل الدسم';

const model = (patch: Partial<ClientTodayModel> = {}): ClientTodayModel => ({
  date: '2026-11-14', locale: 'en', numerals: 'latn', modules: DEFAULT_CLIENT_MODULES,
  workout: { state: 'planned', name: { en: 'Push day', ar: 'يوم الدفع' }, dayLabel: { en: 'Day 1', ar: 'اليوم الأول' }, exerciseCount: 6 },
  meals: [
    { id: 'm1', name: { en: 'Breakfast', ar: LONG_AR }, optionId: 'o1', status: null },
    { id: 'm2', name: { en: 'Lunch', ar: 'الغداء' }, optionId: 'p1', status: 'eaten' },
  ],
  checkins: [{ eventId: 'e1', title: { en: 'Weekly check-in', ar: 'متابعة أسبوعية' }, dueAt: '2026-11-14T08:00:00.000Z', state: 'due' }],
  intakePending: false, subscription: null, ...patch,
});

function render(node: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  const messages = { clientToday: locale === 'ar' ? ar : en };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages, children: node }));
}
const view = (patch: Partial<ClientTodayModel> = {}, props: Partial<Parameters<typeof ClientTodayView>[0]> = {}, locale: 'en' | 'ar' = 'en') =>
  render(createElement(ClientTodayView, { model: model({ locale, ...patch }), ...props }), locale);

describe('ClientTodayView order and content', () => {
  it('puts the workout lead card before the meal rows before the check-in', () => {
    const html = view();
    const workout = html.indexOf('data-testid="today-workout"');
    const meals = html.indexOf('data-testid="meal-m1"');
    const checkin = html.indexOf('Weekly check-in');
    expect(workout).toBeGreaterThan(-1);
    expect(workout).toBeLessThan(meals);
    expect(meals).toBeLessThan(checkin);
  });

  it('starts the workout with one link to the existing start route and shows no confirmation step', () => {
    const html = view();
    expect(html.match(/data-testid="start-workout"/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/app\/workout\/start"/);
    expect(html).toContain('Start');
    expect(html).not.toMatch(/confirm/i);
  });

  it('continues the same active session from Today', () => {
    const html = view({ workout: { state: 'active', sessionId: 's-42', name: { en: 'Push day' } } });
    expect(html).toContain('href="/app/workout/s-42"');
    expect(html).toContain('Continue');
    expect(html).not.toContain('href="/app/workout/start"');
  });

  it('offers the summary, not a start button, once the session is done', () => {
    const html = view({ workout: { state: 'done', sessionId: 's-9', name: { en: 'Push day' } } });
    expect(html).toContain('href="/app/history/s-9"');
    expect(html).not.toContain('start-workout');
  });

  it('shows useful copy on a rest day and with no plan, without inventing a session', () => {
    const rest = view({ workout: { state: 'rest' } });
    expect(rest).toContain('Rest day');
    expect(rest).not.toContain('start-workout');
    const none = view({ workout: { state: 'none' } });
    expect(none).toContain('No session planned');
    expect(none).not.toContain('start-workout');
  });

  it('shows a logged meal with its status and a link to change it, and an unlogged one with Ate it', () => {
    const html = view();
    expect(html).toContain('Ate it');
    expect(html).toContain('Eaten');
    expect(html).toContain('href="/app/nutrition/history"');
  });

  it('shows the intake row and the check-in link when the checkins module is on', () => {
    const html = view({ intakePending: true });
    expect(html).toContain('href="/app/checkins/e1"');
    expect(html).toContain('href="/app/intake"');
  });

  it('warns about the subscription only with payments on', () => {
    const subscription = { state: 'expired' };
    expect(view({ subscription })).toContain('Your subscription has expired.');
    expect(view({ subscription, modules: off('payments') })).not.toContain('subscription');
  });
});

describe('ClientTodayView hidden modules, empty and error states', () => {
  it('leaves no trace of a hidden module in the markup', () => {
    const noMeals = view({ modules: off('nutrition'), meals: model().meals });
    expect(noMeals).not.toContain('Breakfast');
    expect(noMeals).not.toContain('Ate it');
    expect(noMeals).not.toContain('>Meals<');
    const noWorkout = view({ modules: off('workouts') });
    expect(noWorkout).not.toContain('today-workout');
    expect(noWorkout).not.toContain('Push day');
    const noCheckins = view({ modules: off('checkins'), intakePending: true });
    expect(noCheckins).not.toContain('Weekly check-in');
    expect(noCheckins).not.toContain('/app/intake');
  });

  it('shows an explicit empty state when nothing is left to show', () => {
    const html = view({ modules: off('workouts', 'nutrition', 'checkins', 'payments'), workout: null, meals: [], checkins: [] });
    expect(html).toContain('Nothing planned today');
  });

  it('explains an empty meal plan instead of leaving the section blank', () => {
    expect(view({ meals: [] })).toContain('No meal plan has been published for you yet.');
  });

  it('shows the error and a Retry label on the meal whose write failed, leaving its state unchanged', () => {
    const html = view({}, { errorMealId: 'm1' });
    expect(html).toContain('Could not save. Nothing changed.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Ate it');
    expect(html).toContain('Eaten');
  });

  it('marks the busy meal button as loading and disables it', () => {
    const html = view({}, { busyMealId: 'm1' });
    expect(html).toMatch(/<button[^>]*disabled/);
  });

  it('renders the hub error with Retry and the unavailable state with a way back', () => {
    const error = render(createElement(HubError));
    expect(error).toContain('role="alert"');
    expect(error).toContain('Could not load this page');
    expect(error).toContain('Retry');
    const gone = render(createElement(HubUnavailable));
    expect(gone).toContain('Not available');
    expect(gone).toContain('href="/app/today"');
  });
});

describe('ClientTodayView accessibility, locales and numbers', () => {
  it('keeps 44 px touch targets and wraps long Arabic labels in RTL copy', () => {
    const html = view({}, {}, 'ar');
    expect(html).toContain(LONG_AR);
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-h-12');
    expect(html).toContain('break-words');
    expect(html).toContain(ar.workout.start);
    expect(html).toContain(ar.meals.ate);
    expect(html).not.toContain('Start');
  });

  it('gives each section a heading and labelled landmark', () => {
    const html = view();
    expect(html).toContain('aria-labelledby="today-meals"');
    expect(html).toContain('id="today-checkins"');
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('formats counts and dates with the chosen numerals', () => {
    expect(view({ numerals: 'latn' }, {}, 'ar')).toContain('6 تمارين');
    const arab = view({ numerals: 'arab' }, {}, 'ar');
    expect(arab).toContain('٦ تمارين');
    expect(arab).toContain('٢٠٢٦');
    expect(view({ numerals: 'arab' }, {}, 'en')).toContain('٦ exercises');
  });
});

describe('ClientTodayView preview', () => {
  it('is labelled, keeps the arrangement and makes every control inert', () => {
    const live = view();
    const html = view({ intakePending: true }, { preview: true });
    expect(html).toContain('This is a preview');
    expect(html).toContain('Start');
    expect(html).toContain('Weekly check-in');
    expect(html).not.toContain('href="/app/workout/start"');
    expect(html).not.toContain('href="/app/checkins/e1"');
    expect(html).not.toContain('href="/app/intake"');
    expect(html).not.toContain('href="/app/nutrition/history"');
    expect(html).toMatch(/disabled|aria-disabled="true"/);
    expect(live).not.toContain('This is a preview');
    expect(live).toContain('href="/app/workout/start"');
  });
});

describe('hubs', () => {
  const bootstrap = (modules: ClientModules) => ({ userId: 'u1', bootstrap: { modules, numerals: 'latn' as const } });

  it('Plan hides disabled sections independently and shows the unavailable state with both off', () => {
    const both = render(createElement(PlanHub, bootstrap(DEFAULT_CLIENT_MODULES)));
    expect(both).toContain('href="/app/program"');
    expect(both).toContain('href="/app/nutrition"');
    const noWorkouts = render(createElement(PlanHub, bootstrap(off('workouts'))));
    expect(noWorkouts).not.toContain('/app/program');
    expect(noWorkouts).toContain('/app/nutrition');
    const none = render(createElement(PlanHub, bootstrap(off('workouts', 'nutrition'))));
    expect(none).toContain('Not available');
  });

  it('Me uses rows and hides the entry points of disabled modules', () => {
    const all = render(createElement(MeHub, bootstrap(DEFAULT_CLIENT_MODULES)));
    for (const href of ['/app/progress', '/app/history', '/app/checkins', '/app/subscription', '/app/notifications']) expect(all).toContain(`href="${href}"`);
    const reduced = render(createElement(MeHub, bootstrap(off('checkins', 'payments', 'measurements'))));
    for (const href of ['/app/progress', '/app/checkins', '/app/subscription', '/app/assessment']) expect(reduced).not.toContain(`href="${href}"`);
    expect(reduced).toContain('href="/app/notifications"');
    expect(CLIENT_MODULES).toHaveLength(7);
  });

  const coach = (patch: Partial<Parameters<typeof CoachHub>[0]> = {}) => render(createElement(CoachHub, {
    ...bootstrap(DEFAULT_CLIENT_MODULES), businessName: 'Peak Gym', canSend: true, canView: true, thread: null,
    identity: { kind: 'coach', members: [{ userId: 'c1', displayName: 'Sara Ali' }] },
    promise: { chatHours: 24, checkinReviewHours: 48 }, ...patch,
  }));

  it('Coach shows the named initials avatar, the chat promise and the conversation', () => {
    const html = coach();
    expect(html).toContain('Sara Ali');
    expect(html).toContain('SA');
    expect(html).toContain('aria-label="Coach Sara Ali"');
    expect(html).toContain('Within 24 hours');
    expect(html).toContain('Reviewed within 48 hours');
    expect(html).toContain('data-testid="thread-stub"');
    expect(html).not.toContain('/coach');
  });

  it('Coach says the reply time is not set rather than inventing one, and keeps the review promise separate', () => {
    const html = coach({ promise: { chatHours: null, checkinReviewHours: 48 } });
    expect(html).toContain('Reply time not set');
    expect(html).not.toContain('Within 48');
    expect(html).toContain('Reviewed within 48 hours');
  });

  it('Coach with no known name shows a generic avatar and no initials', () => {
    const html = coach({ identity: { kind: 'unknown', members: [] } });
    expect(html).toContain('aria-label="Coach"');
    expect(html).toContain('Your coach');
    expect(render(createElement(CoachAvatar, { name: null }))).not.toContain('astryx-avatar-fallback"');
  });

  it('Coach lists a team by its public names when several are possible', () => {
    const html = coach({ identity: { kind: 'team', members: [{ userId: 'a', displayName: 'Sara' }, { userId: 'b', displayName: 'Omar' }] } });
    expect(html).toContain('Sara and Omar');
    expect(html).toContain('The Peak Gym team');
  });

  it('Coach is unavailable with messages off, even for a caller who may view messages', () => {
    const html = coach({ bootstrap: { modules: off('messages'), numerals: 'latn' } });
    expect(html).toContain('Not available');
    expect(html).not.toContain('thread-stub');
    expect(coach({ canView: false })).toContain('Not available');
  });
});