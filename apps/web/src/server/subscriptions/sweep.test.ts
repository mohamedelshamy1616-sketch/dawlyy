import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { subscriptions, subscriptionEvents } from '@dawlyy/db/schema';
import { ScheduleRules } from '@dawlyy/core/types';
import { setupApiData } from '../../test/api-harness';
import { setupBillingFixture } from './test-fixture';
import { sweepSubscriptions } from './sweep';

describe.runIf(Boolean(process.env.DATABASE_URL))('T3b expiry sweep', () => {
  let fixture: Awaited<ReturnType<typeof setupBillingFixture>>;
  afterAll(async () => { try { await fixture?.cleanup(); } finally { await (await import('@dawlyy/db')).closeDb(); } });
  beforeAll(async () => { fixture = await setupBillingFixture(); });
  it('uses inclusive active/grace end dates and is idempotent, with no foreign-tenant changes', async () => {
    const id = randomUUID(); const tenantId = fixture.owner.tenantId;
    await setupApiData(tenantId, 'seed sweep subscription', (tx) => tx.insert(subscriptions).values({ id, tenantId, clientId: fixture.clientId, packageId: fixture.packageId,
      state: 'active', startsOn: '2026-10-01', endsOn: '2026-10-29', graceEndsOn: '2026-10-31', timezone: 'Africa/Cairo', price: 300, currency: 'EGP',
      packageSnapshot: { name: { en: 'Four weeks' }, durationDays: 28, price: 300, currency: 'EGP', entitlements: [], scheduleRules: ScheduleRules.parse({}) } }));
    expect(await sweepSubscriptions(randomUUID(), '2026-11-01')).toBe(0);
    expect(await sweepSubscriptions(tenantId, '2026-10-29')).toBe(0);
    expect(await sweepSubscriptions(tenantId, '2026-10-30')).toBe(1);
    expect(await sweepSubscriptions(tenantId, '2026-10-30')).toBe(0);
    expect(await sweepSubscriptions(tenantId, '2026-10-31')).toBe(0);
    expect(await sweepSubscriptions(tenantId, '2026-11-01')).toBe(1);
    expect(await sweepSubscriptions(tenantId, '2026-11-01')).toBe(0);
    await setupApiData(tenantId, 'read swept state', async (tx) => {
      const [sub] = await tx.select({ state: subscriptions.state }).from(subscriptions).where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, id)));
      expect(sub?.state).toBe('expired');
      const ledger = await tx.select({ kind: subscriptionEvents.kind }).from(subscriptionEvents).where(and(eq(subscriptionEvents.tenantId, tenantId), eq(subscriptionEvents.subscriptionId, id)));
      expect(ledger.map((event) => event.kind).sort()).toEqual(['expired', 'grace']);
    });
  });
});
