import { describe, it, expect } from 'vitest';
import {
  WorkoutError, convertLoad, estimate1RM, sessionVolume, completionPct, compareSessions,
  findLastComparable, exerciseHistory, type PerformedSet, type SessionRecord,
} from '../src/workout';
import type { WeightUnit } from '../src/types';

const set = (patch: Partial<PerformedSet> = {}): PerformedSet => ({
  exerciseId: 'bench', setNo: 1, reps: 10, load: 100, loadUnit: 'kg', completed: true, skipped: false, ...patch,
});
const session = (patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 'current', workoutId: 'upper', localDate: '2026-11-07', state: 'completed', sets: [set()], ...patch,
});

describe('workout load and totals', () => {
  it('uses Epley with the single-rep exception and handles nonpositive reps', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(100, -2)).toBe(0);
  });

  it('converts both ways to two decimals and rejects invalid runtime units', () => {
    expect(convertLoad(100, 'lb', 'kg')).toBe(45.36);
    expect(convertLoad(100, 'kg', 'lb')).toBe(220.46);
    expect(convertLoad(10.123, 'kg', 'kg')).toBe(10.12);
    expect(() => convertLoad(1, 'stone' as WeightUnit, 'kg')).toThrow(WorkoutError);
    expect(() => sessionVolume([], 'stone' as WeightUnit)).toThrow(expect.objectContaining({ code: 'invalid_unit' }));
  });

  it('excludes warmup, skipped and incomplete work from performed volume', () => {
    const result = sessionVolume([
      set({ tag: 'warmup' }), set({ skipped: true }), set({ completed: false }), set(),
      set({ exerciseId: 'run', load: undefined, reps: undefined, durationSec: 60, distanceM: 200 }),
    ], 'kg');
    expect(result).toMatchObject({ volume: 1000, reps: 10, sets: 3, completedSets: 2 });
    expect(result.byExercise.bench).toEqual({ volume: 1000, reps: 10, sets: 2, completedSets: 1, topLoad: 100, est1RM: 100 * (1 + 10 / 30) });
    expect(result.byExercise.run).toEqual({ volume: 0, reps: 0, sets: 1, completedSets: 1, topLoad: 0, est1RM: 0 });
  });

  it('converts pounds in mixed-unit logs and defaults unlabelled loads to the requested unit', () => {
    expect(sessionVolume([set({ load: 100, loadUnit: 'lb' })], 'kg').volume).toBeCloseTo(453.6, 5);
    expect(sessionVolume([set({ load: 100, loadUnit: undefined })], 'lb').byExercise.bench?.topLoad).toBe(100);
    expect(sessionVolume([], 'kg')).toEqual({ volume: 0, reps: 0, sets: 0, completedSets: 0, byExercise: {} });
  });

  it('calculates completion from completed non-warmup, non-skipped sets', () => {
    expect(completionPct(session({ plannedSetCount: 4, sets: [set(), set(), set()] }))).toBe(75);
    expect(completionPct(session({ sets: [set(), set({ tag: 'warmup' }), set({ skipped: true }), set({ completed: false })] }))).toBe(25);
    expect(completionPct(session({ sets: [] }))).toBe(0);
    expect(completionPct(session({ plannedSetCount: 0 }))).toBe(0);
    expect(completionPct(session({ plannedSetCount: 1, sets: [set(), set()] }))).toBe(200);
  });
});

describe('session comparison', () => {
  it('returns null previous values and only no_previous when there is no history', () => {
    const result = compareSessions(session(), null);
    expect(result.comparable).toBe(false);
    expect(result.reasons).toEqual(['no_previous']);
    expect(result.volume).toEqual({ current: 1000, previous: null, delta: null, pct: null });
    expect(result.durationSec).toEqual({ current: 0, previous: null, delta: null, pct: null });
    expect(result.exercises[0]?.status).toBe('new');
  });

  it('marks a comparable 10 percent volume increase improved', () => {
    const result = compareSessions(session({ sets: [set({ load: 110 })] }), session());
    expect(result.comparable).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.volume).toEqual({ current: 1100, previous: 1000, delta: 100, pct: 10 });
    expect(result.exercises[0]?.status).toBe('improved');
  });

  it('keeps deltas while listing every failed comparability condition', () => {
    const result = compareSessions(session(), session({ workoutId: 'lower', state: 'abandoned', sets: [set({ exerciseId: 'squat' })] }));
    expect(result.comparable).toBe(false);
    expect(result.reasons).toEqual(['different_workout', 'previous_not_completed', 'exercise_set_mismatch']);
    expect(result.volume.previous).toBe(1000);
    expect(result.exercises.map(e => [e.exerciseId, e.status])).toEqual([['bench', 'new'], ['squat', 'missing']]);
  });

  it('accepts exactly 50 percent exercise overlap and a partially completed previous session', () => {
    const result = compareSessions(session({ sets: [set(), set({ exerciseId: 'row' })] }), session({ state: 'partially_completed' }));
    expect(result.comparable).toBe(true);
    expect(compareSessions(session({ sets: [] }), session()).reasons).toEqual(['exercise_set_mismatch']);
  });

  it('uses a strict two percent threshold, with improvements taking precedence for mixed signals', () => {
    const previous = session();
    expect(compareSessions(session({ sets: [set({ load: 102 })] }), previous).exercises[0]?.status).toBe('maintained');
    expect(compareSessions(session({ sets: [set({ load: 98 })] }), previous).exercises[0]?.status).toBe('maintained');
    expect(compareSessions(session({ sets: [set({ load: 102.01 })] }), previous).exercises[0]?.status).toBe('improved');
    expect(compareSessions(session({ sets: [set({ load: 97 })] }), previous).exercises[0]?.status).toBe('regressed');
    expect(compareSessions(session({ sets: [set({ load: 150, reps: 1 })] }), previous).exercises[0]?.status).toBe('improved');
  });

  it('handles zero baselines without infinite percentages and normalizes loads', () => {
    const result = compareSessions(session(), session({ sets: [set({ load: 0 })], activeSeconds: 0 }));
    expect(result.volume).toEqual({ current: 1000, previous: 0, delta: 1000, pct: null });
    expect(result.exercises[0]?.status).toBe('improved');
    const lbs = session({ sets: [set({ load: 220.46, loadUnit: 'lb' })] });
    expect(compareSessions(session(), lbs).volume.pct).toBeCloseTo(0, 1);
    expect(compareSessions(session({ activeSeconds: 120 }), session({ activeSeconds: 100 })).durationSec.pct).toBe(20);
  });
});

describe('workout history', () => {
  it('finds the latest eligible earlier date without sorting the input in place', () => {
    const current = session();
    const earlier = session({ id: 'older', localDate: '2026-11-05' });
    const latest = session({ id: 'latest', localDate: '2026-11-06', state: 'partially_completed' });
    const history = [earlier, session({ id: 'future', localDate: '2026-11-08' }), session({ id: 'same-day' }),
      session({ id: 'different-workout', workoutId: 'lower', localDate: '2026-11-06' }), latest,
      session({ id: 'abandoned', localDate: '2026-11-06', state: 'abandoned' })];
    const snapshot = structuredClone(history);
    expect(findLastComparable(current, history)?.id).toBe('latest');
    expect(history).toEqual(snapshot);
    expect(findLastComparable(current, [])).toBeNull();
  });

  it('returns matching exercise sets newest first, defaults to five, and respects zero/explicit limits', () => {
    const history = Array.from({ length: 7 }, (_, i) => session({ id: `s${i}`, localDate: `2026-11-0${i + 1}`,
      sets: [set(), set({ exerciseId: 'row' })] }));
    expect(exerciseHistory('bench', history)).toHaveLength(5);
    const result = exerciseHistory('bench', history, 2);
    expect(result.map(s => s.sessionId)).toEqual(['s6', 's5']);
    expect(result[0]?.sets).toHaveLength(1);
    expect(result[0]?.totals.volume).toBe(1000);
    expect(exerciseHistory('bench', history, 0)).toEqual([]);
    expect(exerciseHistory('absent', history)).toEqual([]);
    expect(history[0]?.id).toBe('s0');
  });
});
