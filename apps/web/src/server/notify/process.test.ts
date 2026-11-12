import { afterEach, describe, expect, it, vi } from 'vitest';
import { memberships, notificationDeliveries, notifications, pushSubscriptions, tenants, userPreferences } from '@dawlyy/db/schema';
import { withServiceTx, type Tx } from '../db';
import { processDeliveries } from './process';
import { createWebPushSender, type EmailSender, type PushSender } from './channels';
import webpush from 'web-push';

vi.mock('../db', () => ({ withServiceTx: vi.fn() }));
vi.mock('web-push', () => ({ default: { sendNotification: vi.fn() } }));
vi.mock('@/emails/render', () => ({
  renderEmail: async () => ({ subject: 'Reminder', html: '<p>Reminder</p>', text: 'Reminder' }),
}));

// Model the context SELECT results; senders and transaction access never reach a provider or database.
function fixture(active: boolean, channel: 'email' | 'webpush', notificationMissing = false) {
  const delivery = { id: 'delivery', tenantId: 'tenant', notificationId: 'notification', userId: 'user', channel, attempts: 0 };
  const outcomes: Record<string, unknown>[] = [];
  const subscriptionUpdates: Record<string, unknown>[] = [];
  function query(rows: unknown[]) {
    return {
      where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      for: async () => rows,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
  }
  const tx = {
    select: () => ({
      from(table: unknown) {
        if (table === notificationDeliveries) return query([delivery]);
        if (table === notifications) return query(notificationMissing ? [] : [{ title: { en: 'Reminder' }, body: { en: 'Due' }, link: null, payload: {} }]);
        if (table === memberships) return query(active ? [{ email: 'member@example.test', locale: 'en', clientId: null }] : []);
        if (table === userPreferences) return query([]);
        if (table === tenants) return query([{ defaultLocale: 'en' }]);
        if (table === pushSubscriptions) return query([{ id: 'subscription', endpoint: 'https://push.example.test/device', keys: { p256dh: 'public', auth: 'auth' } }]);
        throw new Error('Unexpected context table');
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          if (table === notificationDeliveries && 'state' in values) outcomes.push(values);
          if (table === pushSubscriptions) subscriptionUpdates.push(values);
          return { returning: async () => [{ id: delivery.id }] };
        },
      }),
    }),
  } as unknown as Tx;
  vi.mocked(withServiceTx).mockImplementation(async (_tenantId, _reason, fn) => fn(tx));
  const email: EmailSender = { mode: 'local-log', send: vi.fn<EmailSender['send']>().mockResolvedValue({ providerRef: 'email-ref' }) };
  const push: PushSender = { send: vi.fn<PushSender['send']>().mockResolvedValue(undefined) };
  return { email, push, outcomes, subscriptionUpdates };
}

afterEach(() => { vi.clearAllMocks(); });

describe('delivery recipient membership', () => {
  it.each(['webpush', 'email'] as const)('cancels %s before sending when there is no active member', async (channel) => {
    const f = fixture(false, channel);
    expect(await processDeliveries({ tenantId: 'tenant', email: f.email, push: f.push })).toEqual({ claimed: 1, sent: 0, cancelled: 1, failed: 0, retried: 0 });
    expect(f.email.send).not.toHaveBeenCalled();
    expect(f.push.send).not.toHaveBeenCalled();
    expect(f.outcomes).toEqual([{ state: 'cancelled', lastError: 'recipient_inactive' }]);
  });

  it.each(['webpush', 'email'] as const)('still sends %s once to an active member', async (channel) => {
    const f = fixture(true, channel);
    expect(await processDeliveries({ tenantId: 'tenant', email: f.email, push: f.push })).toEqual({ claimed: 1, sent: 1, cancelled: 0, failed: 0, retried: 0 });
    expect(f.push.send).toHaveBeenCalledTimes(channel === 'webpush' ? 1 : 0);
    expect(f.email.send).toHaveBeenCalledTimes(channel === 'email' ? 1 : 0);
    expect(f.outcomes).toEqual([expect.objectContaining({ state: 'sent', lastError: null })]);
  });

  it('keeps the notification_missing cancellation path', async () => {
    const f = fixture(false, 'webpush', true);
    expect(await processDeliveries({ tenantId: 'tenant', email: f.email, push: f.push })).toMatchObject({ cancelled: 1, sent: 0 });
    expect(f.outcomes).toEqual([{ state: 'cancelled', lastError: 'notification_missing' }]);
    expect(f.push.send).not.toHaveBeenCalled();
    expect(f.email.send).not.toHaveBeenCalled();
  });

  it('retires a stored refused endpoint and cancels delivery without contacting a provider', async () => {
    // The fixture stores push.example.test, which is outside the provider allowlist.
    const f = fixture(true, 'webpush');
    const push = createWebPushSender('public', 'private', 'mailto:admin@example.test');
    expect(await processDeliveries({ tenantId: 'tenant', email: f.email, push })).toEqual({ claimed: 1, sent: 0, cancelled: 1, failed: 0, retried: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(f.subscriptionUpdates).toEqual([{ failedAt: expect.any(Date) }]);
    expect(f.outcomes).toEqual([{ state: 'cancelled', lastError: 'subscription_gone' }]);
  });
});
