import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients, metricEntries, subscriptions } from '@dawlyy/db/schema';
import { generateSchedule } from '@dawlyy/core/schedule';
import { ScheduleRules } from '@dawlyy/core/types';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden } from '../../api/errors';
import { cadenceInput } from './contracts';
import { trackingClient, visibleClient } from './access';
import ar from '../../../messages/ar/tracking.json';
import en from '../../../messages/en/tracking.json';

/** Task 8: validated cadence contract shared by the coach and client screens. */
export type TrackingCadence = z.infer<typeof cadenceInput>;
export { getCadence, completeTrackingEvents } from './client-read';

/** Task 8: persist coach-only cadence and materialize only core-generated occurrences in the configured range. */
export async function putCadence(tx: Tx, auth: AuthContext, clientId: string, input: TrackingCadence) {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'tracking', 'edit');
  await visibleClient(tx, auth, clientId, true);
  const [subscription] = await tx.select({ id: clientColumns.subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId), inArray(subscriptions.state, ['active', 'grace', 'paused']))).orderBy(desc(subscriptions.startsOn), desc(subscriptions.id)).limit(1);
  const scope = and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId));
  // Cancel superseded configuration occurrences, and package weigh-ins when weight is explicitly overridden.
  await tx.update(calendarEvents).set({ state: 'cancelled' }).where(and(scope, inArray(calendarEvents.state, ['scheduled', 'due', 'overdue']), or(
    sql`${calendarEvents.payload}->>'kind' = 'tracking_entry_v1'`,
    and(inArray(calendarEvents.type, [...(input.metrics.some(m => m.metric === 'weight') ? ['weigh_in'] : []), ...(input.measurements ? ['measurements'] : []), ...(input.progressPhotos ? ['progress_photos'] : [])]), gte(calendarEvents.localDate, input.startsOn), lte(calendarEvents.localDate, input.endsOn)))));
  // The schema has no cadence table. Existing client APIs reject profile writes; this endpoint is coach-only.
  await tx.update(clients).set({ profile: sql`jsonb_set(${clients.profile}, '{trackingCadenceV1}', ${JSON.stringify(input)}::jsonb, true)` }).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId)));
  for (const metric of input.metrics) {
    const generated = generateSchedule({ startDate: input.startsOn, endDate: input.endsOn, timezone: input.timezone, rules: ScheduleRules.parse({ weeklyCheckin: { enabled: false }, weighIn: metric.cadence, weighInTimeOfDay: metric.timeOfDay, renewalReminderDaysBefore: [] }) });
    for (const event of generated) {
      // Preserve completed/skipped occurrences rather than creating a second reminder after a settings save.
      const [done] = await tx.select({ id: calendarEvents.id }).from(calendarEvents).where(and(scope, eq(calendarEvents.localDate, event.localDate), inArray(calendarEvents.state, ['completed', 'skipped']), sql`${calendarEvents.payload}->>'metric' = ${metric.metric} and coalesce(${calendarEvents.payload}->>'metricKey','') = ${metric.metricKey ?? ''}`)).limit(1);
      if (done) continue;
      const [logged] = await tx.select({ id: clientColumns.metricEntries.id }).from(metricEntries).where(and(eq(metricEntries.tenantId, auth.tenantId), eq(metricEntries.clientId, clientId), eq(metricEntries.localDate, event.localDate), isNull(metricEntries.voidedAt), eq(metricEntries.metric, metric.metric), sql`coalesce(${metricEntries.metricKey}, '') = ${metric.metricKey ?? ''}`)).limit(1);
      if (logged) continue;
      await tx.insert(calendarEvents).values({ tenantId: auth.tenantId, clientId, subscriptionId: subscription?.id, source: 'manual', type: metric.metric === 'weight' ? 'weigh_in' : 'custom', title: { ar: metric.metricKey ?? ar.metrics[metric.metric], en: metric.metricKey ?? en.metrics[metric.metric] }, dueAt: new Date(event.dueAt), localDate: event.localDate, timezone: event.timezone, windowDays: 0, payload: { kind: 'tracking_entry_v1', metric: metric.metric, metricKey: metric.metricKey ?? null } });
    }
  }
  const evidence = generateSchedule({ startDate: input.startsOn, endDate: input.endsOn, timezone: input.timezone, rules: ScheduleRules.parse({ weeklyCheckin: { enabled: false }, renewalReminderDaysBefore: [], measurements: input.measurements?.rule, progressPhotos: input.progressPhotos?.rule }) });
  for (const event of evidence) {
    const [done] = await tx.select({ id: calendarEvents.id }).from(calendarEvents).where(and(scope, eq(calendarEvents.type, event.type), eq(calendarEvents.localDate, event.localDate), inArray(calendarEvents.state, ['completed', 'skipped']))).limit(1);
    if (done) continue;
    await tx.insert(calendarEvents).values({ tenantId: auth.tenantId, clientId, subscriptionId: subscription?.id, source: 'manual', type: event.type, dueAt: new Date(event.dueAt), localDate: event.localDate, timezone: event.timezone, windowDays: event.windowDays, payload: { kind: 'tracking_entry_v1', metric: event.type } });
  }
  return input;
}
