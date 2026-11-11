'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { VStack } from '@astryxdesign/core/VStack';

/** Quick-add amounts in millilitres (250 ml glass, 500 ml bottle). */
export const WATER_STEPS = [250, 500] as const;

/** Task 6: client water counter. Entries are append-only, so the counter only adds. */
export function WaterCounter({ totalMl, targetMl, disabled, onAdd }: { totalMl: number; targetMl?: number; disabled?: boolean; onAdd: (ml: number) => void }) {
  const t = useTranslations('nutrition'); const locale = useLocale(); const n = new Intl.NumberFormat(locale);
  return <Card padding={4}><VStack gap={3} width="100%">
    <Heading level={3} type="display-3">{t('client.water')}</Heading>
    {targetMl && targetMl > 0
      ? <ProgressBar label={t('client.water')} isLabelHidden value={Math.min(totalMl, targetMl)} max={targetMl} hasValueLabel variant="accent" formatValueLabel={() => t('client.waterProgress', { value: n.format(totalMl), target: n.format(targetMl) })} />
      : <Heading level={4} type="display-3">{t('client.waterTotal', { value: n.format(totalMl) })}</Heading>}
    <HStack gap={2} wrap="wrap">{WATER_STEPS.map(ml => <Button key={ml} size="lg" variant="secondary" isDisabled={disabled} label={t('client.addWater', { value: n.format(ml) })} onClick={() => onAdd(ml)} />)}</HStack>
  </VStack></Card>;
}
