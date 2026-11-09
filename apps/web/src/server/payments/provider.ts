import type { z } from '@hono/zod-openapi';
import type { AuthContext, Tx } from '../db';
import type { paymentInput } from '../subscriptions/contracts';
import { createPayment, verifyPayment, changePayment } from './service';

type RecordedPayment = Awaited<ReturnType<typeof createPayment>>;
type PaymentInput = z.infer<typeof paymentInput>;

/** T3b / build-plan §35: provider boundary for manual records; gateways can later persist the same payment contract. */
export interface PaymentProvider {
  readonly name: string;
  record(tx: Tx, auth: AuthContext, subscriptionId: string, input: PaymentInput): Promise<RecordedPayment>;
  verify(tx: Tx, auth: AuthContext, paymentId: string): Promise<RecordedPayment>;
  reject(tx: Tx, auth: AuthContext, paymentId: string, reason: string): Promise<RecordedPayment>;
  refund(tx: Tx, auth: AuthContext, paymentId: string, amount?: string | number): Promise<RecordedPayment>;
}

/** T3b: beta provider, with human verification and exact cumulative refunds; no gateway network calls. */
export const manualPaymentProvider: PaymentProvider = {
  name: 'manual',
  record: createPayment,
  verify: verifyPayment,
  reject: (tx, auth, id, reason) => changePayment(tx, auth, id, 'reject', { reason }),
  refund: (tx, auth, id, amount) => changePayment(tx, auth, id, 'refund', { amount }),
};
