import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { HouseholdMeasure, Macros, NutritionDocument } from '@dawlyy/core/types';
import { authenticated, clientPolicies, tenantPolicies } from './_rls';
import { documentKind, publishState } from './enums';
import { clients } from './clients';
import { documentHeadPolicies } from './programs';
import { tenants } from './tenants';

/** Spec §15 (nutrition builder), §16 (supplements), §27 (meal logging). */

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for system (seed) rows shared by every tenant. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    aliases: text('aliases').array().notNull().default([]),
    category: text('category').notNull(),
    per100: jsonb('per_100').$type<Macros>().notNull(),
    micronutrients: jsonb('micronutrients').$type<Record<string, number>>(),
    rawOrCooked: text('raw_or_cooked'),
    counterpartSlug: text('counterpart_slug'),
    cookedYield: numeric('cooked_yield', { precision: 6, scale: 3, mode: 'number' }),
    measures: jsonb('measures').$type<HouseholdMeasure[]>().notNull().default([]),
    source: text('source').notNull().default('estimate'),
    brand: text('brand'),
    tags: text('tags').array().notNull().default([]),
    hidden: boolean('hidden').notNull().default(false),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('foods_tenant_slug_uq').on(t.tenantId, t.slug),
    index('foods_tenant_category_idx').on(t.tenantId, t.category),
    // System rows (tenant_id null) are readable by every signed-in user; tenant rows follow the tenant template.
    pgPolicy('foods_system_select', { for: 'select', to: authenticated, using: sql`${t.tenantId} is null` }),
    ...tenantPolicies('foods', t),
  ],
);

export const nutritionPlans = pgTable(
  'nutrition_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    kind: documentKind('kind').notNull(),
    templateId: uuid('template_id'),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id'),
    currentVersionId: uuid('current_version_id'),
    publishedVersionId: uuid('published_version_id'),
    tags: text('tags').array().notNull().default([]),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    index('nutrition_plans_tenant_kind_idx').on(t.tenantId, t.kind),
    index('nutrition_plans_client_idx').on(t.tenantId, t.clientId),
    ...documentHeadPolicies('nutrition_plans', t),
  ],
);

export const nutritionPlanVersions = pgTable(
  'nutrition_plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => nutritionPlans.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    versionNo: integer('version_no').notNull(),
    status: publishState('status').notNull().default('draft'),
    document: jsonb('document').$type<NutritionDocument>().notNull(),
    changeNote: text('change_note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('nutrition_plan_versions_plan_no_uq').on(t.planId, t.versionNo),
    index('nutrition_plan_versions_plan_status_idx').on(t.planId, t.status),
    ...documentHeadPolicies('nutrition_plan_versions', t),
  ],
);

/** What the client actually ate: chosen option per meal, or a free entry. */
export const mealLogs = pgTable(
  'meal_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    planVersionId: uuid('plan_version_id'),
    localDate: date('local_date').notNull(),
    mealId: text('meal_id'),
    optionId: text('option_id'),
    /** Free-text or photo meal when not following the plan. */
    freeEntry: jsonb('free_entry').$type<{ text?: string; mediaIds?: string[]; macros?: Macros }>(),
    status: text('status').notNull().default('eaten'),
    note: text('note'),
    /** Client-generated uuid for offline idempotency. */
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meal_logs_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('meal_logs_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    ...clientPolicies('meal_logs', t, { clientWrite: true }),
  ],
);

export const supplementLogs = pgTable(
  'supplement_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    planVersionId: uuid('plan_version_id'),
    supplementId: text('supplement_id').notNull(),
    localDate: date('local_date').notNull(),
    taken: boolean('taken').notNull(),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('supplement_logs_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('supplement_logs_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    ...clientPolicies('supplement_logs', t, { clientWrite: true }),
  ],
);
