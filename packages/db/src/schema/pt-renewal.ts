// 0010 follows the runtime role and tenant isolation established by 0006.
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { allow, CLIENT, OWN, OWNER, T, tenantGuard } from './_rls';
import { subscriptions } from './packages';
import { tenants } from './tenants';

const coach = (client: unknown) => sql`${OWNER} or ${client} in (select app.assigned_client_ids())`;

export const ptRenewalRequests = pgTable('pt_renewal_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull(),
  subscriptionId: uuid('subscription_id').notNull(),
  status: text('status').notNull().default('open'),
  delivered: integer('delivered').notNull().default(0),
  balance: integer('balance').notNull().default(0),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
  handledAt: timestamp('handled_at', { withTimezone: true }),
  handledBy: uuid('handled_by'),
}, t => [
  uniqueIndex('pt_renewal_open_once').on(t.tenantId, t.subscriptionId).where(sql`${t.status} = 'open'`),
  foreignKey({ name: 'pt_renewal_sub_fk', columns: [t.tenantId, t.clientId, t.subscriptionId], foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id] }).onDelete('cascade'),
  check('pt_renewal_state', sql`(status = 'open' and handled_at is null and handled_by is null)
    or (status = 'handled' and handled_at is not null and handled_by is not null)`),
  check('pt_renewal_counts', sql`delivered >= 0 and balance >= 0 and balance <= 2`),
  ...tenantGuard('pt_renewal_requests', T(t.tenantId)),
  ...allow('pt_renewal_requests_read', ['select'], sql`${coach(t.clientId)} or (${CLIENT} and ${OWN(t.clientId)})`),
  ...allow('pt_renewal_requests_write', ['insert'], sql`${CLIENT} and ${OWN(t.clientId)}`),
  ...allow('pt_renewal_requests_write', ['update'], coach(t.clientId)),
]).enableRLS();
