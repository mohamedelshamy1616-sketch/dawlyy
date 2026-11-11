import { findDay, type DayRef } from '@dawlyy/core/program-edit';
import { compareSessions, type SessionRecord } from '@dawlyy/core/workout';
import type { PortalSession, SetWrite } from './contracts';
import { transition } from '@dawlyy/core/state';
import type { ProgramDocument, SessionState, Workout } from '@dawlyy/core/types';

/** Task 5: Arabic/English numeric keystrokes can persist before Astryx's blur-time commit. */
export function parseWorkoutNumber(text: string): number | null | undefined {
  const normalized = text.trim().replace(/[\u0660-\u0669]/g, c => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, c => String(c.charCodeAt(0) - 0x06f0)).replace(/[\u066c,]/g, '').replace(/\u066b/g, '.');
  if (!normalized) return null;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const value = Number(normalized); return Number.isFinite(value) ? value : undefined;
}

/** Task 5: calendar-anchored program selection; undated plans advance only on completion. */
export function resolveProgramDay(doc: ProgramDocument, startDate: string | undefined, today: string, completedDayIds: readonly string[]): {
  state: 'none' | 'rest' | 'planned'; day?: DayRef['day']; phaseId?: string; weekId?: string; weekIndex: number;
} {
  const weeks = doc.phases.flatMap(phase => phase.weeks.toSorted((a, b) => a.index - b.index));
  const start = startDate ?? doc.startDate;
  if (doc.endDate && today > doc.endDate) return { state: 'none', weekIndex: weeks.length - 1 };
  let dayId: string | undefined; let weekIndex = 0;
  if (start) {
    const offset = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
    weekIndex = Math.floor(offset / 7);
    if (offset < 0 || weekIndex >= weeks.length) return { state: 'none', weekIndex: Math.max(0, Math.min(weekIndex, weeks.length - 1)) };
    dayId = weeks[weekIndex]?.days.find(day => day.index === offset % 7)?.id;
  } else {
    for (const [index, week] of weeks.entries()) {
      dayId = week.days.toSorted((a, b) => a.index - b.index).find(day => day.kind === 'training' && day.workout && !completedDayIds.includes(day.id))?.id;
      if (dayId) { weekIndex = index; break; }
    }
  }
  const ref = dayId ? findDay(doc, dayId) : null;
  if (!ref) return { state: 'none', weekIndex };
  return { state: ref.day.kind === 'training' && ref.day.workout ? 'planned' : 'rest', day: ref.day,
    phaseId: ref.phase.id, weekId: ref.week.id, weekIndex };
}

/** Doc §12.1(12): timestamps are strictly monotonic, with null as the initial baseline. */
export function isNewer(stored: string | Date | null, incoming: string): boolean {
  return stored === null || new Date(incoming).getTime() > new Date(stored).getTime();
}

const events: Record<SessionState, string> = { not_started: '', active: 'resume', paused: 'pause', completed: 'complete', partially_completed: 'complete_partial', abandoned: 'abandon', skipped: 'skip' };

/** Task 5: compacted offline snapshots may include start; all edges still run through core's machine. */
export function sessionTarget(from: SessionState, target: SessionState): SessionState {
  if (from === target) return from;
  let state: SessionState = from;
  if (state === 'not_started' && target !== 'skipped' && target !== 'not_started') {
    const start = transition('session', state, 'start');
    if (!start.ok) throw new Error(start.reason);
    state = start.to as SessionState;
    if (state === target) return state;
  }
  const result = transition('session', state, events[target]);
  if (!result.ok) throw new Error(result.reason);
  return result.to as SessionState;
}

/** Task 5: count the immutable prescription for core completion calculations. */
export function plannedSetCount(workout: Workout | null): number {
  return workout?.blocks.filter(block => block.kind !== 'warmup').reduce((sum, block) => sum + block.items.reduce((n, item) => n + item.sets.length, 0), 0) ?? 0;
}

/** Task 5 / spec §13: keep core deltas and additionally detect changed immutable prescriptions. */
export function buildSummary(current: SessionRecord, previous: SessionRecord | null, samePlan: boolean) {
  const comparison = compareSessions(current, previous);
  return { ...comparison, comparable: comparison.comparable && samePlan,
    reasons: [...comparison.reasons, ...(previous && !samePlan ? ['planned_work_differs' as const] : [])] };
}

/** Task 5: shared offline/server mapper excludes draft, skipped, and tombstoned performance. */
export function coreRecord(session: PortalSession, sets: SetWrite[]): SessionRecord {
  return { id: session.id, workoutId: session.workoutId ?? undefined, localDate: session.localDate,
    state: session.state, activeSeconds: session.activeSeconds, plannedSetCount: plannedSetCount(session.plannedWorkout),
    sets: sets.filter(s => !s.deletedAt).map(s => ({ exerciseId: s.exerciseId, setNo: s.setNo, tag: s.tag,
      completed: s.completed, skipped: s.skipped, reps: s.reps ?? undefined, load: s.load ?? undefined,
      loadUnit: s.loadUnit ?? undefined, rpe: s.rpe ?? undefined, rir: s.rir ?? undefined,
      durationSec: s.durationSec ?? undefined, distanceM: s.distanceM ?? undefined })) };
}
