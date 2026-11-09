'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { BillingMoney, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingPayment } from './types';

/** T3b: proof preview and permission-aware verify/reject/refund forms. */
export function PaymentDetail({ payment, clientName, canVerify }: { payment: BillingPayment; clientName: string; canVerify: boolean }) {
  const t = useTranslations('billing'); const router = useRouter();
  const [reason, setReason] = useState(''); const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const [saved, setSaved] = useState(false);
  const [proof, setProof] = useState<string | null>(null); const [proofError, setProofError] = useState(false);
  useEffect(() => {
    let active = true;
    if (payment.proofMediaId) void billingRequest<{ url: string }>(`/media/${payment.proofMediaId}/url`)
      .then((result) => { if (active) setProof(result.url); }).catch(() => { if (active) setProofError(true); });
    return () => { active = false; };
  }, [payment.proofMediaId]);
  async function act(action: 'verify' | 'reject' | 'refund') {
    setBusy(true); setError(false); setSaved(false);
    try {
      await billingRequest(`/payments/${payment.id}/${action}`, action === 'reject' ? { reason } : action === 'refund' && amount ? { amount } : {});
      setSaved(true); router.refresh();
    } catch { setError(true); } finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>, action: 'reject' | 'refund') { event.preventDefault(); void act(action); }
  return <div className="min-w-0 space-y-5">
    <Card><CardContent className="min-w-0 space-y-3 break-words"><h2 className="text-lg font-semibold">{clientName}</h2><BillingStatus value={payment.state} />
      <p><BillingMoney amount={payment.amount} currency={payment.currency} /> · {t(`methods.${payment.method}`)}</p>
      <p>{t('receipt')}: {payment.receiptNo ?? t('awaitingVerification')}</p>
      {payment.reference ? <p>{t('reference')}: {payment.reference}</p> : null}
      {payment.rejectedReason ? <p>{t('rejectionReason')}: {payment.rejectedReason}</p> : null}
      {payment.refundAmount !== null ? <p>{t('refundedAmount')}: <BillingMoney amount={payment.refundAmount} currency={payment.currency} /></p> : null}
      <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${payment.clientId}/subscription`}>{t('viewSubscription')}</Link>
    </CardContent></Card>
    {payment.proofMediaId ? <section className="min-w-0 space-y-2"><h2 className="font-semibold">{t('proof')}</h2>
      {proof ? <><iframe title={t('proof')} src={proof} className="h-80 w-full max-w-full rounded-xl border" /><a className="inline-flex min-h-11 items-center underline" href={proof} target="_blank" rel="noreferrer">{t('openProof')}</a></> : <p role="status">{t(proofError ? 'proofUnavailable' : 'working')}</p>}
    </section> : <p>{t('noProof')}</p>}
    {canVerify && payment.state === 'pending' ? <section className="space-y-4" aria-busy={busy}>
      <Button className="min-h-11" disabled={busy} onClick={() => void act('verify')}>{t('verify')}</Button>
      <form onSubmit={(e) => submit(e, 'reject')} className="max-w-xl space-y-2"><Label htmlFor="reject-reason">{t('rejectionReason')}</Label>
        <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={1000} disabled={busy} />
        <Button className="min-h-11" variant="outline" type="submit" disabled={busy || !reason.trim()}>{t('reject')}</Button></form>
    </section> : null}
    {canVerify && payment.state === 'verified' ? <form onSubmit={(e) => submit(e, 'refund')} className="max-w-xl space-y-2" aria-busy={busy}>
      <Label htmlFor="refund-amount">{t('refundAmount')}</Label><Input id="refund-amount" type="number" className="min-h-11" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
      <p className="text-sm">{t('refundHint')}</p><Button className="min-h-11" variant="outline" type="submit" disabled={busy}>{t('refund')}</Button>
    </form> : null}
    {error ? <p role="alert">{t('requestFailed')}</p> : null}{saved ? <p role="status">{t('saved')}</p> : null}
  </div>;
}
