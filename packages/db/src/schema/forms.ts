import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, CLIENT, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { subscriptions } from './packages';
import { calendarEvents } from './calendar';
import { clients } from './clients';
import type { Answers, FormDocument } from '@dawlyy/core/types';
import { checkinState, documentKind, formKind, publishState } from './enums';
import { tenants } from './tenants';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §12 (intake), §17 (check-ins), §18 (assessments): one form engine, three kinds. */

/** doc §5.2, §8: forms policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const forms = pgTable(
  'forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<{ ar?: string; en?: string }>().notNull(),
    formKind: formKind('form_kind').notNull(),
    kind: documentKind('kind').notNull(),
    templateId: uuid('template_id'),
    clientId: uuid('client_id'),
    // 0004 hand edit H3: forms_current_version_fk ON DELETE SET NULL (current_version_id), doc §8.2, §11.2.
    currentVersionId: uuid('current_version_id'),
    // 0006: app.version_pointers maintains this pointer without a foreign key, doc §7.3.
    publishedVersionId: uuid('published_version_id'),
    /** Default template for its kind in this tenant. */
    isDefault: integer('is_default').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedBy: uuid('archived_by'),
  },
  (t) => [
    index('forms_tenant_kind_idx').on(t.tenantId, t.formKind, t.kind),
    uniqueIndex('forms_tenant_id_uq').on(t.tenantId, t.id),
    index('forms_tenant_client_idx').on(t.tenantId, t.clientId).where(sql`${t.clientId} is not null`),
    index('forms_tenant_template_idx').on(t.tenantId, t.templateId).where(sql`${t.templateId} is not null`),
    foreignKey({
      name: 'forms_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'forms_template_fk',
      columns: [t.tenantId, t.templateId],
      foreignColumns: [t.tenantId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    check('forms_kind_client_ck', sql`(${t.kind} = 'template') = (${t.clientId} is null)`),
    ...tenantGuard('forms', T(t.tenantId)),
    ...allow('forms_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('forms_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('forms_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
    ...allow('forms_client_templates', ['select'], sql`${T(t.tenantId)} and ${CLIENT} and ${t.clientId} is null`),
  ],
).enableRLS();

/** doc §5.2, §8: form_versions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const formVersions = pgTable(
  'form_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    formId: uuid('form_id').notNull(),
    clientId: uuid('client_id'),
    versionNo: integer('version_no').notNull(),
    status: publishState('status').notNull().default('draft'),
    document: jsonb('document').$type<FormDocument>().notNull(),
    changeNote: text('change_note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('form_versions_form_no_uq').on(t.formId, t.versionNo),
    uniqueIndex('form_versions_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('form_versions_id_form_uq').on(t.id, t.formId),
    uniqueIndex('form_versions_one_published_uq').on(t.formId).where(sql`${t.status} = 'published'`),
    foreignKey({
      name: 'form_versions_form_fk',
      columns: [t.tenantId, t.formId],
      foreignColumns: [forms.tenantId, forms.id],
    }).onDelete('cascade'),
    check('form_versions_published_at_ck', sql`${t.status} not in ('published', 'superseded') or ${t.publishedAt} is not null`),
    ...tenantGuard('form_versions', T(t.tenantId)),
    ...allow('form_versions_staff_templates', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('form_versions_staff_copies', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('form_versions_client', ['select'], sql`${T(t.tenantId)} and ${OWN(t.clientId)} and ${t.status} in ('published','superseded')`),
    ...allow('form_versions_client_templates', ['select'], sql`${T(t.tenantId)} and ${CLIENT} and ${t.clientId} is null and ${t.status} in ('published','superseded')`),
  ],
).enableRLS();

/**
 * A client's answers to one form version. For check-ins and assessments the row is linked to the
 * calendar event that asked for it, and `state` follows the check-in machine (spec §56).
 */
/** doc §5.2, §8: form_submissions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    formId: uuid('form_id').notNull(),
    formVersionId: uuid('form_version_id').notNull(),
    formKind: formKind('form_kind').notNull(),
    calendarEventId: uuid('calendar_event_id'),
    subscriptionId: uuid('subscription_id'),
    state: checkinState('state').notNull().default('due'),
    answers: jsonb('answers').$type<Answers>().notNull().default({}),
    /** Question ids still missing when the client saved a partial draft. */
    missingRequired: text('missing_required').array().notNull().default([]),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
    /** Coach feedback visible to the client. */
    coachFeedback: text('coach_feedback'),
    /** Per-test results and scores for assessments; coach-only interpretation lives in client_notes. */
    results: jsonb('results').$type<Record<string, unknown>>(),
    clientUuid: uuid('client_uuid'),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    index('form_submissions_client_kind_idx').on(t.tenantId, t.clientId, t.formKind),
    index('form_submissions_tenant_state_idx').on(t.tenantId, t.state),
    index('form_submissions_event_idx').on(t.calendarEventId),
    uniqueIndex('form_submissions_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('form_submissions_tenant_version_idx').on(t.tenantId, t.formVersionId),
    foreignKey({
      name: 'form_submissions_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'form_submissions_version_fk',
      columns: [t.tenantId, t.formVersionId],
      foreignColumns: [formVersions.tenantId, formVersions.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'form_submissions_event_fk',
      columns: [t.tenantId, t.clientId, t.calendarEventId],
      foreignColumns: [calendarEvents.tenantId, calendarEvents.clientId, calendarEvents.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'form_submissions_subscription_fk',
      columns: [t.tenantId, t.clientId, t.subscriptionId],
      foreignColumns: [subscriptions.tenantId, subscriptions.clientId, subscriptions.id],
    }).onDelete('no action'),
    ...tenantGuard('form_submissions', T(t.tenantId)),
    ...allow('form_submissions_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('form_submissions_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();
