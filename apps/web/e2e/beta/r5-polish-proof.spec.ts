import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator } from 'next-intl';
import { reinventProofRoutes, REINVENT_PROOF_WIDTHS } from '../../src/lib/reinvent-proof/manifest';
import { api, browserHealth, devLogin, labels, type Locale } from './helpers';

// P9 only: this spec is written now and run later, together with the other beta specs, against the migrated local
// database and the seeded demo identities (the same ids e2e/screens.spec.ts uses). It owns the cross-screen proof:
// widths, settled states, 44 px targets, numerals, synthetic empty/error states and the 3-tap assignment.
// Mutation journeys stay with their owners: R4b inbox -> review -> approve/send and red flag; R3a archive -> undo ->
// Archived -> restore; R2c hide nutrition -> absent client UI -> 403; R2a client Start; R2b correct meal -> undo and
// quick log; R3b activity visibility and version links.
// Synthetic same-origin responses below are labelled "synthetic state": they prove how the screen renders a state,
// not that the API produces it or that access is enforced. No hosted-model or remote-account call is made.
const OWNER = 'd0250000-0000-4000-8000-000000000101';
const CLIENT_USER = 'd0250000-0000-4000-8000-000000000103';
const FIRST_CLIENT = 'd0250000-0000-4000-8000-000000000301';
const HEIGHTS: Record<number, number> = { 360: 800, 390: 844, 430: 932, 1366: 900, 375: 812, 1440: 900 };
const catalog = (locale: Locale, name: string) => JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${name}.json`), 'utf8')) as Record<string, unknown>;

async function open(browser: Browser, baseURL: string, locale: Locale, userId: string, width: number, injected: readonly string[] = []) {
  const context = await browser.newContext({ baseURL, viewport: { width, height: HEIGHTS[width] ?? 900 }, locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo', reducedMotion: 'reduce' });
  context.setDefaultTimeout(60_000); context.setDefaultNavigationTimeout(240_000);
  const health = browserHealth(context, locale, injected);
  await devLogin(context, userId, locale);
  return { context, health, page: await context.newPage() };
}

/** A settled page shows content or an explicit state: no busy marker and a heading. A pending view is never a result. */
async function assertSettled(page: Page, label: string): Promise<void> {
  await expect(page.locator('[aria-busy="true"]'), `${label}: still busy`).toHaveCount(0);
  await expect(page.getByRole('heading').first(), `${label}: no heading`).toBeVisible();
}

/** Visible interactive controls smaller than 44 x 44 CSS px, skipping skip links, visually hidden inputs and inline text links. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="checkbox"], [role="switch"]';
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      if (element.closest('[hidden], [aria-hidden="true"], .sr-only')) continue;
      if (element.tagName === 'A' && (element.getAttribute('href') ?? '').startsWith('#')) continue;
      if (element.tagName === 'A' && style.display === 'inline' && element.closest('p, li')?.textContent !== element.textContent) continue;
      if (box.right <= 0 || box.left >= window.innerWidth) continue;
      if (box.width < 43.5 || box.height < 43.5) out.push(`${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return out;
  });
}

const contentRoutes = reinventProofRoutes(FIRST_CLIENT).filter(route => route.state === 'content' && route.path !== '/app/workout/start');

for (const locale of ['ar', 'en'] as const) {
  test.describe(`R5 polish and proof @${locale}`, () => {
    test.setTimeout(900_000);
    const dir = locale === 'ar' ? 'rtl' : 'ltr';

    test(`new routes settle with no overflow and 44 px targets at all six widths @${locale}`, async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      for (const width of REINVENT_PROOF_WIDTHS) {
        for (const actor of [{ area: 'coach', userId: OWNER }, { area: 'app', userId: CLIENT_USER }] as const) {
          const { context, health, page } = await open(browser, baseURL, locale, actor.userId, width);
          try {
            for (const route of contentRoutes.filter(candidate => candidate.area === actor.area)) {
              const label = `${locale} ${width}px ${route.id}`;
              await page.goto(`/${locale}${route.path}`, { waitUntil: 'load' });
              await expect(page, `${label}: final URL`).toHaveURL(url => `${url.pathname}${url.search}` === `/${locale}${route.path}`);
              await expect(page.locator('html')).toHaveAttribute('dir', dir);
              await assertSettled(page, label);
              await page.evaluate(async () => { await document.fonts.ready; });
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
              expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
              expect(await smallTargets(page), `${label}: interactive targets under 44 px`).toEqual([]);
              await test.info().attach(`${label}.png`, { body: await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'initial' }), contentType: 'image/png' });
            }
          } finally { await health().finally(() => context.close()); }
        }
      }
    });

    test(`synthetic state: the activity list renders empty, then a retryable error, then recovers @${locale}`, async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      const messages = catalog(locale, 'activity');
      const translate = createTranslator({ locale, messages }) as unknown as (key: string) => string;
      const { context, health, page } = await open(browser, baseURL, locale, OWNER, 390, ['500 GET /api/v1/activity']);
      try {
        await page.goto(`/${locale}/coach/settings/activity`, { waitUntil: 'load' });
        await assertSettled(page, 'activity');
        const isFilterRequest = (url: URL) => url.pathname === '/api/v1/activity' && url.searchParams.get('entity') === 'clients';
        await page.route(isFilterRequest, route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'synthetic' } }) }));
        await page.getByRole('combobox', { name: translate('filterLabel'), exact: true }).click();
        await page.getByRole('option', { name: translate('entities.clients'), exact: true }).click();
        await expect(page.getByRole('alert').filter({ hasText: translate('requestFailed') })).toBeVisible();
        const retry = page.getByRole('button', { name: translate('retry'), exact: true });
        await expect(retry).toBeVisible();
        await expect(page.getByText(translate('filteredEmpty'), { exact: true }), 'a failed read must not read as an empty list').toHaveCount(0);
        await page.unroute(isFilterRequest);
        await page.route(isFilterRequest, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) }));
        await retry.click();
        await expect(page.getByText(translate('filteredEmpty'), { exact: true })).toBeVisible();
        await assertSettled(page, 'activity after retry');
        expect(await smallTargets(page), 'activity: targets under 44 px').toEqual([]);
      } finally { await health().finally(() => context.close()); }
    });

    test(`synthetic state: the assign dialog list renders empty and a retryable error @${locale}`, async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      const text = await labels(locale);
      const { context, health, page } = await open(browser, baseURL, locale, OWNER, 390, ['500 GET /api/v1/programs']);
      const isTemplates = (url: URL) => url.pathname === '/api/v1/programs' && url.searchParams.get('kind') === 'template';
      try {
        for (const mode of ['empty', 'error'] as const) {
          await page.route(isTemplates, route => mode === 'empty'
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null }) })
            : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal', message: 'synthetic' } }) }));
          await page.goto(`/${locale}/coach/clients/${FIRST_CLIENT}`, { waitUntil: 'load' });
          await page.getByRole('button', { name: text('clients.hub.assign.program.button'), exact: true }).first().click();
          const dialog = page.getByRole('dialog');
          if (mode === 'empty') await expect(dialog.getByText(text('clients.hub.assign.program.none'), { exact: true })).toBeVisible();
          else await expect(dialog.getByRole('alert').filter({ hasText: text('clients.hub.assign.errors.failed') })).toBeVisible();
          await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
          await page.unroute(isTemplates);
        }
      } finally { await health().finally(() => context.close()); }
    });

    test(`coach: assign a program from the client hub in 3 taps or fewer @${locale}`, async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      const text = await labels(locale);
      const { context, health, page } = await open(browser, baseURL, locale, OWNER, 390);
      try {
        // Fixture setup, outside the measured sequence: a fresh client (no program) and a check that a published program exists.
        const run = `${locale}-${randomUUID()}`;
        const created = await api<{ id: string }>(page, 'POST', '/clients', 201, { firstName: `R5 ${run}`, displayName: `R5 ${run}`, locale });
        const templates = await api<{ items: Array<{ publishedVersionId?: string | null; publishedVersionNo?: number | null }> }>(page, 'GET', '/programs?kind=template&limit=30');
        expect(templates.items.some(item => item.publishedVersionId != null || item.publishedVersionNo != null), 'fixture: an eligible published program must exist').toBe(true);
        await page.goto(`/${locale}/coach/clients/${created.id}`, { waitUntil: 'load' });
        await assertSettled(page, 'client hub');

        // Measured sequence: every click after arrival counts. The tab stays on Week, where the assign button is on screen.
        let taps = 0;
        const tap = async (action: () => Promise<unknown>) => { taps++; await action(); };
        await tap(() => page.getByRole('button', { name: text('clients.hub.assign.program.button'), exact: true }).first().click());
        const dialog = page.getByRole('dialog');
        const choices = dialog.getByRole('group', { name: text('clients.hub.assign.program.choose') }).getByRole('button');
        await expect(choices.first()).toBeVisible();
        const name = ((await choices.first().textContent()) ?? '').trim();
        await tap(() => choices.first().click());
        await tap(() => dialog.getByRole('button', { name: text('clients.hub.assign.confirm', { name }), exact: true }).click());
        await expect(dialog.getByText(text('clients.hub.assign.success'), { exact: true })).toBeVisible();
        expect(taps, 'taps from the hub to a confirmed assignment').toBeLessThanOrEqual(3);

        // Verification only, not part of the count: reload the hub and read the Plan tab.
        await page.goto(`/${locale}/coach/clients/${created.id}`, { waitUntil: 'load' });
        await page.getByRole('tab', { name: text('clients.tabs.plan'), exact: true }).click();
        await expect(page.getByText(text('clients.plan.noProgram'), { exact: true })).toHaveCount(0);
        await expect(page.getByRole('link', { name: text('clients.plan.openProgram'), exact: true })).toBeVisible();
      } finally { await health().finally(() => context.close()); }
    });

    test(`numerals: Western by default and Arabic-Indic on request, on Today and on the review @${locale}`, async ({ browser, baseURL }) => {
      if (!baseURL) throw new Error('Use the existing beta E2E configuration and migrated local database.');
      const westernOutsideCodes = (page: Page) => page.evaluate(() => {
        const skip = 'bdi, code, [dir="ltr"], script, style';
        const found: string[] = [];
        const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.parentElement?.closest(skip)) continue;
          const digits = (node.textContent ?? '').match(/[0-9]+/g);
          if (digits) found.push(`${digits.join(',')} in <${node.parentElement?.tagName.toLowerCase()}> "${(node.textContent ?? '').trim().slice(0, 60)}"`);
        }
        return found;
      });
      const surfaces = [
        { who: CLIENT_USER, path: '/app/today' },
        { who: OWNER, path: `/coach/clients/${FIRST_CLIENT}/review` },
      ] as const;
      for (const surface of surfaces) {
        const { context, health, page } = await open(browser, baseURL, locale, surface.who, 390);
        const current = await api<{ numerals: 'latn' | 'arab' }>(page, 'GET', '/me/app');
        try {
          for (const numerals of ['latn', 'arab'] as const) {
            await api(page, 'PUT', '/settings/preferences', 200, { numerals });
            await page.goto(`/${locale}${surface.path}`, { waitUntil: 'load' });
            await assertSettled(page, `${surface.path} ${numerals}`);
            const main = page.getByRole('main');
            if (numerals === 'arab') {
              expect(await westernOutsideCodes(page), `${surface.path}: Western digits shown after choosing Arabic-Indic`).toEqual([]);
              if (surface.path === '/app/today') await expect(main.locator('h1 + p')).toHaveText(/[٠-٩]/);
            } else if (surface.path === '/app/today') {
              await expect(main.locator('h1 + p')).toHaveText(/[0-9]/);
              await expect(main).not.toHaveText(/[٠-٩]/);
            }
          }
        } finally {
          // Restore the original choice (the preference is merged by PUT, so only numerals changes).
          await api(page, 'PUT', '/settings/preferences', 200, { numerals: current.numerals });
          await health().finally(() => context.close());
        }
      }
    });
  });
}
