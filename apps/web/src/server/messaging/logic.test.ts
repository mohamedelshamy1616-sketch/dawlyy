import { describe, expect, it } from 'vitest';
import { EDIT_WINDOW_MS, canEditMessage, maskDeleted, messagePreview } from './logic';

describe('Task 9 messaging rules', () => {
  const sent = new Date('2026-11-11T10:00:00Z');

  it('allows edits for exactly 15 minutes', () => {
    expect(EDIT_WINDOW_MS).toBe(900_000);
    expect(canEditMessage(sent, new Date(sent.getTime() + 899_000))).toBe(true);
    expect(canEditMessage(sent, new Date(sent.getTime() + EDIT_WINDOW_MS))).toBe(true);
    expect(canEditMessage(sent, new Date(sent.getTime() + EDIT_WINDOW_MS + 1))).toBe(false);
  });

  it('previews text, truncates long text and falls back to an attachment label', () => {
    expect(messagePreview('  hello  ', 0)).toEqual({ ar: 'hello', en: 'hello' });
    expect(messagePreview('x'.repeat(300), 0).en).toHaveLength(140);
    expect(messagePreview(null, 2).en).toBe('New attachment');
    expect(messagePreview('', 0)).toEqual({ ar: '', en: '' });
  });

  it('hides the content of a deleted message but keeps its metadata', () => {
    const deleted = maskDeleted({ id: 'm', body: 'secret', attachments: [{ mediaId: 'x' }], deletedAt: new Date() });
    expect(deleted.body).toBeNull();
    expect(deleted.attachments).toEqual([]);
    expect(deleted.id).toBe('m');
    const live = { id: 'm', body: 'hi', attachments: [], deletedAt: null };
    expect(maskDeleted(live)).toBe(live);
  });
});
