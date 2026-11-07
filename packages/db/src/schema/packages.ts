import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { EntitlementOverride, PackageEntitlements, ScheduleRules } from '@dawlyy/core/types';
import { clientPolicies, tenantPolicies } from './_rls';
import { paymentMethod, paymentState, subscriptionEventKind, subscriptionState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §8 (packages), §9 (overrides), §30 (access vs payment), §35 (manual payments). */

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
  },
  (t) => [index('packages_tenant_idx').on(t.tenantId), ...tenantPolicies('packages', t)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => packages.id),
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
    ...clientPolicies('subscriptions', t),
  ],
);

/** Every change to a subscription is a row: extensions, freezes, cancellations (spec §30 history is never deleted). */
export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
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
  (t) => [index('subscription_events_sub_idx').on(t.subscriptionId), ...clientPolicies('subscription_events', t)],
);

export const clientEntitlementOverrides = pgTable(
  'client_entitlement_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }),
    override: jsonb('override').$type<EntitlementOverride>().notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('client_entitlement_overrides_client_idx').on(t.tenantId, t.clientId), ...clientPolicies('client_entitlement_overrides', t)],
);

/** Manual payment records with proof (spec §35). Gateways come after beta through the same table. */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
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
    // Clients may submit a payment record with proof; staff verify.
    ...clientPolicies('payments', t, { clientWrite: true }),
  ],
);
