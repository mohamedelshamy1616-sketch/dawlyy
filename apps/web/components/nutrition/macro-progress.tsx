'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { VStack } from '@astryxdesign/core/VStack';
import type { Macros } from '@dawlyy/core/types';

const KEYS = ['kcal', 'proteinG', 'carbsG', 'fatG'] as const;

/** Task 6: client-facing macro bar. Values arrive from the core nutrition functions; this only draws them against the targets. */
export function MacroProgress({ macros, targets }: { macros: Macros; targets: Macros }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return <VStack gap={2} width="100%">{KEYS.map(key => {
    const max = Math.max(targets[key], 1); const over = macros[key] > max * 1.1;
    return <ProgressBar key={key} label={t(`macros.${key}`)} value={Math.min(macros[key], max)} max={max} hasValueLabel variant={over ? 'warning' : 'accent'}
      formatValueLabel={() => t('macros.progress', { value: n.format(macros[key]), target: n.format(targets[key]) })} />;
  })}</VStack>;
}
