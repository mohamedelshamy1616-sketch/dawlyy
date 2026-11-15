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
  const canView = isAllowed(auth, 'messages', 'view');
  // Load inside try/catch, render outside it (react-hooks/error-boundaries).
  let loaded: {
    boot: Awaited<ReturnType<typeof loadClientBootstrap>>;
    data: Awaited<ReturnType<typeof loadCoachPageData>> | null;
  } | null = null;
  try {
    const boot = await loadClientBootstrap(auth);
    const data = boot.modules.messages && canView ? await loadCoachPageData(auth) : null;
    loaded = { boot, data };
  } catch (error) {
    console.error('client coach failed', error instanceof Error ? error.name : 'unknown');
  }
  if (!loaded) return <HubError />;
  const { boot: { userId, ...bootstrap }, data } = loaded;
  return (
    <CoachHub
      userId={userId} bootstrap={bootstrap} canView={canView} canSend={isAllowed(auth, 'messages', 'create')}
      businessName={data?.businessName ?? ''} identity={data?.identity ?? { kind: 'unknown', members: [] }}
      promise={data?.promise ?? { chatHours: null, checkinReviewHours: null }} thread={data?.thread ?? null}
    />
  );
}