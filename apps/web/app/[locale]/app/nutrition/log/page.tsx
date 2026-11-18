import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { addDays } from '@dawlyy/core/schedule';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { checkActiveAccess } from '@/src/server/access';
import { myNutrition, nutritionLogContext } from '@/src/server/nutrition/client';
import { listMealLogs } from '@/src/server/nutrition/logs';
import { logListSchema } from '@/src/server/nutrition/schemas';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientQuickEntry } from '@/components/nutrition/client-log';
import { ClientQuickLog } from '@/components/client-quick-log/quick-log';
import { mealHistoryRow, type ClientNutrition, type DailyLogs } from '@/components/nutrition/types';

/** Free entry/history remain available without reading an expired or private plan. */
export default async function ClientNutritionLogPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const t = await getTranslations('quickLog');
  const context = await withAuthTx(auth, tx => nutritionLogContext(tx, auth));
  const planData = await withAuthTx(auth, async tx => (await checkActiveAccess(tx, auth)).allowed ? myNutrition(tx, auth) : null);
  const plan = planData ? JSON.parse(JSON.stringify(planData)) as ClientNutrition : null;
  const pages = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
    const date = addDays(context.localDate, -index - 1);
    try {
      const result = await withAuthTx(auth, tx => listMealLogs(tx, auth, logListSchema.parse({ date, limit: '50' })));
      return { date, logs: JSON.parse(JSON.stringify(result)) as DailyLogs };
    } catch { return { date, logs: null }; }
  }));
  const recent = pages.flatMap(page => page.logs?.items.map(row => mealHistoryRow(row, page.date)) ?? []);
  const cursors = pages.flatMap(page => page.logs?.nextCursor ? [{ date: page.date, cursor: page.logs.nextCursor }] : []);
  return <>
    <PageHeader title={t('title')} subtitle={t('subtitle')} />
    <ClientQuickLog localDate={context.localDate} plan={plan} recent={recent} initialCursors={cursors} initialError={pages.some(page => page.logs === null)} />
    <ClientQuickEntry localDate={context.localDate} />
  </>;
}
