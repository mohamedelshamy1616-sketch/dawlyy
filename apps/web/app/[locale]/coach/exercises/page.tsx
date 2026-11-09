import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import { listExercises, getCategories } from '@/src/server/exercises/service';
import { PageHeader } from '@/src/components/shell/page-header';
import { ExerciseLibrary } from '@/components/exercises/library';

/** Task 4: authenticated coach library inside the existing shell. */
export default async function ExercisesPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  requirePermission(auth, 'exercises', 'view');
  const t = await getTranslations('exercises');
  const { initial, categories } = await withAuthTx(auth, async (tx) => ({ initial: await listExercises(tx, auth), categories: await getCategories(tx, auth) }));
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('title')} subtitle={t('subtitle')} /><ExerciseLibrary initial={initial} categories={categories} canCreate={isAllowed(auth, 'exercises', 'create')} owner={auth.role === 'owner'} /></div>;
}
