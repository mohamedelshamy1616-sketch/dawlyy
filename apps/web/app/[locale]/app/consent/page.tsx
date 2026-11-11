import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { LEGAL_VERSION } from '@/src/server/settings/constants';
import { listOwnConsents } from '@/src/server/settings/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ConsentPanel } from '@/components/settings/consent-panel';

/** Task 11 / spec section 44: the client reviews each consent and records or withdraws it. */
export default async function ClientConsentPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('settings.consent');
  const { current } = await withAuthTx(auth, (tx) => listOwnConsents(tx, auth));
  const states = Object.fromEntries(Object.entries(current).map(([kind, value]) => [kind, { state: value.state, at: value.at }]));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} />
    <ConsentPanel current={states} version={LEGAL_VERSION} /></div>;
}
