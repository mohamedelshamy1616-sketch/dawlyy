import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { authenticated, canAccessClient, coachPrivatePolicies, isStaff, tenantMatch } from './_rls';
import { automationRunState, mediaKind, mediaPurpose, mediaReviewState, taskPriority, taskState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §11 (action queue / tasks), §28 (media review), §33 (audit), §31 (automation runs), API idempotency. */

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    detail: text('detail'),
    priority: taskPriority('priority').notNull().default('normal'),
    state: taskState('state').notNull().default('open'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    assigneeMembershipId: uuid('assignee_membership_id'),
    /** Where it came from: manual, rule:<key>, event:<id>. */
    source: text('source').notNull().default('manual'),
    sourceEventId: uuid('source_event_id'),
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
    ...coachPrivatePolicies('tasks', { tenantId: t.tenantId, clientId: t.clientId }),
  ],
);

/** Uploaded files. Bytes live in Supabase Storage; this row carries ownership, purpose and review state. */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Null for tenant-level assets (exercise demos, branding). */
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
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
    // Tenant-level assets: all members read, staff write.
    pgPolicy('media_tenant_select', { for: 'select', to: authenticated, using: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is null` }),
    pgPolicy('media_tenant_staff_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is null and ${isStaff}`,
      withCheck: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is null and ${isStaff}`,
    }),
    // Client media: client + staff with access read; the uploader (owner) and staff write.
    pgPolicy('media_client_select', {
      for: 'select',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is not null and ${canAccessClient(t.clientId)}`,
    }),
    pgPolicy('media_client_owner_insert', {
      for: 'insert',
      to: authenticated,
      withCheck: sql`${tenantMatch(t.tenantId)} and ${t.ownerUserId} = (select app.uid()) and ${canAccessClient(t.clientId)}`,
    }),
    pgPolicy('media_client_staff_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is not null and ${canAccessClient(t.clientId)} and ${isStaff}`,
      withCheck: sql`${tenantMatch(t.tenantId)} and ${t.clientId} is not null and ${canAccessClient(t.clientId)} and ${isStaff}`,
    }),
  ],
);

/** Append-only audit trail (spec §33). Written by triggers and services; readable by owner/staff only. */
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
    pgPolicy('audit_log_staff_select', { for: 'select', to: authenticated, using: sql`${tenantMatch(t.tenantId)} and ${isStaff}` }),
    pgPolicy('audit_log_member_insert', { for: 'insert', to: authenticated, withCheck: tenantMatch(t.tenantId) }),
  ],
);

/** Transactional outbox: domain events written in the same transaction as the change, processed by cron. */
export const events = pgTable(
  'events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    tenantId: uuid('tenant_id').notNull(),
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
    pgPolicy('events_member_insert', { for: 'insert', to: authenticated, withCheck: tenantMatch(t.tenantId) }),
    pgPolicy('events_staff_select', { for: 'select', to: authenticated, using: sql`${tenantMatch(t.tenantId)} and ${isStaff}` }),
  ],
);

/** Automation and cron runs (spec §31). */
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
    pgPolicy('job_runs_staff_select', { for: 'select', to: authenticated, using: sql`${tenantMatch(t.tenantId)} and ${isStaff}` }),
  ],
);

/** API idempotency keys (24 h). */
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
    pgPolicy('idempotency_keys_owner_all', {
      for: 'all',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${t.userId} = (select app.uid())`,
      withCheck: sql`${tenantMatch(t.tenantId)} and ${t.userId} = (select app.uid())`,
    }),
  ],
);

/** AI drafts (spec §32): out of beta scope, table kept so coach approval states exist from day one. */
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
  (t) => [index('ai_requests_tenant_idx').on(t.tenantId, t.createdAt), ...coachPrivatePolicies('ai_requests', { tenantId: t.tenantId, clientId: t.clientId })],
);
