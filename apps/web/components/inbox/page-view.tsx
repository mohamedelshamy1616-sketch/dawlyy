'use client';
import { Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@/i18n/navigation';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { QUEUE_KINDS, type QueueKind } from '@/src/server/dashboard/logic';
import { CountCards } from '@/components/dashboard/count-cards';
import { QueueList } from '@/components/dashboard/queue-list';
import type { CountItem, QueuePage } from '@/components/dashboard/types';
import type { NumeralSystem } from '@/src/lib/numbers';
import type { InboxData } from './types';
import { InboxList } from './inbox-list';

/** R1b: client presentation keeps all database and ranking code in the server page. */
export function InboxPageView({ title, noAccess = false, numerals = 'latn', data, queue, canViewQueues = false, queueDenied = false }: {
  title: string; noAccess?: boolean; numerals?: NumeralSystem; data?: InboxData | null;
  queue?: { kind: QueueKind; page: QueuePage; counts: CountItem[] } | null;
  canViewQueues?: boolean; queueDenied?: boolean;
}) {
  const t = useTranslations('inbox'); const dashboard = useTranslations('dashboard');
  return <VStack gap={6} className="min-w-0 max-w-full [overflow-wrap:anywhere]">
    <PageHeader title={title} subtitle={t('subtitle')} />
    {noAccess ? <EmptyState Icon={Inbox} title={t('noAccessTitle')} description={t('noAccessBody')} /> : <>
      {queue ? <VStack gap={4} className="min-w-0 max-w-full">
        <Link href="/coach" className="focus-ring inline-flex min-h-11 items-center self-start underline">{dashboard('queue.back')}</Link>
        <CountCards counts={queue.counts} />
        <Heading level={2}>{dashboard(`counts.${queue.kind}.label`)}</Heading>
        {queue.page.items.length ? <QueueList kind={queue.kind} initial={queue.page} /> : <EmptyState Icon={Inbox} title={dashboard('queue.emptyTitle')} description={dashboard('queue.emptyBody')} />}
      </VStack> : data ? <InboxList data={data} numerals={numerals} /> : null}
      {queueDenied ? <Text role="status">{t('queueAccess')}</Text> : null}
      {canViewQueues ? <VStack gap={1} as="section" aria-label={t('allQueues')}>
        <Heading level={2} className="text-base">{t('allQueues')}</Heading>
        <HStack gap={2} wrap="wrap">{QUEUE_KINDS.map(kind => <Link key={kind} href={`/coach?queue=${kind}`} className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2 text-sm underline">{dashboard(`counts.${kind}.label`)}</Link>)}</HStack>
      </VStack> : null}
    </>}
  </VStack>;
}
