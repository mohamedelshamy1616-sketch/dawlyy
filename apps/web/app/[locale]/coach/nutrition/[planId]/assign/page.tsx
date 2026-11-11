import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError, forbidden } from '@/src/api/errors';
import { getNutrition } from '@/src/server/nutrition/read';
import { nutritionPageGrants } from '@/src/server/nutrition/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { AssignNutrition } from '@/components/nutrition/assign';

/** Task 6: reuse flow resolves the template under RLS before offering a client-specific copy. */
export default async function NutritionAssignPage({ params }: { params: Promise<{ locale: string; planId: string }> }) {
  await connection();
  const { locale, planId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = nutritionPageGrants(auth); const t = await getTranslations('nutrition');
  if (!grants.edit && !grants.publish) throw forbidden();
  if (!z.uuid().safeParse(planId).success) notFound();
  const data = await withAuthTx(auth, tx => getNutrition(tx, auth, planId)).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  if (data.head.kind !== 'template') notFound();
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('assign.title')} subtitle={t('assign.subtitle')} /><AssignNutrition id={planId} canPublish={grants.publish} canEdit={grants.edit} published={data.head.publishedVersionId !== null} /></div>;
}
