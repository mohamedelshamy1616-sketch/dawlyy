import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { ClientOverridesPageContent, OverrideEditor } from '@/components/clients/override-editor';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getClientOverrides } from '@/src/server/clients/service';
import { PageHeader } from '@/src/components/shell/page-header';

/** Task 3: isolated entitlement overrides resolved against the client's sold package snapshot. */
export default async function ClientOverridesPage({ params }: { params: Promise<{ locale: string; clientId: string }> }) {
  await connection();
  const { locale, clientId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.string().uuid().safeParse(clientId).success) notFound();
  const t = await getTranslations('clients');
  const data = await withAuthTx(auth, tx => getClientOverrides(tx, auth, clientId)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <ClientOverridesPageContent clientId={clientId} header={<PageHeader title={t('overrides.title')} subtitle={t('overrides.subtitle')} />}>
    {data.resolved.length ? <OverrideEditor clientId={clientId} resolved={data.resolved} editable={isAllowed(auth, 'billing', 'edit')} /> : null}
  </ClientOverridesPageContent>;
}
