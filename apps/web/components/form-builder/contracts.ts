import { z } from 'zod';
import { Answers, FormDocument, LocalizedText } from '@dawlyy/core/types';

/** Task 7: three module kinds and their shared coach page props. */
export type FormKind = 'intake' | 'checkin' | 'assessment';
/** Task 7: module actions are computed server-side and also enforced by every service. */
export type FormGrants = { create: boolean; edit: boolean; publish: boolean; review: boolean };
/** Task 7: JSON-safe form detail for builder hydration and write responses. */
export const detailSchema = z.object({ head: z.object({ id: z.string(), name: LocalizedText, kind: z.enum(['template', 'client']), formKind: z.string(), archivedAt: z.string().nullable(), isDefault: z.number() }),
  currentVersion: z.object({ id: z.string(), versionNo: z.number(), status: z.string(), document: FormDocument, changeNote: z.string().nullable() }), revision: z.string(),
  issues: z.array(z.object({ path: z.string(), code: z.string(), message: LocalizedText })) });
/** Task 7: builder's serializable immutable/current snapshot contract. */
export type FormDetail = z.infer<typeof detailSchema>;
/** Task 7: stable paginated coach templates and copies. */
export const formPageSchema = z.object({ items: z.array(z.object({ id: z.string(), name: LocalizedText, formKind: z.string(), kind: z.string(), clientId: z.string().nullable(), status: z.string().nullable(), publishedVersionNo: z.number().nullable(), isDefault: z.number(), archivedAt: z.string().nullable() })), nextCursor: z.string().nullable() });
/** Task 7: initial template/copy listing contract. */
export type FormPage = z.infer<typeof formPageSchema>;
/** Task 7: review queue cards expose flags without returning raw answer documents in lists. */
export const queueSchema = z.object({ items: z.array(z.object({ id: z.string(), clientName: z.string(), clientId: z.string(), name: LocalizedText, submittedAt: z.string().nullable(), formKind: z.string(), state: z.string(), flags: z.array(z.string()) })), nextCursor: z.string().nullable() });
/** Task 7: shared hub review queue contract. */
export type ReviewQueue = z.infer<typeof queueSchema>;
/** Task 7: coach review includes raw answers and per-test results in document order. */
export const reviewDetailSchema = z.object({ document: FormDocument, name: LocalizedText, clientName: z.string(), submission: z.object({ id: z.string(), state: z.string(), formKind: z.string(), answers: Answers,
  coachFeedback: z.string().nullable(), results: z.record(z.string(), z.unknown()).nullable(), submittedAt: z.string().nullable() }) });
/** Task 7: serializable review detail boundary. */
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;
/** Task 7: route segments are shared across coach screens and client links. */
export function coachFormPath(kind: string): string { return `/coach/${kind === 'intake' ? 'intake' : kind === 'assessment' ? 'assessments' : 'checkins'}`; }
