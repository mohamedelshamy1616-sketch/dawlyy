import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { calendarEvents, subscriptions, subscriptionEvents, payments, tenants } from '@dawlyy/db/schema';
import { addDays } from '@dawlyy/core/schedule';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { call, setupApiData } from '../test/api-harness';
import { setupBillingFixture } from '../server/subscriptions/test-fixture';
import { syncSubscriptionCalendar } from '../server/subscriptions/calendar';
import { requireAuthMiddleware } from './middleware/auth';
import { requireActiveAccess } from './middleware/access';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

type Sale = { subscription: { id: string; state: string; endsOn: string }; payment: { id: string; receiptNo: string | null; state: string } | null; renewalDate: string; accessStatus: { daysLeft: number } };

describe.runIf(Boolean(process.env.DATABASE_URL))('T3b subscription money path and lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof setupBillingFixture>>;
  let app: (typeof import('./index'))['app'];
  beforeAll(async () => { vi.stubEnv('DAWLYY_DEV_LOGIN', '0'); fixture = await setupBillingFixture(); app = (await import('./index')).app; });
  afterAll(async () => { try { await fixture?.cleanup(); } finally { await (await import('@dawlyy/db')).closeDb(); vi.unstubAllEnvs(); } });

  async function sell(verified = false, clientId?: string) {
    const result = await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId,
      body: { clientId: clientId ?? fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today,
        payment: { amount: '300.00', currency: 'EGP', method: 'instapay', markVerified: verified } } });
    expect(result.status).toBe(201); return result.json as Sale;
  }

  it('sells pending, verifies separately, generates package events, and syncs without duplicates', async () => {
    const sale = await sell(); expect(sale.subscription.state).toBe('pending'); expect(sale.payment?.state).toBe('pending'); expect(sale.payment?.receiptNo).toBeNull();
    expect(sale.renewalDate).toBe(addDays(fixture.today, 29)); expect(sale.accessStatus.daysLeft).toBe(28);
    const verified = await call(app, 'POST', `/api/v1/payments/${sale.payment!.id}/verify`, { as: fixture.owner.userId });
    expect(verified.status).toBe(200); expect(verified.json).toMatchObject({ state: 'verified', receiptNo: expect.stringMatching(/^R-\d{6,}$/) });
    expect((await call(app, 'GET', `/api/v1/subscriptions/${sale.subscription.id}`, { as: fixture.owner.userId })).json).toMatchObject({ subscription: { state: 'active' } });
    const before = await setupApiData(fixture.owner.tenantId, 'read generated events', (tx) => tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, fixture.owner.tenantId), eq(calendarEvents.subscriptionId, sale.subscription.id))));
    expect(before.length).toBeGreaterThan(0); expect(before.every((e) => e.source === 'package_rule')).toBe(true);
    await syncSubscriptionCalendar(fixture.owner.tenantId, sale.subscription.id, 'repeat sync test');
    const after = await setupApiData(fixture.owner.tenantId, 'read repeated calendar', (tx) => tx.select({ id: calendarEvents.id }).from(calendarEvents).where(and(eq(calendarEvents.tenantId, fixture.owner.tenantId), eq(calendarEvents.subscriptionId, sale.subscription.id))));
    expect(after.map((e) => e.id).sort()).toEqual(before.map((e) => e.id).sort());
  });

  it('verifies within the sale, allocates strictly increasing receipts, and rolls back a forced unique failure', async () => {
    const first = await sell(true); expect(first.subscription.state).toBe('active');
    const tenantId = fixture.owner.tenantId;
    await setupApiData(tenantId, 'force failed verified insert in a savepoint', async (tx) => {
      const [before] = await tx.select({ counter: tenants.receiptCounter }).from(tenants).where(eq(tenants.id, tenantId));
      await expect(tx.transaction(async (savepoint) => {
        await savepoint.insert(payments).values({ id: first.payment!.id, tenantId, clientId: fixture.clientId, subscriptionId: first.subscription.id,
          amount: 300, currency: 'EGP', method: 'cash', state: 'verified' });
      })).rejects.toThrow();
      const [after] = await tx.select({ counter: tenants.receiptCounter }).from(tenants).where(eq(tenants.id, tenantId));
      expect(after?.counter).toBe(before?.counter);
    });
    const second = await sell(true);
    expect(Number(second.payment!.receiptNo!.slice(2))).toBe(Number(first.payment!.receiptNo!.slice(2)) + 1);
  });

  it('rolls back a sale when its payment is invalid and rejects server-owned fields', async () => {
    const before = await setupApiData(fixture.owner.tenantId, 'count sales', (tx) => tx.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.tenantId, fixture.owner.tenantId)));
    const failed = await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId, body: { clientId: fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today,
      payment: { amount: '10.00', currency: 'USD', method: 'cash' } } });
    expect(failed.status).toBe(400);
    const after = await setupApiData(fixture.owner.tenantId, 'count sales after rollback', (tx) => tx.select({ count: sql<number>`count(*)::int` }).from(subscriptions).where(eq(subscriptions.tenantId, fixture.owner.tenantId)));
    expect(after).toEqual(before);
    expect((await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId, body: { clientId: fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today, state: 'active' } })).status).toBe(400);
  });

  it.each(['grace', 'expired'] as const)('an extension restores %s access and moves end-relative events', async (state) => {
    const sale = await sell(true); const tenantId = fixture.owner.tenantId;
    await setupApiData(tenantId, 'age subscription', async (tx) => {
      await tx.update(subscriptions).set({ state, startsOn: addDays(fixture.today, -30), endsOn: addDays(fixture.today, -2), graceEndsOn: fixture.today })
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, sale.subscription.id)));
    });
    const result = await call(app, 'POST', `/api/v1/subscriptions/${sale.subscription.id}/extend`, { as: fixture.owner.userId, body: { days: 14, reason: 'Coach approved' } });
    expect(result.status).toBe(200); expect(result.json).toMatchObject({ subscription: { state: 'active', endsOn: addDays(fixture.today, 12) }, accessStatus: { hasAccess: true } });
    const events = await setupApiData(tenantId, 'read shifted reminders', (tx) => tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.subscriptionId, sale.subscription.id), eq(calendarEvents.type, 'renewal_reminder'), eq(calendarEvents.state, 'scheduled'))));
    expect(events.some((e) => e.localDate === addDays(fixture.today, 11))).toBe(true);
  });

  it('freezes retroactively, preserves completed rows, and resumes with only elapsed freeze days', async () => {
    const sale = await sell(true); const tenantId = fixture.owner.tenantId;
    const openId = randomUUID(); const doneId = randomUUID();
    await setupApiData(tenantId, 'past freeze window rows', async (tx) => {
      await tx.update(subscriptions).set({ startsOn: addDays(fixture.today, -7), endsOn: addDays(fixture.today, 21), graceEndsOn: addDays(fixture.today, 23) })
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, sale.subscription.id)));
      await tx.insert(calendarEvents).values([openId, doneId].map((id) => ({ id, tenantId, clientId: fixture.clientId, subscriptionId: sale.subscription.id,
        type: 'custom', source: 'manual' as const, state: id === doneId ? 'completed' as const : 'due' as const, dueAt: new Date(), localDate: addDays(fixture.today, -1), timezone: 'Africa/Cairo' })));
    });
    const freeze = await call(app, 'POST', `/api/v1/subscriptions/${sale.subscription.id}/freeze`, { as: fixture.owner.userId, body: { fromDate: addDays(fixture.today, -2), days: 5, reason: 'Travel' } });
    expect(freeze.status).toBe(200); expect(freeze.json).toMatchObject({ subscription: { state: 'paused', endsOn: addDays(fixture.today, 26) } });
    const rows = await setupApiData(tenantId, 'read frozen history', (tx) => tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, tenantId), inArray(calendarEvents.id, [openId, doneId]))));
    expect(rows.find((e) => e.id === openId)?.state).toBe('cancelled'); expect(rows.find((e) => e.id === doneId)?.state).toBe('completed');
    const resumed = await call(app, 'POST', `/api/v1/subscriptions/${sale.subscription.id}/resume`, { as: fixture.owner.userId });
    expect(resumed.status).toBe(200); expect(resumed.json).toMatchObject({ subscription: { state: 'active', endsOn: addDays(fixture.today, 23), frozenDays: 2 } });
    await syncSubscriptionCalendar(tenantId, sale.subscription.id, 'resume repeat test');
  });

  it('cancels future open events while retaining completed history and refuses terminal transitions', async () => {
    const sale = await sell(true); const tenantId = fixture.owner.tenantId;
    const doneId = randomUUID();
    await setupApiData(tenantId, 'completed future event', (tx) => tx.insert(calendarEvents).values({ id: doneId, tenantId, clientId: fixture.clientId, subscriptionId: sale.subscription.id,
      type: 'custom', state: 'completed', source: 'manual', dueAt: new Date(), localDate: addDays(fixture.today, 1), timezone: 'Africa/Cairo' }));
    expect((await call(app, 'POST', `/api/v1/subscriptions/${sale.subscription.id}/cancel`, { as: fixture.owner.userId, body: { reason: 'Requested' } })).status).toBe(200);
    const rows = await setupApiData(tenantId, 'cancelled history', (tx) => tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.subscriptionId, sale.subscription.id))));
    expect(rows.find((e) => e.id === doneId)?.state).toBe('completed'); expect(rows.filter((e) => e.id !== doneId).every((e) => e.state === 'cancelled')).toBe(true);
    const refusal = await call(app, 'POST', `/api/v1/subscriptions/${sale.subscription.id}/extend`, { as: fixture.owner.userId, body: { days: 7, reason: 'Retry' } });
    expect(refusal.status).toBe(422); expect(refusal.json).toMatchObject({ error: { code: 'transition_refused', details: { from: 'cancelled', event: 'renew' } } });
  });

  it('expired live access is forbidden while mine and payment history still answer', async () => {
    const sale = await sell(true, fixture.otherClientId); const tenantId = fixture.owner.tenantId;
    await setupApiData(tenantId, 'expire client B subscription', (tx) => tx.update(subscriptions).set({ state: 'expired', startsOn: addDays(fixture.today, -40), endsOn: addDays(fixture.today, -12), graceEndsOn: addDays(fixture.today, -10), notes: 'Internal only' })
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, sale.subscription.id))));
    const guarded = new OpenAPIHono<ApiEnv>(); guarded.use('*', requireAuthMiddleware); guarded.use('*', requireActiveAccess);
    guarded.openapi(createRoute({ method: 'get', path: '/live', responses: { 200: { description: 'Live', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } } } }), (c) => c.json({ ok: true }, 200));
    guarded.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: { code: 'unexpected' } }, 500));
    const live = await call(guarded, 'GET', '/live', { as: fixture.otherClientUser }); expect(live.status).toBe(403); expect(live.json).toMatchObject({ error: { code: 'access_expired' } });
    const mine = await call(app, 'GET', '/api/v1/subscriptions/mine', { as: fixture.otherClientUser }); expect(mine.status).toBe(200);
    expect(mine.json).toMatchObject({ subscription: { clientId: fixture.otherClientId }, accessStatus: { access: 'expired' } });
    expect(JSON.stringify(mine.json)).not.toContain('Internal only'); expect(JSON.stringify(mine.json)).not.toContain('notes');
    expect((await call(app, 'GET', '/api/v1/payments/mine', { as: fixture.otherClientUser })).status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/subscriptions/${sale.subscription.id}`, { as: fixture.clientUser })).status).toBe(403);
  });

  it('validates pagination and replays a sequential sale without another subscription', async () => {
    expect((await call(app, 'GET', '/api/v1/subscriptions?limit=0', { as: fixture.owner.userId })).status).toBe(400);
    const headers = { 'Idempotency-Key': randomUUID() }; const body = { clientId: fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today };
    const first = await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId, headers, body });
    const replay = await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId, headers, body });
    expect(first.status).toBe(201); expect(replay.json).toEqual(first.json);
    const ledger = await setupApiData(fixture.owner.tenantId, 'check lifecycle audit', (tx) => tx.select({ kind: subscriptionEvents.kind }).from(subscriptionEvents).where(eq(subscriptionEvents.tenantId, fixture.owner.tenantId)));
    expect(ledger.some((e) => e.kind === 'extension')).toBe(true);
  });
});
