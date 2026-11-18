import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { reinventProofRoutes } from '../src/lib/reinvent-proof/manifest';

// Fixed user IDs duplicated from packages/db/seed/demo.ts: importing that executable would run the seed.
const actors = [
  { role: 'owner', userId: 'd0250000-0000-4000-8000-000000000101' },
  { role: 'client', userId: 'd0250000-0000-4000-8000-000000000103' },
] as const;
const locales = ['ar', 'en'] as const;
// Three phone widths (small, common, large) and one desktop width, plus Astryx's own proof widths 375 and 1440.
// The widths are the same list as REINVENT_PROOF_WIDTHS in src/lib/reinvent-proof/manifest.ts.
const viewports = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1366, height: 900 },
  { width: 375, height: 812 }, { width: 1440, height: 900 }] as const;

// One entry per static app/[locale]/**/page.tsx plus detail pages for the demo records; route groups do not appear in URLs.
// Each [...rest]/page.tsx gets an unknown URL in its own area. `area` decides which demo role visits the route.
const FIRST_CLIENT = 'd0250000-0000-4000-8000-000000000301';
const DEMO_PACKAGE = 'd0250000-0000-4000-8000-000000000401';
const DEMO_PROGRAM = 'd0250000-0000-4000-8000-000000000501';
type Area = 'public' | 'coach' | 'app';
const routes: Array<{ path: string; slug: string; area: Area }> = [
  { path: '', slug: 'landing', area: 'public' },
  { path: '/login', slug: 'login', area: 'public' },
  { path: '/signup', slug: 'signup', area: 'public' },
  { path: '/reset', slug: 'reset', area: 'public' },
  { path: '/privacy', slug: 'privacy', area: 'public' },
  { path: '/terms', slug: 'terms', area: 'public' },
  { path: '/preview-not-found', slug: 'not-found', area: 'public' },
  { path: '/coach', slug: 'coach', area: 'coach' },
  { path: '/coach/preview-not-found', slug: 'coach-not-found', area: 'coach' },
  ...['clients', 'clients/new', `clients/${FIRST_CLIENT}`, `clients/${FIRST_CLIENT}/timeline`, `clients/${FIRST_CLIENT}/tracking`,
    `clients/${FIRST_CLIENT}/subscription`, `clients/${FIRST_CLIENT}/overrides`, 'packages', 'packages/new', `packages/${DEMO_PACKAGE}`,
    'programs', 'programs/new', `programs/${DEMO_PROGRAM}`, `programs/${DEMO_PROGRAM}/assign`, `programs/${DEMO_PROGRAM}/history`,
    'exercises', 'exercises/new', 'exercises/import', 'foods', 'foods/new', 'nutrition', 'nutrition/new', 'billing', 'billing/sell',
    'calendar', 'checkins', 'assessments', 'intake', 'messages', 'notifications', 'tasks', 'settings', 'settings/business',
    'settings/branding', 'settings/language', 'settings/legal', 'settings/team',
  ].map(path => ({ path: `/coach/${path}`, slug: `coach-${path.replace(FIRST_CLIENT, 'client').replace(DEMO_PACKAGE, 'package').replace(DEMO_PROGRAM, 'program').replaceAll('/', '-')}`, area: 'coach' as const })),
  { path: '/app', slug: 'app', area: 'app' },
  { path: '/app/preview-not-found', slug: 'app-not-found', area: 'app' },
  ...['today', 'program', 'nutrition', 'nutrition/log', 'nutrition/history', 'workout/start', 'history', 'progress', 'tracking', 'checkins',
    'intake', 'assessment', 'messages', 'notifications', 'subscription', 'consent',
  ].map(path => ({ path: `/app/${path}`, slug: `app-${path.replaceAll('/', '-')}`, area: 'app' as const })),
];
// R5: the reinvention's new stable routes from the proof inventory. Only `content` rows are captured here (empty, error and
// unavailable rows need fixtures and belong to e2e/beta/r5-polish-proof.spec.ts); a path already listed above is not repeated.
const listedPaths = new Set(routes.map(route => route.path));
const inventoryRoutes: Array<{ path: string; slug: string; area: Area }> = [];
for (const route of reinventProofRoutes(FIRST_CLIENT)) {
  if (route.state !== 'content' || listedPaths.has(route.path)) continue;
  listedPaths.add(route.path);
  inventoryRoutes.push({ path: route.path, slug: route.id, area: route.area });
}
const slugs = [...routes, ...inventoryRoutes].map(route => route.slug);
if (new Set(slugs).size !== slugs.length) throw new Error('screens.spec: duplicate route slug in the screen list');
routes.push(...inventoryRoutes);
const actorRoutes = (role: (typeof actors)[number]['role']) =>
  routes.filter(route => route.area === 'public' || route.area === (role === 'owner' ? 'coach' : 'app'));

type Screen = {
  image: string;
  role: (typeof actors)[number]['role'];
  route: string;
  locale: (typeof locales)[number];
  width: number;
  finalRoute: string;
  pageChecks: 'PASS' | 'FAIL';
  saved: boolean;
  overflow: 'PASS' | 'FAIL' | 'NOT CHECKED';
};

const screens: Screen[] = [];
let screensDirectory: string | undefined;

// SCREENS_ONLY=<substring>[,<substring>] reruns only the screens whose image name contains one of the parts, for
// example SCREENS_ONLY=client-app-workout-start-ar-1366 (about 2 minutes instead of 45). A filtered run never
// rewrites index.md, which must always describe a complete run.
const only = (process.env.SCREENS_ONLY ?? '').split(',').map(part => part.trim()).filter(Boolean);
const wanted = (image: string) => only.length === 0 || only.some(part => image.includes(part));
const wantedRoute = (role: string, slug: string) => only.length === 0 || only.some(part => part.includes(`${role}-${slug}-`));

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The URL a settled page must have. /app/workout/start is a transient redirect: the first visit creates the demo
 * client's session and every visit then lands on /app/workout/<id>, so wait for that live workout screen.
 */
function expectedUrl(role: Screen['role'], path: string, baseURL: string, locale: string): string | RegExp {
  if (role === 'client' && path === '/app/workout/start') return new RegExp(`^${escapeRegExp(baseURL)}/${locale}/app/workout/${UUID}$`);
  return `${baseURL}/${locale}${destination(role, path)}`;
}

/**
 * A page that is still a skeleton must never count as a PASS. Waits for every busy marker (PageSkeleton and the
 * client runtime use aria-busy) to go away, then fails with the URL and the HTML of what is still busy.
 */
async function assertSettled(page: Page): Promise<void> {
  const busy = page.locator('[aria-busy="true"]');
  try {
    await expect(busy).toHaveCount(0);
    await expect(page.getByRole('heading').first()).toBeVisible();
  } catch (error: unknown) {
    const html = await busy.evaluateAll(nodes => nodes.map(node => node.outerHTML.slice(0, 240))).catch(() => []);
    const cause = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    throw new Error(`page is still a skeleton or has no heading\n  url: ${page.url()}\n  busy: ${JSON.stringify(html)}\n  cause: ${cause}`);
  }
}

function destination(role: Screen['role'], path: string): string {
  if (path === '') return role === 'owner' ? '/coach' : '/app/today';
  if (role === 'owner' && (path === '/app' || path.startsWith('/app/'))) return '/coach';
  if (role === 'client' && (path === '/coach' || path.startsWith('/coach/'))) return '/app/today';
  return path === '/app' ? '/app/today' : path;
}

test.beforeAll(async ({}, testInfo) => {
  if (!testInfo.config.configFile) throw new Error('Run screenshots with apps/web/playwright.config.ts.');
  // Resolve from the config directory (apps/web), regardless of the caller's working directory.
  screensDirectory = resolve(dirname(testInfo.config.configFile), '../../docs/qa/screens');
  await mkdir(screensDirectory, { recursive: true });
});

test.afterAll(async () => {
  if (!screensDirectory || only.length > 0) return;
  const rows = screens.map((screen) => {
    const image = screen.saved ? `[${screen.image}](${screen.image})` : `${screen.image} (not captured)`;
    return `| ${image} | ${screen.role} | ${screen.route} | ${screen.locale} | ${screen.width} | ${screen.finalRoute} | ${screen.pageChecks} | ${screen.overflow} |`;
  });
  await writeFile(join(screensDirectory, 'index.md'), [
    'الملف ده فيه صور شاشات المعاينة بالعربي والإنجليزي على الموبايل والكمبيوتر.',
    '',
    '# Preview screenshots',
    '',
    'Generated by apps/web/e2e/screens.spec.ts. Only linked images were captured in this run.',
    'Landing and /app redirect; access to the other role’s area redirects to the signed-in user’s own area.',
    'Final route records the page actually shown. Matching-role unknown paths show the not-found state.',
    'Page checks cover the expected redirect, visible content, completed loading, language and direction.',
    'Overflow PASS means document.documentElement.scrollWidth <= window.innerWidth + 1; FAIL fails the test.',
    'NOT CHECKED means the page could not be measured. Old PNGs may still exist.',
    `Captured ${screens.filter((screen) => screen.saved).length} of ${actors.reduce((sum, actor) => sum + actorRoutes(actor.role).length, 0) * locales.length * viewports.length} expected screenshots.`,
    '',
    '| Image | Role | Requested route | Locale | Width (px) | Final route | Page checks | No horizontal overflow |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'), 'utf8');
});

test('capture every route for both demo roles, locales and viewport widths', async ({ browser, baseURL }) => {
  if (!screensDirectory || !baseURL) throw new Error('Screenshot directory and baseURL must be configured.');
  const outputDirectory = screensDirectory;

  // Warm-up: the first request to each route makes the dev server compile it, which can take longer than the page
  // checks allow. Visit every route once per role (the compile is locale- and viewport-independent) before capturing.
  for (const actor of actors) {
    const context = await browser.newContext({ baseURL });
    try {
      const login = await context.request.post('/api/dev-login', { data: { userId: actor.userId, locale: 'ar' }, maxRedirects: 0 });
      expect(login.status(), 'Dev login must issue a redirect; run both database seeds first.').toBe(303);
      for (const route of actorRoutes(actor.role).filter(route => wantedRoute(actor.role, route.slug))) {
        await context.request.get(`/ar${route.path}`, { timeout: 240_000, failOnStatusCode: false }).catch(() => undefined);
      }
    } finally {
      await context.close();
    }
  }

  // A single test keeps every soft overflow failure in one worker, so afterAll writes one complete index.
  for (const actor of actors) {
    for (const locale of locales) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ baseURL, viewport, reducedMotion: 'reduce' });
        try {
          const login = await context.request.post('/api/dev-login', {
            data: { userId: actor.userId, locale },
            maxRedirects: 0,
          });
          expect(login.status(), 'Dev login must issue a redirect; run both database seeds first.').toBe(303);
          expect(new URL(login.headers()['location'] ?? '', baseURL).pathname)
            .toBe(`/${locale}${actor.role === 'owner' ? '/coach' : '/app/today'}`);
          expect((await context.cookies()).some((cookie) => cookie.name === 'dawlyy_dev_session'),
            'Dev login must set its session cookie in the browser context.').toBe(true);
          await login.dispose();
          const page = await context.newPage();

          for (const route of actorRoutes(actor.role)) {
            const requestedRoute = `/${locale}${route.path}`;
            if (!wanted(`${actor.role}-${route.slug}-${locale}-${viewport.width}.png`)) continue;
            const screen: Screen = {
              image: `${actor.role}-${route.slug}-${locale}-${viewport.width}.png`,
              role: actor.role,
              route: requestedRoute,
              locale,
              width: viewport.width,
              finalRoute: 'Not visited',
              pageChecks: 'FAIL',
              saved: false,
              overflow: 'NOT CHECKED',
            };
            screens.push(screen);
            await test.step(`${actor.role} ${requestedRoute} ${viewport.width}px`, async () => {
              try {
                await page.goto(requestedRoute, { waitUntil: 'load' });
                // The first visit of a run waits for a cold `next dev` compile of the redirect target (more than 45 s seen).
                await expect(page).toHaveURL(expectedUrl(actor.role, route.path, baseURL, locale), { timeout: 150_000 });
                await assertSettled(page);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await page.evaluate(async () => { await document.fonts.ready; });
                screen.pageChecks = 'PASS';
              } catch (error: unknown) {
                // Still capture the visible result when a page check fails, and keep the test failing.
                // Name the cause in the message: the page URL and the HTML of every element still marked busy.
                const busy = await page.locator('[aria-busy="true"]')
                  .evaluateAll(nodes => nodes.map(node => node.outerHTML.slice(0, 240))).catch(() => []);
                expect.soft(false, `${screen.image}: ${error instanceof Error ? error.message : String(error)}\n  url: ${page.url()}\n  busy: ${JSON.stringify(busy)}`).toBe(true);
              }
              try {
                screen.finalRoute = new URL(page.url()).pathname;
                const dimensions = await page.evaluate(() => ({
                  scrollWidth: document.documentElement.scrollWidth,
                  viewportWidth: window.innerWidth,
                }));
                screen.overflow = dimensions.scrollWidth <= dimensions.viewportWidth + 1 ? 'PASS' : 'FAIL';
                await page.screenshot({ path: join(outputDirectory, screen.image), fullPage: true, animations: 'disabled' });
                screen.saved = true;
                expect.soft(dimensions.scrollWidth, `${screen.image}: horizontal overflow`)
                  .toBeLessThanOrEqual(dimensions.viewportWidth + 1);
              } catch (error: unknown) {
                screen.finalRoute = new URL(page.url()).pathname;
                // Keep visiting the remaining routes and make navigation/capture failures fail this run.
                expect.soft(false, `${screen.image}: ${error instanceof Error ? error.message : String(error)}`).toBe(true);
              }
            });
          }
        } finally {
          await context.close();
        }
      }
    }
  }
  if (only.length > 0) {
    expect(screens, `SCREENS_ONLY=${only.join(',')} matched no screen`).not.toHaveLength(0);
    expect(screens.filter((screen) => screen.saved)).toHaveLength(screens.length);
    return;
  }
  expect(screens.filter((screen) => screen.saved)).toHaveLength(actors.reduce((sum, actor) => sum + actorRoutes(actor.role).length, 0) * locales.length * viewports.length);
});
