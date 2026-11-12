import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { nutritionLogContext } from '@/src/server/nutrition/client';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientQuickEntry } from '@/components/nutrition/client-log';

/** Task 6: free-text entry for an off-plan meal, dated in the client's own timezone. */
export default async function ClientNutritionLogPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params; setRequestLocale(locale);
  const auth = await requirePage(); const t = await getTranslations('nutrition');
  const { localDate } = await withAuthTx(auth, tx => nutritionLogContext(tx, auth));
  return <div className="flex min-w-0 max-w-full flex-col gap-6"><PageHeader title={t('client.quickEntry')} subtitle={t('client.quickEntrySubtitle')} /><ClientQuickEntry localDate={localDate} /></div>;
}
