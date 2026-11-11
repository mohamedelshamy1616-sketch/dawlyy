'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { requestJson } from '@/components/messaging/http';
import type { NotificationItem, NotificationPage } from '@/components/messaging/types';
import { usePoll } from '@/components/messaging/use-poll';
import { dayKey, groupByDay } from '@/src/server/notify/logic';

/** Task 9: the notification center: grouped by day, newest first, mark one or all read, refreshed every 15 s. */
export function NotificationCenter({ initial }: { initial: NotificationPage }) {
  const t = useTranslations('messaging.notifications'); const locale = useLocale();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setClock(Date.now()), 0); const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);
  const pick = (item: NotificationItem) => item.title[locale === 'ar' ? 'ar' : 'en'] ?? item.title.en ?? item.title.ar ?? '';
  const pickBody = (item: NotificationItem) => item.body?.[locale === 'ar' ? 'ar' : 'en'] ?? item.body?.en ?? item.body?.ar ?? '';

  usePoll(async () => {
    try {
      const fresh = await requestJson<NotificationPage>('/api/v1/notifications?limit=30');
      setData(current => ({ items: [...fresh.items, ...current.items.filter(old => !fresh.items.some(item => item.id === old.id) && old.createdAt < (fresh.items[fresh.items.length - 1]?.createdAt ?? ''))], nextCursor: current.nextCursor ?? fresh.nextCursor, unreadCount: fresh.unreadCount }));
      setFailed(false);
    } catch (error) { setFailed(true); throw error; }
  });

  function markLocal(id: string) {
    setData(current => current.items.find(item => item.id === id && !item.readAt)
      ? { ...current, unreadCount: Math.max(0, current.unreadCount - 1), items: current.items.map(item => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) }
      : current);
  }
  async function markRead(id: string) {
    markLocal(id);
    try { await requestJson(`/api/v1/notifications/${id}/read`, 'POST'); } catch { setFailed(true); }
  }
  async function markAll() {
    setBusy(true); setFailed(false);
    try {
      await requestJson('/api/v1/notifications/read-all', 'POST');
      const stamp = new Date().toISOString();
      setData(current => ({ ...current, unreadCount: 0, items: current.items.map(item => item.readAt ? item : { ...item, readAt: stamp }) }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  async function more() {
    if (!data.nextCursor || busy) return;
    setBusy(true); setFailed(false);
    try {
      const next = await requestJson<NotificationPage>(`/api/v1/notifications?limit=30&cursor=${encodeURIComponent(data.nextCursor)}`);
      setData(current => ({ ...current, items: [...current.items, ...next.items.filter(row => !current.items.some(known => known.id === row.id))], nextCursor: next.nextCursor }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }

  const today = clock ? dayKey(new Date(clock).toISOString()) : '';
  const yesterday = clock ? dayKey(new Date(clock - 86_400_000).toISOString()) : '';
  const label = (day: string) => day === today ? t('today') : day === yesterday ? t('yesterday') : new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date(`${day}T12:00:00`));
  const time = (value: string) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(value));

  return (
    <VStack gap={4} className="min-w-0 max-w-full">
      <HStack gap={3} wrap="wrap" align="center" className="min-w-0">
        <Text type="supporting" role="status">{t('unreadCount', { count: data.unreadCount })}</Text>
        <Button label={t('markAllRead')} className="min-h-11" isDisabled={busy || data.unreadCount === 0} onClick={() => void markAll()} />
      </HStack>
      {data.items.length === 0 ? (
        <VStack gap={1} className="rounded-2xl border border-dashed p-6 text-center">
          <Heading level={2}>{t('emptyTitle')}</Heading>
          <Text type="supporting">{t('emptyBody')}</Text>
        </VStack>
      ) : groupByDay(data.items).map(group => (
        <VStack as="section" key={group.day} gap={1} className="min-w-0">
          <Heading level={2}><span suppressHydrationWarning>{label(group.day)}</span></Heading>
          <ul className="m-0 flex min-w-0 list-none flex-col p-0">
            {group.items.map(item => {
              const unread = !item.readAt;
              const content = (
                <VStack gap={1} className="min-w-0">
                  <HStack gap={2} align="center" wrap="wrap" className="min-w-0">
                    {unread ? <Badge label={t('unreadMarker')} variant="blue" /> : null}
                    <Text weight={unread ? 'semibold' : 'normal'} className="min-w-0 break-words">{pick(item)}</Text>
                  </HStack>
                  {pickBody(item) ? <Text type="supporting" className="min-w-0 break-words">{pickBody(item)}</Text> : null}
                  <Text type="supporting"><span suppressHydrationWarning>{time(item.createdAt)}</span></Text>
                </VStack>
              );
              return (
                <li key={item.id} className="min-w-0 border-b py-3">
                  {item.link
                    ? <Link href={item.link} className="block min-h-11 min-w-0" onClick={() => { if (unread) void markRead(item.id); }}>{content}</Link>
                    : (
                      <VStack gap={2} className="min-w-0">
                        {content}
                        {unread ? <Button label={t('markRead')} className="min-h-11 self-start" onClick={() => void markRead(item.id)} /> : null}
                      </VStack>
                    )}
                </li>
              );
            })}
          </ul>
        </VStack>
      ))}
      <HStack gap={3} wrap="wrap">
        {data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}
        {failed ? <Text role="alert" type="supporting">{t('actionError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
