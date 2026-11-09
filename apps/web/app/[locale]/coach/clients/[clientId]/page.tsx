import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getClient } from '@/src/server/clients/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientDetail } from '@/components/clients/client-detail';

/** Task 3: RLS-scoped client profile and links to the billing builder's fixed routes. */
export default async function ClientPage({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  await connection();
  const { locale, clientId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.string().uuid().safeParse(clientId).success) notFound();
  const t = await getTranslations('clients');
  const client = await withAuthTx(auth, tx => getClient(tx, auth, clientId)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} subtitle={client.code} />
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link><ClientDetail client={client} canEdit={isAllowed(auth, 'clients', 'edit')} />
  </div>;
}
