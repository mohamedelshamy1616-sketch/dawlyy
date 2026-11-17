import { createElement, type ComponentProps, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ar from '../../../messages/ar/aiProvider.json';
import en from '../../../messages/en/aiProvider.json';
import { ProviderStatus, AiSettingsLoading } from '../../../components/ai-settings/provider-status';
import { AI_COST_ROWS } from '../../../components/ai-settings/cost-table';
import type { AiProviderStatus } from './types';

// Keep the presentational test in Node; no Next router or browser is mounted.
vi.mock('@/i18n/navigation', async () => {
  const { createElement: element } = await import('react');
  return { Link: ({ children, href, ...props }: { children?: import('react').ReactNode; href: string }) => element('a', { ...props, href }, children) };
});

const off: AiProviderStatus = { provider: 'none', state: 'off', reason: 'default_none' };
const catalogs = { ar, en };
const Provider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
function render(locale: 'ar' | 'en', props: Partial<Parameters<typeof ProviderStatus>[0]> = {}) {
  return renderToStaticMarkup(createElement(Provider, {
    locale, timeZone: 'UTC', messages: { aiProvider: catalogs[locale] },
  }, createElement(ProviderStatus, { status: off, locale, ...props })));
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in this test'); })); });
afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

function messageKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => messageKeys(child, prefix ? `${prefix}.${key}` : key)).sort();
}

describe('read-only AI settings', () => {
  it.each(['ar', 'en'] as const)('renders translated %s off status, history, assumptions and all report alternatives', locale => {
    const html = render(locale);
    expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain(locale === 'ar' ? 'متوقف: محتاج مفتاح ومراجعة قانونية' : 'off: needs a key and legal review');
    expect(html).toContain(locale === 'ar' ? '13 نوفمبر 2026' : '13 Nov 2026');
    expect(html).toContain('6,000');
    expect(html).toContain('800');
    expect(html).toContain('1,000');
    expect(html).toContain(locale === 'ar' ? 'قبل إعادة المحاولات والضرايب ورسوم التمويل والبنية التحتية' : 'before retries, tax, funding fees and infrastructure');
    expect(html.match(/data-ai-cost-row=/g)).toHaveLength(9);
    expect(html).toContain('Claude Haiku 5.5');
    expect(html).toContain(locale === 'ar' ? 'كلاودفلير Gemma 4 26B-A4B' : 'Cloudflare Gemma 4 26B-A4B');
    expect(html).toContain(locale === 'ar' ? 'القوالب شغالة' : 'Template reviews already work');
    expect(html).toContain(locale === 'ar' ? '151/2020' : '151/2020');
    expect(html).toContain('href="/coach/settings"');
    expect(html).toContain(locale === 'ar' ? 'الرجوع للإعدادات' : 'Back to settings');
    expect(html).not.toMatch(/aria-busy="true"|<(input|button|form|textarea|select)\b|type="password"|contenteditable="true"|role="switch"/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['anthropic', 'openrouter'] as const)('shows a clear settled configuration failure for %s', provider => {
    const html = render('en', { status: { provider, state: 'misconfigured', reason: 'needs_key' } });
    expect(html).toContain(provider === 'anthropic' ? 'Anthropic' : 'OpenRouter');
    expect(html).toContain('off: selected provider needs configuration');
    expect(html).toContain('The selected provider needs its own key.');
    expect(html).not.toContain('aria-busy="true"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows configured as configuration only and never exposes supplied secrets or headers', () => {
    const statusWithUnrelatedSecrets = {
      provider: 'openrouter' as const, state: 'configured' as const, reason: 'external_configuration' as const,
      key: 'INERT_SECRET_SETTINGS', model: 'INERT_MODEL_SETTINGS', headers: { authorization: 'INERT_HEADER_SETTINGS' },
    };
    const html = render('en', { status: statusWithUnrelatedSecrets });
    expect(html).toContain('OpenRouter');
    expect(html).toContain('Configuration does not confirm legal approval.');
    expect(html).not.toMatch(/INERT_SECRET_SETTINGS|INERT_MODEL_SETTINGS|INERT_HEADER_SETTINGS|authorization|api[_-]?key/i);
    expect(html).not.toMatch(/<(input|button|form|textarea|select)\b|contenteditable="true"|role="switch"/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses Western digits by default in Arabic and the shared Arabic-Indic numeral preference when chosen', () => {
    const western = render('ar');
    const arabicIndic = render('ar', { numerals: 'arab' });
    expect(western).toContain('0.78');
    expect(western).toContain('0.09');
    expect(western).toContain('6,000');
    expect(arabicIndic).toContain('٠٫٧٨');
    expect(arabicIndic).toContain('٠٫٠٩');
    expect(arabicIndic).toContain('٦٬٠٠٠');
    expect(arabicIndic).toContain('٨٠٠');
    expect(arabicIndic).toContain('١٬٠٠٠');
    expect(arabicIndic).not.toContain('aria-busy="true"');
  });

  it('renders separate error and empty-cost presentations without settling on a skeleton', () => {
    const empty = render('en', { costs: [] });
    const error = render('ar', { status: null, costs: null });
    expect(empty).toContain('No historical cost rows are available.');
    expect(error).toContain('مش قادرين نعرض حالة المزوّد دلوقتي.');
    expect(error).toContain('مش قادرين نعرض تكاليف التقرير دلوقتي.');
    expect(error).toContain('role="alert"');
    expect(empty + error).not.toContain('aria-busy="true"');
  });

  it('identifies the route loading state as transient', () => {
    const html = renderToStaticMarkup(createElement(Provider, {
      locale: 'en', timeZone: 'UTC', messages: { aiProvider: en },
    }, createElement(AiSettingsLoading)));
    expect(html).toContain('Loading AI settings');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
  });

  it('copies the nine historical weekly-summary costs without deriving model IDs or changing rates', () => {
    expect(AI_COST_ROWS.map(row => row.perThousandSummaries)).toEqual([1, 1, 0.78, 1.52, 1.38, 3.8, 7.5, 15, 0.84]);
    expect(AI_COST_ROWS.map(row => [row.inputPerMillion, row.outputPerMillion])).toEqual([
      [0.1, 0.5], [0.1, 0.5], [0.09, 0.3], [0.2, 0.4], [0.15, 0.6], [0.3, 2.5], [0.75, 3.75], [1.5, 7.5], [null, null],
    ]);
    expect(messageKeys(ar)).toEqual(messageKeys(en));
  });
});
