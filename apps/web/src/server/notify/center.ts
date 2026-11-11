import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { notifications, pushSubscriptions, userPreferences } from '@dawlyy/db/schema';
import { notFound, unprocessable } from '@/src/api/errors';
import { page, parseListQuery } from '@/src/api/lib/pagination';
import type { AuthContext, Tx } from '../db';
import { dropSortKey } from '../messaging/logic';
import { effectiveChannels, mergePreferences, type PreferencePatch } from './logic';

/** Task 9: the signed-in user's notification center, preferences and push subscriptions. Own rows only, enforced by RLS. */

const fields = {
  id: clientColumns.notifications.id, type: clientColumns.notifications.type, title: clientColumns.notifications.title, body: clientColumns.notifications.body,
  link: clientColumns.notifications.link, readAt: clientColumns.notifications.readAt, createdAt: clientColumns.notifications.createdAt,
};

/** Task 9: own notifications newest first with the unread count; payload and dedupe key stay server side. */
export async function listNotifications(tx: Tx, auth: AuthContext, query: { limit?: string; cursor?: string; unread?: boolean | undefined }) {
  const { limit, cursor } = parseListQuery(query);
  const mine = and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId));
  const rows = await tx.select({ ...fields, sortKey: sql<string>`${notifications.createdAt}::text` }).from(notifications)
    .where(and(mine, ...(query.unread ? [isNull(notifications.readAt)] : []),
      ...(cursor ? [sql`(${notifications.createdAt}, ${notifications.id}) < (${String(cursor.k)}::timestamptz, ${cursor.id}::uuid)`] : [])))
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(limit + 1);
  const [unread] = await tx.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(mine, isNull(notifications.readAt)));
  const result = page(rows, limit, row => row.sortKey);
  return { items: result.items.map(dropSortKey), nextCursor: result.nextCursor, unreadCount: unread?.n ?? 0 };
}

/** Task 9: mark one own notification read. Already read is a no-op; someone else's (or missing) is 404. */
export async function markNotificationRead(tx: Tx, auth: AuthContext, id: string) {
  const [current] = await tx.select(fields).from(notifications)
    .where(and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId), eq(notifications.id, id))).limit(1);
  if (!current) throw notFound('Notification not found');
  if (current.readAt) return current;
  const [updated] = await tx.update(notifications).set({ readAt: sql`now()` })
    .where(and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId), eq(notifications.id, id))).returning(fields);
  return updated ?? current;
}

/** Task 9: mark every own unread notification read. */
export async function markAllNotificationsRead(tx: Tx, auth: AuthContext) {
  const rows = await tx.update(notifications).set({ readAt: sql`now()` })
    .where(and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId), isNull(notifications.readAt))).returning({ id: notifications.id });
  return { updated: rows.length };
}

/** Task 9: stored preferences plus the effective values the senders will use. */
export async function getPreferences(tx: Tx, auth: AuthContext) {
  const [row] = await tx.select({ preferences: clientColumns.userPreferences.preferences }).from(userPreferences)
    .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId))).limit(1);
  const preferences = row?.preferences ?? {};
  return {
    preferences,
    effective: { ...preferences, channels: effectiveChannels(preferences) },
    pushPublicKey: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() || null,
  };
}

/** Task 9: merge a patch into the stored preferences (quiet hours, channels, language, time zone). */
export async function putPreferences(tx: Tx, auth: AuthContext, patch: PreferencePatch) {
  const [row] = await tx.select({ preferences: clientColumns.userPreferences.preferences }).from(userPreferences)
    .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId))).limit(1);
  const next = mergePreferences(row?.preferences ?? {}, patch);
  if (row) {
    await tx.update(userPreferences).set({ preferences: next, updatedAt: sql`now()` })
      .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId)));
  } else {
    await tx.insert(userPreferences).values({ tenantId: auth.tenantId, userId: auth.userId, preferences: next })
      .onConflictDoUpdate({ target: [userPreferences.tenantId, userPreferences.userId], set: { preferences: next, updatedAt: sql`now()` } });
  }
  return getPreferences(tx, auth);
}

/** Task 9: store a Web Push subscription for the caller through `app.register_push`; https endpoints only. */
export async function registerPushSubscription(tx: Tx, input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string | undefined }) {
  if (!/^https:\/\/[^/@]+\//.test(input.endpoint)) throw unprocessable('invalid_push_endpoint', 'Push endpoints must use https');
  const rows = await tx.execute<{ id: string }>(sql`select app.register_push(${input.endpoint}::text, ${JSON.stringify(input.keys)}::jsonb, ${input.userAgent ?? null}::text)::text as id`);
  const id = rows[0]?.id;
  if (!id) throw unprocessable('invalid_push_subscription');
  return { id };
}

/** Task 9: delete one of the caller's own push subscriptions; another user's id is 404. */
export async function deletePushSubscription(tx: Tx, auth: AuthContext, id: string) {
  const rows = await tx.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.tenantId, auth.tenantId), eq(pushSubscriptions.userId, auth.userId), eq(pushSubscriptions.id, id))).returning({ id: pushSubscriptions.id });
  if (rows.length === 0) throw notFound('Push subscription not found');
  return { id, deleted: true as const };
}
