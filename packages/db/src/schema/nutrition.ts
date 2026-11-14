import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { subscriptions } from './packages';
import { clients } from './clients';
import type { HouseholdMeasure, Macros, NutritionDocument } from '@dawlyy/core/types';
import { documentKind, publishState } from './enums';
import { tenants } from './tenants';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §15 (nutrition builder), §16 (supplements), §27 (meal logging). */

/** doc §5.2, §8: foods policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for system (seed) rows shared by every tenant. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    basedOnId: uuid('based_on_id'),
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
    index('foods_based_on_idx').on(t.basedOnId).where(sql`${t.basedOnId} is not null`),
    foreignKey({
      name: 'foods_based_on_fk',
      columns: [t.basedOnId],
      foreignColumns: [t.id as AnyPgColumn],
    }).onDelete('set null'),
    ...tenantGuard('foods', sql`${t.tenantId} is null or ${T(t.tenantId)}`, T(t.tenantId)),
    ...allow('foods_system', ['select'], sql`${t.tenantId} is null`),
    ...allow('foods_member', ['select'], sql`${T(t.tenantId)}`),
    ...allow('foods_staff', ['insert', 'update'], sql`${T(t.tenantId)} and ${STAFF}`),
  ],
).enableRLS();

/** doc §5.2, §8: nutrition_plans policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
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
    clientId: uuid('client_id'),
    subscriptionId: uuid('subscription_id'),
    // 0004 hand edit H3: nutrition_plans_current_version_fk ON DELETE SET NULL (current_version_id), doc §8.2, §11.2.
    currentVersionId: uuid('current_version_id'),
    // 0006: app.version_pointers maintains this pointer without a foreign key, doc §7.3.
    publishedVersionId: uuid('published_version_id'),
    tags: text('tags').array().notNull().default([]),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by'),
  },
  (t) => [
    index('nutrition_plans_tenant_kind_idx').on(t.tenantId, t.kind),
    index('nutrition_plans_client_idx').on(t.tenantId, t.clientId),
    uniqueIndex('nutrition_plans_tenant_id_uq').on(t.tenantId, t.id),
    index('nutrition_plans_tenant_template_idx').on(t.tenantId, t.templateId).where(sql`${t.templateId} is not null`),
    foreignKey({
      name: 'nutrition_plans_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'nutrition_plans_template_fk',
      columns: [t.tenantId, t.templateId],
      foreignColumns: [t.tenantId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    foreignKey({
      name: 'nutrition_plans_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('no action'),
    check('nutrition_plans_kind_client_ck', sql`(${t.kind} = 'template') = (${t.clientId} is null)`),
    check('nutrition_plans_client_sub_ck', sql`${t.clientId} is not null or ${t.subscriptionId} is null`),
    ...tenantGuard('nutrition_plans', T(t.tenantId)),
    ...allow('nutrition_plans_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('nutrition_plans_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('nutrition_plans_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: nutrition_plan_versions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const nutritionPlanVersions = pgTable(
  'nutrition_plan_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull(),
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
    uniqueIndex('nutrition_plan_versions_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    uniqueIndex('nutrition_plan_versions_id_plan_uq').on(t.id, t.planId),
    uniqueIndex('nutrition_plan_versions_one_published_uq').on(t.planId).where(sql`${t.status} = 'published'`),
    foreignKey({
      name: 'nutrition_plan_versions_plan_fk',
      columns: [t.tenantId, t.planId],
      foreignColumns: [nutritionPlans.tenantId, nutritionPlans.id],
    }).onDelete('cascade'),
    check('nutrition_plan_versions_published_at_ck', sql`${t.status} not in ('published', 'superseded') or ${t.publishedAt} is not null`),
    ...tenantGuard('nutrition_plan_versions', T(t.tenantId)),
    ...allow('nutrition_plan_versions_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('nutrition_plan_versions_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('nutrition_plan_versions_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)} and ${t.status} in ('published','superseded')`),
  ],
).enableRLS();

/** What the client actually ate: chosen option per meal, or a free entry. */
/** doc §5.2, §8: meal_logs policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const mealLogs = pgTable(
  'meal_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
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
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by'),
    voidReason: text('void_reason'),
    replacesId: uuid('replaces_id'),
  },
  (t) => [
    uniqueIndex('meal_logs_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    uniqueIndex('meal_logs_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    uniqueIndex('meal_logs_replaces_uq').on(t.tenantId, t.clientId, t.replacesId).where(sql`${t.replacesId} is not null`),
    index('meal_logs_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    foreignKey({
      name: 'meal_logs_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'meal_logs_plan_version_fk',
      columns: [t.tenantId, t.clientId, t.planVersionId],
      foreignColumns: [nutritionPlanVersions.tenantId, nutritionPlanVersions.clientId, nutritionPlanVersions.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'meal_logs_replaces_fk',
      columns: [t.tenantId, t.clientId, t.replacesId],
      foreignColumns: [t.tenantId as AnyPgColumn, t.clientId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    check('meal_logs_void_reason_ck', sql`length(${t.voidReason}) <= 500`),
    ...tenantGuard('meal_logs', T(t.tenantId)),
    ...allow('meal_logs_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('meal_logs_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: supplement_logs policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const supplementLogs = pgTable(
  'supplement_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    planVersionId: uuid('plan_version_id'),
    supplementId: text('supplement_id').notNull(),
    localDate: date('local_date').notNull(),
    taken: boolean('taken').notNull(),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('supplement_logs_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('supplement_logs_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    foreignKey({
      name: 'supplement_logs_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'supplement_logs_plan_version_fk',
      columns: [t.tenantId, t.clientId, t.planVersionId],
      foreignColumns: [nutritionPlanVersions.tenantId, nutritionPlanVersions.clientId, nutritionPlanVersions.id],
    }).onDelete('no action'),
    ...tenantGuard('supplement_logs', T(t.tenantId)),
    ...allow('supplement_logs_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('supplement_logs_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();
