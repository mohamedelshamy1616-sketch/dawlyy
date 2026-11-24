import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { weekReview, type WeekReviewInput } from '@dawlyy/core/review';
import ar from '../../../messages/ar/review.json';
import en from '../../../messages/en/review.json';
import { ReviewWorkspace, ReviewLoading, initialReviewText } from '../../../components/review/review-workspace';
import { WeeklyReviewCard } from '../../../components/review/weekly-review-card';
import { ReviewPreferencesForm } from '../../../components/review/review-preferences';
import type { ReviewDraftDto } from './types';

vi.mock('@/i18n/navigation', async () => {
  const { createElement: element } = await import('react');
  return { Link: ({ children, href, ...props }: { children?: ReactNode; href: string }) => element('a', { ...props, href }, children) };
});
vi.mock('@astryxdesign/core/VStack', async () => {
  const { createElement: element } = await import('react');
  return { VStack: ({ children, as = 'section', dir, className, id, role, ...props }: { children?: ReactNode; as?: string; dir?: string; className?: string; id?: string; role?: string }) =>
    element(as, { dir, className, id, role, ...Object.fromEntries(Object.entries(props).filter(([key]) => /^(aria-|data-)/.test(key))) }, children) };
});
vi.mock('@astryxdesign/core/HStack', async () => {
  const { createElement: element } = await import('react');
  return { HStack: ({ children }: { children?: ReactNode }) => element('section', null, children) };
});
vi.mock('@astryxdesign/core/Heading', async () => {
  const { createElement: element } = await import('react');
  return { Heading: ({ children, level = 2, id }: { children?: ReactNode; level?: number; id?: string }) => element(`h${level}`, { id }, children) };
});
vi.mock('@astryxdesign/core/Text', async () => {
  const { createElement: element } = await import('react');
  return { Text: ({ children, as = 'p', id, role, ...props }: { children?: ReactNode; as?: string; id?: string; role?: string }) => element(as, { id, role, ...Object.fromEntries(Object.entries(props).filter(([key]) => /^(aria-|data-)/.test(key))) }, children) };
});
vi.mock('@astryxdesign/core/Button', async () => {
  const { createElement: element } = await import('react');
  return { Button: ({ label, isDisabled, ...props }: { label: string; isDisabled?: boolean }) => element('button', { disabled: isDisabled, ...Object.fromEntries(Object.entries(props).filter(([key]) => /^(aria-|data-)/.test(key))) }, label) };
});
vi.mock('@astryxdesign/core/TextArea', async () => {
  const { createElement: element } = await import('react');
  return { TextArea: ({ label, value, isReadOnly, isDisabled, maxLength }: { label: string; value: string; isReadOnly?: boolean; isDisabled?: boolean; maxLength?: number }) => element('label', null, label, element('textarea', { value, readOnly: isReadOnly, disabled: isDisabled, maxLength })) };
});
vi.mock('@astryxdesign/core/List', async () => {
  const { createElement: element } = await import('react');
  return { List: ({ children }: { children?: ReactNode }) => element('ul', null, children), ListItem: ({ label, description, endContent }: { label: ReactNode; description?: ReactNode; endContent?: ReactNode }) => element('li', null, label, description, endContent) };
});
vi.mock('@astryxdesign/core/Card', async () => {
  const { createElement: element } = await import('react');
  return { Card: ({ children }: { children?: ReactNode }) => element('article', null, children) };
});
const input: WeekReviewInput = {
  client: { id: '10000000-0000-4000-8000-000000000001', firstName: 'Mona', goal: 'lose' },
  coach: { firstName: 'Nour', dialect: 'egyptian', signaturePhrases: [] },
  period: { from: '2026-11-01', to: '2026-11-07' },
  workouts: { planned: 4, done: 3, previousPlanned: 4, previousDone: 2 }, exercises: [],
  meals: { nutritionAssigned: true, daysLogged: 5, daysInPeriod: 7, avgKcal: 1850, targetKcal: 1900 },
  checkin: { current: null, previous: null }, weights: [], measurements: [], redFlags: [], attention: null,
  nutrition: { versionId: '10000000-0000-4000-8000-000000000002', targets: { kcal: 1900, proteinG: 130, carbsG: 220, fatG: 55 } },
};
function draft(locale: 'ar' | 'en' = 'en', changes: Partial<ReviewDraftDto> = {}): ReviewDraftDto {
  const review = weekReview(input, { locale });
  return { id: '10000000-0000-4000-8000-000000000003', clientId: input.client.id, status: 'draft', provider: 'none', inputVersion: 'review-v1:2026-11-01:2026-11-07', createdAt: '2026-11-07T12:00:00Z', review, text: review.draft.text, textHash: 'a'.repeat(64), evidenceUnavailable: [], proposalDraft: null, ...changes };
}
const Provider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
function render(locale: 'ar' | 'en', child: ReactNode) {
  return renderToStaticMarkup(createElement(Provider, { locale, timeZone: 'UTC', messages: { review: locale === 'ar' ? ar : en } }, child));
}
function workspace(locale: 'ar' | 'en', options: Partial<ComponentProps<typeof ReviewWorkspace>> = {}) {
  return render(locale, createElement(ReviewWorkspace, { clientId: input.client.id, initial: draft(locale), canSend: true, canPropose: true, canViewNutrition: true, ...options }));
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); })); });
afterEach(() => { try { expect(fetch).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); } });
describe('R4b review presentation', () => {
  it.each(['ar', 'en'] as const)('renders %s evidence rows and explicit send controls', locale => {
    const html = workspace(locale);
    expect(html).toContain(`dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`);
    expect(html).toContain(locale === 'ar' ? 'المراجعة الأسبوعية' : 'Weekly review');
    expect(html).toContain(locale === 'ar' ? 'اعتمد وابعت' : 'Approve and send');
    expect(html).toContain('75'); expect(html).toContain('1,850'); expect(html).toContain('<textarea');
    expect(html).not.toContain('aria-busy="true"');
  });
  it('retains edited prose verbatim and formats only untouched generated text once', () => {
    const edited = draft('ar', { text: 'Coach edited 1234.5 exactly; keep this.' });
    expect(initialReviewText(edited, 'ar', 'arab')).toBe(edited.text);
    expect(workspace('ar', { initial: edited, numerals: 'arab' })).toContain(edited.text);
    expect(initialReviewText(draft('ar'), 'ar', 'arab')).not.toBe(draft('ar').text);
    expect(initialReviewText(draft('ar'), 'ar', 'latn')).toBe(draft('ar').text);
  });
  it('renders no-draft, empty-week and unavailable evidence distinctly', () => {
    const none = workspace('en', { initial: null });
    expect(none).toContain('No review yet'); expect(none).toContain('Build review');
    const emptyReview = weekReview({ ...input, workouts: { planned: 0, done: 0, previousPlanned: 0, previousDone: 0 }, meals: { ...input.meals, nutritionAssigned: false, daysLogged: 0 } }, { locale: 'en' });
    expect(workspace('en', { initial: draft('en', { review: emptyReview, text: emptyReview.draft.text }) })).toContain('No activity recorded for this week');
    const unavailable = workspace('en', { initial: draft('en', { evidenceUnavailable: ['programs', 'nutrition', 'tracking'] }) });
    expect(unavailable).toContain('Workout evidence unavailable'); expect(unavailable).toContain('Meal evidence unavailable');
    expect(unavailable).not.toContain('1,850'); expect(none + unavailable).not.toContain('aria-busy="true"');
  });
  it('shows stale rebuild and disables approval', () => {
    const html = workspace('en', { initial: draft('en', { status: 'stale' }) });
    expect(html).toContain('Data changed. Rebuild the review.'); expect(html).toContain('Rebuild review');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Approve and send/);
  });
  it('blocks flagged reviews and exposes a handled flag control without advice', () => {
    const flagged = draft();
    flagged.review = { ...flagged.review, mustHandleFlags: true, summary: { ...flagged.review.summary, redFlags: [{ id: '10000000-0000-4000-8000-000000000004', source: 'message', category: 'pain_injury' }] } };
    const html = workspace('en', { initial: flagged });
    expect(html).toContain('Mark handled'); expect(html).toContain('Handle the open flags, then rebuild');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Approve and send/);
  });
  it('links existing proposal work to history/comparison and separate publication', () => {
    const html = workspace('en', { initial: draft('en', { status: 'approved', proposalDraft: { planId: 'plan-1', versionId: 'version-2', versionNo: 2 } }) });
    expect(html).toContain('href="/coach/nutrition/plan-1/history"'); expect(html).toContain('History and version comparison');
    expect(html).toContain('href="/coach/nutrition/plan-1"'); expect(html).toContain('Open draft to publish');
    expect(html).toContain('Approved and sent'); expect(html).not.toContain('aria-busy="true"');
  });
  it('shows settled forbidden and request errors without a stored summary', () => {
    const html = workspace('en', { initial: null, initialError: 'forbidden' });
    expect(html).toContain('You do not have permission to view this review'); expect(html).toContain('role="alert"');
    expect(html).not.toContain('<textarea'); expect(html).not.toContain('aria-busy="true"');
    expect(workspace('en', { initial: null, initialError: 'request' })).toContain('Could not load the review');
  });
  it('opens the Week card through an explicit read and never mutates on mount', () => {
    const html = render('en', createElement(WeeklyReviewCard, { clientId: input.client.id, initial: null }));
    expect(html).toContain('Open weekly review'); expect(html).not.toContain('Approve and send'); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['ar', 'en'] as const)('renders editable %s dialect/signature settings', locale => {
    const html = render(locale, createElement(ReviewPreferencesForm, { initial: { dialect: 'gulf', signaturePhrases: ['Keep going'] } }));
    expect(html).toContain(locale === 'ar' ? 'مصري' : 'Egyptian'); expect(html).toContain(locale === 'ar' ? 'خليجي' : 'Gulf');
    expect(html).toContain('Keep going'); expect(html).toContain(locale === 'ar' ? 'احفظ التفضيلات' : 'Save preferences');
    expect(html).not.toContain('aria-busy="true"');
  });
  it('reserves busy output for the transient loading component', () => {
    const html = render('en', createElement(ReviewLoading)); expect(html).toContain('aria-busy="true"'); expect(html).toContain('Loading review');
  });
  it('keeps locale message keys identical', () => {
    const keys = (value: unknown, prefix = ''): string[] => value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}.${key}`)).sort() : [prefix];
    expect(keys(ar)).toEqual(keys(en));
  });
});
