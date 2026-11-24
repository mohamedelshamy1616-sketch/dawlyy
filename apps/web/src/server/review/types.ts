import type { Action, Module } from '@dawlyy/core/authz';
import type { WeekReview, WeekReviewInput } from '@dawlyy/core/review';

/** R4b: personal wording; deterministic evidence remains server-owned. */
export type ReviewPreferences = { dialect: 'egyptian' | 'gulf'; signaturePhrases: string[] };
/** R4b: an explicitly created unpublished nutrition result. */
export type ReviewProposalDraft = { planId: string; versionId: string; versionNo: number };
/** R4b: original inputs survive clock changes and a different approver. */
export type ReviewContext = { period: WeekReviewInput['period']; locale: 'ar' | 'en'; coach: WeekReviewInput['coach'] };
/** R4b: rechecked before exposing a previously fuller snapshot. */
export type SourcePermission = { module: Module; action: Action };
/** R4b: metadata is supplied only by authenticated server services. */
export type ReviewDraftBody = {
  review: WeekReview; text: string; context: ReviewContext; sourceRevision: string;
  sourcePermissions: SourcePermission[]; evidenceUnavailable: string[]; proposalDraft: ReviewProposalDraft | null;
};
/** The text digest binds approval to the displayed prose. Source metadata stays server-side. */
export type ReviewDraftDto = {
  textHash: string;
  id: string; clientId: string; status: 'draft' | 'approved' | 'rejected' | 'stale';
  provider: 'none' | 'anthropic' | 'openrouter'; inputVersion: string; createdAt: string;
  review: WeekReview; text: string; evidenceUnavailable: string[]; proposalDraft: ReviewProposalDraft | null;
};
