import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { clientFormOptions } from '@/src/server/clients/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientForm } from '@/components/clients/client-form';

/** Task 3: new-client form with an optional handoff into selling a package. */
export default async function NewClientPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('clients');
  const auth = await requirePage();
  const options = await withAuthTx(auth, tx => clientFormOptions(tx, auth, 'create'));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('newTitle')} subtitle={t('newSubtitle')} />
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link><ClientForm packages={options.packages} />
  </div>;
}
