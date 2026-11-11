import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { myNutrition } from '@/src/server/nutrition/client';
import { listMealLogs } from '@/src/server/nutrition/logs';
import { logListSchema } from '@/src/server/nutrition/schemas';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientNutritionHistory } from '@/components/nutrition/client-history';
import type { DailyLogs } from '@/components/nutrition/types';

/** Task 6: the client's logged days; meal and supplement names come from the published plan so the log rows stay readable. */
export default async function ClientNutritionHistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const t = await getTranslations('nutrition');
  const data = await withAuthTx(auth, async tx => {
    const plan = await myNutrition(tx, auth);
    return { plan, logs: await listMealLogs(tx, auth, logListSchema.parse({ date: plan.localDate, limit: '100' })) };
  });
  const document = data.plan.version?.document;
  const mealNames = Object.fromEntries((document?.meals ?? []).map(m => [m.id, m.name]));
  const supplementNames = Object.fromEntries((document?.supplements ?? []).map(s => [s.id, s.name]));
  const logs = JSON.parse(JSON.stringify(data.logs)) as DailyLogs;
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('client.history')} subtitle={t('client.historySubtitle')} /><ClientNutritionHistory today={data.plan.localDate} initial={logs} mealNames={mealNames} supplementNames={supplementNames} /></div>;
}
