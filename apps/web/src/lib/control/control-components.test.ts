import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedEmpty, ArchivedFilter, ArchiveRowControl, CancelEventControl, HideRowControl } from '@/components/control/archive-controls';
import { BulkBar, BulkResultView, BulkRowCheckbox, BulkSelectAll } from '@/components/control/bulk-actions';
import { UndoToast, UndoToastView } from '@/components/control/undo-toast';
import type { BulkItem, BulkReceipt } from '@/src/lib/control/bulk-actions';
import { createUndoStore } from './undo-store';

vi.mock('@/i18n/navigation', async () => {
  const { createElement: h } = await import('react');
  return {
    useRouter: () => ({ refresh: () => undefined, push: () => undefined, replace: () => undefined }),
    Link: (props: { href: string; className?: string; children?: ReactNode }) => h('a', { href: props.href, className: props.className }, props.children),
  };
});

type Locale = 'ar' | 'en';
const messages = (locale: Locale) => Object.fromEntries(['archiveControls', 'controlUndo'].map(name => [name, JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${name}.json`), 'utf8')) as unknown]));
const render = (locale: Locale, element: ReactElement) => renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: messages(locale) as never, children: element }));
const NAME: Record<Locale, string> = { en: 'Sara Ahmed', ar: 'سارة أحمد' };
const LONG = 'A very long client name that keeps going '.repeat(5).trim();
const gate = () => new Promise<void>(() => undefined);

describe('row controls', () => {
  it.each(['en', 'ar'] as const)('%s: Archive and Restore carry the item in the accessible name and a 44 px target', locale => {
    const archive = render(locale, createElement(ArchiveRowControl, { entity: 'programs', id: 'p1', archived: false, canEdit: true, itemLabel: NAME[locale] }));
    const restore = render(locale, createElement(ArchiveRowControl, { entity: 'programs', id: 'p1', archived: true, canEdit: true, itemLabel: NAME[locale] }));
    const t = messages(locale).archiveControls as { archiveItem: string; restoreItem: string; archive: string; restore: string };
    expect(archive).toContain(`aria-label="${t.archiveItem.replace('{name}', NAME[locale])}"`);
    expect(archive).toContain(t.archive);
    expect(restore).toContain(`aria-label="${t.restoreItem.replace('{name}', NAME[locale])}"`);
    expect(restore).toContain(t.restore);
    expect(archive).toContain('min-h-11');
    expect(archive).not.toContain(t.restoreItem.replace('{name}', NAME[locale]));
  });

  it('renders nothing for a coach without the edit grant', () => {
    for (const element of [
      createElement(ArchiveRowControl, { entity: 'clients', id: 'c1', archived: false, canEdit: false, itemLabel: 'x' }),
      createElement(HideRowControl, { kind: 'foods', id: 'f1', hidden: false, canEdit: false, itemLabel: 'x' }),
      createElement(CancelEventControl, { id: 'e1', cancelled: false, canEdit: false, itemLabel: 'x' }),
    ]) expect(render('en', element)).toBe('');
  });

  it('keeps Hide and Unhide for foods and shared exercises, and Cancel and Restore for events, with distinct wording', () => {
    const hide = render('en', createElement(HideRowControl, { kind: 'exercises', id: 'x1', hidden: false, canEdit: true, itemLabel: 'Squat' }));
    const unhide = render('en', createElement(HideRowControl, { kind: 'foods', id: 'f1', hidden: true, canEdit: true, itemLabel: 'Rice' }));
    const cancel = render('en', createElement(CancelEventControl, { id: 'e1', cancelled: false, canEdit: true, itemLabel: 'Check-in' }));
    const restore = render('en', createElement(CancelEventControl, { id: 'e1', cancelled: true, canEdit: true, itemLabel: 'Check-in' }));
    expect(hide).toContain('aria-label="Hide Squat"'); expect(unhide).toContain('aria-label="Unhide Rice"');
    expect(cancel).toContain('aria-label="Cancel Check-in"'); expect(restore).toContain('aria-label="Restore Check-in"');
    expect(hide).not.toContain('Archive');
  });

  it('keeps a very long label inside its own name and wraps rather than overflows', () => {
    const html = render('en', createElement(ArchiveRowControl, { entity: 'clients', id: 'c1', archived: false, canEdit: true, itemLabel: LONG }));
    expect(html).toContain(LONG);
    expect(html).toContain('min-w-0');
  });
});

describe('archived filter and empty states', () => {
  it.each(['en', 'ar'] as const)('%s: marks the current view with aria-current on links and links to both views', locale => {
    const t = messages(locale).archiveControls as { activeFilter: string; archivedFilter: string };
    const html = render(locale, createElement(ArchivedFilter, { archived: true, hrefFor: value => `/coach/packages${value ? '?archived=true' : ''}` }));
    expect(html).toContain(t.activeFilter); expect(html).toContain(t.archivedFilter);
    expect(html).toContain('href="/coach/packages?archived=true"'); expect(html).toContain('href="/coach/packages"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('min-h-11');
    const pressed = render(locale, createElement(ArchivedFilter, { archived: false, onSelect: () => undefined }));
    expect(pressed.match(/aria-pressed="true"/g)).toHaveLength(1); expect(pressed.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(pressed).not.toContain('aria-current');
  });
  it('uses Hidden wording for foods and explains an empty archived list in both locales', () => {
    expect(render('en', createElement(ArchivedFilter, { archived: false, hidden: true, onSelect: () => undefined }))).toContain('Hidden');
    expect(render('en', createElement(ArchivedEmpty))).toContain('Nothing is archived');
    expect(render('ar', createElement(ArchivedEmpty))).toContain('مفيش حاجة مؤرشفة');
    expect(render('en', createElement(ArchivedEmpty, { hidden: true }))).toContain('Nothing is hidden');
  });
});

describe('undo toast', () => {
  async function snapshotAt(setup: (store: ReturnType<typeof createUndoStore>) => Promise<void>) {
    const store = createUndoStore(); await setup(store); return store;
  }
  it('renders nothing but a live region on the server, where the snapshot is null', () => {
    const html = render('en', createElement(UndoToast));
    expect(html).toContain('role="status"'); expect(html).not.toContain('data-undo-toast');
  });
  it.each(['en', 'ar'] as const)('%s: an undoable action shows its label, Undo and Close in one toast', async locale => {
    const t = messages(locale).controlUndo as { undo: string; close: string };
    const store = await snapshotAt(async s => { void s.run({ mode: 'immediate', label: `${NAME[locale]} done`, commit: async () => 1, rollback: async () => undefined }); await Promise.resolve(); await Promise.resolve(); });
    const html = render(locale, createElement(UndoToastView, { state: store.getSnapshot(), onUndo: () => undefined, onClose: () => undefined }));
    expect(html).toContain(`${NAME[locale]} done`); expect(html).toContain(t.undo); expect(html).toContain(t.close);
    expect(html.match(/data-undo-toast/g)).toHaveLength(1); expect(html).toContain('min-h-11'); expect(html).toContain('data-phase="undoable"');
    expect(html).toContain('break-words');
  });
  it('shows no Undo while the commit is still running', async () => {
    const store = await snapshotAt(async s => { void s.run({ mode: 'immediate', label: 'x', commit: gate, rollback: async () => undefined }); await Promise.resolve(); });
    const html = render('en', createElement(UndoToastView, { state: store.getSnapshot(), onUndo: () => undefined, onClose: () => undefined }));
    expect(html).toContain('data-phase="executing"'); expect(html).toContain('Working'); expect(html).not.toContain('>Undo<');
  });
  it('shows Retry undo, not "restored", after a rollback failed', async () => {
    const store = await snapshotAt(async s => { void s.run({ mode: 'immediate', label: 'Sara archived', commit: async () => 1, rollback: async () => { throw new Error('offline'); } }); await Promise.resolve(); await Promise.resolve(); await s.undo(); });
    const snapshot = store.getSnapshot();
    expect(snapshot?.phase).toBe('failed');
    const html = render('en', createElement(UndoToastView, { state: snapshot, onUndo: () => undefined, onClose: () => undefined }));
    expect(html).toContain('Retry undo'); expect(html).toContain('Could not undo: Sara archived'); expect(html).toContain('still in place'); expect(html).not.toMatch(/restored/i);
  });
  it('labels a deferred action Done instead of Close', async () => {
    const store = await snapshotAt(async s => { void s.run({ mode: 'deferred', label: 'Payment voided', commit: async () => 1 }); });
    const html = render('en', createElement(UndoToastView, { state: store.getSnapshot(), onUndo: () => undefined, onClose: () => undefined }));
    expect(html).toContain('Done'); expect(html).toContain('>Undo<');
    store.pagehide();
  });
});

describe('bulk controls', () => {
  const items: BulkItem[] = [{ id: 'a', name: 'Alia', archived: false }, { id: 'b', name: LONG, archived: false }, { id: 'c', name: 'Chadia', archived: false, canEdit: false }];
  it('renders nothing without a selection and the selected count with it', () => {
    expect(render('en', createElement(BulkBar, { entity: 'clients', items, selected: new Set<string>(), archivedView: false, onSelectionChange: () => undefined, onChanged: () => undefined }))).toBe('');
    const html = render('en', createElement(BulkBar, { entity: 'clients', items, selected: new Set(['a', 'b']), archivedView: false, onSelectionChange: () => undefined, onChanged: () => undefined, numerals: 'latn' }));
    expect(html).toContain('Selected: 2'); expect(html).toContain('Archive selected'); expect(html).toContain('Clear selection'); expect(html).toContain('Only the rows loaded on this page');
    expect(html).not.toContain('all clients');
  });
  it('uses the saved numeral policy for counts and Restore wording in the archived view', () => {
    const arab = render('ar', createElement(BulkBar, { entity: 'clients', items, selected: new Set(['a', 'b', 'c']), archivedView: true, onSelectionChange: () => undefined, onChanged: () => undefined, numerals: 'arab' }));
    const latn = render('ar', createElement(BulkBar, { entity: 'clients', items, selected: new Set(['a', 'b', 'c']), archivedView: true, onSelectionChange: () => undefined, onChanged: () => undefined, numerals: 'latn' }));
    expect(arab).toContain('٣'); expect(arab).toContain('استرجاع المحدد');
    expect(latn).toContain('3'); expect(latn).not.toContain('٣');
    expect(render('en', createElement(BulkBar, { entity: 'clients', items, selected: new Set(['a']), archivedView: true, onSelectionChange: () => undefined, onChanged: () => undefined }))).toContain('Restore selected');
  });
  it('disables the header checkbox with no eligible rows and a row without permission', () => {
    const input = (html: string) => html.match(/<input[^>]*>/)?.[0] ?? '';
    // Astryx marks a disabled checkbox with aria-disabled="true" and keeps it focusable; there is no disabled attribute.
    const isDisabled = (tag: string) => /\saria-disabled="true"/.test(tag);
    const isChecked = (tag: string) => /\schecked(?:=""|\s|\/|>)/.test(tag);
    expect(isDisabled(input(render('en', createElement(BulkSelectAll, { items: [items[2]!], selected: new Set<string>(), onChange: () => undefined }))))).toBe(true);
    expect(isDisabled(input(render('en', createElement(BulkSelectAll, { items: [items[0]!], selected: new Set<string>(), onChange: () => undefined }))))).toBe(false);
    expect(isDisabled(input(render('en', createElement(BulkRowCheckbox, { item: items[2]!, selected: false, onToggle: () => undefined }))))).toBe(true);
    const enabled = render('en', createElement(BulkRowCheckbox, { item: items[0]!, selected: true, onToggle: () => undefined }));
    const unchecked = render('en', createElement(BulkRowCheckbox, { item: items[0]!, selected: false, onToggle: () => undefined }));
    expect(enabled).toContain('Select Alia'); expect(isChecked(input(enabled))).toBe(true); expect(isDisabled(input(enabled))).toBe(false);
    expect(isChecked(input(unchecked))).toBe(false);
  });
  it.each(['en', 'ar'] as const)('%s: a partial result reads as partial, names what failed and offers a retry', locale => {
    const receipt: BulkReceipt = { op: 'archive', changed: [items[0]!], skipped: [], blocked: [items[2]!], keys: {},
      failures: [{ item: items[1]!, error: new Error('x'), kind: 'forbidden' }] };
    const html = render(locale, createElement(BulkResultView, { receipt, busy: false, numerals: 'latn', onRetry: () => undefined, onDismiss: () => undefined }));
    const t = messages(locale).archiveControls as { bulk: { result: { partial: string }; retry: string } };
    expect(html).toContain(t.bulk.result.partial.replace('{changed}', '1').replace('{failed}', '1'));
    expect(html).toContain(LONG); expect(html).toContain(t.bulk.retry); expect(html).toContain('break-words');
    expect(html).not.toContain(t.bulk.result.partial.replace('{changed}', '2').replace('{failed}', '0'));
  });
  it('shows an all-success result without a failure list', () => {
    const receipt: BulkReceipt = { op: 'restore', changed: items.slice(0, 2), skipped: [], blocked: [], failures: [], keys: {} };
    const html = render('en', createElement(BulkResultView, { receipt, busy: false, onRetry: () => undefined, onDismiss: () => undefined }));
    expect(html).toContain('2 done.'); expect(html).not.toContain('Not changed'); expect(html).not.toContain('Retry the failed ones');
  });
});