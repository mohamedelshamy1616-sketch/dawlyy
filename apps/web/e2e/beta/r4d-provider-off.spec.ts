import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { formatNumber, type NumeralSystem } from '../../src/lib/numbers';
import { browserHealth, devLogin, visit, type Locale } from './helpers';

// Public seeded owner ID, shared read-only with the existing beta gate.
const OWNER = 'd0250000-0000-4000-8000-000000000101';
const widths = [360, 375, 390, 430, 1440] as const;
const reportModels = ['haiku', 'luna', 'gemma26', 'gemma31', 'mistral', 'flashLite', 'flashDecember', 'flashJanuary', 'cloudflare'] as const;
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// P9 only: run after integration/r4d.md with the server provider unset or explicitly none.
// R4b owns inbox → review → approve and its timer. This covers the provider-off prerequisite.
for (const locale of ['ar', 'en'] as const satisfies readonly Locale[]) {
  test(`R4d Settings → AI stays off with historical costs @${locale}`, async ({ page, context }) => {
    const healthy = browserHealth(context, locale);
    const ai = createTranslator({ locale, messages: JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, 'aiProvider.json'), 'utf8')) });
    const hostedRequests: string[] = [];
    context.on('request', request => {
      const host = new URL(request.url()).hostname;
      if (host === 'api.anthropic.com' || host === 'openrouter.ai') hostedRequests.push(host);
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await devLogin(context, OWNER, locale);
      await visit(page, locale, '/coach/settings');
      const link = page.getByRole('main').getByRole('link', { name: new RegExp(escaped(ai('hub.title'))) });
      await expect(link).toHaveAttribute('href', `/${locale}/coach/settings/ai`);
      await link.click();
      await expect(page).toHaveURL(url => url.pathname === `/${locale}/coach/settings/ai`);
      const main = page.getByRole('main');
      await expect(main.getByTestId('ai-provider-status')).toHaveText(ai('status.off'));
      await expect(main.getByText(ai('costs.sourceDate'), { exact: true })).toBeVisible();
      const assumptions = (numerals: NumeralSystem) => ai('costs.assumptions', {
        inputTokens: formatNumber(6000, { locale, numerals, maximumFractionDigits: 0 }),
        outputTokens: formatNumber(800, { locale, numerals, maximumFractionDigits: 0 }),
        summaries: formatNumber(1000, { locale, numerals, maximumFractionDigits: 0 }),
      });
      await expect(main.getByText(new RegExp(`^(?:${escaped(assumptions('latn'))}|${escaped(assumptions('arab'))})$`))).toBeVisible();
      await expect(main.locator('input, textarea, select, [contenteditable="true"], [role="switch"]')).toHaveCount(0);
      await expect(main.getByRole('button')).toHaveCount(0);
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(main.getByRole('link', { name: ai('backSettings'), exact: true })).toHaveAttribute('href', `/${locale}/coach/settings`);
      for (const width of widths) {
        await test.step(`${locale} has settled, readable rows at ${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await expect(main.getByTestId('ai-provider-status')).toHaveText(ai('status.off'));
          for (const model of reportModels) await expect(main.getByText(ai(`costs.models.${model}`), { exact: true })).toBeVisible();
          await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
          await healthy();
        });
      }
      expect(hostedRequests, 'Opening read-only AI settings must not initiate a browser provider call.').toEqual([]);
    } finally { await healthy(); }
  });
}
