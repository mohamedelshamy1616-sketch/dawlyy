import { z } from 'zod';
import { WeekReviewInput } from '@dawlyy/core/review';

/** R4b: core inclusive 1..14 calendar-day contract. */
export const reviewPeriodSchema = WeekReviewInput.shape.period;
/** R4b: no browser-supplied evidence, provider or hash. */
export const buildReviewSchema = z.strictObject({ locale: z.enum(['ar', 'en']), period: reviewPeriodSchema.optional() });
/** R4b: edits change only coach-owned prose. */
export const editReviewSchema = z.strictObject({ text: z.string().trim().min(1).max(4000) });
/** R4b: current evidence is recomputed server-side. */
export const approveReviewSchema = z.strictObject({});
/** R4b: targets and deltas are never browser supplied. */
export const proposalReviewSchema = z.strictObject({ proposalCode: z.enum(['lower_kcal_flat', 'raise_kcal_flat', 'slow_loss_too_fast']) });
/** R4b: complete validated personal preferences. */
export const reviewPreferencesSchema = z.strictObject({
  dialect: z.enum(['egyptian', 'gulf']), signaturePhrases: z.array(z.string().trim().min(1).max(200)).max(5),
});
/** R4b: validate UUIDs before SQL casts. */
export const reviewParamsSchema = z.strictObject({ clientId: z.uuid() });
/** R4b: drafts remain bound to the requested client. */
export const draftParamsSchema = z.strictObject({ clientId: z.uuid(), draftId: z.uuid() });
