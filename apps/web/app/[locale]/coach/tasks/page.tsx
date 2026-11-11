import { connection } from 'next/server';
import { ListChecks } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isAllowed } from '@dawlyy/core/authz';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { TASK_FILTERS, type TaskFilter } from '@/src/server/dashboard/logic';
import { requestTime } from '@/src/server/dashboard/page-data';
import { listTasks } from '@/src/server/dashboard/tasks';
import { EmptyState } from '@/src/components/shell/empty-state';
import { PageHeader } from '@/src/components/shell/page-header';
import { TaskList } from '@/components/dashboard/task-list';
import type { TaskPage } from '@/components/dashboard/types';

/** Task 10: the tasks list with open, snoozed, done and all views; writers also get the new-task form. */
export default async function TasksPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const auth = await requirePage();
  const t = await getTranslations('dashboard.tasks');
  if (!isAllowed(auth, 'dashboard', 'view')) {
    return <div className="flex min-w-0 flex-col gap-6"><PageHeader title={t('title')} /><EmptyState Icon={ListChecks} title={t('noAccessTitle')} /></div>;
  }
  const raw = (await searchParams).state;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const filter: TaskFilter = TASK_FILTERS.find(value => value === requested) ?? 'open';
  const initial = JSON.parse(JSON.stringify(await withAuthTx(auth, tx => listTasks(tx, auth, { state: filter })))) as TaskPage;
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6 [overflow-wrap:anywhere]">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <TaskList key={filter} initial={initial} filter={filter} now={requestTime()} canWrite={isAllowed(auth, 'dashboard', 'create') && isAllowed(auth, 'dashboard', 'edit')} />
    </div>
  );
}
