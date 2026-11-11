import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { myNutrition } from '@/src/server/nutrition/client';
import { listMealLogs } from '@/src/server/nutrition/logs';
import { logListSchema } from '@/src/server/nutrition/schemas';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientNutritionScreen } from '@/components/nutrition/client-nutrition';
import type { ClientNutrition, DailyLogs } from '@/components/nutrition/types';

/** Task 6: the client's meals for today, read through the same own-client boundary as GET /nutrition/me and GET /meal-logs. */
export default async function ClientNutritionPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const t = await getTranslations('nutrition');
  const data = await withAuthTx(auth, async tx => {
    const plan = await myNutrition(tx, auth);
    return { plan, logs: await listMealLogs(tx, auth, logListSchema.parse({ date: plan.localDate, limit: '100' })) };
  });
  const plan = JSON.parse(JSON.stringify(data.plan)) as ClientNutrition; const logs = JSON.parse(JSON.stringify(data.logs)) as DailyLogs;
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('client.title')} subtitle={t('client.subtitle')} /><ClientNutritionScreen plan={plan} logs={logs} /></div>;
}
