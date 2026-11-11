'use client';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize } from '@dawlyy/core/types';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { eventBucket, eventStatus, type EventStatus } from '@/src/server/forms/presentation';
import { eventPageSchema, type FormEventItem, type FormEventPage } from './contracts';
import { FormRequestError, formRequest } from './http';

const variants: Record<EventStatus, 'info' | 'error' | 'neutral' | 'warning' | 'success'> = { due: 'info', overdue: 'error', upcoming: 'neutral', waitingForCoach: 'warning', complete: 'success', skipped: 'neutral' };

/** Task 7: the client's due, upcoming and past forms (check-ins or assessments) with the fixed status words. */
export function EventList({ initial, formKind, basePath, now }: { initial: FormEventPage; formKind: 'checkin' | 'assessment'; basePath: string; now: number }) {
  const t = useTranslations('forms');
  const status = useTranslations('status');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  async function more() {
    if (!data.nextCursor) return;
    setBusy(true); setErrorKey('');
    try {
      const result = eventPageSchema.parse(await formRequest(`/forms/events?${new URLSearchParams({ formKind, cursor: data.nextCursor })}`));
      setData(old => ({ items: [...old.items, ...result.items.filter(item => !old.items.some(row => row.id === item.id))], nextCursor: result.nextCursor }));
    } catch (error) { setErrorKey(error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed'); } finally { setBusy(false); }
  }
  const label = (value: EventStatus) => (value === 'upcoming' || value === 'skipped' ? t(`state.${value}`) : status(value));
  const rows = data.items.map(item => ({ item, state: eventStatus(item, now) }));
  const groups = [
    { key: 'due', title: t('client.due'), rows: rows.filter(row => eventBucket(row.state) === 'due') },
    { key: 'upcoming', title: t('client.upcoming'), rows: rows.filter(row => eventBucket(row.state) === 'upcoming') },
    { key: 'past', title: t('client.past'), rows: rows.filter(row => eventBucket(row.state) === 'past') },
  ];
  if (!data.items.length) return <EmptyState title={t(`client.empty.${formKind}.title`)} description={t(`client.empty.${formKind}.description`)} />;

  function row(entry: { item: FormEventItem; state: EventStatus }) {
    const { item, state } = entry;
    const title = localize(item.title, locale) || t(`client.defaultTitle.${formKind}`);
    return <Card key={item.id}>
      <VStack gap={2}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <StackItem size="fill"><Heading level={3} wordBreak="break-word">{title}</Heading></StackItem>
          <Badge label={label(state)} variant={variants[state]} />
        </HStack>
        <Text type="supporting" as="p">{t('client.dueAt', { when: when.format(new Date(item.dueAt)) })}</Text>
        <HStack>
          {state === 'due' || state === 'overdue'
            ? <Button label={t('client.fill')} variant="primary" size="lg" href={`${basePath}/${item.id}`} />
            : state === 'upcoming' ? null
              : <Button label={t('client.view')} variant="secondary" size="lg" href={`${basePath}/${item.id}`} />}
        </HStack>
      </VStack>
    </Card>;
  }

  return <VStack gap={5} maxWidth="100%">
    {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
    {groups.filter(group => group.rows.length).map(group => <VStack key={group.key} gap={3}>
      <Heading level={2}>{group.title}</Heading>
      {group.rows.map(row)}
    </VStack>)}
    {data.nextCursor ? <HStack><Button label={busy ? t('templates.loading') : t('templates.loadMore')} size="lg" isDisabled={busy} onClick={() => void more()} /></HStack> : null}
  </VStack>;
}
