import { z } from '@hono/zod-openapi';
import { isValidTimeZone, parseClock } from '../notify/logic';

/** Task 9: request schemas for the conversations and notifications routers. */

const flag = z.enum(['true', 'false']).transform(value => value === 'true');

export const idParams = z.object({ id: z.uuid() });
export const messageParams = z.object({ id: z.uuid(), messageId: z.uuid() });

export const inboxQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional(), unread: flag.optional(), clientId: z.uuid().optional() });
export const messagesQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional() });
export const notificationsQuery = z.object({ limit: z.string().optional(), cursor: z.string().optional(), unread: flag.optional() });

export const openConversationBody = z.object({ clientId: z.uuid().optional() }).strict();

/** `body` or `mediaIds` must be present; that rule is checked by the service so it answers 422, not 400. */
export const sendMessageBody = z.object({
  body: z.string().max(4000).optional(),
  mediaIds: z.array(z.uuid()).max(10).optional(),
  replyToId: z.uuid().optional(),
  clientUuid: z.uuid(),
}).strict();

export const editMessageBody = z.object({ body: z.string().max(4000) }).strict();

const clock = z.string().refine(value => parseClock(value) !== null, 'Use HH:MM');
export const preferencesBody = z.object({
  locale: z.enum(['ar', 'en']).nullable().optional(),
  timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').nullable().optional(),
  quietHours: z.object({ start: clock, end: clock }).strict().nullable().optional(),
  channels: z.object({ inapp: z.boolean().optional(), webpush: z.boolean().optional(), email: z.boolean().optional() }).strict().optional(),
}).strict();

/** The https rule is enforced by the service so a plain-http endpoint answers 422, not 400. */
export const pushSubscriptionBody = z.object({
  endpoint: z.string().min(1).max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }).strict(),
  userAgent: z.string().max(512).optional(),
}).strict();

export type SendMessageInput = z.infer<typeof sendMessageBody>;
