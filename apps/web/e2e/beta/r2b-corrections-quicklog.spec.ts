import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import type { NutritionDocument } from '@dawlyy/core/types';
import type { MealHistoryRow } from '../../src/lib/client-corrections/types';
import { api, cairoToday, devLogin, labelPrefix, plusDays, visit, type Locale } from './helpers';

// P9 only. The public demo actors and real authenticated routes match R2a's spec.
// Every log and published plan below is created for this run and retained for inspection.
const CLIENT = 'd0250000-0000-4000-8000-000000000103';
const OWNER = 'd0250000-0000-4000-8000-000000000101';
function catalog(locale: Locale, namespace: string) {
  const messages = JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${namespace}.json`), 'utf8'));
  return createTranslator({ locale, messages, onError: error => { throw error; } });
}
for (const locale of ['ar', 'en'] as const) {
  test.describe(`R2b corrections and quick log @${locale}`, () => {
    test.describe.configure({ mode: 'serial' });
    let context: BrowserContext, coach: BrowserContext, page: Page;
    let date: string, mealId: string, optionId: string;
    const marker = `R2b ${locale} ${randomUUID()}`;
    const c = catalog(locale, 'clientCorrections'), q = catalog(locale, 'quickLog'), u = catalog(locale, 'controlUndo');
    test.beforeAll(async ({ browser, baseURL }) => {
      context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale, timezoneId: 'Africa/Cairo' });
      coach = await browser.newContext({ baseURL });
      context.setDefaultTimeout(60_000); context.setDefaultNavigationTimeout(240_000);
      await devLogin(context, CLIENT, locale); await devLogin(coach, OWNER, locale);
      page = await context.newPage(); const owner = await coach.newPage(); date = cairoToday();
      const { clientId } = await api<{ clientId: string }>(page, 'GET', '/me');
      const food = (await api<{ items: Array<{ id: string }> }>(owner, 'GET', '/foods?limit=1')).items[0]!;
      expect(food).toBeDefined();
      const plan = await api<{ head: { id: string }; currentVersion: { versionNo: number; document: NutritionDocument }; revision: string }>(owner, 'POST', '/nutrition', 201, { name: { en: marker, ar: 'اختبار التسجيل السريع' } });
      mealId = randomUUID(); optionId = randomUUID(); const document = plan.currentVersion.document;
      document.meals = [{ id: mealId, name: { en: `${marker} breakfast`, ar: 'فطار التسجيل السريع' }, options: [{ id: optionId, items: [{ id: randomUUID(), foodId: food.id, quantity: 75, measure: { kind: 'g' }, approx: false }], macros: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 } }] }];
      await api(owner, 'PUT', `/nutrition/${plan.head.id}/draft`, 200, { document, baseVersionNo: plan.currentVersion.versionNo, baseRevision: plan.revision });
      await api(owner, 'POST', `/nutrition/${plan.head.id}/publish`, 200, {});
      await api(owner, 'POST', `/nutrition/${plan.head.id}/assign`, 201, { clientId, startDate: plusDays(date, -7), publish: true, replace: true });
      await owner.close();
    });
    test.afterAll(async () => { await context?.close(); await coach?.close(); });
    const row = (id: string) => page.locator(`[data-entry-id="${id}"]`);
    const history = async () => (await api<{ items: MealHistoryRow[] }>(page, 'GET', `/meal-logs?date=${date}&limit=50`)).items;
    const seed = (text: string) => api<MealHistoryRow>(page, 'POST', '/meal-logs', 200, { localDate: date, clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), status: 'eaten', freeEntry: { text, macros: { kcal: 125, proteinG: 5, carbsG: 20, fatG: 3 } } });
    async function edit(id: string, text: string) {
      await row(id).getByRole('button', { name: c('edit'), exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: labelPrefix(c('meal.text')) }).fill(text);
      await dialog.getByRole('button', { name: c('save'), exact: true }).click();
      await expect(page.locator('[data-undo-toast]')).toHaveCount(1);
    }
    test('Undo within 6000 ms makes zero correction requests and preserves original history after reload', async () => {
      const original = await seed(`${marker} original undo`); const requests: string[] = [];
      const observe = (request: import('@playwright/test').Request) => {
        if (request.method() === 'POST' && request.url().endsWith(`/meal-logs/${original.id}/correct`)) requests.push(request.url());
      };
      page.on('request', observe);
      try {
        await visit(page, locale, '/app/nutrition/history'); await edit(original.id, `${marker} undone edit`);
        await page.locator('[data-undo-toast]').getByRole('button', { name: u('undo'), exact: true }).click();
        await expect(page.locator('[data-undo-toast]')).toHaveCount(0); await page.reload();
        await expect(row(original.id)).toContainText(`${marker} original undo`);
        const rows = await history();
        expect(rows.find(item => item.id === original.id)).toMatchObject({ voidedAt: null, freeEntry: original.freeEntry });
        expect(rows.filter(item => item.replacesId === original.id)).toHaveLength(0); expect(requests).toHaveLength(0);
      } finally { page.off('request', observe); }
    });
    test('expiry creates one replacement, excludes the voided original and deduplicates an identical retry', async () => {
      const original = await seed(`${marker} original expiry`); await visit(page, locale, '/app/nutrition/history');
      const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/meal-logs/${original.id}/correct`));
      await edit(original.id, `${marker} saved replacement`); const response = await pending;
      expect(response.status()).toBe(201); const replacement = await response.json() as MealHistoryRow; const request = response.request();
      expect(replacement.replacesId).toBe(original.id); expect(replacement.clientUuid).not.toBe(original.clientUuid);
      await expect(page.locator('[data-undo-toast]')).toHaveCount(0);
      const retry = await page.request.post(request.url(), { data: request.postDataJSON(), headers: { 'Idempotency-Key': request.headers()['idempotency-key']! } });
      expect(retry.status()).toBe(201); expect((await retry.json() as MealHistoryRow).id).toBe(replacement.id); await retry.dispose();
      await page.reload(); await expect(row(original.id)).toContainText(c('voided')); await expect(row(replacement.id)).toContainText(`${marker} saved replacement`);
      const rows = await history(); expect(rows.filter(item => item.replacesId === original.id)).toHaveLength(1);
      expect(rows.find(item => item.id === original.id)?.voidedAt).toBeTruthy();
      expect(rows.filter(item => [original.id, replacement.id].includes(item.id) && !item.voidedAt)).toHaveLength(1);
      await expect(row(original.id).getByRole('link')).toHaveAttribute('href', `#meal-${replacement.id}`);
    });
    test('planned, yesterday and a known recent portion each need at most two actions from Today', async () => {
      await api(page, 'POST', '/meal-logs', 200, { clientUuid: randomUUID(), localDate: plusDays(date, -1), mealId, optionId, status: 'eaten', clientUpdatedAt: new Date().toISOString() });
      for (const kind of ['planned', 'yesterday', 'recent-food']) {
        await visit(page, locale, '/app/today'); let actions = 0;
        await page.getByRole('link', { name: q('open'), exact: true }).click(); actions++;
        const choice = page.locator(`[data-quick-log-key^="${kind}:"]`).first(); await expect(choice).toBeVisible();
        const saved = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/meal-logs');
        await choice.click(); actions++; expect((await saved).status()).toBe(200); expect(actions).toBeLessThanOrEqual(2);
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      }
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
      }
    });
    test('an old createdAt disables corrections even when localDate is recent', async () => {
      const original = await seed(`${marker} window hint`);
      // Move only the UI clock: R0a/R0c own the real database boundary/isolation tests.
      await page.clock.install({ time: new Date(Date.now() + 8 * 86_400_000) });
      try {
        await visit(page, locale, '/app/nutrition/history'); await expect(row(original.id)).toContainText(c('unavailable'));
        await expect(row(original.id).getByRole('button', { name: c('edit'), exact: true })).toHaveCount(0);
        expect((await history()).find(item => item.id === original.id)?.voidedAt).toBeNull();
      } finally { await page.clock.setFixedTime(new Date()); }
    });
  });
}
