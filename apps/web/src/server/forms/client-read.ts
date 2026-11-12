import 'server-only';
import { and, desc, eq, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, forms, formVersions, formSubmissions } from '@dawlyy/db/schema';
import { evaluateVisibility } from '@dawlyy/core/forms';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound, unprocessable } from '../../api/errors';
import { page } from '../../api/lib/pagination';
import { formCursor } from './helpers';

/** Task 7: require a client identity before any client-portal read or write. */
export function ownClient(auth: AuthContext): string {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden(); return auth.clientId;
}
/** Task 7: feedback is public; per-test coach result fields stay in the review workspace. */
export function publicSubmission<T extends { results: unknown }>(row: T) {
  const { results, ...visible } = row; void results; return visible;
}
/** Task 7: own-client submission lookup always uses the database client projection. */
export async function ownSubmission(tx: Tx, auth: AuthContext, id: string, lock = false) {
  const clientId = ownClient(auth);
  const query = tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.id, id))).limit(1);
  const [row] = lock ? await query.for('update') : await query;
  return row;
}
/**
 * Decision 17: the client projection derives attached form/version IDs for lookup only.
 * Strip those IDs from the event response while preserving the form and version pinned by staff.
 */
export async function clientFormForEvent(tx: Tx, auth: AuthContext, eventId: string) {
  const clientId = ownClient(auth);
  const [internal] = await tx.select(clientColumns.calendarEvents).from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId), eq(calendarEvents.id, eventId), inArray(calendarEvents.type, ['checkin', 'assessment', 'intake']))).limit(1);
  if (!internal) throw notFound();
  const { attachedFormId, pinnedVersionId, ...event } = internal;
  const [submission] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.calendarEventId, eventId))).orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id)).limit(1);
  const kind = event.type as 'intake' | 'checkin' | 'assessment';
  const headId = submission?.formId ?? attachedFormId;
  if (headId && !z.uuid().safeParse(headId).success) throw unprocessable('form_invalid', 'Invalid attached form');
  const [head] = await tx.select(clientColumns.forms).from(forms).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.formKind, kind),
    headId ? eq(forms.id, headId) : and(eq(forms.kind, 'template'), eq(forms.isDefault, 1), isNull(forms.archivedAt)))).orderBy(desc(forms.createdAt), desc(forms.id)).limit(1);
  if (!head || (head.clientId && head.clientId !== clientId)) throw notFound('No form is attached and no default exists');
  const versionId = submission?.formVersionId ?? pinnedVersionId ?? head.publishedVersionId;
  if (!versionId || !z.uuid().safeParse(versionId).success) throw notFound('Published form not found');
  const [version] = await tx.select(clientColumns.formVersions).from(formVersions).where(and(eq(formVersions.id, versionId), eq(formVersions.formId, head.id), inArray(formVersions.status, ['published', 'superseded']))).limit(1);
  if (!version) throw notFound();
  const visibility = evaluateVisibility(version.document, submission?.answers ?? {});
  return { clientId, head, version, event, submission: submission ? publicSubmission(submission) : null, handle: submission?.id ?? event.id,
    visibility: { visible: [...visibility.visible], hidden: [...visibility.hidden], missingRequired: visibility.missingRequired } };
}
/** Task 7: intake is per client and published version, independent of calendar events. */
export async function clientIntake(tx: Tx, auth: AuthContext) {
  const clientId = ownClient(auth);
  const [head] = await tx.select(clientColumns.forms).from(forms).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.formKind, 'intake'), isNull(forms.archivedAt), isNotNull(forms.publishedVersionId),
    or(eq(forms.clientId, clientId), and(eq(forms.kind, 'template'), eq(forms.isDefault, 1))))).orderBy(sql`case when ${forms.clientId} = ${clientId} then 0 else 1 end`, desc(forms.createdAt), desc(forms.id)).limit(1);
  if (!head?.publishedVersionId) return null;
  const [version] = await tx.select(clientColumns.formVersions).from(formVersions).where(eq(formVersions.id, head.publishedVersionId)).limit(1);
  if (!version) return null;
  const [submission] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.formVersionId, version.id), isNull(formSubmissions.calendarEventId))).orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id)).limit(1);
  return { clientId, head, version, event: null, submission: submission ? publicSubmission(submission) : null, handle: submission?.id ?? version.id };
}
/** Task 7: paginated own-client event history for due, upcoming and past lists. */
export async function clientEvents(tx: Tx, auth: AuthContext, query: { formKind: 'checkin' | 'assessment'; limit?: string; cursor?: string }) {
  const clientId = ownClient(auth); const { limit, cursor } = formCursor(query);
  const rows = await tx.select({ ...clientColumns.calendarEvents, cursorStamp: sql<string>`to_char(${clientColumns.calendarEvents.dueAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId), eq(calendarEvents.type, query.formKind), cursor ? or(sql`${calendarEvents.dueAt} < ${cursor.k}::timestamptz`, and(sql`${calendarEvents.dueAt} = ${cursor.k}::timestamptz`, lt(calendarEvents.id, cursor.id))) : undefined))
    .orderBy(desc(calendarEvents.dueAt), desc(calendarEvents.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.cursorStamp);
  const items = await Promise.all(result.items.map(async ({ cursorStamp, attachedFormId, pinnedVersionId, ...event }) => {
    void cursorStamp; void attachedFormId; void pinnedVersionId;
    const [submission] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.calendarEventId, event.id))).orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id)).limit(1);
    return { ...event, submission: submission ? publicSubmission(submission) : null };
  }));
  return { ...result, items };
}
