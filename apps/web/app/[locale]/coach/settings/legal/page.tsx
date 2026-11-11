import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ScrollText } from 'lucide-react';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listTenantConsents } from '@/src/server/settings/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { NoAccess } from '@/components/settings/no-access';
import { ConsentRecords } from '@/components/settings/consent-records';

/** Task 11 / spec section 44: the owner's consent records for the whole business. */
export default async function LegalSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.legal');
  if (auth.role !== 'owner') return <NoAccess />;
  const data = await withAuthTx(auth, (tx) => listTenantConsents(tx, auth, { limit: 20 }));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    {data.items.length === 0 ? <EmptyState Icon={ScrollText} title={t('emptyTitle')} description={t('emptyBody')} /> : <ConsentRecords initial={data} />}</div>;
}
