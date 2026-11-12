import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { withErasureTx, withServiceTx, type AuthContext, type Tx } from '@dawlyy/db';
import { memberships, tenants } from '@dawlyy/db/schema';
import { packages, subscriptions } from '@dawlyy/db/schema';
import { ScheduleRules } from '@dawlyy/core/types';

// Only Supabase identity is faked: membership discovery and downstream RLS use the real database.
vi.mock('@/src/server/supabase', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async (token?: string) => ({
        data: { user: token ? { id: token, email: null } : null },
        error: null,
      }),
    },
  }),
}));

function requireDatabase(): void {
  const missing = ['DATABASE_URL', 'DATABASE_URL_SERVICE'].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`API harness requires ${missing.join(' and ')}. Set DATABASE_URL to the local dawlyy_app login and DATABASE_URL_SERVICE to the local service login (port 54329); apply migrations first.`);
  }
}

/** doc §14 / P2B API tests: request options; `as` supplies a fake Supabase bearer identity. */
export type ApiCallOptions = { as?: string; body?: unknown; headers?: HeadersInit };

/** doc §14 / P2B API tests: invoke Hono in process; all database operations still use the real transaction wrappers. */
export async function call(
  app: { request(input: Request, init?: RequestInit): Response | Promise<Response> },
  method: string,
  path: string,
  options: ApiCallOptions = {},
): Promise<{ status: number; json: unknown }> {
  requireDatabase();
  const headers = new Headers(options.headers);
  if (options.as) headers.set('authorization', `Bearer ${options.as}`);
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) {
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    init.body = JSON.stringify(options.body);
  }
  const response = await app.request(new Request(new URL(path, 'http://localhost'), init));
  const content = await response.text();
  return { status: response.status, json: content ? JSON.parse(content) as unknown : null };
}

/** doc §14 / P2B API tests: seed data through a reasoned service transaction, requiring both database URLs. */
export async function setupApiData<T>(tenantId: string | null, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  requireDatabase();
  return withServiceTx(tenantId, `api test: ${reason}`, fn);
}

/** N1 live-operation fixtures: the access-live date range covers today in every tenant timezone. */
export async function setupActiveSubscription(tenantId: string, clientId: string): Promise<void> {
  await setupApiData(tenantId, 'active subscription fixture', async tx => {
    const [pkg] = await tx.insert(packages).values({ tenantId, name: { en: 'Access' }, durationDays: 30,
      scheduleRules: ScheduleRules.parse({}) }).returning();
    if (!pkg) throw new Error('Missing fixture package');
    await tx.insert(subscriptions).values({ tenantId, clientId, packageId: pkg.id,
      packageSnapshot: { name: pkg.name, entitlements: pkg.entitlements, scheduleRules: pkg.scheduleRules,
        durationDays: pkg.durationDays, price: pkg.price, currency: pkg.currency },
      state: 'active', startsOn: '2000-01-01', endsOn: '2099-01-01' });
  });
}

/** doc §14 / P2B API tests: create an isolated owner and tenant; cleanup removes only this fixture's tenant. */
export async function setupApiFixture(): Promise<{ owner: AuthContext; cleanup(): Promise<void> }> {
  const tenantId = randomUUID();
  const owner: AuthContext = {
    userId: randomUUID(), tenantId, membershipId: randomUUID(), role: 'owner', permissions: null,
  };
  await setupApiData(tenantId, 'create owner fixture', async (tx) => {
    await tx.insert(tenants).values({ id: tenantId, name: 'API test tenant', slug: `api-test-${tenantId}` });
    await tx.insert(memberships).values({
      id: owner.membershipId, tenantId, userId: owner.userId, role: 'owner', status: 'active', displayName: 'API test owner',
    });
  });
  return {
    owner,
    async cleanup() {
      requireDatabase();
      await withErasureTx(tenantId, 'api test: remove owner fixture', async (tx) => {
        await tx.execute(sql`select app.close_tenant(${tenantId}::uuid)`);
      });
    },
  };
}
