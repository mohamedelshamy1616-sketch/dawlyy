import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { subscriptions } from './packages';
import { clients } from './clients';
import { calendarEventSource, calendarEventState } from './enums';
import { tenants } from './tenants';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §22 (scheduling), §23 (calendar), §31 (reminders). Persisted due events drive every reminder. */

/** doc §5.2, §8: calendar_events policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
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
    cancelledBy: uuid('cancelled_by'),
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
    uniqueIndex('calendar_events_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    foreignKey({
      name: 'calendar_events_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calendar_events_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'calendar_events_rescheduled_fk',
      columns: [t.tenantId, t.clientId, t.rescheduledFrom],
      foreignColumns: [t.tenantId as AnyPgColumn, t.clientId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    check('calendar_events_rule_ck', sql`${t.source} <> 'package_rule' or (${t.ruleKey} is not null and ${t.subscriptionId} is not null)`),
    ...tenantGuard('calendar_events', T(t.tenantId)),
    ...allow('calendar_events_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('calendar_events_client', ['select', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();
