'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { requestJson } from './http';
import type { InboxPage } from './types';
import { usePoll } from './use-poll';

/** Task 9: the coach inbox: last-message order, unread badges, an unread filter, and a 15 s refresh. */
export function Inbox({ initial }: { initial: InboxPage }) {
  const t = useTranslations('messaging.inbox'); const locale = useLocale();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [data, setData] = useState<InboxPage>(initial);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const query = (extra = '') => `/api/v1/conversations?limit=30${unreadOnly ? '&unread=true' : ''}${extra}`;

  async function reload(only: boolean) {
    setBusy(true); setFailed(false);
    try { setData(await requestJson<InboxPage>(`/api/v1/conversations?limit=30${only ? '&unread=true' : ''}`)); }
    catch { setFailed(true); } finally { setBusy(false); }
  }
  function choose(only: boolean) { setUnreadOnly(only); void reload(only); }

  usePoll(async () => {
    try { setData(await requestJson<InboxPage>(query())); setFailed(false); }
    catch (error) { setFailed(true); throw error; }
  });

  async function more() {
    if (!data.nextCursor || busy) return;
    setBusy(true);
    try {
      const next = await requestJson<InboxPage>(query(`&cursor=${encodeURIComponent(data.nextCursor)}`));
      setData(current => ({ items: [...current.items, ...next.items.filter(row => !current.items.some(known => known.id === row.id))], nextCursor: next.nextCursor }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }

  const when = (value: string | null) => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
  return (
    <VStack gap={4} className="min-w-0 max-w-full">
      <HStack as="nav" gap={2} wrap="wrap" aria-label={t('filterLabel')}>
        <Button label={t('all')} variant={unreadOnly ? 'secondary' : 'primary'} aria-pressed={!unreadOnly} className="min-h-11" onClick={() => choose(false)} />
        <Button label={t('unread')} variant={unreadOnly ? 'primary' : 'secondary'} aria-pressed={unreadOnly} className="min-h-11" onClick={() => choose(true)} />
      </HStack>
      {data.items.length === 0 ? (
        <VStack gap={1} className="rounded-2xl border border-dashed p-6 text-center">
          <Heading level={2}>{unreadOnly ? t('emptyUnreadTitle') : t('emptyTitle')}</Heading>
          <Text type="supporting">{unreadOnly ? t('emptyUnreadBody') : t('emptyBody')}</Text>
        </VStack>
      ) : (
        <ul className="m-0 flex min-w-0 list-none flex-col p-0">
          {data.items.map(item => (
            <li key={item.id} className="min-w-0 border-b">
              <Link href={`/coach/messages/${item.id}`} className="flex min-h-14 min-w-0 flex-col gap-1 py-3">
                <HStack gap={2} align="center" wrap="wrap" className="min-w-0">
                  <Text weight="semibold" className="min-w-0 break-words">{item.clientName ?? t('unnamedClient')}</Text>
                  {item.unread > 0 ? <Badge label={t('unreadCount', { count: item.unread })} variant="blue" /> : null}
                </HStack>
                <Text type="supporting" className="min-w-0 break-words">{item.lastMessagePreview || t('noPreview')}</Text>
                <Text type="supporting"><span suppressHydrationWarning>{when(item.lastMessageAt)}</span></Text>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <HStack gap={3} wrap="wrap">
        {data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}
        {failed ? <Text role="alert" type="supporting">{t('loadError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
