import { connection } from 'next/server';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { MessageCircle } from 'lucide-react';
import { requirePage } from '@/src/server/auth';
import { clientThreadPageData } from '@/src/server/messaging/page-data';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { Thread } from '@/components/messaging/thread';

/** Task 9: the client's thread with their coach. The first message creates the conversation. */
export default async function ClientMessagesPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('messaging.thread');
  if (!isAllowed(auth, 'messages', 'view')) {
    return <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('coachTitle')} /><EmptyState Icon={MessageCircle} title={t('noAccessTitle')} description={t('noAccessBody')} /></div>;
  }
  const data = await clientThreadPageData(auth);
  return <Thread initial={data} viewerRole="client" canSend={isAllowed(auth, 'messages', 'create')} title={t('coachTitle')} />;
}
