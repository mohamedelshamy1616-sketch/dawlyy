import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { threadPageData } from '@/src/server/messaging/page-data';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { Thread } from '@/components/messaging/thread';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Task 9: one client's thread for the coach side. A thread outside the caller's client scope is a 404. */
export default async function CoachThreadPage({ params }: { params: Promise<{ locale: string; conversationId: string }> }) {
  await connection();
  const { locale, conversationId } = await params;
  setRequestLocale(locale);
  if (!UUID.test(conversationId)) notFound();
  const auth = await requirePage();
  const t = await getTranslations('messaging.thread');
  if (!isAllowed(auth, 'messages', 'view')) {
    return <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('noAccessTitle')} /><EmptyState Icon={MessageCircle} title={t('noAccessTitle')} description={t('noAccessBody')} /></div>;
  }
  const data = await threadPageData(auth, conversationId);
  if (!data) notFound();
  return (
    <Thread initial={data} viewerRole="coach" canSend={isAllowed(auth, 'messages', 'create')} title={data.conversation.clientName ?? t('coachTitle')}
      backHref="/coach/messages" backLabel={t('back')} />
  );
}
