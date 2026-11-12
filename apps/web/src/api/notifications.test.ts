import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { clients, memberships, notificationDeliveries, notifications, pushSubscriptions, userPreferences } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { processDeliveries } from '../server/notify/process';
import { app } from './index';

const listSchema = z.object({ items: z.array(z.object({ id: z.string(), readAt: z.string().nullable(), title: z.object({ en: z.string().optional() }) }).passthrough()), nextCursor: z.string().nullable(), unreadCount: z.number() });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });
const keys = { p256dh: 'BPkey', auth: 'authkey' };

describe('Task 9 notifications API and delivery processing', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  let tenantId: string; let owner: string; let clientId: string; let userA: string; let userB: string;
  beforeEach(async () => {
    // No provider keys: nothing may ever be sent from a test run.
    for (const name of ['RESEND_API_KEY', 'EMAIL_FROM', 'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT']) vi.stubEnv(name, '');
    fixture = await setupApiFixture();
    tenantId = fixture.owner.tenantId; owner = fixture.owner.userId;
    userA = randomUUID(); userB = randomUUID();
    await setupApiData(tenantId, 'notification fixture', async tx => {
      const [client] = await tx.insert(clients).values({ tenantId, firstName: 'Alice' }).returning({ id: clients.id });
      if (!client) throw new Error('Missing client');
      clientId = client.id;
      const other = await tx.insert(clients).values({ tenantId, firstName: 'Bola' }).returning({ id: clients.id });
      await tx.insert(memberships).values([
        { tenantId, userId: userA, role: 'client', status: 'active', clientId, displayName: 'Alice' },
        { tenantId, userId: userB, role: 'client', status: 'active', clientId: other[0]?.id ?? clientId, displayName: 'Bola' },
      ]);
    });
  });
  afterEach(async () => { vi.unstubAllEnvs(); await fixture?.cleanup(); });

  const base = '/api/v1/notifications';
  const select = <T>(fn: (tx: Parameters<Parameters<typeof setupApiData>[2]>[0]) => Promise<T>) => setupApiData(tenantId, 'notification read-back', fn);
  async function conversationWithMessage(text = 'Hello') {
    const opened = await call(app, 'POST', '/api/v1/conversations', { as: owner, body: { clientId } });
    const id = z.object({ id: z.string() }).parse(opened.json).id;
    expect((await call(app, 'POST', `/api/v1/conversations/${id}/messages`, { as: owner, body: { body: text, clientUuid: randomUUID() } })).status).toBe(201);
    return id;
  }
  async function subscribe(as: string, endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`) {
    const response = await call(app, 'POST', `${base}/push-subscriptions`, { as, body: { endpoint, keys } });
    return { response, endpoint };
  }

  it('lists only the caller\'s notifications with an unread count, and marks one or all read', async () => {
    await conversationWithMessage('One'); await conversationWithMessage('Two');
    const list = listSchema.parse((await call(app, 'GET', base, { as: userA })).json);
    expect(list.items).toHaveLength(2);
    expect(list.unreadCount).toBe(2);
    expect(list.items[0]?.title.en).toBe('New message from API test owner');
    expect(JSON.stringify(list)).not.toContain('dedupe');
    expect(listSchema.parse((await call(app, 'GET', base, { as: userB })).json).items).toHaveLength(0);
    const first = list.items[0]?.id ?? '';
    expect((await call(app, 'POST', `${base}/${first}/read`, { as: userB })).status).toBe(404);
    expect((await call(app, 'POST', `${base}/${first}/read`, { as: userA })).status).toBe(200);
    expect(listSchema.parse((await call(app, 'GET', `${base}?unread=true`, { as: userA })).json).items).toHaveLength(1);
    const all = await call(app, 'POST', `${base}/read-all`, { as: userA });
    expect(all.json).toEqual({ updated: 1 });
    expect(listSchema.parse((await call(app, 'GET', base, { as: userA })).json).unreadCount).toBe(0);
    expect(listSchema.parse((await call(app, 'GET', `${base}?limit=1`, { as: userA })).json).nextCursor).not.toBeNull();
  });

  it('stores preferences, merges channels and validates quiet hours', async () => {
    const empty = await call(app, 'GET', `${base}/preferences`, { as: userA });
    expect(empty.json).toMatchObject({ preferences: {}, effective: { channels: { inapp: true, webpush: true, email: true } } });
    const saved = await call(app, 'PUT', `${base}/preferences`, { as: userA, body: { locale: 'en', quietHours: { start: '22:00', end: '07:00' }, channels: { email: false } } });
    expect(saved.status).toBe(200);
    expect(saved.json).toMatchObject({ preferences: { locale: 'en', quietHours: { start: '22:00', end: '07:00' }, channels: { email: false } } });
    const merged = await call(app, 'PUT', `${base}/preferences`, { as: userA, body: { channels: { webpush: false }, quietHours: null } });
    expect(merged.json).toMatchObject({ preferences: { locale: 'en', channels: { email: false, webpush: false } }, effective: { channels: { inapp: true, email: false, webpush: false } } });
    expect(z.object({ preferences: z.object({ quietHours: z.unknown().optional() }) }).parse(merged.json).preferences.quietHours).toBeUndefined();
    for (const bad of [{ quietHours: { start: '25:00', end: '07:00' } }, { timezone: 'Mars/Base' }, { locale: 'fr' }, { surprise: true }]) {
      expect((await call(app, 'PUT', `${base}/preferences`, { as: userA, body: bad })).status).toBe(400);
    }
    expect((await select(tx => tx.select().from(userPreferences).where(eq(userPreferences.userId, userA))))).toHaveLength(1);
  });

  it('accepts https push subscriptions only, and only the owner can delete one', async () => {
    const plain = await call(app, 'POST', `${base}/push-subscriptions`, { as: userA, body: { endpoint: 'http://push.example.test/e', keys } });
    expect(plain.status).toBe(422);
    expect(errorSchema.parse(plain.json).error.code).toBe('invalid_push_endpoint');
    const { response, endpoint } = await subscribe(userA);
    expect(response.status).toBe(201);
    const id = z.object({ id: z.string() }).parse(response.json).id;
    expect(await select(tx => tx.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userA)))).toEqual([{ endpoint }]);
    expect((await call(app, 'DELETE', `${base}/push-subscriptions/${id}`, { as: userB })).status).toBe(404);
    expect(await select(tx => tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.id, id)))).toHaveLength(1);
    expect((await call(app, 'DELETE', `${base}/push-subscriptions/${id}`, { as: userA })).status).toBe(200);
    expect(await select(tx => tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.id, id)))).toHaveLength(0);
  });

  it('without keys: email is a log-only sent row, push is cancelled, and a second run changes nothing', async () => {
    expect((await subscribe(userA)).response.status).toBe(201);
    await conversationWithMessage();
    const rows = () => select(tx => tx.select({ id: notificationDeliveries.id, channel: notificationDeliveries.channel, state: notificationDeliveries.state, attempts: notificationDeliveries.attempts, providerRef: notificationDeliveries.providerRef, lastError: notificationDeliveries.lastError, sentAt: notificationDeliveries.sentAt })
      .from(notificationDeliveries).where(eq(notificationDeliveries.userId, userA)).orderBy(notificationDeliveries.channel));
    const before = await rows();
    expect(Object.fromEntries(before.map(row => [row.channel, row.state]))).toEqual({ inapp: 'delivered', webpush: 'queued', email: 'queued' });
    const first = await processDeliveries({ tenantId });
    expect(first).toEqual({ claimed: 2, sent: 1, cancelled: 1, failed: 0, retried: 0 });
    const after = await rows();
    expect(after.find(row => row.channel === 'email')).toMatchObject({ state: 'sent', providerRef: 'local-log', attempts: 1, lastError: null });
    expect(after.find(row => row.channel === 'email')?.sentAt).not.toBeNull();
    expect(after.find(row => row.channel === 'webpush')).toMatchObject({ state: 'cancelled', lastError: 'push_not_configured', attempts: 1 });
    expect(after.find(row => row.channel === 'inapp')).toMatchObject({ state: 'delivered', attempts: 0 });
    const second = await processDeliveries({ tenantId });
    expect(second).toEqual({ claimed: 0, sent: 0, cancelled: 0, failed: 0, retried: 0 });
    expect(await rows()).toEqual(after);
  });

  it('never double-sends when two passes race for the same rows', async () => {
    await conversationWithMessage();
    const sentRefs: string[] = [];
    const email = { mode: 'live' as const, async send(message: { idempotencyKey: string }) { sentRefs.push(message.idempotencyKey); return { providerRef: 'fake-ref' }; } };
    await setupApiData(tenantId, 'give the client an address', async tx => { await tx.update(memberships).set({ email: 'alice@example.test' }).where(eq(memberships.userId, userA)); });
    const results = await Promise.all([processDeliveries({ tenantId, email, push: null }), processDeliveries({ tenantId, email, push: null })]);
    expect(results.reduce((sum, item) => sum + item.sent, 0)).toBe(1);
    expect(sentRefs).toHaveLength(1);
    const [row] = await select(tx => tx.select({ state: notificationDeliveries.state, providerRef: notificationDeliveries.providerRef }).from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.userId, userA), eq(notificationDeliveries.channel, 'email'))));
    expect(row).toEqual({ state: 'sent', providerRef: 'fake-ref' });
  });

  it('retries a failing provider, then gives up as failed after the third attempt', async () => {
    await conversationWithMessage();
    const email = { mode: 'live' as const, async send(): Promise<{ providerRef: string }> { throw new Error('provider down'); } };
    await setupApiData(tenantId, 'give the client an address', async tx => { await tx.update(memberships).set({ email: 'alice@example.test' }).where(eq(memberships.userId, userA)); });
    const emailRow = () => select(tx => tx.select({ state: notificationDeliveries.state, attempts: notificationDeliveries.attempts, lastError: notificationDeliveries.lastError, scheduledFor: notificationDeliveries.scheduledFor }).from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.userId, userA), eq(notificationDeliveries.channel, 'email')))).then(rows => rows[0]);
    const start = new Date();
    expect(await processDeliveries({ tenantId, email, push: null, now: start })).toMatchObject({ retried: 1, failed: 0 });
    expect(await emailRow()).toMatchObject({ state: 'queued', attempts: 1, lastError: 'provider down' });
    expect(await processDeliveries({ tenantId, email, push: null, now: start })).toMatchObject({ claimed: 0 });
    expect(await processDeliveries({ tenantId, email, push: null, now: new Date(start.getTime() + 6 * 60_000) })).toMatchObject({ retried: 1 });
    expect(await processDeliveries({ tenantId, email, push: null, now: new Date(start.getTime() + 20 * 60_000) })).toMatchObject({ failed: 1 });
    expect(await emailRow()).toMatchObject({ state: 'failed', attempts: 3, lastError: 'provider down' });
    expect(await processDeliveries({ tenantId, email, push: null, now: new Date(start.getTime() + 60 * 60_000) })).toMatchObject({ claimed: 0 });
  });

  it('defers email and push during quiet hours but never the in-app notification, and skips switched-off channels', async () => {
    const clock = new Date();
    const hhmm = (offsetMinutes: number) => { const total = ((clock.getUTCHours() * 60 + clock.getUTCMinutes() + offsetMinutes) % 1440 + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };
    expect((await call(app, 'PUT', `${base}/preferences`, { as: userA, body: { timezone: 'UTC', quietHours: { start: hhmm(-30), end: hhmm(90) } } })).status).toBe(200);
    expect((await subscribe(userA)).response.status).toBe(201);
    await conversationWithMessage();
    const queued = await select(tx => tx.select().from(notificationDeliveries).where(eq(notificationDeliveries.userId, userA)));
    const inapp = queued.find(row => row.channel === 'inapp');
    expect(inapp).toMatchObject({ state: 'delivered' });
    for (const channel of ['email', 'webpush'] as const) {
      const row = queued.find(item => item.channel === channel);
      expect(row?.state).toBe('queued');
      expect((row?.scheduledFor.getTime() ?? 0) - clock.getTime()).toBeGreaterThan(60 * 60_000);
    }
    expect((await select(tx => tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.userId, userA))))).toHaveLength(1);
    expect(await processDeliveries({ tenantId })).toMatchObject({ claimed: 0 });
    expect(await processDeliveries({ tenantId, now: new Date(clock.getTime() + 2 * 3_600_000) })).toMatchObject({ claimed: 2 });
    await call(app, 'PUT', `${base}/preferences`, { as: userA, body: { quietHours: null, channels: { email: false, webpush: false } } });
    await conversationWithMessage('Again');
    const channels = (await select(tx => tx.select({ channel: notificationDeliveries.channel }).from(notificationDeliveries).where(eq(notificationDeliveries.userId, userA)))).map(row => row.channel).sort();
    expect(channels).toEqual(['email', 'inapp', 'inapp', 'webpush']);
  });

  it('refuses callers without a session', async () => {
    expect((await call(app, 'GET', base)).status).toBe(401);
    expect((await call(app, 'POST', `${base}/read-all`)).status).toBe(401);
  });
});
