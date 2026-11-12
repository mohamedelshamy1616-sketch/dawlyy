import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients, subscriptions } from '@dawlyy/db/schema';
import { ScheduleRules } from '@dawlyy/core/types';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { cadenceInput } from './contracts';
import { trackingClient, visibleClient } from './access';

/** Task 8: validated cadence contract shared by the coach and client screens. */
export type TrackingCadence = z.infer<typeof cadenceInput>;
/** Task 8: read the cadence through the safe profile projection; no calendar payload reaches clients. */
export async function getCadence(tx: Tx, auth: AuthContext, clientId: string): Promise<TrackingCadence | null> {
  trackingClient(auth, clientId); await visibleClient(tx, auth, clientId);
  const [row] = await tx.select({ profile: clientColumns.clients.profile }).from(clients)
    .where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
  const config = cadenceInput.safeParse(row?.profile.trackingCadenceV1);
  if (config.success) return config.data;
  const [sub] = await tx.select({ startsOn: clientColumns.subscriptions.startsOn, endsOn: clientColumns.subscriptions.endsOn, timezone: clientColumns.subscriptions.timezone, snapshot: clientColumns.subscriptions.packageSnapshot }).from(subscriptions).where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId))).orderBy(desc(subscriptions.startsOn), desc(subscriptions.id)).limit(1);
  if (!sub) return null;
  const rules = ScheduleRules.parse(sub.snapshot.scheduleRules);
  return { startsOn: sub.startsOn, endsOn: sub.endsOn, timezone: sub.timezone, metrics: [{ metric: 'weight', unit: 'kg', cadence: rules.weighIn, timeOfDay: rules.weighInTimeOfDay }],
    ...(rules.measurements ? { measurements: { rule: rules.measurements, fields: [] } } : {}), ...(rules.progressPhotos ? { progressPhotos: { rule: rules.progressPhotos, poses: ['front', 'left', 'back'] } } : {}) };
}

/** Task 8: logging an entry completes only the matching metric occurrence on that local date. */
export async function completeTrackingEvents(tx: Tx, auth: AuthContext, clientId: string, localDate: string, metric: string, metricKey?: string) {
  await tx.update(calendarEvents).set({ state: 'completed' }).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId), eq(calendarEvents.localDate, localDate), inArray(calendarEvents.state, ['scheduled', 'due', 'overdue']),
    sql`((${calendarEvents.payload}->>'kind' = 'tracking_entry_v1' and ${calendarEvents.payload}->>'metric' = ${metric} and coalesce(${calendarEvents.payload}->>'metricKey','') = ${metricKey ?? ''}) or (${metric} = 'weight' and ${calendarEvents.type} = 'weigh_in') or (${metric} = 'measurements' and ${calendarEvents.type} = 'measurements') or (${metric} = 'progress_photos' and ${calendarEvents.type} = 'progress_photos'))`));
}
