/** T3b: serialisable billing card projections shared by the authorised server pages and client forms. */
export type BillingPayment = { id: string; clientId: string; subscriptionId: string | null; amount: number; currency: string; method: string; state: string;
  receiptNo: string | null; proofMediaId: string | null; reference: string | null; rejectedReason: string | null; refundAmount: number | null };
/** T3b: subscription presentation projection; no internal notes. */
export type BillingSubscription = { id: string; clientId: string; state: string; startsOn: string; endsOn: string; graceEndsOn: string | null;
  price: number; currency: string; packageSnapshot: { name: { ar?: string; en?: string } } };
/** T3b: picker projection, populated under RLS. */
export type BillingClient = { id: string; name: string };
/** T3b: package price and duration copied by the sale service, never trusted from these presentation props. */
export type BillingPackage = { id: string; name: { ar?: string; en?: string }; price: number; currency: string; durationDays: number };
