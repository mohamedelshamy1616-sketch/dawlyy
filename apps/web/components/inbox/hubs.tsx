'use client';
import { useTranslations } from 'next-intl';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@/i18n/navigation';
import { QueueList } from '@/components/dashboard/queue-list';
import type { QueuePage } from '@/components/dashboard/types';
import { LIBRARY_LINKS, LIBRARY_TOOL_LINKS, MONEY_LINKS } from '@/src/components/shell/hub-links';

/** R1b: library hub link lists are shared with the palette and reachability test. */
export { LIBRARY_LINKS, LIBRARY_TOOL_LINKS, MONEY_LINKS } from '@/src/components/shell/hub-links';

/** R1b: list and archive links stay siblings, never nested clickable controls. */
export function LibraryHub() {
  const t = useTranslations('nav');
  return <VStack gap={6} className="min-w-0 max-w-full">
    <Grid columns={{ minWidth: 240 }} gap={4} className="min-w-0 max-w-full">
      {LIBRARY_LINKS.map(link => <VStack key={link.href} gap={1} className="min-w-0">
        <ClickableCard href={link.href} label={t(`coach.${link.key}`)} padding={4} className="min-h-20 min-w-0">
          <Heading level={2}>{t(`coach.${link.key}`)}</Heading>
        </ClickableCard>
        <Link href={`${link.href}${link.href.includes('?') ? '&' : '?'}archived=true`} className="focus-ring inline-flex min-h-11 items-center self-start px-2 text-sm underline" aria-label={t('archivedFor', { name: t(`coach.${link.key}`) })}>{t('archived')}</Link>
      </VStack>)}
    </Grid>
    <VStack gap={2}><Heading level={2}>{t('libraryTools')}</Heading>
      <HStack gap={3} wrap="wrap">{LIBRARY_TOOL_LINKS.map(link => <Link key={link.href} href={link.href} className="focus-ring inline-flex min-h-11 items-center rounded-lg border px-3 text-sm hover:bg-muted">{t(`coach.${link.key}`)}</Link>)}</HStack>
    </VStack>
  </VStack>;
}

/** R1b: payments and renewals point to existing billing/queue screens. */
export function MoneyHub() {
  const t = useTranslations('nav');
  return <Grid columns={{ minWidth: 240 }} gap={4} className="min-w-0 max-w-full">
    {MONEY_LINKS.map(link => <ClickableCard key={link.href} href={link.href} label={t(`coach.${link.key}`)} padding={4} className="min-h-20 min-w-0">
      <VStack gap={1}><Heading level={2}>{t(`coach.${link.key}`)}</Heading><Text type="supporting">{t(`moneyHints.${link.key}`)}</Text></VStack>
    </ClickableCard>)}
  </Grid>;
}

/** R1b: the renewals preview uses dashboard pagination and exact subscription links. */
export function MoneyRenewals({ data }: { data: QueuePage | null }) {
  const t = useTranslations('nav');
  return <VStack gap={3} className="min-w-0 max-w-full">
    <Heading level={2}>{t('coach.renewals')}</Heading>
    {data ? data.items.length ? <QueueList kind="expiring_subscriptions" initial={data} /> : <Text>{t('renewalsEmpty')}</Text> : <Text>{t('renewalsAccess')}</Text>}
  </VStack>;
}
