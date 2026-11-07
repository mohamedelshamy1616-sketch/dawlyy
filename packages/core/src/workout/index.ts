import type { SessionState, IsoDate, WeightUnit } from '../types';

export class WorkoutError extends Error {
  constructor(public readonly code: 'invalid_unit') {
    super(code);
    this.name = 'WorkoutError';
  }
}

export type PerformedSet = {
  exerciseId: string;
  setNo: number;
  tag?: 'warmup' | 'working' | 'drop' | 'failure' | 'backoff' | 'amrap';
  reps?: number;
  load?: number;
  loadUnit?: WeightUnit;
  durationSec?: number;
  distanceM?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  skipped: boolean;
};

export type SessionRecord = {
  id: string;
  workoutId?: string;
  localDate: IsoDate;
  state: SessionState;
  sets: PerformedSet[];
  activeSeconds?: number;
  plannedSetCount?: number;
};

export type ExerciseTotals = { volume: number; reps: number; sets: number; completedSets: number; topLoad: number; est1RM: number };
export type SessionTotals = { volume: number; reps: number; sets: number; completedSets: number; byExercise: Record<string, ExerciseTotals> };
export type Delta = { current: number; previous: number | null; delta: number | null; pct: number | null };
export type ExerciseStatus = 'improved' | 'maintained' | 'regressed' | 'new' | 'missing';
export type Comparison = {
  comparable: boolean;
  reasons: Array<'no_previous' | 'different_workout' | 'previous_not_completed' | 'exercise_set_mismatch'>;
  volume: Delta;
  reps: Delta;
  topLoad: Delta;
  completionPct: Delta;
  durationSec: Delta;
  exercises: Array<{ exerciseId: string; volume: Delta; reps: Delta; topLoad: Delta; est1RM: Delta; status: ExerciseStatus }>;
};

export const KG_PER_LB = 0.45359237;

function assertUnit(unit: WeightUnit): void {
  if (unit !== 'kg' && unit !== 'lb') throw new WorkoutError('invalid_unit');
}

export function convertLoad(value: number, from: WeightUnit, to: WeightUnit): number {
  assertUnit(from);
  assertUnit(to);
  const converted = from === to ? value : to === 'kg' ? value * KG_PER_LB : value / KG_PER_LB;
  return Math.round((converted + Number.EPSILON) * 100) / 100;
}

export function estimate1RM(load: number, reps: number): number {
  if (reps <= 0) return 0;
  return reps === 1 ? load : load * (1 + reps / 30);
}

function emptyTotals(): ExerciseTotals {
  return { volume: 0, reps: 0, sets: 0, completedSets: 0, topLoad: 0, est1RM: 0 };
}

export function sessionVolume(sets: PerformedSet[], unit: WeightUnit): SessionTotals {
  assertUnit(unit);
  // A null prototype also permits opaque exercise ids such as "constructor" safely.
  const byExercise: Record<string, ExerciseTotals> = Object.create(null) as Record<string, ExerciseTotals>;
  const result: SessionTotals = { volume: 0, reps: 0, sets: 0, completedSets: 0, byExercise };
  for (const set of sets) {
    const totals = byExercise[set.exerciseId] ?? (byExercise[set.exerciseId] = emptyTotals());
    if (set.loadUnit !== undefined) assertUnit(set.loadUnit);
    if (set.tag === 'warmup' || set.skipped) continue;
    totals.sets++;
    result.sets++;
    // Prefilled or unfinished sets must not inflate actual performance (spec §13).
    if (!set.completed) continue;
    const reps = set.reps ?? 0;
    const load = convertLoad(set.load ?? 0, set.loadUnit ?? unit, unit);
    const volume = load * reps;
    totals.completedSets++;
    totals.reps += reps;
    totals.volume += volume;
    totals.topLoad = Math.max(totals.topLoad, load);
    totals.est1RM = Math.max(totals.est1RM, estimate1RM(load, reps));
    result.completedSets++;
    result.reps += reps;
    result.volume += volume;
  }
  return result;
}

export function completionPct(session: SessionRecord): number {
  const denominator = session.plannedSetCount ?? session.sets.length;
  if (denominator <= 0) return 0;
  const completed = session.sets.filter(set => set.completed && !set.skipped && set.tag !== 'warmup').length;
  return Math.round(completed / denominator * 100);
}

function delta(current: number, previous: number | null): Delta {
  return { current, previous, delta: previous === null ? null : current - previous,
    // No finite percentage can describe progress from a zero baseline.
    pct: previous === null || previous === 0 ? null : (current - previous) / previous * 100 };
}

function topLoad(totals: SessionTotals): number {
  return Object.values(totals.byExercise).reduce((maximum, exercise) => Math.max(maximum, exercise.topLoad), 0);
}

function eligible(session: SessionRecord): boolean {
  return session.state === 'completed' || session.state === 'partially_completed';
}

function exceeds(a: number, b: number): boolean {
  // Epley arithmetic can put an exact 2% change a few floating-point units past the boundary.
  const roundoff = Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)) * 4;
  return a - b > roundoff;
}

function status(current: ExerciseTotals | undefined, previous: ExerciseTotals | undefined): ExerciseStatus {
  if (!previous) return 'new';
  if (!current) return 'missing';
  // Improvement takes precedence when strength and volume move oppositely.
  if (exceeds(current.est1RM, previous.est1RM * 1.02) || exceeds(current.volume, previous.volume * 1.02)) return 'improved';
  if (exceeds(previous.est1RM * 0.98, current.est1RM) || exceeds(previous.volume * 0.98, current.volume)) return 'regressed';
  return 'maintained';
}

export function compareSessions(current: SessionRecord, previous: SessionRecord | null, opts?: { unit?: WeightUnit }): Comparison {
  const unit = opts?.unit ?? 'kg';
  const currentTotals = sessionVolume(current.sets, unit);
  const previousTotals = previous ? sessionVolume(previous.sets, unit) : null;
  const reasons: Comparison['reasons'] = [];
  if (!previous) reasons.push('no_previous');
  else {
    if (current.workoutId !== previous.workoutId) reasons.push('different_workout');
    if (!eligible(previous)) reasons.push('previous_not_completed');
    const currentIds = new Set(current.sets.map(set => set.exerciseId));
    const previousIds = new Set(previous.sets.map(set => set.exerciseId));
    const shared = [...currentIds].filter(id => previousIds.has(id)).length;
    if (currentIds.size === 0 || shared / currentIds.size < 0.5) reasons.push('exercise_set_mismatch');
  }
  const ids = new Set([...Object.keys(currentTotals.byExercise), ...Object.keys(previousTotals?.byExercise ?? {})]);
  return {
    comparable: reasons.length === 0,
    reasons,
    volume: delta(currentTotals.volume, previousTotals?.volume ?? null),
    reps: delta(currentTotals.reps, previousTotals?.reps ?? null),
    topLoad: delta(topLoad(currentTotals), previousTotals ? topLoad(previousTotals) : null),
    completionPct: delta(completionPct(current), previous ? completionPct(previous) : null),
    durationSec: delta(current.activeSeconds ?? 0, previous ? previous.activeSeconds ?? 0 : null),
    exercises: [...ids].map(exerciseId => {
      const c = currentTotals.byExercise[exerciseId];
      const p = previousTotals?.byExercise[exerciseId];
      return { exerciseId, volume: delta(c?.volume ?? 0, p?.volume ?? null),
        reps: delta(c?.reps ?? 0, p?.reps ?? null), topLoad: delta(c?.topLoad ?? 0, p?.topLoad ?? null),
        est1RM: delta(c?.est1RM ?? 0, p?.est1RM ?? null), status: status(c, p) };
    }),
  };
}

function newestFirst(a: SessionRecord, b: SessionRecord): number {
  if (a.localDate !== b.localDate) return a.localDate > b.localDate ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function findLastComparable(current: SessionRecord, history: SessionRecord[]): SessionRecord | null {
  return history.filter(session => session.id !== current.id && session.localDate < current.localDate
    && session.workoutId === current.workoutId && eligible(session)).sort(newestFirst)[0] ?? null;
}

/** Drawer totals use kg, matching compareSessions' default unit. */
export function exerciseHistory(exerciseId: string, history: SessionRecord[], limit = 5): Array<{
  sessionId: string; localDate: IsoDate; sets: PerformedSet[]; totals: ExerciseTotals;
}> {
  return history.filter(session => session.sets.some(set => set.exerciseId === exerciseId))
    .sort(newestFirst).slice(0, Math.max(0, Math.floor(limit))).map(session => {
      const sets = session.sets.filter(set => set.exerciseId === exerciseId);
      return { sessionId: session.id, localDate: session.localDate, sets,
        totals: sessionVolume(sets, 'kg').byExercise[exerciseId] ?? emptyTotals() };
    });
}
