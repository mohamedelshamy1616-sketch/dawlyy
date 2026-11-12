import 'server-only';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { isAllowed } from '@dawlyy/core/authz';
import { clientColumns } from '@dawlyy/db';
import { clients, conversations, media, memberships, messages, notifications, staffClientAssignments } from '@dawlyy/db/schema';
import type { MessageAttachment } from '@dawlyy/db/schema';
import { forbidden, notFound, unprocessable } from '@/src/api/errors';
import { page, parseListQuery } from '@/src/api/lib/pagination';
import { withServiceTx, type AuthContext, type Tx } from '../db';
import { notify } from '../notify/notify';
import { requirePermission } from '../require-permission';
import { EDIT_WINDOW_MS, canEditMessage, dropSortKey, maskDeleted, messagePreview } from './logic';
import type { SendMessageInput } from './schemas';

/** Task 9: conversation and message services. Every query runs in the caller's `withAuthTx`; RLS decides visibility. */

const conversationFields = clientColumns.conversations;
const messageFields = clientColumns.messages;
const sortKey = sql`coalesce(${clientColumns.conversations.lastMessageAt}, ${clientColumns.conversations.createdAt})`;

export type ListQuery = { limit?: string; cursor?: string };

/** Task 9: the coach inbox (by last message, optional unread and client filters) or the client's own single thread. */
export async function listConversations(tx: Tx, auth: AuthContext, query: ListQuery & { unread?: boolean | undefined; clientId?: string | undefined }) {
  requirePermission(auth, 'messages', 'view');
  const { limit, cursor } = parseListQuery(query);
  const unreadColumn = auth.role === 'client' ? conversations.unreadForClient : conversations.unreadForCoach;
  const rows = await tx.select({
    ...conversationFields,
    sortKey: sql<string>`${sortKey}::text`,
    clientDisplayName: clientColumns.clients.displayName,
    clientFirstName: clientColumns.clients.firstName,
    clientLastName: clientColumns.clients.lastName,
  }).from(conversations)
    .leftJoin(clients, and(eq(clients.tenantId, conversations.tenantId), eq(clients.id, conversations.clientId)))
    .where(and(
      eq(conversations.tenantId, auth.tenantId), eq(conversations.kind, 'client'),
      ...(query.clientId ? [eq(conversations.clientId, query.clientId)] : []),
      ...(query.unread ? [sql`${unreadColumn} > 0`] : []),
      ...(cursor ? [sql`(${sortKey}, ${conversations.id}) < (${String(cursor.k)}::timestamptz, ${cursor.id}::uuid)`] : []),
    ))
    .orderBy(desc(sortKey), desc(conversations.id)).limit(limit + 1);
  const result = page(rows.map(row => ({ ...row, id: row.id })), limit, row => row.sortKey);
  return {
    items: result.items.map(dropSortKey).map(({ clientDisplayName, clientFirstName, clientLastName, ...row }) => ({
      ...row,
      unread: auth.role === 'client' ? row.unreadForClient : row.unreadForCoach,
      clientName: clientDisplayName ?? ([clientFirstName, clientLastName].filter(Boolean).join(' ') || null),
    })),
    nextCursor: result.nextCursor,
  };
}

/** Task 9: one conversation with the client's display name, for the thread header. 404 when RLS hides it. */
export async function getConversationHeader(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'messages', 'view');
  const [row] = await tx.select({
    ...conversationFields,
    clientDisplayName: clientColumns.clients.displayName,
    clientFirstName: clientColumns.clients.firstName,
    clientLastName: clientColumns.clients.lastName,
  }).from(conversations)
    .leftJoin(clients, and(eq(clients.tenantId, conversations.tenantId), eq(clients.id, conversations.clientId)))
    .where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.id, id), eq(conversations.kind, 'client'))).limit(1);
  if (!row) throw notFound('Conversation not found');
  const { clientDisplayName, clientFirstName, clientLastName, ...conversation } = row;
  return { ...conversation, clientName: clientDisplayName ?? ([clientFirstName, clientLastName].filter(Boolean).join(' ') || null) };
}

/** Task 9: open the 1:1 conversation with a client, or return the existing one. Clients can only open their own. */
export async function openConversation(tx: Tx, auth: AuthContext, requestedClientId: string | undefined) {
  requirePermission(auth, 'messages', 'create');
  let clientId = requestedClientId;
  if (auth.role === 'client') {
    if (!auth.clientId) throw forbidden();
    if (clientId && clientId !== auth.clientId) throw forbidden();
    clientId = auth.clientId;
  }
  if (!clientId) throw unprocessable('client_required', 'A client is required to open a conversation');
  const existing = () => tx.select(conversationFields).from(conversations).where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.clientId, clientId))).limit(1);
  const [found] = await existing();
  if (found) return { conversation: found, created: false };
  const [client] = await tx.select({ id: clientColumns.clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
  if (!client) throw notFound('Client not found');
  const [inserted] = await tx.insert(conversations).values({ tenantId: auth.tenantId, clientId, kind: 'client' })
    .onConflictDoNothing({ target: [conversations.tenantId, conversations.clientId] }).returning(conversationFields);
  if (inserted) return { conversation: inserted, created: true };
  const [raced] = await existing();
  if (!raced) throw notFound();
  return { conversation: raced, created: false };
}

async function requireConversation(tx: Tx, auth: AuthContext, id: string) {
  const [conversation] = await tx.select(conversationFields).from(conversations)
    .where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.id, id), eq(conversations.kind, 'client'))).limit(1);
  if (!conversation) throw notFound('Conversation not found');
  return conversation;
}

/** Task 9: messages of a conversation, newest first, keyset by `(created_at, id)`. Deleted messages lose their content. */
export async function listMessages(tx: Tx, auth: AuthContext, conversationId: string, query: ListQuery) {
  requirePermission(auth, 'messages', 'view');
  const { limit, cursor } = parseListQuery(query);
  await requireConversation(tx, auth, conversationId);
  const rows = await tx.select({ ...messageFields, sortKey: sql<string>`${clientColumns.messages.createdAt}::text` }).from(messages)
    .where(and(
      eq(messages.tenantId, auth.tenantId), eq(messages.conversationId, conversationId),
      ...(cursor ? [sql`(${messages.createdAt}, ${messages.id}) < (${String(cursor.k)}::timestamptz, ${cursor.id}::uuid)`] : []),
    ))
    .orderBy(desc(messages.createdAt), desc(messages.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.sortKey);
  return {
    items: result.items.map(dropSortKey).map(row => ({ ...maskDeleted(row), mine: row.senderUserId === auth.userId })),
    nextCursor: result.nextCursor,
  };
}

async function attachmentsFor(tx: Tx, auth: AuthContext, clientId: string | null, mediaIds: readonly string[]): Promise<MessageAttachment[]> {
  if (mediaIds.length === 0) return [];
  const unique = [...new Set(mediaIds)];
  const rows = await tx.select({ id: clientColumns.media.id, kind: clientColumns.media.kind, durationSec: clientColumns.media.durationSec, metadata: clientColumns.media.metadata })
    .from(media).where(and(eq(media.tenantId, auth.tenantId), inArray(media.id, unique), isNull(media.deletedAt), clientId ? eq(media.clientId, clientId) : sql`false`));
  if (rows.length !== unique.length) throw unprocessable('invalid_attachment', 'An attachment does not exist or does not belong to this client');
  return unique.map((id) => {
    const row = rows.find(candidate => candidate.id === id);
    if (!row) throw unprocessable('invalid_attachment');
    const name = typeof row.metadata?.name === 'string' ? row.metadata.name : undefined;
    return { mediaId: row.id, kind: row.kind, ...(name ? { name } : {}), ...(row.durationSec ? { durationSec: row.durationSec } : {}) };
  });
}

/**
 * Task 9: send a message. The same `clientUuid` from the same sender returns the first message and creates nothing.
 * Emits the `message.sent` event (doc section 9.2) once. Notifications are queued by `notifyMessage` after this commits.
 */
export async function sendMessage(tx: Tx, auth: AuthContext, conversationId: string, input: SendMessageInput) {
  requirePermission(auth, 'messages', 'create');
  const conversation = await requireConversation(tx, auth, conversationId);
  const body = input.body?.trim() || null;
  if (!body && (input.mediaIds?.length ?? 0) === 0) throw unprocessable('empty_message', 'A message needs text or an attachment');
  const prior = () => tx.select(messageFields).from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.senderUserId, auth.userId), eq(messages.clientUuid, input.clientUuid))).limit(1);
  const [replay] = await prior();
  if (replay) {
    if (replay.conversationId !== conversationId) throw unprocessable('client_uuid_reused', 'This clientUuid was used in another conversation');
    return { conversation, message: replay, created: false };
  }
  const attachments = await attachmentsFor(tx, auth, conversation.clientId, input.mediaIds ?? []);
  const [inserted] = await tx.insert(messages).values({
    tenantId: auth.tenantId, conversationId, senderUserId: auth.userId, senderRole: auth.role, body, attachments,
    replyToId: input.replyToId ?? null, clientUuid: input.clientUuid,
  }).onConflictDoNothing({ target: [messages.tenantId, messages.senderUserId, messages.clientUuid] }).returning(messageFields);
  if (!inserted) {
    const [raced] = await prior();
    if (!raced) throw notFound();
    return { conversation, message: raced, created: false };
  }
  await tx.execute(sql`select app.emit_event('message.sent', 'messages', ${inserted.id})`);
  return { conversation, message: inserted, created: true };
}

/** Task 9: edit the sender's own message within 15 minutes; the database keeps the old text in `message_revisions`. */
export async function editMessage(tx: Tx, auth: AuthContext, conversationId: string, messageId: string, bodyInput: string, now = new Date()) {
  requirePermission(auth, 'messages', 'create');
  await requireConversation(tx, auth, conversationId);
  const [current] = await tx.select(messageFields).from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.conversationId, conversationId), eq(messages.id, messageId))).limit(1);
  if (!current) throw notFound('Message not found');
  if (current.senderUserId !== auth.userId) throw forbidden();
  if (current.deletedAt) throw unprocessable('message_deleted', 'A deleted message cannot be edited');
  if (!canEditMessage(current.createdAt, now)) throw unprocessable('edit_window_closed', `A message can only be edited for ${EDIT_WINDOW_MS / 60_000} minutes`);
  const body = bodyInput.trim() || null;
  if (!body && current.attachments.length === 0) throw unprocessable('empty_message', 'A message needs text or an attachment');
  if (body === current.body) return { ...current, mine: true };
  const [updated] = await tx.update(messages).set({ body }).where(and(eq(messages.tenantId, auth.tenantId), eq(messages.id, messageId))).returning(messageFields);
  if (!updated) throw notFound();
  return { ...updated, mine: true };
}

/** Task 9: soft delete of the sender's own message; the row and its revisions stay for the record. */
export async function deleteMessage(tx: Tx, auth: AuthContext, conversationId: string, messageId: string) {
  requirePermission(auth, 'messages', 'create');
  await requireConversation(tx, auth, conversationId);
  const [current] = await tx.select(messageFields).from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.conversationId, conversationId), eq(messages.id, messageId))).limit(1);
  if (!current) throw notFound('Message not found');
  if (current.senderUserId !== auth.userId) throw forbidden();
  if (current.deletedAt) return { id: current.id, deletedAt: current.deletedAt };
  const [deleted] = await tx.update(messages).set({ deletedAt: sql`now()` }).where(and(eq(messages.tenantId, auth.tenantId), eq(messages.id, messageId))).returning({ id: messages.id, deletedAt: messages.deletedAt });
  if (!deleted) throw notFound();
  return deleted;
}

/** Task 9: mark the other side's messages read, zero the caller's unread counter and clear the matching in-app notifications. */
export async function markConversationRead(tx: Tx, auth: AuthContext, conversationId: string) {
  requirePermission(auth, 'messages', 'view');
  await requireConversation(tx, auth, conversationId);
  const asClient = auth.role === 'client';
  const touched = await tx.update(messages).set(asClient ? { readByClientAt: sql`now()` } : { readByCoachAt: sql`now()` })
    .where(and(
      eq(messages.tenantId, auth.tenantId), eq(messages.conversationId, conversationId),
      asClient ? and(isNull(messages.readByClientAt), ne(messages.senderRole, 'client')) : and(isNull(messages.readByCoachAt), eq(messages.senderRole, 'client')),
    )).returning({ id: messages.id });
  await tx.update(conversations).set(asClient ? { unreadForClient: 0 } : { unreadForCoach: 0 })
    .where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.id, conversationId)));
  await tx.update(notifications).set({ readAt: sql`now()` })
    .where(and(eq(notifications.tenantId, auth.tenantId), eq(notifications.userId, auth.userId), eq(notifications.type, 'message'), isNull(notifications.readAt),
      sql`${notifications.payload}->>'conversationId' = ${conversationId}`));
  return { conversationId, markedMessages: touched.length, unread: 0 };
}

/**
 * Task 9: after a message commits, create one in-app notification and queue the email (and push) rows for every recipient.
 * Runs in a service transaction because the runtime role cannot insert notifications (doc section 12.1, build rule 6).
 * Idempotent per message: the dedupe key is the message id, so a retry with the same `clientUuid` adds nothing.
 * Recipients: a coach message goes to the client's login; a client message goes to the owner(s) and every staff member
 * with messages access to that client (all-client scope, or assigned).
 */
export async function notifyMessage(auth: AuthContext, conversation: { id: string; clientId: string | null }, message: { id: string; body: string | null; attachments: readonly unknown[] }): Promise<number> {
  if (!conversation.clientId) return 0;
  const clientId = conversation.clientId;
  return withServiceTx(auth.tenantId, 'messaging: notify message recipients', async (tx) => {
    const members = await tx.select({ id: clientColumns.memberships.id, userId: clientColumns.memberships.userId, role: clientColumns.memberships.role, permissions: clientColumns.memberships.permissions, displayName: clientColumns.memberships.displayName, clientId: clientColumns.memberships.clientId })
      .from(memberships).where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.status, 'active')));
    const sender = members.find(member => member.userId === auth.userId);
    let senderName = sender?.displayName ?? null;
    if (auth.role === 'client' && !senderName) {
      const [client] = await tx.select({ displayName: clientColumns.clients.displayName, firstName: clientColumns.clients.firstName }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
      senderName = client?.displayName ?? client?.firstName ?? null;
    }
    const assigned = new Set((await tx.select({ membershipId: clientColumns.staffClientAssignments.membershipId }).from(staffClientAssignments)
      .where(and(eq(staffClientAssignments.tenantId, auth.tenantId), eq(staffClientAssignments.clientId, clientId)))).map(row => row.membershipId));
    const recipients = auth.role === 'client'
      ? members.filter(member => member.userId !== auth.userId && (member.role === 'owner'
        || (member.role === 'staff' && isAllowed({ role: 'staff', permissions: member.permissions }, 'messages', 'view', { clientId, assignedClientIds: assigned.has(member.id) ? [clientId] : [] }))))
      : members.filter(member => member.role === 'client' && member.clientId === clientId && member.userId !== auth.userId);
    const name = senderName ?? 'DAWLYY';
    let count = 0;
    for (const recipient of recipients) {
      const toClient = recipient.role === 'client';
      await notify(tx, {
        tenantId: auth.tenantId, userId: recipient.userId, clientId, type: 'message',
        title: { ar: `رسالة جديدة من ${name}`, en: `New message from ${name}` },
        body: messagePreview(message.body, message.attachments.length),
        link: toClient ? '/app/messages' : `/coach/messages/${conversation.id}`,
        dedupeKey: `message:${message.id}`,
        payload: { conversationId: conversation.id, messageId: message.id, shareBody: false },
      });
      count += 1;
    }
    return count;
  });
}
