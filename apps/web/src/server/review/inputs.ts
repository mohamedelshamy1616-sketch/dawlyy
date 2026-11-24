import 'server-only';
import { sql } from 'drizzle-orm';
import { isAllowed, type Module } from '@dawlyy/core/authz';
import { rankAttention, type AttentionInput } from '@dawlyy/core/attention';
import { WeekReviewInput, type CheckinSnapshot } from '@dawlyy/core/review';
import { compareSessions, findLastComparable, type SessionRecord, type PerformedSet } from '@dawlyy/core/workout';
import type { Answers, FormDocument, LocalizedText, NutritionDocument, ProgramDocument, SessionState } from '@dawlyy/core/types';
import type { AuthContext, Tx } from '../db';
import { forbidden, notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { attentionGoal, plannedWorkouts } from '../inbox/logic';
import { canonicalSourceRevision, type ReviewSourceMarker } from './hash';
import type { ReviewContext, SourcePermission } from './types';

/** R4b: only caller-visible, unarchived client context; today never enters the protected hash. */
export type ReviewClient = { id: string; firstName: string; goal: WeekReviewInput['client']['goal']; timezone: string; today: string; startedOn: string | null; updatedAt: string | null };
type Change = { id: string; updatedAt: string | null; voidedAt: string | null };
type Session = Change & { localDate: string; state: SessionState; workoutId: string | null };
type SetRow = { id: string; sessionId: string; exerciseId: string; setNo: number; tag: string; reps: number | null; load: number | null; loadUnit: string | null; completed: boolean; skipped: boolean; deletedAt: string | null; updatedAt: string | null };
type Published<D> = { id: string; planId: string; document: D; publishedAt: string | null; archivedAt: string | null };
type Checkin = { id: string; formVersionId: string; submittedOn: string; submittedAt: string; state: string; updatedAt: string | null; reviewedAt: string | null; answers: Answers; document: FormDocument };
type Meal = Change & { localDate: string; status: string; freeEntry: { macros?: { kcal: number } } | null; mealId: string | null; optionId: string | null; planVersionId: string | null; document: NutritionDocument | null };
type Weight = Change & { localDate: string; value: number; unit: string; correctionOf: string | null };
type Measurements = Change & { localDate: string; values: { type: string; value: number; unit: 'cm' | 'in'; side?: 'left' | 'right' }[]; replacesId: string | null };
type Flag = WeekReviewInput['redFlags'][number] & { status: string };
type Calendar = { id: string; localDate: string; type: string; state: string; updatedAt: string | null };
type Message = { id: string; senderRole: string; localDate: string; readAt: string | null; editedAt: string | null; deletedAt: string | null };
type Payment = { id: string; state: string; updatedAt: string | null };
type Subscription = { id: string; state: string; endsOn: string; updatedAt: string | null };

/** R4b: explicit source projections make void and optional-permission behavior unit-testable. */
export type ReviewSourceRows = {
  sessions: Session[]; sets: SetRow[]; programs: (Published<ProgramDocument> & { assignedOn: string | null })[];
  exercises: { id: string; name: LocalizedText; updatedAt: string | null }[];
  meals: Meal[]; checkins: Checkin[]; weights: Weight[]; measurements: Measurements[];
  flags: Flag[]; nutrition: Published<NutritionDocument>[]; calendar: Calendar[]; messages: Message[];
  payments: Payment[]; subscriptions: Subscription[];
};
const optionalSources = ['programs', 'exercises', 'nutrition', 'tracking', 'calendar', 'messages', 'billing'] as const;

/** R4b: all optional evidence starts absent, never synthesized as observed progress. */
export function emptyReviewSources(): ReviewSourceRows {
  return { sessions: [], sets: [], programs: [], exercises: [], meals: [], checkins: [], weights: [], measurements: [], flags: [], nutrition: [], calendar: [], messages: [], payments: [], subscriptions: [] };
}
/** R4b: staff-only base evidence grant runs before any source read. */
export function requireReviewAccess(auth: AuthContext): void {
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'clients', 'view');
  requirePermission(auth, 'checkins', 'review');
}
/** R4b: stored fuller evidence is never serialized after captured grant loss. */
export function assertReviewEvidenceAllowed(auth: AuthContext, grants: readonly SourcePermission[]): void {
  requireReviewAccess(auth);
  if (grants.some(grant => !isAllowed(auth, grant.module, grant.action))) throw forbidden('review_evidence_not_allowed');
}
/** R4b: RLS, explicit tenant scope and archive filtering resolve inaccessible clients as 404. */
export async function getReviewClient(tx: Tx, auth: AuthContext, clientId: string): Promise<ReviewClient> {
  requireReviewAccess(auth);
  const [row] = await tx.execute<ReviewClient>(sql`
    select c.id::text as id, c.first_name as "firstName", c.profile->>'goal' as goal, c.timezone,
      (now() at time zone c.timezone)::date::text as today, c.started_on::text as "startedOn", c.updated_at::text as "updatedAt"
    from public.clients c where c.tenant_id = ${auth.tenantId}::uuid and c.id = ${clientId}::uuid and c.archived_at is null`);
  if (!row) throw notFound();
  return { ...row, goal: attentionGoal(row.goal) };
}
function shift(on: string, days: number): string { return new Date(Date.parse(`${on}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
function weightWindowStart(to: string): string { return shift(to, -21); }
function span(context: ReviewContext): number { return Math.round((Date.parse(context.period.to) - Date.parse(context.period.from)) / 86400000) + 1; }
function inPeriod(on: string, from: string, to: string): boolean { return on >= from && on <= to; }
function planned(document: ProgramDocument | undefined, assignedOn: string | null, from: string, to: string): number {
  if (!document) return 0;
  const length = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (length === 7) return plannedWorkouts(document, assignedOn, to).planned7;
  if (length === 14) return plannedWorkouts(document, assignedOn, to).planned14;
  const start = document.startDate ?? assignedOn;
  if (!start) return 0;
  let weekOffset = 0; let count = 0;
  for (const phase of document.phases) for (const week of [...phase.weeks].sort((a, b) => a.index - b.index)) {
    for (const day of week.days) {
      const on = shift(start, weekOffset * 7 + day.index);
      if (day.kind === 'training' && day.workout && inPeriod(on, from, to) && (!document.endDate || on <= document.endDate)) count++;
    }
    weekOffset++;
  }
  return count;
}
function snapshot(row: Checkin | undefined): CheckinSnapshot | null {
  if (!row) return null;
  const answers: CheckinSnapshot['answers'] = [];
  for (const question of row.document.sections.flatMap(section => section.questions)) {
    if (question.type === 'photo' || question.type === 'video' || question.type === 'file') continue;
    const kind = question.type === 'number' ? 'number' : question.type === 'scale' ? 'scale' : question.type === 'yes_no' ? 'boolean'
      : question.type === 'single' || question.type === 'multi' ? 'choice' : 'text';
    const answer = row.answers[question.id] ?? null;
    const value = (kind === 'number' || kind === 'scale') ? typeof answer === 'number' ? answer : null
      : kind === 'boolean' ? typeof answer === 'boolean' ? answer : null
      : kind === 'choice' ? typeof answer === 'string' || Array.isArray(answer) ? answer : null : typeof answer === 'string' ? answer : null;
    answers.push({ questionId: question.id, label: question.label, kind, value });
  }
  return { submissionId: row.id, submittedOn: row.submittedOn, answers };
}
function sessionRecords(rows: ReviewSourceRows): SessionRecord[] {
  return rows.sessions.filter(row => !row.voidedAt && (row.state === 'completed' || row.state === 'partially_completed')).map(row => ({
    id: row.id, localDate: row.localDate, workoutId: row.workoutId ?? undefined, state: row.state,
    sets: rows.sets.filter(set => set.sessionId === row.id && !set.deletedAt).map(set => ({
      exerciseId: set.exerciseId, setNo: set.setNo, completed: set.completed, skipped: set.skipped,
      ...(set.reps === null ? {} : { reps: Number(set.reps) }), ...(set.load === null ? {} : { load: Number(set.load) }),
      ...(set.loadUnit === 'kg' || set.loadUnit === 'lb' ? { loadUnit: set.loadUnit } : {}),
      ...(['warmup', 'working', 'drop', 'failure', 'backoff', 'amrap'].includes(set.tag) ? { tag: set.tag as PerformedSet['tag'] } : {}),
    })),
  }));
}
function exerciseInputs(rows: ReviewSourceRows, context: ReviewContext): WeekReviewInput['exercises'] {
  const records = sessionRecords(rows);
  const result = new Map<string, WeekReviewInput['exercises'][number]>();
  const names = new Map(rows.exercises.map(row => [row.id, row.name]));
  for (const current of records.filter(row => inPeriod(row.localDate, context.period.from, context.period.to)).sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id))) {
    const comparison = compareSessions(current, findLastComparable(current, records));
    for (const item of comparison.exercises) {
      const name = names.get(item.exerciseId);
      if (!name) continue;
      const history = records.filter(record => record.sets.some(set => set.exerciseId === item.exerciseId) && record.localDate <= current.localDate)
        .sort((a, b) => b.localDate.localeCompare(a.localDate) || b.id.localeCompare(a.id)).slice(0, 5);
      let stalledSessions = 0;
      for (let index = 0; index < history.length - 1; index++) {
        const newer = history[index]!; const older = history[index + 1]!;
        const change = compareSessions(newer, older).exercises.find(exercise => exercise.exerciseId === item.exerciseId);
        if (!change || change.status === 'improved' || change.status === 'new') break;
        stalledSessions++;
      }
      result.set(item.exerciseId, { exerciseId: item.exerciseId, name, status: comparison.comparable ? item.status : 'new',
        topLoadKg: item.topLoad.current, previousTopLoadKg: comparison.comparable ? item.topLoad.previous : null, stalledSessions });
    }
  }
  return [...result.values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)).slice(0, 100);
}
function mealKcal(row: Meal): number | null {
  if (row.status === 'skipped') return 0;
  if (row.status !== 'eaten') return null;
  const free = row.freeEntry?.macros?.kcal;
  if (typeof free === 'number' && Number.isFinite(free)) return free;
  const meal = row.document?.meals.find(item => item.id === row.mealId);
  return meal?.options.find(option => option.id === row.optionId)?.macros?.kcal ?? null;
}

/** R4b: pure permission projection excludes voided observations while retaining source identities. */
export function projectReviewInputs(client: ReviewClient, context: ReviewContext, supplied: ReviewSourceRows, permissions: readonly SourcePermission[]) {
  const allowed = (key: Module) => permissions.some(grant => grant.module === key && grant.action === 'view');
  const rows = emptyReviewSources();
  rows.checkins = supplied.checkins; rows.flags = supplied.flags;
  if (allowed('programs')) { rows.programs = supplied.programs; rows.sessions = supplied.sessions; rows.sets = supplied.sets; }
  if (allowed('exercises') && allowed('programs')) rows.exercises = supplied.exercises;
  if (allowed('nutrition')) { rows.nutrition = supplied.nutrition; rows.meals = supplied.meals; }
  if (allowed('tracking')) { rows.weights = supplied.weights; rows.measurements = supplied.measurements; }
  if (allowed('calendar')) rows.calendar = supplied.calendar;
  if (allowed('messages')) rows.messages = supplied.messages;
  if (allowed('billing')) { rows.payments = supplied.payments; rows.subscriptions = supplied.subscriptions; }
  const length = span(context); const { from, to } = context.period; const previousFrom = shift(from, -length); const previousTo = shift(from, -1);
  const program = rows.programs[0]; const nutrition = rows.nutrition[0];
  const sessions = rows.sessions.filter(row => !row.voidedAt && row.state === 'completed');
  const meals = rows.meals.filter(row => !row.voidedAt && inPeriod(row.localDate, from, to));
  const mealDays = new Set(meals.map(row => row.localDate)).size;
  const calories = meals.map(mealKcal);
  const average = mealDays > 0 && calories.every(value => value !== null) ? calories.reduce<number>((sum, value) => sum + (value ?? 0), 0) / mealDays : null;
  const checkins = rows.checkins.filter(row => row.submittedOn <= to).sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt) || b.id.localeCompare(a.id));
  const current = checkins.find(row => row.submittedOn >= from);
  const previous = current ? checkins.find(row => row.id !== current.id && Date.parse(row.submittedAt) <= Date.parse(current.submittedAt)) : checkins[0];
  const weights = rows.weights.filter(row => !row.voidedAt && (row.unit === 'kg' || row.unit === 'lb'))
    .map(row => ({ on: row.localDate, kg: Number(row.value) * (row.unit === 'lb' ? 0.45359237 : 1) }));
  // The query orders readings by recording time and ID within each local date.
  const dailyWeights = new Map<string, typeof weights[number]>();
  const weightFrom = weightWindowStart(to);
  for (const sample of weights) {
    if (inPeriod(sample.on, weightFrom, to)) dailyWeights.set(sample.on, sample);
  }
  const flags = rows.flags.filter(row => row.status === 'open').map(({ id, category, source }) => ({ id, category, source }));
  const workoutWindows = program ? plannedWorkouts(program.document, program.assignedOn, to) : { planned7: 0, planned14: 0 };
  const messages = rows.messages.filter(row => !row.deletedAt);
  const coachOn = messages.filter(row => row.senderRole === 'owner' || row.senderRole === 'staff').map(row => row.localDate).sort().at(-1) ?? null;
  const attentionInput: AttentionInput = {
    clientId: client.id, goal: client.goal,
    lastCheckin: { submittedOn: checkins[0]?.submittedOn ?? null, status: checkins[0] ? checkins[0].reviewedAt ? 'reviewed' : 'waiting_review' : 'none',
      dueOn: rows.calendar.filter(row => ['scheduled', 'due', 'overdue'].includes(row.state)).map(row => row.localDate).sort()[0] ?? null },
    workouts: { ...workoutWindows, done7: sessions.filter(row => inPeriod(row.localDate, shift(to, -6), to)).length, done14: sessions.filter(row => inPeriod(row.localDate, shift(to, -13), to)).length },
    mealLogDays7: new Set(meals.filter(row => inPeriod(row.localDate, shift(to, -6), to)).map(row => row.localDate)).size,
    nutritionAssigned: nutrition !== undefined, weights14: weights.filter(row => inPeriod(row.on, shift(to, -13), to)), openRedFlags: flags.map(({ category }) => ({ category })),
    paymentPending: rows.payments.some(row => row.state === 'pending'), subscriptionEndsOn: rows.subscriptions[0]?.endsOn ?? null,
    lastCoachMessageOn: coachOn, unreadFromClient: messages.filter(row => row.senderRole === 'client' && !row.readAt).length,
  };
  const ranked = rankAttention([attentionInput], { today: to })[0] ?? null;
  // Absent optional sources cannot create synthetic warnings about work the caller cannot inspect.
  const attention = ranked ? { ...ranked, reasons: ranked.reasons.filter(reason => {
    if (['adherence_drop', 'low_adherence'].includes(reason.code)) return allowed('programs');
    if (['weight_wrong_way', 'weight_flat'].includes(reason.code)) return allowed('tracking');
    if (reason.code === 'meals_missing') return allowed('nutrition');
    if (['unread_messages', 'no_contact'].includes(reason.code)) return allowed('messages');
    if (['subscription_ends', 'subscription_ended', 'payment_pending'].includes(reason.code)) return allowed('billing');
    if (reason.code === 'checkin_overdue') return allowed('calendar');
    return true;
  }) } : null;
  const input = WeekReviewInput.parse({
    client: { id: client.id, firstName: client.firstName, goal: client.goal }, coach: context.coach, period: context.period,
    workouts: { planned: planned(program?.document, program?.assignedOn ?? null, from, to), done: sessions.filter(row => inPeriod(row.localDate, from, to)).length,
      previousPlanned: planned(program?.document, program?.assignedOn ?? null, previousFrom, previousTo), previousDone: sessions.filter(row => inPeriod(row.localDate, previousFrom, previousTo)).length },
    exercises: exerciseInputs(rows, context), meals: { nutritionAssigned: !!nutrition, daysLogged: mealDays, daysInPeriod: length, avgKcal: average, targetKcal: nutrition?.document.targets.kcal ?? null },
    checkin: { current: snapshot(current), previous: snapshot(previous) },
    weights: weights.filter(row => inPeriod(row.on, from, to)).sort((a, b) => a.on.localeCompare(b.on) || a.kg - b.kg).slice(-60),
    rollingWeights: [...dailyWeights.values()],
    measurements: rows.measurements.filter(row => !row.voidedAt && inPeriod(row.localDate, from, to)).sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id)).slice(-30)
      .map(row => ({ on: row.localDate, values: Object.fromEntries(row.values.map(value => [value.side ? `${value.type}_${value.side}` : value.type, Number(value.value) * (value.unit === 'in' ? 2.54 : 1)])) })),
    redFlags: flags, attention, nutrition: nutrition ? { versionId: nutrition.id, targets: nutrition.document.targets } : null,
  });
  const tables: Record<keyof ReviewSourceRows, string> = { sessions: 'workout_sessions', sets: 'set_logs', programs: 'program_versions', exercises: 'exercises', meals: 'meal_logs', checkins: 'form_submissions', weights: 'metric_entries', measurements: 'measurement_sets', flags: 'red_flags', nutrition: 'nutrition_plan_versions', calendar: 'calendar_events', messages: 'messages', payments: 'payments', subscriptions: 'subscriptions' };
  const sources: ReviewSourceMarker[] = [{ table: 'clients', id: client.id, data: { firstName: client.firstName, goal: client.goal, timezone: client.timezone, startedOn: client.startedOn, updatedAt: client.updatedAt } }];
  for (const key of Object.keys(tables) as (keyof ReviewSourceRows)[]) for (const row of rows[key]) sources.push({ table: tables[key], id: row.id, data: row });
  const projection = Object.fromEntries(optionalSources.map(key => [key, allowed(key)]));
  const sourcePermissions = [...permissions];
  return { input, sourceRevision: canonicalSourceRevision(sources, projection), sourcePermissions,
    evidenceUnavailable: optionalSources.filter(key => !allowed(key)) };
}

/** R4b: all source reads and permission checks run inside the caller's existing authenticated transaction. */
export async function loadReviewInputs(tx: Tx, auth: AuthContext, clientId: string, context: ReviewContext) {
  requireReviewAccess(auth);
  const client = await getReviewClient(tx, auth, clientId);
  const rows = emptyReviewSources();
  const permissions: SourcePermission[] = [{ module: 'clients', action: 'view' }, { module: 'checkins', action: 'review' }];
  for (const key of optionalSources) if (isAllowed(auth, key, 'view')) permissions.push({ module: key, action: 'view' });
  const allowed = (key: Module) => permissions.some(grant => grant.module === key && grant.action === 'view');
  const T = sql`${auth.tenantId}::uuid`; const C = sql`${clientId}::uuid`;
  const from = context.period.from; const to = context.period.to; const historyFrom = shift(from, -42);
  rows.checkins = [...await tx.execute<Checkin>(sql`
    select fs.id::text as id, fs.form_version_id::text as "formVersionId", fs.state, fs.answers,
      fs.submitted_at::text as "submittedAt", (fs.submitted_at at time zone ${client.timezone})::date::text as "submittedOn",
      fs.updated_at::text as "updatedAt", fs.reviewed_at::text as "reviewedAt", fv.document
    from public.form_submissions fs join public.form_versions fv on fv.tenant_id = fs.tenant_id and fv.id = fs.form_version_id
    where fs.tenant_id = ${T} and fs.client_id = ${C} and fs.form_kind = 'checkin' and fs.submitted_at is not null
      and (fs.submitted_at at time zone ${client.timezone})::date <= ${to}::date
    order by fs.submitted_at desc, fs.id desc limit 2`)];
  rows.flags = [...await tx.execute<Flag>(sql`
    select id::text as id, category, source, status from public.red_flags
    where tenant_id = ${T} and client_id = ${C} and status = 'open'`)];
  if (allowed('programs')) {
    rows.programs = [...await tx.execute<ReviewSourceRows['programs'][number]>(sql`
      select v.id::text as id, p.id::text as "planId", v.document, v.published_at::text as "publishedAt", p.archived_at::text as "archivedAt",
        coalesce(c.started_on, s.starts_on, (v.published_at at time zone ${client.timezone})::date)::text as "assignedOn"
      from public.programs p join public.program_versions v on v.tenant_id = p.tenant_id and v.id = p.published_version_id and v.status = 'published'
      join public.clients c on c.tenant_id = p.tenant_id and c.id = p.client_id
      left join public.subscriptions s on s.tenant_id = p.tenant_id and s.id = p.subscription_id
      where p.tenant_id = ${T} and p.client_id = ${C} and p.archived_at is null order by v.published_at desc, p.id desc limit 1`)];
    rows.sessions = [...await tx.execute<Session>(sql`
      select ws.id::text as id, ws.local_date::text as "localDate", ws.state, ws.workout_id as "workoutId", ws.voided_at::text as "voidedAt",
        ws.updated_at::text as "updatedAt" from public.workout_sessions ws
      where ws.tenant_id = ${T} and ws.client_id = ${C} and ws.local_date between ${historyFrom}::date and ${to}::date`)];
    rows.sets = [...await tx.execute<SetRow>(sql`
      select sl.id::text as id, sl.session_id::text as "sessionId", sl.exercise_id::text as "exerciseId", sl.set_no as "setNo", sl.tag,
        sl.reps, sl.load::float8 as load, sl.load_unit as "loadUnit", sl.completed, sl.skipped, sl.deleted_at::text as "deletedAt", sl.client_updated_at::text as "updatedAt"
      from public.set_logs sl join public.workout_sessions ws on ws.tenant_id = sl.tenant_id and ws.id = sl.session_id and ws.client_id = sl.client_id
      where sl.tenant_id = ${T} and sl.client_id = ${C} and ws.local_date between ${historyFrom}::date and ${to}::date`)];
    if (allowed('exercises')) rows.exercises = [...await tx.execute<ReviewSourceRows['exercises'][number]>(sql`
      select e.id::text as id, e.name, e.updated_at::text as "updatedAt" from public.exercises e
      where e.id in (select sl.exercise_id from public.set_logs sl join public.workout_sessions ws on ws.tenant_id = sl.tenant_id and ws.id = sl.session_id
        where sl.tenant_id = ${T} and sl.client_id = ${C} and ws.local_date between ${historyFrom}::date and ${to}::date)` )];
  }
  if (allowed('nutrition')) {
    rows.nutrition = [...await tx.execute<ReviewSourceRows['nutrition'][number]>(sql`
      select v.id::text as id, p.id::text as "planId", v.document, v.published_at::text as "publishedAt", p.archived_at::text as "archivedAt"
      from public.nutrition_plans p join public.nutrition_plan_versions v on v.tenant_id = p.tenant_id and v.id = p.published_version_id and v.status = 'published'
      where p.tenant_id = ${T} and p.client_id = ${C} and p.archived_at is null order by p.created_at desc, p.id desc limit 1`)];
    rows.meals = [...await tx.execute<Meal>(sql`
      select ml.id::text as id, ml.local_date::text as "localDate", ml.status, ml.free_entry as "freeEntry", ml.meal_id as "mealId", ml.option_id as "optionId",
        ml.plan_version_id::text as "planVersionId", ml.voided_at::text as "voidedAt", ml.client_updated_at::text as "updatedAt", v.document
      from public.meal_logs ml left join public.nutrition_plan_versions v on v.tenant_id = ml.tenant_id and v.id = ml.plan_version_id and v.client_id = ml.client_id
      where ml.tenant_id = ${T} and ml.client_id = ${C} and ml.local_date between ${from}::date and ${to}::date`)];
  }
  if (allowed('tracking')) {
    rows.weights = [...await tx.execute<Weight>(sql`
      select id::text as id, local_date::text as "localDate", value::float8 as value, unit, correction_of::text as "correctionOf", voided_at::text as "voidedAt", client_updated_at::text as "updatedAt"
      from public.metric_entries where tenant_id = ${T} and client_id = ${C} and metric = 'weight' and local_date between ${weightWindowStart(to)}::date and ${to}::date
      order by local_date, recorded_at, id`)];
    rows.measurements = [...await tx.execute<Measurements>(sql`
      select id::text as id, local_date::text as "localDate", values, replaces_id::text as "replacesId", voided_at::text as "voidedAt", client_updated_at::text as "updatedAt"
      from public.measurement_sets where tenant_id = ${T} and client_id = ${C} and local_date between ${from}::date and ${to}::date`)];
  }
  if (allowed('calendar')) rows.calendar = [...await tx.execute<Calendar>(sql`
    select id::text as id, local_date::text as "localDate", type, state, updated_at::text as "updatedAt" from public.calendar_events
    where tenant_id = ${T} and client_id = ${C} and type in ('weekly_checkin','daily_checkin') and state in ('scheduled','due','overdue')`)];
  if (allowed('messages')) rows.messages = [...await tx.execute<Message>(sql`
    select id::text as id, sender_role as "senderRole", (created_at at time zone ${client.timezone})::date::text as "localDate",
      read_by_coach_at::text as "readAt", edited_at::text as "editedAt", deleted_at::text as "deletedAt"
    from public.messages where tenant_id = ${T} and client_id = ${C} and deleted_at is null`)];
  if (allowed('billing')) {
    rows.payments = [...await tx.execute<Payment>(sql`
      select id::text as id, state, updated_at::text as "updatedAt" from public.payments where tenant_id = ${T} and client_id = ${C} and state = 'pending'`)];
    rows.subscriptions = [...await tx.execute<Subscription>(sql`
      select id::text as id, state, ends_on::text as "endsOn", updated_at::text as "updatedAt" from public.subscriptions
      where tenant_id = ${T} and client_id = ${C} and state in ('active','grace','expired') order by created_at desc, id desc limit 1`)];
  }
  return projectReviewInputs(client, context, rows, permissions);
}
