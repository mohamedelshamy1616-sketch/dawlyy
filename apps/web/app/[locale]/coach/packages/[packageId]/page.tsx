import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { localize } from '@dawlyy/core/types';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { PackageForm } from '@/components/packages/package-form';
import { PackageActions } from '@/components/packages/package-actions';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getPackage } from '@/src/server/packages/service';
import { PageHeader } from '@/src/components/shell/page-header';

/** Task 3: package master editor; subscription snapshots are deliberately independent. */
export default async function PackagePage({ params }: { params: Promise<{ locale: string; packageId: string }> }) {
  await connection();
  const { locale, packageId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.string().uuid().safeParse(packageId).success) notFound();
  const t = await getTranslations('packages');
  const data = await withAuthTx(auth, tx => getPackage(tx, auth, packageId)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={localize(data.name, locale === 'ar' ? 'ar' : 'en')} />
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/packages">{t('back')}</Link>
    {data.archivedAt ? <Badge variant="secondary">{t('archived')}</Badge> : null}
    <PackageActions id={packageId} archived={data.archivedAt !== null} canCreate={isAllowed(auth, 'packages', 'create')} canEdit={isAllowed(auth, 'packages', 'edit')} />
    <PackageForm key={data.id} initial={data} editable={isAllowed(auth, 'packages', 'edit')} />
  </div>;
}
