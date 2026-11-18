import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createTranslator } from 'next-intl';
import { api, browserHealth, button, devLogin, labelPrefix, visit, type Locale } from './helpers';

// P9 only: run after integration/r4b.md is applied. The public seeded demo actors match R2a/R2b.
// Every message below carries a per-run marker, so a rerun never matches an earlier run's message.
const CLIENT = 'd0250000-0000-4000-8000-000000000103';
const OWNER = 'd0250000-0000-4000-8000-000000000101';
// The brief's promise: the review flow takes at most 70% of the manual flow's time (a 30% saving).
const TARGET_RATIO = 0.7;

function catalog(locale: Locale, namespace: string) {
  const messages = JSON.parse(readFileSync(join(process.cwd(), 'messages', locale, `${namespace}.json`), 'utf8'));
  return createTranslator({ locale, messages, onError: error => { throw error; } });
}
type Draft = { id: string; status: string; text: string };
type Flag = { id: string; category: string };

for (const locale of ['ar', 'en'] as const) {
  test.describe(`R4b weekly review approve and send @${locale}`, () => {
    test.describe.configure({ mode: 'serial' });
    let coachContext: BrowserContext, clientContext: BrowserContext, coach: Page, client: Page;
    let clientId: string, conversationId: string;
    const marker = `R4b ${locale} ${randomUUID()}`;
    const r = catalog(locale, 'review'), m = catalog(locale, 'messaging');
    const base = () => `/clients/${clientId}/review`;
    const url = () => `/coach${base()}`;
    test.beforeAll(async ({ browser, baseURL }) => {
      coachContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale, timezoneId: 'Africa/Cairo' });
      clientContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale, timezoneId: 'Africa/Cairo' });
      for (const context of [coachContext, clientContext]) { context.setDefaultTimeout(60_000); context.setDefaultNavigationTimeout(240_000); }
      await devLogin(coachContext, OWNER, locale); await devLogin(clientContext, CLIENT, locale);
      coach = await coachContext.newPage(); client = await clientContext.newPage();
      clientId = (await api<{ clientId: string }>(client, 'GET', '/me')).clientId;
      const opened = await coach.request.fetch('/api/v1/conversations', { method: 'POST', data: { clientId }, headers: { 'Idempotency-Key': randomUUID() } });
      expect([200, 201]).toContain(opened.status());
      conversationId = (await opened.json() as { conversation: { id: string } }).conversation.id; await opened.dispose();
    });
    test.afterAll(async () => { await coachContext?.close(); await clientContext?.close(); });

    /** The client's own view of the thread: exactly what a client would read. */
    async function clientBodies(): Promise<string[]> {
      const thread = await api<{ items: { body: string | null }[] }>(client, 'GET', `/conversations/${conversationId}/messages?limit=50`);
      return thread.items.map(item => item.body ?? '');
    }
    /** Handle every open flag through the real endpoint so each test starts from a known, flag-free client. */
    async function clearFlags() {
      const open = await api<{ items: Flag[] }>(coach, 'GET', `/red-flags?status=open&clientId=${clientId}&limit=100`);
      for (const flag of open.items) await api(coach, 'POST', `/red-flags/${flag.id}/handle`, 200);
    }
    const reply = (page: Page) => page.getByRole('main').getByRole('textbox', { name: labelPrefix(r('reply.label')) });
    async function build(page: Page) {
      const created = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1${base()}`);
      await page.getByRole('main').getByRole('button', { name: new RegExp(`^(?:${r('build')}|${r('rebuild')})$`) }).first().click();
      expect((await created).status()).toBe(201);
      await expect(reply(page)).toBeVisible();
    }
    function approval(page: Page) {
      return page.waitForResponse(response => response.request().method() === 'POST' && /\/api\/v1\/clients\/[^/]+\/review\/[^/]+\/approve$/.test(new URL(response.url()).pathname));
    }

    test('Inbox -> review -> edit -> approve and send: the client reads exactly that message, timed against the manual route', async () => {
      const healthy = browserHealth(coachContext, locale);
      try {
        await clearFlags();
        // Current flow. The timer starts when the coach opens the client's evidence and stops at the confirmed send.
        await visit(coach, locale, '/coach/inbox');
        const action = coach.locator(`a[href$="/coach${base()}"]`).first();
        const viaInbox = await action.count() > 0;
        const startedCurrent = performance.now();
        if (viaInbox) { await action.click(); await expect(coach).toHaveURL(target => target.pathname === `/${locale}${url()}`); }
        else await visit(coach, locale, url());
        await build(coach);
        const box = reply(coach); const generated = await box.inputValue();
        const finalText = `${generated.trim()}\n${marker}`;
        await box.fill(finalText);
        const sent = approval(coach);
        await button(coach, r('reply.approve')).click();
        const response = await sent; expect(response.status()).toBe(200);
        const result = await response.json() as { status: string; conversationId: string; messageId: string };
        expect(result).toMatchObject({ status: 'approved', conversationId });
        await expect(coach.getByRole('main').getByText(new RegExp(`^(?:${r('reply.sent')}|${r('reply.sentNotNotified')})$`))).toBeVisible();
        const currentMs = Math.round(performance.now() - startedCurrent);
        await expect(coach.locator('[aria-busy="true"]')).toHaveCount(0);

        // The client sees exactly the edited prose, once.
        const bodies = await clientBodies();
        expect(bodies.filter(body => body === finalText.trim())).toHaveLength(1);

        // A repeated click is the same message, not a second one.
        const again = await coach.request.fetch(`/api/v1${base()}/${(await api<{ draft: Draft }>(coach, 'GET', base())).draft.id}/approve`,
          { method: 'POST', data: {}, headers: { 'Idempotency-Key': randomUUID() } });
        expect(again.status()).toBe(200); expect((await again.json() as { messageId: string }).messageId).toBe(result.messageId); await again.dispose();
        expect((await clientBodies()).filter(body => body === finalText.trim())).toHaveLength(1);

        // Manual baseline on the same seeded client: client hub -> Messages -> thread -> type the same text -> Send.
        const manualText = `${finalText.trim()} (manual)`;
        const startedManual = performance.now();
        await visit(coach, locale, `/coach/clients/${clientId}`);
        await visit(coach, locale, '/coach/messages');
        await coach.locator(`a[href$="/coach/messages/${conversationId}"]`).first().click();
        await expect(coach).toHaveURL(target => target.pathname === `/${locale}/coach/messages/${conversationId}`);
        await coach.getByRole('textbox', { name: labelPrefix(m('thread.composerLabel')) }).fill(manualText);
        const manualSend = coach.waitForResponse(item => item.request().method() === 'POST' && new URL(item.url()).pathname === `/api/v1/conversations/${conversationId}/messages`);
        await coach.getByRole('button', { name: m('thread.send'), exact: true }).click();
        expect([200, 201]).toContain((await manualSend).status());
        await expect(coach.getByText(manualText, { exact: true })).toBeVisible();
        const manualMs = Math.round(performance.now() - startedManual);

        const ratio = manualMs > 0 ? currentMs / manualMs : Number.NaN;
        const evidence = { locale, viaInbox, currentMs, baselineMs: manualMs, ratio: Number(ratio.toFixed(3)), targetRatio: TARGET_RATIO, samples: 1 };
        await test.info().attach('r4b-review-timing', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
        test.info().annotations.push({ type: 'r4b-timing', description: JSON.stringify(evidence) });
        if (!viaInbox) test.info().annotations.push({ type: 'r4b-inbox-link-missing', description: 'The seeded client had no review action in the Inbox; the route was opened directly.' });
        // The 30% promise is asserted only from this comparable measured baseline (same client, same start/end, same text).
        expect(Number.isFinite(ratio), 'A comparable manual baseline must be measured').toBe(true);
        expect(ratio, `review ${currentMs} ms vs manual ${manualMs} ms`).toBeLessThanOrEqual(TARGET_RATIO);
        for (const width of [360, 390, 430]) {
          await coach.setViewportSize({ width, height: 844 }); await visit(coach, locale, url());
          expect(await coach.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
        }
      } finally { await healthy(); }
    });

    test('a client pain message raises a flag, the review blocks, handling it and rebuilding allows approval', async () => {
      await clearFlags();
      const sentBefore = (await clientBodies()).length;
      await api(client, 'POST', `/conversations/${conversationId}/messages`, 201, { body: `${marker} sharp knee pain when I squat`, clientUuid: randomUUID() });
      const flags = await api<{ items: Flag[] }>(coach, 'GET', `/red-flags?status=open&clientId=${clientId}&limit=100`);
      expect(flags.items.map(flag => flag.category)).toContain('pain_injury');

      await visit(coach, locale, '/coach/inbox');
      await expect(coach.locator(`a[href*="/coach/clients/${clientId}"]`).first()).toBeVisible();

      await visit(coach, locale, url());
      await build(coach);
      // Blocked: the control exists, advice cannot be sent, and the server refuses a forced approval.
      await expect(button(coach, r('reply.approve'))).toBeDisabled();
      await expect(coach.getByRole('main').getByText(r('flags.category.pain_injury'))).toBeVisible();
      const draft = (await api<{ draft: Draft }>(coach, 'GET', base())).draft;
      const forced = await coach.request.fetch(`/api/v1${base()}/${draft.id}/approve`, { method: 'POST', data: {}, headers: { 'Idempotency-Key': randomUUID() } });
      expect(forced.status()).toBe(409); expect(await forced.json()).toMatchObject({ error: { code: 'red_flags_open' } }); await forced.dispose();
      expect((await clientBodies()).length).toBe(sentBefore + 1); // only the client's own pain message

      const handled = coach.waitForResponse(response => response.request().method() === 'POST' && /\/api\/v1\/red-flags\/[^/]+\/handle$/.test(new URL(response.url()).pathname));
      await button(coach, r('flags.handle')).first().click();
      expect((await handled).status()).toBe(200);
      // Handling changes the inputs: the old review is not approvable until rebuilt.
      await expect(button(coach, r('reply.approve'))).toBeDisabled();
      await build(coach);
      await expect(button(coach, r('reply.approve'))).toBeEnabled();
      const sent = approval(coach);
      await button(coach, r('reply.approve')).click();
      expect((await sent).status()).toBe(200);
      await expect(coach.locator('[aria-busy="true"]')).toHaveCount(0);
    });

    test('an intervening source correction answers 409 review_stale, persists stale and sends nothing', async () => {
      await clearFlags();
      await visit(coach, locale, url());
      await build(coach);
      const before = await clientBodies();
      // A new client weight entry changes the evidence between build and approval.
      await api(client, 'POST', '/metrics', 201, { metric: 'weight', value: 71.3, unit: 'kg', recordedAt: new Date().toISOString(), timezone: 'Africa/Cairo', clientUuid: randomUUID() });
      const sent = approval(coach);
      await button(coach, r('reply.approve')).click();
      const response = await sent; expect(response.status()).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'review_stale' } });
      await expect(coach.getByRole('main').getByText(r('stale'), { exact: true }).first()).toBeVisible();
      await expect(button(coach, r('reply.approve'))).toBeDisabled();
      expect((await api<{ draft: Draft }>(coach, 'GET', base())).draft.status).toBe('stale');
      expect(await clientBodies()).toEqual(before);
      // Rebuilding produces a fresh draft that can be approved.
      await build(coach);
      await expect(button(coach, r('reply.approve'))).toBeEnabled();
      await expect(coach.locator('[aria-busy="true"]')).toHaveCount(0);
    });
  });
}
