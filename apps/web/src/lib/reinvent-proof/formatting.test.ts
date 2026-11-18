import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLIENT_MODULES } from '@dawlyy/core/types';
import clientTodayAr from '../../../messages/ar/clientToday.json';
import clientTodayEn from '../../../messages/en/clientToday.json';
import quickLogAr from '../../../messages/ar/quickLog.json';
import quickLogEn from '../../../messages/en/quickLog.json';
import archiveAr from '../../../messages/ar/archiveControls.json';
import archiveEn from '../../../messages/en/archiveControls.json';
import { ClientTodayView } from '@/components/client-today/today-view';
import { BulkResultView } from '@/components/control/bulk-actions';
import type { ClientTodayModel } from '@/components/client-today/types';
import type { BulkReceipt } from '@/src/lib/control/bulk-actions';
import { EMPTY_NUMBER, formatKcal, formatMacro, formatNumber, formatNutrient, numberLocale, numeralPolicy } from '@/src/lib/numbers';

// next-intl types `children` as required; here children go in as createElement's third argument.
const IntlProvider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: ReactNode; [key: string]: unknown }) => createElement('a', { href, ...rest }, children),
  usePathname: () => '/app/today',
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));

const ARABIC_INDIC = /[٠-٩]/;
const WESTERN = /[0-9]/;
const latn = (locale: 'ar' | 'en') => ({ locale, numerals: 'latn' as const });
const arab = (locale: 'ar' | 'en') => ({ locale, numerals: 'arab' as const });

describe('R5 shared formatter: representative values in both locales and both numeral choices', () => {
  it('writes Western digits by default in Arabic and English, and Arabic-Indic only when chosen', () => {
    expect(formatNumber(12, { locale: 'ar' })).toBe('12');
    expect(formatNumber(12, { locale: 'en' })).toBe('12');
    expect(formatNumber(12, arab('ar'))).toBe('١٢');
    expect(formatNumber(12, arab('en'))).toMatch(ARABIC_INDIC);
    expect(formatNumber(12, latn('ar'))).not.toMatch(ARABIC_INDIC);
  });

  it('formats Inbox counts and review percent and kg with the chosen numerals', () => {
    expect(formatNumber(7, { ...latn('en'), maximumFractionDigits: 0 })).toBe('7');
    expect(formatNumber(7, { ...arab('ar'), maximumFractionDigits: 0 })).toBe('٧');
    expect(formatNumber(72.5, { ...latn('en'), maximumFractionDigits: 1 })).toBe('72.5');
    expect(formatNumber(0.4, { ...latn('en'), maximumFractionDigits: 1 })).toBe('0.4');
    expect(formatNumber(1234, latn('en'))).toBe('1,234');
    expect(formatNumber(72.5, { ...arab('ar'), maximumFractionDigits: 1 })).toMatch(/^٧٢[٫.]٥$/);
  });

  it('rounds kcal to the nearest 5 and macros to a whole number', () => {
    expect(formatKcal(2083, latn('en'))).toBe('2,085');
    expect(formatKcal(2082, latn('en'))).toBe('2,080');
    expect(formatKcal(2083, arab('ar'))).toMatch(ARABIC_INDIC);
    expect(formatMacro(31.7, latn('en'))).toBe('32');
    expect(formatMacro(31.4, latn('ar'))).toBe('31');
    expect(formatMacro(31.7, arab('ar'))).toBe('٣٢');
    expect(formatNutrient('kcal', 2083, latn('en'))).toBe(formatKcal(2083, latn('en')));
    expect(formatNutrient('proteinG', 31.7, latn('en'))).toBe(formatMacro(31.7, latn('en')));
  });

  it('shows the shared en dash for missing or invalid values, never zero, NaN or empty', () => {
    expect(EMPTY_NUMBER).toBe('–');
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const locale of ['ar', 'en'] as const) {
        expect(formatNumber(value, latn(locale))).toBe('–');
        expect(formatKcal(value, arab(locale))).toBe('–');
        expect(formatMacro(value, latn(locale))).toBe('–');
      }
    }
  });

  it('never prints negative zero', () => {
    expect(formatNumber(-0, latn('en'))).toBe('0');
    expect(formatNumber(-0.04, { ...latn('en'), maximumFractionDigits: 1 })).toBe('0');
    expect(formatMacro(-0.4, latn('en'))).toBe('0');
    expect(formatKcal(-2, latn('en'))).toBe('0');
    expect(formatNumber(-0.04, { ...arab('ar'), maximumFractionDigits: 1 })).toBe('٠');
  });

  it('reads the numeral choice from preferences and falls back to Western digits', () => {
    expect(numeralPolicy({ numerals: 'arab' })).toBe('arab');
    for (const bad of [undefined, null, 'arab', {}, { numerals: 'x' }, { numerals: 1 }]) expect(numeralPolicy(bad)).toBe('latn');
    expect(numberLocale('ar')).toBe('ar');
    expect(numberLocale('en')).toBe('en');
    expect(numberLocale('fr')).toBe('en');
  });
});

const model = (locale: 'ar' | 'en', numerals: 'latn' | 'arab', patch: Partial<ClientTodayModel> = {}): ClientTodayModel => ({
  date: '2026-11-14', locale, numerals, modules: DEFAULT_CLIENT_MODULES,
  workout: { state: 'planned', name: { en: 'Push day', ar: 'يوم الدفع' }, exerciseCount: 12 },
  meals: [], checkins: [], intakePending: false, subscription: { state: 'active', daysLeft: 25 }, ...patch,
});
function today(locale: 'ar' | 'en', numerals: 'latn' | 'arab') {
  const messages = { clientToday: locale === 'ar' ? clientTodayAr : clientTodayEn, quickLog: locale === 'ar' ? quickLogAr : quickLogEn };
  return renderToStaticMarkup(createElement(IntlProvider, { locale, messages }, createElement(ClientTodayView, { model: model(locale, numerals) })));
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ');

describe('R5 numerals in rendered output: ClientTodayView', () => {
  it('passes the exercise count and subscription days through the shared formatter (Western by default)', () => {
    const en = text(today('en', 'latn'));
    expect(en).toContain(`${formatNumber(12, latn('en'))} exercises`);
    expect(en).toContain('25 days left');
    const ar = text(today('ar', 'latn'));
    expect(ar).toContain('12 تمرين');
    expect(ar).toContain('25');
    expect(ar).not.toMatch(ARABIC_INDIC);
  });

  it('switches every count to Arabic-Indic digits when the user chose them, in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      const html = text(today(locale, 'arab'));
      expect(html, locale).toContain(formatNumber(12, arab(locale)));
      expect(html, locale).toContain(formatNumber(25, arab(locale)));
      expect(html, locale).not.toContain('25');
      expect(html, locale).not.toMatch(/\b12\b/);
    }
  });
});

describe('R5 numerals in rendered output: BulkResultView', () => {
  const item = (id: string) => ({ id, name: `Item ${id}`, archived: false });
  const receipt: BulkReceipt = { op: 'archive', changed: [item('1'), item('2'), item('3')], skipped: [item('4'), item('5')], blocked: [], failures: [], keys: {} };
  const view = (locale: 'ar' | 'en', numerals: 'latn' | 'arab') => text(renderToStaticMarkup(createElement(IntlProvider, { locale, messages: { archiveControls: locale === 'ar' ? archiveAr : archiveEn } },
    createElement(BulkResultView, { receipt, busy: false, numerals, onRetry: () => {}, onDismiss: () => {} }))));

  it('formats the changed and skipped counts with the chosen numerals', () => {
    expect(view('en', 'latn')).toContain('3 done.');
    expect(view('en', 'latn')).toContain('2 were already in that state.');
    expect(view('ar', 'latn')).toMatch(WESTERN);
    expect(view('ar', 'latn')).not.toMatch(ARABIC_INDIC);
    const arabic = view('ar', 'arab');
    expect(arabic).toContain('٣');
    expect(arabic).toContain('٢');
    expect(arabic).not.toMatch(WESTERN);
  });
});
