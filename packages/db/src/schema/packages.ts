import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACCESS, CLIENT, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { media } from './ops';
import { clients } from './clients';
import type { EntitlementOverride, PackageEntitlements, ScheduleRules } from '@dawlyy/core/types';
import { paymentMethod, paymentState, subscriptionEventKind, subscriptionState } from './enums';
import { tenants } from './tenants';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §8 (packages), §9 (overrides), §30 (access vs payment), §35 (manual payments). */

/** doc §5.2, §8: packages policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const packages = pgTable(
  'packages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    description: jsonb('description').$type<{ ar?: string; en?: string }>(),
    durationDays: integer('duration_days').notNull(),
    price: numeric('price', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('EGP'),
    entitlements: jsonb('entitlements').$type<PackageEntitlements>().notNull().default([]),
    scheduleRules: jsonb('schedule_rules').$type<ScheduleRules>().notNull(),
    /** Grace period after ends_on before access is restricted (spec §30). */
    graceDays: integer('grace_days').notNull().default(0),
    isPublic: boolean('is_public').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by'),
  },
  (t) => [
    index('packages_tenant_idx').on(t.tenantId),
    uniqueIndex('packages_tenant_id_uq').on(t.tenantId, t.id),
    ...tenantGuard('packages', T(t.tenantId)),
    ...allow('packages_staff', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF}`),
    ...allow('packages_client', ['select'], sql`${T(t.tenantId)} and ${CLIENT} and ${t.isPublic} and ${t.archivedAt} is null`),
  ],
).enableRLS();

/** doc §5.2, §8: subscriptions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    packageId: uuid('package_id').notNull(),
    /** Snapshot of the package at assignment time; overrides apply on top. */
    packageSnapshot: jsonb('package_snapshot')
      .$type<{ name: { ar?: string; en?: string }; entitlements: PackageEntitlements; scheduleRules: ScheduleRules; durationDays: number; price: number; currency: string }>()
      .notNull(),
    state: subscriptionState('state').notNull().default('pending'),
    /** Day 0 (spec §22). */
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    graceEndsOn: date('grace_ends_on'),
    timezone: text('timezone').notNull().default('Africa/Cairo'),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    /** Days added by freezes; ends_on already includes them. */
    frozenDays: integer('frozen_days').notNull().default(0),
    price: numeric('price', { precision: 12, scale: 2, mode: 'number' }).notNull().default(0),
    currency: text('currency').notNull().default('EGP'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    index('subscriptions_tenant_client_idx').on(t.tenantId, t.clientId),
    index('subscriptions_tenant_state_ends_idx').on(t.tenantId, t.state, t.endsOn),
    uniqueIndex('subscriptions_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    index('subscriptions_tenant_package_idx').on(t.tenantId, t.packageId),
    foreignKey({
      name: 'subscriptions_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'subscriptions_package_fk',
      columns: [t.tenantId, t.packageId],
      foreignColumns: [packages.tenantId, packages.id],
    }).onDelete('no action'),
    ...tenantGuard('subscriptions', T(t.tenantId)),
    ...allow('subscriptions_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('subscriptions_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** Every change to a subscription is a row: extensions, freezes, cancellations (spec §30 history is never deleted). */
/** doc §5.2, §8: subscription_events policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    subscriptionId: uuid('subscription_id').notNull(),
    kind: subscriptionEventKind('kind').notNull(),
    fromState: subscriptionState('from_state'),
    toState: subscriptionState('to_state'),
    oldEndsOn: date('old_ends_on'),
    newEndsOn: date('new_ends_on'),
    days: integer('days'),
    reason: text('reason'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('subscription_events_sub_idx').on(t.subscriptionId),
    foreignKey({
      name: 'sub_events_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('cascade'),
    ...tenantGuard('subscription_events', T(t.tenantId)),
    ...allow('subscription_events_staff', ['select', 'insert'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('subscription_events_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: client_entitlement_overrides policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const clientEntitlementOverrides = pgTable(
  'client_entitlement_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    subscriptionId: uuid('subscription_id'),
    override: jsonb('override').$type<EntitlementOverride>().notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('client_entitlement_overrides_client_idx').on(t.tenantId, t.clientId),
    foreignKey({
      name: 'ceo_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'ceo_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('cascade'),
    ...tenantGuard('client_entitlement_overrides', T(t.tenantId)),
    ...allow('client_entitlement_overrides_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('client_entitlement_overrides_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** Manual payment records with proof (spec §35). Gateways come after beta through the same table. */
/** doc §5.2, §8: payments policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    subscriptionId: uuid('subscription_id'),
    amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('EGP'),
    method: paymentMethod('method').notNull(),
    state: paymentState('state').notNull().default('pending'),
    /** Sequential per tenant, assigned on verification. */
    receiptNo: text('receipt_no'),
    proofMediaId: uuid('proof_media_id'),
    reference: text('reference'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by'),
    rejectedReason: text('rejected_reason'),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundAmount: numeric('refund_amount', { precision: 12, scale: 2, mode: 'number' }),
    /** Gateway fields, unused in beta. */
    provider: text('provider'),
    providerRef: text('provider_ref'),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    index('payments_tenant_state_idx').on(t.tenantId, t.state),
    index('payments_client_idx').on(t.tenantId, t.clientId),
    uniqueIndex('payments_tenant_receipt_uq').on(t.tenantId, t.receiptNo),
    foreignKey({
      name: 'payments_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'payments_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'payments_proof_media_fk',
      columns: [t.tenantId, t.clientId, t.proofMediaId],
      foreignColumns: [media.tenantId, media.clientId, media.id],
    }).onDelete('no action'),
    check('payments_amount_ck', sql`${t.amount} >= 0 and ${t.amount} < 'Infinity'::numeric and (${t.refundAmount} is null or (${t.refundAmount} >= 0 and ${t.refundAmount} <= ${t.amount}))`),
    check('payments_refund_state_ck', sql`(${t.state} = 'refunded') = (${t.refundAmount} is not null and ${t.refundAmount} = ${t.amount}) and (${t.refundAmount} is null or ${t.state} in ('verified', 'refunded'))`),
    check('payments_rejected_reason_ck', sql`${t.rejectedReason} is null or ${t.state} = 'rejected'`),
    ...tenantGuard('payments', T(t.tenantId)),
    ...allow('payments_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('payments_client', ['select', 'insert'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
    ...allow('payments_client', ['update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)} and ${t.state} = 'pending'`, sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();
