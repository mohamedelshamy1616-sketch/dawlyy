import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { cairoToday, devLogin, type Locale } from './helpers';

// R2c. Written now, run in P9 only (needs the migrated, demo-seeded database). Demo identities, as in r2a-client-start.spec.ts.
const OWNER = 'd0250000-0000-4000-8000-000000000101';
const STAFF = 'd0250000-0000-4000-8000-000000000102';
const CLIENT_USER = 'd0250000-0000-4000-8000-000000000103';
const OTHER_CLIENT_USER = 'd0250000-0000-4000-8000-000000000104';
const MODULES = ['workouts', 'nutrition', 'checkins', 'progress_photos', 'measurements', 'messages', 'payments'] as const;
const ALL_ON = Object.fromEntries(MODULES.map(m => [m, true]));
const KEY = 'custom%3Aclient_app';

function catalog(locale: Locale) {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, 'clientAppComposer.json'), 'utf8')) as {
    title: string; actions: { save: string; reset: string }; choice: { inherit: string; on: string; off: string };
    modules: Record<(typeof MODULES)[number], { name: string }>; summary: { allOff: string }; readOnly: { title: string };
    status: { saved: string; resetDone: string; unsaved: string }; preview: { empty: string };
  };
}

async function actor(browser: Browser, baseURL: string | undefined, locale: Locale, userId: string, width = 390, touch = false): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, viewport: { width, height: 844 }, locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo', ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  await devLogin(context, userId, locale);
  return context;
}
const put = (request: APIRequestContext, path: string, data: unknown) => request.put(`/api/v1${path}`, { data, headers: { 'Idempotency-Key': randomUUID() } });
const del = (request: APIRequestContext, path: string) => request.delete(`/api/v1${path}`, { headers: { 'Idempotency-Key': randomUUID() } });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const clientIdOf = async (request: APIRequestContext) => ((await (await request.get('/api/v1/me')).json()) as { clientId: string }).clientId;

/** The client's own screens never mention nutrition once it is hidden. */
async function expectNoNutrition(page: Page, locale: Locale) {
  for (const path of ['today', 'plan', 'me']) {
    await page.goto(`/${locale}/app/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('a[href*="/app/nutrition"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="meal-"]')).toHaveCount(0);
  }
}

for (const locale of ['ar', 'en'] as const) {
  test.describe(`R2c client app composer ${locale === 'ar' ? '@ar' : '@en'}`, () => {
    const t = catalog(locale);

    test(`coach hides nutrition, the client no longer sees it and its write gets 403 @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const owner = await actor(browser, baseURL, locale, OWNER);
      const client = await actor(browser, baseURL, locale, CLIENT_USER);
      try {
        const page = await owner.newPage();
        await page.goto(`/${locale}/coach/settings/client-app`);
        await expect(page.getByRole('heading', { level: 1, name: t.title })).toBeVisible();
        await page.getByRole('switch', { name: t.modules.nutrition.name }).click();
        const saved = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/settings/client-modules' && r.request().method() === 'PUT');
        await page.getByRole('button', { name: t.actions.save, exact: true }).click();
        expect((await saved).status()).toBe(200);
        await expect(page.getByTestId('composer-status')).toHaveText(t.status.saved);

        const clientPage = await client.newPage();
        await expectNoNutrition(clientPage, locale);
        const write = await client.request.post('/api/v1/meal-logs', {
          data: { clientUuid: randomUUID(), localDate: cairoToday(), mealId: 'meal-1', status: 'eaten', clientUpdatedAt: new Date().toISOString() },
          headers: { 'Idempotency-Key': randomUUID() },
        });
        expect(write.status()).toBe(403);
        expect(((await write.json()) as { error: { code: string } }).error.code).toBe('module_disabled');
      } finally {
        await put(owner.request, '/settings/client-modules', ALL_ON);
        await owner.close(); await client.close();
      }
    });

    test(`a client override enables nutrition against an off default and Reset returns to it @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const owner = await actor(browser, baseURL, locale, OWNER);
      const client = await actor(browser, baseURL, locale, CLIENT_USER);
      const other = await actor(browser, baseURL, locale, OTHER_CLIENT_USER);
      let clientId = '';
      try {
        clientId = await clientIdOf(client.request);
        expect((await put(owner.request, '/settings/client-modules', { ...ALL_ON, nutrition: false })).ok()).toBe(true);
        const page = await owner.newPage();
        await page.goto(`/${locale}/coach/clients/${clientId}/client-app`);
        const row = page.getByTestId('module-nutrition');
        await row.getByRole('radio', { name: t.choice.on }).check();
        const saved = page.waitForResponse(r => r.url().includes(`/overrides/${KEY}`) && r.request().method() === 'PUT');
        await page.getByRole('button', { name: t.actions.save, exact: true }).click();
        expect((await saved).status()).toBe(200);
        expect(((await (await client.request.get('/api/v1/me/app')).json()) as { clientModules: { nutrition: boolean } }).clientModules.nutrition).toBe(true);
        // Another client keeps the tenant default.
        expect(((await (await other.request.get('/api/v1/me/app')).json()) as { clientModules: { nutrition: boolean } }).clientModules.nutrition).toBe(false);

        const reset = page.waitForResponse(r => r.url().includes(`/overrides/${KEY}`) && r.request().method() === 'DELETE');
        await page.getByRole('button', { name: t.actions.reset, exact: true }).click();
        expect((await reset).status()).toBe(200);
        await expect(page.getByTestId('composer-status')).toHaveText(t.status.resetDone);
        expect(((await (await client.request.get('/api/v1/me/app')).json()) as { clientModules: { nutrition: boolean } }).clientModules.nutrition).toBe(false);
      } finally {
        if (clientId) await del(owner.request, `/clients/${clientId}/overrides/${KEY}`);
        await put(owner.request, '/settings/client-modules', ALL_ON);
        await owner.close(); await client.close(); await other.close();
      }
    });

    test(`staff see read-only defaults and an unsaved preview sends no mutation @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const staff = await actor(browser, baseURL, locale, STAFF);
      const owner = await actor(browser, baseURL, locale, OWNER);
      try {
        const page = await staff.newPage();
        await page.goto(`/${locale}/coach/settings/client-app`);
        await expect(page.getByText(t.readOnly.title)).toBeVisible();
        await expect(page.getByRole('button', { name: t.actions.save, exact: true })).toHaveCount(0);
        await expect(page.getByRole('switch', { name: t.modules.nutrition.name })).toBeDisabled();

        const ownerPage = await owner.newPage();
        const mutations: string[] = [];
        ownerPage.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/v1/')) mutations.push(`${r.method()} ${r.url()}`); });
        await ownerPage.goto(`/${locale}/coach/settings/client-app`);
        await ownerPage.getByRole('switch', { name: t.modules.workouts.name }).click();
        await expect(ownerPage.getByTestId('composer-status')).toHaveText(t.status.unsaved);
        await expect(ownerPage.getByTestId('phone-preview')).toBeVisible();
        expect(mutations).toEqual([]);
      } finally { await staff.close(); await owner.close(); }
    });

    test(`all modules off settles without overflow at 360, 390 and 430 px @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const owner = await actor(browser, baseURL, locale, OWNER, 390, true);
      try {
        expect((await put(owner.request, '/settings/client-modules', Object.fromEntries(MODULES.map(m => [m, false])))).ok()).toBe(true);
        for (const width of [360, 390, 430]) {
          const page = await owner.newPage();
          await page.setViewportSize({ width, height: 844 });
          await page.goto(`/${locale}/coach/settings/client-app`);
          await expect(page.getByTestId('composer-summary')).toHaveText(t.summary.allOff);
          await expect(page.getByText(t.preview.empty)).toBeVisible();
          await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
          expect(await overflow(page), `Horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
          // The Astryx Switch draws a 24 px track and grows its tap area under a coarse pointer (hitArea.js), so the
          // proof is real touch taps across the 44 px band centred on the track: every one of them must toggle it.
          expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'touch emulation').toBe(true);
          const toggle = page.getByRole('switch', { name: t.modules.workouts.name });
          let box = (await toggle.boundingBox())!;
          const first = { ...box };
          const missed: number[] = [];
          for (const offset of [-20, -16, -8, 0, 8, 16, 20]) {
            // The first change shows the unsaved status and may move the row, so measure it again before every tap.
            box = (await toggle.boundingBox())!;
            const before = await toggle.isChecked();
            await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 + offset);
            if ((await toggle.isChecked()) === before) missed.push(offset);
          }
          expect(missed, `box ${JSON.stringify(first)}; tap offsets (px from the track centre) that did not toggle the switch`).toEqual([]);
          await page.close();
        }
      } finally {
        await put(owner.request, '/settings/client-modules', ALL_ON);
        await owner.close();
      }
    });
  });
}
