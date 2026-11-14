import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { requirePage } from '@/src/server/auth';
import { loadClientBootstrap } from '@/src/server/client-today/page-data';
import { HubError, PlanHub } from '@/components/client-today/client-hubs';

/** R2a: Plan hub over the published program and nutrition plan. */
export default async function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  try {
    const { userId, ...bootstrap } = await loadClientBootstrap(auth);
    return <PlanHub userId={userId} bootstrap={bootstrap} />;
  } catch (error) {
    console.error('client plan failed', error instanceof Error ? error.name : 'unknown');
    return <HubError />;
  }
}