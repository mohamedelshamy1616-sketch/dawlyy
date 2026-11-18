import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listInbox } from '@/src/server/inbox/service';
import { numeralPolicy } from '@/src/lib/numbers';
import { getPreferences } from '@/src/server/settings/client-read';
import { QUEUE_KINDS } from '@/src/server/dashboard/logic';
import { dashboardQueue, dashboardSummary } from '@/src/server/dashboard/queue';
import { InboxPageView } from '@/components/inbox/page-view';
import type { QueuePage } from '@/components/dashboard/types';

/** R1b: ranked inbox; existing count cards and queues remain available through ?queue=. */
export default async function CoachInboxPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('inbox');
  if (!isAllowed(auth, 'clients', 'view')) return <InboxPageView title={t('title')} noAccess />;
  const raw = (await searchParams).queue;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const kind = QUEUE_KINDS.find(value => value === requested);
  const canViewQueues = isAllowed(auth, 'dashboard', 'view');
  const data = await withAuthTx(auth, async tx => {
    if (kind && canViewQueues) {
      const summary = await dashboardSummary(tx, auth);
      const queue = JSON.parse(JSON.stringify(await dashboardQueue(tx, auth, kind, {}))) as QueuePage;
      return { inbox: null, numerals: numeralPolicy(await getPreferences(tx, auth)), queue: { kind, page: queue, counts: QUEUE_KINDS.map(value => ({ kind: value, ...summary.counts[value] })) } };
    }
    return { inbox: await listInbox(tx, auth), numerals: numeralPolicy(await getPreferences(tx, auth)), queue: null };
  });
  return <InboxPageView title={t('title')} numerals={data.numerals} data={data.inbox} queue={data.queue} canViewQueues={canViewQueues} queueDenied={Boolean(kind && !canViewQueues)} />;
}
