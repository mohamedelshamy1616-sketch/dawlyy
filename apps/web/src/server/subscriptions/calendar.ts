import { calendarEvents, subscriptions, subscriptionEvents } from '@dawlyy/db/schema';
import { reconcileSchedule } from '@dawlyy/core/subscription';
import { addDays } from '@dawlyy/core/schedule';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { withServiceTx } from '../db';
import { buildCalendar, timelineFor, todayIn } from './timeline';

const openStates = ['scheduled', 'due', 'overdue'] as const;

/** T3b / T8: tenant-scoped, repeatable rule generation using calendar_events_sub_rule_uq(subscription_id,rule_key). */
export async function syncSubscriptionCalendar(tenantId: string, subscriptionId: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new Error('Calendar sync needs a reason');
  await withServiceTx(tenantId, `calendar generation: ${reason}`, async (tx) => {
    const subWhere = and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.id, subscriptionId));
    const [sub] = await tx.select().from(subscriptions).where(subWhere).for('update');
    if (!sub) return;
    const ledger = await tx.select().from(subscriptionEvents)
      .where(and(eq(subscriptionEvents.tenantId, tenantId), eq(subscriptionEvents.subscriptionId, subscriptionId)))
      .orderBy(asc(subscriptionEvents.createdAt), asc(subscriptionEvents.id));
    const timeline = timelineFor(sub, ledger);
    const today = todayIn(sub.timezone);
    const scope = and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.subscriptionId, subscriptionId));
    if (sub.state === 'cancelled') {
      await tx.update(calendarEvents).set({ state: 'cancelled', cancelledAt: new Date(), completedAt: null, skippedAt: null })
        .where(and(scope, gte(calendarEvents.localDate, today), inArray(calendarEvents.state, openStates)));
      return;
    }
    const generated = buildCalendar(timeline, sub.packageSnapshot.scheduleRules);
    const existing = await tx.select().from(calendarEvents).where(scope);
    const changes = reconcileSchedule(existing.map((row) => ({ ...row, dueAt: row.dueAt.toISOString() })), generated.events, { today });
    for (const event of changes.insert) {
      await tx.insert(calendarEvents).values({ tenantId, clientId: sub.clientId, subscriptionId,
        type: event.type, dueAt: new Date(event.dueAt), localDate: event.localDate, timezone: event.timezone,
        windowDays: event.windowDays, source: 'package_rule', ruleKey: event.ruleKey, payload: event.payload })
        .onConflictDoNothing({ target: [calendarEvents.subscriptionId, calendarEvents.ruleKey] });
    }
    if (changes.cancel.length) await tx.update(calendarEvents)
      .set({ state: 'cancelled', cancelledAt: new Date(), completedAt: null, skippedAt: null })
      .where(and(scope, inArray(calendarEvents.id, changes.cancel), eq(calendarEvents.source, 'package_rule'), inArray(calendarEvents.state, openStates)));
    for (const change of changes.update) await tx.update(calendarEvents)
      .set({ dueAt: new Date(change.dueAt), localDate: change.localDate })
      .where(and(scope, eq(calendarEvents.id, change.id), eq(calendarEvents.source, 'package_rule'), inArray(calendarEvents.state, openStates)));
    for (const change of changes.reopen) await tx.update(calendarEvents)
      .set({ dueAt: new Date(change.dueAt), localDate: change.localDate, state: 'scheduled', cancelledAt: null, completedAt: null, skippedAt: null })
      .where(and(scope, eq(calendarEvents.id, change.id), eq(calendarEvents.source, 'package_rule'), eq(calendarEvents.state, 'cancelled')));
    // reconcileSchedule preserves past rows. A retroactive freeze additionally cancels open rows in its window.
    for (const freeze of timeline.freezes) await tx.update(calendarEvents)
      .set({ state: 'cancelled', cancelledAt: new Date(), completedAt: null, skippedAt: null })
      .where(and(scope, gte(calendarEvents.localDate, freeze.fromDate), lt(calendarEvents.localDate, addDays(freeze.fromDate, freeze.days)), inArray(calendarEvents.state, openStates)));
  });
}
