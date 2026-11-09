import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listPackages } from '@/src/server/packages/service';
import { packageListSchema } from '@/src/server/packages/schemas';
import { PageHeader } from '@/src/components/shell/page-header';
import { PackageList } from '@/components/packages/package-list';

/** Task 3: active-first package directory with optional archived records. */
export default async function PackagesPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('packages');
  const raw = await searchParams;
  const query = packageListSchema.parse(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
  const data = await withAuthTx(auth, tx => listPackages(tx, auth, query));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <PackageList key={JSON.stringify([query, data])} initial={data} archived={query.archived === '1'} canEdit={isAllowed(auth, 'packages', 'edit')} canCreate={isAllowed(auth, 'packages', 'create')} />
  </div>;
}
