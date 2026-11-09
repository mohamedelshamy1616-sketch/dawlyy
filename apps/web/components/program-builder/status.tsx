'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';

/** Task 4 / spec §61: reuse shared status words and localize version-specific states. */
export function ProgramStatus({ status }: { status: string }) {
  const shared = useTranslations('status');
  const t = useTranslations('programs');
  const label = status === 'draft' ? shared('draft') : status === 'published' ? shared('published')
    : status === 'in_review' ? shared('needsReview') : status === 'approved' ? t('approved') : status === 'superseded' ? t('superseded') : t('archived');
  return <Badge variant="secondary" className="max-w-full whitespace-normal">{label}</Badge>;
}
