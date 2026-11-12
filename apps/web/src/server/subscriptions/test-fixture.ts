import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ScheduleRules } from '@dawlyy/core/types';
import { clients, memberships, packages } from '@dawlyy/db/schema';
import { setupApiFixture, setupApiData } from '../../test/api-harness';
import { todayIn } from './timeline';

/** T3b tests: isolated tenant, two clients, one staff caller without billing:verify, and a schedulable package. */
export async function setupBillingFixture() {
  const base = await setupApiFixture();
  try {
    const clientId = randomUUID(); const otherClientId = randomUUID();
    const clientUser = randomUUID(); const otherClientUser = randomUUID(); const staffUser = randomUUID(); const packageId = randomUUID();
    const tenantId = base.owner.tenantId;
    await setupApiData(tenantId, 'billing fixtures', async (tx) => {
      // Read first (db contract P30: a clients INSERT never relies on catching 23505): the fixture tenant starts empty.
      if ((await tx.select({ id: clients.id }).from(clients).where(eq(clients.tenantId, tenantId))).length > 0) throw new Error('fixture tenant must start without clients');
      await tx.insert(clients).values([{ id: clientId, tenantId, firstName: 'Client A' }, { id: otherClientId, tenantId, firstName: 'Client B' }]);
      await tx.insert(memberships).values([
        { tenantId, userId: clientUser, role: 'client', clientId, status: 'active', displayName: 'Client A' },
        { tenantId, userId: otherClientUser, role: 'client', clientId: otherClientId, status: 'active', displayName: 'Client B' },
        { tenantId, userId: staffUser, role: 'staff', status: 'active', displayName: 'Billing staff', permissions: { client_scope: 'all', modules: { billing: ['view', 'create', 'edit'] } } },
      ]);
      await tx.insert(packages).values({ id: packageId, tenantId, name: { en: 'Four weeks', ar: 'أربع أسابيع' }, durationDays: 28,
        graceDays: 2, price: 300, currency: 'EGP', entitlements: [], scheduleRules: ScheduleRules.parse({}) });
    });
    return { ...base, clientId, otherClientId, clientUser, otherClientUser, staffUser, packageId, today: todayIn('Africa/Cairo') };
  } catch (error) { await base.cleanup(); throw error; }
}
