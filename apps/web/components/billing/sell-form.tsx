'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BillingDate, BillingMoney } from './presentation';
import { billingRequest } from './request';
import type { BillingClient, BillingPackage, BillingPayment } from './types';

const methods = ['vodafone_cash', 'instapay', 'cash', 'bank_transfer', 'card_manual', 'other'] as const;

/** T3b / G1: sale with optional proof upload and payment verification in one submission. */
export function SellForm({ clients, packages, clientId: initialClient, today, canVerify }: {
  clients: BillingClient[]; packages: BillingPackage[]; clientId?: string; today: string; canVerify: boolean;
}) {
  const t = useTranslations('billing'); const locale = useLocale();
  const [clientId, setClientId] = useState(initialClient ?? clients[0]?.id ?? '');
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [amount, setAmount] = useState(String(packages[0]?.price ?? ''));
  const [startsOn, setStartsOn] = useState(today); const [method, setMethod] = useState<string>('instapay');
  const [recordPayment, setRecordPayment] = useState(true); const [verified, setVerified] = useState(false);
  const [file, setFile] = useState<File | null>(null); const [progress, setProgress] = useState<number | null>(null);
  const [uploaded, setUploaded] = useState<{ file: File; clientId: string; mediaId: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false);
  const [success, setSuccess] = useState<{ renewalDate: string; accessStatus: { daysLeft: number }; payment: BillingPayment | null } | null>(null);
  const pkg = packages.find((p) => p.id === packageId);

  async function uploadProof(): Promise<string | undefined> {
    if (!file) return;
    if (uploaded?.file === file && uploaded.clientId === clientId) return uploaded.mediaId;
    const instruction = await billingRequest<{ mediaId: string; upload: { url: string; method: string; headers?: Record<string, string> } }>('/media/uploads',
      { clientId, purpose: 'payment_proof', contentType: file.type, sizeBytes: file.size, filename: file.name });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open(instruction.upload.method, instruction.upload.url);
      for (const [key, value] of Object.entries(instruction.upload.headers ?? {})) xhr.setRequestHeader(key, value);
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded * 100 / event.total)); };
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload_failed'));
      xhr.onerror = () => reject(new Error('upload_failed')); xhr.send(file);
    });
    setUploaded({ file, clientId, mediaId: instruction.mediaId }); setProgress(100); return instruction.mediaId;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pkg) return; setBusy(true); setError(false);
    try {
      const proofMediaId = recordPayment ? await uploadProof() : undefined;
      const result = await billingRequest<NonNullable<typeof success>>('/subscriptions', { clientId, packageId, startsOn,
        payment: recordPayment ? { amount, currency: pkg.currency, method, proofMediaId, markVerified: canVerify && verified } : undefined });
      setSuccess(result);
    } catch { setError(true); } finally { setBusy(false); }
  }
  if (success) return <Card><CardContent className="min-w-0 space-y-3 break-words" role="status">
    <h2 className="text-xl font-semibold">{t('saleComplete')}</h2><p>{t('renewalDate')}: <BillingDate value={success.renewalDate} /></p>
    <p>{t('daysLeft', { count: new Intl.NumberFormat(locale).format(success.accessStatus.daysLeft) })}</p>
    <p>{t('receipt')}: {success.payment?.receiptNo ?? t('awaitingVerification')}</p>
    {success.payment ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/billing/payments/${success.payment.id}`}>{t('viewPayment')}</Link> : null}
  </CardContent></Card>;
  return <form onSubmit={submit} className="min-w-0 max-w-xl space-y-5" aria-busy={busy}>
    <div className="space-y-2"><Label htmlFor="sale-client">{t('client')}</Label><select id="sale-client" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={busy}>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div className="space-y-2"><Label htmlFor="sale-package">{t('package')}</Label><select id="sale-package" className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3" value={packageId} required disabled={busy} onChange={(e) => { setPackageId(e.target.value); setAmount(String(packages.find((p) => p.id === e.target.value)?.price ?? '')); }}>
      {packages.map((p) => <option key={p.id} value={p.id}>{locale === 'ar' ? p.name.ar ?? p.name.en : p.name.en ?? p.name.ar}</option>)}</select>
      {pkg ? <p className="text-sm"><BillingMoney amount={pkg.price} currency={pkg.currency} /> · {t('durationDays', { count: new Intl.NumberFormat(locale).format(pkg.durationDays) })}</p> : null}</div>
    <div className="space-y-2"><Label htmlFor="sale-start">{t('startsOn')}</Label><Input id="sale-start" className="min-h-11" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required disabled={busy} /></div>
    <div className="flex min-h-11 items-center gap-3"><Switch id="record-payment" className="min-h-11 min-w-11" checked={recordPayment} onCheckedChange={setRecordPayment} disabled={busy} /><Label htmlFor="record-payment">{t('recordPayment')}</Label></div>
    {recordPayment ? <>
      <div className="space-y-2"><Label htmlFor="sale-method">{t('method')}</Label><select id="sale-method" className="min-h-11 w-full rounded-md border bg-background px-3" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>{methods.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="sale-amount">{t('amount')}</Label><Input id="sale-amount" className="min-h-11" inputMode="decimal" type="number" min="0" max="9999999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={busy} /></div>
      <div className="space-y-2"><Label htmlFor="sale-proof">{t('proofOptional')}</Label><Input id="sale-proof" className="min-h-11 max-w-full" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProgress(null); }} />
        <p className="text-sm">{t('proofHint')}</p>{progress !== null ? <p role="status">{t(progress === 100 ? 'uploadComplete' : 'uploadProgress', { count: new Intl.NumberFormat(locale).format(progress) })}</p> : null}</div>
      {canVerify ? <div className="flex min-h-11 items-center gap-3"><Switch id="sale-verified" className="min-h-11 min-w-11" checked={verified} onCheckedChange={setVerified} disabled={busy} /><Label htmlFor="sale-verified">{t('markPaid')}</Label></div> : null}
    </> : null}
    {error ? <p role="alert">{t('requestFailed')}</p> : null}<Button className="min-h-11 w-full sm:w-auto" disabled={busy || !pkg || !clientId} type="submit">{t(busy ? 'working' : 'sell')}</Button>
  </form>;
}
