import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import type { ProgramDocument } from '@dawlyy/core/types';
import { devLogin, type Locale } from './helpers';

/**
 * R2a / P9 "client: start a workout in at most 2 actions". Written for P9 to register with e2e-ar and e2e-en;
 * it needs the migrated, demo-seeded database. One tap on Start is the target and two is the gate.
 */
const CLIENT = 'd0250000-0000-4000-8000-000000000103';
const COACH = 'd0250000-0000-4000-8000-000000000101';
const LONG_NAME = {
  en: 'An exceptionally long workout name that must wrap onto several lines instead of pushing the page sideways',
  ar: 'اسم تمرين طويل جدا لازم يتقسم على كذا سطر من غير ما يزق الصفحة على الجنب أبدا ولا يخرج برا الشاشة',
};

function cairoToday(): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (kind: string) => parts.find(p => p.type === kind)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** A published, assigned program whose first day is today's planned workout. */
async function seedPlannedDay(coach: APIRequestContext, client: APIRequestContext) {
  const me = await client.get('/api/v1/me');
  expect(me.ok()).toBe(true);
  const { clientId } = await me.json() as { clientId: string };
  const library = await coach.get('/api/v1/exercises?limit=1');
  expect(library.ok()).toBe(true);
  const exerciseId = (await library.json() as { items: Array<{ id: string }> }).items[0]!.id;
  const template = await coach.post('/api/v1/programs', { data: { name: { en: `R2a start ${randomUUID()}`, ar: 'اختبار بدء التمرين' }, weeks: 1, trainingDays: [0] } });
  expect(template.status()).toBe(201);
  const created = await template.json() as { head: { id: string }; currentVersion: { document: ProgramDocument } };
  const document = created.currentVersion.document;
  const day = document.phases[0]!.weeks[0]!.days[0]!;
  (day.workout as unknown as { name?: unknown }).name = LONG_NAME;
  day.workout!.blocks = [{ id: randomUUID(), kind: 'main', items: [{ id: randomUUID(), exerciseId, order: 0,
    coachNote: { en: 'Keep your chest up', ar: 'خلّي صدرك مرفوع' }, sets: [1, 2, 3].map(setNo => ({ setNo, reps: '8', restSec: 60, load: { value: 20, unit: 'kg' as const } })) }] }];
  expect((await coach.put(`/api/v1/programs/${created.head.id}/draft`, { data: { baseVersionNo: 1, document } })).ok()).toBe(true);
  expect((await coach.post(`/api/v1/programs/${created.head.id}/publish`, { data: {} })).ok()).toBe(true);
  const assigned = await coach.post(`/api/v1/programs/${created.head.id}/assign`, { data: { clientId, publish: true, replace: true, startDate: cairoToday() } });
  expect(assigned.status()).toBe(201);
  const copy = await assigned.json() as { head: { id: string }; currentVersion: { id: string; document: ProgramDocument } };
  const planned = copy.currentVersion.document.phases[0]!.weeks[0]!.days[0]!;
  return { clientId, session: { programId: copy.head.id, programVersionId: copy.currentVersion.id, dayId: planned.id,
    workoutId: planned.workout!.id, clientUuid: randomUUID(), localDate: cairoToday(), timezone: 'Africa/Cairo' } };
}

async function actors(browser: Browser, baseURL: string | undefined, locale: Locale, width = 390): Promise<{ client: BrowserContext; coach: BrowserContext }> {
  const client = await browser.newContext({ baseURL, viewport: { width, height: 844 }, locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo' });
  const coach = await browser.newContext({ baseURL });
  await devLogin(client, CLIENT, locale);
  await devLogin(coach, COACH, locale);
  return { client, coach };
}

const overflow = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const locale of ['ar', 'en'] as const) {
  test.describe(`R2a client Today ${locale === 'ar' ? '@ar' : '@en'}`, () => {
    test(`start a workout from Today in one tap and land on live content @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const { client, coach } = await actors(browser, baseURL, locale);
      try {
        await seedPlannedDay(coach.request, client.request);
        const page = await client.newPage();
        await page.goto(`/${locale}/app/today`);
        const start = page.getByTestId('start-workout');
        await expect(start).toBeVisible();
        // One lead card, one Start, and no confirmation step in between.
        await expect(page.getByTestId('today-workout')).toHaveCount(1);
        let taps = 0;
        await start.click(); taps += 1;
        await expect(page).toHaveURL(new RegExp(`/${locale}/app/workout/(?!start)[0-9a-f-]{36}$`));
        const sessionId = page.url().split('/').pop()!;
        // Real live content, not a settled skeleton or the transient start page.
        await expect(page.getByTestId('workout-screen')).toBeVisible();
        await expect(page.getByTestId('set-row')).toHaveCount(3);
        expect(taps, 'Taps from Today to a live workout').toBeLessThanOrEqual(2);
        expect(taps).toBe(1);
        // Exactly one session was created: Today now continues that same one.
        const today = await client.request.get('/api/v1/me/today');
        expect(today.ok()).toBe(true);
        expect((await today.json() as { workout: { state: string; sessionId?: string } }).workout).toMatchObject({ state: 'active', sessionId });
        await page.goto(`/${locale}/app/today`);
        await expect(page.getByTestId('start-workout')).toHaveAttribute('href', new RegExp(`/app/workout/${sessionId}$`));
      } finally { await client.close(); await coach.close(); }
    });

    test(`hides the workout card and its writes when workouts is off for this client @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const { client, coach } = await actors(browser, baseURL, locale);
      let clientId = '';
      try {
        const seeded = await seedPlannedDay(coach.request, client.request);
        clientId = seeded.clientId;
        const off = await coach.request.put(`/api/v1/clients/${clientId}/overrides/chat`, { data: { enabled: true, modules: { workouts: false } }, headers: { 'Idempotency-Key': randomUUID() } });
        expect(off.ok()).toBe(true);
        const page = await client.newPage();
        await page.goto(`/${locale}/app/today`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByTestId('today-workout')).toHaveCount(0);
        await expect(page.getByTestId('start-workout')).toHaveCount(0);
        const app = await client.request.get('/api/v1/me/app');
        expect((await app.json() as { clientModules: { workouts: boolean } }).clientModules.workouts).toBe(false);
        const denied = await page.request.post('/api/v1/workout-sessions', {
          data: seeded.session, headers: { 'Idempotency-Key': randomUUID() },
        });
        expect(denied.status()).toBe(403);
        expect(await denied.json()).toMatchObject({ error: { code: 'module_disabled' } });
      } finally {
        if (clientId) await coach.request.put(`/api/v1/clients/${clientId}/overrides/chat`, { data: { enabled: true, modules: { workouts: true } }, headers: { 'Idempotency-Key': randomUUID() } });
        await client.close(); await coach.close();
      }
    });

    test(`long workout names never overflow at 360, 390 and 430 px @${locale}`, async ({ browser, baseURL }) => {
      test.setTimeout(900_000);
      const first = await actors(browser, baseURL, locale);
      try {
        await seedPlannedDay(first.coach.request, first.client.request);
        for (const width of [360, 390, 430]) {
          const context = await browser.newContext({ baseURL, viewport: { width, height: 844 }, locale: locale === 'ar' ? 'ar-EG' : 'en-EG', timezoneId: 'Africa/Cairo' });
          try {
            await devLogin(context, CLIENT, locale);
            const page = await context.newPage();
            await page.goto(`/${locale}/app/today`);
            await expect(page.getByTestId('today-workout')).toBeVisible();
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            expect(await overflow(page), `Horizontal overflow at ${width}px`).toBeLessThanOrEqual(1);
            const box = await page.getByTestId('start-workout').boundingBox();
            expect(box?.height ?? 0, 'Start touch target height').toBeGreaterThanOrEqual(44);
            for (const hub of ['plan', 'coach', 'me']) {
              await page.goto(`/${locale}/app/${hub}`);
              await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
              expect(await overflow(page), `Horizontal overflow on ${hub} at ${width}px`).toBeLessThanOrEqual(1);
            }
          } finally { await context.close(); }
        }
      } finally { await first.client.close(); await first.coach.close(); }
    });
  });
}