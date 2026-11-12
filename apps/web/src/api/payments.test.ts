import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { subscriptions, payments, subscriptionEvents } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { setupBillingFixture } from '../server/subscriptions/test-fixture';
import { manualPaymentProvider } from '../server/payments/provider';

type Sale = { subscription: { id: string }; payment: { id: string } };
describe.runIf(Boolean(process.env.DATABASE_URL))('T3b payment permissions, concurrency and refunds', () => {
  let fixture: Awaited<ReturnType<typeof setupBillingFixture>>; let app: (typeof import('./index'))['app'];
  beforeAll(async () => { vi.stubEnv('DAWLYY_DEV_LOGIN', '0'); fixture = await setupBillingFixture(); app = (await import('./index')).app; });
  afterAll(async () => { try { await fixture?.cleanup(); } finally { await (await import('@dawlyy/db')).closeDb(); vi.unstubAllEnvs(); } });
  async function sell(clientId = fixture.clientId) {
    const response = await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.owner.userId, body: { clientId, packageId: fixture.packageId, startsOn: fixture.today,
      payment: { amount: '300.00', currency: 'EGP', method: 'cash' } } });
    expect(response.status).toBe(201); return response.json as Sale;
  }

  it('a client cannot create, verify, reject or refund payments', async () => {
    const sale = await sell();
    const attempts = [
      { path: '/api/v1/payments', body: { subscriptionId: sale.subscription.id, amount: '10', currency: 'EGP', method: 'cash' } },
      { path: `/api/v1/payments/${sale.payment.id}/verify`, body: {} },
      { path: `/api/v1/payments/${sale.payment.id}/reject`, body: { reason: 'Self rejection' } },
      { path: `/api/v1/payments/${sale.payment.id}/refund`, body: { amount: '1' } },
    ];
    for (const attempt of attempts) expect((await call(app, 'POST', attempt.path, { as: fixture.clientUser, body: attempt.body })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/payments', { as: fixture.clientUser, body: { state: 'verified' } })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.clientUser, body: { clientId: fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today } })).status).toBe(403);
  });

  it('staff without verify cannot verify or use markVerified during a sale', async () => {
    const sale = await sell();
    expect((await call(app, 'POST', `/api/v1/payments/${sale.payment.id}/verify`, { as: fixture.staffUser })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/subscriptions', { as: fixture.staffUser, body: { clientId: fixture.clientId, packageId: fixture.packageId, startsOn: fixture.today,
      payment: { amount: 300, currency: 'EGP', method: 'cash', markVerified: true } } })).status).toBe(403);
  });

  it('two concurrent verifies return one receipt and activate once', async () => {
    const sale = await sell();
    const [a, b] = await Promise.all([call(app, 'POST', `/api/v1/payments/${sale.payment.id}/verify`, { as: fixture.owner.userId }),
      call(app, 'POST', `/api/v1/payments/${sale.payment.id}/verify`, { as: fixture.owner.userId })]);
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(a.json).toEqual(b.json);
    await setupApiData(fixture.owner.tenantId, 'verify single activation', async (tx) => {
      const [sub] = await tx.select({ state: subscriptions.state }).from(subscriptions).where(and(eq(subscriptions.tenantId, fixture.owner.tenantId), eq(subscriptions.id, sale.subscription.id)));
      expect(sub?.state).toBe('active');
      const ledger = await tx.select({ id: subscriptionEvents.id }).from(subscriptionEvents).where(and(eq(subscriptionEvents.tenantId, fixture.owner.tenantId), eq(subscriptionEvents.subscriptionId, sale.subscription.id), eq(subscriptionEvents.kind, 'activated')));
      expect(ledger).toHaveLength(1);
    });
  });

  it('reserves a concurrent refund key before mutation and replays the final refund', async () => {
    const sale = await sell();
    expect((await call(app, 'POST', `/api/v1/payments/${sale.payment.id}/verify`, { as: fixture.owner.userId })).status).toBe(200);
    const path = `/api/v1/payments/${sale.payment.id}/refund`;
    const refund = () => call(app, 'POST', path, { as: fixture.owner.userId, body: { amount: '10' }, headers: { 'Idempotency-Key': `refund/${sale.payment.id}` } });
    const original = manualPaymentProvider.refund;
    let entered!: () => void; let release!: () => void; let handlerCalls = 0;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const finish = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(manualPaymentProvider, 'refund').mockImplementation(async (...args) => {
      if (++handlerCalls === 1) { entered(); await finish; }
      return original(...args);
    });
    const first = refund();
    try {
      await started;
      const second = await refund();
      release();
      const completed = await first;
      expect(completed.status).toBe(200);
      expect(completed.json).toMatchObject({ refundAmount: 10, state: 'verified' });
      expect(second.status).toBe(409);
      expect(second.json).toMatchObject({ error: { code: 'idempotency_in_progress' } });
      expect(await refund()).toEqual(completed);
      expect(spy).toHaveBeenCalledTimes(1);
      await setupApiData(fixture.owner.tenantId, 'concurrent keyed refund read-back', async (tx) => {
        const [payment] = await tx.select({ refundAmount: payments.refundAmount }).from(payments)
          .where(and(eq(payments.tenantId, fixture.owner.tenantId), eq(payments.id, sale.payment.id)));
        expect(Number(payment?.refundAmount)).toBe(10);
      });
    } finally {
      release();
      try { await first; } finally { spy.mockRestore(); }
    }
  });

  it('partial refunds remain verified, are cumulative, and full refunds enter refunded', async () => {
    const sale = await sell();
    expect((await call(app, 'POST', `/api/v1/payments/${sale.payment.id}/verify`, { as: fixture.owner.userId })).status).toBe(200);
    const refund = (body: unknown) => call(app, 'POST', `/api/v1/payments/${sale.payment.id}/refund`, { as: fixture.owner.userId, body });
    expect((await refund({ amount: '0.10' })).json).toMatchObject({ state: 'verified', refundAmount: 0.1 });
    expect((await refund({ amount: '0.20' })).json).toMatchObject({ state: 'verified', refundAmount: 0.3 });
    expect((await refund({ amount: '300.00' })).status).toBe(400);
    expect((await refund({})).json).toMatchObject({ state: 'refunded', refundAmount: 300 });
    expect((await refund({ amount: '1' })).status).toBe(422);
  });

  it('requires a rejection reason and exposes it to only the owning client, without internal notes', async () => {
    const a = await sell(); const b = await sell(fixture.otherClientId);
    await setupApiData(fixture.owner.tenantId, 'private payment notes', (tx) => tx.update(payments).set({ notes: 'Private coach notes' })
      .where(and(eq(payments.tenantId, fixture.owner.tenantId), eq(payments.id, a.payment.id))));
    expect((await call(app, 'POST', `/api/v1/payments/${a.payment.id}/reject`, { as: fixture.owner.userId, body: { reason: ' ' } })).status).toBe(400);
    expect((await call(app, 'POST', `/api/v1/payments/${a.payment.id}/reject`, { as: fixture.owner.userId, body: { reason: 'Unreadable proof' } })).status).toBe(200);
    const mine = await call(app, 'GET', `/api/v1/payments/mine?clientId=${fixture.otherClientId}`, { as: fixture.clientUser });
    expect(mine.status).toBe(200);
    const result = mine.json as { items: { id: string; clientId: string; rejectedReason: string | null }[] };
    expect(result.items.every((row) => row.clientId === fixture.clientId)).toBe(true);
    expect(result.items.some((row) => row.id === b.payment.id)).toBe(false);
    expect(result.items.find((row) => row.id === a.payment.id)?.rejectedReason).toBe('Unreadable proof');
    expect(JSON.stringify(mine.json)).not.toContain('notes'); expect(JSON.stringify(mine.json)).not.toContain('Private coach notes');
  });

  it('records renewal instalments only against a visible subscription and enforces cursor limits', async () => {
    const sale = await sell();
    const result = await call(app, 'POST', '/api/v1/payments', { as: fixture.owner.userId, body: { subscriptionId: sale.subscription.id, amount: '25.00', currency: 'EGP', method: 'bank_transfer' } });
    expect(result.status).toBe(201); expect(result.json).toMatchObject({ state: 'pending', subscriptionId: sale.subscription.id, amount: 25 });
    expect((await call(app, 'POST', '/api/v1/payments', { as: fixture.owner.userId, headers: { 'content-type': 'text/plain' },
      body: { subscriptionId: sale.subscription.id, amount: '25.00', currency: 'EGP', method: 'cash' } })).status).toBe(400);
    const page1 = await call(app, 'GET', '/api/v1/payments?limit=1', { as: fixture.owner.userId });
    expect(page1.status).toBe(200); const first = page1.json as { items: { id: string }[]; nextCursor: string };
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const page2 = await call(app, 'GET', `/api/v1/payments?limit=1&cursor=${first.nextCursor}`, { as: fixture.owner.userId });
    expect(page2.status).toBe(200); expect((page2.json as { items: { id: string }[] }).items[0]?.id).not.toBe(first.items[0]?.id);
    expect((await call(app, 'GET', '/api/v1/payments?cursor=bad', { as: fixture.owner.userId })).status).toBe(400);
  });
});
