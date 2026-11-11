'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Field } from '@astryxdesign/core/Field';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Heading } from '@astryxdesign/core/Heading';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { BillingDate, BillingMoney } from './presentation';
import { billingRequest } from './request';
import type { BillingClient, BillingPackage, BillingPayment } from './types';
import { Link } from '@/i18n/navigation';

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
  if (success) return <Card><VStack gap={3} className="min-w-0 break-words" role="status">
    <Heading level={2}>{t('saleComplete')}</Heading><Text as="p" display="block">{t('renewalDate')}: <BillingDate value={success.renewalDate} /></Text>
    <Text as="p" display="block">{t('daysLeft', { count: new Intl.NumberFormat(locale).format(success.accessStatus.daysLeft) })}</Text>
    <Text as="p" display="block">{t('receipt')}: {success.payment?.receiptNo ?? t('awaitingVerification')}</Text>
    {success.payment ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/billing/payments/${success.payment.id}`}>{t('viewPayment')}</Link> : null}
  </VStack></Card>;
  return <form onSubmit={submit} className="min-w-0 max-w-xl space-y-5" aria-busy={busy}>
    <Field inputID="sale-client" label={t('client')}><select id="sale-client" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={busy}>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    <VStack gap={2}><Field inputID="sale-package" label={t('package')}><select id="sale-package" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" value={packageId} required disabled={busy} onChange={(e) => { setPackageId(e.target.value); setAmount(String(packages.find((p) => p.id === e.target.value)?.price ?? '')); }}>
      {packages.map((p) => <option key={p.id} value={p.id}>{locale === 'ar' ? p.name.ar ?? p.name.en : p.name.en ?? p.name.ar}</option>)}</select>
    </Field>{pkg ? <Text as="p" display="block" type="supporting"><BillingMoney amount={pkg.price} currency={pkg.currency} /> · {t('durationDays', { count: new Intl.NumberFormat(locale).format(pkg.durationDays) })}</Text> : null}</VStack>
    <Field inputID="sale-start" label={t('startsOn')}><input id="sale-start" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required disabled={busy} /></Field>
    <Switch id="record-payment" className="min-h-11" value={recordPayment} onChange={setRecordPayment} isDisabled={busy} label={t('recordPayment')} />
    {recordPayment ? <>
      <Field inputID="sale-method" label={t('method')}><select id="sale-method" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>{methods.map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</select></Field>
      <Field inputID="sale-amount" label={t('amount')}><input id="sale-amount" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" inputMode="decimal" type="number" min="0" max="9999999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required disabled={busy} /></Field>
      <VStack gap={2}><FileInput id="sale-proof" label={t('proofOptional')} value={file} accept="image/jpeg,image/png,image/webp,application/pdf" isDisabled={busy} controlClassName="min-h-11 max-w-full" containerClassName="min-w-0 max-w-full" onChange={files => { setFile(Array.isArray(files) ? files[0] ?? null : files); setProgress(null); }} />
        <Text as="p" display="block" type="supporting">{t('proofHint')}</Text>{progress !== null ? <Text as="p" display="block" role="status">{t(progress === 100 ? 'uploadComplete' : 'uploadProgress', { count: new Intl.NumberFormat(locale).format(progress) })}</Text> : null}</VStack>
      {canVerify ? <Switch id="sale-verified" className="min-h-11" value={verified} onChange={setVerified} isDisabled={busy} label={t('markPaid')} /> : null}
    </> : null}
    {error ? <Text as="p" display="block" role="alert">{t('requestFailed')}</Text> : null}<Button className="min-h-11 w-full sm:w-auto" variant="primary" isDisabled={busy || !pkg || !clientId} type="submit" label={t(busy ? 'working' : 'sell')} />
  </form>;
}
