import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Answers, FormDocument } from '@dawlyy/core/types';
import { clientPolicies } from './_rls';
import { checkinState, documentKind, formKind, publishState } from './enums';
import { clients } from './clients';
import { documentHeadPolicies } from './programs';
import { tenants } from './tenants';

/** Spec §12 (intake), §17 (check-ins), §18 (assessments): one form engine, three kinds. */

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
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    currentVersionId: uuid('current_version_id'),
    publishedVersionId: uuid('published_version_id'),
    /** Default template for its kind in this tenant. */
    isDefault: integer('is_default').notNull().default(0),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('forms_tenant_kind_idx').on(t.tenantId, t.formKind, t.kind), ...documentHeadPolicies('forms', t)],
);

export const formVersions = pgTable(
  'form_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    formId: uuid('form_id')
      .notNull()
      .references(() => forms.id, { onDelete: 'cascade' }),
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
  (t) => [uniqueIndex('form_versions_form_no_uq').on(t.formId, t.versionNo), ...documentHeadPolicies('form_versions', t)],
);

/**
 * A client's answers to one form version. For check-ins and assessments the row is linked to the
 * calendar event that asked for it, and `state` follows the check-in machine (spec §56).
 */
export const formSubmissions = pgTable(
  'form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    formId: uuid('form_id').notNull(),
    formVersionId: uuid('form_version_id')
      .notNull()
      .references(() => formVersions.id),
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
    uniqueIndex('form_submissions_client_uuid_uq').on(t.tenantId, t.clientUuid),
    ...clientPolicies('form_submissions', t, { clientWrite: true }),
  ],
);
