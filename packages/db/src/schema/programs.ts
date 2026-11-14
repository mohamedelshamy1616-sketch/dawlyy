import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { tenants } from './tenants';
import { subscriptions } from './packages';
import { clients } from './clients';
import { media } from './ops';
import type { ProgramDocument } from '@dawlyy/core/types';
import { documentKind, publishState } from './enums';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §13 (exercise library), §14 (program builder), §29 (versioned publishing). */

/** doc §5.2, §8: exercises policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for system (seed) rows shared by every tenant. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    basedOnId: uuid('based_on_id'),
    slug: text('slug').notNull(),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    aliases: text('aliases').array().notNull().default([]),
    category: text('category').notNull(),
    primaryMuscles: text('primary_muscles').array().notNull().default([]),
    secondaryMuscles: text('secondary_muscles').array().notNull().default([]),
    movementPattern: text('movement_pattern').notNull(),
    equipment: text('equipment').array().notNull().default([]),
    difficulty: text('difficulty').notNull(),
    unilateral: boolean('unilateral').notNull().default(false),
    compound: boolean('compound').notNull().default(true),
    plane: text('plane').notNull().default('sagittal'),
    cues: jsonb('cues').$type<{ ar?: string; en?: string }[]>().notNull().default([]),
    commonMistakes: jsonb('common_mistakes').$type<{ ar?: string; en?: string }[]>().notNull().default([]),
    contraindications: jsonb('contraindications').$type<{ ar?: string; en?: string }[]>().notNull().default([]),
    progressions: text('progressions').array().notNull().default([]),
    regressions: text('regressions').array().notNull().default([]),
    alternatives: text('alternatives').array().notNull().default([]),
    tags: text('tags').array().notNull().default([]),
    videoUrl: text('video_url'),
    thumbnailMediaId: uuid('thumbnail_media_id'),
    source: text('source').notNull().default('coach'),
    hidden: boolean('hidden').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('exercises_tenant_slug_uq').on(t.tenantId, t.slug),
    index('exercises_tenant_category_idx').on(t.tenantId, t.category),
    index('exercises_tenant_thumbnail_idx').on(t.tenantId, t.thumbnailMediaId).where(sql`${t.thumbnailMediaId} is not null`),
    index('exercises_based_on_idx').on(t.basedOnId).where(sql`${t.basedOnId} is not null`),
    foreignKey({
      name: 'exercises_thumbnail_fk',
      columns: [t.tenantId, t.thumbnailMediaId],
      foreignColumns: [media.tenantId, media.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'exercises_based_on_fk',
      columns: [t.basedOnId],
      foreignColumns: [t.id as AnyPgColumn],
    }).onDelete('set null'),
    ...tenantGuard('exercises', sql`${t.tenantId} is null or ${T(t.tenantId)}`, T(t.tenantId)),
    ...allow('exercises_system', ['select'], sql`${t.tenantId} is null`),
    ...allow('exercises_member', ['select'], sql`${T(t.tenantId)}`),
    ...allow('exercises_staff', ['insert', 'update'], sql`${T(t.tenantId)} and ${STAFF}`),
  ],
).enableRLS();

/** doc §5.2, §8: programs policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    kind: documentKind('kind').notNull(),
    /** For kind = client: the template this copy came from. */
    templateId: uuid('template_id'),
    /** Nullable for templates; set for client copies. RLS uses it when present. */
    clientId: uuid('client_id'),
    subscriptionId: uuid('subscription_id'),
    // 0004 hand edit H3: programs_current_version_fk ON DELETE SET NULL (current_version_id), doc §8.2, §11.2.
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
    index('programs_tenant_kind_idx').on(t.tenantId, t.kind),
    index('programs_client_idx').on(t.tenantId, t.clientId),
    uniqueIndex('programs_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('programs_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    index('programs_tenant_template_idx').on(t.tenantId, t.templateId).where(sql`${t.templateId} is not null`),
    foreignKey({
      name: 'programs_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'programs_template_fk',
      columns: [t.tenantId, t.templateId],
      foreignColumns: [t.tenantId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    foreignKey({
      name: 'programs_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('no action'),
    check('programs_kind_client_ck', sql`(${t.kind} = 'template') = (${t.clientId} is null)`),
    check('programs_client_sub_ck', sql`${t.clientId} is not null or ${t.subscriptionId} is null`),
    ...tenantGuard('programs', T(t.tenantId)),
    ...allow('programs_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('programs_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('programs_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: program_versions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const programVersions = pgTable(
  'program_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').notNull(),
    clientId: uuid('client_id'),
    versionNo: integer('version_no').notNull(),
    status: publishState('status').notNull().default('draft'),
    document: jsonb('document').$type<ProgramDocument>().notNull(),
    changeNote: text('change_note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('program_versions_program_no_uq').on(t.programId, t.versionNo),
    index('program_versions_program_status_idx').on(t.programId, t.status),
    uniqueIndex('program_versions_tenant_client_program_id_uq').on(t.tenantId, t.clientId, t.programId, t.id),
    uniqueIndex('program_versions_id_program_uq').on(t.id, t.programId),
    uniqueIndex('program_versions_one_published_uq').on(t.programId).where(sql`${t.status} = 'published'`),
    foreignKey({
      name: 'program_versions_program_fk',
      columns: [t.tenantId, t.programId],
      foreignColumns: [programs.tenantId, programs.id],
    }).onDelete('cascade'),
    check('program_versions_published_at_ck', sql`${t.status} not in ('published', 'superseded') or ${t.publishedAt} is not null`),
    ...tenantGuard('program_versions', T(t.tenantId)),
    ...allow('program_versions_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('program_versions_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('program_versions_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)} and ${t.status} in ('published','superseded')`),
  ],
).enableRLS();

/** doc §9: tenant_hidden_items with the §5.2 visibility and §8 constraints. */
// triggers and grants: 0006, doc §6.3, §7, §11.4.
export const tenantHiddenItems = pgTable(
  'tenant_hidden_items',
  {
    tenantId: uuid('tenant_id').notNull(),
    kind: text('kind').notNull(),
    itemId: uuid('item_id').notNull(),
    hiddenBy: uuid('hidden_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'tenant_hidden_items_pk', columns: [t.tenantId, t.kind, t.itemId] }),
    foreignKey({
      name: 'tenant_hidden_items_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    check('tenant_hidden_items_kind_ck', sql`${t.kind} in ('exercise','food')`),
    ...tenantGuard('tenant_hidden_items', T(t.tenantId)),
    ...allow('tenant_hidden_items_member', ['select'], sql`${T(t.tenantId)}`),
    ...allow('tenant_hidden_items_staff', ['insert', 'delete'], sql`${T(t.tenantId)} and ${STAFF}`),
  ],
).enableRLS();
