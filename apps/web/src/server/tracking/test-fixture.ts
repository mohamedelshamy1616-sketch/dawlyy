import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { clients, memberships } from '@dawlyy/db/schema';
import { setupApiData, setupApiFixture } from '../../test/api-harness';

/** Task 8 tests: two linked clients in one tenant, using the real RLS harness. */
export async function trackingFixture() {
  const fixture = await setupApiFixture();
  try {
    const data = await setupApiData(fixture.owner.tenantId, 'two tracking clients', async tx => {
      // Read first (db contract P30: a clients INSERT never relies on catching 23505): the fixture tenant starts empty.
      if ((await tx.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, fixture.owner.tenantId))).length > 0) throw new Error('fixture tenant must start without clients');
      const entries = [];
      for (const firstName of ['A', 'B']) {
        const [client] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName, timezone: 'Africa/Cairo' }).returning({ id: clients.id });
        if (!client) throw new Error('Missing tracking client');
        const userId = randomUUID();
        await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: client.id });
        entries.push({ clientId: client.id, userId });
      }
      const a = entries[0]; const b = entries[1]; if (!a || !b) throw new Error('Missing tracking fixture');
      return { a, b };
    });
    return { ...fixture, ...data };
  } catch (error) { await fixture.cleanup(); throw error; }
}
