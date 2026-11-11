'use client';
import { useLocale, useTranslations } from 'next-intl';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { CountItem } from './types';

/** Task 10: one linked card per attention count; zero counts stay visible but muted. */
export function CountCards({ counts }: { counts: CountItem[] }) {
  const t = useTranslations('dashboard.counts');
  const fmt = new Intl.NumberFormat(useLocale());
  return (
    <Grid columns={{ minWidth: 160 }} gap={3} className="min-w-0 max-w-full">
      {counts.map(({ kind, count, href }) => (
        <ClickableCard key={kind} href={href} label={`${t(`${kind}.label`)}: ${fmt.format(count)}`} variant={count === 0 ? 'muted' : 'default'} padding={4} className="min-h-11 min-w-0">
          <VStack gap={1} className="min-w-0">
            <Text type="supporting" className="break-words">{t(`${kind}.label`)}</Text>
            <Text type="display-2" weight="bold">{fmt.format(count)}</Text>
            <Text type="supporting" size="xsm" className="break-words">{t(`${kind}.hint`)}</Text>
          </VStack>
        </ClickableCard>
      ))}
    </Grid>
  );
}
