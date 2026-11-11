/** Task 9: pure messaging rules, tested without a database. */

/** A sender may edit their message for 15 minutes after sending (build plan Task 9). */
export const EDIT_WINDOW_MS = 15 * 60_000;

/** Task 9: true while the edit window is open. */
export function canEditMessage(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= EDIT_WINDOW_MS;
}

/** Task 9: the one-line preview used in the in-app notification. Text first, then an attachment label. */
export function messagePreview(body: string | null | undefined, attachmentCount: number): { ar: string; en: string } {
  const text = body?.trim();
  if (text) { const cut = text.length > 140 ? `${text.slice(0, 137)}...` : text; return { ar: cut, en: cut }; }
  if (attachmentCount > 0) return { ar: 'مرفق جديد', en: 'New attachment' };
  return { ar: '', en: '' };
}

/** Task 9: the timestamp a deleted message shows instead of its content. */
export function maskDeleted<T extends { deletedAt: Date | null; body: string | null; attachments: unknown[] }>(row: T): T {
  return row.deletedAt ? { ...row, body: null, attachments: [] } : row;
}

/** Task 9: drop the keyset helper column from a page row before it leaves the service. */
export function dropSortKey<T extends { sortKey: string }>(row: T): Omit<T, 'sortKey'> {
  const { sortKey, ...rest } = row;
  void sortKey;
  return rest;
}
