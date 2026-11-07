import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { authenticated, clientPolicies, coachPrivatePolicies, tenantMatch, userOwnedPolicies } from './_rls';
import { conversationKind, notificationChannel, notificationDeliveryState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §20 (messaging), §21 (notification center), §31 (reminders delivery). */

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: conversationKind('kind').notNull().default('client'),
    /** 1:1 coach↔client threads carry the client; internal threads do not. */
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
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
    // Client threads: client + staff with access. Internal threads (client_id null): staff only.
    ...clientPolicies('conversations', t, { clientWrite: true }),
    ...coachPrivatePolicies('conversations_internal', { tenantId: t.tenantId }),
  ],
);

export type MessageAttachment = { mediaId: string; kind: 'photo' | 'video' | 'file' | 'voice'; name?: string; durationSec?: number };

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
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
    uniqueIndex('messages_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('messages_conversation_created_idx').on(t.conversationId, t.createdAt),
    ...clientPolicies('messages', t, { clientWrite: true }),
    ...coachPrivatePolicies('messages_internal', { tenantId: t.tenantId }),
  ],
);

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
    ...userOwnedPolicies('notifications', t),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
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
    pgPolicy('notification_deliveries_owner_select', {
      for: 'select',
      to: authenticated,
      using: sql`${tenantMatch(t.tenantId)} and ${t.userId} = (select app.uid())`,
    }),
  ],
);

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
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint), ...userOwnedPolicies('push_subscriptions', t)],
);
