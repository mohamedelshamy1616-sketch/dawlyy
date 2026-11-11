import { connection } from 'next/server';
import { LayoutDashboard } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { Link } from '@/i18n/navigation';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { QUEUE_KINDS } from '@/src/server/dashboard/logic';
import { dashboardQueue, dashboardSummary } from '@/src/server/dashboard/queue';
import { listTasks } from '@/src/server/dashboard/tasks';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { CountCards } from '@/components/dashboard/count-cards';
import { QueueList } from '@/components/dashboard/queue-list';
import { TasksPreview } from '@/components/dashboard/tasks-preview';
import type { CountItem, QueuePage, TaskItem } from '@/components/dashboard/types';

const plain = <T,>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

/** Task 10: coach dashboard. Attention counts link to `?queue=<kind>`, which lists the rows behind that count. */
export default async function CoachDashboardPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('dashboard');
  if (!isAllowed(auth, 'dashboard', 'view')) {
    return <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('title')} /><EmptyState Icon={LayoutDashboard} title={t('noAccessTitle')} description={t('noAccessBody')} /></div>;
  }
  const raw = (await searchParams).queue;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const kind = QUEUE_KINDS.find(value => value === requested);
  const data = await withAuthTx(auth, async tx => {
    const summary = await dashboardSummary(tx, auth);
    return {
      counts: QUEUE_KINDS.map((value): CountItem => ({ kind: value, ...summary.counts[value] })),
      queue: kind ? plain<QueuePage>(await dashboardQueue(tx, auth, kind, {})) : null,
      tasks: kind ? [] : plain<{ items: TaskItem[] }>(await listTasks(tx, auth, { limit: '5' })).items,
    };
  });
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 [overflow-wrap:anywhere]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <CountCards counts={data.counts} />
      {kind && data.queue ? (
        <section className="flex min-w-0 flex-col gap-3" aria-labelledby="queue-heading">
          <h2 id="queue-heading" className="text-lg font-semibold">{t(`counts.${kind}.label`)}</h2>
          <Link className="inline-flex min-h-11 items-center underline" href="/coach">{t('queue.back')}</Link>
          {data.queue.items.length === 0
            ? <EmptyState Icon={LayoutDashboard} title={t('queue.emptyTitle')} description={t('queue.emptyBody')} />
            : <QueueList kind={kind} initial={data.queue} />}
        </section>
      ) : <TasksPreview tasks={data.tasks} />}
    </div>
  );
}
