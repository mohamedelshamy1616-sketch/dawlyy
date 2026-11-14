import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { loadClientBootstrap } from '@/src/server/client-today/page-data';
import { loadCoachPageData } from '@/src/server/client-today/coach';
import { CoachHub, HubError } from '@/components/client-today/client-hubs';

/** R2a: Coach hub: coach identity, the promised reply time and the existing conversation. */
export default async function CoachPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  try {
    const { userId, ...bootstrap } = await loadClientBootstrap(auth);
    const canView = isAllowed(auth, 'messages', 'view');
    const data = bootstrap.modules.messages && canView ? await loadCoachPageData(auth) : null;
    return (
      <CoachHub
        userId={userId} bootstrap={bootstrap} canView={canView} canSend={isAllowed(auth, 'messages', 'create')}
        businessName={data?.businessName ?? ''} identity={data?.identity ?? { kind: 'unknown', members: [] }}
        promise={data?.promise ?? { chatHours: null, checkinReviewHours: null }} thread={data?.thread ?? null}
      />
    );
  } catch (error) {
    console.error('client coach failed', error instanceof Error ? error.name : 'unknown');
    return <HubError />;
  }
}