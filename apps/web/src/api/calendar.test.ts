import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { clients, memberships, metricEntries, notificationDeliveries, notifications, staffClientAssignments } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';
import { processDueEvents } from '../server/calendar/processor';
import { GET } from '../../app/api/cron/due-events/route';

const row = z.object({ id: z.string() });
describe('Task 8 calendar and due-event processor', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  let clientId: string;
  beforeEach(async () => {
    fixture = await setupApiFixture();
    clientId = await setupApiData(fixture.owner.tenantId, 'calendar client', async tx => {
      const [client] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'Calendar' }).returning({ id: clients.id });
      if (!client) throw new Error('Missing client');
      await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId: randomUUID(), role: 'client', status: 'active', clientId: client.id });
      return client.id;
    });
  });
  afterEach(async () => { await fixture?.cleanup(); });
  async function event(dueAt = '2026-11-01T07:00:00Z') {
    const result = await call(app, 'POST', '/api/v1/calendar', { as: fixture.owner.userId, body: { clientId, type: 'weigh_in', dueAt, timezone: 'Africa/Cairo', windowDays: 1 } });
    expect(result.status).toBe(201); return row.parse(result.json);
  }
  it('completes an event and creates no further reminders', async () => {
    const created = await event();
    expect((await call(app, 'POST', `/api/v1/calendar/${created.id}/complete`, { as: fixture.owner.userId })).status).toBe(200);
    expect(await processDueEvents(fixture.owner.tenantId, new Date('2026-11-03T12:00:00Z'))).toEqual({ changed: 0 });
    const notices = await setupApiData(fixture.owner.tenantId, 'check reminders', tx => tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.tenantId, fixture.owner.tenantId)));
    expect(notices).toHaveLength(0);
    expect((await call(app, 'POST', `/api/v1/calendar/${created.id}/skip`, { as: fixture.owner.userId })).status).toBe(422);
  });
  it('requires a secret and processes due events once through the cron handler', async () => {
    const previous = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await GET(new Request('http://localhost/api/cron/due-events'))).status).toBe(403);
      process.env.CRON_SECRET = randomUUID();
      const created = await event(new Date(Date.now() - 3 * 86400000).toISOString());
      const url = `http://localhost/api/cron/due-events?tenantId=${fixture.owner.tenantId}`;
      expect((await GET(new Request(url))).status).toBe(403);
      const run = () => GET(new Request(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
      expect((await run()).status).toBe(200);
      expect(await (await run()).json()).toMatchObject({ changed: 0 });
      const notices = await setupApiData(fixture.owner.tenantId, 'read due reminder count', tx => tx.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.tenantId, fixture.owner.tenantId), eq(notifications.dedupeKey, `calendar:manual:${created.id}:due`))));
      expect(notices).toHaveLength(1);
    } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
  });
  it('does not escalate a previously due event after completion', async () => {
    const created = await event();
    expect(await processDueEvents(fixture.owner.tenantId, new Date('2026-11-01T08:00:00Z'))).toEqual({ changed: 1 });
    expect((await call(app, 'POST', `/api/v1/calendar/${created.id}/complete`, { as: fixture.owner.userId })).status).toBe(200);
    expect(await processDueEvents(fixture.owner.tenantId, new Date('2026-11-04T08:00:00Z'))).toEqual({ changed: 0 });
    const notices = await setupApiData(fixture.owner.tenantId, 'completed event reminder count', tx => tx.select({ key: notifications.dedupeKey }).from(notifications).where(eq(notifications.tenantId, fixture.owner.tenantId)));
    expect(notices.map(notice => notice.key)).toEqual([`calendar:manual:${created.id}:due`]);
  });
  it('cancels queued deliveries for a completed occurrence', async () => {
    const created = await event();
    await processDueEvents(fixture.owner.tenantId, new Date('2026-11-01T08:00:00Z'));
    await setupApiData(fixture.owner.tenantId, 'queue due delivery', async tx => {
      const [notice] = await tx.select({ id: notifications.id, userId: notifications.userId }).from(notifications).where(eq(notifications.tenantId, fixture.owner.tenantId)).limit(1);
      if (!notice) throw new Error('Expected due notification');
      await tx.insert(notificationDeliveries).values({ tenantId: fixture.owner.tenantId, notificationId: notice.id, userId: notice.userId, channel: 'inapp', state: 'queued' });
    });
    expect((await call(app, 'POST', `/api/v1/calendar/${created.id}/complete`, { as: fixture.owner.userId })).status).toBe(200);
    await processDueEvents(fixture.owner.tenantId, new Date('2026-11-04T08:00:00Z'));
    const deliveries = await setupApiData(fixture.owner.tenantId, 'check cancelled due delivery', tx => tx.select({ state: notificationDeliveries.state }).from(notificationDeliveries).where(eq(notificationDeliveries.tenantId, fixture.owner.tenantId)));
    expect(deliveries).toEqual([{ state: 'cancelled' }]);
  });
  it('recognizes an entry from another logging path before issuing a reminder', async () => {
    await event();
    await setupApiData(fixture.owner.tenantId, 'entry recorded outside metrics router', async tx => {
      await tx.insert(metricEntries).values({ tenantId: fixture.owner.tenantId, clientId, metric: 'weight', value: 80, unit: 'kg', source: 'form', clientUuid: randomUUID(), recordedAt: new Date('2026-11-01T06:00:00Z'), localDate: '2026-11-01', timezone: 'Africa/Cairo' });
    });
    expect(await processDueEvents(fixture.owner.tenantId, new Date('2026-11-01T08:00:00Z'))).toEqual({ changed: 1 });
    const notices = await setupApiData(fixture.owner.tenantId, 'check fulfilled event reminders', tx => tx.select({ id: notifications.id }).from(notifications).where(eq(notifications.tenantId, fixture.owner.tenantId)));
    expect(notices).toHaveLength(0);
  });
  it('shows assigned-scope staff only their assigned calendar events', async () => {
    await event();
    const staff = randomUUID(); const membershipId = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'calendar scoped staff', async tx => {
      await tx.insert(memberships).values({ id: membershipId, tenantId: fixture.owner.tenantId, userId: staff, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { calendar: ['view'] } } });
    });
    const list = () => call(app, 'GET', '/api/v1/calendar', { as: staff });
    expect(z.object({ items: z.array(row) }).parse((await list()).json).items).toHaveLength(0);
    await setupApiData(fixture.owner.tenantId, 'assign calendar client', async tx => { await tx.insert(staffClientAssignments).values({ tenantId: fixture.owner.tenantId, membershipId, clientId }); });
    expect(z.object({ items: z.array(row) }).parse((await list()).json).items).toHaveLength(1);
  });
});
