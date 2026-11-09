import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requirePage } from '@/src/server/auth';
import { requirePermission } from '@/src/server/require-permission';
import { PageHeader } from '@/src/components/shell/page-header';
import { PackageForm } from '@/components/packages/package-form';

/** Task 3: flat package builder with core schedule defaults and an entitlement matrix. */
export default async function NewPackagePage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  requirePermission(auth, 'packages', 'create');
  const t = await getTranslations('packages');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('newTitle')} subtitle={t('newSubtitle')} />
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/packages">{t('back')}</Link><PackageForm />
  </div>;
}
