import { z } from '@hono/zod-openapi';
import { Answers, FormDocument, LocalizedText, CheckinState } from '@dawlyy/core/types';

/** Task 7: the three supported shared form workflows. */
export const formKindSchema = z.enum(['intake', 'checkin', 'assessment']);
/** Task 7: coach list filters; pagination is validated by the shared cursor helper. */
export const formListSchema = z.object({ kind: z.enum(['template', 'client']).optional(), formKind: formKindSchema.optional(), clientId: z.uuid().optional(), q: z.string().trim().max(200).optional(), archived: z.enum(['true', 'false']).optional(), limit: z.string().optional(), cursor: z.string().optional() }).strict();
/** Task 7: tags cannot be persisted because the frozen forms schema has no tags column. */
export const createFormSchema = z.object({ name: LocalizedText, formKind: formKindSchema }).strict();
/** Task 7: defaults are exclusive per tenant/form kind; stamps are server owned. */
export const patchFormSchema = z.object({ name: LocalizedText.optional(), archived: z.boolean().optional(), is_default: z.boolean().optional() }).strict().refine(value => Object.keys(value).length > 0);
/** Task 7: a draft is structurally valid and may have publish-time issues. */
export const draftSchema = z.object({ document: FormDocument, baseVersionNo: z.number().int().positive(), baseRevision: z.string().max(128).optional(), changeNote: z.string().trim().max(2000).optional() }).strict();
/** Task 7: publish never accepts publication stamps or pointers. */
export const publishSchema = z.object({ changeNote: z.string().trim().max(2000).optional() }).strict();
/** Task 7: revert copies the requested snapshot into a fresh draft. */
export const revertSchema = z.object({ toVersionNo: z.number().int().positive(), changeNote: z.string().trim().max(2000).optional() }).strict();
/** Task 7: private copies resolve client scope under RLS. */
export const customizeSchema = z.object({ clientId: z.uuid() }).strict();
/** Task 7: manual events pin a published form version at send time. */
export const sendSchema = z.object({ clientId: z.uuid(), formId: z.uuid(), dueAt: z.iso.datetime({ offset: true }).optional(), formKind: formKindSchema }).strict();
/** Task 7: skipping requires a reason, never a caller-supplied state. */
export const skipSchema = z.object({ eventId: z.uuid(), reason: z.string().trim().min(1).max(2000) }).strict();
/** Task 7: known intake answers are entered by a coach through the normal answer validator. */
export const knownSchema = z.object({ clientId: z.uuid(), formId: z.uuid(), answers: Answers }).strict();
/** Task 7: review queue cursor uses submitted_at descending with an id tie-breaker. */
export const submissionListSchema = z.object({ state: CheckinState.optional(), formKind: formKindSchema.optional(), clientId: z.uuid().optional(), limit: z.string().optional(), cursor: z.string().optional() }).strict();
/** Task 7 / §12.1.12: mutable sync timestamps belong to the client; snapshots do not. */
export const answersSchema = z.object({ answers: Answers, clientUuid: z.uuid(), clientUpdatedAt: z.iso.datetime({ offset: true }) }).strict();
/** Task 7: coach results are per question, while feedback is the client-facing text. */
export const reviewSchema = z.object({ coachFeedback: z.string().trim().max(10000).optional(), results: z.record(z.string(), z.union([z.number().finite(), z.string().max(2000), z.null()])).optional(), outcome: z.enum(['reviewed', 'needs_resubmission']) }).strict();
