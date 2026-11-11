'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import type { QueueKind } from '@/src/server/dashboard/logic';
import { formatDate, sendJson } from './format';
import type { QueueItem, QueuePage } from './types';

/** Task 10: the rows behind one dashboard count, with keyset "show more". */
export function QueueList({ kind, initial }: { kind: QueueKind; initial: QueuePage }) {
  const t = useTranslations('dashboard.queue'); const locale = useLocale();
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  async function more() {
    if (!data.nextCursor || busy) return;
    setBusy(true); setFailed(false);
    try {
      const next = await sendJson<QueuePage>(`/api/v1/dashboard/queue/${kind}?cursor=${encodeURIComponent(data.nextCursor)}`, 'GET');
      setData(current => ({ items: [...current.items, ...next.items.filter(row => !current.items.some(known => known.id === row.id))], nextCursor: next.nextCursor }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  const detail = (row: QueueItem) => kind === 'expiring_subscriptions' ? formatDate(row.label, locale) : kind === 'pending_payments' ? (row.label ?? '') : formatDate(row.at, locale);
  return (
    <VStack gap={3} as="section" className="min-w-0 max-w-full">
      <ul className="m-0 min-w-0 list-none p-0">
        {data.items.map(row => (
          <li key={row.id} className="min-w-0 border-b">
            <Link href={row.href} className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <VStack gap={0.5} className="min-w-0">
                <Text weight="semibold" className="break-words">{row.clientName ?? row.clientCode}</Text>
                <Text type="supporting" size="xsm">{row.clientCode}</Text>
              </VStack>
              <Text type="supporting" className="break-words">{detail(row)}</Text>
            </Link>
          </li>
        ))}
      </ul>
      <HStack gap={3} wrap="wrap">
        {data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}
        {failed ? <Text role="alert">{t('loadError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
