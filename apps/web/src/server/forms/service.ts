import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { clients, calendarEvents, forms, formVersions, formSubmissions } from '@dawlyy/db/schema';
import { FormDocument, type CheckinState } from '@dawlyy/core/types';
import { nextVersionNo, publish } from '@dawlyy/core/versioning';
import { transition } from '@dawlyy/core/state';
import { validateAnswers } from '@dawlyy/core/forms';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { ApiError, notFound, unprocessable } from '../../api/errors';
import { draftIssues } from './helpers';
import { formHead, getForm, getFormVersion, requireFormPermission } from './read';
import { validateFormMedia } from './submissions';
import type { createFormSchema, patchFormSchema, draftSchema, publishSchema, revertSchema, sendSchema, skipSchema, knownSchema } from './schemas';

type Head = typeof forms.$inferSelect;
async function lock(tx: Tx, auth: AuthContext, id: string, action: 'edit' | 'publish' | 'create') {
  await formHead(tx, auth, id, action);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}::text, 0))`);
  return formHead(tx, auth, id, action);
}
async function versions(tx: Tx, head: Head) {
  return tx.select().from(formVersions).where(and(eq(formVersions.tenantId, head.tenantId), eq(formVersions.formId, head.id))).orderBy(desc(formVersions.versionNo));
}
async function insertDraft(tx: Tx, head: Head, document: FormDocument, no: number, changeNote?: string) {
  const [row] = await tx.insert(formVersions).values({ tenantId: head.tenantId, formId: head.id, versionNo: no, document, ...(changeNote === undefined ? {} : { changeNote }) }).returning();
  if (!row) throw notFound();
  // §7.3.2: currentVersionId is API-owned; publishedVersionId is trigger-owned.
  await tx.update(forms).set({ currentVersionId: row.id }).where(and(eq(forms.tenantId, head.tenantId), eq(forms.id, head.id)));
  return row;
}
async function visibleClient(tx: Tx, auth: AuthContext, id: string) {
  const [row] = await tx.select({ id: clients.id, timezone: clients.timezone }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, id))).limit(1);
  if (!row) throw notFound(); return row;
}
async function publishedVersion(tx: Tx, head: Head) {
  if (!head.publishedVersionId || head.archivedAt) throw unprocessable('nothing_to_publish');
  const [row] = await tx.select().from(formVersions).where(and(eq(formVersions.tenantId, head.tenantId), eq(formVersions.formId, head.id), eq(formVersions.id, head.publishedVersionId), eq(formVersions.status, 'published'))).limit(1);
  if (!row) throw notFound(); return row;
}

/** Task 7: template creation always starts with one structurally valid section and draft v1. */
export async function createForm(tx: Tx, auth: AuthContext, input: z.infer<typeof createFormSchema>) {
  requireFormPermission(auth, input.formKind, 'create');
  const [head] = await tx.insert(forms).values({ tenantId: auth.tenantId, name: input.name, formKind: input.formKind, kind: 'template' }).returning();
  if (!head) throw notFound();
  await insertDraft(tx, head, FormDocument.parse({ sections: [{ id: randomUUID(), title: input.name, questions: [] }] }), 1);
  return getForm(tx, auth, head.id, 'create');
}

/** Task 7: head changes and exclusive defaults serialize per tenant/kind without service privileges. */
export async function patchForm(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof patchFormSchema>) {
  const first = await formHead(tx, auth, id, 'edit');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`forms-default:${auth.tenantId}:${first.formKind}`}::text, 0))`);
  const head = await lock(tx, auth, id, 'edit');
  if (input.is_default && (head.kind !== 'template' || input.archived || head.archivedAt && input.archived !== false)) throw unprocessable('template_required');
  if (input.is_default) await tx.update(forms).set({ isDefault: 0 }).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.formKind, head.formKind), ne(forms.id, id), eq(forms.isDefault, 1)));
  await tx.update(forms).set({ ...(input.name === undefined ? {} : { name: input.name }), ...(input.archived === undefined ? {} : { archivedAt: input.archived ? head.archivedAt ?? new Date() : null }),
    ...(input.archived ? { isDefault: 0 } : input.is_default === undefined ? {} : { isDefault: input.is_default ? 1 : 0 }) }).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.id, id)));
  return getForm(tx, auth, id, 'edit');
}

/** Task 7: frozen content is copied to N+1; optimistic draft checks never mutate an old snapshot. */
export async function putFormDraft(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof draftSchema>) {
  await lock(tx, auth, id, 'edit'); const detail = await getForm(tx, auth, id, 'edit'); const version = detail.currentVersion;
  if (input.baseVersionNo !== version.versionNo || input.baseRevision !== undefined && input.baseRevision !== detail.revision) throw new ApiError(409, 'stale_draft', 'Reload the form before saving');
  if (version.status === 'draft') {
    await tx.update(formVersions).set({ document: input.document, ...(input.changeNote === undefined ? {} : { changeNote: input.changeNote }) }).where(and(eq(formVersions.tenantId, auth.tenantId), eq(formVersions.id, version.id), eq(formVersions.status, 'draft')));
    await tx.update(forms).set({ currentVersionId: version.id }).where(and(eq(forms.tenantId, auth.tenantId), eq(forms.id, id)));
  } else if (['published', 'superseded', 'archived'].includes(version.status)) {
    await insertDraft(tx, detail.head, input.document, nextVersionNo(await versions(tx, detail.head)), input.changeNote);
  } else throw new ApiError(409, 'version_immutable', 'Create a fresh draft from a saved version');
  return getForm(tx, auth, id, 'edit');
}

/** Task 7 / §12.1.5: supersede before publish; database stamps and pointer triggers remain authoritative. */
export async function publishForm(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof publishSchema>) {
  await lock(tx, auth, id, 'publish'); const detail = await getForm(tx, auth, id, 'publish');
  // Frozen VERSION config requires forms:publish even for check-in and assessment documents.
  requirePermission(auth, 'forms', 'publish');
  const working = detail.currentVersion;
  if (detail.head.archivedAt || !['draft', 'approved'].includes(working.status)) throw unprocessable('nothing_to_publish');
  const issues = draftIssues(working.document);
  if (issues.length) throw unprocessable('form_invalid', 'Resolve form issues before publishing', issues);
  const all = await versions(tx, detail.head);
  const decision = publish(all.filter(row => row.id !== working.id).map(row => ({ id: row.id, versionNo: row.versionNo, status: row.status, document: row.document })), { document: working.document }, new Date().toISOString());
  if (input.changeNote !== undefined && input.changeNote !== working.changeNote) {
    if (working.status !== 'draft') throw new ApiError(409, 'version_immutable', 'Approved change notes are immutable');
    await tx.update(formVersions).set({ changeNote: input.changeNote }).where(and(eq(formVersions.tenantId, auth.tenantId), eq(formVersions.id, working.id)));
  }
  for (const old of decision.supersededIds) await tx.update(formVersions).set({ status: 'superseded' }).where(and(eq(formVersions.tenantId, auth.tenantId), eq(formVersions.id, old)));
  const [result] = await tx.update(formVersions).set({ status: 'published' }).where(and(eq(formVersions.tenantId, auth.tenantId), eq(formVersions.id, working.id))).returning();
  if (!result) throw notFound();
  await tx.execute(sql`select app.audit('form.publish', 'form_versions', ${result.id}, null, ${JSON.stringify({ versionNo: result.versionNo })}::jsonb, ${input.changeNote ?? null})`);
  await tx.execute(sql`select app.emit_event('form.published', 'form_versions', ${result.id})`);
  return result;
}

/** Task 7: historical content becomes a fresh draft, preserving every frozen version. */
export async function revertForm(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof revertSchema>) {
  const head = await lock(tx, auth, id, 'edit'); const source = await getFormVersion(tx, auth, id, input.toVersionNo, 'edit');
  await insertDraft(tx, head, structuredClone(source.document), nextVersionNo(await versions(tx, head)), input.changeNote);
  return getForm(tx, auth, id, 'edit');
}

/** Task 7: duplicate a template or customize its published document into an RLS-scoped client copy. */
export async function copyForm(tx: Tx, auth: AuthContext, id: string, clientId?: string) {
  const source = await lock(tx, auth, id, 'create');
  if (source.kind !== 'template') throw unprocessable('template_required');
  if (clientId) await visibleClient(tx, auth, clientId);
  const document = clientId ? (await publishedVersion(tx, source)).document : (await getForm(tx, auth, id, 'create')).currentVersion.document;
  const [head] = await tx.insert(forms).values({ tenantId: auth.tenantId, name: source.name, formKind: source.formKind, kind: clientId ? 'client' : 'template',
    ...(clientId ? { clientId, templateId: source.id } : {}) }).returning();
  if (!head) throw notFound();
  await insertDraft(tx, head, structuredClone(document), 1);
  return getForm(tx, auth, head.id, 'create');
}

/** Task 7: source=manual is explicitly permitted by §5.2/§6.3, so sends stay in withAuthTx. */
export async function sendForm(tx: Tx, auth: AuthContext, input: z.infer<typeof sendSchema>) {
  const head = await formHead(tx, auth, input.formId, 'create'); const client = await visibleClient(tx, auth, input.clientId);
  if (head.formKind !== input.formKind || head.clientId && head.clientId !== client.id) throw unprocessable('form_invalid');
  const version = await publishedVersion(tx, head); const dueAt = input.dueAt ? new Date(input.dueAt) : new Date();
  const timezone = client.timezone || 'Africa/Cairo';
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dueAt);
  const [event] = await tx.insert(calendarEvents).values({ tenantId: auth.tenantId, clientId: client.id, type: input.formKind, source: 'manual', dueAt, localDate, timezone,
    title: head.name, payload: { formId: head.id, formVersionId: version.id } }).returning();
  if (!event) throw notFound(); return event;
}

/** Task 7: skip locks submission before event (§7.5.2) and keeps the reason in coach-only event JSON. */
export async function skipForm(tx: Tx, auth: AuthContext, input: z.infer<typeof skipSchema>) {
  if (auth.role === 'client') throw new ApiError(403, 'forbidden', 'Coach action required');
  const [kind] = await tx.select({ type: calendarEvents.type }).from(calendarEvents).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, input.eventId))).limit(1);
  if (!kind || !['intake', 'checkin', 'assessment'].includes(kind.type)) throw notFound(); requireFormPermission(auth, kind.type, 'edit');
  const submissions = await tx.select().from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.calendarEventId, input.eventId))).orderBy(desc(formSubmissions.id)).for('update');
  const [event] = await tx.select().from(calendarEvents).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, input.eventId))).limit(1).for('update');
  if (!event) throw notFound(); const edge = transition('checkin', event.state, 'skip');
  if (!edge.ok) throw unprocessable('transition_refused');
  for (const submission of submissions) {
    const next = transition('checkin', submission.state, 'skip'); if (!next.ok) throw unprocessable('transition_refused');
    await tx.update(formSubmissions).set({ state: next.to as CheckinState }).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, submission.id)));
  }
  const [result] = await tx.update(calendarEvents).set({ state: 'skipped', payload: { ...event.payload, skipReason: input.reason } }).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.id, input.eventId))).returning();
  return result;
}

/** Task 7: known intake is a coach-entered, reviewed snapshot under the runtime guard and normal validator. */
export async function markKnown(tx: Tx, auth: AuthContext, input: z.infer<typeof knownSchema>) {
  const head = await formHead(tx, auth, input.formId, 'create'); requireFormPermission(auth, 'intake', 'review');
  if (head.formKind !== 'intake' || head.clientId && head.clientId !== input.clientId) throw unprocessable('form_invalid');
  await visibleClient(tx, auth, input.clientId); const version = await publishedVersion(tx, head);
  const issues = validateAnswers(version.document, input.answers);
  if (issues.length) throw unprocessable('missing_required', 'Resolve intake answers', issues);
  await validateFormMedia(tx, auth, input.clientId, version.document, input.answers);
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`intake:${auth.tenantId}:${input.clientId}:${version.id}`}::text, 0))`);
  const [old] = await tx.select({ id: formSubmissions.id }).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, input.clientId), eq(formSubmissions.formVersionId, version.id), isNull(formSubmissions.calendarEventId))).limit(1);
  if (old) throw new ApiError(409, 'already_submitted', 'An intake already exists for this version');
  const [row] = await tx.insert(formSubmissions).values({ tenantId: auth.tenantId, clientId: input.clientId, formId: head.id, formKind: 'intake', formVersionId: version.id, answers: input.answers, state: 'submitted' }).returning();
  if (!row) throw notFound();
  const next = transition('checkin', row.state, 'review'); if (!next.ok) throw unprocessable('transition_refused');
  const [result] = await tx.update(formSubmissions).set({ state: next.to as CheckinState }).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, row.id))).returning();
  await tx.execute(sql`select app.audit('checkin.review', 'form_submissions', ${row.id}, null, null, 'coach-entered intake')`);
  return result;
}
