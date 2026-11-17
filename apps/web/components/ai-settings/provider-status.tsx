'use client';

import { useTranslations } from 'next-intl';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Link } from '@/i18n/navigation';
import { formatNumber, type NumberLocale, type NumeralSystem } from '@/src/lib/numbers';
import type { AiProviderStatus } from '@/src/server/ai/types';
import { AI_COST_ASSUMPTIONS, AI_COST_ROWS, AI_COST_SOURCE_DATE, type AiCostRow } from './cost-table';

const frame = 'min-w-0 max-w-full';

/** R4d: a transient route fallback; every settled status below is nonbusy. */
export function AiSettingsLoading() {
  const t = useTranslations('aiProvider');
  return <Text as="p" role="status" aria-live="polite" aria-busy="true">{t('loading')}</Text>;
}

/**
 * R4d: presentation accepts only a redacted status and read-only historical data.
 * A key is not consent: legal review and approved data processing remain prerequisites
 * for Mohamed's later explicit activation. Loading this section never calls a provider.
 * The settings-template section stack is reused inside the existing coach shell.
 */
export function ProviderStatus({ status, locale, numerals = 'latn', costs = AI_COST_ROWS }: {
  status: AiProviderStatus | null;
  locale: NumberLocale;
  numerals?: NumeralSystem;
  costs?: readonly Readonly<AiCostRow>[] | null;
}) {
  const t = useTranslations('aiProvider');
  const count = (value: number) => formatNumber(value, { locale, numerals, maximumFractionDigits: 0 });
  const price = (value: number) => formatNumber(value, { locale, numerals, maximumFractionDigits: 2 });
  const assumptions = {
    inputTokens: count(AI_COST_ASSUMPTIONS.inputTokens),
    outputTokens: count(AI_COST_ASSUMPTIONS.outputTokens),
    summaries: count(AI_COST_ASSUMPTIONS.summaries),
  };

  return <VStack gap={6} className={frame} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <VStack gap={2} className={frame}>
      <Link href="/coach/settings" className="inline-flex min-h-11 min-w-11 max-w-full items-center self-start break-words rounded-lg focus-ring">
        {t('backSettings')}
      </Link>
      <Heading level={1} wordBreak="break-word">{t('title')}</Heading>
      <Text as="p" color="secondary" wordBreak="break-word">{t('description')}</Text>
    </VStack>

    <VStack as="section" gap={3} className={frame} aria-labelledby="ai-provider-status-heading">
      <Heading level={2} id="ai-provider-status-heading" wordBreak="break-word">{t('status.title')}</Heading>
      {status ? <>
        <Text as="p" role="status" aria-live="polite" data-testid="ai-provider-status" weight="semibold" wordBreak="break-word">
          {t(`status.${status.state}`)}
        </Text>
        {status.provider !== 'none' ? <Text as="p">{t(`providers.${status.provider}`)}</Text> : null}
        <Text as="p" wordBreak="break-word">{t(`status.${status.reason}`)}</Text>
      </> : <Text as="p" role="alert" data-testid="ai-provider-status" wordBreak="break-word">{t('status.error')}</Text>}
      <Text as="p" wordBreak="break-word">{t('templateExplanation')}</Text>
      <Text as="p" wordBreak="break-word">{t('legalNote')}</Text>
      {status?.state !== 'configured' ? <Text as="p" color="secondary" wordBreak="break-word">{t('status.external_configuration')}</Text> : null}
      <Text as="p" wordBreak="break-word">{t('paidApproval')}</Text>
    </VStack>

    <VStack as="section" gap={3} className={frame} aria-labelledby="ai-costs-heading">
      <Heading level={2} id="ai-costs-heading" wordBreak="break-word">{t('costs.title')}</Heading>
      <Text as="p"><time dateTime={AI_COST_SOURCE_DATE}>{t('costs.sourceDate')}</time></Text>
      <Text as="p" wordBreak="break-word">{t('costs.assumptions', assumptions)}</Text>
      <Text as="p" color="secondary" wordBreak="break-word">{t('costs.labelsNote')}</Text>
      {costs === null ? <Text as="p" role="alert">{t('costs.error')}</Text> : costs.length === 0 ?
        <Text as="p" role="status">{t('costs.empty')}</Text> :
        <List density="spacious" edge="flush" hasDividers className={frame} aria-labelledby="ai-costs-heading">
          {costs.map(row => <ListItem key={row.label} data-ai-cost-row={row.label} className={frame}
            label={<VStack gap={1} className={frame}>
              <Text as="p" type="supporting" wordBreak="break-word">{t('costs.model')}</Text>
              <Heading level={3} wordBreak="break-word">{t(`costs.models.${row.label}`)}</Heading>
            </VStack>}
            description={<dl className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
              <VStack gap={1} className={frame}>
                <dt><Text type="supporting" wordBreak="break-word">{t('costs.tokenPrice')}</Text></dt>
                <dd><Text hasTabularNumbers>{row.inputPerMillion === null || row.outputPerMillion === null ? t('costs.neuronBased') :
                  <bdi>{t('costs.pricePair', { input: price(row.inputPerMillion), output: price(row.outputPerMillion) })}</bdi>}</Text></dd>
              </VStack>
              <VStack gap={1} className={frame}>
                <dt><Text type="supporting" wordBreak="break-word">{t('costs.summaryPrice', { summaries: assumptions.summaries })}</Text></dt>
                <dd><Text hasTabularNumbers><bdi>{price(row.perThousandSummaries)}</bdi></Text></dd>
              </VStack>
            </dl>}
          />)}
        </List>}
    </VStack>
  </VStack>;
}
