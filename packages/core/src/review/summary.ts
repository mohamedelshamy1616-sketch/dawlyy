import type { CheckinSnapshot, WeekReview, WeekReviewInput } from './types';
import { calendarDay, compareText, percent, round, sortRecords, stableJson } from './math';

type Summary = WeekReview['summary'];
type Answer = CheckinSnapshot['answers'][number];

function checkinChanges(input: WeekReviewInput['checkin']): Summary['checkin'] {
  const current = input.current?.answers ?? [];
  const previous = input.previous?.answers ?? [];
  const previousById = new Map(previous.map(answer => [answer.questionId, answer]));
  const currentIds = new Set(current.map(answer => answer.questionId));
  function compare(now: Answer, before: Answer): Summary['checkin']['changes'][number]['change'] {
    if (now.kind !== before.kind) return 'changed';
    if ((now.kind === 'number' || now.kind === 'scale') && typeof now.value === 'number' && typeof before.value === 'number') {
      return now.value > before.value ? 'up' : now.value < before.value ? 'down' : 'same';
    }
    return stableJson(now.value) === stableJson(before.value) ? 'same' : 'changed';
  }
  const changes: Summary['checkin']['changes'] = current.map(now => {
    const before = previousById.get(now.questionId);
    return { questionId: now.questionId, label: now.label, kind: now.kind, current: now.value, previous: before?.value ?? null,
      change: before ? compare(now, before) : 'new' };
  });
  for (const before of previous) {
    if (!currentIds.has(before.questionId)) changes.push({ questionId: before.questionId, label: before.label, kind: before.kind,
      current: null, previous: before.value, change: 'missing' });
  }
  return { submittedOn: input.current?.submittedOn ?? null, changes };
}

export function weightEvidence(weights: WeekReviewInput['weights']): { spanDays: number; kgPerWeek: number | null; summary: Summary['weight'] } {
  const sorted = [...weights].sort((a, b) => compareText(a.on, b.on) || a.kg - b.kg);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return { spanDays: 0, kgPerWeek: null,
    summary: { first: null, last: null, deltaKg: null, kgPerWeek: null, trend: null } };
  const spanDays = calendarDay(last.on) - calendarDay(first.on);
  let kgPerWeek: number | null = null;
  if (sorted.length >= 3 && spanDays >= 7) {
    const xs = sorted.map(weight => calendarDay(weight.on) - calendarDay(first.on));
    const meanX = xs.reduce((sum, x) => sum + x, 0) / sorted.length;
    const meanY = sorted.reduce((sum, weight) => sum + weight.kg, 0) / sorted.length;
    let covariance = 0;
    let variance = 0;
    for (let i = 0; i < sorted.length; i++) {
      const dx = xs[i]! - meanX;
      covariance += dx * (sorted[i]!.kg - meanY);
      variance += dx * dx;
    }
    kgPerWeek = covariance / variance * 7;
  }
  // Compare raw evidence; rounding 0.06 to 0.1 must not turn a flat trend into an increase.
  // Tolerance only absorbs floating-point subtraction noise at the exact 0.1 boundary.
  const trend = kgPerWeek === null ? null : Math.abs(kgPerWeek) + 1e-10 < 0.1 ? 'flat' : kgPerWeek < 0 ? 'down' : 'up';
  return { spanDays, kgPerWeek, summary: {
    first: { on: first.on, kg: round(first.kg) }, last: { on: last.on, kg: round(last.kg) },
    deltaKg: sorted.length >= 2 ? round(last.kg - first.kg) : null,
    kgPerWeek: kgPerWeek === null ? null : round(kgPerWeek), trend,
  } };
}

function measurements(input: WeekReviewInput['measurements']): Summary['measurements'] {
  const sorted = sortRecords(input, entry => entry.on);
  const first = sorted[0]?.values;
  const last = sorted[sorted.length - 1]?.values;
  if (!first || !last) return [];
  return Object.keys(first).filter(key => Object.hasOwn(last, key)).sort(compareText).map(key => ({
    key, first: round(first[key]!), last: round(last[key]!), delta: round(last[key]! - first[key]!),
  }));
}

export function summarize(input: WeekReviewInput, weight: Summary['weight']): Summary {
  const workouts = input.workouts;
  const current = percent(workouts.done, workouts.planned);
  const previous = percent(workouts.previousDone, workouts.previousPlanned);
  const change = current === null || previous === null ? null : Math.abs(current - previous) <= 5 + 1e-10 ? 'same' : current > previous ? 'up' : 'down';
  const seenCategories = new Set<string>();
  const redFlags = input.redFlags.filter(flag => {
    if (seenCategories.has(flag.category)) return false;
    seenCategories.add(flag.category);
    return true;
  });
  const meals = input.meals;
  return {
    adherence: {
      workouts: { done: workouts.done, planned: workouts.planned, percent: current === null ? null : round(current, 1),
        previousPercent: previous === null ? null : round(previous, 1), change },
      meals: meals.nutritionAssigned ? { daysLogged: meals.daysLogged, daysInPeriod: meals.daysInPeriod,
        percent: round(percent(meals.daysLogged, meals.daysInPeriod)!, 1), avgKcal: meals.avgKcal === null ? null : round(meals.avgKcal, 5),
        targetKcal: meals.targetKcal === null ? null : round(meals.targetKcal, 5) } : null,
    },
    checkin: checkinChanges(input.checkin), weight, measurements: measurements(input.measurements),
    prs: input.exercises.flatMap(exercise => exercise.status === 'improved' && exercise.topLoadKg !== null
      && exercise.previousTopLoadKg !== null && exercise.topLoadKg > exercise.previousTopLoadKg
      ? [{ exerciseId: exercise.exerciseId, name: exercise.name, topLoadKg: round(exercise.topLoadKg), previousTopLoadKg: round(exercise.previousTopLoadKg) }] : []),
    stalls: input.exercises.filter(exercise => exercise.stalledSessions >= 3 || exercise.status === 'regressed')
      .map(({ exerciseId, name, status, stalledSessions }) => ({ exerciseId, name, status, stalledSessions })),
    redFlags, attentionReasons: input.attention?.reasons ?? [],
  };
}
