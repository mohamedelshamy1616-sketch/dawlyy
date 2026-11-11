'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { Receipt } from 'lucide-react';
import { BillingDate, BillingMoney, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingClient, BillingPayment, BillingSubscription } from './types';
import { Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';

/** T3b: paginated billing tabs with pending payments first and a complete pending count. */
export function BillingOverview({ payments: initialPayments, subscriptions: initialSubscriptions, clients, pendingCount, paymentCursor, subscriptionCursor }: {
  payments: BillingPayment[]; subscriptions: BillingSubscription[]; clients: BillingClient[]; pendingCount: number; paymentCursor: string | null; subscriptionCursor: string | null;
}) {
  const t = useTranslations('billing'); const locale = useLocale();
  const id = useId(); const [tab, setTab] = useState('payments');
  const [payments, setPayments] = useState(initialPayments); const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [pCursor, setPCursor] = useState(paymentCursor); const [sCursor, setSCursor] = useState(subscriptionCursor);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const names = new Map(clients.map((c) => [c.id, c.name]));
  async function more(kind: 'payments' | 'subscriptions') {
    setBusy(true); setError(false);
    try {
      const cursor = kind === 'payments' ? pCursor : sCursor;
      if (!cursor) return;
      if (kind === 'payments') {
        const result = await billingRequest<{ items: BillingPayment[]; nextCursor: string | null }>(`/payments?cursor=${encodeURIComponent(cursor)}`);
        setPayments((rows) => [...rows, ...result.items]); setPCursor(result.nextCursor);
      } else {
        const result = await billingRequest<{ items: BillingSubscription[]; nextCursor: string | null }>(`/subscriptions?cursor=${encodeURIComponent(cursor)}`);
        setSubscriptions((rows) => [...rows, ...result.items]); setSCursor(result.nextCursor);
      }
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <VStack gap={3} className="min-w-0 max-w-full">
    <TabList role="tablist" value={tab} onChange={setTab} className="min-w-0 max-w-full" hasDivider>
      <Tab id={`${id}-payments-tab`} value="payments" panelId={`${id}-payments-panel`} className="min-h-11" onFocus={() => setTab('payments')} label={t('payments')} endContent={<Badge aria-label={t('pendingCount')} label={new Intl.NumberFormat(locale).format(pendingCount)} />} />
      <Tab id={`${id}-subscriptions-tab`} value="subscriptions" panelId={`${id}-subscriptions-panel`} className="min-h-11" onFocus={() => setTab('subscriptions')} label={t('subscriptions')} />
    </TabList>
    {tab === 'payments' ? <VStack role="tabpanel" id={`${id}-payments-panel`} aria-labelledby={`${id}-payments-tab`} tabIndex={0} gap={3} className="min-w-0">
      {payments.length === 0 ? <EmptyState Icon={Receipt} title={t('emptyPayments')} /> : payments.map((p) => <Card key={p.id}><VStack gap={2} className="min-w-0 break-words">
        <HStack wrap="wrap" align="center" justify="between" gap={2}><Link className="inline-flex min-h-11 items-center font-medium underline" href={`/coach/billing/payments/${p.id}`}>{names.get(p.clientId) ?? t('client')}</Link><BillingStatus value={p.state} /></HStack>
        <Text as="p" display="block"><BillingMoney amount={p.amount} currency={p.currency} /> · {t(`methods.${p.method}`)}</Text><Text as="p" display="block">{t('receipt')}: {p.receiptNo ?? t('awaitingVerification')}</Text>
      </VStack></Card>)}
      {pCursor ? <Button className="min-h-11 self-start" isDisabled={busy} onClick={() => void more('payments')} label={t(busy ? 'working' : 'loadMore')} variant="primary" /> : null}
    </VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-payments-panel`} aria-labelledby={`${id}-payments-tab`} tabIndex={0} />}
    {tab === 'subscriptions' ? <VStack role="tabpanel" id={`${id}-subscriptions-panel`} aria-labelledby={`${id}-subscriptions-tab`} tabIndex={0} gap={3} className="min-w-0">
      {subscriptions.length === 0 ? <EmptyState Icon={Receipt} title={t('emptySubscriptions')} /> : subscriptions.map((s) => <Card key={s.id}><VStack gap={2} className="min-w-0 break-words">
        <Link className="inline-flex min-h-11 items-center font-medium underline" href={`/coach/clients/${s.clientId}/subscription`}>{names.get(s.clientId) ?? t('client')}</Link>
        <Text as="p" display="block">{locale === 'ar' ? s.packageSnapshot.name.ar ?? s.packageSnapshot.name.en : s.packageSnapshot.name.en ?? s.packageSnapshot.name.ar}</Text>
        <BillingStatus value={s.state} /><Text as="p" display="block">{t('endsOn')}: <BillingDate value={s.endsOn} /></Text>
      </VStack></Card>)}
      {sCursor ? <Button className="min-h-11 self-start" isDisabled={busy} onClick={() => void more('subscriptions')} label={t(busy ? 'working' : 'loadMore')} variant="primary" /> : null}
    </VStack> : <VStack hidden className="!hidden" role="tabpanel" id={`${id}-subscriptions-panel`} aria-labelledby={`${id}-subscriptions-tab`} tabIndex={0} />}
    {error ? <Text as="p" display="block" role="alert">{t('requestFailed')}</Text> : null}
  </VStack>;
}
