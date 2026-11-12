import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { clientColumns, type Tx } from '@dawlyy/db';
import { notificationDeliveries, notifications, pushSubscriptions, tenants, userPreferences } from '@dawlyy/db/schema';
import { effectiveChannels, isValidTimeZone, quietWindowEnd, type NotifyChannel } from './logic';

/** Task 9: what a module hands to `notify`. Title and body carry both languages; the channel picks one at render time. */
export type NotifyInput = {
  tenantId: string;
  userId: string;
  clientId?: string | null;
  /** e.g. `message`, `checkin_due`. */
  type: string;
  title: { ar: string; en: string };
  body?: { ar?: string; en?: string };
  /** In-app path without the locale prefix, e.g. `/coach/messages/<id>`. */
  link?: string;
  /** One notification per `(user, dedupeKey)`; a repeat call returns the existing one. */
  dedupeKey: string;
  /** `shareBody: false` keeps the text out of email and push (private content). */
  payload?: Record<string, unknown>;
  now?: Date;
};

export type NotifyResult = {
  notificationId: string;
  created: boolean;
  deliveries: Array<{ channel: NotifyChannel; state: 'queued' | 'delivered'; scheduledFor: Date }>;
};

/**
 * Task 9: create one in-app notification and queue its channel deliveries, idempotently.
 * Must run in a service transaction (`withServiceTx`): the runtime role has no INSERT on `notifications` or
 * `notification_deliveries` (doc section 12.1, rule 6 of the table in 5.2). Safe to call twice with the same dedupe key.
 *
 * In-app: the notification itself, with a `delivered` in-app delivery row, never deferred.
 * Email and Web Push: `queued` rows whose `scheduled_for` is the end of the user's quiet hours when now is inside them.
 * A channel the user switched off gets no row; Web Push also needs a live subscription.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<NotifyResult> {
  const now = input.now ?? new Date();
  const [inserted] = await tx.insert(notifications).values({
    tenantId: input.tenantId, userId: input.userId, clientId: input.clientId ?? null, type: input.type,
    title: input.title, body: input.body ?? null, link: input.link ?? null, dedupeKey: input.dedupeKey, payload: input.payload ?? null,
  }).onConflictDoNothing({ target: [notifications.tenantId, notifications.userId, notifications.dedupeKey] }).returning({ id: clientColumns.notifications.id });
  let notificationId = inserted?.id;
  if (!notificationId) {
    const [existing] = await tx.select({ id: clientColumns.notifications.id }).from(notifications)
      .where(and(eq(notifications.tenantId, input.tenantId), eq(notifications.userId, input.userId), eq(notifications.dedupeKey, input.dedupeKey))).limit(1);
    if (!existing) throw new Error('notification neither inserted nor found');
    notificationId = existing.id;
  }
  // Two callers racing on the same notification must not both add delivery rows.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`notify:${notificationId}`}, 0))`);

  const [prefsRow] = await tx.select({ preferences: clientColumns.userPreferences.preferences }).from(userPreferences)
    .where(and(eq(userPreferences.tenantId, input.tenantId), eq(userPreferences.userId, input.userId))).limit(1);
  const prefs = prefsRow?.preferences ?? {};
  const [tenant] = await tx.select({ timezone: clientColumns.tenants.timezone }).from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  const zoneCandidate = prefs.timezone ?? tenant?.timezone ?? 'Africa/Cairo';
  const zone = isValidTimeZone(zoneCandidate) ? zoneCandidate : 'Africa/Cairo';
  const channels = effectiveChannels(prefs);
  const [subscription] = channels.webpush
    ? await tx.select({ id: clientColumns.pushSubscriptions.id }).from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.tenantId, input.tenantId), eq(pushSubscriptions.userId, input.userId), isNull(pushSubscriptions.failedAt))).limit(1)
    : [];
  const wanted: NotifyChannel[] = ['inapp'];
  if (channels.email) wanted.push('email');
  if (channels.webpush && subscription) wanted.push('webpush');

  const present = new Set((await tx.select({ channel: clientColumns.notificationDeliveries.channel }).from(notificationDeliveries)
    .where(and(eq(notificationDeliveries.tenantId, input.tenantId), eq(notificationDeliveries.notificationId, notificationId)))).map(row => row.channel));
  const deferredUntil = quietWindowEnd(now, prefs.quietHours, zone);
  const created: NotifyResult['deliveries'] = [];
  for (const channel of wanted) {
    if (present.has(channel)) continue;
    const base = { tenantId: input.tenantId, notificationId, userId: input.userId, channel };
    if (channel === 'inapp') {
      await tx.insert(notificationDeliveries).values({ ...base, state: 'delivered', scheduledFor: now, sentAt: now, deliveredAt: now });
      created.push({ channel, state: 'delivered', scheduledFor: now });
    } else {
      const scheduledFor = deferredUntil ?? now;
      await tx.insert(notificationDeliveries).values({ ...base, state: 'queued', scheduledFor });
      created.push({ channel, state: 'queued', scheduledFor });
    }
  }
  return { notificationId, created: Boolean(inserted), deliveries: created };
}
