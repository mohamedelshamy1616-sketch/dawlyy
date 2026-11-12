import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { nutritionHistoryContext } from '@/src/server/nutrition/history';
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
    const history = await nutritionHistoryContext(tx, auth);
    return { history, logs: await listMealLogs(tx, auth, logListSchema.parse({ date: history.localDate, limit: '100' })) };
  });
  const { mealNames, supplementNames } = data.history;
  const logs = JSON.parse(JSON.stringify(data.logs)) as DailyLogs;
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('client.history')} subtitle={t('client.historySubtitle')} /><ClientNutritionHistory today={data.history.localDate} initial={logs} mealNames={mealNames} supplementNames={supplementNames} /></div>;
}
