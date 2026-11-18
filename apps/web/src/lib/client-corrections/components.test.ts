import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ComponentProps, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryActions } from '@/components/client-corrections/entry-actions';
import { MealEditor } from '@/components/client-corrections/meal-editor';
import { MeasurementEditor } from '@/components/client-corrections/measurement-editor';
import { ClientQuickLog } from '@/components/client-quick-log/quick-log';
import { ClientNutritionHistory } from '@/components/nutrition/client-history';
import { ClientNutritionScreen } from '@/components/nutrition/client-nutrition';
import { ProgressPanel } from '@/components/tracking/progress-panel';
import { TrackingScreen } from '@/components/tracking/tracking-screen';
import { HistoryDetail } from '@/components/client-portal/history-view';
import type { ClientNutrition, DailyLogs } from '@/components/nutrition/types';
import type { SessionDetail } from '@/src/server/workout/contracts';
import type { MealHistoryRow, MeasurementHistoryRow } from './types';

const live = vi.hoisted(() => ({ status: 'ready', userId: 'client-a', numerals: 'latn' as 'latn' | 'arab', modules: { nutrition: true, workouts: true, measurements: true, progress_photos: true, checkins: true, messages: true, payments: true } }));
vi.mock('@/components/client-today/client-module-provider', () => ({ useClientModules: () => ({ ...live, refresh: async () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock('@/i18n/navigation', async () => {
  const { createElement: h } = await import('react');
  return { useRouter: () => ({ refresh: () => undefined, push: () => undefined }), Link: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => h('a', { href, className }, children) };
});
// Node has no portal target. Keep actual dialog content and all its real Astryx fields/buttons.
// P9 verifies the installed Dialog's keyboard/focus behavior in a browser.
vi.mock('@astryxdesign/core/Dialog', async () => {
  const { createElement: h } = await import('react');
  return { Dialog: (p: { isOpen: boolean; children?: ReactNode; 'aria-label'?: string }) => p.isOpen ? h('section', { role: 'dialog', 'aria-label': p['aria-label'] }, p.children) : null,
    DialogHeader: (p: { title: string; subtitle?: string }) => h('header', null, h('h2', null, p.title), p.subtitle ? h('p', null, p.subtitle) : null) };
});
const IntlProvider = NextIntlClientProvider as ComponentType<Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>>;
type Locale = 'ar' | 'en';
function messages(locale: Locale) { return Object.fromEntries(['nutrition', 'tracking', 'workout', 'clientCorrections', 'quickLog'].map(name => [name, JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${name}.json`), 'utf8'))])); }
const render = (locale: Locale, node: ReactElement) => renderToStaticMarkup(createElement(IntlProvider, { locale, messages: messages(locale), timeZone: 'Africa/Cairo' }, node));
const settled = (html: string) => { expect(html).not.toContain('aria-busy="true"'); expect(html).not.toContain('Skeleton'); };
const noop = () => undefined;
const stamp = new Date().toISOString();
const meal = (patch: Partial<MealHistoryRow> = {}): MealHistoryRow => ({ id: 'original', clientUuid: '10000000-0000-4000-8000-000000000001', localDate: '2026-11-17', mealId: null, optionId: null, status: 'eaten', freeEntry: { text: 'My original meal' }, note: null, clientUpdatedAt: stamp, createdAt: stamp, voidedAt: null, replacesId: null, ...patch });
const measurements = (patch: Partial<MeasurementHistoryRow> = {}): MeasurementHistoryRow => ({ id: 'set', localDate: '2026-11-17', values: [{ type: 'waist', value: 82, unit: 'cm' }, { type: 'arm', value: 32, unit: 'cm', side: 'left' }], createdAt: stamp, voidedAt: null, replacesId: null, ...patch });
const macros = { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 };
const plan: ClientNutrition = { head: { id: 'p', name: { en: 'Plan', ar: 'الخطة' } }, version: { id: 'v', versionNo: 1, document: { schemaVersion: 1, targets: macros, supplements: [], allergens: [], meals: [{ id: 'm', name: { en: 'Lunch', ar: 'الغدا' }, options: [{ id: 'o', items: [{ id: 'i', foodId: 'f', quantity: 150, measure: { kind: 'g' }, approx: false }] }] }] } }, foods: [{ id: 'f', name: { en: 'Rice', ar: 'رز' }, slug: 'rice', aliases: [], category: 'grain', per100: macros, measures: [], source: 'db' }], localDate: '2026-11-17', timezone: 'Africa/Cairo', dayType: 'training', targets: macros };
const logs = (items: DailyLogs['items']): DailyLogs => ({ items, nextCursor: null, supplements: [], waterMl: 0, localDate: '2026-11-17' });

beforeEach(() => { live.status = 'ready'; live.userId = 'client-a'; live.numerals = 'latn'; for (const key of Object.keys(live.modules) as Array<keyof typeof live.modules>) live.modules[key] = true; });
describe('client-visible corrections', () => {
  it.each(['ar', 'en'] as const)('%s exposes named Edit/Remove controls and a settled 44px target', locale => {
    const text = messages(locale).clientCorrections;
    const html = render(locale, createElement(EntryActions, { kind: 'meal', id: 'a', createdAt: stamp, voidedAt: null, onEdit: noop, onChanged: noop }));
    expect(html).toContain(text.edit); expect(html).toContain(text.remove); expect(html).toContain('min-h-11'); settled(html);
  });
  it('hides all writes when the corresponding module is off', () => {
    live.modules.nutrition = false; live.modules.workouts = false; live.modules.measurements = false;
    for (const kind of ['meal', 'workout', 'measurement', 'metric'] as const) expect(render('en', createElement(EntryActions, { kind, id: 'a', createdAt: stamp, voidedAt: null, onEdit: noop, onChanged: noop }))).toBe('');
    expect(render('en', createElement(MealEditor, { row: meal(), plan: null, onClose: noop, onChanged: noop }))).toBe('');
    expect(render('en', createElement(MeasurementEditor, { row: measurements(), onClose: noop, onChanged: noop }))).toBe('');
  });
  it('queued unsaved rows say sync first and cannot be corrected', () => {
    const html = render('en', createElement(EntryActions, { kind: 'meal', id: '', createdAt: null, voidedAt: null, onEdit: noop, onChanged: noop }));
    expect(html).toContain(messages('en').clientCorrections.syncFirst); expect(html).not.toContain('<button'); settled(html);
  });
  it.each([null, 'invalid', '2020-01-01T00:00:00Z'])('does not authorize a timestamp of %s from localDate', createdAt => {
    const html = render('en', createElement(EntryActions, { kind: 'measurement', id: 'a', createdAt, voidedAt: null, onEdit: noop, onChanged: noop }));
    expect(html).toContain(messages('en').clientCorrections.unavailable); expect(html).not.toContain('<button');
  });
  it.each(['ar', 'en'] as const)('%s dialog keeps existing values and a named Save', locale => {
    const text = messages(locale).clientCorrections;
    const html = render(locale, createElement(MealEditor, { row: meal(), plan: null, onClose: noop, onChanged: noop }));
    expect(html).toContain('role="dialog"'); expect(html).toContain(text.meal.title); expect(html).toContain(text.meal.text); expect(html).toContain('My original meal'); expect(html).toContain(text.save); settled(html);
  });
  it('a removed planned option requires an explicit free-entry choice', () => {
    const html = render('en', createElement(MealEditor, { row: meal({ mealId: 'removed', optionId: 'old', freeEntry: null }), plan, onClose: noop, onChanged: noop }));
    expect(html).toContain(messages('en').clientCorrections.meal.removedPlan); expect(html).toContain(messages('en').clientCorrections.meal.useFreeEntry);
    expect(html).not.toContain('My original meal');
  });
  it.each(['latn', 'arab'] as const)('measurement editor preserves all pairs with %s numbering', numerals => {
    live.numerals = numerals;
    const html = render('ar', createElement(MeasurementEditor, { row: measurements(), onClose: noop, onChanged: noop }));
    expect(html).toContain('waist'); expect(html).toContain('arm'); expect(html).toContain(numerals === 'arab' ? '١' : '1'); settled(html);
  });
  it.each([0, Number.NaN])('rejects an invalid measurement value %s in visible validation', value => {
    const html = render('en', createElement(MeasurementEditor, { row: measurements({ values: [{ type: 'waist', value, unit: 'cm' }] }), onClose: noop, onChanged: noop }));
    expect(html).toContain(messages('en').clientCorrections.measurement.validation); expect(html).toContain('role="alert"');
  });
  it('rejects duplicate measurement pairs without losing either original field', () => {
    const html = render('en', createElement(MeasurementEditor, { row: measurements({ values: [{ type: 'waist', value: 82, unit: 'cm' }, { type: 'waist', value: 83, unit: 'cm' }] }), onClose: noop, onChanged: noop }));
    expect(html).toContain(messages('en').clientCorrections.measurement.validation); expect(html.match(/value="waist"/g)).toHaveLength(2);
  });
});
describe('quick log and retained history', () => {
  it.each(['ar', 'en'] as const)('%s settled empty and failure views retain a useful alternative/retry', locale => {
    const text = messages(locale).quickLog;
    const empty = render(locale, createElement(ClientQuickLog, { localDate: plan.localDate, plan: null, recent: [] }));
    expect(empty).toContain(text.emptyTitle); expect(empty).toContain(text.emptyBody); settled(empty);
    const failed = render(locale, createElement(ClientQuickLog, { localDate: plan.localDate, plan: null, recent: [], initialError: true }));
    expect(failed).toContain(text.loadFailed); expect(failed).toContain(text.retry); settled(failed);
  });
  it.each(['latn', 'arab'] as const)('labels a concrete known portion in Arabic using %s', numerals => {
    live.numerals = numerals;
    const html = render('ar', createElement(ClientQuickLog, { localDate: plan.localDate, plan, recent: [] }));
    expect(html).toContain('data-quick-log-key="planned:m:o"'); expect(html).toContain(numerals === 'arab' ? '١٥٠' : '150'); expect(html).toContain('رز'); settled(html);
  });
  it('module failures have retry and disabled nutrition exposes no shortcut rows', () => {
    live.status = 'error'; let html = render('en', createElement(ClientQuickLog, { localDate: plan.localDate, plan, recent: [] }));
    expect(html).toContain(messages('en').quickLog.moduleError); expect(html).toContain(messages('en').quickLog.retry);
    live.status = 'ready'; live.modules.nutrition = false;
    html = render('en', createElement(ClientQuickLog, { localDate: plan.localDate, plan, recent: [] })); expect(html).not.toContain('data-quick-log-key'); settled(html);
  });
  it.each(['ar', 'en'] as const)('%s retains original voided content and its replacement link', locale => {
    const html = render(locale, createElement(ClientNutritionHistory, { today: '2026-11-17', initial: logs([meal({ voidedAt: stamp }), meal({ id: 'replacement', replacesId: 'original', freeEntry: { text: 'My corrected meal' } })]), mealNames: {}, supplementNames: {} }));
    expect(html).toContain('My original meal'); expect(html).toContain('My corrected meal'); expect(html).toContain(messages(locale).clientCorrections.voided); expect(html).toContain('href="#meal-replacement"'); settled(html);
  });
  it('a voided planned log leaves current totals and statuses exactly as an unlogged plan', () => {
    const blank = render('en', createElement(ClientNutritionScreen, { plan, logs: logs([]) }));
    const voided = render('en', createElement(ClientNutritionScreen, { plan, logs: logs([meal({ mealId: 'm', optionId: 'o', voidedAt: stamp })]) }));
    // Form/control IDs can vary across render roots; text and counted nutrition must match.
    const text = (html: string) => html.replace(/<[^>]+>/g, ''); expect(text(voided)).toBe(text(blank)); settled(voided);
  });
  it('progress independently hides photos and measurements', () => {
    const props = { clientId: 'a', date: '2026-11-17', measurements: [], photos: [], cadence: null, onSaved: noop };
    live.modules.progress_photos = false;
    let html = render('en', createElement(ProgressPanel, props)); expect(html).toContain(messages('en').tracking.measurements.title); expect(html).not.toContain(messages('en').tracking.photos.title);
    live.modules.progress_photos = true; live.modules.measurements = false;
    html = render('en', createElement(ProgressPanel, props)); expect(html).not.toContain(messages('en').tracking.measurements.title); expect(html).toContain(messages('en').tracking.photos.title); settled(html);
  });
  it('latest weight omits voided values while scalar history remains readable', () => {
    const html = render('en', createElement(TrackingScreen, { clientId: 'a', mode: 'progress', today: '2026-11-17', timezone: 'Africa/Cairo', cadence: null, metrics: { items: [{ id: 'w', metric: 'weight', metricKey: null, value: 999, unit: 'kg', localDate: '2026-11-17', voidedAt: stamp }], nextCursor: null }, measurements: { items: [], nextCursor: null }, photos: { items: [], nextCursor: null } }));
    expect(html).toContain(messages('en').tracking.noWeights); expect(html).toContain('999'); expect(html).toContain(messages('en').clientCorrections.voided); settled(html);
  });
  it('a voided workout keeps performed sets readable and suppresses counted summary', () => {
    const detail: SessionDetail = { session: { id: 's', clientUuid: 'uuid', createdAt: stamp, programId: null, programVersionId: null, dayId: null, workoutId: null, plannedWorkout: null, state: 'completed', localDate: '2026-11-17', timezone: 'Africa/Cairo', startedAt: null, endedAt: null, activeSeconds: 30, clientUpdatedAt: null, rpeOverall: null, mood: null, painNote: null, clientNote: null, summary: null, voidedAt: stamp }, sets: [{ id: 'set', clientUuid: 'setuuid', sessionClientUuid: 'uuid', clientUpdatedAt: stamp, exerciseId: 'exercise', setNo: 1, tag: 'working', completed: true, skipped: false, painFlag: false, reps: 8, load: 20, loadUnit: 'kg', note: 'Historical set remains readable' }], lastComparable: null, exercises: [], unit: 'kg' };
    const html = render('en', createElement(HistoryDetail, { detail })); expect(html).toContain('Historical set remains readable'); expect(html).toContain(messages('en').clientCorrections.notCounted); settled(html);
  });
});
