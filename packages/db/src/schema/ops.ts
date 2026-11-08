import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACCESS, ME, OWN, OWNER, STAFF, T, allow, tenantGuard } from './_rls';
import { memberships, tenants } from './tenants';
import { clients } from './clients';
import { automationRunState, mediaKind, mediaPurpose, mediaReviewState, taskPriority, taskState } from './enums';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §11 (action queue / tasks), §28 (media review), §33 (audit), §31 (automation runs), API idempotency. */

/** doc §5.2, §8: tasks policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    title: text('title').notNull(),
    detail: text('detail'),
    priority: taskPriority('priority').notNull().default('normal'),
    state: taskState('state').notNull().default('open'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    assigneeMembershipId: uuid('assignee_membership_id'),
    /** Where it came from: manual, rule:<key>, event:<id>. */
    source: text('source').notNull().default('manual'),
    // 0004 hand edit H1: SET DATA TYPE bigint USING NULL::bigint, doc §11.2.
    sourceEventId: bigint('source_event_id', { mode: 'number' }),
    dedupeKey: text('dedupe_key'),
    link: text('link'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tasks_tenant_dedupe_uq').on(t.tenantId, t.dedupeKey),
    index('tasks_tenant_state_due_idx').on(t.tenantId, t.state, t.dueAt),
    index('tasks_client_idx').on(t.clientId),
    index('tasks_tenant_assignee_idx').on(t.tenantId, t.assigneeMembershipId).where(sql`${t.assigneeMembershipId} is not null`),
    foreignKey({
      name: 'tasks_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'tasks_assignee_fk',
      columns: [t.tenantId, t.assigneeMembershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('no action'),
    ...tenantGuard('tasks', T(t.tenantId)),
    ...allow('tasks_staff', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and (${t.clientId} is null or ${ACCESS(t.clientId)})`),
  ],
).enableRLS();

/** Uploaded files. Bytes live in Supabase Storage; this row carries ownership, purpose and review state. */
/** doc §5.2, §8: media policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Null for tenant-level assets (exercise demos, branding). */
    clientId: uuid('client_id'),
    ownerUserId: uuid('owner_user_id').notNull(),
    bucket: text('bucket').notNull(),
    path: text('path').notNull(),
    kind: mediaKind('kind').notNull(),
    purpose: mediaPurpose('purpose').notNull(),
    mimeType: text('mime_type').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    reviewState: mediaReviewState('review_state'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    /** Set when upload finished (TUS resumable uploads report completion separately). */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('media_bucket_path_uq').on(t.bucket, t.path),
    index('media_client_purpose_idx').on(t.tenantId, t.clientId, t.purpose),
    uniqueIndex('media_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('media_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    foreignKey({
      name: 'media_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('media_path_ck', sql`${t.bucket} in ('client-media', 'tenant-assets')
        and (${t.clientId} is null) = (${t.bucket} = 'tenant-assets')
        and ${t.path} ~ '^[A-Za-z0-9._/-]+$'
        and ${t.path} !~ '(^|/)[.]{1,2}(/|$)'
        and ${t.path} !~ '//'
        and ${t.path} !~ '/$'
        and ((${t.clientId} is null and starts_with(${t.path}, ${t.tenantId}::text || '/assets/'))
          or (${t.clientId} is not null and starts_with(${t.path}, ${t.tenantId}::text || '/clients/' || ${t.clientId}::text || '/')))`),
    ...tenantGuard('media', T(t.tenantId)),
    ...allow('media_tenant_assets', ['select'], sql`${T(t.tenantId)} and ${t.clientId} is null`),
    ...allow('media_tenant_assets_staff', ['insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('media_client_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('media_client_own', ['select', 'insert'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
    ...allow('media_client_own', ['update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)} and (${ME(t.ownerUserId)} or ${t.reviewState} in ('requested','needs_resubmission'))`, sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** Append-only audit trail (spec §33). Written by triggers and services; readable by owner/staff only. */
/** doc §5.2, §8: audit_log policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    /** e.g. subscription.extend, program.publish, payment.verify, service:<reason> */
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    clientId: uuid('client_id'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    reason: text('reason'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_tenant_client_created_idx').on(t.tenantId, t.clientId, t.createdAt.desc()).where(sql`${t.clientId} is not null`),
    ...tenantGuard('audit_log', T(t.tenantId)),
    ...allow('audit_log_owner', ['select'], sql`${T(t.tenantId)} and ${OWNER}`),
    ...allow('audit_log_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
  ],
).enableRLS();

/** Transactional outbox: domain events written in the same transaction as the change, processed by cron. */
/** doc §5.2, §8: events policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const events = pgTable(
  'events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    type: text('type').notNull(),
    aggregate: text('aggregate').notNull(),
    aggregateId: text('aggregate_id'),
    clientId: uuid('client_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('events_unprocessed_idx').on(t.processedAt, t.createdAt),
    index('events_tenant_type_idx').on(t.tenantId, t.type),
    ...tenantGuard('events', T(t.tenantId)),
    ...allow('events_owner', ['select'], sql`${T(t.tenantId)} and ${OWNER}`),
  ],
).enableRLS();

/** Automation and cron runs (spec §31). */
/** doc §5.2, §8: job_runs policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    job: text('job').notNull(),
    state: automationRunState('state').notNull().default('pending'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(1),
    processed: integer('processed').notNull().default(0),
    error: text('error'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
  },
  (t) => [
    index('job_runs_job_started_idx').on(t.job, t.startedAt),
    ...tenantGuard('job_runs', T(t.tenantId)),
    ...allow('job_runs_staff', ['select'], sql`${T(t.tenantId)} and ${STAFF}`),
  ],
).enableRLS();

/** API idempotency keys (24 h). */
/** doc §5.2, §8: idempotency_keys policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code').notNull(),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('idempotency_keys_uq').on(t.tenantId, t.userId, t.key),
    index('idempotency_keys_created_idx').on(t.createdAt),
    ...tenantGuard('idempotency_keys', T(t.tenantId)),
    ...allow('idempotency_keys_self', ['select', 'insert', 'delete'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
  ],
).enableRLS();

/** AI drafts (spec §32): out of beta scope, table kept so coach approval states exist from day one. */
/** doc §5.2, §8: ai_requests policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const aiRequests = pgTable(
  'ai_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    kind: text('kind').notNull(),
    input: jsonb('input').$type<Record<string, unknown>>().notNull(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    model: text('model'),
    state: text('state').notNull().default('draft'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_requests_tenant_idx').on(t.tenantId, t.createdAt),
    index('ai_requests_tenant_client_idx').on(t.tenantId, t.clientId).where(sql`${t.clientId} is not null`),
    foreignKey({
      name: 'ai_requests_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    ...tenantGuard('ai_requests', T(t.tenantId)),
    ...allow('ai_requests_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and (${t.clientId} is null or ${ACCESS(t.clientId)})`),
  ],
).enableRLS();
