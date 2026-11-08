import { accessStatus } from '@dawlyy/core/subscription';
import type { SubscriptionState } from '@dawlyy/core/types';
import { withAuthTx } from '@dawlyy/db';
import { subscriptions, tenants } from '@dawlyy/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { ApiError } from '../errors';
import type { AuthVariables } from './auth';

/** doc §12.1 / spec §30: minimal subscription projection for local-date access checks. */
export type AccessSubscription = {
  id: string;
  state: SubscriptionState;
  startsOn: string;
  endsOn: string;
  graceEndsOn?: string | null;
  createdAt: Date;
};

/** doc §12.1 / spec §30: access result; denial describes the latest stored subscription, if present. */
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; details: { state: SubscriptionState; endsOn: string } | { state: null } };

/** doc §12.1 / spec §30: allow any covering active/grace subscription using the core inclusive-date rules. */
export function decideAccess(subscriptions: readonly AccessSubscription[], today: string): AccessDecision {
  let latest: AccessSubscription | undefined;
  let allowed = false;
  for (const subscription of subscriptions) {
    if (accessStatus(subscription, today).hasAccess) allowed = true;
    if (!latest || subscription.createdAt.getTime() > latest.createdAt.getTime()
      || (subscription.createdAt.getTime() === latest.createdAt.getTime() && subscription.id > latest.id)) {
      latest = subscription;
    }
  }
  if (allowed) return { allowed: true };
  return { allowed: false, details: latest ? { state: latest.state, endsOn: latest.endsOn } : { state: null } };
}

/** doc §12.1 / spec §30: mount after auth only on live-access routes; staff/owners pass and history stays ungated. */
export const requireActiveAccess = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const auth = c.get('auth');
  if (auth.role === 'owner' || auth.role === 'staff') {
    await next();
    return;
  }
  const clientId = auth.clientId;
  if (!clientId) throw new ApiError(403, 'access_expired', 'Active subscription required', { state: null });

  const decision = await withAuthTx(auth, async (tx) => {
    // Use the tenant's date, not the application host, UTC, or a subscription's timezone snapshot.
    const [tenant] = await tx.select({
      today: sql<string>`to_char(current_timestamp at time zone ${tenants.timezone}, 'YYYY-MM-DD')`,
    }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
    if (!tenant) return { allowed: false, details: { state: null } } as const;
    const rows = await tx.select({
      id: subscriptions.id,
      state: subscriptions.state,
      startsOn: subscriptions.startsOn,
      endsOn: subscriptions.endsOn,
      graceEndsOn: subscriptions.graceEndsOn,
      createdAt: subscriptions.createdAt,
    }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId)));
    return decideAccess(rows, tenant.today);
  });
  if (!decision.allowed) throw new ApiError(403, 'access_expired', 'Active subscription required', decision.details);
  await next();
});
