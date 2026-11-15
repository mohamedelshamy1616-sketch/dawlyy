import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ar from '../../../messages/ar/activity.json';
import en from '../../../messages/en/activity.json';
import type { ActivityItem } from './types';
import type { ActivityState } from './presentation';

const ui = vi.hoisted(() => ({ locale: 'en' as 'ar' | 'en', push: vi.fn() }));
type MockProps = Record<string, unknown> & { children?: ReactNode; label?: ReactNode; description?: ReactNode };
function box(tag: string, props: MockProps) {
  const dom = Object.fromEntries(Object.entries(props).filter(([key]) => key === 'className' || key === 'role' || key === 'dir' || key.startsWith('aria-') || key.startsWith('data-')));
  return createElement(typeof props.as === 'string' ? props.as : tag, dom, props.children);
}
function translator(key: string, values: Record<string, unknown> = {}) {
  let text: unknown = ui.locale === 'ar' ? ar : en;
  for (const part of key.split('.')) text = (text as Record<string, unknown>)[part];
  if (typeof text !== 'string') throw new Error(`Missing message ${key}`);
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}
vi.mock('next-intl', () => ({ useLocale: () => ui.locale, useTranslations: () => translator }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push: ui.push, refresh: vi.fn() }) }));
vi.mock('@astryxdesign/core/VStack', () => ({ VStack: (props: MockProps) => box('section', props) }));
vi.mock('@astryxdesign/core/HStack', () => ({ HStack: (props: MockProps) => box('section', props) }));
vi.mock('@astryxdesign/core/Heading', () => ({ Heading: (props: MockProps) => box(`h${props.level ?? 2}`, props) }));
vi.mock('@astryxdesign/core/Text', () => ({ Text: (props: MockProps) => box('p', props) }));
vi.mock('@astryxdesign/core/Button', () => ({ Button: (props: MockProps) => createElement(props.href ? 'a' : 'button', { href: props.href as string | undefined, disabled: props.isDisabled as boolean | undefined, type: props.type as 'button' | 'submit' | undefined, 'aria-busy': props.isLoading ? true : undefined }, props.label) }));
vi.mock('@astryxdesign/core/List', () => ({
  List: (props: MockProps) => box('ul', props),
  ListItem: (props: MockProps) => createElement('li', { 'data-activity-id': props['data-activity-id'] as string | undefined }, props.label, props.description, props.endContent as ReactNode),
}));
vi.mock('@astryxdesign/core/Selector', () => ({ Selector: (props: MockProps) => createElement('select', { 'aria-label': props.label as string }, (props.options as { value: string; label: string }[]).map(option => createElement('option', { key: option.value, value: option.value }, option.label))) }));
vi.mock('@astryxdesign/core/TextArea', () => ({ TextArea: (props: MockProps) => createElement('label', {}, props.label, createElement('textarea', { defaultValue: props.value as string }), props.description) }));

import { ActivityForbidden, ActivityLoading, ActivityLog, ActivityLogView, ActivityScreen } from '../../../components/activity/activity-log';
import { submitVersionRevert, VersionDetail, type VersionDetailData } from '../../../components/activity/version-detail';

const id = '11111111-1111-4111-8111-111111111111';
const row: ActivityItem = {
  id: '9007199254740993', createdAt: '2026-11-14T23:30:00.123456Z', clientId: id,
  actor: { userId: id, displayName: 'Coach <safe>', role: 'owner' },
  action: 'archive', entity: 'clients', entityId: id, href: `/coach/clients/${id}`, version: null,
};
const state = (items: ActivityItem[] = [row]): ActivityState => ({ scope: '|', items, nextCursor: null, loading: false, append: false, error: null });
const environment = { timezone: 'Africa/Cairo', preferences: {}, role: 'owner' as const };
const formVersion: VersionDetailData = {
  kind: 'form', headId: id, formKind: 'checkin', name: { en: 'Check-in', ar: 'متابعة' }, canRevert: true,
  version: { versionNo: 12, status: 'published', createdAt: '2026-11-10T12:00:00Z', publishedAt: '2026-11-10T12:00:00Z', document: { schemaVersion: 1, sections: [{ id: 's', title: { en: 'Recovery', ar: 'الاستشفاء' }, questions: [] }] } },
};

afterEach(() => { ui.locale = 'en'; vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('R3b activity components in the Node environment', () => {
  it.each(['ar', 'en'] as const)('renders matching %s actions, escaped actor, tenant time and item link', locale => {
    ui.locale = locale;
    const markup = renderToStaticMarkup(createElement(ActivityLogView, { state: state(), environment }));
    const messages = locale === 'ar' ? ar : en;
    expect(markup).toContain(messages.actions.archive);
    expect(markup).toContain('Coach &lt;safe&gt;');
    expect(markup).toContain('dateTime="2026-11-14T23:30:00.123456Z"');
    expect(markup).toContain(`href="/coach/clients/${id}"`);
    expect(markup).toContain('15');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toMatch(/skeleton/i);
  });
  it('shows initial loading as a live status and settled empty without a skeleton', () => {
    expect(renderToStaticMarkup(createElement(ActivityLoading))).toContain('role="status"');
    const empty = renderToStaticMarkup(createElement(ActivityLogView, { state: state([]), environment }));
    expect(empty).toContain(en.empty);
    expect(empty).not.toContain('aria-busy="true"');
    expect(empty).not.toMatch(/skeleton/i);
    expect(renderToStaticMarkup(createElement(ActivityLogView, { state: state([]), environment, entity: 'clients' }))).toContain(en.filteredEmpty);
  });
  it('shows localized actor fallback, generic unknown action, unavailable item and forbidden state', () => {
    const markup = renderToStaticMarkup(createElement(ActivityLogView, { state: state([{ ...row, actor: { userId: id, displayName: null, role: 'staff' }, href: null, action: '<script>archive</script>' }]), environment }));
    expect(markup).toContain(en.roles.staff); expect(markup).toContain(en.actions.update);
    expect(markup).toContain(en.itemUnavailable); expect(markup).not.toContain('&lt;script&gt;');
    expect(renderToStaticMarkup(createElement(ActivityForbidden))).toContain(en.forbidden);
  });
  it('keeps loaded rows and provides Retry after failed pagination', () => {
    const markup = renderToStaticMarkup(createElement(ActivityLogView, { state: { ...state(), append: true, nextCursor: 'retry-key', error: 'requestFailed' }, environment }));
    expect(markup).toContain('Coach &lt;safe&gt;'); expect(markup).toContain(en.retry);
    expect(markup).toContain('role="alert"'); expect(markup).not.toContain('aria-busy="true"');
  });
  it('labels the staff-wide scope as accessible clients rather than all business activity', () => {
    const markup = renderToStaticMarkup(createElement(ActivityScreen, { initial: { items: [], nextCursor: null }, ...environment, role: 'staff' }));
    expect(markup).toContain(en.staffScope); expect(markup).not.toContain(en.ownerScope);
  });
  it('offers version review actions independently of edit permission', () => {
    const version = { kind: 'program' as const, headId: id, versionNo: 12, href: `/coach/settings/activity/version/program/${id}/12`, canRevert: true };
    const editable = renderToStaticMarkup(createElement(ActivityLogView, { state: state([{ ...row, version }]), environment }));
    expect(editable).toContain(en.revertLink); expect(editable).toContain(version.href);
    const readOnly = renderToStaticMarkup(createElement(ActivityLogView, { state: state([{ ...row, version: { ...version, canRevert: false } }]), environment }));
    expect(readOnly).toContain(en.viewVersion); expect(readOnly).not.toContain(en.revertLink);
  });
  it.each(['ar', 'en'] as const)('shows explicit %s draft confirmation and never mutates on version render', locale => {
    ui.locale = locale; const request = vi.fn(); vi.stubGlobal('fetch', request);
    const markup = renderToStaticMarkup(createElement(VersionDetail, { data: formVersion, ...environment }));
    const messages = locale === 'ar' ? ar : en;
    expect(markup).toContain(messages.confirmRevert); expect(markup).toContain(messages.confirmDescription);
    expect(markup).toContain(messages.immutableNotice); expect(markup).toContain(`href="/coach/checkins/${id}"`);
    expect(markup).not.toContain('aria-busy="true"'); expect(request).not.toHaveBeenCalled();
  });
  it('does not offer confirmation without source edit permission or an unsupported custom builder', () => {
    for (const data of [{ ...formVersion, canRevert: false }, { ...formVersion, formKind: 'custom' as const }]) {
      const markup = renderToStaticMarkup(createElement(VersionDetail, { data, ...environment }));
      expect(markup).not.toContain(en.confirmRevert);
    }
  });
  it.each(['program', 'nutrition', 'form'] as const)('posts strict existing %s revert body only on explicit action and retains supplied retry key', async kind => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 201 })));
    const path = kind === 'program' ? 'programs' : kind === 'nutrition' ? 'nutrition' : 'forms';
    await submitVersionRevert(kind, id, 12, ' reason ', 'same-intended-action', request);
    await submitVersionRevert(kind, id, 12, ' reason ', 'same-intended-action', request);
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, options] of request.mock.calls) {
      expect(url).toBe(`/api/v1/${path}/${id}/revert`);
      expect(options.method).toBe('POST');
      expect(options.headers['Idempotency-Key']).toBe('same-intended-action');
      expect(JSON.parse(options.body)).toEqual({ toVersionNo: 12, changeNote: 'reason' });
    }
  });
  it('keeps a mutable draft preview distinct from a frozen published snapshot', () => {
    const draft = { ...formVersion, version: { ...formVersion.version, status: 'draft' as const, publishedAt: null } };
    const markup = renderToStaticMarkup(createElement(VersionDetail, { data: draft, ...environment }));
    expect(markup).toContain(en.draftPreviewNotice);
    expect(markup).not.toContain(en.immutableNotice);
  });
  it('uses accessible-activity scope until the caller role is supplied', () => {
    const markup = renderToStaticMarkup(createElement(ActivityLog));
    expect(markup).toContain(en.staffScope);
    expect(markup).not.toContain(en.ownerScope);
  });
  it.each(['ar', 'en'] as const)('renders typed %s program and nutrition previews with explicit numeral policy', locale => {
    ui.locale = locale;
    const program: VersionDetailData = { kind: 'program', headId: id, name: { en: 'Strength', ar: 'Strength' }, canRevert: true,
      version: { versionNo: 12, status: 'published', createdAt: '2026-11-10T12:00:00Z', publishedAt: '2026-11-10T12:00:00Z', document: { schemaVersion: 1, phases: [], notes: { en: '<original note>', ar: '<original note>' } } } };
    const nutrition: VersionDetailData = { kind: 'nutrition', headId: id, name: { en: 'Nutrition', ar: 'Nutrition' }, canRevert: false,
      version: { ...program.version, document: { schemaVersion: 1, targets: { kcal: 2200, proteinG: 160, carbsG: 200, fatG: 70 }, meals: [], supplements: [], allergens: [] } } };
    const programMarkup = renderToStaticMarkup(createElement(VersionDetail, { data: program, ...environment }));
    const nutritionMarkup = renderToStaticMarkup(createElement(VersionDetail, { data: nutrition, ...environment }));
    expect(programMarkup).toContain('&lt;original note&gt;');
    expect(programMarkup).toContain(`/coach/programs/${id}/history`);
    expect(nutritionMarkup).toContain(`/coach/nutrition/${id}/history`);
    expect(nutritionMarkup).toContain('160');
    expect(nutritionMarkup).not.toMatch(/[\u0660-\u0669]/);
  });
  it('refuses unsafe version head IDs and accepts only the existing 201 draft response', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(submitVersionRevert('program', 'https://example.com', 12, '', 'action', request)).rejects.toMatchObject({ status: 400 });
    await expect(submitVersionRevert('program', id, 12, '', 'action', request)).rejects.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps server rejection visible and does not treat a non-201 response as a fresh draft', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'forbidden', message: 'private text' } }), { status: 403 }));
    await expect(submitVersionRevert('program', id, 12, '', 'one-action', request)).rejects.toMatchObject({ status: 403 });
    await expect(submitVersionRevert('form', id, 12, 'x'.repeat(2001), 'one-action', request)).rejects.toMatchObject({ status: 400 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
