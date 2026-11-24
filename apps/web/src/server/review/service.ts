import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ACTIONS, MODULES } from '@dawlyy/core/authz';
import { IsoDate } from '@dawlyy/core/types';
import { WeekReviewInput, weekReview, type WeekReview } from '@dawlyy/core/review';
import { aiDrafts, conversations, memberships, messages, redFlags } from '@dawlyy/db/schema';
import { ApiError, forbidden, notFound } from '../../api/errors';
import type { AuthContext, Tx } from '../db';
import { getAiProvider } from '../ai';
import { notifyMessage, openConversation, sendMessage } from '../messaging/service';
import { postgresCode } from '../postgres-code';
import { requirePermission } from '../require-permission';
import { hashReviewInputs, hashReviewText } from './hash';
import { assertReviewEvidenceAllowed, getReviewClient, loadReviewInputs, requireReviewAccess } from './inputs';
import { getReviewPreferences } from './preferences';
import { buildReviewSchema, editReviewSchema } from './schemas';
import type { ReviewContext, ReviewDraftBody, ReviewDraftDto } from './types';

type DraftRow = typeof aiDrafts.$inferSelect;
const bodySchema = z.object({
  review: z.custom<WeekReview>(value => !!value && typeof value === 'object' && 'summary' in value && 'draft' in value && 'proposals' in value && 'mustHandleFlags' in value),
  text: z.string().max(4000).refine(text => text.trim().length > 0),
  context: z.object({ period: WeekReviewInput.shape.period, locale: z.enum(['ar', 'en']), coach: WeekReviewInput.shape.coach }).strict(),
  sourceRevision: z.string(), sourcePermissions: z.array(z.object({ module: z.enum(MODULES), action: z.enum(ACTIONS) }).strict()),
  evidenceUnavailable: z.array(z.string()),
  proposalDraft: z.object({ planId: z.uuid(), versionId: z.uuid(), versionNo: z.number().int().positive() }).strict().nullable(),
}).strict();

/** R4b: protect context and authorization metadata before exposing any stored summary. */
export function readReviewDraftBody(auth: AuthContext, row: DraftRow): ReviewDraftBody {
  const parsed = bodySchema.safeParse(row.body);
  if (!parsed.success) throw new ApiError(500, 'review_integrity_error', 'The stored review cannot be read');
  assertReviewEvidenceAllowed(auth, parsed.data.sourcePermissions);
  return parsed.data;
}
function dto(auth: AuthContext, row: DraftRow): ReviewDraftDto {
  const body = readReviewDraftBody(auth, row);
  const status = z.enum(['draft', 'approved', 'rejected', 'stale']).safeParse(row.status);
  const provider = z.enum(['none', 'anthropic', 'openrouter']).safeParse(row.provider);
  if (!status.success || !provider.success) throw new ApiError(500, 'review_integrity_error', 'The stored review cannot be read');
  return { id: row.id, clientId: row.clientId, status: status.data, provider: provider.data, inputVersion: row.inputVersion,
    createdAt: row.createdAt.toISOString(), review: body.review, text: body.text, textHash: hashReviewText(body.text), evidenceUnavailable: body.evidenceUnavailable,
    proposalDraft: body.proposalDraft };
}

function checkReviewedText(auth: AuthContext, row: DraftRow, text: string, expectedTextHash: string) {
  if (hashReviewText(text) !== expectedTextHash) {
    throw new ApiError(409, 'draft_changed', 'The draft changed. Review it again.', { draft: dto(auth, row) });
  }
}

/** R4b: scoped row lock, shared by text edits, approval and proposal writes. Source rows remain independently mutable. */
export async function lockReviewDraft(tx: Tx, auth: AuthContext, clientId: string, draftId: string) {
  requireReviewAccess(auth); await getReviewClient(tx, auth, clientId);
  const [row] = await tx.select().from(aiDrafts).where(and(eq(aiDrafts.tenantId, auth.tenantId), eq(aiDrafts.clientId, clientId), eq(aiDrafts.id, draftId), eq(aiDrafts.kind, 'week_review'))).limit(1).for('update');
  if (!row) throw notFound('Review not found');
  return { row, body: readReviewDraftBody(auth, row) };
}

/** R4b: only an authorized current source projection can expose a saved draft. */
export async function getLatestReview(tx: Tx, auth: AuthContext, clientId: string): Promise<ReviewDraftDto | null> {
  requireReviewAccess(auth); await getReviewClient(tx, auth, clientId);
  const [row] = await tx.select().from(aiDrafts).where(and(eq(aiDrafts.tenantId, auth.tenantId), eq(aiDrafts.clientId, clientId), eq(aiDrafts.kind, 'week_review')))
    .orderBy(desc(aiDrafts.createdAt), desc(aiDrafts.id)).limit(1);
  return row ? dto(auth, row) : null;
}
function precedingSixDays(today: string) {
  const date = new Date(`${today}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 6);
  return IsoDate.parse(date.toISOString().slice(0, 10));
}

/** R4b: deterministic summaries and provider-none text with server-owned fixed input context. */
export async function buildReview(tx: Tx, auth: AuthContext, clientId: string, request: z.infer<typeof buildReviewSchema>): Promise<ReviewDraftDto> {
  requireReviewAccess(auth); const parsed = buildReviewSchema.parse(request);
  const client = await getReviewClient(tx, auth, clientId);
  const preferences = await getReviewPreferences(tx, auth);
  const [coach] = await tx.select({ displayName: memberships.displayName }).from(memberships)
    .where(and(eq(memberships.tenantId, auth.tenantId), eq(memberships.id, auth.membershipId), eq(memberships.userId, auth.userId))).limit(1);
  const context: ReviewContext = { period: parsed.period ?? { from: precedingSixDays(client.today), to: IsoDate.parse(client.today) }, locale: parsed.locale,
    coach: { firstName: coach?.displayName?.trim().split(/\s+/)[0]?.slice(0, 80) || (parsed.locale === 'ar' ? 'المدرب' : 'Coach'), ...preferences } };
  const loaded = await loadReviewInputs(tx, auth, clientId, context);
  const input = WeekReviewInput.parse(loaded.input); const review = weekReview(input, { locale: parsed.locale });
  // R4b has no hosted-provider activation authority even if a deployment contains provider variables.
  const generated = await getAiProvider({ env: { DAWLYY_AI_PROVIDER: 'none' } }).draft({ review, locale: context.locale, dialect: context.coach.dialect, signaturePhrases: context.coach.signaturePhrases });
  const body: ReviewDraftBody = { review, text: generated.text, context, sourceRevision: loaded.sourceRevision,
    sourcePermissions: loaded.sourcePermissions, evidenceUnavailable: loaded.evidenceUnavailable, proposalDraft: null };
  const [row] = await tx.insert(aiDrafts).values({ tenantId: auth.tenantId, clientId, kind: 'week_review',
    inputHash: hashReviewInputs(input, loaded.sourceRevision, context.locale), inputVersion: `review-v1:${context.period.from}:${context.period.to}`,
    provider: generated.provider, status: 'draft', body }).returning();
  if (!row) throw new ApiError(500, 'review_integrity_error', 'The review was not stored');
  return dto(auth, row);
}

/** R4b: only draft prose is editable; all protected inputs and proposal links are retained. */
export async function editReview(tx: Tx, auth: AuthContext, clientId: string, draftId: string, request: z.infer<typeof editReviewSchema>): Promise<ReviewDraftDto> {
  const parsed = editReviewSchema.parse(request); const { row, body } = await lockReviewDraft(tx, auth, clientId, draftId);
  if (row.status !== 'draft') throw new ApiError(409, 'draft_not_editable', 'Only a draft review can be edited');
  if (parsed.expectedTextHash !== undefined) checkReviewedText(auth, row, body.text, parsed.expectedTextHash);
  const [updated] = await tx.update(aiDrafts).set({ body: { ...body, text: parsed.text } }).where(and(eq(aiDrafts.tenantId, auth.tenantId), eq(aiDrafts.id, draftId), eq(aiDrafts.status, 'draft'))).returning();
  if (!updated) throw new ApiError(409, 'draft_not_editable', 'The review changed');
  return dto(auth, updated);
}

/** R4b/R0c: independently re-read open flags immediately before any advice-bearing write. */
export async function assertNoOpenReviewFlags(tx: Tx, auth: AuthContext, clientId: string): Promise<void> {
  requireReviewAccess(auth);
  const [flag] = await tx.select({ id: redFlags.id }).from(redFlags).where(and(eq(redFlags.tenantId, auth.tenantId), eq(redFlags.clientId, clientId), eq(redFlags.status, 'open'))).limit(1);
  if (flag) throw new ApiError(409, 'red_flags_open', 'Handle the open flags and rebuild the review');
}
/** R4b: reload protected period/coach context inside the same transaction as approval or proposal. */
export async function recomputeReview(tx: Tx, auth: AuthContext, clientId: string, body: ReviewDraftBody) {
  assertReviewEvidenceAllowed(auth, body.sourcePermissions);
  const loaded = await loadReviewInputs(tx, auth, clientId, body.context);
  return { ...loaded, hash: hashReviewInputs(loaded.input, loaded.sourceRevision, body.context.locale) };
}
/** R4b: the database alone owns approved/stale transitions and audit stamps. */
export async function transitionReviewApproval(tx: Tx, draftId: string, recomputedHash: string): Promise<'approved' | 'stale'> {
  let rows: { status: string }[];
  try { rows = await tx.execute<{ status: string }>(sql`select app.approve_ai_draft(${draftId}::uuid, ${recomputedHash}::text) as status`); }
  catch (error) {
    const code = postgresCode(error);
    if (code === 'P0001') throw new ApiError(409, 'draft_not_editable', 'This review can no longer be approved');
    if (code === '42501') throw forbidden();
    throw error;
  }
  const status = rows[0]?.status;
  if (status !== 'approved' && status !== 'stale') throw new ApiError(500, 'review_integrity_error', 'The review could not be approved');
  return status;
}

type Sent = Awaited<ReturnType<typeof sendMessage>>;
/** R4b: a stale result must leave the transaction normally so its status is committed. */
export type ReviewApprovalResult = { kind: 'stale'; draftId: string } | {
  kind: 'approved'; draftId: string; conversation: Pick<Sent['conversation'], 'id' | 'clientId'>;
  message: Pick<Sent['message'], 'id' | 'body' | 'attachments'>; created: boolean;
};
async function approvedReplay(tx: Tx, auth: AuthContext, row: DraftRow): Promise<ReviewApprovalResult> {
  if (!row.approvedBy) throw new ApiError(500, 'review_message_missing', 'The approved message could not be found');
  const [conversation] = await tx.select({ id: conversations.id, clientId: conversations.clientId }).from(conversations)
    .where(and(eq(conversations.tenantId, auth.tenantId), eq(conversations.clientId, row.clientId), eq(conversations.kind, 'client'))).limit(1);
  if (!conversation) throw new ApiError(500, 'review_message_missing', 'The approved message could not be found');
  const [message] = await tx.select({ id: messages.id, body: messages.body, attachments: messages.attachments }).from(messages)
    .where(and(eq(messages.tenantId, auth.tenantId), eq(messages.senderUserId, row.approvedBy), eq(messages.clientUuid, row.id), eq(messages.conversationId, conversation.id), eq(messages.clientId, row.clientId))).limit(1);
  if (!message) throw new ApiError(500, 'review_message_missing', 'The approved message could not be found');
  return { kind: 'approved', draftId: row.id, conversation, message, created: false };
}
/** R4b: independently hashed approval plus existing-message creation is one authenticated transaction. */
export async function approveReview(tx: Tx, auth: AuthContext, clientId: string, draftId: string, expectedTextHash: string): Promise<ReviewApprovalResult> {
  requireReviewAccess(auth); requirePermission(auth, 'messages', 'create');
  const { row, body } = await lockReviewDraft(tx, auth, clientId, draftId);
  checkReviewedText(auth, row, body.text, expectedTextHash);
  if (row.status === 'approved') return approvedReplay(tx, auth, row);
  if (row.status !== 'draft') throw new ApiError(409, row.status === 'stale' ? 'review_stale' : 'draft_not_editable', 'Rebuild this review');
  await assertNoOpenReviewFlags(tx, auth, clientId);
  const current = await recomputeReview(tx, auth, clientId, body);
  const decision = await transitionReviewApproval(tx, draftId, current.hash);
  if (decision === 'stale') return { kind: 'stale', draftId };
  const opened = await openConversation(tx, auth, clientId);
  const sent = await sendMessage(tx, auth, opened.conversation.id, { body: body.text, clientUuid: draftId });
  return { kind: 'approved', draftId, conversation: sent.conversation, message: sent.message, created: sent.created };
}

/** R4b: call only after withAuthTx commits; notification failure never hides the sent message. */
export async function finalizeReviewApproval(auth: AuthContext, result: ReviewApprovalResult) {
  if (result.kind === 'stale') throw new ApiError(409, 'review_stale', 'Data changed; rebuild this review');
  let notified = false;
  // A replay does not imply that a previous notification succeeded and must not impersonate the original sender.
  if (result.created) {
    try { notified = (await notifyMessage(auth, result.conversation, result.message)) > 0; } catch { notified = false; }
  }
  return { draftId: result.draftId, status: 'approved' as const, conversationId: result.conversation.id, messageId: result.message.id, notified };
}
