import {
  ProgramDocument, WorkoutBlock, PlannedSet,
  type ProgramPhase, type ProgramWeek, type ProgramDay, type Workout, type WorkoutItem,
  type BlockKind, type LocalizedText, type IsoDate, type ProgressionRule,
} from '../types';

export type IdFactory = () => string;
export type EditCtx = { newId: IdFactory };
/**
 * Edit operations, dispatched as JSON by the builder and the API.
 *
 * - Move ops: `toIndex` must be a finite integer. Integers beyond either end clamp to the first or last position;
 *   NaN, ±Infinity and fractions throw `index_out_of_range` (JSON cannot carry Infinity, so "move to the end" is sent
 *   as a large integer).
 * - Patches accept only the keys listed in each op's `patch` type; any other key (an id, `kind` on a day, nested
 *   children) throws `invalid_op`, so a patch can never rename an element or bypass day.setKind / day.clear.
 * - `day.swap` swaps a day's contents (kind, workout and note); each day keeps its id and index.
 * - `day.copyTo` copies kind and workout (with new ids) onto every target except the source itself; targets keep
 *   their own note.
 */
export type ProgramOp =
  | { type: 'phase.add'; afterPhaseId?: string; name?: LocalizedText; weeks?: number }
  | { type: 'phase.update'; phaseId: string; patch: { name?: LocalizedText; goal?: LocalizedText | null } }
  | { type: 'phase.remove'; phaseId: string }
  | { type: 'phase.move'; phaseId: string; toIndex: number }
  | { type: 'phase.duplicate'; phaseId: string }
  | { type: 'week.add'; phaseId: string; afterWeekId?: string; copyFromWeekId?: string }
  | { type: 'week.remove'; phaseId: string; weekId: string }
  | { type: 'week.duplicate'; phaseId: string; weekId: string }
  | { type: 'week.move'; phaseId: string; weekId: string; toIndex: number }
  | { type: 'week.update'; phaseId: string; weekId: string; patch: { isDeload?: boolean; note?: LocalizedText | null } }
  | { type: 'day.setKind'; dayId: string; kind: 'training' | 'rest' | 'active_recovery' }
  | { type: 'day.update'; dayId: string; patch: { note?: LocalizedText | null } }
  | { type: 'day.copyTo'; fromDayId: string; toDayIds: string[] }
  | { type: 'day.swap'; dayIdA: string; dayIdB: string }
  | { type: 'day.clear'; dayId: string }
  | { type: 'workout.update'; dayId: string; patch: { name?: LocalizedText; estimatedMinutes?: number | null; note?: LocalizedText | null } }
  | { type: 'block.add'; dayId: string; kind: BlockKind; afterBlockId?: string; name?: LocalizedText }
  | { type: 'block.update'; dayId: string; blockId: string; patch: { kind?: BlockKind; name?: LocalizedText | null; rounds?: number | null; restBetweenRoundsSec?: number | null; note?: LocalizedText | null } }
  | { type: 'block.remove'; dayId: string; blockId: string }
  | { type: 'block.move'; dayId: string; blockId: string; toIndex: number }
  | { type: 'block.insert'; dayId: string; block: WorkoutBlock; afterBlockId?: string }
  | { type: 'item.add'; dayId: string; blockId: string; exerciseId: string; sets?: number; template?: Partial<Omit<PlannedSet, 'setNo'>> }
  | { type: 'item.update'; dayId: string; itemId: string; patch: { progressionRule?: ProgressionRule | null; coachNote?: LocalizedText | null; alternatives?: string[] | null } }
  | { type: 'item.replaceExercise'; dayId: string; itemId: string; exerciseId: string }
  | { type: 'item.remove'; dayId: string; itemId: string }
  | { type: 'item.move'; dayId: string; itemId: string; toBlockId: string; toIndex: number }
  | { type: 'item.duplicate'; dayId: string; itemId: string }
  | { type: 'set.add'; dayId: string; itemId: string; copyLast?: boolean }
  | { type: 'set.update'; dayId: string; itemId: string; setNo: number; patch: Partial<Omit<PlannedSet, 'setNo'>> }
  | { type: 'set.remove'; dayId: string; itemId: string; setNo: number }
  | { type: 'set.applyToAll'; dayId: string; itemId: string; patch: Partial<Omit<PlannedSet, 'setNo'>> }
  | { type: 'meta.update'; patch: { startDate?: IsoDate | null; endDate?: IsoDate | null; reviewDate?: IsoDate | null; goal?: LocalizedText | null; notes?: LocalizedText | null } };

export class ProgramEditError extends Error {
  constructor(public readonly code: 'not_found' | 'invalid_op' | 'last_phase' | 'last_week' | 'last_set' | 'index_out_of_range', message: string) {
    super(message);
    this.name = 'ProgramEditError';
  }
}

export type DayRef = { phase: ProgramPhase; week: ProgramWeek; day: ProgramDay; phaseIndex: number; weekIndex: number; dayIndex: number };
export type ProgramStats = { phases: number; weeks: number; trainingDays: number; workouts: number; blocks: number; items: number; sets: number; exerciseIds: string[] };
export type ProgramIssue = { path: string; code: 'unknown_exercise' | 'empty_workout' | 'training_without_workout' | 'duplicate_id' | 'bad_set_numbers' | 'bad_order' | 'bad_week_index' | 'bad_day_index' | 'empty_block' | 'date_order'; message: LocalizedText };

function parseDocument(doc: ProgramDocument): ProgramDocument {
  const result = ProgramDocument.safeParse(doc);
  if (!result.success) throw new ProgramEditError('invalid_op', 'Invalid program document.');
  return result.data;
}

function locateDay(doc: ProgramDocument, dayId: string): DayRef | null {
  for (const [phaseIndex, phase] of doc.phases.entries()) {
    for (const [weekIndex, week] of phase.weeks.entries()) {
      for (const [dayIndex, day] of week.days.entries()) {
        if (day.id === dayId) return { phase, week, day, phaseIndex, weekIndex, dayIndex };
      }
    }
  }
  return null;
}

/** Find a day and its containing phase/week, or null for an unknown id. */
export function findDay(doc: ProgramDocument, dayId: string): DayRef | null {
  return locateDay(parseDocument(doc), dayId);
}

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new ProgramEditError('not_found', 'The requested program element was not found.');
  return value;
}
function byId<T extends { id: string }>(values: T[], id: string): T {
  return required(values.find(value => value.id === id));
}
function positiveCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new ProgramEditError('invalid_op', 'A positive integer count is required.');
  return value;
}
/** Null deletes an optional field; undefined leaves it alone. */
function assignFields(target: object, fields: object): void {
  const record = target as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) delete record[key];
    else if (value !== undefined) record[key] = value;
  }
}
/** Keys each op's patch may carry; everything else is structure that dedicated ops own. */
const PATCH_KEYS = {
  phase: new Set(['name', 'goal']),
  week: new Set(['isDeload', 'note']),
  day: new Set(['note']),
  workout: new Set(['name', 'estimatedMinutes', 'note']),
  block: new Set(['kind', 'name', 'rounds', 'restBetweenRoundsSec', 'note']),
  item: new Set(['progressionRule', 'coachNote', 'alternatives']),
  set: new Set(Object.keys(PlannedSet.shape).filter(key => key !== 'setNo')),
  meta: new Set(['startDate', 'endDate', 'reviewDate', 'goal', 'notes']),
} as const;
function patchFields(target: object, patch: unknown, allowed: ReadonlySet<string>): void {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new ProgramEditError('invalid_op', 'A patch object is required.');
  const extra = Object.keys(patch).find(key => !allowed.has(key));
  if (extra !== undefined) throw new ProgramEditError('invalid_op', `This operation cannot change "${extra}".`);
  assignFields(target, patch);
}
function insertAfter<T extends { id: string }>(values: T[], value: T, afterId?: string): void {
  const index = afterId === undefined ? values.length : values.indexOf(byId(values, afterId)) + 1;
  values.splice(index, 0, value);
}
function move<T>(values: T[], value: T, toIndex: number): void {
  if (!Number.isSafeInteger(toIndex)) throw new ProgramEditError('index_out_of_range', 'Move index must be a finite integer.');
  values.splice(values.indexOf(value), 1);
  values.splice(Math.max(0, Math.min(values.length, toIndex)), 0, value);
}
function copyItem(item: WorkoutItem, ctx: EditCtx): WorkoutItem {
  return { ...item, id: ctx.newId(), sets: item.sets.map(set => ({ ...set })) };
}
function copyBlock(block: WorkoutBlock, ctx: EditCtx): WorkoutBlock {
  return { ...block, id: ctx.newId(), items: block.items.map(item => copyItem(item, ctx)) };
}
function copyWorkout(workout: Workout, ctx: EditCtx): Workout {
  return { ...workout, id: ctx.newId(), blocks: workout.blocks.map(block => copyBlock(block, ctx)) };
}
function copyWeek(week: ProgramWeek, ctx: EditCtx): ProgramWeek {
  return { ...week, id: ctx.newId(), days: week.days.map(day => ({ ...day, id: ctx.newId(), ...(day.workout ? { workout: copyWorkout(day.workout, ctx) } : {}) })) };
}
function blankWorkout(ctx: EditCtx): Workout {
  return { id: ctx.newId(), name: { ar: 'تمرين', en: 'Workout' }, blocks: [{ id: ctx.newId(), kind: 'main', items: [] }] };
}
function blankWeek(ctx: EditCtx, trainingDays: number[] = []): ProgramWeek {
  return { id: ctx.newId(), index: 0, days: Array.from({ length: 7 }, (_, index): ProgramDay => ({
    id: ctx.newId(), index, kind: trainingDays.includes(index) ? 'training' : 'rest',
    ...(trainingDays.includes(index) ? { workout: blankWorkout(ctx) } : {}),
  })) };
}
function normalize(doc: ProgramDocument): void {
  for (const phase of doc.phases) for (const [index, week] of phase.weeks.entries()) {
    week.index = index;
    for (const [dayIndex, day] of week.days.entries()) {
      day.index = dayIndex;
      for (const block of day.workout?.blocks ?? []) for (const [order, item] of block.items.entries()) {
        item.order = order;
        item.sets.forEach((set, i) => { set.setNo = i + 1; });
      }
    }
  }
}
function entityIds(doc: ProgramDocument): string[] {
  const ids: string[] = [];
  for (const phase of doc.phases) {
    ids.push(phase.id);
    for (const week of phase.weeks) {
      ids.push(week.id);
      for (const day of week.days) {
        ids.push(day.id);
        if (day.workout) {
          ids.push(day.workout.id);
          for (const block of day.workout.blocks) { ids.push(block.id); ids.push(...block.items.map(item => item.id)); }
        }
      }
    }
  }
  return ids;
}
function uniqueIds(doc: ProgramDocument): void {
  const ids = entityIds(doc);
  if (new Set(ids).size !== ids.length) throw new ProgramEditError('invalid_op', 'Program element ids must be unique.');
}

/** Create one phase with seven-day weeks and empty workouts on the selected days. */
export function emptyProgram(ctx: EditCtx, opts: { weeks?: number; trainingDays?: number[]; phaseName?: LocalizedText } = {}): ProgramDocument {
  const weeks = positiveCount(opts.weeks ?? 4);
  const trainingDays = opts.trainingDays ?? [0, 2, 4];
  if (trainingDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new ProgramEditError('invalid_op', 'Training day indexes must be between 0 and 6.');
  const doc: ProgramDocument = { schemaVersion: 1, phases: [{
    id: ctx.newId(), name: opts.phaseName ?? { ar: 'المرحلة 1', en: 'Phase 1' },
    weeks: Array.from({ length: weeks }, () => blankWeek(ctx, trainingDays)),
  }] };
  normalize(doc);
  const parsed = parseDocument(doc);
  uniqueIds(parsed);
  return parsed;
}

/**
 * Apply one immutable edit. Null deletes an optional field; undefined leaves it alone.
 * The input must have unique ids. Every op and emptyProgram keep them unique, so a document with duplicate ids is
 * corrupt input: it throws `invalid_op` here, and validateProgram reports `duplicate_id` so the API can reject such a
 * document where it enters the system (an import or a raw write) instead of storing it.
 */
export function applyProgramOp(doc: ProgramDocument, op: ProgramOp, ctx: EditCtx): ProgramDocument {
  // Zod gives this edit an owned tree, including notes, loads and prescription arrays.
  const result = parseDocument(doc);
  uniqueIds(result);
  // Reject factories that reuse even a removed/replaced input id, not just final-tree collisions.
  const allocated = new Set(entityIds(result));
  const editCtx: EditCtx = { newId: () => {
    const id = ctx.newId();
    if (typeof id !== 'string' || !id.length || id.length > 64 || allocated.has(id)) throw new ProgramEditError('invalid_op', 'The id factory must return fresh valid ids.');
    allocated.add(id);
    return id;
  } };
  const phase = (id: string) => byId(result.phases, id);
  const day = (id: string) => required(locateDay(result, id)).day;
  const workout = (id: string) => required(day(id).workout);
  const block = (dayId: string, blockId: string) => byId(workout(dayId).blocks, blockId);
  const itemRef = (dayId: string, itemId: string) => {
    for (const block of workout(dayId).blocks) {
      const item = block.items.find(value => value.id === itemId);
      if (item) return { block, item };
    }
    throw new ProgramEditError('not_found', 'The requested workout item was not found.');
  };

  switch (op.type) {
    case 'phase.add': {
      if (op.afterPhaseId !== undefined) phase(op.afterPhaseId);
      const count = positiveCount(op.weeks ?? 1);
      const n = result.phases.length + 1;
      insertAfter(result.phases, { id: editCtx.newId(), name: op.name ?? { ar: `المرحلة ${n}`, en: `Phase ${n}` }, weeks: Array.from({ length: count }, () => blankWeek(editCtx)) }, op.afterPhaseId);
      break;
    }
    case 'phase.update': patchFields(phase(op.phaseId), op.patch, PATCH_KEYS.phase); break;
    case 'phase.remove': {
      const value = phase(op.phaseId);
      if (result.phases.length === 1) throw new ProgramEditError('last_phase', 'A program must keep at least one phase.');
      result.phases.splice(result.phases.indexOf(value), 1);
      break;
    }
    case 'phase.move': move(result.phases, phase(op.phaseId), op.toIndex); break;
    case 'phase.duplicate': {
      const source = phase(op.phaseId);
      insertAfter(result.phases, { ...source, id: editCtx.newId(), weeks: source.weeks.map(week => copyWeek(week, editCtx)) }, source.id);
      break;
    }
    case 'week.add': {
      const weeks = phase(op.phaseId).weeks;
      if (op.afterWeekId !== undefined) byId(weeks, op.afterWeekId);
      // The source may be in another phase; the destination is explicitly scoped.
      const source = op.copyFromWeekId === undefined ? undefined : required(result.phases.flatMap(p => p.weeks).find(w => w.id === op.copyFromWeekId));
      insertAfter(weeks, source ? copyWeek(source, editCtx) : blankWeek(editCtx), op.afterWeekId);
      break;
    }
    case 'week.remove': {
      const weeks = phase(op.phaseId).weeks;
      const value = byId(weeks, op.weekId);
      if (weeks.length === 1) throw new ProgramEditError('last_week', 'A phase must keep at least one week.');
      weeks.splice(weeks.indexOf(value), 1);
      break;
    }
    case 'week.duplicate': {
      const weeks = phase(op.phaseId).weeks;
      insertAfter(weeks, copyWeek(byId(weeks, op.weekId), editCtx), op.weekId);
      break;
    }
    case 'week.move': { const weeks = phase(op.phaseId).weeks; move(weeks, byId(weeks, op.weekId), op.toIndex); break; }
    case 'week.update': patchFields(byId(phase(op.phaseId).weeks, op.weekId), op.patch, PATCH_KEYS.week); break;
    case 'day.setKind': {
      const value = day(op.dayId);
      value.kind = op.kind;
      if (op.kind === 'training' && !value.workout) value.workout = blankWorkout(editCtx);
      if (op.kind === 'rest') delete value.workout;
      break;
    }
    case 'day.update': patchFields(day(op.dayId), op.patch, PATCH_KEYS.day); break;
    case 'day.copyTo': {
      if (!Array.isArray(op.toDayIds)) throw new ProgramEditError('invalid_op', 'day.copyTo needs a list of target day ids.');
      const source = { ...day(op.fromDayId) };
      // Copying a day onto itself changes nothing, so its workout keeps the item ids that logs and comments refer to.
      const targets = [...new Set(op.toDayIds)].filter(id => id !== source.id).map(day);
      for (const target of targets) {
        target.kind = source.kind;
        if (source.workout) target.workout = copyWorkout(source.workout, editCtx);
        else delete target.workout;
      }
      break;
    }
    case 'day.swap': {
      const a = day(op.dayIdA); const b = day(op.dayIdB);
      const contentsA = { kind: a.kind, workout: a.workout ?? null, note: a.note ?? null };
      assignFields(a, { kind: b.kind, workout: b.workout ?? null, note: b.note ?? null });
      assignFields(b, contentsA);
      break;
    }
    case 'day.clear': { const value = day(op.dayId); value.kind = 'rest'; delete value.workout; break; }
    case 'workout.update': patchFields(workout(op.dayId), op.patch, PATCH_KEYS.workout); break;
    case 'block.add': {
      const blocks = workout(op.dayId).blocks;
      if (op.afterBlockId !== undefined) byId(blocks, op.afterBlockId);
      insertAfter(blocks, { id: editCtx.newId(), kind: op.kind, ...(op.name === undefined ? {} : { name: op.name }), items: [] }, op.afterBlockId);
      break;
    }
    case 'block.update': patchFields(block(op.dayId, op.blockId), op.patch, PATCH_KEYS.block); break;
    case 'block.remove': { const blocks = workout(op.dayId).blocks; blocks.splice(blocks.indexOf(byId(blocks, op.blockId)), 1); break; }
    case 'block.move': { const blocks = workout(op.dayId).blocks; move(blocks, byId(blocks, op.blockId), op.toIndex); break; }
    case 'block.insert': {
      const blocks = workout(op.dayId).blocks;
      if (op.afterBlockId !== undefined) byId(blocks, op.afterBlockId);
      const parsed = WorkoutBlock.safeParse(op.block);
      if (!parsed.success) throw new ProgramEditError('invalid_op', 'Invalid mini-plan block.');
      allocated.add(parsed.data.id);
      parsed.data.items.forEach(item => allocated.add(item.id));
      // spec §12: inserted library content is an independent client instance.
      insertAfter(blocks, copyBlock(parsed.data, editCtx), op.afterBlockId);
      break;
    }
    case 'item.add': {
      const items = block(op.dayId, op.blockId).items;
      const count = positiveCount(op.sets ?? 3);
      items.push({ id: editCtx.newId(), exerciseId: op.exerciseId, order: items.length, sets: Array.from({ length: count }, (_, i) => ({ ...op.template, setNo: i + 1 })) });
      break;
    }
    case 'item.update': patchFields(itemRef(op.dayId, op.itemId).item, op.patch, PATCH_KEYS.item); break;
    case 'item.replaceExercise': itemRef(op.dayId, op.itemId).item.exerciseId = op.exerciseId; break;
    case 'item.remove': { const ref = itemRef(op.dayId, op.itemId); ref.block.items.splice(ref.block.items.indexOf(ref.item), 1); break; }
    case 'item.move': {
      const ref = itemRef(op.dayId, op.itemId);
      const destination = block(op.dayId, op.toBlockId);
      if (!Number.isSafeInteger(op.toIndex)) throw new ProgramEditError('index_out_of_range', 'Move index must be a finite integer.');
      ref.block.items.splice(ref.block.items.indexOf(ref.item), 1);
      destination.items.splice(Math.max(0, Math.min(destination.items.length, op.toIndex)), 0, ref.item);
      break;
    }
    case 'item.duplicate': {
      const ref = itemRef(op.dayId, op.itemId);
      insertAfter(ref.block.items, copyItem(ref.item, editCtx), ref.item.id);
      break;
    }
    case 'set.add': {
      const sets = itemRef(op.dayId, op.itemId).item.sets;
      sets.push({ ...(op.copyLast === false ? {} : sets[sets.length - 1]), setNo: sets.length + 1 });
      break;
    }
    case 'set.update': {
      const set = required(itemRef(op.dayId, op.itemId).item.sets.find(set => set.setNo === op.setNo));
      patchFields(set, op.patch, PATCH_KEYS.set);
      break;
    }
    case 'set.remove': {
      const sets = itemRef(op.dayId, op.itemId).item.sets;
      const set = required(sets.find(set => set.setNo === op.setNo));
      if (sets.length === 1) throw new ProgramEditError('last_set', 'An exercise must keep at least one set.');
      sets.splice(sets.indexOf(set), 1);
      break;
    }
    case 'set.applyToAll': itemRef(op.dayId, op.itemId).item.sets.forEach(set => patchFields(set, op.patch, PATCH_KEYS.set)); break;
    case 'meta.update': patchFields(result, op.patch, PATCH_KEYS.meta); break;
    default: throw new ProgramEditError('invalid_op', 'Unknown program operation.');
  }
  normalize(result);
  const parsed = parseDocument(result);
  uniqueIds(parsed);
  return parsed;
}

/** Apply edits in order, returning the same value as sequential single-op application. */
export function applyProgramOps(doc: ProgramDocument, ops: ProgramOp[], ctx: EditCtx): ProgramDocument {
  const parsed = parseDocument(doc);
  uniqueIds(parsed);
  return ops.reduce((current, op) => applyProgramOp(current, op, ctx), parsed);
}

/** Count program contents and list distinct primary exercise ids in first-seen order. */
export function programStats(doc: ProgramDocument): ProgramStats {
  const parsed = parseDocument(doc);
  const stats: ProgramStats = { phases: parsed.phases.length, weeks: 0, trainingDays: 0, workouts: 0, blocks: 0, items: 0, sets: 0, exerciseIds: [] };
  const exercises = new Set<string>();
  for (const phase of parsed.phases) {
    stats.weeks += phase.weeks.length;
    for (const week of phase.weeks) for (const day of week.days) {
      if (day.kind === 'training') stats.trainingDays++;
      if (!day.workout) continue;
      stats.workouts++;
      stats.blocks += day.workout.blocks.length;
      for (const block of day.workout.blocks) {
        stats.items += block.items.length;
        for (const item of block.items) { stats.sets += item.sets.length; exercises.add(item.exerciseId); }
      }
    }
  }
  stats.exerciseIds = [...exercises];
  return stats;
}

/** Return publish-time semantic issues after validating the shared document shape. */
export function validateProgram(doc: ProgramDocument, opts: { knownExerciseIds?: ReadonlySet<string> } = {}): ProgramIssue[] {
  const parsed = parseDocument(doc);
  const issues: ProgramIssue[] = [];
  const seen = new Set<string>();
  const messages: Record<ProgramIssue['code'], LocalizedText> = {
    unknown_exercise: { ar: 'التمرين ده مش موجود في مكتبة التمارين.', en: 'This exercise is not in the exercise library.' },
    empty_workout: { ar: 'التمرين فاضي؛ ضيف تمارين قبل النشر.', en: 'Add exercises to this empty workout before publishing.' },
    training_without_workout: { ar: 'يوم التمرين ده محتاج تمرين.', en: 'This training day needs a workout.' },
    duplicate_id: { ar: 'في عنصرين بنفس المعرّف؛ اعمل نسخة بمعرّف جديد.', en: 'Two elements share an id; assign a fresh id.' },
    bad_set_numbers: { ar: 'رقّم المجموعات بالترتيب بداية من 1.', en: 'Number sets consecutively starting at 1.' },
    bad_order: { ar: 'رتّب التمارين من الأول من غير أرقام ناقصة.', en: 'Exercise order must be consecutive starting at 0.' },
    bad_week_index: { ar: 'راجع ترتيب الأسابيع جوّه المرحلة.', en: 'Check week indexes within this phase.' },
    bad_day_index: { ar: 'راجع ترتيب أيام الأسبوع.', en: 'Check day indexes within this week.' },
    empty_block: { ar: 'البلوك ده فاضي؛ ضيف تمرين أو شيله.', en: 'Add an exercise to this empty block or remove it.' },
    date_order: { ar: 'راجع التواريخ: البداية، وبعدها المراجعة، وبعدها النهاية.', en: 'Dates must run from start to review to end.' },
  };
  const issue = (path: string, code: ProgramIssue['code']) => { issues.push({ path, code, message: messages[code] }); };
  const checkId = (id: string, path: string) => { if (seen.has(id)) issue(`${path}.id`, 'duplicate_id'); seen.add(id); };
  for (const [pi, phase] of parsed.phases.entries()) {
    const pp = `phases[${pi}]`;
    checkId(phase.id, pp);
    for (const [wi, week] of phase.weeks.entries()) {
      const wp = `${pp}.weeks[${wi}]`;
      checkId(week.id, wp);
      if (week.index !== wi) issue(`${wp}.index`, 'bad_week_index');
      for (const [di, day] of week.days.entries()) {
        const dp = `${wp}.days[${di}]`;
        checkId(day.id, dp);
        if (day.index !== di) issue(`${dp}.index`, 'bad_day_index');
        if (day.kind === 'training' && !day.workout) issue(`${dp}.workout`, 'training_without_workout');
        if (!day.workout) continue;
        const workp = `${dp}.workout`;
        checkId(day.workout.id, workp);
        const workoutEmpty = !day.workout.blocks.some(block => block.items.length > 0);
        if (workoutEmpty) issue(workp, 'empty_workout');
        for (const [bi, block] of day.workout.blocks.entries()) {
          const bp = `${workp}.blocks[${bi}]`;
          checkId(block.id, bp);
          // One problem, one issue: the blocks of an empty workout are covered by empty_workout.
          if (block.items.length === 0 && !workoutEmpty) issue(bp, 'empty_block');
          for (const [ii, item] of block.items.entries()) {
            const ip = `${bp}.items[${ii}]`;
            checkId(item.id, ip);
            if (item.order !== ii) issue(`${ip}.order`, 'bad_order');
            if (item.sets.some((set, index) => set.setNo !== index + 1)) issue(`${ip}.sets`, 'bad_set_numbers');
            if (opts.knownExerciseIds) {
              if (!opts.knownExerciseIds.has(item.exerciseId)) issue(`${ip}.exerciseId`, 'unknown_exercise');
              item.alternatives?.forEach((id, index) => { if (!opts.knownExerciseIds!.has(id)) issue(`${ip}.alternatives[${index}]`, 'unknown_exercise'); });
            }
          }
        }
      }
    }
  }
  const dateFields = ['startDate', 'reviewDate', 'endDate'] as const;
  let previous: IsoDate | undefined;
  for (const field of dateFields) {
    const value = parsed[field];
    if (value === undefined) continue;
    if (previous !== undefined && value < previous) issue(field, 'date_order');
    previous = value;
  }
  return issues;
}
