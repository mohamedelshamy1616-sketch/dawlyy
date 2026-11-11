import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listSessions } from '@/src/server/workout/read';
import { HistoryList } from '@/components/client-portal/history-view';
import { PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5: finished sessions without an age cap, using the shared keyset history service. */
export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const auth = await requirePage();
  const data = await withAuthTx(auth, tx => listSessions(tx, auth, {})); const t = await getTranslations('workout');
  return <PortalFrame title={t('history')}><HistoryList initial={data} /></PortalFrame>;
}
