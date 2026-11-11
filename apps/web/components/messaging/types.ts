/** Task 9: JSON shapes the messaging screens read from `/api/v1/conversations`. */
export type Attachment = { mediaId: string; kind: 'photo' | 'video' | 'file' | 'voice'; name?: string; durationSec?: number };

export type ThreadMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderRole: string;
  body: string | null;
  attachments: Attachment[];
  clientUuid: string;
  editedAt: string | null;
  deletedAt: string | null;
  readByClientAt: string | null;
  readByCoachAt: string | null;
  createdAt: string;
  mine: boolean;
};

export type MessagePage = { items: ThreadMessage[]; nextCursor: string | null };

export type ConversationHeader = { id: string; clientId: string | null; clientName: string | null };

export type InboxItem = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
};

export type InboxPage = { items: InboxItem[]; nextCursor: string | null };

export type ThreadData = { conversation: ConversationHeader; messages: MessagePage };

export type NotificationItem = {
  id: string;
  type: string;
  title: { ar?: string; en?: string };
  body: { ar?: string; en?: string } | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };

export type PreferencesData = {
  preferences: { locale?: 'ar' | 'en'; timezone?: string; quietHours?: { start: string; end: string }; channels?: Partial<Record<'inapp' | 'webpush' | 'email', boolean>> };
  effective: { channels: Record<'inapp' | 'webpush' | 'email', boolean> };
  pushPublicKey: string | null;
};
