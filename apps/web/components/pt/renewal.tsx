'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { OpenRenewal, RenewalDue } from '@/src/server/pt/renewal';
import { button, card, post, useWrite } from './ledger';

export function RenewalCard({ due }: { due: RenewalDue }) {
  const t = useTranslations('billing.pt.renewal'), locale = useLocale(), write = useWrite();
  const [requested, setRequested] = useState(!!due.request);
  const name = due.name[locale === 'ar' ? 'ar' : 'en'] || due.name.ar || due.name.en;
  return <section className={card}>
    <h2 className="font-semibold">{t('title', { count: due.balance })}</h2>
    {name && <p>{name}</p>}
    <p>{t('delivered', { count: due.delivered })}</p>
    {requested ? <p>{t('sent')}</p> : <button className={button} disabled={write.busy} onClick={() => void write.run(async () => {
      await post('renewals', { subscriptionId: due.subscription });
      setRequested(true);
    })}>{t('request')}</button>}
    <p role="status">{write.message}</p>
  </section>;
}

export function RenewalRow({ item, canSell }: { item: OpenRenewal; canSell: boolean }) {
  const t = useTranslations('billing.pt.renewal'), format = useFormatter(), write = useWrite();
  return <article className={card}>
    <h3>{item.name}</h3>
    <p>{t('summary', { delivered: item.delivered, balance: item.balance })}</p>
    <time dateTime={item.requested}>{format.dateTime(new Date(item.requested), { dateStyle: 'medium' })}</time>
    <div className="flex flex-wrap gap-2">
      {canSell && <Link className={button + ' inline-flex items-center'} href={`/coach/billing/sell?clientId=${item.client}`}>{t('sell')}</Link>}
      <button className={button} disabled={write.busy} onClick={() => void write.run(() => post(`renewals/${item.id}/handled`, {}))}>{t('handled')}</button>
    </div>
    <p role="status">{write.message}</p>
  </article>;
}
