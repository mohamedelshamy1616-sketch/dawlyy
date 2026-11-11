'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { TASK_FILTERS, snoozeTarget, taskMatchesFilter, type TaskFilter } from '@/src/server/dashboard/logic';
import { formatDate, sendJson } from './format';
import type { TaskItem, TaskPage } from './types';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const BADGE = { low: 'gray', normal: 'blue', high: 'orange', urgent: 'red' } as const;

/** Task 10: a task row with quick complete, snooze (tomorrow, next week) and reopen. */
function TaskRow({ task, canWrite, now, onChange }: { task: TaskItem; canWrite: boolean; now: number; onChange: (task: TaskItem) => void }) {
  const t = useTranslations('dashboard.tasks'); const locale = useLocale();
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  async function act(action: 'complete' | 'reopen' | 'snooze', body?: unknown) {
    setBusy(true); setFailed(false);
    try { onChange(await sendJson<TaskItem>(`/api/v1/tasks/${task.id}/${action}`, 'POST', body)); }
    catch { setFailed(true); } finally { setBusy(false); }
  }
  const overdue = task.dueAt !== null && Date.parse(task.dueAt) < now && (task.state === 'open' || task.state === 'snoozed');
  const closed = task.state === 'done' || task.state === 'cancelled';
  const snooze = (preset: 'tomorrow' | 'nextWeek') => void act('snooze', { until: snoozeTarget(preset, new Date()).toISOString() });
  return (
    <li className="min-w-0 border-b py-3">
      <VStack gap={2} className="min-w-0">
        <HStack gap={2} wrap="wrap" align="center" className="min-w-0">
          <Badge label={t(`priority.${task.priority}`)} variant={BADGE[task.priority]} />
          <Text weight="semibold" className="min-w-0 break-words">{task.title}</Text>
        </HStack>
        {task.detail ? <Text type="supporting" className="break-words">{task.detail}</Text> : null}
        <HStack gap={3} wrap="wrap" className="min-w-0">
          {task.clientId ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${task.clientId}/timeline`}>{t('forClient', { name: task.clientName ?? '' })}</Link> : null}
          <Text type="supporting">{task.dueAt ? t('dueOn', { date: formatDate(task.dueAt, locale, true) }) : t('noDue')}</Text>
          {overdue ? <Text type="supporting" color="accent">{t('overdue')}</Text> : null}
          {task.state === 'snoozed' && task.snoozedUntil ? <Text type="supporting">{t('snoozedUntil', { date: formatDate(task.snoozedUntil, locale, true) })}</Text> : null}
          {task.completedAt ? <Text type="supporting">{t('completedOn', { date: formatDate(task.completedAt, locale, true) })}</Text> : null}
          {task.source !== 'manual' ? <Text type="supporting">{t('systemTask')}</Text> : null}
        </HStack>
        {canWrite ? (
          <HStack gap={2} wrap="wrap">
            {closed ? <Button label={t('reopen')} className="min-h-11" isDisabled={busy} onClick={() => void act('reopen')} /> : (
              <>
                <Button label={t('complete')} variant="primary" className="min-h-11" isDisabled={busy} onClick={() => void act('complete')} />
                <Button label={`${t('snooze')}: ${t('snoozeTomorrow')}`} className="min-h-11" isDisabled={busy} onClick={() => snooze('tomorrow')} />
                <Button label={`${t('snooze')}: ${t('snoozeNextWeek')}`} className="min-h-11" isDisabled={busy} onClick={() => snooze('nextWeek')} />
              </>
            )}
          </HStack>
        ) : null}
        {failed ? <Text role="alert">{t('actionError')}</Text> : null}
      </VStack>
    </li>
  );
}

/** Task 10: the new-task form; posts to the tasks API and hands the created task back. */
function NewTask({ onCreated }: { onCreated: (task: TaskItem) => void }) {
  const t = useTranslations('dashboard.tasks');
  const [title, setTitle] = useState(''); const [detail, setDetail] = useState(''); const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('normal');
  const [dueAt, setDueAt] = useState<ISODateTimeString | undefined>(undefined); const [busy, setBusy] = useState(false); const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true); setStatus('idle');
    try {
      const created = await sendJson<TaskItem>('/api/v1/tasks', 'POST', {
        title: title.trim(), priority, ...(detail.trim() ? { detail: detail.trim() } : {}), ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      });
      onCreated(created); setTitle(''); setDetail(''); setDueAt(undefined); setPriority('normal'); setStatus('ok');
    } catch { setStatus('error'); } finally { setBusy(false); }
  }
  return (
    <VStack as="section" gap={3} className="min-w-0 max-w-full">
      <Heading level={2}>{t('newHeading')}</Heading>
      <TextInput label={t('titleLabel')} placeholder={t('titlePlaceholder')} value={title} onChange={setTitle} isRequired />
      <TextInput label={t('detailLabel')} value={detail} onChange={setDetail} />
      <Selector label={t('priorityLabel')} value={priority} onChange={value => setPriority(PRIORITIES.find(p => p === value) ?? 'normal')}
        options={PRIORITIES.map(value => ({ value, label: t(`priority.${value}`) }))} />
      <DateTimeInput label={t('dueLabel')} value={dueAt} onChange={setDueAt} isOptional hasClear />
      <HStack gap={3} wrap="wrap" align="center">
        <Button label={busy ? t('adding') : t('add')} variant="primary" className="min-h-11" isDisabled={busy || !title.trim()} onClick={() => void submit()} />
        {status === 'ok' ? <Text role="status">{t('createdOk')}</Text> : null}
        {status === 'error' ? <Text role="alert">{t('actionError')}</Text> : null}
      </HStack>
    </VStack>
  );
}

/** Task 10: filter tabs, the tasks list with keyset "show more", and the new-task form for writers. */
export function TaskList({ initial, filter, canWrite, now }: { initial: TaskPage; filter: TaskFilter; canWrite: boolean; now: number }) {
  const t = useTranslations('dashboard.tasks');
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(now);
  function apply(task: TaskItem) {
    const at = Date.now(); setClock(at);
    setData(current => ({ ...current, items: current.items.flatMap(item => item.id !== task.id ? [item] : taskMatchesFilter(task, filter, at) ? [task] : []) }));
  }
  function created(task: TaskItem) {
    if (taskMatchesFilter(task, filter, Date.now())) setData(current => ({ ...current, items: [task, ...current.items] }));
  }
  async function more() {
    if (!data.nextCursor || busy) return;
    setBusy(true); setFailed(false);
    try {
      const next = await sendJson<TaskPage>(`/api/v1/tasks?state=${filter}&cursor=${encodeURIComponent(data.nextCursor)}`, 'GET');
      setData(current => ({ items: [...current.items, ...next.items.filter(row => !current.items.some(known => known.id === row.id))], nextCursor: next.nextCursor }));
    } catch { setFailed(true); } finally { setBusy(false); }
  }
  return (
    <VStack gap={5} className="min-w-0 max-w-full">
      <HStack as="nav" gap={2} wrap="wrap" aria-label={t('filters.label')}>
        {TASK_FILTERS.map(value => (
          <Link key={value} href={`/coach/tasks?state=${value}`} aria-current={value === filter ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 ${value === filter ? 'bg-brand-soft font-semibold' : ''}`}>{t(`filters.${value}`)}</Link>
        ))}
      </HStack>
      {canWrite ? <NewTask onCreated={created} /> : <Text type="supporting">{t('readOnly')}</Text>}
      {data.items.length === 0 ? (
        <VStack gap={1} className="rounded-2xl border border-dashed p-6 text-center">
          <Heading level={2}>{t('emptyTitle')}</Heading>
          <Text type="supporting">{t('emptyBody')}</Text>
        </VStack>
      ) : (
        <ul className="m-0 flex min-w-0 list-none flex-col p-0">
          {data.items.map(task => <TaskRow key={task.id} task={task} canWrite={canWrite} now={clock} onChange={apply} />)}
        </ul>
      )}
      <HStack gap={3} wrap="wrap">
        {data.nextCursor ? <Button label={t('loadMore')} className="min-h-11" isDisabled={busy} onClick={() => void more()} /> : null}
        {failed ? <Text role="alert">{t('actionError')}</Text> : null}
      </HStack>
    </VStack>
  );
}
