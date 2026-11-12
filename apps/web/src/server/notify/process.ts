import 'server-only';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { clients, memberships, notificationDeliveries, notifications, pushSubscriptions, tenants, userPreferences } from '@dawlyy/db/schema';
import { renderEmail } from '@/emails/render';
import { withServiceTx } from '../db';
import { PushGoneError, createEmailSender, createPushSender, type EmailSender, type PushSender, type PushTarget } from './channels';
import { MAX_DELIVERY_ATTEMPTS, resolveLanguage, retryDelayMs } from './logic';

/** Task 9: options for one processing pass. Senders default to the environment (log-only email, no push without VAPID keys). */
export type ProcessOptions = {
  /** Limit the pass to one tenant (tests); omitted for the cross-tenant cron pass. */
  tenantId?: string;
  now?: Date;
  limit?: number;
  email?: EmailSender;
  /** `null` forces the keyless behaviour; omitted reads the environment. */
  push?: PushSender | null;
};

export type ProcessResult = { claimed: number; sent: number; cancelled: number; failed: number; retried: number };

type Outcome =
  | { state: 'sent'; providerRef: string }
  | { state: 'cancelled'; error: string }
  | { state: 'error'; error: string };

type Claimed = { id: string; tenantId: string; notificationId: string; userId: string; channel: 'email' | 'webpush'; attempts: number };

/** A claimed row stays `queued` but invisible to other passes for this long; a crashed pass is retried after it. */
const LEASE_MS = 10 * 60_000;

async function claim(options: ProcessOptions, now: Date): Promise<Claimed[]> {
  return withServiceTx(options.tenantId ?? null, 'notify: claim queued deliveries', async (tx) => {
    const rows = await tx.select({ id: notificationDeliveries.id, tenantId: notificationDeliveries.tenantId, notificationId: notificationDeliveries.notificationId,
      userId: notificationDeliveries.userId, channel: notificationDeliveries.channel, attempts: notificationDeliveries.attempts })
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.state, 'queued'), inArray(notificationDeliveries.channel, ['email', 'webpush']), lte(notificationDeliveries.scheduledFor, now),
        ...(options.tenantId ? [eq(notificationDeliveries.tenantId, options.tenantId)] : [])))
      .orderBy(asc(notificationDeliveries.scheduledFor), asc(notificationDeliveries.id)).limit(options.limit ?? 50).for('update', { skipLocked: true });
    const claimed: Claimed[] = [];
    for (const row of rows) {
      if (row.channel !== 'email' && row.channel !== 'webpush') continue;
      const attempts = row.attempts + 1;
      await tx.update(notificationDeliveries).set({ attempts, scheduledFor: new Date(now.getTime() + LEASE_MS) })
        .where(and(eq(notificationDeliveries.id, row.id), eq(notificationDeliveries.state, 'queued')));
      claimed.push({ ...row, channel: row.channel, attempts });
    }
    return claimed;
  });
}

/** Task 9: dispatch one claimed delivery. Reads what it needs in its own service transaction; sends outside any transaction. */
async function dispatch(row: Claimed, email: EmailSender, push: PushSender | null): Promise<Outcome> {
  const context = await withServiceTx(row.tenantId, 'notify: load delivery context', async (tx) => {
    const [notification] = await tx.select({ title: notifications.title, body: notifications.body, link: notifications.link, payload: notifications.payload })
      .from(notifications).where(and(eq(notifications.tenantId, row.tenantId), eq(notifications.id, row.notificationId))).limit(1);
    if (!notification) return null;
    const [member] = await tx.select({ email: memberships.email, locale: memberships.locale, clientId: memberships.clientId }).from(memberships)
      .where(and(eq(memberships.tenantId, row.tenantId), eq(memberships.userId, row.userId), eq(memberships.status, 'active'))).limit(1);
    const [client] = member?.clientId ? await tx.select({ email: clients.email }).from(clients).where(and(eq(clients.tenantId, row.tenantId), eq(clients.id, member.clientId))).limit(1) : [];
    const [prefs] = await tx.select({ preferences: userPreferences.preferences }).from(userPreferences)
      .where(and(eq(userPreferences.tenantId, row.tenantId), eq(userPreferences.userId, row.userId))).limit(1);
    const [tenant] = await tx.select({ defaultLocale: tenants.defaultLocale }).from(tenants).where(eq(tenants.id, row.tenantId)).limit(1);
    const subscriptions = row.channel === 'webpush'
      ? await tx.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, keys: pushSubscriptions.keys }).from(pushSubscriptions)
        .where(and(eq(pushSubscriptions.tenantId, row.tenantId), eq(pushSubscriptions.userId, row.userId), isNull(pushSubscriptions.failedAt)))
      : [];
    return { notification, member, address: member?.email ?? client?.email ?? null, language: resolveLanguage(prefs?.preferences.locale, member?.locale, tenant?.defaultLocale), subscriptions };
  });
  if (!context) return { state: 'cancelled', error: 'notification_missing' };
  if (!context.member) return { state: 'cancelled', error: 'recipient_inactive' };
  const { notification, language } = context;
  const title = notification.title[language] ?? notification.title.en ?? notification.title.ar ?? '';
  const shareBody = notification.payload?.shareBody !== false;
  const text = shareBody ? (notification.body?.[language] ?? notification.body?.en ?? notification.body?.ar) : undefined;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  const url = notification.link && appUrl ? `${appUrl}/${language}${notification.link}` : undefined;
  try {
    if (row.channel === 'email') {
      const rendered = await renderEmail({ lang: language, title, body: text, url });
      if (email.mode === 'live' && !context.address) return { state: 'cancelled', error: 'no_email_address' };
      const sent = await email.send({ to: context.address, subject: rendered.subject, html: rendered.html, text: rendered.text, idempotencyKey: `notification-delivery/${row.id}` });
      return { state: 'sent', providerRef: sent.providerRef };
    }
    if (!push) return { state: 'cancelled', error: 'push_not_configured' };
    if (context.subscriptions.length === 0) return { state: 'cancelled', error: 'no_subscription' };
    const gone: string[] = []; let delivered = 0; let lastError: string | null = null;
    for (const subscription of context.subscriptions) {
      const target: PushTarget = { endpoint: subscription.endpoint, keys: subscription.keys };
      try { await push.send(target, { title, body: text, url: notification.link ?? undefined, tag: row.notificationId }); delivered += 1; }
      catch (error) { if (error instanceof PushGoneError) gone.push(subscription.id); else lastError = error instanceof Error ? error.message : 'push_failed'; }
    }
    if (gone.length > 0 || delivered > 0) {
      await withServiceTx(row.tenantId, 'notify: update push subscription health', async (tx) => {
        if (gone.length > 0) await tx.update(pushSubscriptions).set({ failedAt: new Date() }).where(and(eq(pushSubscriptions.tenantId, row.tenantId), inArray(pushSubscriptions.id, gone)));
        if (delivered > 0) await tx.update(pushSubscriptions).set({ lastUsedAt: new Date() })
          .where(and(eq(pushSubscriptions.tenantId, row.tenantId), eq(pushSubscriptions.userId, row.userId), isNull(pushSubscriptions.failedAt)));
      });
    }
    if (delivered > 0) return { state: 'sent', providerRef: `webpush:${delivered}` };
    return lastError ? { state: 'error', error: lastError } : { state: 'cancelled', error: 'subscription_gone' };
  } catch (error) {
    return { state: 'error', error: error instanceof Error ? error.message.slice(0, 300) : 'delivery_failed' };
  }
}

/**
 * Task 9: send queued email and Web Push deliveries that are due. Called by the cron route (T8 owns it); there is no route here.
 *
 * Status guard: a row is claimed by bumping `attempts` and pushing `scheduled_for` out by a lease, and the final update only
 * applies while the row is still `queued` with the claimed attempt number, so two passes can never both finish a row and a
 * finished row is never picked up again. Without `RESEND_API_KEY` email is a log-only `sent` with provider ref `local-log`;
 * without VAPID keys Web Push is `cancelled`. Provider errors retry up to three attempts, then `failed`.
 */
export async function processDeliveries(options: ProcessOptions = {}): Promise<ProcessResult> {
  const now = options.now ?? new Date();
  const email = options.email ?? createEmailSender();
  const push = options.push === undefined ? createPushSender() : options.push;
  const result: ProcessResult = { claimed: 0, sent: 0, cancelled: 0, failed: 0, retried: 0 };
  const rows = await claim(options, now);
  result.claimed = rows.length;
  for (const row of rows) {
    const outcome = await dispatch(row, email, push);
    const final = outcome.state === 'error' && row.attempts >= MAX_DELIVERY_ATTEMPTS ? 'failed' as const : outcome.state;
    const applied = await withServiceTx(row.tenantId, 'notify: record delivery outcome', async (tx) => {
      const guard = and(eq(notificationDeliveries.id, row.id), eq(notificationDeliveries.state, 'queued'), eq(notificationDeliveries.attempts, row.attempts));
      const stamp = new Date();
      if (final === 'sent') return tx.update(notificationDeliveries).set({ state: 'sent', sentAt: stamp, providerRef: outcome.state === 'sent' ? outcome.providerRef : null, lastError: null }).where(guard).returning({ id: notificationDeliveries.id });
      if (final === 'cancelled') return tx.update(notificationDeliveries).set({ state: 'cancelled', lastError: outcome.state === 'cancelled' ? outcome.error : null }).where(guard).returning({ id: notificationDeliveries.id });
      const error = outcome.state === 'error' ? outcome.error : null;
      if (final === 'failed') return tx.update(notificationDeliveries).set({ state: 'failed', lastError: error }).where(guard).returning({ id: notificationDeliveries.id });
      return tx.update(notificationDeliveries).set({ lastError: error, scheduledFor: new Date(now.getTime() + retryDelayMs(row.attempts)) }).where(guard).returning({ id: notificationDeliveries.id });
    });
    if (applied.length === 0) continue;
    if (final === 'sent') result.sent += 1; else if (final === 'cancelled') result.cancelled += 1; else if (final === 'failed') result.failed += 1; else result.retried += 1;
  }
  return result;
}
