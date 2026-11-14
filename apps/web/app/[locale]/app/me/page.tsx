import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { loadClientBootstrap } from '@/src/server/client-today/page-data';
import { HubError, MeHub } from '@/components/client-today/client-hubs';

/** R2a: Me hub: progress, history, check-ins, subscription and notifications as rows. */
export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  try {
    const { userId, ...bootstrap } = await loadClientBootstrap(auth);
    return <MeHub userId={userId} bootstrap={bootstrap} />;
  } catch (error) {
    console.error('client me failed', error instanceof Error ? error.name : 'unknown');
    return <HubError />;
  }
}