'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import type { ReviewDraftDto } from '@/src/server/review/types';
import { numberLocale } from '@/src/lib/numbers';
import { reviewRequest, ReviewRequestError } from './review-workspace';

/** R4b: a small Week-tab entry; its explicit open performs GET only. */
export function WeeklyReviewCard({ clientId, initial }: { clientId: string; initial: ReviewDraftDto | null }) {
  const t = useTranslations('review');
  const locale = numberLocale(useLocale());
  const [draft, setDraft] = useState(initial);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'forbidden' | 'request' | null>(null);
  const pending = useRef(false);
  async function open() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await reviewRequest<{ draft: ReviewDraftDto | null }>(`/api/v1/clients/${clientId}/review`);
      setDraft(result.draft); setOpened(true);
    } catch (failure) {
      setDraft(null); setError(failure instanceof ReviewRequestError && failure.status === 403 ? 'forbidden' : 'request');
    } finally { pending.current = false; setBusy(false); }
  }
  return <Card className="min-w-0 max-w-full" padding={4}>
    <VStack gap={3} className="min-w-0 max-w-full" dir={locale === 'ar' ? 'rtl' : 'ltr'} aria-busy={busy}>
      <Heading level={3} wordBreak="break-word">{t('card.title')}</Heading>
      <Text as="p" color="secondary" wordBreak="break-word">{t('card.body')}</Text>
      <Button label={t(opened ? 'refresh' : 'card.open')} size="lg" className="min-h-11" variant="secondary" isDisabled={busy} onClick={() => void open()} />
      {busy ? <Text as="p" role="status">{t('loading')}</Text> : null}
      {error ? <Text as="p" role="alert">{t(`errors.${error}`)}</Text> : null}
      {opened && !error ? <>
        <Text as="p" role="status">{draft ? t(`status.${draft.status}`) : t('empty.title')}</Text>
        <Link href={`/coach/clients/${clientId}/review`} className="inline-flex min-h-11 min-w-11 max-w-full items-center break-words rounded-lg underline focus-ring">{t('card.workspace')}</Link>
      </> : null}
    </VStack>
  </Card>;
}
