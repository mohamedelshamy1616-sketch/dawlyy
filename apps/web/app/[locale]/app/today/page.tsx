import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { loadTodayPageData, type TodayPageData } from '@/src/server/client-today/page-data';
import { ClientModuleSeed, ClientUnreadSeed } from '@/components/client-today/client-module-provider';
import { HubError } from '@/components/client-today/client-hubs';
import { TodayActions } from '@/components/client-today/today-actions';

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
  return (
    <>
      <ClientModuleSeed userId={data.userId} {...data.bootstrap} />
      {data.bootstrap.modules.messages ? <ClientUnreadSeed userId={data.userId} count={data.today.unreadMessages} /> : null}
      <TodayActions today={data.today} nutrition={data.nutrition} logs={data.logs} locale={locale === 'ar' ? 'ar' : 'en'} bootstrap={data.bootstrap} />
    </>
  );
}