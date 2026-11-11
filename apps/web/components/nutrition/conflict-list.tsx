'use client';
import { useTranslations } from 'next-intl';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

/** Task 6: one flag from POST /nutrition/reuse-check (core planConflicts plus the schedule check). */
export type ReuseConflict = { code: string; detail: string };
const KNOWN = ['allergen', 'kcal_mismatch', 'protein_low', 'schedule', 'plan_invalid'] as const;

/** Task 6: conflict flags shown before a template is copied to another client; nothing is written by this view. */
export function ConflictList({ conflicts }: { conflicts: ReuseConflict[] }) {
  const t = useTranslations('nutrition');
  if (!conflicts.length) return <Banner status="success" title={t('assign.noConflicts')} />;
  return <VStack gap={2} width="100%" as="ul">{conflicts.map((conflict, index) => {
    const code = KNOWN.find(k => k === conflict.code);
    return <li key={`${conflict.code}-${index}`} className="min-w-0 list-none"><Banner status={code === 'plan_invalid' ? 'error' : 'warning'} title={t(`conflicts.${code ?? 'unknown'}`)}
      description={conflict.detail ? <Text as="span" wordBreak="break-word">{conflict.detail}</Text> : undefined} /></li>;
  })}</VStack>;
}
