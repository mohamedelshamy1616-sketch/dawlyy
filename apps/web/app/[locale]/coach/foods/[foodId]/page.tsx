import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError } from '@/src/api/errors';
import { getFood } from '@/src/server/nutrition/foods';
import { foodPageGrants } from '@/src/server/nutrition/page-data';
import type { NutritionFood } from '@/src/server/nutrition/helpers';
import { PageHeader } from '@/src/components/shell/page-header';
import { FoodForm } from '@/components/nutrition/foods';

/** Task 6: one food: tenant foods are editable, system foods are read-only with a customise action. */
export default async function FoodPage({ params }: { params: Promise<{ locale: string; foodId: string }> }) {
  await connection();
  const { locale, foodId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = foodPageGrants(auth); const t = await getTranslations('nutrition');
  if (!z.uuid().safeParse(foodId).success) notFound();
  const data = await withAuthTx(auth, tx => getFood(tx, auth, foodId)).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const initial = JSON.parse(JSON.stringify(data)) as NutritionFood;
  const name = locale === 'ar' ? data.name.ar || data.name.en : data.name.en || data.name.ar;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={name || t('foods.title')} subtitle={t('foods.detailDescription')} /><FoodForm key={initial.id} initial={initial} editable={grants.edit} /></div>;
}
