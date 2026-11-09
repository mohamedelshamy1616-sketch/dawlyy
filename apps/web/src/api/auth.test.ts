import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { withErasureTx } from '@dawlyy/db';
import { businessSettings, memberships, tenants, userPreferences } from '@dawlyy/db/schema';
import { call, setupApiData } from '@/src/test/api-harness';
import { app } from './index';

const cleanupIds: string[] = [];
afterEach(async () => {
  for (const tenantId of cleanupIds.splice(0)) {
    await withErasureTx(tenantId, 'api test: bootstrap cleanup', async (tx) => {
      await tx.execute(sql`select app.close_tenant(${tenantId}::uuid)`);
    });
  }
});

describe('Task 2 bootstrap API', () => {
  const body = { businessName: 'Bootstrap Coaching', displayName: 'Coach', locale: 'ar', timezone: 'Africa/Cairo' };
  it('creates a tenant, active owner, settings and preferences and rejects another bootstrap', async () => {
    const userId = randomUUID();
    const response = await call(app, 'POST', '/api/v1/auth/bootstrap', { as: userId, body });
    expect(response.status).toBe(201);
    const result = response.json as { tenantId: string; membershipId: string };
    cleanupIds.push(result.tenantId);
    await setupApiData(result.tenantId, 'verify bootstrap rows', async (tx) => {
      const [tenant] = await tx.select({ counter: tenants.receiptCounter }).from(tenants).where(eq(tenants.id, result.tenantId));
      expect(tenant?.counter).toBe(0);
      const [member] = await tx.select({ role: memberships.role, status: memberships.status, userId: memberships.userId })
        .from(memberships).where(and(eq(memberships.tenantId, result.tenantId), eq(memberships.id, result.membershipId)));
      expect(member).toEqual({ role: 'owner', status: 'active', userId });
      const [settings] = await tx.select({ settings: businessSettings.settings }).from(businessSettings).where(eq(businessSettings.tenantId, result.tenantId));
      expect(settings?.settings).toMatchObject({ units: { weight: 'kg', length: 'cm' }, numerals: 'western', weekStartsOn: 6, exerciseCategories: [] });
      const [preferences] = await tx.select({ preferences: userPreferences.preferences }).from(userPreferences)
        .where(and(eq(userPreferences.tenantId, result.tenantId), eq(userPreferences.userId, userId)));
      expect(preferences?.preferences.locale).toBe('ar');
    });
    const second = await call(app, 'POST', '/api/v1/auth/bootstrap', { as: userId, body });
    expect(second).toMatchObject({ status: 409, json: { error: { code: 'already_member' } } });
  });

  it('allocates numeric slug suffixes and serializes concurrent calls for one user', async () => {
    const businessName = `Concurrent ${randomUUID()}`;
    const userId = randomUUID();
    const results = await Promise.all([1, 2].map(() => call(app, 'POST', '/api/v1/auth/bootstrap', { as: userId, body: { ...body, businessName } })));
    for (const result of results) if (result.status === 201) cleanupIds.push((result.json as { tenantId: string }).tenantId);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const other = await call(app, 'POST', '/api/v1/auth/bootstrap', { as: randomUUID(), body: { ...body, businessName } });
    expect(other.status).toBe(201);
    const secondId = (other.json as { tenantId: string }).tenantId;
    cleanupIds.push(secondId);
    await setupApiData(secondId, 'verify slug suffix', async (tx) => {
      const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, secondId));
      expect(tenant?.slug).toMatch(/-2$/);
    });
  });

  it('requires identity and validates the input', async () => {
    expect((await call(app, 'POST', '/api/v1/auth/bootstrap', { body })).status).toBe(401);
    expect((await call(app, 'POST', '/api/v1/auth/bootstrap', { as: randomUUID(), body: { ...body, timezone: 'bad' } })).status).toBe(400);
  });
});
