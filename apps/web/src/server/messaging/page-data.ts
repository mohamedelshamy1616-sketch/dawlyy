import 'server-only';
import { ApiError } from '@/src/api/errors';
import { withAuthTx, type AuthContext } from '../db';
import { getPreferences, listNotifications } from '../notify/center';
import type { InboxPage, NotificationPage, PreferencesData, ThreadData } from '@/components/messaging/types';
import { getConversationHeader, listConversations, listMessages } from './service';

/** JSON round trip: Dates become ISO strings, exactly what the API would send. */
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

/** Task 9: first page of the coach inbox. */
export async function inboxPageData(auth: AuthContext): Promise<InboxPage> {
  return plain<InboxPage>(await withAuthTx(auth, tx => listConversations(tx, auth, { limit: '30' })));
}

/** Task 9: a conversation header and the newest messages; null when the caller cannot see it. */
export async function threadPageData(auth: AuthContext, conversationId: string): Promise<ThreadData | null> {
  try {
    return plain<ThreadData>(await withAuthTx(auth, async tx => ({
      conversation: await getConversationHeader(tx, auth, conversationId),
      messages: await listMessages(tx, auth, conversationId, { limit: '30' }),
    })));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Task 9: the client's own thread, if one exists yet (the first send creates it). */
export async function clientThreadPageData(auth: AuthContext): Promise<ThreadData | null> {
  const inbox = await withAuthTx(auth, tx => listConversations(tx, auth, { limit: '1' }));
  const first = inbox.items[0];
  return first ? threadPageData(auth, first.id) : null;
}

/** Task 9: notification center page: first page, unread count and the user's preferences. */
export async function notificationsPageData(auth: AuthContext): Promise<{ list: NotificationPage; preferences: PreferencesData }> {
  return plain<{ list: NotificationPage; preferences: PreferencesData }>(await withAuthTx(auth, async tx => ({
    list: await listNotifications(tx, auth, { limit: '30' }),
    preferences: await getPreferences(tx, auth),
  })));
}
