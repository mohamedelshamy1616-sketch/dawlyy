import 'server-only';
import { and, desc, eq, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients, forms, formVersions, formSubmissions } from '@dawlyy/db/schema';
import { isAllowed, type Action } from '@dawlyy/core/authz';
import { evaluateVisibility } from '@dawlyy/core/forms';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound, unprocessable } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { draftIssues, formCursor } from './helpers';
import type { formListSchema, submissionListSchema } from './schemas';
import { createHash } from 'node:crypto';

/** Task 7: supported kinds map to their coach module; custom forms use forms. */
export function formModule(kind: string): 'forms' | 'checkins' | 'assessments' {
  return kind === 'checkin' ? 'checkins' : kind === 'assessment' ? 'assessments' : 'forms';
}
/** Task 7: client grants never grant access to coach routes. */
export function requireFormPermission(auth: AuthContext, kind: string, action: Action): void {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, formModule(kind), action);
}
function requireSome(auth: AuthContext, action: Action) {
  if (auth.role === 'client' || !['intake', 'checkin', 'assessment'].some(kind => isAllowed(auth, formModule(kind), action))) throw forbidden();
}
/** Task 7: same-draft content token supplements the required version-number check. */
export function formRevision(version: { id: string; status: string; document: unknown }): string {
  return createHash('sha256').update(JSON.stringify(version)).digest('hex');
}
/** Task 7: inspect only the discriminator before authorizing a complete coach head read. */
export async function formHead(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  requireSome(auth, action);
  const [kind] = await tx.select({ formKind: forms.formKind }).from(forms).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.id, id))).limit(1);
  if (!kind) throw notFound();
  requireFormPermission(auth, kind.formKind, action);
  const [head] = await tx.select().from(forms).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.id, id))).limit(1);
  if (!head) throw notFound();
  return head;
}
/** Task 7: current working snapshot plus publish validation issues. */
export async function getForm(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  const head = await formHead(tx, auth, id, action);
  const [currentVersion] = await tx.select().from(formVersions).where(and(eq(formVersions.formId, id), eq(formVersions.id, head.currentVersionId ?? '00000000-0000-0000-0000-000000000000'))).limit(1);
  if (!currentVersion) throw notFound('Working form version not found');
  return { head, currentVersion, revision: formRevision({ id: currentVersion.id, status: currentVersion.status, document: currentVersion.document }), issues: draftIssues(currentVersion.document) };
}
/** Task 7: stable timestamp/id keyset with published version number and current status. */
export async function listForms(tx: Tx, auth: AuthContext, query: z.infer<typeof formListSchema>) {
  requireSome(auth, 'view');
  if (query.formKind) requireFormPermission(auth, query.formKind, 'view');
  const allowed = (['intake', 'checkin', 'assessment'] as const).filter(kind => isAllowed(auth, formModule(kind), 'view'));
  const { limit, cursor } = formCursor(query);
  const working = alias(formVersions, 'working_form'); const published = alias(formVersions, 'published_form');
  const stamp = sql<string>`to_char(coalesce(${forms.updatedAt}, ${forms.createdAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const rows = await tx.select({ id: forms.id, name: forms.name, formKind: forms.formKind, kind: forms.kind, clientId: forms.clientId, isDefault: forms.isDefault,
    archivedAt: forms.archivedAt, currentVersionId: forms.currentVersionId, publishedVersionId: forms.publishedVersionId,
    status: working.status, publishedVersionNo: published.versionNo, cursorStamp: stamp }).from(forms)
    .leftJoin(working, eq(working.id, forms.currentVersionId)).leftJoin(published, eq(published.id, forms.publishedVersionId))
    .where(and(eq(forms.tenantId, auth.tenantId), inArray(forms.formKind, query.formKind ? [query.formKind] : allowed), query.kind ? eq(forms.kind, query.kind) : undefined,
      query.clientId ? eq(forms.clientId, query.clientId) : undefined, query.archived === 'true' ? isNotNull(forms.archivedAt) : isNull(forms.archivedAt),
      query.q ? sql`position(lower(${query.q}) in lower(${forms.name}::text)) > 0` : undefined,
      cursor ? or(sql`coalesce(${forms.updatedAt}, ${forms.createdAt}) < ${cursor.k}::timestamptz`, and(sql`coalesce(${forms.updatedAt}, ${forms.createdAt}) = ${cursor.k}::timestamptz`, lt(forms.id, cursor.id))) : undefined))
    .orderBy(desc(sql`coalesce(${forms.updatedAt}, ${forms.createdAt})`), desc(forms.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.cursorStamp);
  return { ...result, items: result.items.map(({ cursorStamp, ...row }) => { void cursorStamp; return row; }) };
}
/** Task 7: historical snapshots are read under the head's module and RLS scope. */
export async function getFormVersion(tx: Tx, auth: AuthContext, id: string, versionNo: number, action: Action = 'view') {
  await formHead(tx, auth, id, action);
  const [version] = await tx.select().from(formVersions).where(and(eq(formVersions.formId, id), eq(formVersions.versionNo, versionNo))).limit(1);
  if (!version) throw notFound(); return version;
}
/** Task 7: version-number/id pagination includes every historic publication. */
export async function listFormVersions(tx: Tx, auth: AuthContext, id: string, query: { limit?: string; cursor?: string }) {
  await formHead(tx, auth, id);
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'number' || !Number.isSafeInteger(cursor.k) || !z.uuid().safeParse(cursor.id).success)) throw new (await import('../../api/errors')).ApiError(400, 'validation_error', 'Invalid version cursor');
  return page(await tx.select().from(formVersions).where(and(eq(formVersions.formId, id), cursor ? or(lt(formVersions.versionNo, Number(cursor.k)), and(eq(formVersions.versionNo, Number(cursor.k)), lt(formVersions.id, cursor.id))) : undefined)).orderBy(desc(formVersions.versionNo), desc(formVersions.id)).limit(limit + 1), limit, row => row.versionNo);
}
/** Task 7: review permission is checked by the actual stored form kind. */
export async function coachSubmission(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  requireSome(auth, action);
  const [kind] = await tx.select({ formKind: formSubmissions.formKind }).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, id))).limit(1);
  if (!kind) throw notFound();
  requireFormPermission(auth, kind.formKind, action);
  const [row] = await tx.select({ submission: formSubmissions, document: formVersions.document, name: forms.name, clientName: clients.firstName })
    .from(formSubmissions).innerJoin(formVersions, eq(formVersions.id, formSubmissions.formVersionId)).innerJoin(forms, eq(forms.id, formSubmissions.formId)).innerJoin(clients, eq(clients.id, formSubmissions.clientId))
    .where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, id))).limit(1);
  if (!row) throw notFound(); return row;
}
/** Task 7: waiting-for-coach review queue uses exact PostgreSQL submitted-time cursors. */
export async function listSubmissions(tx: Tx, auth: AuthContext, query: z.infer<typeof submissionListSchema>) {
  requireSome(auth, 'view');
  if (query.formKind) requireFormPermission(auth, query.formKind, 'view');
  const allowed = (['intake', 'checkin', 'assessment'] as const).filter(kind => isAllowed(auth, formModule(kind), 'view'));
  const { limit, cursor } = formCursor(query);
  const rows = await tx.select({ id: formSubmissions.id, clientId: formSubmissions.clientId, clientName: clients.firstName, formKind: formSubmissions.formKind,
    state: formSubmissions.state, submittedAt: formSubmissions.submittedAt, name: forms.name, missingRequired: formSubmissions.missingRequired, document: formVersions.document, answers: formSubmissions.answers,
    cursorStamp: sql<string>`to_char(${formSubmissions.submittedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` })
    .from(formSubmissions).innerJoin(forms, eq(forms.id, formSubmissions.formId)).innerJoin(formVersions, eq(formVersions.id, formSubmissions.formVersionId)).innerJoin(clients, eq(clients.id, formSubmissions.clientId))
    .where(and(eq(formSubmissions.tenantId, auth.tenantId), !query.state || query.state === 'waiting_for_coach' ? inArray(formSubmissions.state, ['submitted', 'waiting_for_coach']) : eq(formSubmissions.state, query.state), isNotNull(formSubmissions.submittedAt), inArray(formSubmissions.formKind, query.formKind ? [query.formKind] : allowed),
      query.clientId ? eq(formSubmissions.clientId, query.clientId) : undefined,
      cursor ? or(sql`${formSubmissions.submittedAt} < ${cursor.k}::timestamptz`, and(sql`${formSubmissions.submittedAt} = ${cursor.k}::timestamptz`, lt(formSubmissions.id, cursor.id))) : undefined))
    .orderBy(desc(formSubmissions.submittedAt), desc(formSubmissions.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.cursorStamp);
  return { ...result, items: result.items.map(({ cursorStamp, document, answers, ...row }) => {
    void cursorStamp; const visible = evaluateVisibility(document, answers).visible;
    const missingPhotos = document.sections.flatMap(section => section.questions).some(question => {
      const answer = answers[question.id];
      return question.type === 'photo' && visible.has(question.id) && (!answer || typeof answer !== 'object' || Array.isArray(answer) || !answer.mediaIds.length);
    });
    return { ...row, flags: missingPhotos ? ['missing_photos'] : [] };
  }) };
}
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
/** Task 7: resolve event JSON internally, then return only the explicit client event projection. */
export async function clientFormForEvent(tx: Tx, auth: AuthContext, eventId: string) {
  const clientId = ownClient(auth);
  const [internal] = await tx.select({ ...clientColumns.calendarEvents, attachedFormId: sql<string | null>`${calendarEvents.payload}->>'formId'`, pinnedVersionId: sql<string | null>`${calendarEvents.payload}->>'formVersionId'` }).from(calendarEvents)
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
  const rows = await tx.select({ ...clientColumns.calendarEvents, cursorStamp: sql<string>`to_char(${calendarEvents.dueAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(calendarEvents)
    .where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, clientId), eq(calendarEvents.type, query.formKind), cursor ? or(sql`${calendarEvents.dueAt} < ${cursor.k}::timestamptz`, and(sql`${calendarEvents.dueAt} = ${cursor.k}::timestamptz`, lt(calendarEvents.id, cursor.id))) : undefined))
    .orderBy(desc(calendarEvents.dueAt), desc(calendarEvents.id)).limit(limit + 1);
  const result = page(rows, limit, row => row.cursorStamp);
  const items = await Promise.all(result.items.map(async ({ cursorStamp, ...event }) => {
    void cursorStamp;
    const [submission] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.calendarEventId, event.id))).orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id)).limit(1);
    return { ...event, submission: submission ? publicSubmission(submission) : null };
  }));
  return { ...result, items };
}
