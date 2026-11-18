import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applyNutritionChange, weekReview } from '@dawlyy/core/review';
import { aiDrafts, nutritionPlans, nutritionPlanVersions } from '@dawlyy/db/schema';
import { ApiError, notFound } from '../../api/errors';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { documentRevision } from '../nutrition/read';
import { putNutritionDraft } from '../nutrition/service';
import { proposalReviewSchema } from './schemas';
import { assertNoOpenReviewFlags, lockReviewDraft, recomputeReview, transitionReviewApproval } from './service';
import type { ReviewProposalDraft } from './types';

/** jsonb does not keep key order, so stored and freshly computed changes are compared with sorted keys. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** R4b: stale commits normally; successful replays preserve the separately created draft version. */
export type ReviewProposalResult = { kind: 'stale'; draftId: string } | { kind: 'proposal'; created: boolean; result: ReviewProposalDraft };

/** R4b: explicitly create an unpublished nutrition draft from a matching deterministic proposal only. */
export async function applyReviewProposal(tx: Tx, auth: AuthContext, clientId: string, draftId: string,
  request: z.infer<typeof proposalReviewSchema>): Promise<ReviewProposalResult> {
  const parsed = proposalReviewSchema.parse(request); requirePermission(auth, 'nutrition', 'edit');
  const { row, body } = await lockReviewDraft(tx, auth, clientId, draftId);
  const stored = body.review.proposals.find(proposal => proposal.code === parsed.proposalCode);
  if (!stored) throw new ApiError(409, 'proposal_not_available', 'This review has no matching proposal');
  // Body is immutable once approved. Only an already-created result may be linked/retried.
  if (body.proposalDraft && (row.status === 'draft' || row.status === 'approved')) return { kind: 'proposal', created: false, result: body.proposalDraft };
  if (row.status !== 'draft') throw new ApiError(409, row.status === 'stale' ? 'review_stale' : 'draft_not_editable', 'Rebuild the review to create a new proposal');
  await assertNoOpenReviewFlags(tx, auth, clientId);
  const [published] = await tx.select().from(nutritionPlanVersions)
    .where(and(eq(nutritionPlanVersions.tenantId, auth.tenantId), eq(nutritionPlanVersions.id, stored.change.fromVersionId), eq(nutritionPlanVersions.clientId, clientId))).limit(1);
  if (!published) throw notFound('Published nutrition source not found');
  // Use the exact same advisory-lock namespace as putNutritionDraft/publishNutrition.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${published.planId}::text, 0))`);
  const [head] = await tx.select().from(nutritionPlans).where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.id, published.planId), eq(nutritionPlans.clientId, clientId), isNull(nutritionPlans.archivedAt))).limit(1);
  if (!head) throw notFound('Nutrition plan not found');
  if (head.publishedVersionId !== stored.change.fromVersionId || published.status !== 'published') throw new ApiError(409, 'proposal_version_mismatch', 'The published nutrition source changed');
  const current = await recomputeReview(tx, auth, clientId, body);
  if (current.hash !== row.inputHash) {
    const decision = await transitionReviewApproval(tx, draftId, current.hash);
    if (decision !== 'stale') throw new ApiError(500, 'review_integrity_error', 'The changed review could not be marked stale');
    return { kind: 'stale', draftId };
  }
  const recomputed = weekReview(current.input, { locale: body.context.locale }).proposals.find(proposal => proposal.code === parsed.proposalCode);
  if (!recomputed || stableJson(recomputed.change) !== stableJson(stored.change)) throw new ApiError(409, 'proposal_not_available', 'Rebuild the review to see current proposals');
  const [unpublished] = await tx.select({ id: nutritionPlanVersions.id, status: nutritionPlanVersions.status }).from(nutritionPlanVersions)
    .where(and(eq(nutritionPlanVersions.tenantId, auth.tenantId), eq(nutritionPlanVersions.planId, head.id), inArray(nutritionPlanVersions.status, ['draft', 'in_review', 'approved']))).limit(1);
  if ((head.currentVersionId && head.currentVersionId !== published.id) || (unpublished && ['draft', 'in_review', 'approved'].includes(unpublished.status))) throw new ApiError(409, 'nutrition_draft_exists', 'Finish the existing nutrition draft first');
  const document = applyNutritionChange(published.document, recomputed.change, head.publishedVersionId);
  const saved = await putNutritionDraft(tx, auth, head.id, { document, baseVersionNo: published.versionNo,
    baseRevision: documentRevision({ id: published.id, status: published.status, document: published.document }) });
  const result: ReviewProposalDraft = { planId: head.id, versionId: saved.currentVersion.id, versionNo: saved.currentVersion.versionNo };
  const updated = await tx.update(aiDrafts).set({ body: { ...body, proposalDraft: result } })
    .where(and(eq(aiDrafts.tenantId, auth.tenantId), eq(aiDrafts.id, draftId), eq(aiDrafts.status, 'draft'))).returning({ id: aiDrafts.id });
  if (!updated[0]) throw new ApiError(409, 'draft_not_editable', 'The review changed');
  return { kind: 'proposal', created: true, result };
}
