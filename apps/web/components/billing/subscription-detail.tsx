'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Field } from '@astryxdesign/core/Field';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { CalendarDays } from 'lucide-react';
import { BillingDate, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingSubscription } from './types';
import { useRouter, Link } from '@/i18n/navigation';
import { EmptyState } from '@/src/components/shell/empty-state';

/** T3b: minimal countdown data from core accessStatus. */
export type CountdownAccess = { access: string; daysLeft: number; graceDaysLeft: number | null };

/** T3b / §30: client-safe inclusive-date countdown and renewal instructions. */
export function SubscriptionCountdown({ subscription, access }: { subscription: BillingSubscription; access: CountdownAccess }) {
  const t = useTranslations('billing'); const locale = useLocale();
  return <Card><VStack gap={3} className="min-w-0 break-words">
    <Text weight="semibold" type="large" as="p" display="block">{locale === 'ar' ? subscription.packageSnapshot.name.ar ?? subscription.packageSnapshot.name.en : subscription.packageSnapshot.name.en ?? subscription.packageSnapshot.name.ar}</Text>
    <BillingStatus value={access.access} /><Text weight="bold" size="3xl" as="p" display="block">{t('daysLeft', { count: new Intl.NumberFormat(locale).format(access.daysLeft) })}</Text>
    <Text as="p" display="block">{t('endsOn')}: <BillingDate value={subscription.endsOn} /></Text>
    {access.access === 'grace' ? <Text as="p" display="block" role="status">{t('graceNotice', { count: new Intl.NumberFormat(locale).format(access.graceDaysLeft ?? 0) })}</Text> : null}
    {access.access === 'expired' ? <Text as="p" display="block" role="status">{t('expiredNotice')} {t('contactCoach')}</Text> : null}
  </VStack></Card>;
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
  return <VStack gap={6} className="min-w-0"><SubscriptionCountdown subscription={subscription} access={access} />
    <Link className="inline-flex min-h-11 items-center underline" href={`/coach/billing/sell?clientId=${subscription.clientId}`}>{t('sell')}</Link>
    {canEdit && actions.length ? <form onSubmit={submit} className="max-w-xl space-y-3" aria-busy={busy}>
      <Field label={t('action')} inputID="subscription-action"><select id="subscription-action" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" value={selected} onChange={(e) => setAction(e.target.value)} disabled={busy}>{actions.map((a) => <option key={a} value={a}>{t(`actions.${a}`)}</option>)}</select></Field>
      {selected === 'extend' || selected === 'freeze' ? <Field label={t('days')} inputID="subscription-days"><input className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" id="subscription-days" type="number" min="1" max="3650" step="1" value={days} onChange={(e) => setDays(e.target.value)} required disabled={busy} /></Field> : null}
      {selected === 'freeze' ? <Field label={t('fromDate')} inputID="freeze-from"><input className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" id="freeze-from" type="date" min={subscription.startsOn} max={subscription.endsOn} value={fromDate} onChange={(e) => setFromDate(e.target.value)} required disabled={busy} /></Field> : null}
      <TextArea label={t('reason')} id="subscription-reason" value={reason} onChange={setReason} isDisabled={busy} {...{ required: true, disabled: busy }} ref={element => { if (element) element.maxLength = 1000; }} controlClassName="min-h-24" />
      {error ? <Text as="p" display="block" role="alert">{t('requestFailed')}</Text> : null}<Button className="min-h-11" type="submit" isDisabled={busy || !reason.trim()} variant="primary" label={t(busy ? 'working' : 'apply')} />
    </form> : null}
    <section className="min-w-0 space-y-3"><Heading level={2}>{t('ledger')}</Heading>
      {events.length ? events.map((e) => <Card key={e.id}><VStack gap={2} className="break-words"><Text as="p" display="block" weight="medium">{t(`ledgerKinds.${e.kind}`)}</Text>
        {e.reason ? <Text as="p" display="block">{e.reason}</Text> : null}<Text as="p" display="block">{e.oldEndsOn ? <BillingDate value={e.oldEndsOn} /> : null} → {e.newEndsOn ? <BillingDate value={e.newEndsOn} /> : null}</Text>
      </VStack></Card>) : <EmptyState Icon={CalendarDays} title={t('emptyLedger')} />}
    </section>
    <section className="min-w-0 space-y-3"><Heading level={2}>{t('upcoming')}</Heading>
      {upcoming.length ? upcoming.map((e) => <Card key={e.id}><HStack wrap="wrap" align="center" justify="between" gap={2} className="min-w-0 break-words">
        <Text as="p" display="block">{t.has(`eventTypes.${e.type}`) ? t(`eventTypes.${e.type}`) : t('eventTypes.custom')} · <BillingDate value={e.localDate} /></Text><BillingStatus value={e.state} />
      </HStack></Card>) : <EmptyState Icon={CalendarDays} title={t('emptyCalendar')} />}
    </section>
  </VStack>;
}
