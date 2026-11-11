import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { nutritionPermission } from '@/src/server/nutrition/read';
import { PageHeader } from '@/src/components/shell/page-header';
import { NewNutrition } from '@/components/nutrition/plans';

/** Task 6: template setup has an authenticated coach-create boundary and streams behind loading.tsx. */
export default async function NewNutritionPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); nutritionPermission(auth, 'create'); const t = await getTranslations('nutrition');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('plans.create')} subtitle={t('plans.newDescription')} /><NewNutrition allowed /></div>;
}
