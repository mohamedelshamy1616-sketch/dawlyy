'use client';
import { useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';

/** Task 7 / spec §61: reuse the shared status words and localize the version-only states. */
export function FormStatus({ status }: { status: string }) {
  const shared = useTranslations('status');
  const t = useTranslations('forms');
  const label = status === 'draft' ? shared('draft') : status === 'published' ? shared('published')
    : status === 'approved' ? t('state.approved') : status === 'superseded' ? t('state.superseded') : t('state.archived');
  return <Badge label={label} variant={status === 'published' ? 'success' : status === 'draft' ? 'neutral' : 'warning'} />;
}
