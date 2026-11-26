'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { OpenRenewal, RenewalDue } from '@/src/server/pt/renewal';
import { button, card, muted, post, quiet, useWrite } from './ledger';

export function RenewalCard({ due }: { due: RenewalDue }) {
  const t = useTranslations('billing.pt.renewal'), locale = useLocale(), write = useWrite();
  const [requested, setRequested] = useState(!!due.request);
  const name = due.name[locale === 'ar' ? 'ar' : 'en'] || due.name.ar || due.name.en;
  return <section className={card + ' border-brand/40'}>
    <h3 className="text-lg font-semibold">{t('title', { count: due.balance })}</h3>
    {name && <p className={muted}>{name}</p>}
    <p className={muted}>{t('delivered', { count: due.delivered })}</p>
    {requested ? <p className="font-medium text-brand">{t('sent')}</p> : <button className={button} disabled={write.busy} onClick={() => void write.run(async () => {
      await post('renewals', { subscriptionId: due.subscription });
      setRequested(true);
    })}>{t('request')}</button>}
    <p role="status" className={muted}>{write.message}</p>
  </section>;
}

export function RenewalRow({ item, canSell }: { item: OpenRenewal; canSell: boolean }) {
  const t = useTranslations('billing.pt.renewal'), format = useFormatter(), write = useWrite();
  return <article className={card}>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold"><bdi>{item.name}</bdi></h3>
      <time className={muted} dateTime={item.requested}>{format.dateTime(new Date(item.requested), { dateStyle: 'medium' })}</time>
    </header>
    <p className={muted}>{t('summary', { delivered: item.delivered, balance: item.balance })}</p>
    <p className="flex flex-wrap gap-2">
      {canSell && <Link className={button} href={`/coach/billing/sell?clientId=${item.client}`}>{t('sell')}</Link>}
      <button className={canSell ? quiet : button} disabled={write.busy} onClick={() => void write.run(() => post(`renewals/${item.id}/handled`, {}))}>{t('handled')}</button>
    </p>
    <p role="status" className={muted}>{write.message}</p>
  </article>;
}
