import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { dashboardQueue } from '@/src/server/dashboard/queue';
import { PageHeader } from '@/src/components/shell/page-header';
import { MoneyHub, MoneyRenewals } from '@/components/inbox/hubs';
import type { QueuePage } from '@/components/dashboard/types';

/** R1b: billing hub plus the existing dashboard's 14-day renewals query, under caller RLS. */
export default async function MoneyPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection(); const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const t = await getTranslations('nav');
  const renewals = isAllowed(auth, 'dashboard', 'view')
    ? JSON.parse(JSON.stringify(await withAuthTx(auth, tx => dashboardQueue(tx, auth, 'expiring_subscriptions', { limit: '10' })))) as QueuePage : null;
  return <section className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('coach.money')} subtitle={t('moneySubtitle')} /><MoneyHub /><MoneyRenewals data={renewals} /></section>;
}
