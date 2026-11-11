import { and, eq } from 'drizzle-orm';
import { addDays, zonedDueAt } from '@dawlyy/core/schedule';
import { EntitlementOverride } from '@dawlyy/core/types';
import type { Tx } from '../../src/client';
import { calendarEvents, clientEntitlementOverrides, media, payments, subscriptionEvents, subscriptions } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import type { Demo } from './model';
import { exists } from './helpers';

/** doc §6.3, §7.7, §8.3 / Task 12: service billing follows allowed transitions; receipts are assigned only by the counter trigger. */
export async function seedBilling(tx: Tx, demo: Demo): Promise<void> {
  for (const sub of demo.subscriptions) {
    if (await exists(tx, subscriptions, sub.id)) continue;
    const scope = and(eq(subscriptions.tenantId, I.tenant), eq(subscriptions.id, sub.id));
    const createdAt = new Date(Math.min(demo.now.getTime(), Date.parse(zonedDueAt(sub.startsOn, '08:00', 'Africa/Cairo'))));
    await tx.insert(subscriptions).values({ id: sub.id, tenantId: I.tenant, clientId: sub.clientId, packageId: sub.packageId,
      packageSnapshot: sub.packageSnapshot, state: 'pending', startsOn: sub.startsOn, endsOn: addDays(sub.startsOn, sub.packageSnapshot.durationDays),
      graceEndsOn: sub.graceEndsOn, timezone: 'Africa/Cairo', price: sub.price, currency: 'EGP',
      notes: sub.situation, createdBy: I.ownerUser, createdAt: demo.now });
    // created_at is the import time and is also the durable fixture clock. The ledger carries business history.
    await tx.insert(subscriptionEvents).values({ id: demoId(`subscription-event:${sub.id}:created`), tenantId: I.tenant,
      clientId: sub.clientId, subscriptionId: sub.id, kind: 'created', toState: 'pending', actorUserId: I.ownerUser, createdAt });
    if (sub.state === 'pending') continue;
    const funding = demo.payments.find(p => p.subscriptionId === sub.id && p.state === 'verified');
    if (!funding) throw new Error('An activated demo subscription needs a verified funding payment.');
    const activatedAt = new Date(funding.paidAt.getTime() + 15 * 60000);
    await tx.update(subscriptions).set({ state: 'active' }).where(scope);
    await tx.insert(subscriptionEvents).values({ id: demoId(`subscription-event:${sub.id}:activated`), tenantId: I.tenant,
      clientId: sub.clientId, subscriptionId: sub.id, kind: 'activated', fromState: 'pending', toState: 'active', actorUserId: I.ownerUser, createdAt: activatedAt });
    if (sub.state === 'paused') {
      await tx.update(subscriptions).set({ state: 'paused', pausedAt: sub.pausedAt, frozenDays: sub.frozenDays, endsOn: sub.endsOn, graceEndsOn: sub.graceEndsOn }).where(scope);
      await tx.insert(subscriptionEvents).values({ id: demoId(`subscription-event:${sub.id}:freeze`), tenantId: I.tenant,
        clientId: sub.clientId, subscriptionId: sub.id, kind: 'freeze', fromState: 'active', toState: 'paused', days: 7,
        oldEndsOn: addDays(sub.startsOn, sub.packageSnapshot.durationDays), newEndsOn: sub.endsOn,
        reason: 'DAWLYY_FREEZE_V1:' + JSON.stringify({ fromDate: addDays(demo.today, -2), reason: 'مسافر أسبوع وهنكمل لما يرجع' }),
        actorUserId: I.ownerUser, createdAt: sub.pausedAt! });
    } else if (sub.state === 'grace' || sub.state === 'expired') {
      await tx.update(subscriptions).set({ state: 'grace' }).where(scope);
      await tx.insert(subscriptionEvents).values({ id: demoId(`subscription-event:${sub.id}:grace`), tenantId: I.tenant,
        clientId: sub.clientId, subscriptionId: sub.id, kind: 'grace', fromState: 'active', toState: 'grace',
        actorUserId: I.ownerUser, createdAt: new Date(zonedDueAt(addDays(sub.endsOn, 1), '00:00', 'Africa/Cairo')) });
      if (sub.state === 'expired') {
        await tx.update(subscriptions).set({ state: 'expired' }).where(scope);
        await tx.insert(subscriptionEvents).values({ id: demoId(`subscription-event:${sub.id}:expired`), tenantId: I.tenant,
          clientId: sub.clientId, subscriptionId: sub.id, kind: 'expired', fromState: 'grace', toState: 'expired',
          actorUserId: I.ownerUser, createdAt: new Date(zonedDueAt(addDays(sub.graceEndsOn!, 1), '00:00', 'Africa/Cairo')) });
      }
    }
  }
  const overrideId = demoId('entitlement:extra-technique');
  if (!await exists(tx, clientEntitlementOverrides, overrideId)) await tx.insert(clientEntitlementOverrides).values({
    id: overrideId, tenantId: I.tenant, clientId: I.firstClient, subscriptionId: demo.subscriptions[0]!.id,
    override: EntitlementOverride.parse({ key: 'technique_review', enabled: true, frequency: 'weekly', limit: 2, durationDays: 90,
      expiresOn: demo.subscriptions[0]!.endsOn, reason: 'مراجعة إضافية لحركة السكوات في التجربة' }), createdBy: I.ownerUser, createdAt: demo.now });

  if (!await exists(tx, media, I.pendingProof)) await tx.insert(media).values({ id: I.pendingProof, tenantId: I.tenant,
    clientId: I.sixthClient, ownerUserId: I.sixthClientUser, bucket: 'client-media',
    path: `${I.tenant}/clients/${I.sixthClient}/demo-payment-proof-placeholder.png`, kind: 'photo', purpose: 'payment_proof',
    mimeType: 'image/png', bytes: 0, uploadedAt: null, reviewState: 'requested',
    metadata: { demoPlaceholder: true, hasFile: false, label: 'إثبات دفع للتجربة بس — مفيش ملف مرفوع' }, createdAt: demo.now });

  for (const payment of demo.payments) {
    // SELECT first: ON CONFLICT on payments is forbidden by §12.1(13).
    if (await exists(tx, payments, payment.id)) continue;
    const scope = and(eq(payments.tenantId, I.tenant), eq(payments.id, payment.id));
    await tx.insert(payments).values({ ...payment, tenantId: I.tenant, state: 'pending', currency: 'EGP', method: 'instapay',
      reference: `DEMO-${payment.id.slice(-8)}`, notes: payment.state === 'refunded' ? 'دفعة مكررة اتردت بالكامل' : 'بيانات تجربة وهمية',
      createdBy: payment.clientId === I.sixthClient ? I.sixthClientUser : I.ownerUser, createdAt: payment.paidAt });
    if (payment.state === 'pending') continue;
    if (payment.state === 'rejected') {
      await tx.update(payments).set({ state: 'rejected', rejectedReason: 'المرجع مش واضح، ابعتي إثبات تاني لو سمحتي', updatedAt: demo.now }).where(scope);
      continue;
    }
    const verifiedAt = new Date(payment.paidAt.getTime() + 15 * 60000);
    // payments_90_receipt calls app.next_receipt_no at this transition for every role.
    await tx.update(payments).set({ state: 'verified', verifiedAt, verifiedBy: I.ownerUser, updatedAt: verifiedAt }).where(scope);
    if (payment.state === 'refunded') await tx.update(payments).set({ state: 'refunded', refundAmount: payment.amount,
      refundedAt: new Date(payment.paidAt.getTime() + 86400000), updatedAt: demo.now }).where(scope);
  }
}

/** doc §6.3, §12.1 / Task 12: persist core-generated package events once without rewriting completed or operator-edited rows. */
export async function seedCalendar(tx: Tx, demo: Demo): Promise<void> {
  const titles: Record<string, string> = { weekly_checkin: 'متابعة الأسبوع', weigh_in: 'وزن الصبح', measurements: 'مقاسات الجسم',
    progress_photos: 'صور المتابعة', technique_review: 'مراجعة حركة التمرين', renewal_reminder: 'ميعاد تجديد الاشتراك', program_review: 'مراجعة البرنامج' };
  for (const event of demo.calendar) {
    if (await exists(tx, calendarEvents, event.id)) continue;
    await tx.insert(calendarEvents).values({ ...event, tenantId: I.tenant, source: 'package_rule', title: { ar: titles[event.type] ?? 'متابعة' },
      createdBy: I.ownerUser, createdAt: demo.now, lastProcessedAt: demo.now });
  }
}
