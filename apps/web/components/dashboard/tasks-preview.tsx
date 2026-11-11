'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { formatDate } from './format';
import type { TaskItem } from './types';

const BADGE = { low: 'gray', normal: 'blue', high: 'orange', urgent: 'red' } as const;

/** Task 10: the first few open tasks on the dashboard, linking to the full list. */
export function TasksPreview({ tasks }: { tasks: TaskItem[] }) {
  const t = useTranslations('dashboard'); const p = useTranslations('dashboard.tasks'); const locale = useLocale();
  return (
    <VStack as="section" gap={3} className="min-w-0 max-w-full">
      <HStack justify="between" align="center" wrap="wrap" gap={2}>
        <Heading level={2}>{t('tasksPreview.title')}</Heading>
        <Link className="inline-flex min-h-11 items-center underline" href="/coach/tasks">{t('tasksPreview.all')}</Link>
      </HStack>
      {tasks.length === 0 ? <Text type="supporting">{t('tasksPreview.empty')}</Text> : (
        <ul className="m-0 min-w-0 list-none p-0">
          {tasks.map(task => (
            <li key={task.id} className="min-w-0 border-b py-3">
              <HStack gap={2} wrap="wrap" align="center" className="min-w-0">
                <Badge label={p(`priority.${task.priority}`)} variant={BADGE[task.priority]} />
                <Text className="min-w-0 break-words">{task.title}</Text>
                <Text type="supporting">{task.dueAt ? p('dueOn', { date: formatDate(task.dueAt, locale, true) }) : p('noDue')}</Text>
              </HStack>
            </li>
          ))}
        </ul>
      )}
    </VStack>
  );
}
