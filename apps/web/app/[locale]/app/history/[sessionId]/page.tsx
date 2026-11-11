import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getSession } from '@/src/server/workout/read';
import { ApiError } from '@/src/api/errors';
import { HistoryDetail } from '@/components/client-portal/history-view';
import { PortalEmpty, PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5: own historical snapshot and public set values through the RLS boundary. */
export default async function HistoryDetailPage({ params }: { params: Promise<{ locale: string; sessionId: string }> }) {
  const { locale, sessionId } = await params; setRequestLocale(locale);
  if (!z.string().uuid().safeParse(sessionId).success) notFound();
  const auth = await requirePage();
  const detail = await withAuthTx(auth, tx => getSession(tx, auth, sessionId)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  const t = await getTranslations('workout');
  return <PortalFrame title={t('history')}>{detail ? <HistoryDetail detail={detail} /> : <PortalEmpty />}</PortalFrame>;
}
