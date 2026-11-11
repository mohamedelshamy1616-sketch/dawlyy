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
import { FormRequestError, formRequest } from '../form-runner/http';
import { queueSchema, type FormKind, type ReviewQueue as Queue } from './contracts';

/** Task 7: review links are shared by every kind; assessments keep their own route. */
export function reviewPath(formKind: string, id: string): string {
  return `/coach/${formKind === 'assessment' ? 'assessments' : 'checkins'}/review/${id}`;
}

/** Task 7 / G9: submitted forms waiting for the coach, newest first, with flags such as missing photos. */
export function ReviewQueue({ initial, formKind }: { initial: Queue; formKind: FormKind }) {
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
      const result = queueSchema.parse(await formRequest(`/submissions?${new URLSearchParams({ formKind, cursor: data.nextCursor })}`));
      setData(old => ({ items: [...old.items, ...result.items.filter(item => !old.items.some(row => row.id === item.id))], nextCursor: result.nextCursor }));
    } catch (error) { setErrorKey(error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed'); } finally { setBusy(false); }
  }

  if (!data.items.length) return <EmptyState title={t('queue.emptyTitle')} description={t('queue.emptyDescription')} />;
  return <VStack gap={3} maxWidth="100%">
    {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
    {data.items.map(item => <Card key={item.id}>
      <VStack gap={2}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <StackItem size="fill"><Heading level={3} wordBreak="break-word">{item.clientName}</Heading></StackItem>
          <Badge label={status('waitingForCoach')} variant="warning" />
        </HStack>
        <Text as="p" wordBreak="break-word">{localize(item.name, locale)}</Text>
        {item.submittedAt ? <Text type="supporting" as="p">{t('queue.submittedAt', { when: when.format(new Date(item.submittedAt)) })}</Text> : null}
        {item.flags.length ? <HStack gap={1} wrap="wrap">{item.flags.map(flag => <Badge key={flag} label={t(`queue.flags.${flag}`)} variant="orange" />)}</HStack> : null}
        <HStack><Button label={t('queue.review')} variant="primary" size="lg" href={reviewPath(item.formKind, item.id)} /></HStack>
      </VStack>
    </Card>)}
    {data.nextCursor ? <HStack><Button label={busy ? t('templates.loading') : t('templates.loadMore')} size="lg" isDisabled={busy} onClick={() => void more()} /></HStack> : null}
  </VStack>;
}
