import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError } from '@/src/api/errors';
import { getNutrition } from '@/src/server/nutrition/read';
import { nutritionPageGrants } from '@/src/server/nutrition/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { NutritionBuilder } from '@/components/nutrition/builder';
import type { NutritionDetail } from '@/components/nutrition/types';

/** Task 6: request-scoped snapshot initializes the core-computed diet builder without shared caching. */
export default async function NutritionBuilderPage({ params }: { params: Promise<{ locale: string; planId: string }> }) {
  await connection();
  const { locale, planId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = nutritionPageGrants(auth); const t = await getTranslations('nutrition');
  if (!z.uuid().safeParse(planId).success) notFound();
  const data = await withAuthTx(auth, tx => getNutrition(tx, auth, planId)).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  const initial = JSON.parse(JSON.stringify(data)) as NutritionDetail;
  const name = locale === 'ar' ? data.head.name.ar || data.head.name.en : data.head.name.en || data.head.name.ar;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={name || t('builder.title')} subtitle={t('builder.subtitle')} /><NutritionBuilder key={initial.revision} initial={initial} grants={grants} /></div>;
}
