import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { clients, memberships, mealLogs, metricEntries } from '@dawlyy/db/schema';
import { withAuthTx } from '../server/db';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';

describe('Task 6 client logging sync', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>; let clientId: string; let userId: string;
  beforeEach(async () => { fixture = await setupApiFixture(); userId = randomUUID(); clientId = await setupApiData(fixture.owner.tenantId, 'meal client', async tx => {
    const [c] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'Meal client' }).returning({ id: clients.id }); if (!c) throw new Error('Missing client');
    await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: c.id }); return c.id;
  }); }); afterEach(async () => { await fixture?.cleanup(); });
  it('deduplicates meals, rejects stale updates, and keeps water append-only', async () => {
    const clientUuid = randomUUID(); const body = { clientUuid, localDate: '2026-11-10', status: 'eaten', freeEntry: { text: 'Off-plan lunch' }, clientUpdatedAt: '2026-11-10T12:00:00Z' };
    for (let n = 0; n < 2; n++) expect((await call(app, 'POST', '/api/v1/meal-logs', { as: userId, body })).status).toBe(200);
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as: userId, body: { ...body, status: 'skipped', clientUpdatedAt: '2026-11-10T11:00:00Z' } })).status).toBe(200);
    const rows = await withAuthTx(fixture.owner, tx => tx.select({ status: mealLogs.status }).from(mealLogs).where(and(eq(mealLogs.clientId, clientId), eq(mealLogs.clientUuid, clientUuid)))); expect(rows).toEqual([{ status: 'eaten' }]);
    const water = { clientUuid: randomUUID(), localDate: '2026-11-10', amountMl: 250 };
    for (let n = 0; n < 2; n++) expect((await call(app, 'POST', '/api/v1/meal-logs/water', { as: userId, body: water })).status).toBe(200);
    const hydration = await withAuthTx(fixture.owner, tx => tx.select({ value: metricEntries.value, metric: metricEntries.metric, unit: metricEntries.unit, metricKey: metricEntries.metricKey }).from(metricEntries).where(eq(metricEntries.clientUuid, water.clientUuid)));
    expect(hydration).toEqual([{ value: 250, metric: 'water', unit: 'ml', metricKey: null }]);
  });
});
