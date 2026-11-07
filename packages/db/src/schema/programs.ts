import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { ProgramDocument } from '@dawlyy/core/types';
import { authenticated, clientPolicies, isStaff, tenantMatch, tenantPolicies } from './_rls';
import { documentKind, publishState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §13 (exercise library), §14 (program builder), §29 (versioned publishing). */

export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for system (seed) rows shared by every tenant. */
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
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
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('exercises_tenant_slug_uq').on(t.tenantId, t.slug),
    index('exercises_tenant_category_idx').on(t.tenantId, t.category),
    // System rows (tenant_id null) are readable by every signed-in user; tenant rows follow the tenant template.
    pgPolicy('exercises_system_select', { for: 'select', to: authenticated, using: sql`${t.tenantId} is null` }),
    ...tenantPolicies('exercises', t),
  ],
);

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
    index('programs_tenant_kind_idx').on(t.tenantId, t.kind),
    index('programs_client_idx').on(t.tenantId, t.clientId),
    ...documentHeadPolicies('programs', t),
  ],
);

export const programVersions = pgTable(
  'program_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
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
    ...documentHeadPolicies('program_versions', t),
  ],
);

/**
 * Versioned documents: templates (client_id null) are tenant-wide; client copies follow client access.
 * Immutability of published versions is enforced by the trigger in migrations/0002_app_post_tables.sql.
 */
export function documentHeadPolicies(table: string, t: Parameters<typeof clientPolicies>[1]) {
  // Templates (client_id null) are tenant-wide but only owner/staff may touch them. A plain member policy
  // (tenantPolicies) would let every client of the tenant read all templates and every other client's copy.
  const templates = sql`${tenantMatch(t.tenantId)} and ${isStaff} and ${t.clientId} is null`;
  const tenantOnly = [pgPolicy(`${table}_staff_templates`, { for: 'all', to: authenticated, using: templates, withCheck: templates })];
  const perClient = clientPolicies(`${table}_client`, t);
  // Both sets apply; policies are OR-ed per command. Template rows have client_id null, so
  // app.can_access_client(null) is false and only the template policy grants access to them.
  return [...tenantOnly, ...perClient];
}
