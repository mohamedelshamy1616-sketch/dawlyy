import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getToday } from '@/src/server/workout/portal';
import { TodayCards } from '@/components/client-portal/today-cards';
import { PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5: own-client Today cards through the authenticated RLS boundary. */
export default async function TodayPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const auth = await requirePage();
  const data = await withAuthTx(auth, tx => getToday(tx, auth)); const t = await getTranslations('nav.client');
  return <PortalFrame title={t('today')}><TodayCards data={data} /></PortalFrame>;
}
