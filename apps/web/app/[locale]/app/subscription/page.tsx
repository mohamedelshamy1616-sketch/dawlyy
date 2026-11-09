import { getTranslations } from 'next-intl/server';
import { CalendarDays } from 'lucide-react';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { mySubscription } from '@/src/server/subscriptions/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { SubscriptionCountdown } from '@/components/billing/subscription-detail';

/** T3b / §30: client countdown remains reachable after access expires, through the mine service boundary. */
export default async function MySubscriptionPage() {
  const auth = await requirePage(); const t = await getTranslations('billing');
  const data = await withAuthTx(auth, (tx) => mySubscription(tx, auth));
  return <div className="min-w-0 space-y-6"><PageHeader title={t('mySubscription')} />
    {data.subscription && data.accessStatus ? <SubscriptionCountdown subscription={data.subscription} access={data.accessStatus} />
      : <EmptyState Icon={CalendarDays} title={t('emptySubscriptions')} description={t('contactCoach')} />}
  </div>;
}
