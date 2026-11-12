import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { formSubmissions } from '@dawlyy/db/schema';
import { transition, eventsFrom } from '@dawlyy/core/state';
import type { CheckinState } from '@dawlyy/core/types';
import type { AuthContext, Tx } from '../db';
import type { z } from 'zod';
import type { reviewSchema } from './schemas';
import { notFound, unprocessable } from '../../api/errors';
import { coachSubmission, requireFormPermission } from './read';

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
