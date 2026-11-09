'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Receipt } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/src/components/shell/empty-state';
import { BillingDate, BillingMoney, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingClient, BillingPayment, BillingSubscription } from './types';

/** T3b: paginated billing tabs with pending payments first and a complete pending count. */
export function BillingOverview({ payments: initialPayments, subscriptions: initialSubscriptions, clients, pendingCount, paymentCursor, subscriptionCursor }: {
  payments: BillingPayment[]; subscriptions: BillingSubscription[]; clients: BillingClient[]; pendingCount: number; paymentCursor: string | null; subscriptionCursor: string | null;
}) {
  const t = useTranslations('billing'); const locale = useLocale();
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
  return <Tabs defaultValue="payments" className="min-w-0 max-w-full">
    <TabsList className="h-auto max-w-full flex-wrap"><TabsTrigger value="payments" className="min-h-11">{t('payments')} <Badge className="ms-2" aria-label={t('pendingCount')}>{new Intl.NumberFormat(locale).format(pendingCount)}</Badge></TabsTrigger>
      <TabsTrigger value="subscriptions" className="min-h-11">{t('subscriptions')}</TabsTrigger></TabsList>
    <TabsContent value="payments" className="min-w-0 space-y-3">
      {payments.length === 0 ? <EmptyState Icon={Receipt} title={t('emptyPayments')} /> : payments.map((p) => <Card key={p.id}><CardContent className="min-w-0 space-y-2 break-words">
        <div className="flex flex-wrap items-center justify-between gap-2"><Link className="inline-flex min-h-11 items-center font-medium underline" href={`/coach/billing/payments/${p.id}`}>{names.get(p.clientId) ?? t('client')}</Link><BillingStatus value={p.state} /></div>
        <p><BillingMoney amount={p.amount} currency={p.currency} /> · {t(`methods.${p.method}`)}</p><p>{t('receipt')}: {p.receiptNo ?? t('awaitingVerification')}</p>
      </CardContent></Card>)}
      {pCursor ? <Button className="min-h-11" disabled={busy} onClick={() => void more('payments')}>{t(busy ? 'working' : 'loadMore')}</Button> : null}
    </TabsContent>
    <TabsContent value="subscriptions" className="min-w-0 space-y-3">
      {subscriptions.length === 0 ? <EmptyState Icon={Receipt} title={t('emptySubscriptions')} /> : subscriptions.map((s) => <Card key={s.id}><CardContent className="min-w-0 space-y-2 break-words">
        <Link className="inline-flex min-h-11 items-center font-medium underline" href={`/coach/clients/${s.clientId}/subscription`}>{names.get(s.clientId) ?? t('client')}</Link>
        <p>{locale === 'ar' ? s.packageSnapshot.name.ar ?? s.packageSnapshot.name.en : s.packageSnapshot.name.en ?? s.packageSnapshot.name.ar}</p>
        <BillingStatus value={s.state} /><p>{t('endsOn')}: <BillingDate value={s.endsOn} /></p>
      </CardContent></Card>)}
      {sCursor ? <Button className="min-h-11" disabled={busy} onClick={() => void more('subscriptions')}>{t(busy ? 'working' : 'loadMore')}</Button> : null}
    </TabsContent>
    {error ? <p role="alert">{t('requestFailed')}</p> : null}
  </Tabs>;
}
