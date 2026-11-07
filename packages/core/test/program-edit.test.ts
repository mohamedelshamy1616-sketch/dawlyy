import { describe, it, expect } from 'vitest';
import { ProgramDocument, type ProgramPhase, type WorkoutBlock } from '../src/types';
import { applyProgramOp, applyProgramOps, emptyProgram, findDay, programStats, validateProgram, ProgramEditError, type ProgramOp, type EditCtx } from '../src/program-edit';

function context(): EditCtx {
  let n = 0;
  return { newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function ids(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key === 'id' ? [String(child)] : ids(child));
}
function invariant(doc: ProgramDocument): void {
  expect(ProgramDocument.safeParse(doc).success).toBe(true);
  expect(new Set(ids(doc)).size).toBe(ids(doc).length);
  for (const phase of doc.phases) for (const [wi, week] of phase.weeks.entries()) {
    expect(week.index).toBe(wi);
    for (const [di, day] of week.days.entries()) {
      expect(day.index).toBe(di);
      for (const block of day.workout?.blocks ?? []) for (const [ii, item] of block.items.entries()) {
        expect(item.order).toBe(ii);
        expect(item.sets.map(set => set.setNo)).toEqual(item.sets.map((_, i) => i + 1));
      }
    }
  }
}
function edit(doc: ProgramDocument, op: ProgramOp, ctx: EditCtx): ProgramDocument {
  const before = JSON.stringify(doc);
  const result = applyProgramOp(freeze(doc), freeze(op), ctx);
  expect(JSON.stringify(doc)).toBe(before);
  invariant(result);
  return result;
}
function fixture() {
  const ctx = context();
  let doc = emptyProgram(ctx, { weeks: 1, trainingDays: [0] });
  const phaseId = doc.phases[0]!.id;
  const weekId = doc.phases[0]!.weeks[0]!.id;
  const days = doc.phases[0]!.weeks[0]!.days;
  const dayId = days[0]!.id;
  const blockId = days[0]!.workout!.blocks[0]!.id;
  doc = edit(doc, { type: 'item.add', dayId, blockId, exerciseId: 'squat', template: { reps: '8-10', load: { value: 20, unit: 'kg' } } }, ctx);
  const itemId = findDay(doc, dayId)!.day.workout!.blocks[0]!.items[0]!.id;
  return { ctx, doc, phaseId, weekId, dayId, blockId, itemId, targets: [days[1]!.id, days[2]!.id] };
}
function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)]));
  return value;
}
function code(fn: () => unknown, expected: ProgramEditError['code']) {
  expect(fn).toThrow(ProgramEditError);
  try { fn(); } catch (e) { expect((e as ProgramEditError).code).toBe(expected); }
}

describe('program editing', () => {
  it('creates the default four-week program and an empty main block on each training day', () => {
    const doc = emptyProgram(context());
    invariant(doc);
    expect(doc.phases[0]!.name).toEqual({ ar: 'المرحلة 1', en: 'Phase 1' });
    expect(programStats(doc)).toEqual({ phases: 1, weeks: 4, trainingDays: 12, workouts: 12, blocks: 12, items: 0, sets: 0, exerciseIds: [] });
    expect(doc.phases.flatMap(p => p.weeks.flatMap(w => w.days))).toHaveLength(28);
    expect(doc.phases[0]!.weeks[0]!.days[0]!.workout!.name).toEqual({ ar: 'تمرين', en: 'Workout' });
    const custom = emptyProgram(context(), { weeks: 2, trainingDays: [], phaseName: { ar: 'تجهيز', en: 'Preparation' } });
    invariant(custom);
    expect(programStats(custom)).toMatchObject({ weeks: 2, trainingDays: 0, workouts: 0 });
    expect(custom.phases[0]!.name).toEqual({ ar: 'تجهيز', en: 'Preparation' });
  });

  it('duplicates a phase immediately after its source, preserving content and refreshing every id', () => {
    const f = fixture();
    const doc = edit(f.doc, { type: 'phase.duplicate', phaseId: f.phaseId }, f.ctx);
    const [first, second] = doc.phases as [ProgramPhase, ProgramPhase];
    expect(stripIds(first)).toEqual(stripIds(second));
    expect(ids(second).every(id => !ids(first).includes(id))).toBe(true);
  });

  it('adds all-rest phases, patches optional fields, clamps moves, and protects the last phase', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'phase.add', afterPhaseId: f.phaseId }, f.ctx);
    const added = doc.phases[1]!;
    expect(added.weeks).toHaveLength(1);
    expect(added.weeks[0]!.days.every(d => d.kind === 'rest' && !d.workout)).toBe(true);
    doc = edit(doc, { type: 'phase.update', phaseId: added.id, patch: { name: { ar: 'قوة', en: 'Strength' }, goal: { en: 'Build strength' } } }, f.ctx);
    doc = edit(doc, { type: 'phase.update', phaseId: added.id, patch: { goal: null, name: undefined } }, f.ctx);
    expect(doc.phases[1]!).not.toHaveProperty('goal');
    doc = edit(doc, { type: 'phase.move', phaseId: added.id, toIndex: -100 }, f.ctx);
    expect(doc.phases[0]!.id).toBe(added.id);
    doc = edit(doc, { type: 'phase.move', phaseId: added.id, toIndex: 100 }, f.ctx);
    doc = edit(doc, { type: 'phase.remove', phaseId: added.id }, f.ctx);
    code(() => applyProgramOp(doc, { type: 'phase.remove', phaseId: f.phaseId }, f.ctx), 'last_phase');
  });

  it('copies a week including workouts, duplicates/moves/removes weeks and renumbers indexes', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'week.add', phaseId: f.phaseId, afterWeekId: f.weekId, copyFromWeekId: f.weekId }, f.ctx);
    const copied = doc.phases[0]!.weeks[1]!;
    expect(stripIds({ ...copied, index: 0 })).toEqual(stripIds(f.doc.phases[0]!.weeks[0]!));
    expect(ids(copied).every(id => !ids(f.doc).includes(id))).toBe(true);
    doc = edit(doc, { type: 'week.duplicate', phaseId: f.phaseId, weekId: copied.id }, f.ctx);
    doc = edit(doc, { type: 'week.move', phaseId: f.phaseId, weekId: copied.id, toIndex: -20 }, f.ctx);
    doc = edit(doc, { type: 'week.update', phaseId: f.phaseId, weekId: copied.id, patch: { isDeload: true, note: { ar: 'خفّف الحمل', en: 'Reduce load' } } }, f.ctx);
    doc = edit(doc, { type: 'week.update', phaseId: f.phaseId, weekId: copied.id, patch: { note: null, isDeload: false } }, f.ctx);
    expect(doc.phases[0]!.weeks[0]!).toMatchObject({ isDeload: false });
    expect(doc.phases[0]!.weeks[0]!).not.toHaveProperty('note');
    doc = edit(doc, { type: 'week.remove', phaseId: f.phaseId, weekId: copied.id }, f.ctx);
    doc = edit(doc, { type: 'week.add', phaseId: f.phaseId }, f.ctx);
    expect(doc.phases[0]!.weeks.at(-1)!.days.every(d => d.kind === 'rest')).toBe(true);
    code(() => applyProgramOp(f.doc, { type: 'week.remove', phaseId: f.phaseId, weekId: f.weekId }, f.ctx), 'last_week');
  });

  it('copies kind and workout to two targets with independent ids while preserving target notes', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'day.update', dayId: f.targets[0]!, patch: { note: { en: 'Target note' } } }, f.ctx);
    doc = edit(doc, { type: 'day.copyTo', fromDayId: f.dayId, toDayIds: f.targets }, f.ctx);
    for (const target of f.targets) {
      const day = findDay(doc, target)!.day;
      expect(day.kind).toBe('training');
      expect(stripIds(day.workout)).toEqual(stripIds(findDay(f.doc, f.dayId)!.day.workout));
    }
    expect(findDay(doc, f.targets[0]!)!.day.note).toEqual({ en: 'Target note' });
    expect(findDay(doc, f.targets[0]!)!.day.workout!.id).not.toBe(findDay(doc, f.targets[1]!)!.day.workout!.id);
    const restId = doc.phases[0]!.weeks[0]!.days[3]!.id;
    doc = edit(doc, { type: 'day.copyTo', fromDayId: restId, toDayIds: [f.dayId] }, f.ctx);
    expect(findDay(doc, f.dayId)!.day).toMatchObject({ kind: 'rest' });
    expect(findDay(doc, f.dayId)!.day).not.toHaveProperty('workout');
  });

  it('swaps whole day contents while retaining ids/indexes, clears workouts, and handles kind changes', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'day.update', dayId: f.dayId, patch: { note: { en: 'Source note' } } }, f.ctx);
    doc = edit(doc, { type: 'day.swap', dayIdA: f.dayId, dayIdB: f.targets[0]! }, f.ctx);
    expect(findDay(doc, f.dayId)!.day).toMatchObject({ id: f.dayId, index: 0, kind: 'rest' });
    expect(findDay(doc, f.targets[0]!)!.day).toMatchObject({ index: 1, kind: 'training', note: { en: 'Source note' } });
    doc = edit(doc, { type: 'day.setKind', dayId: f.targets[0]!, kind: 'active_recovery' }, f.ctx);
    expect(findDay(doc, f.targets[0]!)!.day.workout).toBeDefined();
    doc = edit(doc, { type: 'day.setKind', dayId: f.targets[0]!, kind: 'rest' }, f.ctx);
    expect(findDay(doc, f.targets[0]!)!.day.workout).toBeUndefined();
    doc = edit(doc, { type: 'day.setKind', dayId: f.dayId, kind: 'training' }, f.ctx);
    expect(findDay(doc, f.dayId)!.day.workout!.blocks[0]!.kind).toBe('main');
    doc = edit(doc, { type: 'day.clear', dayId: f.dayId }, f.ctx);
    expect(findDay(doc, f.dayId)!.day).toMatchObject({ kind: 'rest' });
    expect(findDay(doc, f.dayId)!.day).not.toHaveProperty('workout');
    doc = edit(doc, { type: 'day.setKind', dayId: f.dayId, kind: 'active_recovery' }, f.ctx);
    expect(findDay(doc, f.dayId)!.day).not.toHaveProperty('workout');
    doc = edit(doc, { type: 'day.clear', dayId: f.targets[0]! }, f.ctx);
    doc = edit(doc, { type: 'day.update', dayId: f.targets[0]!, patch: { note: null } }, f.ctx);
    expect(findDay(doc, f.targets[0]!)!.day).not.toHaveProperty('workout');
    expect(findDay(doc, f.targets[0]!)!.day).not.toHaveProperty('note');
    expect(findDay(doc, 'missing')).toBeNull();
  });

  it('updates workouts and blocks, inserts independent mini-plans, moves and removes blocks', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'workout.update', dayId: f.dayId, patch: { name: { en: 'Legs' }, estimatedMinutes: 40, note: { en: 'Slow tempo' } } }, f.ctx);
    doc = edit(doc, { type: 'workout.update', dayId: f.dayId, patch: { estimatedMinutes: null, note: null } }, f.ctx);
    doc = edit(doc, { type: 'block.add', dayId: f.dayId, kind: 'circuit', afterBlockId: f.blockId, name: { en: 'Finisher' } }, f.ctx);
    const blockId = findDay(doc, f.dayId)!.day.workout!.blocks[1]!.id;
    doc = edit(doc, { type: 'block.update', dayId: f.dayId, blockId, patch: { kind: 'superset', rounds: 3, restBetweenRoundsSec: 60, note: { en: 'Repeat' } } }, f.ctx);
    doc = edit(doc, { type: 'block.update', dayId: f.dayId, blockId, patch: { name: null, rounds: null, restBetweenRoundsSec: null, note: null } }, f.ctx);
    const source: WorkoutBlock = freeze(findDay(f.doc, f.dayId)!.day.workout!.blocks[0]!);
    doc = edit(doc, { type: 'block.insert', dayId: f.dayId, block: source, afterBlockId: blockId }, f.ctx);
    const inserted = findDay(doc, f.dayId)!.day.workout!.blocks[2]!;
    expect(stripIds(inserted)).toEqual(stripIds(source));
    expect(ids(inserted).every(id => !ids(f.doc).includes(id))).toBe(true);
    doc = edit(doc, { type: 'block.move', dayId: f.dayId, blockId: inserted.id, toIndex: -5 }, f.ctx);
    expect(findDay(doc, f.dayId)!.day.workout!.blocks[0]!.id).toBe(inserted.id);
    doc = edit(doc, { type: 'block.remove', dayId: f.dayId, blockId }, f.ctx);
    expect(findDay(doc, f.dayId)!.day.workout!.blocks).toHaveLength(2);
  });

  it('moves items between and within blocks, duplicates, replaces and patches without losing prescriptions', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'item.add', dayId: f.dayId, blockId: f.blockId, exerciseId: 'press', sets: 1 }, f.ctx);
    doc = edit(doc, { type: 'block.add', dayId: f.dayId, kind: 'superset' }, f.ctx);
    const toBlockId = findDay(doc, f.dayId)!.day.workout!.blocks[1]!.id;
    doc = edit(doc, { type: 'item.add', dayId: f.dayId, blockId: toBlockId, exerciseId: 'row' }, f.ctx);
    doc = edit(doc, { type: 'item.move', dayId: f.dayId, itemId: f.itemId, toBlockId, toIndex: 100 }, f.ctx);
    expect(findDay(doc, f.dayId)!.day.workout!.blocks.map(b => b.items.map(i => i.order))).toEqual([[0], [0, 1]]);
    doc = edit(doc, { type: 'item.move', dayId: f.dayId, itemId: f.itemId, toBlockId, toIndex: -1 }, f.ctx);
    doc = edit(doc, { type: 'item.update', dayId: f.dayId, itemId: f.itemId, patch: { progressionRule: { type: 'load', threshold: 10, step: 2.5 }, alternatives: ['lunge'], coachNote: { en: 'Brace' } } }, f.ctx);
    doc = edit(doc, { type: 'item.replaceExercise', dayId: f.dayId, itemId: f.itemId, exerciseId: 'deadlift' }, f.ctx);
    const item = findDay(doc, f.dayId)!.day.workout!.blocks[1]!.items[0]!;
    expect(item.sets[0]!.reps).toBe('8-10');
    expect(item.coachNote).toEqual({ en: 'Brace' });
    doc = edit(doc, { type: 'item.duplicate', dayId: f.dayId, itemId: f.itemId }, f.ctx);
    const duplicate = findDay(doc, f.dayId)!.day.workout!.blocks[1]!.items[1]!;
    expect(stripIds({ ...duplicate, order: 0 })).toEqual(stripIds(item));
    doc = edit(doc, { type: 'item.update', dayId: f.dayId, itemId: f.itemId, patch: { progressionRule: null, alternatives: null, coachNote: null } }, f.ctx);
    doc = edit(doc, { type: 'item.remove', dayId: f.dayId, itemId: duplicate.id }, f.ctx);
  });

  it('adds, patches, removes and renumbers sets, and refuses to remove the last set', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'set.add', dayId: f.dayId, itemId: f.itemId }, f.ctx);
    const sets = () => findDay(doc, f.dayId)!.day.workout!.blocks[0]!.items[0]!.sets;
    expect(sets()[3]).toEqual({ ...sets()[2], setNo: 4 });
    doc = edit(doc, { type: 'set.add', dayId: f.dayId, itemId: f.itemId, copyLast: false }, f.ctx);
    expect(sets()[4]).toEqual({ setNo: 5 });
    doc = edit(doc, { type: 'set.update', dayId: f.dayId, itemId: f.itemId, setNo: 2, patch: { reps: '12', restSec: 90 } }, f.ctx);
    doc = edit(doc, { type: 'set.applyToAll', dayId: f.dayId, itemId: f.itemId, patch: { rpe: 8 } }, f.ctx);
    expect(sets().map(s => s.rpe)).toEqual([8, 8, 8, 8, 8]);
    expect(sets()[1]!.reps).toBe('12');
    doc = edit(doc, { type: 'set.remove', dayId: f.dayId, itemId: f.itemId, setNo: 2 }, f.ctx);
    while (sets().length > 1) doc = edit(doc, { type: 'set.remove', dayId: f.dayId, itemId: f.itemId, setNo: 1 }, f.ctx);
    code(() => applyProgramOp(doc, { type: 'set.remove', dayId: f.dayId, itemId: f.itemId, setNo: 1 }, f.ctx), 'last_set');
  });

  it('removes optional metadata with null, leaves undefined unchanged, and matches sequential batch application', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'meta.update', patch: { startDate: '2026-11-01', endDate: '2026-12-01', reviewDate: '2026-11-15', goal: { en: 'Strength' }, notes: { en: 'Draft' } } }, f.ctx);
    doc = edit(doc, { type: 'meta.update', patch: { reviewDate: null, startDate: undefined, goal: null, notes: null } }, f.ctx);
    expect(doc.startDate).toBe('2026-11-01');
    expect(doc).not.toHaveProperty('reviewDate');
    const ops: ProgramOp[] = [{ type: 'phase.duplicate', phaseId: f.phaseId }, { type: 'day.clear', dayId: f.dayId }];
    const a = fixture(); const b = fixture();
    expect(applyProgramOps(freeze(a.doc), ops, a.ctx)).toEqual(ops.reduce((d, op) => edit(d, op, b.ctx), b.doc));
    expect(applyProgramOps(freeze(doc), [], f.ctx)).toEqual(doc);
  });

  it('counts exercise occurrences but returns distinct exercise ids in first-seen order', () => {
    const f = fixture();
    let doc = edit(f.doc, { type: 'item.duplicate', dayId: f.dayId, itemId: f.itemId }, f.ctx);
    doc = edit(doc, { type: 'item.add', dayId: f.dayId, blockId: f.blockId, exerciseId: 'press', sets: 2 }, f.ctx);
    expect(programStats(freeze(doc))).toEqual({ phases: 1, weeks: 1, trainingDays: 1, workouts: 1, blocks: 1, items: 3, sets: 8, exerciseIds: ['squat', 'press'] });
    expect(findDay(doc, f.dayId)).toMatchObject({ phaseIndex: 0, weekIndex: 0, dayIndex: 0 });
  });

  it('does not share nested prescriptions with inserted library blocks or between copied days', () => {
    const f = fixture();
    const source: WorkoutBlock = freeze({
      id: 'library-block', kind: 'main', items: [{ id: 'library-item', exerciseId: 'row', order: 0, sets: [{ setNo: 1, load: { value: 15, unit: 'kg' }, note: { ar: 'اثبت', en: 'Stay steady' } }] }],
    });
    let doc = edit(f.doc, { type: 'block.insert', dayId: f.dayId, block: source }, f.ctx);
    doc = edit(doc, { type: 'day.copyTo', fromDayId: f.dayId, toDayIds: f.targets }, f.ctx);
    const first = doc.phases[0]!.weeks[0]!.days[1]!.workout!.blocks[1]!.items[0]!.sets[0]!;
    const second = doc.phases[0]!.weeks[0]!.days[2]!.workout!.blocks[1]!.items[0]!.sets[0]!;
    first.load!.value = 99;
    first.note!.en = 'Changed';
    expect(second.load!.value).toBe(15);
    expect(second.note!.en).toBe('Stay steady');
    expect(source.items[0]!.sets[0]!.load!.value).toBe(15);
    expect(source.items[0]!.sets[0]!.note!.en).toBe('Stay steady');
    code(() => applyProgramOp(f.doc, { type: 'block.insert', dayId: f.dayId, block: source }, { newId: () => 'library-block' }), 'invalid_op');
  });

  it('limits item moves to the selected workout and rejects malformed document inputs', () => {
    const f = fixture();
    const doc = edit(f.doc, { type: 'day.setKind', dayId: f.targets[0]!, kind: 'training' }, f.ctx);
    const foreignBlock = findDay(doc, f.targets[0]!)!.day.workout!.blocks[0]!.id;
    code(() => applyProgramOp(doc, { type: 'item.move', dayId: f.dayId, itemId: f.itemId, toBlockId: foreignBlock, toIndex: 0 }, f.ctx), 'not_found');
    const invalid = { ...f.doc, phases: [] };
    code(() => applyProgramOp(invalid, { type: 'meta.update', patch: {} }, f.ctx), 'invalid_op');
    code(() => applyProgramOps(invalid, [], f.ctx), 'invalid_op');
    code(() => findDay(invalid, f.dayId), 'invalid_op');
    code(() => programStats(invalid), 'invalid_op');
    code(() => validateProgram(invalid), 'invalid_op');
  });

  it('reports every publish-time issue with a localized message and precise path', () => {
    const f = fixture();
    const doc = ProgramDocument.parse(f.doc);
    const week = doc.phases[0]!.weeks[0]!;
    const item = week.days[0]!.workout!.blocks[0]!.items[0]!;
    item.alternatives = ['missing-alternative']; item.order = 4; item.sets[0]!.setNo = 8;
    week.index = 5; week.days[0]!.index = 6; week.days[1]!.id = week.days[0]!.id;
    week.days[1]!.kind = 'training';
    week.days[2]!.kind = 'training';
    week.days[2]!.workout = { id: f.ctx.newId(), name: { en: 'Empty' }, blocks: [{ id: f.ctx.newId(), kind: 'main', items: [] }] };
    // empty_block is for an empty block beside filled ones; an empty workout's own blocks are covered by empty_workout.
    week.days[0]!.workout!.blocks.push({ id: f.ctx.newId(), kind: 'cooldown', items: [] });
    doc.startDate = '2026-11-20'; doc.reviewDate = '2026-11-10'; doc.endDate = '2026-11-01';
    const issues = validateProgram(freeze(doc), { knownExerciseIds: new Set() });
    expect(new Set(issues.map(i => i.code))).toEqual(new Set(['unknown_exercise', 'empty_workout', 'training_without_workout', 'duplicate_id', 'bad_set_numbers', 'bad_order', 'bad_week_index', 'bad_day_index', 'empty_block', 'date_order']));
    expect(issues.filter(i => i.code === 'unknown_exercise')).toHaveLength(2);
    for (const issue of issues) { expect(issue.path.length).toBeGreaterThan(0); expect(issue.message.ar).toBeTruthy(); expect(issue.message.en).toBeTruthy(); }
    expect(validateProgram(f.doc, { knownExerciseIds: new Set(['squat']) })).toEqual([]);
  });

  it('checks date ordering even when the intermediate date is absent', () => {
    const f = fixture();
    expect(validateProgram({ ...f.doc, startDate: '2026-12-01', endDate: '2026-11-01' }).some(i => i.code === 'date_order')).toBe(true);
    expect(validateProgram({ ...f.doc, reviewDate: '2026-12-01', endDate: '2026-11-01' }).some(i => i.code === 'date_order')).toBe(true);
  });

  it('rejects unknown ids at each nesting level, invalid values, and colliding factories', () => {
    const f = fixture();
    const ops: ProgramOp[] = [
      { type: 'phase.move', phaseId: 'missing', toIndex: 0 },
      { type: 'phase.add', afterPhaseId: 'missing' },
      { type: 'week.add', phaseId: f.phaseId, copyFromWeekId: 'missing' },
      { type: 'week.remove', phaseId: f.phaseId, weekId: 'missing' },
      { type: 'day.clear', dayId: 'missing' },
      { type: 'day.copyTo', fromDayId: f.dayId, toDayIds: ['missing'] },
      { type: 'block.add', dayId: f.dayId, kind: 'main', afterBlockId: 'missing' },
      { type: 'block.remove', dayId: f.dayId, blockId: 'missing' },
      { type: 'item.remove', dayId: f.dayId, itemId: 'missing' },
      { type: 'item.move', dayId: f.dayId, itemId: f.itemId, toBlockId: 'missing', toIndex: 0 },
      { type: 'set.update', dayId: f.dayId, itemId: f.itemId, setNo: 99, patch: {} },
    ];
    for (const op of ops) code(() => applyProgramOp(f.doc, op, f.ctx), 'not_found');
    code(() => emptyProgram(f.ctx, { weeks: 0 }), 'invalid_op');
    code(() => emptyProgram(f.ctx, { trainingDays: [7] }), 'invalid_op');
    code(() => applyProgramOp(f.doc, { type: 'item.add', dayId: f.dayId, blockId: f.blockId, exerciseId: 'x', sets: 0 }, f.ctx), 'invalid_op');
    code(() => applyProgramOp(f.doc, { type: 'phase.move', phaseId: f.phaseId, toIndex: NaN }, f.ctx), 'index_out_of_range');
    code(() => applyProgramOp(f.doc, { type: 'phase.duplicate', phaseId: f.phaseId }, { newId: () => f.phaseId }), 'invalid_op');
    code(() => applyProgramOp(f.doc, { type: 'workout.update', dayId: f.dayId, patch: { estimatedMinutes: -1 } }, f.ctx), 'invalid_op');
  });
});
