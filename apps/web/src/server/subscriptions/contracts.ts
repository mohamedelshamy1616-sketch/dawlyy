import { z } from '@hono/zod-openapi';
import { IsoDate, SubscriptionState, PaymentState } from '@dawlyy/core/types';
import { moneyMinor } from '../payments/money';

/** T3b: accept schema-compatible decimal major units; all arithmetic uses moneyMinor. */
export const amountSchema = z.union([z.string(), z.number().finite()]).refine((value) => {
  try { moneyMinor(value); return true; } catch { return false; }
}, 'Expected a nonnegative amount with at most two decimals');
/** T3b: actual database enum (bank_transfer, rather than the plan's stale bank). */
export const methodSchema = z.enum(['vodafone_cash', 'instapay', 'cash', 'bank_transfer', 'card_manual', 'other']);
/** T3b: server-owned state, receipt and audit columns are absent and rejected. */
export const paymentInput = z.object({ amount: amountSchema, currency: z.string().regex(/^[A-Z]{3}$/), method: methodSchema,
  proofMediaId: z.uuid().optional(), reference: z.string().trim().max(500).optional() }).strict();
/** T3b: one-transaction sale input. */
export const saleInput = z.object({ clientId: z.uuid(), packageId: z.uuid(), startsOn: IsoDate,
  payment: paymentInput.extend({ markVerified: z.boolean().optional() }).optional() }).strict();
/** T3b: lifecycle payloads with required human reasons. */
export const extensionInput = z.object({ days: z.number().int().min(1).max(3650), reason: z.string().trim().min(1).max(1000) }).strict();
/** T3b: retroactive freeze with explicit local start date. */
export const freezeInput = extensionInput.extend({ fromDate: IsoDate });
/** T3b: cancellation and rejection payload. */
export const reasonInput = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();
/** T3b: resume may omit its reason and body. */
export const resumeInput = z.object({ reason: z.string().trim().min(1).max(1000).optional() }).strict().optional();
/** T3b: shared UUID route parameter. */
export const idParams = z.object({ id: z.uuid() });
/** T3b: subscription filters, parsed pagination remains in parseListQuery. */
export const subscriptionQuery = z.object({ clientId: z.uuid().optional(), state: SubscriptionState.optional(), cursor: z.string().optional(), limit: z.string().optional() });
/** T3b: payment filters. */
export const paymentQuery = z.object({ clientId: z.uuid().optional(), state: PaymentState.optional(), method: methodSchema.optional(), cursor: z.string().optional(), limit: z.string().optional() });
/** T3b: standard error documentation. */
export const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
/** T3b: shared error statuses; precise successful objects are returned by the services. */
export const errors = {
  400: { description: 'Validation error', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'Unauthenticated', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'Forbidden', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
  409: { description: 'Conflict', content: { 'application/json': { schema: errorSchema } } },
  422: { description: 'Transition refused', content: { 'application/json': { schema: errorSchema } } },
};
/** T3b: JSON result schema for documented service responses. */
export const jsonResult = { description: 'Billing result', content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } } };
