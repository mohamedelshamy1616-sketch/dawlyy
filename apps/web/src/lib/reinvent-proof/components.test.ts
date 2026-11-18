import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLIENT_MODULES, type ClientModules } from '@dawlyy/core/types';
import clientTodayAr from '../../../messages/ar/clientToday.json';
import clientTodayEn from '../../../messages/en/clientToday.json';
import quickLogAr from '../../../messages/ar/quickLog.json';
import quickLogEn from '../../../messages/en/quickLog.json';
import activityAr from '../../../messages/ar/activity.json';
import activityEn from '../../../messages/en/activity.json';
import archiveAr from '../../../messages/ar/archiveControls.json';
import archiveEn from '../../../messages/en/archiveControls.json';
import { ClientTodayView } from '@/components/client-today/today-view';
import { ActivityLogView } from '@/components/activity/activity-log';
import { ArchivedEmpty } from '@/components/control/archive-controls';
import type { ClientTodayModel } from '@/components/client-today/types';
import type { ActivityState } from '@/src/server/activity/presentation';

// children go in as createElement's third argument (react/no-children-prop).
const IntlProvider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode; [key: string]: unknown }) => createElement('a', { href, ...rest }, children),
  usePathname: () => '/app/today',
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));

// Server markup proves text, labels and branches only. It is not touch-target, overflow or interaction evidence:
// those belong to the P9 browser spec (e2e/beta/r5-polish-proof.spec.ts).
type Locale = 'ar' | 'en';
const catalogs = {
  ar: { clientToday: clientTodayAr, quickLog: quickLogAr, activity: activityAr, archiveControls: archiveAr },
  en: { clientToday: clientTodayEn, quickLog: quickLogEn, activity: activityEn, archiveControls: archiveEn },
};
const render = (locale: Locale, node: ReactNode) => renderToStaticMarkup(createElement(IntlProvider, { locale, messages: catalogs[locale] }, node));
const off = (...keys: Array<keyof ClientModules>): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(keys.map(key => [key, false])) });
const model = (locale: Locale, patch: Partial<ClientTodayModel> = {}): ClientTodayModel => ({
  date: '2026-11-14', locale, numerals: 'latn', modules: DEFAULT_CLIENT_MODULES,
  workout: { state: 'planned', name: { en: 'Push day', ar: 'يوم الدفع' }, exerciseCount: 6 },
  meals: [{ id: 'm1', name: { en: 'Breakfast', ar: 'الفطار' }, optionId: 'o1', status: null }],
  checkins: [], intakePending: false, subscription: null, ...patch,
});
const today = (locale: Locale, patch: Partial<ClientTodayModel> = {}, props: Partial<ComponentProps<typeof ClientTodayView>> = {}) =>
  render(locale, createElement(ClientTodayView, { model: model(locale, patch), ...props }));

describe.each(['en', 'ar'] as const)('R5 ClientTodayView states (%s)', locale => {
  const t = catalogs[locale].clientToday;
  it('shows the translated empty state when every module is off, and none of the hidden content', () => {
    const html = today(locale, { modules: off('workouts', 'nutrition', 'checkins', 'payments'), workout: null, meals: [] });
    expect(html).toContain(t.today.emptyTitle);
    expect(html).toContain(t.today.emptyBody);
    for (const hidden of ['today-workout', 'Push day', 'يوم الدفع', 'Breakfast', 'الفطار', 'today-quick-log', t.meals.title]) expect(html, hidden).not.toContain(hidden);
    expect(html).not.toContain('aria-busy="true"');
  });

  it('explains an empty meal plan instead of leaving the section blank', () => {
    const html = today(locale, { meals: [] });
    expect(html).toContain(t.meals.empty);
    expect(html).not.toContain('aria-busy="true"');
  });

  it('shows the rest-day card with its translated copy and no start action', () => {
    const html = today(locale, { workout: { state: 'rest' } });
    expect(html).toContain(t.workout.restTitle);
    expect(html).toContain(t.workout.restBody);
    expect(html).not.toContain('start-workout');
  });

  it('shows the no-plan card with its translated copy', () => {
    const html = today(locale, { workout: { state: 'none' } });
    expect(html).toContain(t.workout.noneTitle);
    expect(html).not.toContain('start-workout');
  });

  it('shows the translated error and retry label on the meal whose write failed', () => {
    const html = today(locale, {}, { errorMealId: 'm1' });
    expect(html).toContain(t.meals.error);
    expect(html).toContain(t.meals.retry);
  });

  it('drops the subscription warning when payments is off', () => {
    const subscription = { state: 'expired' };
    expect(today(locale, { subscription })).toContain(t.subscription.title);
    expect(today(locale, { subscription, modules: off('payments') })).not.toContain(t.subscription.title);
  });

  it('formats the exercise count with the chosen numerals', () => {
    expect(today(locale, { numerals: 'arab' })).toMatch(/[٠-٩]/);
    expect(today(locale, { numerals: 'latn' })).not.toMatch(/[٠-٩]/);
  });
});

describe.each(['en', 'ar'] as const)('R5 activity list states (%s)', locale => {
  const messages = catalogs[locale].activity;
  const environment = { timezone: 'Africa/Cairo', preferences: {}, role: 'owner' as const };
  const state = (patch: Partial<ActivityState>): ActivityState => ({ scope: '|', items: [], nextCursor: null, loading: false, append: false, error: null, ...patch });
  const view = (patch: Partial<ActivityState>, entity = '') => render(locale, createElement(ActivityLogView, { state: state(patch), environment, entity }));

  it('shows the translated empty view, with no busy marker', () => {
    const html = view({});
    expect(html).toContain(messages.empty);
    expect(html).not.toContain('aria-busy="true"');
    expect(html).not.toContain(messages.retry);
  });

  it('shows the filtered-no-results text, which differs from the plain empty text', () => {
    const html = view({}, 'clients');
    expect(html).toContain(messages.filteredEmpty);
    expect(html).not.toContain(`>${messages.empty}<`);
  });

  it('shows loading separately and marks it busy (temporary, never a settled state)', () => {
    const html = view({ loading: true });
    expect(html).toContain(messages.loading);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(`>${messages.empty}<`);
  });

  it('shows a retryable error rather than an empty list, and forbidden without retry', () => {
    const failed = view({ error: 'requestFailed' });
    expect(failed).toContain(messages.requestFailed);
    expect(failed).toContain(messages.retry);
    expect(failed).not.toContain(`>${messages.empty}<`);
    const forbidden = view({ error: 'forbidden' });
    expect(forbidden).toContain(messages.forbidden);
    expect(forbidden).not.toContain(messages.retry);
  });
});

describe.each(['en', 'ar'] as const)('R5 archived-list empty states (%s)', locale => {
  const messages = catalogs[locale].archiveControls;
  it('distinguishes nothing archived from nothing hidden', () => {
    const archived = render(locale, createElement(ArchivedEmpty, {}));
    const hidden = render(locale, createElement(ArchivedEmpty, { hidden: true }));
    expect(archived).toContain(messages.emptyArchivedTitle);
    expect(hidden).toContain(messages.emptyHiddenTitle);
    expect(archived).not.toContain(messages.emptyHiddenTitle);
  });
});
