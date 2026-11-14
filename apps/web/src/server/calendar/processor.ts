import { and, asc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { calendarEvents, measurementSets, memberships, metricEntries, notificationDeliveries, notifications, progressPhotoSets, tasks, tenants } from '@dawlyy/db/schema';
import { localDateOf } from '@dawlyy/core/schedule';
import { withServiceTx, type Tx } from '../db';
import { sweepSubscriptions } from '../subscriptions/sweep';
import { calendarTransition, planReminder } from './planning';
import { metricKinds } from '../tracking/contracts';
import { visibleCalendarEvent } from './service';
import ar from '../../../messages/ar/calendar.json';
import en from '../../../messages/en/calendar.json';

async function cancelClosedWork(tx: Tx, tenantId: string, now: Date) {
  // Dispatchers also re-read the event (§12.1); cancel queued work for closed occurrences.
  await tx.update(notificationDeliveries).set({ state: 'cancelled' }).where(and(eq(notificationDeliveries.tenantId, tenantId), inArray(notificationDeliveries.state, ['queued', 'failed']), sql`exists (select 1 from public.notifications n join public.calendar_events ce on ce.id::text = n.payload->>'calendarEventId' and ce.tenant_id = ${tenantId} where n.tenant_id = ${tenantId} and n.id = ${notificationDeliveries.notificationId} and ce.state in ('completed','skipped','rescheduled','cancelled'))`));
  await tx.update(tasks).set({ state: 'cancelled', updatedAt: now }).where(and(eq(tasks.tenantId, tenantId), inArray(tasks.state, ['open', 'snoozed']), sql`exists (select 1 from public.calendar_events ce where ce.tenant_id = ${tenantId} and ${tasks.source} = 'event:' || ce.id::text and ce.state in ('completed','skipped','rescheduled','cancelled'))`));
}

async function alreadyRecorded(tx: Tx, tenantId: string, event: typeof calendarEvents.$inferSelect): Promise<boolean> {
  const metric = event.type === 'weigh_in' ? 'weight' : event.payload?.kind === 'tracking_entry_v1' ? metricKinds.find(kind => kind === event.payload?.metric) : undefined;
  if (metric) {
    const key = typeof event.payload?.metricKey === 'string' ? event.payload.metricKey : null;
    const [entry] = await tx.select({ id: metricEntries.id }).from(metricEntries).where(and(eq(metricEntries.tenantId, tenantId), eq(metricEntries.clientId, event.clientId), isNull(metricEntries.voidedAt), eq(metricEntries.localDate, event.localDate), eq(metricEntries.metric, metric), key ? eq(metricEntries.metricKey, key) : isNull(metricEntries.metricKey))).limit(1);
    return !!entry;
  }
  if (event.type === 'measurements') {
    const [entry] = await tx.select({ id: measurementSets.id }).from(measurementSets).where(and(eq(measurementSets.tenantId, tenantId), eq(measurementSets.clientId, event.clientId), isNull(measurementSets.voidedAt), eq(measurementSets.localDate, event.localDate))).limit(1);
    return !!entry;
  }
  if (event.type === 'progress_photos') {
    const [entry] = await tx.select({ id: progressPhotoSets.id }).from(progressPhotoSets).where(and(eq(progressPhotoSets.tenantId, tenantId), eq(progressPhotoSets.clientId, event.clientId), eq(progressPhotoSets.localDate, event.localDate), sql`exists (select 1 from jsonb_array_elements(${progressPhotoSets.poses}) p join public.media m on m.id = (p->>'mediaId')::uuid where m.tenant_id = ${tenantId} and m.client_id = ${event.clientId} and m.purpose = 'progress_photo' and m.deleted_at is null)`)).limit(1);
    return !!entry;
  }
  return false;
}

/** Task 8 / §12.1(6): tenant-scoped job with locked aggregates and deterministic notification/task keys. */
export async function processDueEvents(tenantId: string, now = new Date()): Promise<{ changed: number }> {
  const settings = await withServiceTx(tenantId, 'Task 8: resolve tenant-local date for subscription sweep', async tx => {
    const [tenant] = await tx.select({ timezone: tenants.timezone, locale: tenants.defaultLocale }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return tenant;
  });
  if (!settings) return { changed: 0 };
  await sweepSubscriptions(tenantId, localDateOf(now.toISOString(), settings.timezone));
  return withServiceTx(tenantId, 'Task 8: advance due calendar events and enqueue reminders', async tx => {
    await cancelClosedWork(tx, tenantId, now);
    const events = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, tenantId), visibleCalendarEvent,
      or(and(eq(calendarEvents.state, 'scheduled'), lte(calendarEvents.dueAt, now)), and(eq(calendarEvents.state, 'due'), sql`((${calendarEvents.localDate} + (${calendarEvents.windowDays} + 1))::timestamp at time zone ${calendarEvents.timezone}) <= ${now.toISOString()}::timestamptz`))))
      .orderBy(asc(calendarEvents.dueAt), asc(calendarEvents.id)).limit(500).for('update', { skipLocked: true });
    let changed = 0;
    for (const event of events) {
      // T6/form entry paths share these tables; they need not call the Task 8 completion helper.
      if (await alreadyRecorded(tx, tenantId, event)) {
        await tx.update(calendarEvents).set({ state: calendarTransition(event.state, 'complete'), completedAt: now, skippedAt: null, cancelledAt: null, lastProcessedAt: now, updatedAt: now }).where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, event.id), eq(calendarEvents.state, event.state)));
        changed++; continue;
      }
      let current = event;
      // Catch up both edges atomically, so a second run cannot produce another reminder for an old event.
      for (let step = 0; step < 2; step++) {
        const state = planReminder(current, now);
        if (!state) break;
        const key = `calendar:${event.ruleKey ?? 'manual'}:${event.id}:${state}`;
        await tx.update(calendarEvents).set({ state, lastProcessedAt: now, remindersSent: current.remindersSent + 1, updatedAt: now })
          .where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, event.id), eq(calendarEvents.state, current.state)));
        const recipients = await tx.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.clientId, event.clientId), eq(memberships.role, 'client'), eq(memberships.status, 'active')));
        const title = { ar: ar.reminders[state], en: en.reminders[state] };
        const link = event.type.endsWith('checkin') ? `/app/checkins/${event.id}` : event.type === 'progress_photos' || event.type === 'measurements' ? '/app/progress' : '/app/tracking';
        for (const recipient of recipients) await tx.insert(notifications).values({ tenantId, userId: recipient.userId, clientId: event.clientId, type: `calendar_${state}`, title, link, dedupeKey: key, payload: { calendarEventId: event.id, state } }).onConflictDoNothing({ target: [notifications.tenantId, notifications.userId, notifications.dedupeKey] });
        if (state === 'overdue') await tx.insert(tasks).values({ tenantId, clientId: event.clientId, title: settings.locale === 'ar' ? ar.reminders.overdue : en.reminders.overdue, source: `event:${event.id}`, dedupeKey: key, link: `/coach/clients/${event.clientId}/tracking`, dueAt: now }).onConflictDoNothing({ target: [tasks.tenantId, tasks.dedupeKey] });
        current = { ...current, state, remindersSent: current.remindersSent + 1 };
        changed++;
      }
    }
    if (changed) await cancelClosedWork(tx, tenantId, now);
    // No service-role semantic name is allow-listed; row audit triggers retain these changes.
    return { changed };
  });
}
