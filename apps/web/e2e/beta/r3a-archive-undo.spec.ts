import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { api, browserHealth, devLogin, mutation, visit, type Locale } from './helpers';

// R3a. Written now, run in P9 only. Public demo owner, as in beta-gate.spec.ts; every row below is created for this run.
const OWNER = 'd0250000-0000-4000-8000-000000000101';
const sizes = [{ width: 360, height: 780 }, { width: 390, height: 844 }, { width: 430, height: 932 }];

/** The two R3a namespaces are not in helpers.labels(), so load them here with the same ICU formatting as next-intl. */
function catalog(locale: Locale, namespace: 'archiveControls' | 'controlUndo' | 'calendar') {
  const file: unknown = JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${namespace}.json`), 'utf8'));
  return (path: string, values: Record<string, string | number> = {}): string => {
    let value: unknown = file;
    for (const key of path.split('.')) value = (value as Record<string, unknown>)[key];
    if (typeof value !== 'string') throw new Error(`Missing ${locale} ${namespace} key: ${path}`);
    return createTranslator({ locale, messages: { label: value }, onError: error => { throw error; } })('label', values);
  };
}

for (const locale of ['ar', 'en'] as const satisfies readonly Locale[]) {
  test.describe(`r3a archive undo @${locale}`, () => {
    test.describe.configure({ mode: 'serial' });
    let context: BrowserContext;
    let owner: Page;
    let health: () => Promise<void>;
    let t: ReturnType<typeof catalog>;
    let u: ReturnType<typeof catalog>;
    let cal: ReturnType<typeof catalog>;
    const runId = `${locale}-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const names = { main: `R3a ${runId} main`, second: `R3a ${runId} second`, third: `R3a ${runId} third`, program: `R3a ${runId} program` };
    const ids: Record<string, string> = {};

    test.beforeAll(async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use playwright.e2e.config.ts with its local baseURL.');
      t = catalog(locale, 'archiveControls'); u = catalog(locale, 'controlUndo'); cal = catalog(locale, 'calendar');
      context = await browser.newContext({ baseURL, viewport: sizes[1], locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo', reducedMotion: 'reduce' });
      context.setDefaultTimeout(60_000); context.setDefaultNavigationTimeout(240_000);
      health = browserHealth(context, locale);
      owner = await context.newPage();
      await devLogin(context, OWNER, locale);
      for (const key of ['main', 'second', 'third'] as const) {
        ids[key] = (await api<{ id: string }>(owner, 'POST', '/clients', 201, { firstName: names[key], displayName: names[key], locale })).id;
      }
      const program = await api<{ head: { id: string } }>(owner, 'POST', '/programs', 201, { name: { ar: names.program, en: names.program } });
      ids.program = program.head.id;
    });
    test.afterEach(async () => { await health?.(); });
    test.afterAll(async () => { await context?.close(); });

    const toast = () => owner.locator('[data-undo-toast]');
    const row = (name: string) => owner.getByRole('main').getByRole('article').filter({ hasText: name });
    // In English the client list also has a status filter named "Active", so scope to the archive filter's own group (ArchivedFilter, aria-label "filterLabel").
    const filterGroup = () => owner.getByRole('main').getByRole('group', { name: t('filterLabel'), exact: true });
    const rowButton = (name: string, key: 'archiveItem' | 'restoreItem') => owner.getByRole('button', { name: t(key, { name }), exact: true });
    async function noHorizontalOverflow() {
      for (const size of sizes) {
        await owner.setViewportSize(size);
        await expect.poll(() => owner.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), { message: `No horizontal overflow at ${size.width}px` }).toBeLessThanOrEqual(1);
      }
      await owner.setViewportSize(sizes[1]!);
    }
    async function settled() {
      await expect(owner.locator('[aria-busy="true"]')).toHaveCount(0);
    }

    test('coach: archive, then undo, then archived filter, then restore', async () => {
      const name = names.main; const id = ids.main!;
      await visit(owner, locale, `/coach/clients?q=${encodeURIComponent(name)}`);
      await expect(row(name)).toHaveCount(1);

      await mutation(owner, 'POST', `/clients/${id}/archive`, 200, () => rowButton(name, 'archiveItem').click());
      await expect(row(name)).toHaveCount(0);
      await expect(toast()).toHaveCount(1);
      await expect(toast()).toContainText(t('toast.archivedClient', { name }));
      await noHorizontalOverflow();

      // Undo inside the 6 s window: the inverse call, and the client is back as inactive (the restore always lands there).
      await mutation(owner, 'POST', `/clients/${id}/unarchive`, 200, () => toast().getByRole('button', { name: u('undo') }).click());
      await expect(row(name)).toHaveCount(1);
      await expect(toast()).toHaveCount(0);

      await mutation(owner, 'POST', `/clients/${id}/archive`, 200, () => rowButton(name, 'archiveItem').click());
      await expect(row(name)).toHaveCount(0);

      // Archived-only filter: the client is listed there, not in the active list.
      // The filter is a link (URL-backed). The toast is not asserted here: its 6 s window may already have closed.
      await filterGroup().getByRole('link', { name: t('archivedFilter'), exact: true }).click();
      await expect(owner).toHaveURL(url => url.searchParams.get('archived') === 'true');
      await expect(row(name)).toHaveCount(1);
      await noHorizontalOverflow();

      await mutation(owner, 'POST', `/clients/${id}/unarchive`, 200, () => rowButton(name, 'restoreItem').click());
      await expect(row(name)).toHaveCount(0);
      await filterGroup().getByRole('link', { name: t('activeFilter'), exact: true }).click();
      await expect(row(name)).toHaveCount(1);

      // History is preserved: the same client record, restored as inactive, never deleted.
      const detail = await api<{ id: string; status: string }>(owner, 'GET', `/clients/${id}`);
      expect(detail).toMatchObject({ id, status: 'inactive' });
      await settled();
    });

    test('library: a program archives, undoes, appears under the hub Archived link, and restores', async () => {
      const name = names.program; const id = ids.program!;
      await visit(owner, locale, '/coach/programs?kind=template');
      const card = owner.getByRole('main').getByRole('link', { name, exact: true });
      await expect(card).toHaveCount(1);
      await mutation(owner, 'POST', `/programs/${id}/archive`, 200, () => owner.getByRole('button', { name: t('archiveItem', { name }), exact: true }).click());
      await expect(card).toHaveCount(0);
      await expect(toast()).toHaveCount(1);
      await mutation(owner, 'POST', `/programs/${id}/unarchive`, 200, () => toast().getByRole('button', { name: u('undo') }).click());
      await expect(card).toHaveCount(1);
      await mutation(owner, 'POST', `/programs/${id}/archive`, 200, () => owner.getByRole('button', { name: t('archiveItem', { name }), exact: true }).click());
      await visit(owner, locale, '/coach/programs?kind=template&archived=true');
      await expect(card).toHaveCount(1);
      await mutation(owner, 'POST', `/programs/${id}/unarchive`, 200, () => owner.getByRole('button', { name: t('restoreItem', { name }), exact: true }).click());
      await expect(card).toHaveCount(0);
      await settled(); await noHorizontalOverflow();
    });

    test('calendar: cancelling an event offers Undo, and a cancelled event offers Restore', async () => {
      const title = `R3a ${runId} event`;
      // A moment from now. The agenda lists 100 events a page, oldest first (Task 8), and reloads from page one after each
      // action, so the test narrows it to the one client first, as a coach with a busy month would.
      const dueAt = new Date(Date.now() + 60_000).toISOString();
      const event = await api<{ id: string }>(owner, 'POST', '/calendar', 201, { clientId: ids.second, type: 'custom', title: { ar: title, en: title }, dueAt, timezone: 'Africa/Cairo', windowDays: 1 });
      await visit(owner, locale, '/coach/calendar');
      // The Undo window is 6 s: a one-row list keeps the click, the toast and Undo inside it even on a busy machine.
      await owner.getByRole('combobox', { name: cal('filters.client'), exact: true }).first().click(); // the filter row comes before the add-event form's own client selector
      await owner.getByRole('option', { name: names.second, exact: true }).click();
      await owner.getByRole('button', { name: cal('actions.apply'), exact: true }).click();
      const cancel = owner.getByRole('button', { name: t('cancelEventItem', { name: title }), exact: true });
      await expect(cancel).toHaveCount(1);
      await mutation(owner, 'POST', `/calendar/${event.id}/cancel`, 200, () => cancel.click());
      await expect(toast()).toHaveCount(1);
      await mutation(owner, 'POST', `/calendar/${event.id}/restore`, 200, () => toast().getByRole('button', { name: u('undo') }).click());
      await expect(cancel).toHaveCount(1);
      await mutation(owner, 'POST', `/calendar/${event.id}/cancel`, 200, () => cancel.click());
      const restore = owner.getByRole('button', { name: t('restoreEventItem', { name: title }), exact: true });
      await expect(restore).toHaveCount(1);
      await mutation(owner, 'POST', `/calendar/${event.id}/restore`, 200, () => restore.click());
      await expect(cancel).toHaveCount(1);
      await settled(); await noHorizontalOverflow();
    });

    test('bulk: a partial result is reported as partial and Undo reverses only the rows that changed', async ({ browser, baseURL }) => {
      // Own context without the health observer: the refused request below legitimately logs a failed-resource console error.
      const bulkContext = await browser.newContext({ baseURL: baseURL!, viewport: sizes[1], locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo', reducedMotion: 'reduce' });
      bulkContext.setDefaultTimeout(60_000); bulkContext.setDefaultNavigationTimeout(240_000);
      await devLogin(bulkContext, OWNER, locale);
      const owner = await bulkContext.newPage();
      try {
      const [second, third] = [ids.second!, ids.third!];
      // One selected row is refused by the server (403) without touching any data.
      const refused = async (route: Route) => { await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'forbidden', message: 'refused' } }) }); };
      await owner.route(`**/api/v1/clients/${third}/archive`, refused);
      const reversed: string[] = [];
      owner.on('request', request => { if (request.method() === 'POST' && /\/api\/v1\/clients\/[^/]+\/unarchive$/.test(request.url())) reversed.push(request.url()); });
      await visit(owner, locale, `/coach/clients?q=${encodeURIComponent(`R3a ${runId}`)}`);
      await owner.getByRole('checkbox', { name: t('bulk.selectRow', { name: names.second }), exact: true }).check();
      await owner.getByRole('checkbox', { name: t('bulk.selectRow', { name: names.third }), exact: true }).check();
      await owner.getByRole('button', { name: t('bulk.archiveSelected'), exact: true }).click();
      await expect(owner.getByRole('status').filter({ hasText: names.third })).toContainText(t('bulk.result.partial', { changed: 1, failed: 1 }));
      await expect(owner.getByRole('button', { name: t('bulk.retry'), exact: true })).toHaveCount(1);
      await expect(owner.locator('[data-undo-toast]')).toHaveCount(1);
      await owner.getByRole('button', { name: u('undo'), exact: true }).click();
      await expect.poll(() => reversed.length).toBe(1);
      expect(reversed[0]).toContain(`/clients/${second}/unarchive`);
      expect(reversed.some(url => url.includes(third))).toBe(false);
      await owner.unroute(`**/api/v1/clients/${third}/archive`);
      await expect(owner.locator('[aria-busy="true"]')).toHaveCount(0);
      } finally { await bulkContext.close(); }
    });
  });
}