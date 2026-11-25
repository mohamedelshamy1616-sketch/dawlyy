import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memberships } from '@dawlyy/db/schema';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { app } from './index';

describe('PT renewal request HTTP contract', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>, sub: string;
  beforeEach(async () => {
    f = await trackingFixture();
    await setupActiveSubscription(f.owner.tenantId, f.a.clientId);
    const [row] = await setupApiData(f.owner.tenantId, 'find purchased package', tx =>
      tx.execute<{ id: string }>(sql`select id from subscriptions where client_id=${f.a.clientId}`));
    if (!row) throw new Error('Missing subscription');
    sub = row.id;
  });
  afterEach(async () => { await f?.cleanup(); });
  const post = (path: string, body: object, as = f.owner.userId) => call(app, 'POST', '/api/v1/pt/' + path, { as, body });
  const open = (count: number) => post(`subscriptions/${sub}/opening-credit`, { count, reason: 'Verified at desk' });
  const close = () => post(`visits/${randomUUID()}/close`, { subscriptionId: sub });
  const request = (as: string = f.a.userId) => post('renewals', { subscriptionId: sub }, as);
  const handle = (id: string, as: string) => post(`renewals/${id}/handled`, {}, as);
  const coach = async (scope: 'all' | 'assigned') => {
    const staff = randomUUID();
    await setupApiData(f.owner.tenantId, 'coach', tx => tx.insert(memberships).values({
      tenantId: f.owner.tenantId, userId: staff, role: 'staff', status: 'active', displayName: 'Coach',
      permissions: { client_scope: scope, modules: { clients: ['view'] } },
    }));
    return staff;
  };

  it('returns delivered sessions and balance, and the same open request on a duplicate', async () => {
    expect((await open(3)).status).toBe(200);
    expect((await close()).status).toBe(200);
    const first = await request();
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ status: 'open', delivered: 1, balance: 2 });
    const second = await request();
    expect(second.status).toBe(200);
    expect(second.json).toEqual(first.json);
    const [counted] = await setupApiData(f.owner.tenantId, 'count requests', tx =>
      tx.execute<{ count: number }>(sql`select count(*)::int as count from pt_renewal_requests where subscription_id=${sub}`));
    expect(counted?.count).toBe(1);
  });
  it('refuses above two sessions, before funding, and for staff or another client', async () => {
    expect((await request()).status).toBe(409);
    expect((await open(5)).status).toBe(200);
    expect((await request()).status).toBe(409);
    expect((await request(f.owner.userId)).status).toBe(403);
    expect((await request(f.b.userId)).status).toBe(404);
  });
  it('lets only the owner or an assigned coach mark a request handled, once', async () => {
    expect((await open(2)).status).toBe(200);
    const made = await request();
    const id = (made.json as { id: string }).id;
    const unassigned = await coach('assigned');
    expect((await handle(id, f.a.userId)).status).toBe(403);
    expect((await handle(id, f.b.userId)).status).toBe(403);
    expect((await handle(id, unassigned)).status).toBe(404);
    expect((await handle(id, f.owner.userId)).status).toBe(200);
    expect((await handle(id, f.owner.userId)).status).toBe(409);
    expect((await handle(randomUUID(), f.owner.userId)).status).toBe(404);
    const again = await request();
    expect(again.status).toBe(200);
    expect((again.json as { id: string }).id).not.toBe(id);
  });
});
