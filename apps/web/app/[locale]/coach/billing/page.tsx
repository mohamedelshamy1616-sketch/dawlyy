import { getTranslations } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { clients, payments } from '@dawlyy/db/schema';
import { and, count, eq } from 'drizzle-orm';
import { Link } from '@/i18n/navigation';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requireBillingPermission } from '@/src/server/payments/permission';
import { listPayments } from '@/src/server/payments/service';
import { listSubscriptions } from '@/src/server/subscriptions/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { BillingOverview } from '@/components/billing/overview';

/** T3b: authenticated billing overview, read through the API's permission and RLS boundary. */
export default async function BillingPage() {
  const auth = await requirePage(); requireBillingPermission(auth, 'view');
  const t = await getTranslations('billing');
  const data = await withAuthTx(auth, async (tx) => {
    const paymentPage = await listPayments(tx, auth, {}); const subscriptionPage = await listSubscriptions(tx, auth, {});
    const names = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName })
      .from(clients).where(eq(clients.tenantId, auth.tenantId));
    const [pending] = await tx.select({ count: count() }).from(payments).where(and(eq(payments.tenantId, auth.tenantId), eq(payments.state, 'pending')));
    return { paymentPage, subscriptionPage, clients: names.map((c) => ({ id: c.id, name: c.displayName ?? `${c.firstName} ${c.lastName ?? ''}`.trim() })), pendingCount: pending?.count ?? 0 };
  });
  return <div className="min-w-0 space-y-6"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    {isAllowed(auth, 'billing', 'create') ? <Link className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" href="/coach/billing/sell">{t('sell')}</Link> : null}
    <BillingOverview payments={data.paymentPage.items} subscriptions={data.subscriptionPage.items} clients={data.clients} pendingCount={data.pendingCount}
      paymentCursor={data.paymentPage.nextCursor} subscriptionCursor={data.subscriptionPage.nextCursor} />
  </div>;
}
