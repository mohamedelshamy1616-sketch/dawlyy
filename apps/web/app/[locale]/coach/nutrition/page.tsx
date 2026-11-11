import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listNutrition } from '@/src/server/nutrition/read';
import { planListSchema } from '@/src/server/nutrition/schemas';
import { nutritionPageGrants } from '@/src/server/nutrition/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { NutritionPlans, type PlanCards } from '@/components/nutrition/plans';

/** Task 6: coach nutrition directory (templates first) reads through the same transaction and permission boundary as the API. */
export default async function NutritionPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = nutritionPageGrants(auth); const t = await getTranslations('nutrition');
  const data = await withAuthTx(auth, tx => listNutrition(tx, auth, planListSchema.parse({ kind: 'template', limit: '20' })));
  const initial = JSON.parse(JSON.stringify(data)) as PlanCards;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} /><NutritionPlans initial={initial} create={grants.create} /></div>;
}
