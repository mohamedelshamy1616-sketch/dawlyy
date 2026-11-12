import 'server-only';
import { accessStatus } from '@dawlyy/core/subscription';
import type { SubscriptionState } from '@dawlyy/core/types';
import { clientColumns } from '@dawlyy/db';
import { subscriptions, tenants } from '@dawlyy/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ApiError } from '../api/errors';
import type { AuthContext, Tx } from './db';

/** Minimal subscription projection for the existing inclusive-date access rules. */
export type AccessSubscription = {
  id: string;
  state: SubscriptionState;
  startsOn: string;
  endsOn: string;
  graceEndsOn?: string | null;
  createdAt: Date;
};
export type AccessDecision =
  | { allowed: true }
  | { allowed: false; details: { state: SubscriptionState; endsOn: string } | { state: null } };

/** Spec §30: any covering active/grace subscription allows access. */
export function decideAccess(subscriptions: readonly AccessSubscription[], today: string): AccessDecision {
  let latest: AccessSubscription | undefined;
  let allowed = false;
  for (const subscription of subscriptions) {
    if (accessStatus(subscription, today).hasAccess) allowed = true;
    if (!latest || subscription.createdAt.getTime() > latest.createdAt.getTime()
      || (subscription.createdAt.getTime() === latest.createdAt.getTime() && subscription.id > latest.id)) latest = subscription;
  }
  if (allowed) return { allowed: true };
  return { allowed: false, details: latest ? { state: latest.state, endsOn: latest.endsOn } : { state: null } };
}

/** Evaluate under the caller's RLS transaction using the tenant's current date. */
export async function checkActiveAccess(tx: Tx, auth: AuthContext): Promise<AccessDecision> {
  if (auth.role === 'owner' || auth.role === 'staff') return { allowed: true };
  if (!auth.clientId) return { allowed: false, details: { state: null } };
  const [tenant] = await tx.select({
    today: sql<string>`to_char(current_timestamp at time zone ${clientColumns.tenants.timezone}, 'YYYY-MM-DD')`,
  }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
  if (!tenant) return { allowed: false, details: { state: null } };
  const rows = await tx.select({ id: clientColumns.subscriptions.id, state: clientColumns.subscriptions.state, startsOn: clientColumns.subscriptions.startsOn,
    endsOn: clientColumns.subscriptions.endsOn, graceEndsOn: clientColumns.subscriptions.graceEndsOn, createdAt: clientColumns.subscriptions.createdAt,
  }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, auth.clientId)));
  return decideAccess(rows, tenant.today);
}

/** Shared page/API boundary; history readers deliberately do not call this. */
export async function assertActiveAccess(tx: Tx, auth: AuthContext): Promise<void> {
  const decision = await checkActiveAccess(tx, auth);
  if (!decision.allowed) throw new ApiError(403, 'access_expired', 'Active subscription required', decision.details);
}
