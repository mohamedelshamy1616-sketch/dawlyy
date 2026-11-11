'use client';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { useLocale, useTranslations } from 'next-intl';
import type { WorkoutSummary } from '@/src/server/workout/contracts';

/** Task 5: the same core comparison shape renders offline estimates and authoritative server summaries. */
export function FinishSummary({ summary, pending = false }: { summary: WorkoutSummary; pending?: boolean }) {
  const t = useTranslations('workout'); const locale = useLocale(); const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return <VStack as="section" className="min-w-0 rounded-2xl border border-brand/40 bg-brand-soft/30 p-5" aria-label={t('summary')} data-testid="finish-summary">
    <Heading level={2} className="text-xl font-bold">{t('wellDone')}</Heading>{pending ? <Text as="p" className="my-2 text-sm">{t('summaryPending')}</Text> : null}
    <dl className="mt-4 grid grid-cols-2 gap-3">{(['volume', 'reps', 'topLoad', 'completionPct'] as const).map(key => <VStack className="min-w-0 rounded-xl bg-card p-3" key={key}>
      <dt className="text-sm">{t(key)}</dt><dd className="break-words text-xl font-semibold tabular-nums">{fmt.format(summary[key].current)} {t(key === 'completionPct' ? 'percent' : key === 'volume' ? 'volumeUnit' : key === 'topLoad' ? 'units.kg' : 'repUnit')}</dd>
      {summary.comparable && summary[key].delta !== null ? <dd className="text-sm">{t('delta', { value: fmt.format(summary[key].delta) })}{summary[key].pct !== null ? ` (${fmt.format(summary[key].pct)}${t('percent')})` : ''}</dd> : null}
    </VStack>)}</dl>
    {!summary.comparable ? <Text as="p" className="mt-4 text-sm">{t('notComparable')}</Text> : null}
  </VStack>;
}
