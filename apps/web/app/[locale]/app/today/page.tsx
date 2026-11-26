import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { loadTodayPageData, type TodayPageData } from '@/src/server/client-today/page-data';
import { ClientModuleSeed, ClientUnreadSeed } from '@/components/client-today/client-module-provider';
import { HubError } from '@/components/client-today/client-hubs';
import { TodayActions } from '@/components/client-today/today-actions';
import { ReceiptCard } from '@/components/pt/ledger';
import { RenewalCard } from '@/components/pt/renewal';
import { myRenewalsDue } from '@/src/server/pt/renewal';
import { myReceipts } from '@/src/server/pt/ledger';
import { withAuthTx } from '@/src/server/db';

/** R2a: Today. One lead card, meals as rows, then the check-in when due, honouring the client's modules. */
export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  let data: TodayPageData;
  try {
    data = await loadTodayPageData(auth);
  } catch (error) {
    console.error('client today failed', error instanceof Error ? error.name : 'unknown');
    return <HubError />;
  }
  const t = await getTranslations('billing.pt');
  const [receipts, renewals] = auth.role === 'client' ? await withAuthTx(auth, async tx => [await myReceipts(tx, auth), await myRenewalsDue(tx, auth)] as const) : [[], []] as const;
  return (
    <>
      <ClientModuleSeed userId={data.userId} {...data.bootstrap} />
      {data.bootstrap.modules.messages ? <ClientUnreadSeed userId={data.userId} count={data.today.unreadMessages} /> : null}
      <TodayActions today={data.today} nutrition={data.nutrition} logs={data.logs} locale={locale === 'ar' ? 'ar' : 'en'} bootstrap={data.bootstrap} />
      {renewals.length + receipts.length > 0 ? (
        <section className="mt-6 grid gap-3" aria-labelledby="pt-sessions">
          <h2 id="pt-sessions" className="text-lg font-semibold">{t('section')}</h2>
          {renewals.map(due => <RenewalCard key={due.subscription} due={due} />)}
          {receipts.map(receipt => <ReceiptCard key={receipt.visit} receipt={receipt} />)}
        </section>
      ) : null}
    </>
  );
}
