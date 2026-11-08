import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, ME, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { tenants } from './tenants';
import { clients } from './clients';
import { conversationKind, notificationChannel, notificationDeliveryState } from './enums';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §20 (messaging), §21 (notification center), §31 (reminders delivery). */

/** doc §5.2, §8: conversations policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: conversationKind('kind').notNull().default('client'),
    /** 1:1 coach↔client threads carry the client; internal threads do not. */
    clientId: uuid('client_id'),
    subject: text('subject'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    unreadForCoach: integer('unread_for_coach').notNull().default(0),
    unreadForClient: integer('unread_for_client').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_tenant_client_uq').on(t.tenantId, t.clientId),
    index('conversations_tenant_last_idx').on(t.tenantId, t.lastMessageAt),
    uniqueIndex('conversations_tenant_id_uq').on(t.tenantId, t.id),
    foreignKey({
      name: 'conversations_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    check('conversations_kind_client_ck', sql`(${t.kind} = 'internal') = (${t.clientId} is null)`),
    ...tenantGuard('conversations', T(t.tenantId)),
    ...allow('conversations_staff_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('conversations_staff_internal', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null and ${t.kind} = 'internal'`),
    ...allow('conversations_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

export type MessageAttachment = { mediaId: string; kind: 'photo' | 'video' | 'file' | 'voice'; name?: string; durationSec?: number };

/** doc §5.2, §8: messages policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    clientId: uuid('client_id'),
    senderUserId: uuid('sender_user_id').notNull(),
    senderRole: text('sender_role').notNull(),
    body: text('body'),
    attachments: jsonb('attachments').$type<MessageAttachment[]>().notNull().default([]),
    /** Quick-reply / template id when the coach used one. */
    templateKey: text('template_key'),
    replyToId: uuid('reply_to_id'),
    clientUuid: uuid('client_uuid').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    readByClientAt: timestamp('read_by_client_at', { withTimezone: true }),
    readByCoachAt: timestamp('read_by_coach_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_client_uuid_uq').on(t.tenantId, t.senderUserId, t.clientUuid),
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_tenant_id_uq').on(t.tenantId, t.id),
    uniqueIndex('messages_tenant_conversation_id_uq').on(t.tenantId, t.conversationId, t.id),
    foreignKey({
      name: 'messages_conversation_fk',
      columns: [t.tenantId, t.conversationId],
      foreignColumns: [conversations.tenantId, conversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'messages_reply_fk',
      columns: [t.tenantId, t.conversationId, t.replyToId],
      foreignColumns: [t.tenantId as AnyPgColumn, t.conversationId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    ...tenantGuard('messages', T(t.tenantId)),
    ...allow('messages_staff_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is not null and ${ACCESS(t.clientId)}`),
    ...allow('messages_staff_internal', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${t.clientId} is null`),
    ...allow('messages_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: notifications policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    clientId: uuid('client_id'),
    /** e.g. checkin_due, checkin_reviewed, message, payment_verified, subscription_expiring */
    type: text('type').notNull(),
    title: jsonb('title').$type<{ ar?: string; en?: string }>().notNull(),
    body: jsonb('body').$type<{ ar?: string; en?: string }>(),
    link: text('link'),
    /** Idempotency: one notification per (user, dedupe_key). */
    dedupeKey: text('dedupe_key'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_user_dedupe_uq').on(t.tenantId, t.userId, t.dedupeKey),
    index('notifications_user_unread_idx').on(t.tenantId, t.userId, t.readAt),
    uniqueIndex('notifications_tenant_id_uq').on(t.tenantId, t.id),
    index('notifications_tenant_client_idx').on(t.tenantId, t.clientId).where(sql`${t.clientId} is not null`),
    foreignKey({
      name: 'notifications_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    ...tenantGuard('notifications', T(t.tenantId)),
    ...allow('notifications_self', ['select', 'update', 'delete'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: notification_deliveries policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').notNull(),
    userId: uuid('user_id').notNull(),
    channel: notificationChannel('channel').notNull(),
    state: notificationDeliveryState('state').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    providerRef: text('provider_ref'),
    lastError: text('last_error'),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notification_deliveries_queue_idx').on(t.state, t.scheduledFor),
    index('notification_deliveries_notification_idx').on(t.notificationId),
    index('notification_deliveries_tenant_user_idx').on(t.tenantId, t.userId, t.createdAt.desc()),
    foreignKey({
      name: 'notification_deliveries_notification_fk',
      columns: [t.tenantId, t.notificationId],
      foreignColumns: [notifications.tenantId, notifications.id],
    }).onDelete('cascade'),
    ...tenantGuard('notification_deliveries', T(t.tenantId)),
    ...allow('notification_deliveries_self', ['select'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: push_subscriptions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').$type<{ p256dh: string; auth: string }>().notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('push_subscriptions_tenant_endpoint_uq').on(t.tenantId, t.endpoint),
    index('push_subscriptions_tenant_user_idx').on(t.tenantId, t.userId),
    check('push_subscriptions_endpoint_ck', sql`${t.endpoint} ~ '^https://'`),
    ...tenantGuard('push_subscriptions', T(t.tenantId)),
    ...allow('push_subscriptions_self', ['select', 'insert', 'update', 'delete'], sql`${T(t.tenantId)} and ${ME(t.userId)}`),
  ],
).enableRLS();

/** doc §9: message_revisions with the §5.2 visibility and §8 constraints. */
// 0006: messages_95_revision writes snapshots; runtime grants are SELECT-only, doc §7.4, §11.4.
export const messageRevisions = pgTable(
  'message_revisions',
  {
    id: uuid('id').notNull().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    messageId: uuid('message_id').notNull(),
    clientId: uuid('client_id'),
    body: text('body'),
    attachments: jsonb('attachments').$type<MessageAttachment[]>().notNull().default([]),
    revisedAt: timestamp('revised_at', { withTimezone: true }).notNull().defaultNow(),
    revisedBy: uuid('revised_by'),
  },
  (t) => [
    index('message_revisions_tenant_message_idx').on(t.tenantId, t.messageId, t.revisedAt),
    primaryKey({ name: 'message_revisions_pkey', columns: [t.id] }),
    foreignKey({
      name: 'message_revisions_tenant_fk',
      columns: [t.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'message_revisions_message_fk',
      columns: [t.tenantId, t.messageId],
      foreignColumns: [messages.tenantId, messages.id],
    }).onDelete('cascade'),
    ...tenantGuard('message_revisions', T(t.tenantId)),
    ...allow('message_revisions_member', ['select'], sql`${T(t.tenantId)} and exists (select 1 from public.messages m where m.id = ${t.messageId})`),
  ],
).enableRLS();
