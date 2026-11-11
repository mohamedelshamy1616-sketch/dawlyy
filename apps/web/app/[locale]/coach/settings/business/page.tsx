import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getBusiness } from '@/src/server/settings/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { BusinessForm } from '@/components/settings/business-form';

/** Task 11: business settings. Every coach-side member reads; the owner edits. */
export default async function BusinessSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.business');
  const business = await withAuthTx(auth, (tx) => getBusiness(tx, auth));
  const canEdit = auth.role === 'owner' && isAllowed(auth, 'settings', 'edit');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <BusinessForm initial={business} canEdit={canEdit} /></div>;
}
