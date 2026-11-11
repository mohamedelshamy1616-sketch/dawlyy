import { connection } from 'next/server';
import { MessageCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { inboxPageData } from '@/src/server/messaging/page-data';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { Inbox } from '@/components/messaging/inbox';

/** Task 9: the coach inbox, newest conversation first, with unread badges. Staff scope is decided by RLS. */
export default async function MessagesInboxPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('messaging.inbox');
  if (!isAllowed(auth, 'messages', 'view')) {
    return <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('title')} /><EmptyState Icon={MessageCircle} title={t('noAccessTitle')} description={t('noAccessBody')} /></div>;
  }
  const initial = await inboxPageData(auth);
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 [overflow-wrap:anywhere]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <Inbox initial={initial} />
    </div>
  );
}
