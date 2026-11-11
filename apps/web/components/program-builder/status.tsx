'use client';

import { Text } from '@astryxdesign/core/Text';

import { useTranslations } from 'next-intl';

/** Task 4 / spec §61: reuse shared status words and localize version-specific states. */
export function ProgramStatus({ status }: { status: string }) {
  const shared = useTranslations('status');
  const t = useTranslations('programs');
  const label = status === 'draft' ? shared('draft') : status === 'published' ? shared('published')
    : status === 'in_review' ? shared('needsReview') : status === 'approved' ? t('approved') : status === 'superseded' ? t('superseded') : t('archived');
  return <Text type="label" className="max-w-full rounded-full bg-muted ps-3 pe-3 py-1 whitespace-normal">{label}</Text>;
}
