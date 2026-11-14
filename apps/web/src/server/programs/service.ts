import 'server-only';
import { and, desc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { clients, programs, programVersions, subscriptions } from '@dawlyy/db/schema';
import { applyProgramOps, emptyProgram, programStats } from '@dawlyy/core/program-edit';
import { ProgramDocument } from '@dawlyy/core/types';
import type { Action } from '@dawlyy/core/authz';
import { createTranslator } from 'next-intl';
import english from '../../../messages/en/programs.json';
import arabic from '../../../messages/ar/programs.json';
import { currentPublished, nextVersionNo, publish } from '@dawlyy/core/versioning';
import type { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { ApiError, notFound, unprocessable } from '../../api/errors';
import { documentRevision, editContext, versionRecords } from './helpers';
import { getProgram, getProgramVersion, programHead, programIssues, requireProgramPermission } from './read';
import type { assignSchema, createProgramSchema, draftSchema, opsSchema, patchProgramSchema, publishSchema, revertSchema } from './schemas';

type Head = typeof programs.$inferSelect;
type Version = typeof programVersions.$inferSelect;

async function lockClientPrograms(tx: Tx, auth: AuthContext, clientId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`program-client:${auth.tenantId}:${clientId}`}::text, 0))`);
}

async function lockProgram(tx: Tx, auth: AuthContext, id: string, action: Action) {
  // Same lock as app.version_rules; this also serializes ordinary draft edits and head changes.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}::text, 0))`);
  return programHead(tx, auth, id, action);
}

async function versionsOf(tx: Tx, id: string) {
  return tx.select().from(programVersions).where(eq(programVersions.programId, id)).orderBy(desc(programVersions.versionNo));
}

async function currentVersion(tx: Tx, head: Head): Promise<Version> {
  const [version] = head.currentVersionId ? await tx.select().from(programVersions).where(and(eq(programVersions.programId, head.id), eq(programVersions.id, head.currentVersionId))).limit(1) : [];
  if (!version) throw notFound('Working version not found');
  return version;
}

function assertFresh(version: Version, base: { baseVersionNo?: number; baseRevision?: string }) {
  if ((base.baseVersionNo !== undefined && base.baseVersionNo !== version.versionNo)
    || (base.baseRevision !== undefined && base.baseRevision !== documentRevision({ id: version.id, status: version.status, document: version.document }))) {
    throw new ApiError(409, 'stale_draft', 'The program changed; reload before saving');
  }
}

async function insertDraft(tx: Tx, head: Head, document: ProgramDocument, versionNo: number, changeNote?: string) {
  const [version] = await tx.insert(programVersions).values({ tenantId: head.tenantId, programId: head.id, versionNo, status: 'draft', document, ...(changeNote === undefined ? {} : { changeNote }) }).returning();
  if (!version) throw notFound();
  await tx.update(programs).set({ currentVersionId: version.id }).where(eq(programs.id, head.id));
  return version;
}

async function touch(tx: Tx, head: Head, currentId: string) {
  // Setting this API-owned pointer also lets the head guard stamp updated_at after an in-place draft edit.
  await tx.update(programs).set({ currentVersionId: currentId }).where(eq(programs.id, head.id));
}

async function saveDocument(tx: Tx, head: Head, version: Version, document: ProgramDocument, changeNote?: string) {
  const issues = await programIssues(tx, document);
  // Incomplete workouts are legitimate drafts. Broken structure and invisible exercise references are not.
  if (issues.some(issue => issue.code !== 'empty_workout' && issue.code !== 'empty_block' && issue.code !== 'training_without_workout')) {
    throw unprocessable('program_invalid', 'The draft contains invalid program data', issues);
  }
  let saved: Version;
  if (version.status === 'draft') {
    const [updated] = await tx.update(programVersions).set({ document, ...(changeNote === undefined ? {} : { changeNote }) }).where(and(eq(programVersions.id, version.id), eq(programVersions.status, 'draft'))).returning();
    if (!updated) throw new ApiError(409, 'stale_draft', 'The draft changed; reload');
    saved = updated;
    await touch(tx, head, saved.id);
  } else if (version.status === 'published' || version.status === 'superseded' || version.status === 'archived') {
    saved = await insertDraft(tx, head, document, nextVersionNo(await versionsOf(tx, head.id)), changeNote);
  } else {
    throw unprocessable('review_locked', 'The reviewed document cannot be edited; revert to a new draft');
  }
  return { document: saved.document, versionNo: saved.versionNo, status: saved.status,
    revision: documentRevision({ id: saved.id, status: saved.status, document: saved.document }), stats: programStats(saved.document), issues };
}

/** Task 4: create a template head and its first draft in the caller's single transaction. */
export async function createProgram(tx: Tx, auth: AuthContext, body: z.infer<typeof createProgramSchema>) {
  requireProgramPermission(auth, 'create');
  const [head] = await tx.insert(programs).values({ tenantId: auth.tenantId, name: body.name, tags: body.tags ?? [], kind: 'template' }).returning();
  if (!head) throw notFound();
  await insertDraft(tx, head, emptyProgram(editContext(), { weeks: body.weeks, trainingDays: body.trainingDays }), 1);
  return getProgram(tx, auth, head.id, 'create');
}

/** Task 4: head edits never accept generated ids, tenant stamps or version pointers. */
export async function patchProgram(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof patchProgramSchema>) {
  requireProgramPermission(auth, 'edit');
  const head = await lockProgram(tx, auth, id, 'edit');
  await tx.update(programs).set({ ...(body.name === undefined ? {} : { name: body.name }), ...(body.tags === undefined ? {} : { tags: body.tags }),
    ...(body.archived === undefined ? {} : { archivedAt: body.archived ? head.archivedAt ?? new Date() : null }) }).where(eq(programs.id, id));
  return getProgram(tx, auth, id, 'edit');
}

/** Task 4: frozen snapshots are copied into a fresh draft; existing drafts are replaced after freshness checks. */
export async function putProgramDraft(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof draftSchema>) {
  requireProgramPermission(auth, 'edit');
  const head = await lockProgram(tx, auth, id, 'edit');
  const version = await currentVersion(tx, head);
  assertFresh(version, body);
  return saveDocument(tx, head, version, ProgramDocument.parse(body.document), body.changeNote);
}

/** Task 4: browser and server share exactly the core operation implementation and generated element ids. */
export async function applyProgramOperations(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof opsSchema>) {
  requireProgramPermission(auth, 'edit');
  const head = await lockProgram(tx, auth, id, 'edit');
  const version = await currentVersion(tx, head);
  assertFresh(version, body);
  const document = applyProgramOps(version.document, body.ops, editContext(body.editIds));
  return saveDocument(tx, head, version, document);
}

/** Task 4 / VERSION config: submit draft → in_review or approve in_review → approved. */
export async function transitionProgram(tx: Tx, auth: AuthContext, id: string, action: 'submit-review' | 'approve') {
  requireProgramPermission(auth, action === 'approve' ? 'publish' : 'edit');
  const head = await lockProgram(tx, auth, id, action === 'approve' ? 'publish' : 'edit');
  const version = await currentVersion(tx, head);
  const expected = action === 'approve' ? 'in_review' : 'draft';
  if (version.status !== expected) throw unprocessable('transition_refused', 'This version is not in the required review state');
  const issues = await programIssues(tx, version.document);
  if (issues.length) throw unprocessable('program_invalid', 'Resolve validation issues before review', issues);
  const [updated] = await tx.update(programVersions).set({ status: action === 'approve' ? 'approved' : 'in_review' }).where(eq(programVersions.id, version.id)).returning();
  if (!updated) throw notFound();
  await touch(tx, head, version.id);
  return updated;
}

async function publishWorking(tx: Tx, auth: AuthContext, head: Head, body: z.infer<typeof publishSchema>) {
  requireProgramPermission(auth, 'publish');
  if (head.clientId) {
    const [other] = await tx.select({ id: programs.id }).from(programs).where(and(eq(programs.tenantId, auth.tenantId), eq(programs.clientId, head.clientId), ne(programs.id, head.id), isNull(programs.archivedAt), isNotNull(programs.publishedVersionId))).limit(1);
    if (other) throw new ApiError(409, 'client_has_program', 'This client already has a published program; replace that copy explicitly');
  }
  const working = await currentVersion(tx, head);
  assertFresh(working, body);
  if (working.status !== 'draft' && working.status !== 'approved') throw unprocessable('nothing_to_publish', 'There is no publishable draft');
  const all = await versionsOf(tx, head.id);
  const published = currentPublished(versionRecords(all));
  if (published && working.versionNo <= published.versionNo) throw unprocessable('nothing_to_publish', 'The draft is older than the published version');
  const issues = await programIssues(tx, working.document);
  if (issues.length) throw unprocessable('program_invalid', 'Resolve validation issues before publishing', issues);
  // Core publish models a new snapshot. Use its equality check and supersession decision, preserving
  // this draft's allocated number and leaving publication stamps to the database.
  const decision = publish(versionRecords(all.filter(version => version.id !== working.id)), { document: working.document, changeNote: body.changeNote }, new Date().toISOString());
  if (body.changeNote !== undefined && body.changeNote !== working.changeNote) {
    if (working.status !== 'draft') throw unprocessable('review_locked', 'An approved version keeps its reviewed change note');
    await tx.update(programVersions).set({ changeNote: body.changeNote }).where(eq(programVersions.id, working.id));
  }
  for (const oldId of decision.supersededIds) await tx.update(programVersions).set({ status: 'superseded' }).where(and(eq(programVersions.id, oldId), eq(programVersions.programId, head.id)));
  const [result] = await tx.update(programVersions).set({ status: 'published' }).where(eq(programVersions.id, working.id)).returning();
  if (!result) throw notFound();
  await touch(tx, head, working.id);
  await tx.execute(sql`select app.audit('program.publish', 'program_versions', ${result.id}, null, ${JSON.stringify({ versionNo: result.versionNo, status: result.status })}::jsonb, ${body.changeNote ?? result.changeNote ?? null})`);
  await tx.execute(sql`select app.emit_event('program.published', 'program_versions', ${result.id}, ${JSON.stringify({ programId: head.id, versionNo: result.versionNo })}::jsonb)`);
  return result;
}

/** Doc §12.1 item 5: supersede first, publish second; the database owns publication stamps and pointers. */
export async function publishProgram(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof publishSchema>) {
  requireProgramPermission(auth, 'publish');
  const preliminary = await programHead(tx, auth, id, 'publish');
  if (preliminary.clientId) await lockClientPrograms(tx, auth, preliminary.clientId);
  const head = await lockProgram(tx, auth, id, 'publish');
  return publishWorking(tx, auth, head, body);
}

/** Task 4: revert always appends a new draft, leaving every earlier snapshot intact. */
export async function revertProgram(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof revertSchema>) {
  requireProgramPermission(auth, 'edit');
  const head = await lockProgram(tx, auth, id, 'edit');
  const source = await getProgramVersion(tx, auth, id, body.toVersionNo, 'edit');
  const draft = await insertDraft(tx, head, structuredClone(source.document), nextVersionNo(await versionsOf(tx, id)), body.changeNote);
  return { document: draft.document, versionNo: draft.versionNo, status: draft.status, revision: documentRevision({ id: draft.id, status: draft.status, document: draft.document }) };
}

/** Task 4: duplicate templates as independent heads and version-one drafts. */
export async function duplicateProgram(tx: Tx, auth: AuthContext, id: string) {
  requireProgramPermission(auth, 'create');
  const source = await lockProgram(tx, auth, id, 'create');
  if (source.kind !== 'template') throw unprocessable('template_required', 'Only templates can be duplicated');
  const version = await currentVersion(tx, source);
  const [head] = await tx.insert(programs).values({ tenantId: auth.tenantId, kind: 'template', tags: source.tags,
    name: { ...(source.name.ar ? { ar: `${source.name.ar} ${createTranslator({ locale: 'ar', messages: arabic })('copySuffix')}` } : {}), ...(source.name.en ? { en: `${source.name.en} ${createTranslator({ locale: 'en', messages: english })('copySuffix')}` } : {}) } }).returning();
  if (!head) throw notFound();
  await insertDraft(tx, head, structuredClone(version.document), 1);
  return getProgram(tx, auth, head.id, 'create');
}

/** Task 4: assign only published template content; replacements append to the existing client's head. */
export async function assignProgram(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof assignSchema>) {
  requireProgramPermission(auth, body.publish ? 'publish' : 'edit');
  const assignmentAction = body.publish ? 'publish' : 'edit';
  const template = await programHead(tx, auth, id, assignmentAction);
  if (template.kind !== 'template') throw unprocessable('template_required', 'Only templates can be assigned');
  if (!template.publishedVersionId) throw unprocessable('template_not_published', 'Publish the template before assigning it');
  // Assignment serializes by client across all templates, preventing two concurrent first-copy creations.
  await lockClientPrograms(tx, auth, body.clientId);
  const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, body.clientId), eq(clients.tenantId, auth.tenantId))).limit(1);
  if (!client) throw notFound('Client not found');
  const [source] = await tx.select({ document: programVersions.document }).from(programVersions).where(and(eq(programVersions.id, template.publishedVersionId), eq(programVersions.programId, id), eq(programVersions.status, 'published'))).limit(1);
  if (!source) throw unprocessable('template_not_published', 'Publish the template before assigning it');
  const [subscription] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(and(eq(subscriptions.clientId, body.clientId), eq(subscriptions.tenantId, auth.tenantId),
    body.subscriptionId ? eq(subscriptions.id, body.subscriptionId) : eq(subscriptions.state, 'active'))).orderBy(desc(subscriptions.startsOn), desc(subscriptions.id)).limit(1);
  if (body.subscriptionId && !subscription) throw notFound('Subscription not found for this client');
  const existing = await tx.select().from(programs).where(and(eq(programs.tenantId, auth.tenantId), eq(programs.clientId, body.clientId), eq(programs.kind, 'client'), isNull(programs.archivedAt), isNotNull(programs.publishedVersionId))).orderBy(desc(programs.createdAt), desc(programs.id));
  if (existing.length && !body.replace) throw new ApiError(409, 'client_has_program', 'This client already has a published program');
  if (existing.length > 1) throw new ApiError(409, 'client_has_program', 'Multiple published programs need a coach review before replacement');
  let head: Head;
  if (existing[0]) {
    head = await lockProgram(tx, auth, existing[0].id, assignmentAction);
    const working = await currentVersion(tx, head);
    if (working.status !== 'published' && working.status !== 'superseded' && working.status !== 'archived') throw new ApiError(409, 'stale_draft', 'This copy has unpublished work; finish it before replacing');
    // templateId is immutable: retain the original assignment provenance while replacing the version snapshot.
    const [updated] = await tx.update(programs).set({ name: template.name, subscriptionId: subscription?.id ?? null }).where(eq(programs.id, head.id)).returning();
    if (!updated) throw notFound();
    head = updated;
  } else {
    const [created] = await tx.insert(programs).values({ tenantId: auth.tenantId, kind: 'client', clientId: body.clientId, templateId: template.id, name: template.name, tags: [], subscriptionId: subscription?.id ?? null }).returning();
    if (!created) throw notFound();
    head = created;
  }
  const document = applyProgramOps(structuredClone(source.document), body.startDate ? [{ type: 'meta.update', patch: { startDate: body.startDate } }] : [], editContext());
  const draft = await insertDraft(tx, head, document, nextVersionNo(await versionsOf(tx, head.id)));
  if (body.publish) await publishWorking(tx, auth, { ...head, currentVersionId: draft.id }, {});
  return getProgram(tx, auth, head.id, assignmentAction);
}

/** Task 4 acceptance: direct historic-version mutation is refused; edits belong on the working-draft routes. */
export async function refuseVersionWrite(tx: Tx, auth: AuthContext, id: string, versionNo: number): Promise<never> {
  requireProgramPermission(auth, 'edit');
  const version = await getProgramVersion(tx, auth, id, versionNo, 'edit');
  if (version.publishedAt !== null || version.status === 'published' || version.status === 'superseded') throw new ApiError(409, 'version_immutable', 'Published versions are immutable; create a new draft');
  throw unprocessable('use_draft_route', 'Edit this version through the draft or operations route');
}
