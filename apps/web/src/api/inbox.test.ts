import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { clients, formSubmissions, memberships, redFlags, staffClientAssignments, workoutSessions } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { formsFixture } from '../server/forms/api-fixture';
import { withAuthTx } from '../server/db';
import { readInboxInputs } from '../server/inbox/service';
import { app } from './index';

const resultSchema = z.object({ today: z.iso.date(), items: z.array(z.object({
  client: z.object({ id: z.uuid(), displayName: z.string(), code: z.string() }), score: z.number(),
  reasons: z.array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.number(), z.string()])) })),
  primaryAction: z.string(), actionHref: z.string().nullable(),
})) });

describe('R1b staff inbox under real RLS', () => {
  let f: Awaited<ReturnType<typeof formsFixture>>;
  let staffUser: string;
  let reviewId: string;
  beforeEach(async () => {
    f = await formsFixture('checkin'); staffUser = randomUUID(); reviewId = randomUUID();
    const tenantId = f.owner.tenantId;
    await setupApiData(tenantId, 'inbox active clients and waiting review', async tx => {
      await tx.update(clients).set({ status: 'active' }).where(eq(clients.tenantId, tenantId));
      await tx.insert(formSubmissions).values({ id: reviewId, tenantId, clientId: f.clientId, formId: f.formId, formVersionId: f.versionId,
        formKind: 'checkin', state: 'submitted', submittedAt: new Date(Date.now() - 86400000) });
      const membershipId = randomUUID();
      await tx.insert(memberships).values({ id: membershipId, tenantId, userId: staffUser, role: 'staff', status: 'active',
        permissions: { client_scope: 'assigned', modules: { clients: ['view'] } } });
      await tx.insert(staffClientAssignments).values({ tenantId, membershipId, clientId: f.clientId });
    });
  });
  afterEach(async () => { await f?.cleanup(); });
  async function inbox(as = f.owner.userId, query = '') {
    const response = await call(app, 'GET', `/api/v1/inbox${query}`, { as }); expect(response.status).toBe(200);
    return resultSchema.parse(response.json);
  }
  it('ranks a waiting review above only no_contact and resolves its review action', async () => {
    const result = await inbox();
    expect(result.items.map(row => row.client.id)).toEqual([f.clientId, f.otherClientId]);
    expect(result.items[0]).toMatchObject({ primaryAction: 'review', actionHref: `/coach/clients/${f.clientId}/review` });
    expect(result.items[0]!.score).toBeGreaterThan(result.items[1]!.score);
    expect(result.items[1]!.reasons.map(reason => reason.code)).toEqual(['no_contact']);
  });
  it('ranks an open red flag first, including when limit truncates the result', async () => {
    await setupApiData(f.owner.tenantId, 'open flag on second client', async tx => {
      const sourceId = randomUUID();
      await tx.insert(formSubmissions).values({ id: sourceId, tenantId: f.owner.tenantId, clientId: f.otherClientId,
        formId: f.formId, formVersionId: f.versionId, formKind: 'checkin', state: 'reviewed',
        submittedAt: new Date(Date.now() - 2 * 86400000), reviewedAt: new Date() });
      await tx.insert(redFlags).values({ id: randomUUID(), tenantId: f.owner.tenantId, clientId: f.otherClientId, source: 'checkin', sourceId,
        category: 'pain_injury', matched: 'pain' });
    });
    const result = await inbox(f.owner.userId, '?limit=1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ client: { id: f.otherClientId }, primaryAction: 'handle_flag' });
    expect(result.items[0]!.reasons[0]).toEqual({ code: 'red_flag', params: { category: 'pain_injury' } });
  });
  it('excludes a voided completed session from both done windows', async () => {
    const { today } = await inbox();
    await setupApiData(f.owner.tenantId, 'one completed and one voided session', async tx => {
      const base = { tenantId: f.owner.tenantId, clientId: f.clientId, state: 'completed' as const,
        localDate: today, timezone: 'Africa/Cairo', startedAt: new Date(), endedAt: new Date() };
      await tx.insert(workoutSessions).values([
        { ...base, endedAt: null, clientUuid: randomUUID() },
        { ...base, state: 'active', endedAt: null, clientUuid: randomUUID() },
        { ...base, clientUuid: randomUUID(), voidedAt: new Date(), voidedBy: f.owner.userId, voidReason: 'Duplicate' },
      ]);
    });
    const data = await withAuthTx(f.owner, tx => readInboxInputs(tx, f.owner));
    expect(data.inputs.find(input => input.clientId === f.clientId)?.workouts).toMatchObject({ done7: 1, done14: 1 });
  });
  it('scopes staff to assigned clients and excludes archived or inactive clients', async () => {
    expect((await inbox(staffUser)).items.map(row => row.client.id)).toEqual([f.clientId]);
    await setupApiData(f.owner.tenantId, 'archived and inactive inbox clients', async tx => {
      await tx.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, f.clientId));
      await tx.update(clients).set({ status: 'lead' }).where(eq(clients.id, f.otherClientId));
    });
    expect((await inbox()).items).toEqual([]);
  });
  it('refuses clients, unauthenticated callers, missing clients/view and invalid limits', async () => {
    expect((await call(app, 'GET', '/api/v1/inbox', { as: f.userId })).status).toBe(403);
    expect((await call(app, 'GET', '/api/v1/inbox')).status).toBe(401);
    expect((await call(app, 'GET', '/api/v1/inbox', { as: f.staffId })).status).toBe(403);
    for (const limit of ['0', '201', '-1', '1.5', 'abc']) expect((await call(app, 'GET', `/api/v1/inbox?limit=${limit}`, { as: f.owner.userId })).status).toBe(400);
  });
});
