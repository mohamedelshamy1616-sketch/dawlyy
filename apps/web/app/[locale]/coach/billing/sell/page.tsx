import { getTranslations } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { clients, packages } from '@dawlyy/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { ShoppingBag } from 'lucide-react';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requireBillingPermission } from '@/src/server/payments/permission';
import { tenantToday } from '@/src/server/subscriptions/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { SellForm } from '@/components/billing/sell-form';

/** T3b / T3a link contract: package sale with optional preselected RLS-visible client. */
export default async function SellPage({ searchParams }: { searchParams: Promise<{ clientId?: string | string[] }> }) {
  const auth = await requirePage(); requireBillingPermission(auth, 'create');
  const query = await searchParams; const requested = query.clientId;
  if (requested !== undefined && !z.uuid().safeParse(requested).success) notFound();
  const clientId = typeof requested === 'string' ? requested : undefined;
  const t = await getTranslations('billing');
  const data = await withAuthTx(auth, async (tx) => {
    const people = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName })
      .from(clients).where(and(eq(clients.tenantId, auth.tenantId), isNull(clients.archivedAt))).orderBy(asc(clients.firstName), asc(clients.id));
    const choices = await tx.select({ id: packages.id, name: packages.name, price: packages.price, currency: packages.currency, durationDays: packages.durationDays })
      .from(packages).where(and(eq(packages.tenantId, auth.tenantId), isNull(packages.archivedAt))).orderBy(asc(packages.sortOrder), asc(packages.id));
    return { clients: people.map((c) => ({ id: c.id, name: c.displayName ?? `${c.firstName} ${c.lastName ?? ''}`.trim() })), packages: choices, ...await tenantToday(tx, auth.tenantId) };
  });
  if (clientId && !data.clients.some((c) => c.id === clientId)) notFound();
  return <div className="min-w-0 space-y-6"><PageHeader title={t('sell')} subtitle={t('sellSubtitle')} />
    {data.clients.length && data.packages.length ? <SellForm clients={data.clients} packages={data.packages} clientId={clientId} today={data.today}
      canVerify={isAllowed(auth, 'billing', 'verify') && isAllowed(auth, 'billing', 'edit')} /> : <EmptyState Icon={ShoppingBag} title={t('saleNeedsSetup')} description={t('saleNeedsSetupDescription')} />}
  </div>;
}
