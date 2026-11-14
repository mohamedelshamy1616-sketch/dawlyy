import type { AttentionItem } from '@dawlyy/core/attention';

/** R1b: serializable staff inbox rows, with an exact destination or a conversation-opening action. */
export type InboxItem = Omit<AttentionItem, 'clientId'> & {
  client: { id: string; displayName: string; code: string; avatarMediaId?: string };
  actionHref: string | null;
};
/** R1b: API/page payload uses the tenant-local calendar date. */
export type InboxData = { items: InboxItem[]; today: string };
