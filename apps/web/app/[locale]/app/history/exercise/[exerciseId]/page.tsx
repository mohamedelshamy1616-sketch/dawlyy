import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getExerciseHistory } from '@/src/server/workout/read';
import { ExerciseHistoryTable } from '@/components/client-portal/exercise-history';
import { PortalFrame } from '@/components/client-portal/portal-frame';

/** Task 5 / G3: accessible table and dependency-free strength trend for five sessions. */
export default async function ExerciseHistoryPage({ params }: { params: Promise<{ locale: string; exerciseId: string }> }) {
  const { locale, exerciseId } = await params; setRequestLocale(locale);
  if (!z.string().uuid().safeParse(exerciseId).success) notFound();
  const auth = await requirePage(); const rows = await withAuthTx(auth, tx => getExerciseHistory(tx, auth, exerciseId));
  const t = await getTranslations('workout');
  return <PortalFrame title={t('exerciseHistory')}><ExerciseHistoryTable rows={rows} /></PortalFrame>;
}
