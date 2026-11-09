import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CalendarDays } from 'lucide-react';
import { isAllowed } from '@dawlyy/core/authz';
import { clients, subscriptions } from '@dawlyy/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requireBillingPermission } from '@/src/server/payments/permission';
import { getSubscription, tenantToday } from '@/src/server/subscriptions/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { SubscriptionDetail } from '@/components/billing/subscription-detail';
import { Link } from '@/i18n/navigation';

/** T3b / T3a link contract: current subscription, countdown, lifecycle ledger and upcoming events. */
export default async function ClientSubscriptionPage({ params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requirePage(); requireBillingPermission(auth, 'view');
  const { clientId } = await params; if (!z.uuid().safeParse(clientId).success) notFound();
  const t = await getTranslations('billing');
  const data = await withAuthTx(auth, async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, clientId))).limit(1);
    if (!client) notFound();
    const [sub] = await tx.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.tenantId, auth.tenantId), eq(subscriptions.clientId, clientId)))
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
    return sub ? { detail: await getSubscription(tx, auth, sub.id), ...await tenantToday(tx, auth.tenantId) } : null;
  });
  return <div className="min-w-0 space-y-6"><PageHeader title={t('subscriptionDetail')} />
    {data ? <SubscriptionDetail subscription={data.detail.subscription} access={data.detail.accessStatus} events={data.detail.events} upcoming={data.detail.upcoming}
      today={data.today} canEdit={isAllowed(auth, 'billing', 'edit')} /> : <EmptyState Icon={CalendarDays} title={t('emptySubscriptions')}
      action={isAllowed(auth, 'billing', 'create') ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/billing/sell?clientId=${clientId}`}>{t('sell')}</Link> : undefined} />}
  </div>;
}
