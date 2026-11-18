'use client';
import { Inbox } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { AttentionReason } from '@dawlyy/core/attention';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';
import { formatNumber, numberLocale, type NumeralSystem } from '@/src/lib/numbers';
import { InboxAction } from './action-button';
import type { InboxData } from './types';

const statuses = { review: 'needsReview', reply: 'waitingForCoach', confirm_payment: 'waitingForCoach', renew: 'due', handle_flag: 'needsReview', nudge: 'due' } as const;

/** R1b: dense person-first rows, one main reason/action and a short secondary reasons line. */
export function InboxList({ data, numerals = 'latn' }: { data: InboxData; numerals?: NumeralSystem }) {
  const t = useTranslations('inbox'); const status = useTranslations('status'); const locale = useLocale();
  const format = { locale: numberLocale(locale), numerals };
  /** Every numeric reason parameter also arrives as `<name>Shown`, formatted with the user's numerals; plural rules still read the raw number. */
  function shown(params: AttentionReason['params']) {
    return Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === 'number').map(([key, value]) => [`${key}Shown`, formatNumber(value as number, { ...format, maximumFractionDigits: 2 })]));
  }
  function reasonText(reason: AttentionReason): string {
    if (reason.code === 'red_flag') return t('reasons.red_flag', { category: t(`categories.${String(reason.params.category)}`) });
    if (reason.code === 'no_contact' && reason.params.days === 999) return t('noContactYet');
    return t(`reasons.${reason.code}`, { ...reason.params, ...shown(reason.params) });
  }
  if (!data.items.length) return <EmptyState Icon={Inbox} title={t('emptyTitle')} description={t('emptyBody')} />;
  return <VStack gap={2} className="min-w-0 max-w-full">
    <Text type="supporting">{t('needsAttention', { count: data.items.length, shown: formatNumber(data.items.length, { ...format, maximumFractionDigits: 0 }) })} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: numerals }).format(new Date(`${data.today}T12:00:00Z`))}</Text>
    <ul className="m-0 min-w-0 max-w-full list-none p-0">
      {data.items.map(item => <li key={item.client.id} className="min-w-0 max-w-full border-b py-4">
        <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between" className="min-w-0 max-w-full">
          <VStack gap={1} className="min-w-0 flex-1 basis-48">
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Link href={`/coach/clients/${item.client.id}`} className="focus-ring inline-flex min-h-11 min-w-0 items-center break-words font-semibold">{item.client.displayName}</Link>
              <Text type="supporting" size="xsm" className="rounded-full bg-muted px-2 py-1">{status(item.reasons[0]?.code === 'checkin_overdue' ? 'overdue' : item.reasons[0]?.code === 'subscription_ended' ? 'expired' : statuses[item.primaryAction])}</Text>
            </HStack>
            <Text weight="semibold" className="break-words">{item.reasons[0] ? reasonText(item.reasons[0]) : ''}</Text>
            <Text type="supporting" size="xsm" className="break-words">{item.client.code}{item.reasons.length > 1 ? ` · ${item.reasons.slice(1).map(reasonText).join(' · ')}` : ''}</Text>
          </VStack>
          <InboxAction item={item} />
        </HStack>
      </li>)}
    </ul>
  </VStack>;
}
