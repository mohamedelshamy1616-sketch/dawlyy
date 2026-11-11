'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Field } from '@astryxdesign/core/Field';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { BillingMoney, BillingStatus } from './presentation';
import { billingRequest } from './request';
import type { BillingPayment } from './types';
import { useRouter, Link } from '@/i18n/navigation';

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
  // TextArea's maxLength is a counter, so keep the native limit through its input ref.
  return <VStack gap={5} className="min-w-0">
    <Card><VStack gap={3} className="min-w-0 break-words"><Heading level={2}>{clientName}</Heading><BillingStatus value={payment.state} />
      <Text as="p" display="block"><BillingMoney amount={payment.amount} currency={payment.currency} /> · {t(`methods.${payment.method}`)}</Text>
      <Text as="p" display="block">{t('receipt')}: {payment.receiptNo ?? t('awaitingVerification')}</Text>
      {payment.reference ? <Text as="p" display="block">{t('reference')}: {payment.reference}</Text> : null}
      {payment.rejectedReason ? <Text as="p" display="block">{t('rejectionReason')}: {payment.rejectedReason}</Text> : null}
      {payment.refundAmount !== null ? <Text as="p" display="block">{t('refundedAmount')}: <BillingMoney amount={payment.refundAmount} currency={payment.currency} /></Text> : null}
      <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${payment.clientId}/subscription`}>{t('viewSubscription')}</Link>
    </VStack></Card>
    {payment.proofMediaId ? <VStack as="section" gap={2} className="min-w-0"><Heading level={2}>{t('proof')}</Heading>
      {proof ? <><iframe title={t('proof')} src={proof} className="h-80 w-full max-w-full rounded-xl border" /><a className="inline-flex min-h-11 items-center underline" href={proof} target="_blank" rel="noreferrer">{t('openProof')}</a></> : <Text as="p" display="block" role="status">{t(proofError ? 'proofUnavailable' : 'working')}</Text>}
    </VStack> : <Text as="p" display="block">{t('noProof')}</Text>}
    {canVerify && payment.state === 'pending' ? <VStack as="section" gap={4} aria-busy={busy}>
      <Button className="min-h-11 self-start" variant="primary" isDisabled={busy} onClick={() => void act('verify')} label={t('verify')} />
      <form onSubmit={(e) => submit(e, 'reject')} className="max-w-xl space-y-2">
        <TextArea id="reject-reason" label={t('rejectionReason')} value={reason} onChange={setReason} isDisabled={busy}
          {...{ required: true, disabled: busy }} ref={element => { if (element) element.maxLength = 1000; }} controlClassName="min-h-24" />
        <Button className="min-h-11" variant="secondary" type="submit" isDisabled={busy || !reason.trim()} label={t('reject')} /></form>
    </VStack> : null}
    {canVerify && payment.state === 'verified' ? <form onSubmit={(e) => submit(e, 'refund')} className="max-w-xl space-y-2" aria-busy={busy}>
      <Field inputID="refund-amount" label={t('refundAmount')}><input id="refund-amount" type="number" className="min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3 text-start" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} /></Field>
      <Text as="p" display="block" type="supporting">{t('refundHint')}</Text><Button className="min-h-11" variant="secondary" type="submit" isDisabled={busy} label={t('refund')} />
    </form> : null}
    {error ? <Text as="p" display="block" role="alert">{t('requestFailed')}</Text> : null}{saved ? <Text as="p" display="block" role="status">{t('saved')}</Text> : null}
  </VStack>;
}
