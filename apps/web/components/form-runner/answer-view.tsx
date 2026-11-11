'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localize, type AnswerValue, type Question } from '@dawlyy/core/types';
import { z } from 'zod';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { formRequest } from './http';

function Attachment({ id, type }: { id: string; type: Question['type'] }) {
  const t = useTranslations('forms');
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    formRequest(`/media/${encodeURIComponent(id)}/url`).then(data => {
      const next = z.object({ url: z.string() }).parse(data).url;
      // Signed capabilities may be same-origin paths or HTTPS storage URLs.
      if (!next.startsWith('/') && !next.startsWith('https://')) throw new Error('Invalid URL');
      if (active) setUrl(next);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id]);
  if (failed) return <Text color="secondary" as="p">{t('runner.mediaUnavailable')}</Text>;
  if (!url) return <Text color="secondary" as="p">{t('runner.loadingMedia')}</Text>;
  if (type === 'photo') {
    return <Link href={url} isExternalLink newTabLabel={t('runner.opensInNewTab')}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated expiring URLs cannot use the image optimizer. */}
      <img src={url} alt={t('runner.attachment')} width={320} height={240} className="h-auto max-h-64 max-w-full object-contain" />
    </Link>;
  }
  if (type === 'video') {
    return <video src={url} controls className="max-h-64 max-w-full" />;
  }
  return <Link href={url} isExternalLink newTabLabel={t('runner.opensInNewTab')}>{t('runner.openFile')}</Link>;
}

/** Task 7: ordered, localized answer rendering shared by coach reviews and client submission history. */
export function AnswerView({ question, value }: { question: Question; value: AnswerValue | undefined }) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('forms');
  const none = <Text color="secondary" as="p">{t('runner.unanswered')}</Text>;
  if (value === null || value === undefined || value === '' || Array.isArray(value) && !value.length) return none;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value.mediaIds.length
      ? <VStack gap={2}>{value.mediaIds.map(id => <Attachment key={id} id={id} type={question.type} />)}</VStack>
      : none;
  }
  if (typeof value === 'boolean') return <Text as="p">{t(value ? 'runner.yes' : 'runner.no')}</Text>;
  if (typeof value === 'number') return <Text as="p">{[new Intl.NumberFormat(locale).format(value), question.unit].filter(Boolean).join(' ')}</Text>;
  const option = (raw: string) => localize(question.options?.find(item => item.value === raw)?.label, locale) || raw;
  if (Array.isArray(value)) return <Text as="p" wordBreak="break-word">{value.map(option).join(locale === 'ar' ? '، ' : ', ')}</Text>;
  if (question.type === 'date') return <Text as="p">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))}</Text>;
  if (question.type === 'time') return <Text as="p">{new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`2000-01-01T${value}:00Z`))}</Text>;
  return <Text as="p" wordBreak="break-word">{option(value)}</Text>;
}
