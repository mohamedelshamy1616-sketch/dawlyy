import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentProps, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_MODULES, DEFAULT_CLIENT_MODULES, type ClientModules } from '@dawlyy/core/types';
import ar from '../../../messages/ar/clientToday.json';
import en from '../../../messages/en/clientToday.json';
import {
  CLIENT_TABS, ME_LINKS, PLAN_LINKS, activeClientTab, getClientDestinations, getMeLinks, getPlanLinks,
} from '@/components/client-today/client-destinations';
import { ClientModuleProvider } from '@/components/client-today/client-module-provider';
import { ClientTabBar } from '@/components/app/client-tab-bar';

// next-intl types `children` as a required prop; this view of it takes children as createElement's third argument
// (react/no-children-prop forbids passing them in the props object).
const IntlProvider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;

const nav = vi.hoisted(() => ({ pathname: '/app/today' }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: unknown; [key: string]: unknown }) =>
    createElement('a', { href, ...Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'prefetch')) }, children as never),
  usePathname: () => nav.pathname,
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));

const off = (...keys: Array<keyof ClientModules>): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(keys.map(key => [key, false])) });
const keysOf = (modules: ClientModules | null) => getClientDestinations(modules).map(tab => tab.key);

function renderBar(modules: ClientModules | null, layout: 'tabs' | 'top' = 'tabs', pathname = '/app/today', locale: 'en' | 'ar' = 'en') {
  nav.pathname = pathname;
  const messages = { clientToday: locale === 'ar' ? ar : en, common: { mainNavigation: 'Main navigation' } };
  const bar = createElement(ClientTabBar, { layout });
  const provider = createElement(ClientModuleProvider, { initial: modules ? { userId: 'u1', modules, numerals: 'latn' } : null } as ComponentProps<typeof ClientModuleProvider>, bar);
  return renderToStaticMarkup(createElement(IntlProvider, { locale, messages }, provider));
}
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);

describe('client destinations', () => {
  it('has exactly Today, Plan, Coach and Me when every module is on', () => {
    expect(keysOf(DEFAULT_CLIENT_MODULES)).toEqual(['today', 'plan', 'coach', 'me']);
    expect(CLIENT_TABS.map(tab => tab.href)).toEqual(['/app/today', '/app/plan', '/app/coach', '/app/me']);
  });

  it('shows Plan while either workouts or nutrition is on, and not otherwise', () => {
    expect(keysOf(off('workouts'))).toContain('plan');
    expect(keysOf(off('nutrition'))).toContain('plan');
    expect(keysOf(off('workouts', 'nutrition'))).toEqual(['today', 'coach', 'me']);
  });

  it('shows Coach only with messages on, and keeps Today and Me whatever is off', () => {
    expect(keysOf(off('messages'))).toEqual(['today', 'plan', 'me']);
    expect(keysOf(off(...CLIENT_MODULES))).toEqual(['today', 'me']);
  });

  it('never flashes a module while the settings are unknown', () => {
    expect(keysOf(null)).toEqual(['today', 'me']);
    expect(getPlanLinks(null)).toEqual([]);
    expect(getMeLinks(null).map(link => link.key)).toEqual(['notifications', 'consent']);
  });

  it.each([
    ['workouts', ['/app/program', '/app/history']],
    ['nutrition', ['/app/nutrition', '/app/nutrition/history', '/app/nutrition/log']],
    ['checkins', ['/app/checkins', '/app/assessment', '/app/intake']],
    ['payments', ['/app/subscription']],
    ['measurements', ['/app/progress', '/app/tracking']],
    ['progress_photos', ['/app/progress', '/app/tracking']],
  ] as const)('links no route of the disabled %s module', (module, gone) => {
    const shown = [...getPlanLinks(off(module)), ...getMeLinks(off(module))].map(link => link.href);
    for (const href of gone) expect(shown).not.toContain(href);
  });

  it('keeps notifications and consent reachable with every module off', () => {
    expect(getMeLinks(off(...CLIENT_MODULES)).map(link => link.href)).toEqual(['/app/notifications', '/app/consent']);
  });

  it('hides a disabled module without hiding its sibling', () => {
    expect(getPlanLinks(off('workouts')).map(link => link.key)).toEqual(['nutrition', 'quickMeal']);
    expect(getPlanLinks(off('nutrition')).map(link => link.key)).toEqual(['program']);
  });
});

describe('legacy deep links keep an active tab', () => {
  it.each([
    ['/app/today', 'today'], ['/app/workout/start', 'today'], ['/app/workout/abc', 'today'],
    ['/app/plan', 'plan'], ['/app/program', 'plan'], ['/app/nutrition', 'plan'], ['/app/nutrition/log', 'plan'],
    ['/app/coach', 'coach'], ['/app/messages', 'coach'],
    ['/app/me', 'me'], ['/app/progress', 'me'], ['/app/tracking', 'me'], ['/app/history', 'me'], ['/app/history/s1', 'me'],
    ['/app/history/exercise/e1', 'me'], ['/app/checkins/e1', 'me'], ['/app/assessment', 'me'], ['/app/intake', 'me'],
    ['/app/subscription', 'me'], ['/app/notifications', 'me'], ['/app/consent', 'me'],
  ] as const)('%s belongs to %s', (path, tab) => {
    expect(activeClientTab(path)).toBe(tab);
  });

  it('puts meal history under Me, not Plan, because history belongs to Me', () => {
    expect(activeClientTab('/app/nutrition/history', getClientDestinations(DEFAULT_CLIENT_MODULES).filter(tab => tab.key !== 'plan'))).toBeNull();
  });

  it('has no active tab for a hidden module route', () => {
    expect(activeClientTab('/app/messages', getClientDestinations(off('messages')))).toBeNull();
  });

  it('reaches every static client page from a tab, a hub row, or the Today flow', () => {
    const root = fileURLToPath(new URL('../../../app/[locale]/app/', import.meta.url));
    const routes: string[] = [];
    function walk(directory: string, route: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.includes('[') && !entry.name.includes('...')) walk(join(directory, entry.name), `${route}/${entry.name}`);
        else if (entry.isFile() && entry.name === 'page.tsx') routes.push(route);
      }
    }
    walk(root, '/app');
    const reachable = new Set<string>([
      ...CLIENT_TABS.map(tab => tab.href), ...PLAN_LINKS.map(link => link.href), ...ME_LINKS.map(link => link.href),
      // Today's Start button; the app index redirects to Today.
      '/app/workout/start', '/app',
      // Kept deep link: the Coach tab embeds this conversation and notifications still point here.
      '/app/messages',
    ]);
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter(route => !reachable.has(route))).toEqual([]);
    for (const href of reachable) expect(existsSync(join(root, href.replace('/app', ''), 'page.tsx')), href).toBe(true);
  });
});

describe('ClientTabBar', () => {
  it('renders one link per visible tab with the current one marked', () => {
    const html = renderBar(DEFAULT_CLIENT_MODULES, 'tabs', '/app/program');
    expect(hrefs(html)).toEqual(['/app/today', '/app/plan', '/app/coach', '/app/me']);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/app\/plan"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/app\/plan"/);
    expect(html.match(/<nav /g)).toHaveLength(1);
  });

  it('uses 44 px or larger touch targets in both layouts', () => {
    expect(renderBar(DEFAULT_CLIENT_MODULES, 'tabs')).toContain('min-h-16');
    expect(renderBar(DEFAULT_CLIENT_MODULES, 'top')).toContain('min-h-11');
  });

  it('drops tabs of disabled modules', () => {
    expect(hrefs(renderBar(off('messages', 'workouts', 'nutrition')))).toEqual(['/app/today', '/app/me']);
  });

  it('shows only Today and Me, with a loading note, when the bootstrap is unknown', () => {
    const html = renderBar(null);
    expect(hrefs(html)).toEqual(['/app/today', '/app/me']);
    expect(html).toContain('Loading your app');
    expect(html).not.toContain('/app/plan');
  });

  it('labels the tabs in Arabic', () => {
    const html = renderBar(DEFAULT_CLIENT_MODULES, 'tabs', '/app/today', 'ar');
    for (const label of [ar.tabs.today, ar.tabs.plan, ar.tabs.coach, ar.tabs.me]) expect(html).toContain(label);
  });
});