import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { z } from 'zod';
import { Link } from '@/i18n/navigation';
import { ApiError } from '@/src/api/errors';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getClient } from '@/src/server/clients/service';
import { clientTimeline } from '@/src/server/dashboard/timeline';
import { listNutrition } from '@/src/server/nutrition/read';
import { listPrograms } from '@/src/server/programs/read';
import { PageHeader } from '@/src/components/shell/page-header';
import { ClientDetail, HUB_TABS, type HubAccess, type PlanSummary } from '@/components/clients/client-detail';
import type { TimelinePage } from '@/components/dashboard/types';
import { ActivityLog } from '@/components/activity/activity-log';
import { WeeklyReviewCard } from '@/components/review/weekly-review-card';

/** R1c: RLS-scoped client hub; the plan and timeline reads run only for callers who hold the matching module grant. */
export default async function ClientPage({ params, searchParams }: { params: Promise<{ locale: string; clientId: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  await connection();
  const { locale, clientId } = await params;
  const { tab } = await searchParams;
  setRequestLocale(locale);
  const auth = await requirePage();
  if (!z.string().uuid().safeParse(clientId).success) notFound();
  const t = await getTranslations('clients');
  const clientApp = await getTranslations('clientAppComposer');
  const access: HubAccess = {
    edit: isAllowed(auth, 'clients', 'edit'),
    viewTimeline: isAllowed(auth, 'dashboard', 'view'),
    viewProgram: isAllowed(auth, 'programs', 'view'),
    assignProgram: isAllowed(auth, 'programs', 'edit') || isAllowed(auth, 'programs', 'publish'),
    publishProgram: isAllowed(auth, 'programs', 'publish'),
    viewNutrition: isAllowed(auth, 'nutrition', 'view'),
    assignNutrition: isAllowed(auth, 'nutrition', 'edit') || isAllowed(auth, 'nutrition', 'publish'),
    publishNutrition: isAllowed(auth, 'nutrition', 'publish'),
    viewMoney: isAllowed(auth, 'billing', 'view'),
    sell: isAllowed(auth, 'billing', 'create'),
  };
  const data = await withAuthTx(auth, async tx => {
    const client = await getClient(tx, auth, clientId);
    const timeline = access.viewTimeline ? JSON.parse(JSON.stringify(await clientTimeline(tx, auth, clientId, {}))) as TimelinePage : null;
    const programs = access.viewProgram ? await listPrograms(tx, auth, { kind: 'client', clientId, limit: '1' }) : null;
    const plans = access.viewNutrition ? await listNutrition(tx, auth, { kind: 'client', clientId, limit: '1' }) : null;
    const program: PlanSummary | null = programs?.items[0] ? { id: programs.items[0].id, name: programs.items[0].name, status: programs.items[0].currentVersion?.status ?? 'draft' } : null;
    const nutrition: PlanSummary | null = plans?.items[0] ? { id: plans.items[0].id, name: plans.items[0].name, status: plans.items[0].currentStatus ?? 'draft' } : null;
    return { client, timeline, program, nutrition };
  }).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const { client } = data;
  const requested = HUB_TABS.find(value => value === (Array.isArray(tab) ? tab[0] : tab));
  return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} subtitle={client.code} />
    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link>
    {isAllowed(auth, 'settings', 'view') && isAllowed(auth, 'clients', 'view') && isAllowed(auth, 'clients', 'edit')
      ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${client.id}/client-app`}>{clientApp('hub.clientLink')}</Link> : null}
    <ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} reviewCard={(auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view') && isAllowed(auth, 'checkins', 'review') ? <WeeklyReviewCard clientId={client.id} initial={null} /> : null} />
  </div>;
}
