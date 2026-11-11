import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { ApiError } from '@/src/api/errors';
import { listNutritionVersions } from '@/src/server/nutrition/read';
import { nutritionPageGrants } from '@/src/server/nutrition/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { NutritionHistory, type HistoryData } from '@/components/nutrition/history';

/** Task 6: coach-only version history and core document comparison. */
export default async function NutritionHistoryPage({ params }: { params: Promise<{ locale: string; planId: string }> }) {
  await connection();
  const { locale, planId } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const grants = nutritionPageGrants(auth); const t = await getTranslations('nutrition');
  if (!z.uuid().safeParse(planId).success) notFound();
  const data = await withAuthTx(auth, tx => listNutritionVersions(tx, auth, planId, {})).catch(error => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  // The documents stay on the server: the list needs only status, note, date and the core diff counts.
  const initial = JSON.parse(JSON.stringify({ nextCursor: data.nextCursor, items: data.items.map(v => ({ id: v.id, versionNo: v.versionNo, status: v.status, changeNote: v.changeNote, publishedAt: v.publishedAt, diffSummary: v.diffSummary })) })) as HistoryData;
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('history.title')} subtitle={t('history.subtitle')} /><NutritionHistory id={planId} initial={initial} canEdit={grants.edit} /></div>;
}
