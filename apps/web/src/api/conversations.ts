import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { validationError } from './errors';
import { safeErrorMetadata } from './error-log';
import { withAuthTx, type AuthContext, type Tx } from '../server/db';
import { mapMessagingError } from '../server/messaging/errors';
import { editMessageBody, idParams, inboxQuery, messageParams, messagesQuery, openConversationBody, sendMessageBody } from '../server/messaging/schemas';
import { deleteMessage, editMessage, listConversations, listMessages, markConversationRead, notifyMessage, openConversation, sendMessage } from '../server/messaging/service';

/**
 * Task 9 / doc section 12.1: 1:1 coach-client conversations (module `messages`). RLS decides which threads a caller sees:
 * a client only their own, assigned-scope staff only their clients'. Mutations replay by `Idempotency-Key`, and sends also
 * dedupe by `clientUuid`.
 */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
router.use('*', idempotentReplay);

const json = { description: 'Messaging data', content: { 'application/json': { schema: z.unknown() } } };
const error = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: error, 401: error, 403: error, 404: error, 409: error, 422: error };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const tags = ['Conversations'];

async function transaction<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try { return await withAuthTx(auth, fn); }
  catch (failure) { throw mapMessagingError(failure); }
}

// Inbox. messages:view. 400 bad cursor, 401, 403.
router.openapi(createRoute({ method: 'get', path: '/', tags, request: { query: inboxQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listConversations(tx, auth, c.req.valid('query'))), 200);
});

// Open or return the 1:1 conversation. messages:create. 403 for a client naming another client, 404 unknown or out-of-scope client, 422 no client.
router.openapi(createRoute({ method: 'post', path: '/', tags, request: { body: body(openConversationBody) }, responses: { 200: json, 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  const result = await transaction(auth, tx => openConversation(tx, auth, c.req.valid('json').clientId));
  return result.created ? c.json(result.conversation, 201) : c.json(result.conversation, 200);
});

// Messages, newest first. messages:view. 404 for a conversation the caller cannot see.
router.openapi(createRoute({ method: 'get', path: '/{id}/messages', tags, request: { params: idParams, query: messagesQuery }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => listMessages(tx, auth, c.req.valid('param').id, c.req.valid('query'))), 200);
});

// Send. messages:create. 201 new, 200 when the clientUuid was already sent. 422 empty_message, invalid_attachment, client_uuid_reused.
router.openapi(createRoute({ method: 'post', path: '/{id}/messages', tags, request: { params: idParams, body: body(sendMessageBody) }, responses: { 200: json, 201: json, ...errors } }), async c => {
  const auth = c.get('auth');
  const result = await transaction(auth, tx => sendMessage(tx, auth, c.req.valid('param').id, c.req.valid('json')));
  // Idempotent per message id, so a retry also repairs a notification that failed after the message committed.
  let notified = true;
  try { await notifyMessage(auth, result.conversation, result.message); }
  catch (failure) {
    notified = false;
    console.error('Message notification failed', safeErrorMetadata(failure instanceof Error ? failure : new Error(), c.get('requestId') ?? 'unknown', c.req.routePath, 500));
  }
  return c.json({ ...result.message, mine: true, notified }, result.created ? 201 : 200);
});

// Edit own message within 15 minutes. messages:create. 403 not the sender, 404, 422 edit_window_closed, message_deleted, empty_message.
router.openapi(createRoute({ method: 'patch', path: '/{id}/messages/{messageId}', tags, request: { params: messageParams, body: body(editMessageBody) }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const { id, messageId } = c.req.valid('param');
  return c.json(await transaction(auth, tx => editMessage(tx, auth, id, messageId, c.req.valid('json').body)), 200);
});

// Soft delete of own message. messages:create. 403 not the sender, 404.
router.openapi(createRoute({ method: 'delete', path: '/{id}/messages/{messageId}', tags, request: { params: messageParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth'); const { id, messageId } = c.req.valid('param');
  return c.json(await transaction(auth, tx => deleteMessage(tx, auth, id, messageId)), 200);
});

// Read marker. messages:view. 404 for a conversation the caller cannot see.
router.openapi(createRoute({ method: 'post', path: '/{id}/read', tags, request: { params: idParams }, responses: { 200: json, ...errors } }), async c => {
  const auth = c.get('auth');
  return c.json(await transaction(auth, tx => markConversationRead(tx, auth, c.req.valid('param').id)), 200);
});
