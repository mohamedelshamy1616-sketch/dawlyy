import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { localize } from '@dawlyy/core/types';
import { z } from 'zod';
import { PackageForm } from '@/components/packages/package-form';
import { PackageActions, PackagePageContent } from '@/components/packages/package-actions';
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
  const data = await withAuthTx(auth, tx => getPackage(tx, auth, packageId)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <PackagePageContent archived={data.archivedAt !== null} header={<PageHeader title={localize(data.name, locale === 'ar' ? 'ar' : 'en')} />}>
    <PackageActions id={packageId} archived={data.archivedAt !== null} canCreate={isAllowed(auth, 'packages', 'create')} canEdit={isAllowed(auth, 'packages', 'edit')} />
    <PackageForm key={data.id} initial={data} editable={isAllowed(auth, 'packages', 'edit')} />
  </PackagePageContent>;
}
