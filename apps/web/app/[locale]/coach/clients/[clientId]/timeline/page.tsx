import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getClient } from '@/src/server/clients/service';
import { clientTimeline } from '@/src/server/dashboard/timeline';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { TimelineFeed } from '@/components/dashboard/timeline-feed';
import type { TimelinePage } from '@/components/dashboard/types';

/** Task 10: Client 360 timeline; a missing or out-of-scope client is a 404 page. */
export default async function ClientTimelinePage({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  await connection();
  const { locale, clientId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.string().uuid().safeParse(clientId).success) notFound();
  const t = await getTranslations('dashboard.timeline');
  if (!isAllowed(auth, 'dashboard', 'view')) notFound();
  const data = await withAuthTx(auth, async tx => ({
    client: await getClient(tx, auth, clientId),
    timeline: JSON.parse(JSON.stringify(await clientTimeline(tx, auth, clientId, {}))) as TimelinePage,
  })).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const name = data.client.displayName || [data.client.firstName, data.client.lastName].filter(Boolean).join(' ');
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 [overflow-wrap:anywhere]">
      <PageHeader title={`${t('title')}: ${name}`} subtitle={t('subtitle')} />
      <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${clientId}`}>{t('back')}</Link>
      {data.timeline.items.length === 0
        ? <EmptyState Icon={History} title={t('emptyTitle')} description={t('emptyBody')} />
        : <TimelineFeed clientId={clientId} initial={data.timeline} />}
    </div>
  );
}
