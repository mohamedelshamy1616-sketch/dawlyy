import { createElement, type ComponentProps, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLIENT_MODULES, type ClientModules } from '@dawlyy/core/types';
import arComposer from '../../../messages/ar/clientAppComposer.json';
import enComposer from '../../../messages/en/clientAppComposer.json';
import arToday from '../../../messages/ar/clientToday.json';
import enToday from '../../../messages/en/clientToday.json';
import { ClientAppComposer, ComposerLoading } from '../../../components/client-app-composer/composer';
import type { ComposerSeed } from '../../../components/client-app-composer/types';
import { formatNumber } from '../numbers';
import { COMPOSER_KEY, type ComposerOverrideRow } from './state';
import { createComposerTransport } from './transport';

vi.mock('@/i18n/navigation', async () => {
  const { createElement: element } = await import('react');
  return { Link: ({ children, href, ...props }: { children?: import('react').ReactNode; href: string }) => element('a', { ...props, href }, children) };
});

const catalogs = { ar: { clientAppComposer: arComposer, clientToday: arToday }, en: { clientAppComposer: enComposer, clientToday: enToday } };
const Provider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
const off = (...modules: Array<keyof ClientModules>): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(modules.map(m => [m, false])) });
const composerRow: ComposerOverrideRow = { id: 'r1', createdAt: '2026-11-01T00:00:00.000Z', override: { key: 'custom', customKey: 'client_app', enabled: true, modules: { nutrition: false } } };
const otherRow: ComposerOverrideRow = { id: 'r0', createdAt: '2026-10-01T00:00:00.000Z', override: { key: 'chat', enabled: true, modules: { messages: false } } };

function tenantSeed(locale: 'ar' | 'en', extra: Partial<ComposerSeed> = {}): ComposerSeed {
  return { mode: 'tenant', locale, numerals: 'latn', tenantModules: DEFAULT_CLIENT_MODULES, effectiveModules: DEFAULT_CLIENT_MODULES, canSave: true, ...extra } as ComposerSeed;
}
function clientSeed(locale: 'ar' | 'en', extra: Partial<Extract<ComposerSeed, { mode: 'client' }>> = {}): ComposerSeed {
  return {
    mode: 'client', clientId: '11111111-1111-4111-8111-111111111111', clientName: 'Sara', today: '2026-11-18', rows: [composerRow, otherRow],
    locale, numerals: 'latn', tenantModules: DEFAULT_CLIENT_MODULES, effectiveModules: off('nutrition', 'messages'), canSave: true, ...extra,
  };
}
const esc = (text: string) => text.replace(/'/g, '&#x27;');
function render(seed: ComposerSeed) {
  return renderToStaticMarkup(createElement(Provider, { locale: seed.locale, timeZone: 'UTC', messages: catalogs[seed.locale] },
    createElement(ClientAppComposer, { seed, transport: createComposerTransport({ fetch: () => { throw new Error('no request while rendering'); } }) })));
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this test'); })); });
afterEach(() => { try { expect(fetch).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); } });

describe('ClientAppComposer markup', () => {
  it.each(['ar', 'en'] as const)('renders the tenant view in %s with seven labelled switches and a single h1', locale => {
    const html = render(tenantSeed(locale));
    const catalog = catalogs[locale].clientAppComposer;
    expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain(catalog.title);
    expect(html).toContain(catalog.intro.tenant);
    expect(html.match(/role="switch"|type="checkbox"/g)?.length).toBeGreaterThanOrEqual(7);
    for (const key of ['workouts', 'nutrition', 'checkins', 'progress_photos', 'measurements', 'messages', 'payments'] as const) {
      expect(html).toContain(catalog.modules[key].name);
      expect(html).toContain(`data-testid="module-${key}"`);
    }
    expect(html).toContain('href="/coach/settings"');
    expect(html).toContain(catalog.actions.save);
    expect(html).not.toContain(catalog.actions.reset);
    expect(html).not.toContain('aria-busy="true"');
  });

  it.each(['ar', 'en'] as const)('renders the client view in %s with Inherit/Show/Hide and effective text', locale => {
    const html = render(clientSeed(locale));
    const catalog = catalogs[locale].clientAppComposer;
    expect(html.match(/role="radiogroup"/g)).toHaveLength(7);
    for (const key of ['inherit', 'on', 'off'] as const) expect(html).toContain(catalog.choice[key]);
    expect(html).toContain(locale === 'ar' ? 'الافتراضي: ظاهر' : 'Default: shown');
    expect(html).toContain(locale === 'ar' ? 'دلوقتي للعميل ده: مخفي' : 'Now for this client: hidden');
    expect(html).toContain(catalog.state.otherOverride);
    expect(html).toContain(catalog.actions.reset);
    expect(html).toContain('href="/coach/clients/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('Sara');
    expect(COMPOSER_KEY).toBe('custom:client_app');
  });

  it('shows a read-only view without Save or Reset and with disabled controls', () => {
    const html = render(clientSeed('en', { canSave: false }));
    expect(html).toContain(enComposer.readOnly.title);
    expect(html).toContain(esc(enComposer.readOnly.client));
    expect(html).not.toContain(enComposer.actions.save);
    expect(html).not.toContain(enComposer.actions.reset);
    expect(html).toContain('disabled');
    expect(render(tenantSeed('ar', { canSave: false }))).toContain(arComposer.readOnly.tenant);
  });

  it('renders an inert preview marked as an image, with no real links or enabled mutation buttons', () => {
    const html = render(clientSeed('en'));
    expect(html).toContain('data-testid="phone-preview"');
    expect(html).toContain(`role="img"`);
    expect(html).toContain(esc(enComposer.preview.frame));
    expect(html).toContain('Upper body strength');
    expect(html).not.toContain('href="/app/');
    expect(html).not.toContain('Breakfast Ate');
    expect(html).toContain(enToday.preview.title);
  });

  it('settles an all-off state with an explanation and an empty preview', () => {
    const html = render(tenantSeed('en', { tenantModules: off('workouts', 'nutrition', 'checkins', 'progress_photos', 'measurements', 'messages', 'payments') }));
    expect(html).toContain(enComposer.summary.allOff);
    expect(html).toContain(enComposer.preview.empty);
    expect(html).toContain(enToday.today.emptyTitle);
    expect(html).not.toContain('Upper body strength');
    expect(html).not.toContain('aria-busy="true"');
  });

  it('hides content of a module that is off from the preview', () => {
    const html = render(tenantSeed('en', { tenantModules: off('nutrition') }));
    expect(html).not.toContain(enComposer.preview.sample.meal1);
    expect(html).toContain('Upper body strength');
  });

  it('formats counts with the chosen numerals', () => {
    expect(render(tenantSeed('ar'))).toContain('7 من 7');
    const arabic = render(tenantSeed('ar', { numerals: 'arab' }));
    expect(arabic).toContain(`${formatNumber(7, { locale: 'ar', numerals: 'arab', maximumFractionDigits: 0 })} من`);
    expect(formatNumber(7, { locale: 'ar', numerals: 'arab', maximumFractionDigits: 0 })).toBe('٧');
  });

  it('keeps a loading fallback transient and every translated error key present in both locales', () => {
    const html = renderToStaticMarkup(createElement(Provider, { locale: 'en', timeZone: 'UTC', messages: catalogs.en }, createElement(ComposerLoading)));
    expect(html).toContain('aria-busy="true"');
    expect(Object.keys(arComposer.errors).sort()).toEqual(Object.keys(enComposer.errors).sort());
    for (const kind of ['validation', 'unauthenticated', 'forbidden', 'not_found', 'conflict', 'server', 'network', 'in_progress', 'unprocessable'] as const) {
      expect(enComposer.errors[kind]).toBeTruthy();
    }
  });
});
