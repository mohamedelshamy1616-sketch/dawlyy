import { clientColumns } from '@dawlyy/db';
import { clients, packages, subscriptions, subscriptionEvents, tenants, calendarEvents, clientEntitlementOverrides } from '@dawlyy/db/schema';
import { accessStatus, endsOnFor, graceEndsOnFor, SubscriptionError } from '@dawlyy/core/subscription';
import { addDays, zonedDueAt } from '@dawlyy/core/schedule';
import { transition } from '@dawlyy/core/state';
import { resolveEntitlements } from '@dawlyy/core/entitlements';
import { SubscriptionState } from '@dawlyy/core/types';
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import type { AuthContext, Tx } from '../db';
import { requireBillingPermission } from '../payments/permission';
import { notFound, unprocessable, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { manualPaymentProvider } from '../payments/provider';
import { moneyMinor, moneyNumber } from '../payments/money';
import { saleInput, subscriptionQuery } from './contracts';
import { buildCalendar, freezeReason, readReason, timelineFor } from './timeline';

import { tenantToday } from './client-read';
export { tenantToday, mySubscription } from './client-read';

/** T3b: staff subscriptions list; clients have a separate own-subscription boundary. */
export async function listSubscriptions(tx: Tx, auth: AuthContext, query: z.infer<typeof subscriptionQuery>) {
  requireBillingPermission(auth, 'view');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !z.iso.datetime().safeParse(cursor.k).success || !z.uuid().safeParse(cursor.id).success)) throw validationError(undefined, 'Invalid subscription cursor');
  const sortKey = sql<string>`to_char(${subscriptions.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  const conditions = [eq(subscriptions.tenantId, auth.tenantId)];
  if (query.clientId) conditions.push(eq(subscriptions.clientId, query.clientId));
  if (query.state) conditions.push(eq(subscriptions.state, query.state));
  if (cursor) conditions.push(or(lt(sortKey, String(cursor.k)), and(eq(sortKey, String(cursor.k)), lt(subscriptions.id, cursor.id)))!);
  const rows = await tx.select(clientColumns.subscriptions).from(subscriptions).where(and(...conditions))
    .orderBy(desc(sortKey), desc(subscriptions.id)).limit(limit + 1);
  return page(rows, limit, (row) => row.createdAt.toISOString());
}

/** T3b: staff detail with the immutable ledger, entitlement resolution and upcoming calendar. */
export async function getSubscription(tx: Tx, auth: AuthContext, id: string) {
  requireBillingPermission(auth, 'view');
  const [sub] = await tx.select(clientColumns.subscriptions).from(subscriptions)
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, id))).limit(1);
  if (!sub) throw notFound();
  const { today } = await tenantToday(tx, auth.tenantId);
  const events = await tx.select(clientColumns.subscriptionEvents).from(subscriptionEvents)
    .where(and(eq(subscriptionEvents.tenantId, auth.tenantId), eq(subscriptionEvents.subscriptionId, id)))
    .orderBy(asc(subscriptionEvents.createdAt), asc(subscriptionEvents.id));
  const upcoming = await tx.select(clientColumns.calendarEvents).from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.subscriptionId, id), gte(calendarEvents.localDate, today)))
    .orderBy(asc(calendarEvents.dueAt), asc(calendarEvents.id)).limit(100);
  const overrides = await tx.select({ override: clientEntitlementOverrides.override }).from(clientEntitlementOverrides)
    .where(and(eq(clientEntitlementOverrides.tenantId, auth.tenantId), eq(clientEntitlementOverrides.clientId, sub.clientId),
      isNull(clientEntitlementOverrides.revokedAt), or(isNull(clientEntitlementOverrides.subscriptionId), eq(clientEntitlementOverrides.subscriptionId, id))))
    .orderBy(asc(clientEntitlementOverrides.createdAt), asc(clientEntitlementOverrides.id));
  return { subscription: sub, events: events.map((e) => ({ ...e, ...(e.kind === 'freeze' ? readReason(e.reason) : { reason: e.reason }) })), upcoming: upcoming.map(({ attachedFormId, pinnedVersionId, ...event }) => {
    void attachedFormId; void pinnedVersionId; return event;
  }),
    accessStatus: accessStatus(sub, today), entitlements: resolveEntitlements(sub.packageSnapshot.entitlements, overrides.map((e) => e.override), { today }) };
}

/** T3b / G1: sale, optional pending payment, separate verification UPDATE and activation are atomic. */
export async function sellPackage(tx: Tx, auth: AuthContext, input: z.infer<typeof saleInput>) {
  requireBillingPermission(auth, 'create');
  if (input.payment?.markVerified) { requireBillingPermission(auth, 'verify'); requireBillingPermission(auth, 'edit'); }
  const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, input.clientId))).limit(1);
  const [pkg] = await tx.select().from(packages).where(and(eq(packages.tenantId, auth.tenantId), eq(packages.id, input.packageId), isNull(packages.archivedAt))).limit(1);
  if (!client || !pkg) throw notFound();
  const { today, timezone } = await tenantToday(tx, auth.tenantId);
  const timeline = { startsOn: input.startsOn, durationDays: pkg.durationDays, extensionDays: 0, freezes: [], graceDays: pkg.graceDays, timezone };
  // Validate the copied schedule before committing any money, even though inserts happen in a service transaction afterwards.
  let calendar: ReturnType<typeof buildCalendar>;
  try { calendar = buildCalendar(timeline, pkg.scheduleRules); }
  catch (error) {
    if (error instanceof SubscriptionError) throw unprocessable(error.code, error.message);
    throw error;
  }
  const [sub] = await tx.insert(subscriptions).values({ tenantId: auth.tenantId, clientId: client.id, packageId: pkg.id,
    packageSnapshot: { name: pkg.name, entitlements: pkg.entitlements, scheduleRules: pkg.scheduleRules, durationDays: pkg.durationDays, price: pkg.price, currency: pkg.currency },
    startsOn: input.startsOn, endsOn: calendar.endsOn, graceEndsOn: calendar.graceEndsOn, timezone,
    price: moneyNumber(moneyMinor(pkg.price)), currency: pkg.currency }).returning(clientColumns.subscriptions);
  if (!sub) throw notFound();
  let payment = input.payment ? await manualPaymentProvider.record(tx, auth, sub.id, input.payment) : null;
  if (payment && input.payment?.markVerified) payment = await manualPaymentProvider.verify(tx, auth, payment.id);
  const subscription = { ...sub, state: payment?.state === 'verified' ? 'active' as const : sub.state };
  return { subscription, payment, renewalDate: addDays(subscription.endsOn, 1), accessStatus: accessStatus(subscription, today) };
}

/** T3b: lifecycle writes, row-locked and audited; calendar sync runs after this transaction commits. */
export async function changeSubscription(tx: Tx, auth: AuthContext, id: string, action: 'extend' | 'freeze' | 'resume' | 'cancel', input: { days?: number; fromDate?: string; reason?: string }) {
  requireBillingPermission(auth, 'edit');
  const [sub] = await tx.select().from(subscriptions)
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, id))).for('update');
  if (!sub) throw notFound();
  const ledger = await tx.select().from(subscriptionEvents)
    .where(and(eq(subscriptionEvents.tenantId, auth.tenantId), eq(subscriptionEvents.subscriptionId, id)))
    .orderBy(asc(subscriptionEvents.createdAt), asc(subscriptionEvents.id));
  const timeline = timelineFor(sub, ledger);
  const { today } = await tenantToday(tx, auth.tenantId);
  const event = action === 'extend' ? 'renew' : action === 'freeze' ? 'pause' : action;
  let state = sub.state;
  if (action !== 'extend' || state !== 'active') {
    const result = transition('subscription', state, event);
    if (!result.ok) throw unprocessable('transition_refused', result.message, { from: state, event });
    state = SubscriptionState.parse(result.to);
  }
  let days = input.days ?? null;
  let reason = input.reason ?? null;
  if (action === 'extend') timeline.extensionDays += input.days ?? 0;
  if (action === 'freeze') {
    if (!input.fromDate || !input.days) throw validationError();
    timeline.freezes.push({ fromDate: input.fromDate, days: input.days });
    reason = freezeReason(input.fromDate, input.reason ?? '');
  }
  if (action === 'resume') {
    const freeze = timeline.freezes.at(-1);
    if (!freeze) throw unprocessable('invalid_timeline', 'Paused subscription has no freeze');
    const elapsed = Math.max(0, Math.min(freeze.days, Math.round((Date.parse(today) - Date.parse(freeze.fromDate)) / 86400000)));
    days = elapsed - freeze.days; // Append-only correction; never rewrite the approved freeze.
    freeze.days = elapsed;
    if (elapsed === 0) timeline.freezes.pop();
  }
  let endsOn: string;
  let graceEndsOn: string | null;
  try {
    endsOn = endsOnFor(timeline); graceEndsOn = graceEndsOnFor(timeline);
    buildCalendar(timeline, sub.packageSnapshot.scheduleRules);
  } catch (error) {
    if (error instanceof SubscriptionError) throw unprocessable(error.code, error.message);
    throw error;
  }
  if (action === 'extend' && endsOn < today && (graceEndsOn === null || graceEndsOn < today))
    throw unprocessable('extension_insufficient', 'Extension must restore current access');
  const [updated] = await tx.update(subscriptions).set({ state, endsOn, graceEndsOn,
    frozenDays: timeline.freezes.reduce((sum, freeze) => sum + freeze.days, 0),
    pausedAt: action === 'freeze' && input.fromDate ? new Date(zonedDueAt(input.fromDate, '00:00', sub.timezone)) : action === 'resume' ? null : sub.pausedAt })
    .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.id, id))).returning(clientColumns.subscriptions);
  if (!updated) throw notFound();
  await tx.insert(subscriptionEvents).values({ tenantId: auth.tenantId, clientId: sub.clientId, subscriptionId: id,
    kind: action === 'extend' ? 'extension' : action, fromState: sub.state, toState: state, oldEndsOn: sub.endsOn, newEndsOn: endsOn, days, reason });
  const audit = { extend: 'subscription.extend', freeze: 'subscription.freeze', resume: 'subscription.resume', cancel: 'subscription.cancel' } as const;
  const emitted = { extend: 'subscription.extended', freeze: 'subscription.frozen', resume: 'subscription.resumed', cancel: 'subscription.cancelled' } as const;
  await tx.execute(sql`select app.audit(${audit[action]}, 'subscriptions', ${id}, null, null, ${input.reason ?? null})`);
  await tx.execute(sql`select app.emit_event(${emitted[action]}, 'subscriptions', ${id})`);
  return { subscription: updated, accessStatus: accessStatus(updated, today), renewalDate: addDays(endsOn, 1) };
}
