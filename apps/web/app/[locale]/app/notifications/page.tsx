import { connection } from 'next/server';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { notificationsPageData } from '@/src/server/messaging/page-data';
import { PageHeader } from '@/src/components/shell/page-header';
import { NotificationCenter } from '@/components/notifications/center';
import { NotificationPreferences } from '@/components/notifications/preferences';

/** Task 9: the signed-in user's notification center with their delivery preferences. */
export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('messaging.notifications');
  const { list, preferences } = await notificationsPageData(auth);
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 [overflow-wrap:anywhere]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <NotificationCenter initial={list} />
      <NotificationPreferences initial={preferences} />
    </div>
  );
}
