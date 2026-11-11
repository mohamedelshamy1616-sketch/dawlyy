import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { calendarEvents, clients, formSubmissions, formVersions, media, metricEntries } from '@dawlyy/db/schema';
import { evaluateVisibility, validateAnswers } from '@dawlyy/core/forms';
import { transition, eventsFrom } from '@dawlyy/core/state';
import type { Answers, FormDocument, CheckinState } from '@dawlyy/core/types';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { ApiError, notFound, unprocessable } from '../../api/errors';
import { clientFormForEvent, clientIntake, coachSubmission, ownClient, ownSubmission, publicSubmission, requireFormPermission } from './read';
import { mappedMetrics } from './helpers';
import type { answersSchema, reviewSchema } from './schemas';

function postgresCode(error: unknown): string | undefined {
  let current = error;
  for (let i = 0; i < 6 && current && typeof current === 'object'; i++) {
    const pg = current as { code?: string; cause?: unknown }; if (pg.code) return pg.code; current = pg.cause;
  }
  return undefined;
}
async function lockKey(tx: Tx, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}::text, 0))`);
}
function editable(state: string) {
  if (!['scheduled', 'due', 'overdue'].includes(state)) throw new ApiError(409, 'already_submitted', 'Answers are locked after submission');
}
async function documentFor(tx: Tx, auth: AuthContext, id: string) {
  const [row] = await tx.select(clientColumns.formVersions).from(formVersions).where(and(eq(formVersions.tenantId, auth.tenantId), eq(formVersions.id, id))).limit(1);
  if (!row) throw notFound(); return row.document;
}

/** Task 7 / §12.1.3: attachments resolve through the caller's RLS scope and must belong to this client. */
export async function validateFormMedia(tx: Tx, auth: AuthContext, clientId: string, document: FormDocument, answers: Answers) {
  const visible = evaluateVisibility(document, answers).visible;
  for (const question of document.sections.flatMap(section => section.questions)) {
    if (!visible.has(question.id) || !['photo', 'video', 'file'].includes(question.type)) continue;
    const value = answers[question.id];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const ids = [...new Set(value.mediaIds)]; if (!ids.length) continue;
    if (ids.some(id => !z.uuid().safeParse(id).success)) throw unprocessable('invalid_media');
    const rows = await tx.select({ id: clientColumns.media.id, kind: clientColumns.media.kind, uploadedAt: clientColumns.media.uploadedAt }).from(media)
      .where(and(eq(media.tenantId, auth.tenantId), eq(media.clientId, clientId), eq(media.purpose, 'form_answer'), isNull(media.deletedAt), inArray(media.id, ids)));
    if (rows.length !== ids.length || rows.some(row => !row.uploadedAt || question.type !== 'file' && row.kind !== question.type)) throw unprocessable('invalid_media', 'Attachment is unavailable or belongs to another client', { questionId: question.id });
  }
}

async function updateAnswers(tx: Tx, auth: AuthContext, row: NonNullable<Awaited<ReturnType<typeof ownSubmission>>>, input: z.infer<typeof answersSchema>) {
  editable(row.state); const document = await documentFor(tx, auth, row.formVersionId);
  const issues = validateAnswers(document, input.answers); const invalid = issues.filter(issue => issue.code !== 'required');
  if (invalid.length) throw unprocessable('answers_invalid', 'Some answers have an invalid format', invalid);
  await validateFormMedia(tx, auth, row.clientId, document, input.answers);
  const missingRequired = evaluateVisibility(document, input.answers).missingRequired;
  // §12.1.12: null-safe strictly-newer timestamp; exactly the client_update columns.
  await tx.update(formSubmissions).set({ answers: input.answers, missingRequired, clientUpdatedAt: new Date(input.clientUpdatedAt) })
    .where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, row.clientId), eq(formSubmissions.id, row.id), or(isNull(formSubmissions.clientUpdatedAt), lt(formSubmissions.clientUpdatedAt, new Date(input.clientUpdatedAt)))));
  const saved = await ownSubmission(tx, auth, row.id); if (!saved) throw notFound(); return publicSubmission(saved);
}

/** Task 7 / §12.1.12: own-client sync uses SELECT + guarded UPDATE, never conflict-update. */
export async function saveAnswers(tx: Tx, auth: AuthContext, handle: string, input: z.infer<typeof answersSchema>) {
  const clientId = ownClient(auth);
  await lockKey(tx, `forms-answer:${auth.tenantId}:${clientId}:${input.clientUuid}`);
  const direct = await ownSubmission(tx, auth, handle);
  const bundle = direct ? null : await clientFormForEvent(tx, auth, handle).catch(async error => {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    const intake = await clientIntake(tx, auth);
    if (!intake || intake.version.id !== handle) throw notFound(); return intake;
  });
  const versionId = direct?.formVersionId ?? bundle?.version.id;
  if (!versionId) throw notFound();
  const eventId = direct?.calendarEventId ?? bundle?.event?.id ?? null;
  await lockKey(tx, eventId ? `form-event:${auth.tenantId}:${clientId}:${eventId}` : `intake:${auth.tenantId}:${clientId}:${versionId}`);
  const [byUuid] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.clientUuid, input.clientUuid))).limit(1);
  if (byUuid && (byUuid.formVersionId !== versionId || byUuid.calendarEventId !== eventId)) throw new ApiError(409, 'client_uuid_conflict', 'This client UUID is already used for another form');
  const [byTarget] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId),
    eventId ? eq(formSubmissions.calendarEventId, eventId) : and(eq(formSubmissions.formVersionId, versionId), isNull(formSubmissions.calendarEventId)))).limit(1).for('update');
  const existing = byUuid ?? byTarget ?? direct;
  if (existing) {
    if (existing.state === 'scheduled') await tx.execute(sql`select app.advance_due(${existing.id}::uuid)`);
    const locked = await ownSubmission(tx, auth, existing.id, true); if (!locked) throw notFound();
    return updateAnswers(tx, auth, locked, input);
  }
  if (!bundle) throw notFound();
  if (bundle.event && (!['scheduled', 'due', 'overdue'].includes(bundle.event.state) || bundle.event.dueAt > new Date())) throw unprocessable('not_due');
  const issues = validateAnswers(bundle.version.document, input.answers);
  if (issues.some(issue => issue.code !== 'required')) throw unprocessable('answers_invalid', 'Some answers have an invalid format', issues);
  await validateFormMedia(tx, auth, clientId, bundle.version.document, input.answers);
  try {
    return await tx.transaction(async savepoint => {
      const [row] = await savepoint.insert(formSubmissions).values({ tenantId: auth.tenantId, clientId, formId: bundle.head.id, formKind: bundle.head.formKind, formVersionId: versionId,
        calendarEventId: eventId, subscriptionId: bundle.event?.subscriptionId ?? null, state: 'due', answers: input.answers,
        missingRequired: evaluateVisibility(bundle.version.document, input.answers).missingRequired, clientUuid: input.clientUuid, clientUpdatedAt: new Date(input.clientUpdatedAt) }).returning(clientColumns.formSubmissions);
      if (!row) throw notFound(); return publicSubmission(row);
    });
  } catch (error) {
    if (postgresCode(error) !== '23505') throw error;
    const [row] = await tx.select(clientColumns.formSubmissions).from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, clientId), eq(formSubmissions.clientUuid, input.clientUuid))).limit(1).for('update');
    if (!row || row.formVersionId !== versionId || row.calendarEventId !== eventId) throw new ApiError(409, 'client_uuid_conflict', 'Concurrent submission conflict');
    return updateAnswers(tx, auth, row, input);
  }
}

/** Task 7 / G9: append visible metric answers atomically with submission, using deterministic dedupe IDs. */
export async function recordFormMetrics(tx: Tx, auth: AuthContext, submission: { id: string; clientId: string }, document: FormDocument, answers: Answers) {
  const [client] = await tx.select({ timezone: clientColumns.clients.timezone }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, submission.clientId))).limit(1);
  if (!client) throw notFound(); const timezone = client.timezone || 'Africa/Cairo'; const now = new Date();
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  for (const value of mappedMetrics(document, answers)) {
    const hex = createHash('sha256').update(`${submission.id}:${value.questionId}`).digest('hex');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
    await tx.insert(metricEntries).values({ tenantId: auth.tenantId, clientId: submission.clientId, metric: value.metric, metricKey: value.metricKey,
      value: value.value, unit: value.unit, source: 'manual', recordedAt: now, localDate, timezone, clientUuid: uuid }).onConflictDoNothing();
  }
}

/** Task 7 / §12.1.10: due advancement, validation, completion, metrics and semantic event are one transaction. */
export async function submitAnswers(tx: Tx, auth: AuthContext, id: string) {
  const original = await ownSubmission(tx, auth, id, true); if (!original) throw notFound(); editable(original.state);
  await tx.execute(sql`select app.advance_due(${id}::uuid)`);
  const row = await ownSubmission(tx, auth, id, true); if (!row) throw notFound();
  const document = await documentFor(tx, auth, row.formVersionId);
  let event: { id: string } | undefined;
  if (row.calendarEventId) {
    const [found] = await tx.select(clientColumns.calendarEvents).from(calendarEvents).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, row.clientId), eq(calendarEvents.id, row.calendarEventId))).limit(1).for('update');
    if (!found) throw notFound();
    if (found.dueAt > new Date() || !['scheduled', 'due', 'overdue'].includes(found.state)) throw unprocessable('not_due'); event = found;
  }
  const issues = validateAnswers(document, row.answers); const missing = evaluateVisibility(document, row.answers).missingRequired;
  if (missing.length) throw unprocessable('missing_required', 'Required answers are missing', { questionIds: missing });
  if (issues.length) throw unprocessable('answers_invalid', 'Answers are invalid', issues);
  await validateFormMedia(tx, auth, row.clientId, document, row.answers);
  const edge = transition('checkin', row.state, 'submit'); if (!edge.ok) throw unprocessable('transition_refused');
  const [submitted] = await tx.update(formSubmissions).set({ state: edge.to as CheckinState, missingRequired: [] }).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.clientId, row.clientId), eq(formSubmissions.id, id))).returning(clientColumns.formSubmissions);
  if (!submitted) throw notFound();
  // Frozen §6.3 client_transitions forbids submitted→waiting_for_coach. Keep submitted and include it
  // in the review queue; never switch identity or use service credentials to bypass this refusal.
  if (event) await tx.update(calendarEvents).set({ state: 'completed' }).where(and(eq(calendarEvents.tenantId, auth.tenantId), eq(calendarEvents.clientId, row.clientId), eq(calendarEvents.id, event.id)));
  await recordFormMetrics(tx, auth, row, document, row.answers);
  await tx.execute(sql`select app.audit('checkin.submit', 'form_submissions', ${id})`);
  await tx.execute(sql`select app.emit_event('checkin.submitted', 'form_submissions', ${id})`);
  return publicSubmission(submitted);
}

/** Task 7: review accepts the machine's submitted/waiting states; unsupported resubmission is refused explicitly. */
export async function reviewSubmission(tx: Tx, auth: AuthContext, id: string, input: z.infer<typeof reviewSchema>) {
  const detail = await coachSubmission(tx, auth, id, 'review'); requireFormPermission(auth, detail.submission.formKind, 'review');
  const [row] = await tx.select().from(formSubmissions).where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, id))).limit(1).for('update');
  if (!row) throw notFound();
  if (input.outcome === 'needs_resubmission') {
    // There is no such edge in core or the database; a new event can request a fresh response.
    if (!eventsFrom('checkin', row.state).includes('request_resubmission')) throw unprocessable('resubmission_unsupported', 'Send a new form to request another response');
  }
  const edge = transition('checkin', row.state, 'review'); if (!edge.ok) throw unprocessable('transition_refused');
  if (input.results && row.formKind !== 'assessment') throw unprocessable('assessment_required');
  const questionIds = new Set(detail.document.sections.flatMap(section => section.questions.map(question => question.id)));
  if (input.results && Object.keys(input.results).some(key => !questionIds.has(key))) throw unprocessable('results_invalid');
  const [result] = await tx.update(formSubmissions).set({ state: edge.to as CheckinState, ...(input.coachFeedback === undefined ? {} : { coachFeedback: input.coachFeedback }), ...(input.results === undefined ? {} : { results: input.results }) })
    .where(and(eq(formSubmissions.tenantId, auth.tenantId), eq(formSubmissions.id, id))).returning();
  if (!result) throw notFound();
  await tx.execute(sql`select app.audit('checkin.review', 'form_submissions', ${id})`);
  await tx.execute(sql`select app.emit_event('checkin.reviewed', 'form_submissions', ${id})`);
  return result;
}
