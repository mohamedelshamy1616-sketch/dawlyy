'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ClientReceipt, PtDispute, PtPackage } from '@/src/server/pt/ledger';

export const card = 'grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-zinc-100';
export const button = 'min-h-11 focus-ring rounded-md bg-lime-400 px-4 font-medium text-zinc-950 disabled:opacity-50';
const field = 'min-h-11 w-full focus-ring rounded-md border border-zinc-700 bg-zinc-900 px-3 text-zinc-100';
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
    <p>{t('starts', { date: format.dateTime(new Date(pkg.starts + 'T12:00:00Z'), { dateStyle: 'medium', timeZone: 'UTC' }) })}</p>
    {pkg.balance === null ? <form className="grid gap-2" onSubmit={event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void write.run(() => post(`subscriptions/${pkg.id}/opening-credit`, { count: Number(form.get('count')), reason: form.get('reason') }));
    }}>
      <label>{t('opening')}<input className={field} required type="number" min="0" max="2147483647" name="count" /></label>
      <label>{t('reason')}<input className={field} required maxLength={500} name="reason" /></label>
      <button className={button} disabled={write.busy}>{t('fund')}</button>
    </form> : <>
      <p>{t('balance', { count: pkg.balance })}</p>
      {closed ? <button className={button} disabled={pkg.balance === 0} onClick={() => {
        localStorage.removeItem(key); setClosed(false);
      }}>{t('next')}</button>
        : <button className={button} disabled={write.busy || (!pending && pkg.balance === 0)} onClick={close}>{pending ? t('retryClose') : t('close')}</button>}
    </>}
    <p role="status">{write.message}</p>
  </section>;
}

export function ReceiptCard({ receipt }: { receipt: ClientReceipt }) {
  const t = useTranslations('billing.pt'), format = useFormatter(), write = useWrite();
  const ref = useRef<HTMLElement>(null), [note, setNote] = useState(''), [decision, setDecision] = useState(receipt.decision);
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
  return <section ref={ref} className={card}>
    <h2 className="font-semibold">{t('receipt', { number: receipt.session })}</h2>
    <time dateTime={receipt.date}>{format.dateTime(new Date(receipt.date), { dateStyle: 'long' })}</time>
    <p>{t('after', { count: receipt.balance })}</p>
    {receipt.corrected ? <p>{t('corrected')}</p> : status ? <p>{t(status === 'confirm' ? 'confirmed' : 'disputed')}</p> : <>
      <label>{t('note')}<input className={field} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">{(['confirm', 'dispute'] as const).map(action =>
        <button key={action} className={button} disabled={write.busy} onClick={() => void write.run(async () => {
          await post(`receipts/${receipt.visit}/${action}`, { note: note.trim() || undefined });
          setDecision(action);
        })}>{t(action)}</button>)}</div>
    </>}
    <p role="status">{write.message}</p>
  </section>;
}

export function DisputeCard({ item }: { item: PtDispute }) {
  const t = useTranslations('billing.pt'), format = useFormatter(), write = useWrite();
  return <form className={card} onSubmit={event => {
    event.preventDefault(); const reason = new FormData(event.currentTarget).get('reason');
    void write.run(() => post(`visits/${item.visit}/correction`, { reason }));
  }}>
    <h3>{item.name} · {t('receipt', { number: item.session })}</h3>
    <time dateTime={item.date}>{format.dateTime(new Date(item.date), { dateStyle: 'long' })}</time>
    {item.note && <p>{item.note}</p>}
    <label>{t('reason')}<input className={field} name="reason" required maxLength={500} /></label>
    <button className={button} disabled={write.busy}>{t('restore')}</button>
    <p role="status">{write.message}</p>
  </form>;
}
