import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { foodPageGrants } from '@/src/server/nutrition/page-data';
import { forbidden } from '@/src/api/errors';
import { PageHeader } from '@/src/components/shell/page-header';
import { FoodForm } from '@/components/nutrition/foods';

/** Task 6: tenant food creation requires the foods:edit grant. */
export default async function NewFoodPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = foodPageGrants(auth); if (!grants.edit) throw forbidden(); const t = await getTranslations('nutrition');
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('foods.create')} subtitle={t('foods.newDescription')} /><FoodForm editable /></div>;
}
