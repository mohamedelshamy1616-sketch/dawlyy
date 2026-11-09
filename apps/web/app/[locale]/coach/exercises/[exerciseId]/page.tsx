import { connection } from 'next/server';
import { z } from 'zod';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { Dumbbell } from 'lucide-react';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { getExercise } from '@/src/server/exercises/service';
import { ApiError } from '@/src/api/errors';
import { PageHeader } from '@/src/components/shell/page-header';
import { EmptyState } from '@/src/components/shell/empty-state';
import { ExerciseForm } from '@/components/exercises/exercise-form';

/** Task 4: scoped coach detail with a useful missing-exercise state. */
export default async function ExercisePage({ params }: { params: Promise<{ locale: string; exerciseId: string }> }) {
  await connection();
  const { locale, exerciseId } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  requirePermission(auth, 'exercises', 'view');
  const t = await getTranslations('exercises');
  let exercise: Awaited<ReturnType<typeof getExercise>> | undefined;
  if (z.uuid().safeParse(exerciseId).success) {
    try { exercise = await withAuthTx(auth, (tx) => getExercise(tx, auth, exerciseId)); }
    catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
  }
  return <div className="flex min-w-0 max-w-full flex-col gap-6 break-words"><PageHeader title={exercise ? (locale === 'ar' ? exercise.name.ar || exercise.name.en : exercise.name.en || exercise.name.ar) || t('details') : t('details')} />{exercise ? <ExerciseForm key={exercise.id} exercise={exercise} canEdit={isAllowed(auth, 'exercises', 'edit')} canCreate={isAllowed(auth, 'exercises', 'create')} /> : <EmptyState Icon={Dumbbell} title={t('notFound')} description={t('notFoundBody')} />}</div>;
}
