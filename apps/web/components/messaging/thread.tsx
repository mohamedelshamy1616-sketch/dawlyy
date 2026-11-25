'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { canEditMessage } from '@/src/server/messaging/logic';
import { dayKey } from '@/src/server/notify/logic';
import { requestJson } from './http';
import type { Attachment, MessagePage, ThreadData, ThreadMessage } from './types';
import { usePoll } from './use-poll';

type Pending = { clientUuid: string; body: string; status: 'sending' | 'failed'; createdAt: string };
type Editing = { id: string; text: string; busy: boolean };

const sortAscending = (a: ThreadMessage, b: ThreadMessage) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function Attachments({ attachments }: { attachments: Attachment[] }) {
  const t = useTranslations('messaging.thread');
  const [failed, setFailed] = useState(false);
  async function open(mediaId: string) {
    setFailed(false);
    try {
      const { url } = await requestJson<{ url: string }>(`/api/v1/media/${mediaId}/url`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setFailed(true); }
  }
  if (attachments.length === 0) return null;
  return (
    <VStack gap={1} className="min-w-0">
      {attachments.map(item => (
        <HStack key={item.mediaId} gap={2} align="center" wrap="wrap" className="min-w-0">
          <Text type="supporting" className="min-w-0 break-words">{item.name ?? t(`attachmentKinds.${item.kind}`)}</Text>
          <Button label={t('openAttachment')} className="min-h-11" onClick={() => void open(item.mediaId)} />
        </HStack>
      ))}
      {failed ? <Text role="alert" type="supporting">{t('attachmentError')}</Text> : null}
    </VStack>
  );
}

/**
 * Task 9: one coach-client thread. Bubbles sit at the start or end by sender, sending is optimistic and retry-safe
 * (the same `clientUuid` is reused, so a retry can never duplicate a message), and the list refreshes by polling.
 * `initial` is null on the client side until the first message creates the conversation.
 */
export function Thread({ initial, viewerRole, canSend, title, backHref, backLabel }: {
  initial: ThreadData | null; viewerRole: 'coach' | 'client'; canSend: boolean; title: string; backHref?: string; backLabel?: string;
}) {
  const t = useTranslations('messaging.thread'); const locale = useLocale();
  const [conversationId, setConversationId] = useState<string | null>(initial?.conversation.id ?? null);
  const [items, setItems] = useState<ThreadMessage[]>(initial?.messages.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initial?.messages.nextCursor ?? null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<'editError' | 'deleteError' | 'loadError' | 'openError' | null>(null);
  const [now, setNow] = useState(0);
  const marked = useRef(new Set<string>());
  const endRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => [...items].sort(sortAscending), [items]);

  const merge = useCallback((incoming: ThreadMessage[]) => {
    setItems(current => { const byId = new Map(current.map(item => [item.id, item])); for (const item of incoming) byId.set(item.id, item); return [...byId.values()]; });
    setPending(current => current.filter(entry => !incoming.some(item => item.clientUuid === entry.clientUuid)));
  }, []);

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0); const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [ordered.length, pending.length]);

  // Mark the other side's messages read once they are on screen.
  useEffect(() => {
    if (!conversationId) return;
    const unseen = ordered.filter(item => !item.mine && !(viewerRole === 'client' ? item.readByClientAt : item.readByCoachAt) && !marked.current.has(item.id));
    if (unseen.length === 0) return;
    for (const item of unseen) marked.current.add(item.id);
    void requestJson(`/api/v1/conversations/${conversationId}/read`, 'POST').catch(() => { for (const item of unseen) marked.current.delete(item.id); });
  }, [ordered, conversationId, viewerRole]);

  usePoll(async () => {
    if (!conversationId) return;
    try {
      merge((await requestJson<MessagePage>(`/api/v1/conversations/${conversationId}/messages?limit=30`)).items);
      setNotice(current => current === 'loadError' ? null : current);
    } catch (error) { setNotice('loadError'); throw error; }
  });

  const send = useCallback(async (text: string, clientUuid: string) => {
    setPending(current => current.some(entry => entry.clientUuid === clientUuid)
      ? current.map(entry => entry.clientUuid === clientUuid ? { ...entry, status: 'sending' as const } : entry)
      : [...current, { clientUuid, body: text, status: 'sending' as const, createdAt: new Date().toISOString() }]);
    try {
      let id = conversationId;
      if (!id) { id = (await requestJson<{ id: string }>('/api/v1/conversations', 'POST', {}, `open-${clientUuid}`)).id; setConversationId(id); }
      merge([await requestJson<ThreadMessage>(`/api/v1/conversations/${id}/messages`, 'POST', { body: text, clientUuid }, clientUuid)]);
    } catch {
      setPending(current => current.map(entry => entry.clientUuid === clientUuid ? { ...entry, status: 'failed' as const } : entry));
    }
  }, [conversationId, merge]);

  function submit() {
    const text = draft.trim();
    if (!text || !canSend) return;
    setDraft(''); void send(text, crypto.randomUUID());
  }

  async function saveEdit() {
    if (!editing || !conversationId || editing.busy || !editing.text.trim()) return;
    setEditing({ ...editing, busy: true }); setNotice(null);
    try {
      merge([await requestJson<ThreadMessage>(`/api/v1/conversations/${conversationId}/messages/${editing.id}`, 'PATCH', { body: editing.text })]);
      setEditing(null);
    } catch { setEditing({ ...editing, busy: false }); setNotice('editError'); }
  }

  async function remove(id: string) {
    if (!conversationId) return;
    setNotice(null);
    try {
      const done = await requestJson<{ id: string; deletedAt: string }>(`/api/v1/conversations/${conversationId}/messages/${id}`, 'DELETE');
      setItems(current => current.map(item => item.id === id ? { ...item, body: null, attachments: [], deletedAt: done.deletedAt } : item));
    } catch { setNotice('deleteError'); }
  }

  async function earlier() {
    if (!conversationId || !nextCursor) return;
    try {
      const older = await requestJson<MessagePage>(`/api/v1/conversations/${conversationId}/messages?limit=30&cursor=${encodeURIComponent(nextCursor)}`);
      merge(older.items); setNextCursor(older.nextCursor);
    } catch { setNotice('loadError'); }
  }

  const time = (value: string) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(value));
  const dayLabel = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
  const lastMine = [...ordered].reverse().find(item => item.mine && !item.deletedAt);
  const seen = (item: ThreadMessage) => viewerRole === 'client' ? item.readByCoachAt : item.readByClientAt;

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-3 [overflow-wrap:anywhere]">
      <VStack gap={1} className="min-w-0">
        {backHref ? <Link href={backHref} className="inline-flex min-h-11 items-center underline">{backLabel}</Link> : null}
        <Heading level={1}>{title}</Heading>
      </VStack>
      {nextCursor ? <Button label={t('loadEarlier')} className="min-h-11 self-center" onClick={() => void earlier()} /> : null}
      {ordered.length === 0 && pending.length === 0 ? (
        <VStack gap={1} className="rounded-2xl border border-dashed p-6 text-center">
          <Heading level={2}>{t('emptyTitle')}</Heading>
          <Text type="supporting">{t('emptyBody')}</Text>
        </VStack>
      ) : null}
      <ul className="m-0 flex min-w-0 list-none flex-col gap-2 p-0" aria-live="polite">
        {ordered.map((item, index) => {
          const previous = ordered[index - 1];
          const newDay = !previous || dayKey(previous.createdAt) !== dayKey(item.createdAt);
          const editable = item.mine && !item.deletedAt && now > 0 && canEditMessage(new Date(item.createdAt), new Date(now));
          const isEditing = editing?.id === item.id;
          return (
            <li key={item.id} className={`flex min-w-0 flex-col gap-1 ${item.mine ? 'items-end' : 'items-start'}`}>
              {newDay ? <Text type="supporting" className="w-full text-center"><span suppressHydrationWarning>{dayLabel(item.createdAt)}</span></Text> : null}
              <div className={`min-w-0 max-w-[85%] rounded-2xl px-3 py-2 ${item.mine ? 'bg-brand-soft' : 'border'}`}>
                {item.deletedAt ? <Text type="supporting" className="italic">{t('deleted')}</Text> : isEditing && editing ? (
                  <VStack gap={2} className="min-w-0">
                    <TextArea label={t('composerLabel')} isLabelHidden value={editing.text} rows={2} onChange={value => setEditing({ ...editing, text: value })} />
                    <HStack gap={2} wrap="wrap">
                      <Button label={t('saveEdit')} variant="primary" className="min-h-11" isDisabled={editing.busy || !editing.text.trim()} onClick={() => void saveEdit()} />
                      <Button label={t('cancelEdit')} className="min-h-11" onClick={() => setEditing(null)} />
                    </HStack>
                  </VStack>
                ) : (
                  <VStack gap={1} className="min-w-0">
                    {item.body ? <Text className="whitespace-pre-wrap break-words">{item.body}</Text> : null}
                    <Attachments attachments={item.attachments} />
                  </VStack>
                )}
              </div>
              <HStack gap={2} wrap="wrap" align="center" className="min-w-0">
                <Text type="supporting"><span suppressHydrationWarning>{time(item.createdAt)}</span></Text>
                {item.editedAt && !item.deletedAt ? <Text type="supporting">{t('edited')}</Text> : null}
                {item === lastMine && seen(item) ? <Text type="supporting">{t('seen')}</Text> : null}
                {editable && !isEditing ? (
                  <>
                    <Button label={t('edit')} className="min-h-11" onClick={() => setEditing({ id: item.id, text: item.body ?? '', busy: false })} />
                    <Button label={t('delete')} className="min-h-11" onClick={() => void remove(item.id)} />
                  </>
                ) : null}
              </HStack>
            </li>
          );
        })}
        {pending.map(entry => (
          <li key={entry.clientUuid} className="flex min-w-0 flex-col items-end gap-1">
            <div className="min-w-0 max-w-[85%] rounded-2xl bg-brand-soft px-3 py-2 opacity-70"><Text className="whitespace-pre-wrap break-words">{entry.body}</Text></div>
            <HStack gap={2} wrap="wrap" align="center">
              <Text type="supporting" role={entry.status === 'failed' ? 'alert' : 'status'}>{entry.status === 'failed' ? t('failed') : t('sending')}</Text>
              {entry.status === 'failed' ? <Button label={t('retry')} className="min-h-11" onClick={() => void send(entry.body, entry.clientUuid)} /> : null}
            </HStack>
          </li>
        ))}
      </ul>
      <div ref={endRef} />
      {notice ? <Text role="alert" type="supporting">{t(notice)}</Text> : null}
      {canSend ? (
        <div className="sticky [inset-block-end:calc(4rem+env(safe-area-inset-bottom))] md:[inset-block-end:0] z-10 min-w-0 bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <HStack gap={2} align="end" className="min-w-0">
            <div className="min-w-0 flex-1">
              <TextArea label={t('composerLabel')} isLabelHidden placeholder={t('composerPlaceholder')} value={draft} rows={2} onChange={setDraft} />
            </div>
            <Button label={t('send')} variant="primary" className="min-h-11" isDisabled={!draft.trim()} onClick={submit} />
          </HStack>
        </div>
      ) : null}
    </section>
  );
}
