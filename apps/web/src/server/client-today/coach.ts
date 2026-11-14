import 'server-only';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { clientColumns } from '@dawlyy/db';
import { clientEntitlementOverrides } from '@dawlyy/db/schema';
import { resolveEntitlements } from '@dawlyy/core/entitlements';
import type { EntitlementOverride } from '@dawlyy/core/types';
import type { ThreadData } from '@/components/messaging/types';
import { pickCoachIdentity } from '@/components/client-today/view-model';
import type { CoachIdentity, CoachPromise } from '@/components/client-today/types';
import { withAuthTx, type AuthContext, type Tx } from '../db';
import { forbidden } from '../../api/errors';
import { clientThreadPageData } from '../messaging/page-data';
import { getBusiness } from '../settings/client-read';
import { mySubscription, tenantToday } from '../subscriptions/client-read';

/** Rows of app.team_directory(): the approved public staff directory (security design 7.10.2). */
const directoryRow = z.object({ user_id: z.string(), role: z.string(), display_name: z.string().nullable() });

export type CoachPageData = {
  userId: string;
  businessName: string;
  identity: CoachIdentity;
  promise: CoachPromise;
  thread: ThreadData | null;
};

function directoryRows(result: unknown) {
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown[] } | null)?.rows ?? [];
  return rows.flatMap(row => { const parsed = directoryRow.safeParse(row); return parsed.success ? [parsed.data] : []; });
}

/** The enabled effective chat entitlement's turnaround for the client's own subscription, if any. */
async function chatTurnaround(tx: Tx, auth: AuthContext): Promise<number | null> {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  const own = await mySubscription(tx, auth);
  const subscription = own.subscription;
  if (!subscription) return null;
  const rows = await tx.select({ override: clientColumns.clientEntitlementOverrides.override }).from(clientEntitlementOverrides)
    .where(and(eq(clientEntitlementOverrides.tenantId, auth.tenantId), eq(clientEntitlementOverrides.clientId, auth.clientId), isNull(clientEntitlementOverrides.revokedAt),
      or(isNull(clientEntitlementOverrides.subscriptionId), eq(clientEntitlementOverrides.subscriptionId, subscription.id))))
    .orderBy(asc(clientEntitlementOverrides.createdAt), asc(clientEntitlementOverrides.id));
  try {
    const { today } = await tenantToday(tx, auth.tenantId);
    const effective = resolveEntitlements(subscription.packageSnapshot.entitlements, rows.map(row => row.override as EntitlementOverride), { today });
    const chat = effective.find(entitlement => entitlement.key === 'chat' && entitlement.enabled);
    return chat?.turnaroundHours ?? null;
  } catch { return null; }
}

/** R2a: Coach destination data. Names come only from the public directory; no portrait source exists. */
export async function loadCoachPageData(auth: AuthContext): Promise<CoachPageData> {
  const thread = await clientThreadPageData(auth);
  const base = await withAuthTx(auth, async tx => {
    const business = await getBusiness(tx, auth);
    const directory = directoryRows(await tx.execute(sql`select user_id, role, display_name from app.team_directory()`));
    return { business, directory, chatHours: await chatTurnaround(tx, auth) };
  });
  return {
    userId: auth.userId,
    businessName: base.business.name,
    identity: pickCoachIdentity(base.directory, thread),
    promise: { chatHours: base.chatHours, checkinReviewHours: base.business.settings.checkinReviewTurnaroundHours ?? null },
    thread,
  };
}