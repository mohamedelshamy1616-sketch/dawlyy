import { WeekReviewInput, type WeekReview } from './types';
import { summarize, weightEvidence } from './summary';
import { draftReply } from './templates';
import { propose } from './proposals';

export { WeekReviewInput, CheckinSnapshot, ReviewError } from './types';
export type { WeekReview, Proposal, ProposalCode, NutritionChange } from './types';
export { REVIEW_TEMPLATES } from './templates';
export { applyNutritionChange } from './proposals';
export { canonicalReviewInput } from './canonical';

/** Summarize supplied evidence and prepare coach-owned drafts, with no I/O or clock reads. */
export function weekReview(input: WeekReviewInput, opts: { locale: 'ar' | 'en' }): WeekReview {
  const parsed = WeekReviewInput.parse(input);
  const evidence = weightEvidence(parsed.weights);
  const summary = summarize(parsed, evidence.summary);
  return {
    summary, mustHandleFlags: parsed.redFlags.length > 0,
    draft: draftReply(parsed, summary, opts.locale),
    proposals: propose(parsed, summary, evidence),
  };
}
