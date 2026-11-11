import { z } from 'zod';
import { Answers, FormDocument, LocalizedText } from '@dawlyy/core/types';

/** Task 7: JSON-safe public submission boundary; private results never enter client screens. */
export const submissionSchema = z.object({ id: z.string(), clientId: z.string(), formId: z.string(), formVersionId: z.string(), state: z.string(), answers: Answers,
  clientUuid: z.string().nullable(), clientUpdatedAt: z.string().nullable().optional(), coachFeedback: z.string().nullable(), missingRequired: z.array(z.string()) });
/** Task 7: hydrated public bundle from an own-client Server Component or HTTP read. */
export const bundleSchema = z.object({ clientId: z.string(), head: z.object({ id: z.string(), name: LocalizedText, formKind: z.string() }),
  version: z.object({ id: z.string(), versionNo: z.number(), document: FormDocument }),
  event: z.object({ id: z.string(), dueAt: z.string(), state: z.string() }).nullable(), submission: submissionSchema.nullable(), handle: z.string() });
/** Task 7: form runner's serializable props. */
export type FormBundle = z.infer<typeof bundleSchema>;
/** Task 7: client event list boundary supports due, upcoming and completed sections. */
export const eventPageSchema = z.object({ items: z.array(z.object({ id: z.string(), dueAt: z.string(), state: z.string(), title: z.object({ ar: z.string().optional(), en: z.string().optional() }).nullable(), submission: submissionSchema.nullable() })), nextCursor: z.string().nullable() });
/** Task 7: JSON event page shared by the page and cursor continuation. */
export type FormEventPage = z.infer<typeof eventPageSchema>;
/** Task 7: one row of the client's due, upcoming and past list. */
export type FormEventItem = FormEventPage['items'][number];
