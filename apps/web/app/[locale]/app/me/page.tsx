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
  // Load inside try/catch, render outside it (react-hooks/error-boundaries).
  let loaded: Awaited<ReturnType<typeof loadClientBootstrap>> | null = null;
  try {
    loaded = await loadClientBootstrap(auth);
  } catch (error) {
    console.error('client me failed', error instanceof Error ? error.name : 'unknown');
  }
  if (!loaded) return <HubError />;
  const { userId, ...bootstrap } = loaded;
  return <MeHub userId={userId} bootstrap={bootstrap} />;
}