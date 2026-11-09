'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays } from 'lucide-react';
import { useRouter, Link } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/src/components/shell/empty-state';
import { BillingDate, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingSubscription } from './types';

/** T3b: minimal countdown data from core accessStatus. */
export type CountdownAccess = { access: string; daysLeft: number; graceDaysLeft: number | null };

/** T3b / §30: client-safe inclusive-date countdown and renewal instructions. */
export function SubscriptionCountdown({ subscription, access }: { subscription: BillingSubscription; access: CountdownAccess }) {
  const t = useTranslations('billing'); const locale = useLocale();
  return <Card><CardContent className="min-w-0 space-y-3 break-words">
    <p className="text-lg font-semibold">{locale === 'ar' ? subscription.packageSnapshot.name.ar ?? subscription.packageSnapshot.name.en : subscription.packageSnapshot.name.en ?? subscription.packageSnapshot.name.ar}</p>
    <BillingStatus value={access.access} /><p className="text-3xl font-bold">{t('daysLeft', { count: new Intl.NumberFormat(locale).format(access.daysLeft) })}</p>
    <p>{t('endsOn')}: <BillingDate value={subscription.endsOn} /></p>
    {access.access === 'grace' ? <p role="status">{t('graceNotice', { count: new Intl.NumberFormat(locale).format(access.graceDaysLeft ?? 0) })}</p> : null}
    {access.access === 'expired' ? <p role="status">{t('expiredNotice')} {t('contactCoach')}</p> : null}
  </CardContent></Card>;
}

/** T3b: coach lifecycle controls, append-only ledger and read-only upcoming events. */
export function SubscriptionDetail({ subscription, access, events, upcoming, today, canEdit }: {
  subscription: BillingSubscription; access: CountdownAccess;
  events: { id: string; kind: string; reason: string | null; oldEndsOn: string | null; newEndsOn: string | null }[];
  upcoming: { id: string; type: string; state: string; localDate: string }[]; today: string; canEdit: boolean;
}) {
  const t = useTranslations('billing'); const router = useRouter();
  const [action, setAction] = useState('extend'); const [reason, setReason] = useState(''); const [days, setDays] = useState('7');
  const [fromDate, setFromDate] = useState(today); const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const state = subscription.state;
  const actions = [ ...(['active', 'grace', 'expired'].includes(state) ? ['extend'] : []), ...(state === 'active' ? ['freeze'] : []),
    ...(state === 'paused' ? ['resume'] : []), ...(['pending', 'active', 'grace', 'paused', 'suspended'].includes(state) ? ['cancel'] : []) ];
  const selected = actions.includes(action) ? action : actions[0] ?? '';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(false);
    try {
      await billingRequest(`/subscriptions/${subscription.id}/${selected}`, { reason,
        ...(selected === 'extend' || selected === 'freeze' ? { days: Number(days) } : {}), ...(selected === 'freeze' ? { fromDate } : {}) });
      router.refresh(); setReason('');
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <div className="min-w-0 space-y-6"><SubscriptionCountdown subscription={subscription} access={access} />
    <Link className="inline-flex min-h-11 items-center underline" href={`/coach/billing/sell?clientId=${subscription.clientId}`}>{t('sell')}</Link>
    {canEdit && actions.length ? <form onSubmit={submit} className="max-w-xl space-y-3" aria-busy={busy}>
      <Label htmlFor="subscription-action">{t('action')}</Label><select id="subscription-action" className="min-h-11 w-full rounded-md border bg-background px-3" value={selected} onChange={(e) => setAction(e.target.value)} disabled={busy}>{actions.map((a) => <option key={a} value={a}>{t(`actions.${a}`)}</option>)}</select>
      {selected === 'extend' || selected === 'freeze' ? <><Label htmlFor="subscription-days">{t('days')}</Label><Input className="min-h-11" id="subscription-days" type="number" min="1" max="3650" step="1" value={days} onChange={(e) => setDays(e.target.value)} required disabled={busy} /></> : null}
      {selected === 'freeze' ? <><Label htmlFor="freeze-from">{t('fromDate')}</Label><Input className="min-h-11" id="freeze-from" type="date" min={subscription.startsOn} max={subscription.endsOn} value={fromDate} onChange={(e) => setFromDate(e.target.value)} required disabled={busy} /></> : null}
      <Label htmlFor="subscription-reason">{t('reason')}</Label><Textarea id="subscription-reason" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={1000} disabled={busy} />
      {error ? <p role="alert">{t('requestFailed')}</p> : null}<Button className="min-h-11" type="submit" disabled={busy || !reason.trim()}>{t(busy ? 'working' : 'apply')}</Button>
    </form> : null}
    <section className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">{t('ledger')}</h2>
      {events.length ? events.map((e) => <Card key={e.id}><CardContent className="space-y-2 break-words"><p className="font-medium">{t(`ledgerKinds.${e.kind}`)}</p>
        {e.reason ? <p>{e.reason}</p> : null}<p>{e.oldEndsOn ? <BillingDate value={e.oldEndsOn} /> : null} → {e.newEndsOn ? <BillingDate value={e.newEndsOn} /> : null}</p>
      </CardContent></Card>) : <EmptyState Icon={CalendarDays} title={t('emptyLedger')} />}
    </section>
    <section className="min-w-0 space-y-3"><h2 className="text-lg font-semibold">{t('upcoming')}</h2>
      {upcoming.length ? upcoming.map((e) => <Card key={e.id}><CardContent className="flex min-w-0 flex-wrap items-center justify-between gap-2 break-words">
        <p>{t.has(`eventTypes.${e.type}`) ? t(`eventTypes.${e.type}`) : t('eventTypes.custom')} · <BillingDate value={e.localDate} /></p><BillingStatus value={e.state} />
      </CardContent></Card>) : <EmptyState Icon={CalendarDays} title={t('emptyCalendar')} />}
    </section>
  </div>;
}
