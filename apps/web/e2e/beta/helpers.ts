import { expect, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Task 12: the two catalog-backed beta gate languages. */
export type Locale = 'ar' | 'en';

/** Task 12: load actual product catalogs at runtime; ICU formatting stays identical to next-intl. */
export async function labels(locale: Locale) {
  // Playwright loads specs as native ESM, where a bare JSON import needs an attribute: read the files instead.
  const catalogs: Record<string, unknown> = {};
  for (const name of ['auth', 'billing', 'clients', 'packages', 'programs', 'nutrition', 'forms', 'workout', 'client', 'status']) {
    catalogs[name] = JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${name}.json`), 'utf8'));
  }
  return (path: string, values: Record<string, string | number> = {}): string => {
    let value: unknown = catalogs;
    for (const key of path.split('.')) {
      if (!value || typeof value !== 'object' || !(key in value)) throw new Error(`Missing ${locale} catalog key: ${path}`);
      value = (value as Record<string, unknown>)[key];
    }
    if (typeof value !== 'string') throw new Error(`Not a catalog string: ${path}`);
    return createTranslator({ locale, messages: { label: value }, onError: error => { throw error; } })('label', values);
  };
}

/** Task 12: use native demo login with context-shared cookies, as in offline-workout.spec.ts. */
export async function devLogin(context: BrowserContext, userId: string, locale: Locale): Promise<void> {
  const response = await context.request.post('/api/dev-login', {
    data: { userId, locale }, maxRedirects: 0,
  });
  try {
    expect(response.status(), 'Dev login must issue a session redirect for this identity.').toBe(303);
    expect((await context.cookies()).some(cookie => cookie.name === 'dawlyy_dev_session')).toBe(true);
  } finally { await response.dispose(); }
}

function redact(message: string): string {
  return message.replace(/\/invite\/[^\s"'<>]+/g, '/invite/[redacted]')
    .replace(/\/(local-upload|local-download)\/[^\s"'<>]+/g, '/$1/[redacted]');
}

/** Task 12 step 10: observe every page (including popups); never ignore ordinary network/React errors. */
export function browserHealth(context: BrowserContext, locale: Locale) {
  const errors: string[] = [];
  const observed = new Set<Page>();
  const failures: string[] = [];
  function observe(page: Page) {
    if (observed.has(page)) return;
    observed.add(page);
    page.on('response', response => {
      if (response.status() >= 400) failures.push(redact(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`));
    });
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // The only permitted exception: Playwright's screenshot caret CSS hydration diagnostic.
      // This suite does not take screenshots, so ordinarily even this exception is unused.
      if (/caret-color/.test(text) && /hydrat/i.test(text) && /(?:Playwright|screenshot)/i.test(text)) return;
      // Second permitted exception: Next's development-only instant-navigation diagnostic, replayed from the server
      // console. The same rule is enforced for production by `next build` (check build-web), which prerenders every route.
      if (/^Error: Route "[^"]+": (?:Next\.js encountered uncached data during prerendering or a navigation|Could not validate that a segment in your UI has instant navigation)\./.test(text)) return;
      // Browser 'Failed to load resource' lines carry no URL: name the most recent failing requests.
      errors.push(redact(/^Failed to load resource/.test(text) ? `${text} (recent failing requests: ${failures.slice(-3).join('; ')})` : text));
    });
    page.on('pageerror', error => { errors.push(redact(error.message)); });
  }
  context.on('page', observe);
  context.pages().forEach(observe);
  return async () => {
    try {
      for (const page of observed) {
        if (page.isClosed() || page.url() === 'about:blank') continue;
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
        await page.evaluate(async () => { await document.fonts.ready; });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
          { message: 'No horizontal overflow at the current viewport' }).toBeLessThanOrEqual(1);
      }
    } finally { expect(errors, 'Browser console errors and uncaught page errors').toEqual([]); }
  };
}

/** Task 12: UI navigation also checks locale and overflow before interacting with the next screen. */
export async function visit(page: Page, locale: Locale, path: string): Promise<void> {
  const response = await page.goto(`/${locale}${path}`, { waitUntil: 'load' });
  expect(response?.ok(), `Screen ${path} must load successfully`).toBe(true);
  await expect(page).toHaveURL(url => url.pathname === `/${locale}${path}`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

/** Task 12: synchronise UI mutations with their exact API operation, asserting status without logging secrets. */
export async function mutation<T>(page: Page, method: string, path: string, status: number, action: () => Promise<unknown>): Promise<T> {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1${path}`
    && response.request().method() === method);
  const [response] = await Promise.all([pending, action()]);
  expect(response.status(), `${method} ${path} status`).toBe(status);
  return await response.json() as T;
}

/** Task 12: API fallbacks use the signed-in page's context, real routes, and unique mutation keys. */
export async function api<T>(page: Page, method: 'GET' | 'POST' | 'PUT', path: string, status = 200, body?: unknown): Promise<T> {
  const response = await page.request.fetch(`/api/v1${path}`, {
    method, ...(body === undefined ? {} : { data: body }),
    headers: method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() },
  });
  try {
    expect(response.status(), `${method} ${path} status`).toBe(status);
    return await response.json() as T;
  } finally { await response.dispose(); }
}

/** Task 12: exact accessible button selectors, scoped to main to avoid navigation duplicates. */
export function button(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('button', { name, exact: true });
}

/** Task 12: Cairo calendar date follows the existing online/offline session convention. */
export function cairoToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => {
    const value = parts.find(item => item.type === type)?.value;
    if (!value) throw new Error(`Missing date part ${type}`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Task 12: independent calendar-day expectation, avoiding app date arithmetic in assertions. */
export function plusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Task 12: BillingDate displays locale medium dates with a UTC calendar boundary. */
export function billingDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

/** Task 12: deterministic, generated 1×1 RGBA PNG uploaded through the real local storage adapter. */
export function proofPng(): Buffer {
  function chunk(type: string, data: Buffer): Buffer {
    const bytes = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, bytes, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 16, 128, 64, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

/** Task 12: consume an observed response without including payloads in failure messages. */
export async function responseJson<T>(response: Response, status: number): Promise<T> {
  expect(response.status(), 'Observed API response status').toBe(status);
  return await response.json() as T;
}
