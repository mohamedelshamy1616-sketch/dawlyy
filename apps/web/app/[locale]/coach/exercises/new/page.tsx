import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { requirePermission } from '@/src/server/require-permission';
import { PageHeader } from '@/src/components/shell/page-header';
import { ExerciseForm } from '@/components/exercises/exercise-form';

/** Task 4: coach exercise creation with a shared localized form. */
export default async function NewExercisePage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  requirePermission(auth, 'exercises', 'create');
  const t = await getTranslations('exercises');
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('new')} subtitle={t('formHelp')} /><ExerciseForm canCreate canEdit /></div>;
}
