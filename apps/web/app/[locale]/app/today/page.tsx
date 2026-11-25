import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { loadTodayPageData, type TodayPageData } from '@/src/server/client-today/page-data';
import { ClientModuleSeed } from '@/components/client-today/client-module-provider';
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
  const [receipts, renewals] = auth.role === 'client' ? await withAuthTx(auth, async tx => [await myReceipts(tx, auth), await myRenewalsDue(tx, auth)] as const) : [[], []] as const;
  return (
    <>
      <ClientModuleSeed userId={data.userId} {...data.bootstrap} />
      {renewals.map(due => <RenewalCard key={due.subscription} due={due} />)}
      {receipts.map(receipt => <ReceiptCard key={receipt.visit} receipt={receipt} />)}
      <TodayActions today={data.today} nutrition={data.nutrition} logs={data.logs} locale={locale === 'ar' ? 'ar' : 'en'} bootstrap={data.bootstrap} />
    </>
  );
}
