'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ClientReceipt, PtDispute, PtPackage } from '@/src/server/pt/ledger';

export const card = 'grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-card-edge';
export const button = 'inline-flex min-h-11 items-center justify-center focus-ring rounded-lg bg-brand px-4 font-medium text-brand-foreground disabled:opacity-50';
export const quiet = 'inline-flex min-h-11 items-center justify-center focus-ring rounded-lg border border-border bg-transparent px-4 font-medium text-foreground disabled:opacity-50';
export const muted = 'text-sm text-muted-foreground';
const field = 'mt-1 min-h-11 w-full focus-ring rounded-lg border border-border bg-muted px-3 text-foreground';
export async function post(path: string, body: object) {
  const response = await fetch('/api/v1/pt/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(String(response.status));
}

export function useWrite() {
  const router = useRouter(), t = useTranslations('billing.pt');
  const lock = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(t('saved'));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error && error.message === '409' ? t('conflict') : t('retry'));
      router.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, message, run };
}

export function PackageCard({ pkg, owner, membership }: { pkg: PtPackage; owner: boolean; membership: string }) {
  const t = useTranslations('billing.pt'), locale = useLocale(), format = useFormatter(), write = useWrite();
  const key = `pt-close:${membership}:${pkg.id}`;
  const [pending, setPending] = useState(false), [closed, setClosed] = useState(false);
  useEffect(() => {
    function sync() {
      try {
        const value = localStorage.getItem(key);
        setClosed(!!value?.startsWith('closed:'));
        setPending(!!value && !value.startsWith('closed:'));
      } catch { /* Storage errors are reported on submit. */ }
    }
    sync();
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  if (pkg.balance === null && !owner) return null;
  async function close() {
    async function submit() {
      const previous = localStorage.getItem(key);
      if (previous?.startsWith('closed:')) { setClosed(true); return; }
      const visit = previous ?? crypto.randomUUID();
      localStorage.setItem(key, visit);
      setPending(true);
      try { await post(`visits/${visit}/close`, { subscriptionId: pkg.id }); }
      catch (error) {
        if (error instanceof Error && error.message === '409') { localStorage.removeItem(key); setPending(false); }
        throw error;
      }
      localStorage.setItem(key, 'closed:' + visit);
      setPending(false);
      setClosed(true);
    }
    await write.run(async () => { await (navigator.locks ? navigator.locks.request(key, submit) : submit()); });
  }
  return <section className={card}>
    <h2 className="font-semibold">{pkg.name[locale === 'ar' ? 'ar' : 'en'] || pkg.name.ar || pkg.name.en}</h2>
    <p className={muted}>{t('starts', { date: format.dateTime(new Date(pkg.starts + 'T12:00:00Z'), { dateStyle: 'medium', timeZone: 'UTC' }) })}</p>
    {pkg.balance === null ? <form className="grid gap-3" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void write.run(() => post(`subscriptions/${pkg.id}/opening-credit`, { count: Number(form.get('count')), reason: form.get('reason') }));
    }}>
      <label className="text-sm">{t('opening')}<input className={field} required type="number" min="0" max="2147483647" name="count" /></label>
      <label className="text-sm">{t('reason')}<input className={field} required maxLength={500} name="reason" /></label>
      <button className={button} disabled={write.busy}>{t('fund')}</button>
    </form> : <>
      <p className="text-lg font-semibold">{t('balance', { count: pkg.balance })}</p>
      {closed ? <button className={quiet} disabled={pkg.balance === 0} onClick={() => {
        localStorage.removeItem(key); setClosed(false);
      }}>{t('next')}</button>
        : <button className={button} disabled={write.busy || (!pending && pkg.balance === 0)} onClick={close}>{pending ? t('retryClose') : t('close')}</button>}
    </>}
    <p role="status" className={muted}>{write.message}</p>
  </section>;
}

export function ReceiptCard({ receipt }: { receipt: ClientReceipt }) {
  const t = useTranslations('billing.pt'), format = useFormatter(), write = useWrite();
  const ref = useRef<HTMLElement>(null), [note, setNote] = useState(''), [decision, setDecision] = useState(receipt.decision);
  const [disputing, setDisputing] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || receipt.viewed) return;
    let visible = false, saved = false, inflight = false;
    async function record() {
      if (!visible || saved || inflight || document.visibilityState !== 'visible') return;
      inflight = true;
      try { await post(`receipts/${receipt.visit}/view`, {}); saved = true; } catch { /* Retry on reconnect or visibility change. */ }
      finally { inflight = false; }
    }
    const observer = new IntersectionObserver(entries => { visible = !!entries[0]?.isIntersecting; void record(); });
    observer.observe(element);
    window.addEventListener('online', record);
    document.addEventListener('visibilitychange', record);
    return () => { observer.disconnect(); window.removeEventListener('online', record); document.removeEventListener('visibilitychange', record); };
  }, [receipt.visit, receipt.viewed]);
  const status = receipt.decision ?? decision;
  const send = (action: 'confirm' | 'dispute') => void write.run(async () => {
    await post(`receipts/${receipt.visit}/${action}`, { note: action === 'dispute' ? note.trim() || undefined : undefined });
    setDecision(action);
  });
  const when = <time className={muted} dateTime={receipt.date}>{format.dateTime(new Date(receipt.date), { dateStyle: 'medium' })}</time>;
  if (receipt.corrected || status) {
    return <section ref={ref} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-border px-4 py-3">
      <h3 className="font-medium">{t('receipt', { number: receipt.session })}</h3>
      <p className={muted}>{receipt.corrected ? t('corrected') : t(status === 'confirm' ? 'confirmed' : 'disputed')}</p>
      {when}
      <p role="status" className={muted}>{write.message}</p>
    </section>;
  }
  return <section ref={ref} className={card}>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{t('receipt', { number: receipt.session })}</h3>
      {when}
    </header>
    <p className={muted}>{t('after', { count: receipt.balance })}</p>
    {disputing ? <>
      <label className="text-sm">{t('note')}<input className={field} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <p className="flex flex-wrap gap-2">
        <button className={button} disabled={write.busy} onClick={() => send('dispute')}>{t('sendDispute')}</button>
        <button className={quiet} disabled={write.busy} onClick={() => setDisputing(false)}>{t('cancel')}</button>
      </p>
    </> : <p className="flex flex-wrap gap-2">
      <button className={button} disabled={write.busy} onClick={() => send('confirm')}>{t('confirm')}</button>
      <button className={quiet} disabled={write.busy} onClick={() => setDisputing(true)}>{t('dispute')}</button>
    </p>}
    <p role="status" className={muted}>{write.message}</p>
  </section>;
}

export function DisputeCard({ item }: { item: PtDispute }) {
  const t = useTranslations('billing.pt'), format = useFormatter(), write = useWrite();
  return <form className={card} onSubmit={event => {
    event.preventDefault(); const reason = new FormData(event.currentTarget).get('reason');
    void write.run(() => post(`visits/${item.visit}/correction`, { reason }));
  }}>
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold"><bdi>{item.name}</bdi> · {t('receipt', { number: item.session })}</h3>
      <time className={muted} dateTime={item.date}>{format.dateTime(new Date(item.date), { dateStyle: 'medium' })}</time>
    </header>
    {item.note && <blockquote className="border-s-2 border-brand ps-3">{item.note}</blockquote>}
    <label className="text-sm">{t('reason')}<input className={field} name="reason" required maxLength={500} /></label>
    <button className={button} disabled={write.busy}>{t('restore')}</button>
    <p role="status" className={muted}>{write.message}</p>
  </form>;
}
