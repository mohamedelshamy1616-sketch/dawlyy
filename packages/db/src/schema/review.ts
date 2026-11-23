import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACCESS, STAFF, T, allow, tenantGuard } from './_rls';
import { clients } from './clients';
import { tenants } from './tenants';

// 0008 extends the 0006 guard, audit, and privilege conventions.

// reinvent R0a: private coach drafts; approval and staleness use app.approve_ai_draft in 0008.
export const aiDrafts = pgTable(
  'ai_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    kind: text('kind').notNull(),
    inputHash: text('input_hash').notNull(),
    inputVersion: text('input_version').notNull(),
    body: jsonb('body').$type<Record<string, unknown>>().notNull(),
    provider: text('provider').notNull().default('none'),
    status: text('status').notNull().default('draft'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    index('ai_drafts_client_created_idx').on(t.tenantId, t.clientId, t.createdAt.desc()),
    foreignKey({
      name: 'ai_drafts_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('ai_drafts_kind_ck', sql`${t.kind} in ('week_review')`),
    check('ai_drafts_input_hash_ck', sql`${t.inputHash} ~ '^[0-9a-f]{64}$'`),
    check('ai_drafts_input_version_ck', sql`length(${t.inputVersion}) between 1 and 200`),
    check('ai_drafts_body_ck', sql`jsonb_typeof(${t.body}) = 'object'`),
    check('ai_drafts_provider_ck', sql`${t.provider} in ('none','anthropic','openrouter')`),
    check('ai_drafts_status_ck', sql`${t.status} in ('draft','approved','rejected','stale')`),
    ...tenantGuard('ai_drafts', T(t.tenantId)),
    ...allow('ai_drafts_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
  ],
).enableRLS();

// reinvent R0a: app.raise_red_flag derives source scope; only staff may read and handle flags.
export const redFlags = pgTable(
  'red_flags',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    source: text('source').notNull(),
    sourceId: uuid('source_id').notNull(),
    category: text('category').notNull(),
    matched: text('matched').notNull(),
    evidenceHash: text('evidence_hash').notNull(),
    status: text('status').notNull().default('open'),
    handledBy: uuid('handled_by'),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('red_flags_source_category_uq').on(t.tenantId, t.source, t.sourceId, t.category, t.evidenceHash),
    index('red_flags_status_created_idx').on(t.tenantId, t.status, t.createdAt.desc()),
    index('red_flags_client_idx').on(t.tenantId, t.clientId),
    foreignKey({
      name: 'red_flags_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('red_flags_source_ck', sql`${t.source} in ('message','checkin','meal_note')`),
    check('red_flags_category_ck', sql`${t.category} in ('pain_injury','eating_disorder','pregnancy','medication','other')`),
    check('red_flags_matched_ck', sql`length(${t.matched}) between 1 and 200`),
    check('red_flags_evidence_hash_ck', sql`${t.evidenceHash} ~ '^[0-9a-f]{64}$'`),
    check('red_flags_status_ck', sql`${t.status} in ('open','handled')`),
    ...tenantGuard('red_flags', T(t.tenantId)),
    ...allow('red_flags_staff', ['select', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
  ],
).enableRLS();
