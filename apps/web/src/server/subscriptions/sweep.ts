import { dueTransition } from '@dawlyy/core/subscription';
import { transition } from '@dawlyy/core/state';
import { IsoDate, SubscriptionState } from '@dawlyy/core/types';
import { subscriptions, subscriptionEvents } from '@dawlyy/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { withServiceTx } from '../db';

/** T3b / T8: idempotent inclusive-date expiry sweep; all service statements explicitly scope the tenant. */
export async function sweepSubscriptions(tenantId: string, today: string): Promise<number> {
  IsoDate.parse(today);
  return withServiceTx(tenantId, 'subscription expiry sweep', async (tx) => {
    const rows = await tx.select().from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), inArray(subscriptions.state, ['active', 'grace']))).orderBy(asc(subscriptions.id)).for('update');
    let changed = 0;
    for (const row of rows) {
      const event = dueTransition(row, today);
      if (!event) continue;
      const result = transition('subscription', row.state, event);
      if (!result.ok) throw new Error(result.message);
      const state = SubscriptionState.parse(result.to);
      await tx.update(subscriptions).set({ state, updatedAt: new Date() })
        .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, row.id), eq(subscriptions.state, row.state)));
      // No service-allowed semantic name exists; row audit triggers retain the transition.
      await tx.insert(subscriptionEvents).values({ tenantId, clientId: row.clientId, subscriptionId: row.id,
        kind: state === 'grace' ? 'grace' : 'expired', fromState: row.state, toState: state, oldEndsOn: row.endsOn, newEndsOn: row.endsOn, reason: 'Subscription expiry sweep' });
      changed++;
    }
    return changed;
  });
}
