import { describe, expect, it } from 'vitest';
import { emptyProgram } from '@dawlyy/core/program-edit';
import { sessionVolume, type SessionRecord } from '@dawlyy/core/workout';
import { buildSummary, coreRecord, isNewer, parseWorkoutNumber, resolveProgramDay, sessionTarget } from './logic';
import type { PortalSession, SetWrite } from './contracts';

let id = 0;
const doc = () => emptyProgram({ newId: () => `p${++id}` }, { weeks: 2, trainingDays: [0, 2] });

describe('Task 5 program day resolution', () => {
  it('keeps calendar rest days and does not shift a skipped day', () => {
    const program = doc();
    expect(resolveProgramDay(program, '2026-11-09', '2026-11-10', []).state).toBe('rest');
    expect(resolveProgramDay(program, '2026-11-09', '2026-11-11', []).day?.index).toBe(2);
  });
  it('returns none before the start and after the final week or explicit end', () => {
    const program = doc();
    expect(resolveProgramDay(program, '2026-11-09', '2026-11-08', []).state).toBe('none');
    expect(resolveProgramDay(program, '2026-11-09', '2026-11-23', []).state).toBe('none');
    expect(resolveProgramDay({ ...program, endDate: '2026-11-10' }, '2026-11-09', '2026-11-11', []).state).toBe('none');
  });
  it('uses the first unfinished training day when there is no start date', () => {
    const program = doc(); const first = program.phases[0]!.weeks[0]!.days[0]!;
    expect(resolveProgramDay(program, undefined, '2026-11-11', [first.id]).day?.index).toBe(2);
    const completed = program.phases.flatMap(p => p.weeks.flatMap(w => w.days.map(d => d.id)));
    expect(resolveProgramDay(program, undefined, '2026-11-11', completed).state).toBe('none');
  });
});

describe('Task 5 sync and summaries', () => {
  it('persists numeric keystrokes in Arabic and English before a field loses focus', () => {
    expect(parseWorkoutNumber('١٢٫٥')).toBe(12.5);
    expect(parseWorkoutNumber('۱۲.۵')).toBe(12.5);
    expect(parseWorkoutNumber('1,234.5')).toBe(1234.5);
    expect(parseWorkoutNumber('')).toBeNull();
    expect(parseWorkoutNumber('12.')).toBeUndefined();
    expect(parseWorkoutNumber('bad')).toBeUndefined();
  });
  it('accepts only strictly newer writes, including replacing an unknown timestamp', () => {
    expect(isNewer(null, '2026-11-09T10:00:00Z')).toBe(true);
    expect(isNewer('2026-11-09T10:00:00Z', '2026-11-09T10:00:00Z')).toBe(false);
    expect(isNewer('2026-11-09T11:00:00Z', '2026-11-09T10:00:00Z')).toBe(false);
  });
  it('never resurrects a finished session, including compacted offline states', () => {
    expect(() => sessionTarget('completed', 'active')).toThrow();
    expect(sessionTarget('not_started', 'completed')).toBe('completed');
    expect(sessionTarget('active', 'paused')).toBe('paused');
  });
  it('maps core volume and flags a changed prescription even for identical exercise ids', () => {
    const current: SessionRecord = { id: 'current', workoutId: 'w', state: 'completed', localDate: '2026-11-09', plannedSetCount: 1,
      sets: [{ exerciseId: 'e', setNo: 1, completed: true, skipped: false, reps: 10, load: 20, loadUnit: 'kg' }] };
    const summary = buildSummary(current, { ...current, id: 'previous' }, false);
    expect(summary.volume.current).toBe(sessionVolume(current.sets, 'kg').volume);
    expect(summary.completionPct.current).toBe(100);
    expect(summary.comparable).toBe(false);
    expect(summary.reasons).toContain('planned_work_differs');
  });
  it('maps tombstones, warmups, skipped sets and pounds without inflating the summary', () => {
    const session: PortalSession = { id: 'session', clientUuid: 's', createdAt: '2026-11-11T10:00:00Z', programId: null, programVersionId: null, dayId: null, workoutId: 'w',
      plannedWorkout: { id: 'w', name: { en: 'Lift' }, blocks: [{ id: 'b', kind: 'main', items: [{ id: 'i', exerciseId: 'e', order: 0, sets: [{ setNo: 1 }] }] }] },
      state: 'completed', localDate: '2026-11-11', timezone: 'Africa/Cairo', startedAt: null, endedAt: null, activeSeconds: 10,
      clientUpdatedAt: null, rpeOverall: null, mood: null, painNote: null, clientNote: null, summary: null };
    const base: SetWrite = { clientUuid: 'a', sessionClientUuid: 's', clientUpdatedAt: '2026-11-11T10:00:00Z', exerciseId: 'e', setNo: 1,
      tag: 'working', completed: true, skipped: false, painFlag: false, reps: 10, load: 100, loadUnit: 'lb' };
    const record = coreRecord(session, [base, { ...base, clientUuid: 'deleted', deletedAt: base.clientUpdatedAt },
      { ...base, clientUuid: 'warmup', tag: 'warmup' }, { ...base, clientUuid: 'skipped', skipped: true }]);
    expect(record.sets).toHaveLength(3);
    const summary = buildSummary(record, null, true);
    expect(summary.volume.current).toBe(sessionVolume([record.sets[0]!], 'kg').volume);
    expect(summary.reps.current).toBe(10); expect(summary.completionPct.current).toBe(100);
    expect(summary.comparable).toBe(false);
  });
});
