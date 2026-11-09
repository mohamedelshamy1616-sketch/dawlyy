import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { isAllowed } from '@dawlyy/core/authz';
import { clients } from '@dawlyy/db/schema';
import { and, eq } from 'drizzle-orm';
import { requirePage } from '@/src/server/auth';
import { withAuthTx } from '@/src/server/db';
import { getPayment } from '@/src/server/payments/service';
import { ApiError } from '@/src/api/errors';
import { PageHeader } from '@/src/components/shell/page-header';
import { PaymentDetail } from '@/components/billing/payment-detail';

/** T3b: RLS-scoped payment detail; Next 16 route params are awaited. */
export default async function PaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const auth = await requirePage(); const { paymentId } = await params;
  if (!z.uuid().safeParse(paymentId).success) notFound();
  const t = await getTranslations('billing');
  const data = await withAuthTx(auth, async (tx) => {
    const payment = await getPayment(tx, auth, paymentId);
    const [client] = await tx.select({ firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName })
      .from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, payment.clientId))).limit(1);
    return { payment, clientName: client?.displayName ?? (client ? `${client.firstName} ${client.lastName ?? ''}`.trim() : t('client')) };
  }).catch((error: unknown) => { if (error instanceof ApiError && error.status === 404) notFound(); throw error; });
  return <div className="min-w-0 space-y-6"><PageHeader title={t('paymentDetail')} /><PaymentDetail payment={data.payment} clientName={data.clientName}
    canVerify={isAllowed(auth, 'billing', 'verify') && isAllowed(auth, 'billing', 'edit')} /></div>;
}
