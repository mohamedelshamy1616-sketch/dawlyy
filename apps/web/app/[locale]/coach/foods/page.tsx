import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { listFoods } from '@/src/server/nutrition/foods';
import { foodListSchema } from '@/src/server/nutrition/schemas';
import { foodPageGrants } from '@/src/server/nutrition/page-data';
import type { NutritionFood } from '@/src/server/nutrition/helpers';
import { PageHeader } from '@/src/components/shell/page-header';
import { FoodLibrary } from '@/components/nutrition/foods';

/** Task 6: authenticated coach food library (system plus tenant foods) inside the existing shell. */
export default async function FoodsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = foodPageGrants(auth); const t = await getTranslations('nutrition');
  const data = await withAuthTx(auth, tx => listFoods(tx, auth, foodListSchema.parse({ limit: '50' })));
  const initial = JSON.parse(JSON.stringify(data)) as { items: NutritionFood[]; nextCursor: string | null };
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('foods.title')} subtitle={t('foods.subtitle')} /><FoodLibrary initial={initial} editable={grants.edit} /></div>;
}
