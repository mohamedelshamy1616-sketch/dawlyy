'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Text } from '@astryxdesign/core/Text';

/** T3b / spec §61: reuse fixed global status words where registered. */
export function BillingStatus({ value }: { value: string }) {
  const status = useTranslations('status'); const t = useTranslations('billing');
  const fixed: Record<string, string> = { active: 'active', paused: 'paused', cancelled: 'cancelled', expired: 'expired', completed: 'complete', due: 'due', overdue: 'overdue' };
  return <Text type="supporting" weight="medium" className="max-w-full whitespace-normal">{fixed[value] ? status(fixed[value]) : t(`states.${value}`)}</Text>;
}
/** T3b: all money labels use the active locale and currency. */
export function BillingMoney({ amount, currency }: { amount: number; currency: string }) {
  return <Text hasTabularNumbers>{new Intl.NumberFormat(useLocale(), { style: 'currency', currency }).format(amount)}</Text>;
}
/** T3b: local calendar dates never drift through the browser timezone. */
export function BillingDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat(useLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))}</time>;
}
