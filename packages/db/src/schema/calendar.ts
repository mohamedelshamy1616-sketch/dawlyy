import { date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { clientPolicies } from './_rls';
import { calendarEventSource, calendarEventState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §22 (scheduling), §23 (calendar), §31 (reminders). Persisted due events drive every reminder. */

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id'),
    /** ScheduleEventType from @dawlyy/core plus coach-defined custom types. */
    type: text('type').notNull(),
    state: calendarEventState('state').notNull().default('scheduled'),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    localDate: date('local_date').notNull(),
    timezone: text('timezone').notNull(),
    windowDays: integer('window_days').notNull().default(1),
    source: calendarEventSource('source').notNull(),
    /** Stable key from generateSchedule(); unique per subscription so regeneration is idempotent. */
    ruleKey: text('rule_key'),
    title: jsonb('title').$type<{ ar?: string; en?: string }>(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    /** Set when the event was produced from a template or rule change, for diffing. */
    rescheduledFrom: uuid('rescheduled_from'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** When the due/overdue processor last touched this row. */
    lastProcessedAt: timestamp('last_processed_at', { withTimezone: true }),
    remindersSent: integer('reminders_sent').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('calendar_events_sub_rule_uq').on(t.subscriptionId, t.ruleKey),
    index('calendar_events_tenant_due_idx').on(t.tenantId, t.state, t.dueAt),
    index('calendar_events_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    // Clients may complete/skip their own events; staff manage everything.
    ...clientPolicies('calendar_events', t, { clientWrite: true }),
  ],
);
