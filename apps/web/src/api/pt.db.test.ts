import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memberships } from '@dawlyy/db/schema';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { app } from './index';

describe('PT receipt HTTP contract against the real ledger', () => {
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
  const close = (id: string, as?: string) => post(`visits/${id}/close`, { subscriptionId: sub }, as);
  it('double-close and delayed offline replay return the identical receipt', async () => {
    expect((await open(2)).status).toBe(200);
    const id = randomUUID(), [a,b] = await Promise.all([close(id),close(id)]);
    expect(a.status).toBe(200); expect(a.json).toMatchObject({ visit: id, session: 1, balance: 1 }); expect(b).toEqual(a);
    expect((await close(randomUUID())).json).toMatchObject({ session: 2, balance: 0 });
    expect(await close(id)).toEqual(a);
    expect((await close(randomUUID())).status).toBe(409);
  });
  it('returns 409 before opening and with a verified zero balance', async () => {
    const id = randomUUID();
    expect((await close(id)).status).toBe(409); expect((await open(0)).status).toBe(200);
    expect((await open(1)).status).toBe(409); expect((await close(id)).status).toBe(409);
  });
  it('denies another coach and another client, and separates views, decisions and owner corrections', async () => {
    const staff = randomUUID();
    await setupApiData(f.owner.tenantId, 'unassigned coach', tx => tx.insert(memberships).values({
      tenantId: f.owner.tenantId, userId: staff, role: 'staff', status: 'active', displayName: 'Coach',
      permissions: { client_scope: 'all', modules: { clients: ['view'] } },
    }));
    expect((await open(2)).status).toBe(200);
    const id = randomUUID();
    expect((await close(id, staff)).status).toBe(404); expect((await close(id)).status).toBe(200);
    const action = (kind: string, as: string, body = {}) => post(`receipts/${id}/${kind}`, body, as);
    expect((await action('dispute', f.b.userId)).status).toBe(404);
    expect((await action('view', f.a.userId)).status).toBe(200);
    expect((await action('dispute', f.a.userId, { note: 'Wrong session' })).status).toBe(200);
    expect((await action('confirm', f.a.userId)).status).toBe(409);
    const fix = (as: string) => post(`visits/${id}/correction`, { reason: 'Desk verified' }, as);
    expect((await fix(staff)).status).toBe(403); expect((await fix(f.a.userId)).status).toBe(403);
    expect((await fix(f.owner.userId)).status).toBe(200); expect((await fix(f.owner.userId)).status).toBe(409);
    const second = randomUUID(); expect((await close(second)).json).toMatchObject({ session: 2, balance: 1 });
    expect((await post(`receipts/${second}/confirm`, {}, f.a.userId)).status).toBe(200);
  });
});
