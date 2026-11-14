import 'server-only';
import { and, asc, desc, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { businessSettings, clientEntitlementOverrides, clients, subscriptions } from '@dawlyy/db/schema';
import { ClientModules, DEFAULT_CLIENT_MODULES, resolveClientModules, type ClientModule } from '@dawlyy/core/types';
import { localDateOf } from '@dawlyy/core/schedule';
import type { AuthContext, Tx } from './db';
import { forbidden, notFound } from '../api/errors';
import { requirePermission } from './require-permission';
import { postgresCode } from './postgres-code';

/** R0c/R2a: settings default to all on, including tenants without a settings row yet. */
export async function getTenantClientModules(tx: Tx, auth: AuthContext) {
  const [row] = await tx.select(clientColumns.businessSettings).from(businessSettings).where(eq(businessSettings.tenantId, auth.tenantId)).limit(1);
  return ClientModules.parse({ ...DEFAULT_CLIENT_MODULES, ...row?.clientModules });
}
/** R0c/R2a: module overrides follow the existing current-subscription and chronological override order. */
export async function getClientModules(tx: Tx, auth: AuthContext, clientId: string): Promise<ClientModules> {
  if (auth.role === 'client' && auth.clientId !== clientId) throw forbidden();
  const [client] = await tx.select({ id: clientColumns.clients.id, timezone: clientColumns.clients.timezone }).from(clients)
    .where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
  if (!client) throw notFound();
  const [subscription] = await tx.select({ id: clientColumns.subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId), ne(subscriptions.state, 'cancelled')))
    .orderBy(sql`case when ${subscriptions.state} in ('active','grace','paused','suspended') then 0 when ${subscriptions.state} = 'pending' then 1 else 2 end`, desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
  const overrides = await tx.select({ override: clientColumns.clientEntitlementOverrides.override }).from(clientEntitlementOverrides)
    .where(and(eq(clientEntitlementOverrides.tenantId, auth.tenantId), eq(clientEntitlementOverrides.clientId, clientId), isNull(clientEntitlementOverrides.revokedAt),
      subscription ? or(isNull(clientEntitlementOverrides.subscriptionId), eq(clientEntitlementOverrides.subscriptionId, subscription.id)) : isNull(clientEntitlementOverrides.subscriptionId)))
    .orderBy(asc(clientEntitlementOverrides.createdAt), asc(clientEntitlementOverrides.id));
  const today = localDateOf(new Date().toISOString(), client.timezone);
  const partial: Partial<ClientModules> = {};
  for (const { override } of overrides) if (!override.expiresOn || override.expiresOn >= today) Object.assign(partial, override.modules);
  return resolveClientModules(await getTenantClientModules(tx, auth), partial);
}
/** R0c/R2a: staff bypass the client-app gate; reads remain available to every authorized caller. */
export async function requireClientModule(tx: Tx, auth: AuthContext, module: ClientModule): Promise<void> {
  if (auth.role !== 'client') return;
  if (!auth.clientId || !(await getClientModules(tx, auth, auth.clientId))[module]) throw forbidden('module_disabled');
}
/** R0c/R2a: owner policy is repeated by RLS; never use a service transaction for settings. */
export async function putTenantClientModules(tx: Tx, auth: AuthContext, input: ClientModules) {
  requirePermission(auth, 'settings', 'edit');
  const clientModules = ClientModules.parse(input);
  if (auth.role !== 'owner') throw forbidden();
  try {
    await tx.insert(businessSettings).values({ tenantId: auth.tenantId, clientModules, settings: {
      units: { weight: 'kg', length: 'cm' }, numerals: 'western', weekStartsOn: 6,
      exerciseCategories: [], measurementTemplate: [], checkinReviewTurnaroundHours: 48,
    } }).onConflictDoUpdate({ target: businessSettings.tenantId, set: { clientModules } });
    return getTenantClientModules(tx, auth);
  } catch (error) { if (postgresCode(error) === '42501') throw forbidden(); throw error; }
}
