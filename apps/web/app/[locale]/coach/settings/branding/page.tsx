import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getBusiness } from '@/src/server/settings/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { BrandingForm } from '@/components/settings/branding-form';

/** Task 11: brand colour. The logo upload is not offered until media upload for branding exists. */
export default async function BrandingSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.branding');
  const business = await withAuthTx(auth, (tx) => getBusiness(tx, auth));
  const canEdit = auth.role === 'owner' && isAllowed(auth, 'settings', 'edit');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <BrandingForm initialColor={business.settings.brandColor ?? null} canEdit={canEdit} /></div>;
}
