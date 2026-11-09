import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SlidersHorizontal } from 'lucide-react';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { OverrideEditor } from '@/components/clients/override-editor';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getClientOverrides } from '@/src/server/clients/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';

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
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('overrides.title')} subtitle={t('overrides.subtitle')} />
    <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${clientId}`}>{t('backToClient')}</Link>
    {data.resolved.length ? <OverrideEditor clientId={clientId} resolved={data.resolved} editable={isAllowed(auth, 'billing', 'edit')} /> : <EmptyState Icon={SlidersHorizontal} title={t('overrides.emptyTitle')} description={t('overrides.emptyBody')}
      action={<Button asChild className="min-h-11"><Link href={`/coach/billing/sell?clientId=${clientId}`}>{t('sellPackage')}</Link></Button>} />}
  </div>;
}
