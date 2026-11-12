import 'server-only';
import { and, desc, eq, inArray, isNull, isNotNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clients, forms, formVersions, formSubmissions } from '@dawlyy/db/schema';
import { isAllowed, type Action } from '@dawlyy/core/authz';
import { evaluateVisibility } from '@dawlyy/core/forms';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound } from '../../api/errors';
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
// Existing server callers retain these exports; client code imports client-read directly.
export { ownClient, ownSubmission, publicSubmission, clientFormForEvent, clientIntake, clientEvents } from './client-read';
