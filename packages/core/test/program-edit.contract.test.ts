import { describe, it, expect, beforeAll } from 'vitest';
import { ProgramDocument, type WorkoutBlock } from '../src/types';
import {
  applyProgramOp, applyProgramOps, emptyProgram, findDay, programStats, validateProgram, ProgramEditError,
  type ProgramOp, type EditCtx,
} from '../src/program-edit';

/* ===================================================================== helpers */
type Doc = ProgramDocument;
type Counter = { n: number; ctx: EditCtx };
function counter(prefix = 'new'): Counter {
  const c = { n: 0 } as Counter;
  c.ctx = { newId: () => `${prefix}-${String(++c.n).padStart(6, '0')}` };
  return c;
}
let ctxSeq = 0;
/** every call gets its own id prefix, so two ctx() values never collide inside one document. */
const ctx = (): EditCtx => counter(`c${++ctxSeq}`).ctx;
const clone = <V,>(v: V): V => JSON.parse(JSON.stringify(v));
function freeze<V>(v: V): V {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
/** every `id` key in a tree (document entities only have ids under the key `id`). */
function allIds(v: unknown): string[] {
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v).flatMap(([k, c]) => (k === 'id' ? [String(c)] : allIds(c)));
}
function stripIds(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripIds);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'id').map(([k, c]) => [k, stripIds(c)]));
  return v;
}
function codeOf(fn: () => unknown): string {
  try { fn(); return 'none'; } catch (e) {
    if (e instanceof ProgramEditError) return e.code;
    return `OTHER:${(e as Error)?.constructor?.name}:${(e as Error)?.message?.slice(0, 80)}`;
  }
}
/** apply on a frozen clone of doc and op so any in-place mutation throws. */
function run(doc: Doc, op: ProgramOp, c: EditCtx = ctx()): Doc {
  return applyProgramOp(freeze(structuredClone(doc)), freeze(structuredClone(op)), c);
}
const bad = <V,>(x: unknown): V => x as V;
type AnyDay = Doc['phases'][number]['weeks'][number]['days'][number];
function days(doc: Doc): AnyDay[] { return doc.phases.flatMap(p => p.weeks.flatMap(w => w.days)); }
function dayOf(doc: Doc, id: string): AnyDay { const d = days(doc).find(x => x.id === id); if (!d) throw new Error(`no day ${id}`); return d; }
function blocksOf(doc: Doc): { block: WorkoutBlock; dayId: string }[] {
  return days(doc).flatMap(d => (d.workout?.blocks ?? []).map(block => ({ block, dayId: d.id })));
}
function itemsOf(doc: Doc) {
  return blocksOf(doc).flatMap(({ block, dayId }) => block.items.map(item => ({ item, block, dayId })));
}
function itemOf(doc: Doc, id: string) { const r = itemsOf(doc).find(x => x.item.id === id); if (!r) throw new Error(`no item ${id}`); return r; }

/* ---------------------------------------------------------------- raw fixtures */
const mkSets = (n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({ setNo: i + 1, ...extra }));
const mkItem = (id: string, exerciseId: string, order: number, sets = 3, extra: Record<string, unknown> = {}, setExtra: Record<string, unknown> = {}) =>
  ({ id, exerciseId, order, sets: mkSets(sets, setExtra), ...extra });
function mkDays(w: string, spec: Record<number, Partial<AnyDay>> = {}): AnyDay[] {
  return Array.from({ length: 7 }, (_, i) => ({ id: `d${w}-${i}`, index: i, kind: 'rest' as const, ...(spec[i] ?? {}) })) as AnyDay[];
}
/** Phase p1: w1 (training d1-0 with 2 blocks / 3 items, active_recovery d1-1, empty training d1-2, rest d1-3 with note), w2 (deload, training d2-0); phase p2: w3 all rest. */
function F(): Doc {
  const doc = {
    schemaVersion: 1,
    phases: [
      {
        id: 'p1', name: { ar: 'أ', en: 'One' }, goal: { en: 'Goal 1' },
        weeks: [
          {
            id: 'w1', index: 0,
            days: mkDays('1', {
              0: { kind: 'training', workout: { id: 'wk1', name: { ar: 'أ', en: 'A' }, estimatedMinutes: 50, note: { en: 'wk note' }, blocks: [
                { id: 'b1', kind: 'main', name: { en: 'Main' }, rounds: 2, restBetweenRoundsSec: 30, note: { en: 'bn' }, items: [
                  mkItem('i1', 'ex-a', 0, 3, { progressionRule: { type: 'reps', threshold: 10, step: 1 }, coachNote: { en: 'cue' }, alternatives: ['ex-z'] }, { reps: '8', load: { value: 20, unit: 'kg' }, restSec: 60, note: { en: 'sn' } }),
                  mkItem('i2', 'ex-b', 1, 2),
                ] },
                { id: 'b2', kind: 'cooldown', items: [mkItem('i3', 'ex-c', 0, 1)] },
              ] } },
              1: { kind: 'active_recovery', workout: { id: 'wk2', name: { en: 'Recovery' }, blocks: [{ id: 'b3', kind: 'mobility', items: [mkItem('i4', 'ex-d', 0, 2)] }] } },
              2: { kind: 'training', workout: { id: 'wk3', name: { en: 'Empty' }, blocks: [{ id: 'b4', kind: 'main', items: [] }] } },
              3: { note: { en: 'rest note' } },
            }),
          },
          { id: 'w2', index: 1, isDeload: true, note: { en: 'deload' }, days: mkDays('2', { 0: { kind: 'training', workout: { id: 'wk4', name: { en: 'D' }, blocks: [{ id: 'b5', kind: 'main', items: [mkItem('i5', 'ex-a', 0, 2)] }] } } }) },
        ],
      },
      { id: 'p2', name: { en: 'Two' }, weeks: [{ id: 'w3', index: 0, days: mkDays('3') }] },
    ],
  };
  return ProgramDocument.parse(doc);
}
/** A document with no semantic issue at all. */
function clean(): Doc {
  return ProgramDocument.parse({
    schemaVersion: 1,
    phases: [{ id: 'p1', name: { en: 'P' }, weeks: [{ id: 'w1', index: 0, days: mkDays('1', {
      0: { kind: 'training', workout: { id: 'wk1', name: { en: 'A' }, blocks: [{ id: 'b1', kind: 'main', items: [mkItem('i1', 'ex-a', 0, 2), mkItem('i2', 'ex-b', 1, 2)] }] } },
    }) }] }],
  });
}
/** Mutate a clone through `fn` without going through the parser (to build semantically broken docs). */
function broken(fn: (d: any) => void, base: Doc = clean()): Doc { const d = clone(base) as any; fn(d); return d as Doc; }

const NEW = (doc: Doc, after: Doc) => { const old = new Set(allIds(doc)); return allIds(after).filter(i => !old.has(i)); };

/* =============================================================== property run */
type Rng = () => number;
function mulberry32(a: number): Rng {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <V,>(r: Rng, a: readonly V[]): V => a[int(r, 0, a.length - 1)]!;
const pad2 = (n: number) => String(n).padStart(2, '0');
const txt = (r: Rng) => { const k = int(r, 0, 2); const n = int(r, 0, 999); return k === 0 ? { ar: `ع${n}` } : k === 1 ? { en: `t${n}` } : { ar: `ع${n}`, en: `t${n}` }; };
const dateStr = (r: Rng) => `2026-${pad2(int(r, 1, 12))}-${pad2(int(r, 1, 28))}`;
const KINDS = ['warmup', 'main', 'superset', 'circuit', 'cardio', 'mobility', 'corrective', 'cooldown'] as const;
const UNITS = ['kg', 'lb', '%1rm', 'rpe-target', 'bodyweight'] as const;
const TO_INDEX = [-1000, -1, 0, 1, 2, 3, 5, 1000] as const;
function setFields(r: Rng, nullable: boolean): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (r() < 0.4) t[k] = nullable && r() < 0.25 ? null : v; };
  put('reps', pick(r, ['8', '8-10', 'AMRAP', '30s']));
  put('load', { value: int(r, 0, 200), unit: pick(r, UNITS) });
  put('tempo', '3-1-1-0');
  put('restSec', int(r, 0, 180));
  put('rpe', int(r, 1, 10));
  put('rir', int(r, 0, 5));
  put('durationSec', int(r, 1, 300));
  put('distanceM', int(r, 1, 500));
  put('note', txt(r));
  return t;
}
function totalWeeks(d: Doc) { return d.phases.reduce((s, p) => s + p.weeks.length, 0); }

type Gen = { op: ProgramOp; expectError?: string };
function genOp(r: Rng, doc: Doc): Gen {
  const phases = doc.phases;
  const weeks = phases.flatMap(p => p.weeks.map(w => ({ p, w })));
  const allDays = days(doc);
  const wdays = allDays.filter(d => d.workout);
  const blocks = blocksOf(doc);
  const items = itemsOf(doc);
  const big = totalWeeks(doc) > 8 || items.length > 40;
  const cands: (() => Gen | null)[] = [
    () => ({ op: { type: 'phase.add', ...(r() < 0.5 ? { afterPhaseId: pick(r, phases).id } : {}), ...(r() < 0.5 ? { name: txt(r) } : {}), ...(r() < 0.5 ? { weeks: int(r, 1, 3) } : {}) } }),
    () => ({ op: { type: 'phase.update', phaseId: pick(r, phases).id, patch: { ...(r() < 0.5 ? { name: txt(r) } : {}), ...(r() < 0.5 ? { goal: r() < 0.4 ? null : txt(r) } : {}) } } }),
    () => { const p = pick(r, phases); return { op: { type: 'phase.remove', phaseId: p.id }, expectError: phases.length === 1 ? 'last_phase' : undefined }; },
    () => ({ op: { type: 'phase.move', phaseId: pick(r, phases).id, toIndex: pick(r, TO_INDEX) } }),
    () => (big ? null : { op: { type: 'phase.duplicate', phaseId: pick(r, phases).id } }),
    () => { const { p, w } = pick(r, weeks); return big ? null : { op: { type: 'week.add', phaseId: p.id, ...(r() < 0.5 ? { afterWeekId: pick(r, p.weeks).id } : {}), ...(r() < 0.5 ? { copyFromWeekId: pick(r, weeks).w.id } : {}) } }; void w; },
    () => { const { p, w } = pick(r, weeks); return { op: { type: 'week.remove', phaseId: p.id, weekId: w.id }, expectError: p.weeks.length === 1 ? 'last_week' : undefined }; },
    () => { const { p, w } = pick(r, weeks); return big ? null : { op: { type: 'week.duplicate', phaseId: p.id, weekId: w.id } }; },
    () => { const { p, w } = pick(r, weeks); return { op: { type: 'week.move', phaseId: p.id, weekId: w.id, toIndex: pick(r, TO_INDEX) } }; },
    () => { const { p, w } = pick(r, weeks); return { op: { type: 'week.update', phaseId: p.id, weekId: w.id, patch: { ...(r() < 0.6 ? { isDeload: r() < 0.5 } : {}), ...(r() < 0.6 ? { note: r() < 0.4 ? null : txt(r) } : {}) } } }; },
    () => ({ op: { type: 'day.setKind', dayId: pick(r, allDays).id, kind: pick(r, ['training', 'rest', 'active_recovery'] as const) } }),
    () => ({ op: { type: 'day.update', dayId: pick(r, allDays).id, patch: { note: r() < 0.4 ? null : txt(r) } } }),
    () => ({ op: { type: 'day.copyTo', fromDayId: pick(r, allDays).id, toDayIds: Array.from({ length: int(r, 0, 4) }, () => pick(r, allDays).id) } }),
    () => ({ op: { type: 'day.swap', dayIdA: pick(r, allDays).id, dayIdB: pick(r, allDays).id } }),
    () => ({ op: { type: 'day.clear', dayId: pick(r, allDays).id } }),
    () => (wdays.length ? { op: { type: 'workout.update', dayId: pick(r, wdays).id, patch: { ...(r() < 0.5 ? { name: txt(r) } : {}), ...(r() < 0.5 ? { estimatedMinutes: r() < 0.3 ? null : int(r, 1, 120) } : {}), ...(r() < 0.5 ? { note: r() < 0.3 ? null : txt(r) } : {}) } } } : null),
    () => { if (!wdays.length) return null; const d = pick(r, wdays); return { op: { type: 'block.add', dayId: d.id, kind: pick(r, KINDS), ...(r() < 0.5 && d.workout!.blocks.length ? { afterBlockId: pick(r, d.workout!.blocks).id } : {}), ...(r() < 0.5 ? { name: txt(r) } : {}) } }; },
    () => (blocks.length ? { op: { type: 'block.update', dayId: pick(r, blocks).dayId, blockId: '', patch: {} } } : null),
    () => { if (!blocks.length) return null; const b = pick(r, blocks); return { op: { type: 'block.update', dayId: b.dayId, blockId: b.block.id, patch: { ...(r() < 0.4 ? { kind: pick(r, KINDS) } : {}), ...(r() < 0.4 ? { name: r() < 0.4 ? null : txt(r) } : {}), ...(r() < 0.4 ? { rounds: r() < 0.4 ? null : int(r, 1, 6) } : {}), ...(r() < 0.4 ? { restBetweenRoundsSec: r() < 0.4 ? null : int(r, 0, 120) } : {}), ...(r() < 0.4 ? { note: r() < 0.4 ? null : txt(r) } : {}) } } }; },
    () => { if (!blocks.length) return null; const b = pick(r, blocks); return { op: { type: 'block.remove', dayId: b.dayId, blockId: b.block.id } }; },
    () => { if (!blocks.length) return null; const b = pick(r, blocks); return { op: { type: 'block.move', dayId: b.dayId, blockId: b.block.id, toIndex: pick(r, TO_INDEX) } }; },
    () => {
      if (!wdays.length || big) return null;
      const d = pick(r, wdays);
      let block: WorkoutBlock;
      if (blocks.length && r() < 0.5) {
        block = clone(pick(r, blocks).block); // block lifted from the very same document: its ids collide with live ids
        if (r() < 0.5) block.items.forEach(it => { it.order = int(r, 0, 9); it.sets.forEach(s => { s.setNo = int(r, 1, 9); }); });
      } else {
        block = { id: `ext-${int(r, 0, 99999)}`, kind: pick(r, KINDS), items: Array.from({ length: int(r, 0, 3) }, (_, k) => ({ id: `ext-i${k}-${int(r, 0, 99999)}`, exerciseId: `ex-${int(r, 1, 6)}`, order: k, sets: mkSets(int(r, 1, 3)) })) } as WorkoutBlock;
      }
      return { op: { type: 'block.insert', dayId: d.id, block, ...(r() < 0.5 && d.workout!.blocks.length ? { afterBlockId: pick(r, d.workout!.blocks).id } : {}) } };
    },
    () => { if (!blocks.length || big) return null; const b = pick(r, blocks); return { op: { type: 'item.add', dayId: b.dayId, blockId: b.block.id, exerciseId: `ex-${int(r, 1, 6)}`, ...(r() < 0.6 ? { sets: int(r, 1, 4) } : {}), ...(r() < 0.6 ? { template: setFields(r, false) } : {}) } as ProgramOp }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'item.update', dayId: i.dayId, itemId: i.item.id, patch: { ...(r() < 0.5 ? { progressionRule: r() < 0.3 ? null : { type: pick(r, ['reps', 'load', 'rpe'] as const), threshold: int(r, 1, 20), step: int(r, 1, 5) } } : {}), ...(r() < 0.5 ? { coachNote: r() < 0.3 ? null : txt(r) } : {}), ...(r() < 0.5 ? { alternatives: r() < 0.3 ? null : [`ex-${int(r, 1, 6)}`, `ex-${int(r, 1, 6)}`] } : {}) } } }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'item.replaceExercise', dayId: i.dayId, itemId: i.item.id, exerciseId: `ex-${int(r, 1, 6)}` } }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'item.remove', dayId: i.dayId, itemId: i.item.id } }; },
    () => { if (!items.length) return null; const i = pick(r, items); const dest = doc.phases.length ? allDays.find(d => d.id === i.dayId)!.workout!.blocks : []; return { op: { type: 'item.move', dayId: i.dayId, itemId: i.item.id, toBlockId: pick(r, dest).id, toIndex: pick(r, TO_INDEX) } }; },
    () => { if (!items.length || big) return null; const i = pick(r, items); return { op: { type: 'item.duplicate', dayId: i.dayId, itemId: i.item.id } }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'set.add', dayId: i.dayId, itemId: i.item.id, ...(r() < 0.6 ? { copyLast: r() < 0.5 } : {}) } }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'set.update', dayId: i.dayId, itemId: i.item.id, setNo: pick(r, i.item.sets).setNo, patch: setFields(r, true) } as ProgramOp }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'set.remove', dayId: i.dayId, itemId: i.item.id, setNo: pick(r, i.item.sets).setNo }, expectError: i.item.sets.length === 1 ? 'last_set' : undefined }; },
    () => { if (!items.length) return null; const i = pick(r, items); return { op: { type: 'set.applyToAll', dayId: i.dayId, itemId: i.item.id, patch: setFields(r, true) } as ProgramOp }; },
    () => ({ op: { type: 'meta.update', patch: { ...(r() < 0.5 ? { startDate: r() < 0.3 ? null : dateStr(r) } : {}), ...(r() < 0.5 ? { endDate: r() < 0.3 ? null : dateStr(r) } : {}), ...(r() < 0.5 ? { reviewDate: r() < 0.3 ? null : dateStr(r) } : {}), ...(r() < 0.5 ? { goal: r() < 0.3 ? null : txt(r) } : {}), ...(r() < 0.5 ? { notes: r() < 0.3 ? null : txt(r) } : {}) } } }),
  ];
  for (let attempt = 0; attempt < 20; attempt++) {
    const g = pick(r, cands)();
    if (!g || (g.op.type === 'block.update' && (g.op as any).blockId === '')) continue;
    // 6%: swap one entity-id field for an id that does not exist -> must be not_found
    if (r() < 0.06) {
      const op: any = clone(g.op);
      const keys = Object.keys(op).filter(k => /Id$|Ids$/.test(k) && k !== 'exerciseId');
      if (keys.length) {
        const k = pick(r, keys);
        op[k] = Array.isArray(op[k]) ? [...op[k], 'missing-id'] : 'missing-id';
        return { op, expectError: 'not_found' };
      }
    }
    return g;
  }
  return { op: { type: 'meta.update', patch: {} } };
}

const DOCUMENTED = new Set(['not_found', 'invalid_op', 'last_phase', 'last_week', 'last_set', 'index_out_of_range']);
const SEQUENCES = 2400;
const OPS_PER_SEQ = 14;
const violations: Record<string, string[]> = {};
const stats = { ops: 0, ok: 0, errors: {} as Record<string, number>, sequences: 0, byType: {} as Record<string, number> };
function viol(cat: string, msg: string) { (violations[cat] ??= []).length < 6 && violations[cat]!.push(msg); (violations[`${cat}#count`] ??= []).push(''); }

function structural(doc: Doc): string | null {
  const ids = allIds(doc);
  if (new Set(ids).size !== ids.length) return 'duplicate ids';
  for (const p of doc.phases) for (const [wi, w] of p.weeks.entries()) {
    if (w.index !== wi) return `week index ${w.index} at ${wi}`;
    for (const [di, d] of w.days.entries()) {
      if (d.index !== di) return `day index ${d.index} at ${di}`;
      for (const b of d.workout?.blocks ?? []) for (const [ii, it] of b.items.entries()) {
        if (it.order !== ii) return `item order ${it.order} at ${ii}`;
        for (const [si, s] of it.sets.entries()) if (s.setNo !== si + 1) return `setNo ${s.setNo} at ${si}`;
      }
    }
  }
  return null;
}
const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));
function subtreeIds(doc: Doc, op: ProgramOp): { expectedNew: number } | null {
  switch (op.type) {
    case 'phase.duplicate': return { expectedNew: allIds(doc.phases.find(p => p.id === op.phaseId)).length };
    case 'week.duplicate': return { expectedNew: allIds(doc.phases.find(p => p.id === op.phaseId)!.weeks.find(w => w.id === op.weekId)).length };
    case 'week.add': {
      if (!op.copyFromWeekId) return { expectedNew: 1 + 7 };
      return { expectedNew: allIds(doc.phases.flatMap(p => p.weeks).find(w => w.id === op.copyFromWeekId)).length };
    }
    case 'item.duplicate': return { expectedNew: allIds(itemOf(doc, op.itemId).item).length };
    case 'block.insert': return { expectedNew: 1 + op.block.items.length };
    case 'item.add': return { expectedNew: 1 };
    case 'block.add': return { expectedNew: 1 };
    case 'day.copyTo': {
      const src = dayOf(doc, op.fromDayId);
      // Copying a day onto itself is a no-op (review Q03), so the source never receives fresh ids.
      const targets = [...new Set(op.toDayIds)].filter(id => id !== op.fromDayId);
      return { expectedNew: src.workout ? targets.length * allIds(src.workout).length : 0 };
    }
    default: return null;
  }
}
/** op-specific semantic oracle written from the contract, independent of the module. */
function semantic(doc: Doc, op: ProgramOp, res: Doc): string | null {
  const idsAt = (arr: { id: string }[]) => arr.map(x => x.id);
  const movedExpect = (before: string[], id: string, toIndex: number) => { const a = before.filter(x => x !== id); a.splice(clampIdx(toIndex, before.length), 0, id); return a; };
  switch (op.type) {
    case 'phase.move': { const e = movedExpect(idsAt(doc.phases), op.phaseId, op.toIndex); return JSON.stringify(e) === JSON.stringify(idsAt(res.phases)) ? null : `phase.move expected ${e} got ${idsAt(res.phases)}`; }
    case 'week.move': {
      const e = movedExpect(idsAt(doc.phases.find(p => p.id === op.phaseId)!.weeks), op.weekId, op.toIndex);
      const g = idsAt(res.phases.find(p => p.id === op.phaseId)!.weeks);
      return JSON.stringify(e) === JSON.stringify(g) ? null : `week.move expected ${e} got ${g}`;
    }
    case 'block.move': {
      const e = movedExpect(idsAt(dayOf(doc, op.dayId).workout!.blocks), op.blockId, op.toIndex);
      const g = idsAt(dayOf(res, op.dayId).workout!.blocks);
      return JSON.stringify(e) === JSON.stringify(g) ? null : `block.move expected ${e} got ${g}`;
    }
    case 'item.move': {
      const src = itemOf(doc, op.itemId);
      const wk = dayOf(doc, op.dayId).workout!;
      const destBefore = wk.blocks.find(b => b.id === op.toBlockId)!.items.map(i => i.id).filter(i => i !== op.itemId);
      destBefore.splice(Math.max(0, Math.min(destBefore.length, op.toIndex)), 0, op.itemId);
      const g = dayOf(res, op.dayId).workout!.blocks.find(b => b.id === op.toBlockId)!.items.map(i => i.id);
      const srcAfter = dayOf(res, op.dayId).workout!.blocks.find(b => b.id === src.block.id)!.items.map(i => i.id);
      if (src.block.id !== op.toBlockId && srcAfter.includes(op.itemId)) return 'item still in source block';
      return JSON.stringify(destBefore) === JSON.stringify(g) ? null : `item.move expected ${destBefore} got ${g}`;
    }
    case 'phase.remove': return res.phases.some(p => p.id === op.phaseId) || res.phases.length !== doc.phases.length - 1 ? 'phase.remove did not remove exactly one phase' : null;
    case 'week.remove': { const p = res.phases.find(x => x.id === op.phaseId)!; return p.weeks.some(w => w.id === op.weekId) ? 'week still present' : null; }
    case 'block.remove': return dayOf(res, op.dayId).workout!.blocks.some(b => b.id === op.blockId) ? 'block still present' : null;
    case 'item.remove': return itemsOf(res).some(i => i.item.id === op.itemId) ? 'item still present' : null;
    case 'set.add': {
      const b = itemOf(doc, op.itemId).item.sets.length, a = itemOf(res, op.itemId).item.sets.length;
      return a === b + 1 ? null : `set.add ${b} -> ${a}`;
    }
    case 'set.remove': {
      const b = itemOf(doc, op.itemId).item.sets.length, a = itemOf(res, op.itemId).item.sets.length;
      return a === b - 1 ? null : `set.remove ${b} -> ${a}`;
    }
    case 'day.swap': {
      const a0 = dayOf(doc, op.dayIdA), b0 = dayOf(doc, op.dayIdB), a1 = dayOf(res, op.dayIdA), b1 = dayOf(res, op.dayIdB);
      if (a0.index !== a1.index || b0.index !== b1.index) return 'swap changed day index';
      if (op.dayIdA === op.dayIdB) return JSON.stringify(a0) === JSON.stringify(a1) ? null : 'self swap changed the day';
      return a1.kind === b0.kind && b1.kind === a0.kind && JSON.stringify(a1.workout) === JSON.stringify(b0.workout) && JSON.stringify(b1.workout) === JSON.stringify(a0.workout) ? null : 'swap did not exchange kind/workout';
    }
    case 'day.clear': { const d = dayOf(res, op.dayId); return d.kind === 'rest' && !d.workout ? null : 'day.clear left content'; }
    case 'day.copyTo': {
      const src = dayOf(doc, op.fromDayId);
      for (const t of op.toDayIds) {
        const d = dayOf(res, t);
        if (d.kind !== src.kind) return `copyTo kind ${d.kind} != ${src.kind}`;
        if (JSON.stringify(stripIds(d.workout)) !== JSON.stringify(stripIds(src.workout))) return 'copyTo workout content differs';
      }
      return null;
    }
    default: return null;
  }
}

function simulate(): void {
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const r = mulberry32(seed * 7919 + 13);
    const c = counter();
    let doc: Doc;
    try {
      doc = emptyProgram(c.ctx, { weeks: int(r, 1, 3), trainingDays: Array.from({ length: 7 }, (_, i) => i).filter(() => r() < 0.5) });
    } catch (e) { viol('emptyProgram_threw', `seed ${seed}: ${(e as Error).message}`); continue; }
    freeze(doc);
    const startDoc = clone(doc), startCounter = c.n, applied: ProgramOp[] = [];
    const sequential: Doc[] = [];
    for (let k = 0; k < OPS_PER_SEQ; k++) {
      const { op, expectError } = genOp(r, doc);
      const tag = `seed ${seed} op#${k} ${op.type}`;
      stats.ops++; stats.byType[op.type] = (stats.byType[op.type] ?? 0) + 1;
      freeze(op);
      const docSnap = JSON.stringify(doc), opSnap = JSON.stringify(op), c0 = c.n, inIds = new Set(allIds(doc));
      let res: Doc | undefined, err: unknown;
      try { res = applyProgramOp(doc, op, c.ctx); } catch (e) { err = e; }
      if (JSON.stringify(doc) !== docSnap) viol('input_mutated', tag);
      if (JSON.stringify(op) !== opSnap) viol('op_mutated', tag);
      if (err !== undefined) {
        c.n = c0;
        if (!(err instanceof ProgramEditError)) { viol('non_edit_error', `${tag}: ${(err as Error)?.name}: ${(err as Error)?.message}`); continue; }
        stats.errors[err.code] = (stats.errors[err.code] ?? 0) + 1;
        if (!DOCUMENTED.has(err.code)) viol('undocumented_code', `${tag}: ${err.code}`);
        if (err.code !== (expectError ?? 'NONE')) viol('unexpected_error_code', `${tag}: threw ${err.code} (${err.message}) expected ${expectError ?? 'success'}  op=${JSON.stringify(op).slice(0, 300)}`);
        continue;
      }
      if (expectError) { viol('missing_expected_error', `${tag}: expected ${expectError} but succeeded`); c.n = c0; continue; }
      stats.ok++;
      const out = res!;
      if (!ProgramDocument.safeParse(out).success) viol('schema_invalid', tag);
      const s = structural(out);
      if (s) viol('structure', `${tag}: ${s}`);
      const issued = new Set<string>(); for (let i = c0 + 1; i <= c.n; i++) issued.add(`new-${String(i).padStart(6, '0')}`);
      const outIds = allIds(out);
      const fresh = outIds.filter(i => !inIds.has(i));
      if (fresh.some(i => !issued.has(i))) viol('foreign_ids', `${tag}: ids not from factory ${fresh.filter(i => !issued.has(i))}`);
      const dupCnt = outIds.length - new Set(outIds).size; if (dupCnt) viol('id_collision', `${tag}: ${dupCnt} duplicated ids`);
      const sub = subtreeIds(doc, op);
      if (sub && fresh.length !== sub.expectedNew) viol('fresh_id_count', `${tag}: expected ${sub.expectedNew} new ids, got ${fresh.length}`);
      if (sub && issued.size !== sub.expectedNew) viol('unused_factory_ids', `${tag}: factory issued ${issued.size}, expected ${sub.expectedNew}`);
      const creating = ['phase.duplicate', 'week.duplicate', 'item.duplicate', 'block.insert', 'day.copyTo', 'item.add', 'block.add', 'week.add', 'phase.add'].includes(op.type);
      if (!creating && op.type !== 'day.setKind' && fresh.length) viol('unexpected_new_ids', `${tag}: non-creating op minted ${fresh.length} ids`);
      if (!creating) { const outSet = new Set(outIds); const removed = [...inIds].filter(i => !outSet.has(i)); if (removed.length && !/remove|setKind|clear|copyTo|swap/.test(op.type)) viol('ids_lost', `${tag}: lost ${removed}`); }
      const sem = semantic(doc, op, out);
      if (sem) viol('semantic', `${tag}: ${sem}`);
      // deep-frozen result must not be shared with op payloads
      applied.push(clone(op));
      freeze(out);
      doc = out;
      sequential.push(out);
    }
    stats.sequences++;
    // applyProgramOps === sequential application
    if (applied.length) {
      const c2 = counter(); c2.n = startCounter;
      try {
        const viaOps = applyProgramOps(clone(startDoc), clone(applied), c2.ctx);
        if (JSON.stringify(viaOps) !== JSON.stringify(sequential[sequential.length - 1])) viol('ops_ne_sequential', `seed ${seed}`);
      } catch (e) { viol('ops_threw_on_valid_sequence', `seed ${seed}: ${(e as Error).message}`); }
    }
  }
}

describe('P property run (mulberry32, seeded)', () => {
  beforeAll(() => { simulate(); }, 280_000);
  const none = (cat: string) => { expect(violations[cat] ?? [], `${violations[`${cat}#count`]?.length ?? 0} violations`).toEqual([]); };
  it('P00 the run really executed >= 2000 sequences and >= 25000 ops across all op types', () => {
    expect(stats.sequences).toBeGreaterThanOrEqual(2000);
    expect(stats.ops).toBeGreaterThanOrEqual(25000);
    expect(Object.keys(stats.byType).length).toBeGreaterThanOrEqual(32);
    expect(stats.ok).toBeGreaterThan(stats.ops * 0.7);
    // the generator must really reach the documented error paths, otherwise P08 proves nothing
    for (const code of ['not_found', 'last_phase', 'last_week', 'last_set']) expect(stats.errors[code] ?? 0, `${code} never exercised: ${JSON.stringify(stats.errors)}`).toBeGreaterThan(0);
  });
  it('P12 oracle self-check: structural() and semantic() do flag broken documents / wrong moves', () => {
    const d = F();
    expect(structural(d)).toBeNull();
    expect(structural(broken(x => { x.phases[0].weeks[1].index = 5; }, d))).not.toBeNull();
    expect(structural(broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].sets[1].setNo = 7; }, d))).not.toBeNull();
    expect(structural(broken(x => { x.phases[1].id = 'p1'; }, d))).not.toBeNull();
    const wrong = clone(d); wrong.phases.reverse();
    expect(semantic(d, { type: 'phase.move', phaseId: 'p1', toIndex: 0 }, wrong)).not.toBeNull();
    expect(semantic(d, { type: 'phase.move', phaseId: 'p1', toIndex: 99 }, wrong)).toBeNull();
  });
  it('P01 every successful op result parses with ProgramDocument.safeParse', () => none('schema_invalid'));
  it('P02 input documents and op payloads are deep-unchanged (JSON snapshot)', () => { none('input_mutated'); none('op_mutated'); });
  it('P03 every id in every result is unique', () => { none('id_collision'); });
  it('P04 week index, day index, item order and setNo are contiguous after every op', () => none('structure'));
  it('P05 copies get fresh factory ids, exactly one per copied element, never colliding', () => { none('foreign_ids'); none('fresh_id_count'); none('unused_factory_ids'); none('unexpected_new_ids'); none('ids_lost'); });
  it('P06 an op returns a valid doc or throws ProgramEditError, never another error type', () => none('non_edit_error'));
  it('P07 thrown codes are only the documented ones', () => none('undocumented_code'));
  it('P08 valid ops succeed; last_phase/last_week/last_set and not_found fire exactly when the contract says', () => { none('unexpected_error_code'); none('missing_expected_error'); });
  it('P09 move/remove/swap/copyTo/set ops do what the contract says (clamped indices, kept day ids and indexes)', () => none('semantic'));
  it('P10 applyProgramOps(doc, ops) equals sequential applyProgramOp', () => { none('ops_ne_sequential'); none('ops_threw_on_valid_sequence'); });
  it('P11 emptyProgram never throws for valid random options', () => none('emptyProgram_threw'));
});

/* ================================================================ targeted: moves */
describe('T moves clamp at both ends', () => {
  const threePhases = () => run(run(F(), { type: 'phase.add' }), { type: 'phase.add' }); // p1, p2, then 2 added at end
  it('T01 phase.move far beyond the end puts the phase last, far below puts it first, ids unchanged', () => {
    const doc = threePhases();
    const order = doc.phases.map(p => p.id);
    const toEnd = run(doc, { type: 'phase.move', phaseId: order[0]!, toIndex: 10_000 });
    expect(toEnd.phases.map(p => p.id)).toEqual([...order.slice(1), order[0]!]);
    const toStart = run(doc, { type: 'phase.move', phaseId: order[3]!, toIndex: -10_000 });
    expect(toStart.phases.map(p => p.id)).toEqual([order[3]!, ...order.slice(0, 3)]);
  });
  it('T02 phase.move toIndex = n-1 and toIndex = n both land last; toIndex 0 and -1 both land first', () => {
    const doc = threePhases(); const order = doc.phases.map(p => p.id); const n = order.length;
    const last = [...order.slice(1), order[0]!];
    expect(run(doc, { type: 'phase.move', phaseId: order[0]!, toIndex: n - 1 }).phases.map(p => p.id)).toEqual(last);
    expect(run(doc, { type: 'phase.move', phaseId: order[0]!, toIndex: n }).phases.map(p => p.id)).toEqual(last);
    expect(run(doc, { type: 'phase.move', phaseId: order[2]!, toIndex: 0 }).phases.map(p => p.id)).toEqual([order[2]!, order[0]!, order[1]!, order[3]!]);
    expect(run(doc, { type: 'phase.move', phaseId: order[2]!, toIndex: -1 }).phases.map(p => p.id)).toEqual([order[2]!, order[0]!, order[1]!, order[3]!]);
  });
  it('T03 moving a phase to its own index is a no-op', () => {
    const doc = threePhases(); const id = doc.phases[1]!.id;
    expect(run(doc, { type: 'phase.move', phaseId: id, toIndex: 1 })).toEqual(doc);
  });
  it('T04 week.move clamps both ends and renumbers week.index', () => {
    const d0 = run(F(), { type: 'week.add', phaseId: 'p1' }); // w1 w2 new
    const ids = d0.phases[0]!.weeks.map(w => w.id);
    const a = run(d0, { type: 'week.move', phaseId: 'p1', weekId: 'w1', toIndex: 99 });
    expect(a.phases[0]!.weeks.map(w => w.id)).toEqual([ids[1], ids[2], 'w1']);
    expect(a.phases[0]!.weeks.map(w => w.index)).toEqual([0, 1, 2]);
    const b = run(d0, { type: 'week.move', phaseId: 'p1', weekId: ids[2]!, toIndex: -99 });
    expect(b.phases[0]!.weeks.map(w => w.id)).toEqual([ids[2], 'w1', 'w2']);
    expect(b.phases[0]!.weeks.map(w => w.index)).toEqual([0, 1, 2]);
  });
  it('T05 block.move clamps both ends', () => {
    const a = run(F(), { type: 'block.move', dayId: 'd1-0', blockId: 'b1', toIndex: 50 });
    expect(a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks.map(b => b.id)).toEqual(['b2', 'b1']);
    const b = run(a, { type: 'block.move', dayId: 'd1-0', blockId: 'b1', toIndex: -50 });
    expect(b.phases[0]!.weeks[0]!.days[0]!.workout!.blocks.map(x => x.id)).toEqual(['b1', 'b2']);
  });
  it('T06 item.move clamps within a block and renumbers order', () => {
    const a = run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b1', toIndex: 77 });
    expect(a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items.map(i => [i.id, i.order])).toEqual([['i2', 0], ['i1', 1]]);
    const b = run(a, { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b1', toIndex: -3 });
    expect(b.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items.map(i => [i.id, i.order])).toEqual([['i1', 0], ['i2', 1]]);
  });
  it('T07 item.move across blocks clamps to the destination end and renumbers both blocks', () => {
    const a = run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b2', toIndex: 99 });
    const [b1, b2] = a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks;
    expect(b1!.items.map(i => [i.id, i.order])).toEqual([['i2', 0]]);
    expect(b2!.items.map(i => [i.id, i.order])).toEqual([['i3', 0], ['i1', 1]]);
  });
  it('T08 item.move can empty a block (and move into an empty block at any index)', () => {
    const a = run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i3', toBlockId: 'b1', toIndex: 0 });
    expect(a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[1]!.items).toEqual([]);
    expect(a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items.map(i => i.id)).toEqual(['i3', 'i1', 'i2']);
  });
  it('T09 item.move to a block of ANOTHER day is not_found, to an unknown block is not_found, unknown item is not_found', () => {
    expect(codeOf(() => run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b3', toIndex: 0 }))).toBe('not_found');
    expect(codeOf(() => run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'nope', toIndex: 0 }))).toBe('not_found');
    expect(codeOf(() => run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i4', toBlockId: 'b1', toIndex: 0 }))).toBe('not_found');
  });
  it('Q01 move ops with toIndex = +/-Infinity throw index_out_of_range (decided 2026-11-07: only finite integers clamp; JSON cannot carry Infinity)', () => {
    const d = threePhasesQ();
    const first = d.phases[0]!.id;
    expect(codeOf(() => run(d, { type: 'phase.move', phaseId: first, toIndex: Number.POSITIVE_INFINITY }))).toBe('index_out_of_range');
    expect(codeOf(() => run(d, { type: 'phase.move', phaseId: first, toIndex: Number.NEGATIVE_INFINITY }))).toBe('index_out_of_range');
    expect(codeOf(() => run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b1', toIndex: Number.POSITIVE_INFINITY }))).toBe('index_out_of_range');
    // "Move to the end" is a large finite integer, which clamps.
    expect(run(d, { type: 'phase.move', phaseId: first, toIndex: Number.MAX_SAFE_INTEGER }).phases.at(-1)!.id).toBe(first);
  });
  it('T10 NaN / fractional toIndex throws index_out_of_range (pinned: documented code, only reachable this way)', () => {
    const d = threePhasesQ();
    expect(codeOf(() => run(d, { type: 'phase.move', phaseId: d.phases[0]!.id, toIndex: Number.NaN }))).toBe('index_out_of_range');
    expect(codeOf(() => run(d, { type: 'block.move', dayId: 'd1-0', blockId: 'b1', toIndex: 0.5 }))).toBe('index_out_of_range');
    expect(codeOf(() => run(F(), { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b1', toIndex: 1.5 }))).toBe('index_out_of_range');
  });
  function threePhasesQ() { return run(F(), { type: 'phase.add' }); }
});

/* ============================================================ targeted: removals */
describe('T protected removals', () => {
  it('T11 removing the only phase throws last_phase and the unknown id in a one-phase doc throws not_found', () => {
    const one = emptyProgram(ctx(), { weeks: 1 });
    expect(codeOf(() => run(one, { type: 'phase.remove', phaseId: one.phases[0]!.id }))).toBe('last_phase');
    expect(codeOf(() => run(one, { type: 'phase.remove', phaseId: 'ghost' }))).toBe('not_found');
  });
  it('T12 phase.remove of a middle phase keeps others and their order', () => {
    const d = run(run(F(), { type: 'phase.add' }), { type: 'phase.add' });
    const ids = d.phases.map(p => p.id);
    expect(run(d, { type: 'phase.remove', phaseId: ids[1]! }).phases.map(p => p.id)).toEqual([ids[0], ids[2], ids[3]]);
  });
  it('T13 week.remove of the last week of a phase throws last_week, even when other phases have many weeks', () => {
    expect(codeOf(() => run(F(), { type: 'week.remove', phaseId: 'p2', weekId: 'w3' }))).toBe('last_week');
    const a = run(F(), { type: 'week.remove', phaseId: 'p1', weekId: 'w1' });
    expect(a.phases[0]!.weeks.map(w => [w.id, w.index])).toEqual([['w2', 0]]);
  });
  it('T14 week.remove with a weekId that belongs to a different phase is not_found', () => {
    expect(codeOf(() => run(F(), { type: 'week.remove', phaseId: 'p1', weekId: 'w3' }))).toBe('not_found');
  });
  it('T15 set.remove of the last set throws last_set; middle removal renumbers to 1..n', () => {
    expect(codeOf(() => run(F(), { type: 'set.remove', dayId: 'd1-0', itemId: 'i3', setNo: 1 }))).toBe('last_set');
    const a = run(F(), { type: 'set.remove', dayId: 'd1-0', itemId: 'i1', setNo: 2 });
    expect(itemOf(a, 'i1').item.sets.map(s => s.setNo)).toEqual([1, 2]);
    expect(itemOf(a, 'i1').item.sets[1]!.reps).toBe('8');
  });
  it('T16 set.remove of the last remaining set keeps order of remaining sets (remove set 1 of 3 keeps the data of old 2 and 3)', () => {
    const d = run(run(F(), { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 2, patch: { reps: 'two' } }), { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 3, patch: { reps: 'three' } });
    const a = run(d, { type: 'set.remove', dayId: 'd1-0', itemId: 'i1', setNo: 1 });
    expect(itemOf(a, 'i1').item.sets.map(s => [s.setNo, s.reps])).toEqual([[1, 'two'], [2, 'three']]);
  });
  it('T17 removing every block of a workout is allowed and keeps the workout', () => {
    const a = run(run(F(), { type: 'block.remove', dayId: 'd1-1', blockId: 'b3' }), { type: 'block.add', dayId: 'd1-1', kind: 'main' });
    expect(dayOf(a, 'd1-1').workout!.blocks).toHaveLength(1);
  });
  it('T18 block.remove / item.remove renumber item order', () => {
    const a = run(F(), { type: 'item.remove', dayId: 'd1-0', itemId: 'i1' });
    expect(a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items.map(i => [i.id, i.order])).toEqual([['i2', 0]]);
  });
});

/* ============================================================= targeted: day ops */
describe('T day operations', () => {
  it('T19 day.swap with itself leaves the document unchanged (same ids, same content)', () => {
    expect(run(F(), { type: 'day.swap', dayIdA: 'd1-0', dayIdB: 'd1-0' })).toEqual(F());
    expect(run(F(), { type: 'day.swap', dayIdA: 'd1-3', dayIdB: 'd1-3' })).toEqual(F());
  });
  it('T20 day.swap exchanges kind and workout, keeps each day id and index, works across weeks and with a rest day', () => {
    const a = run(F(), { type: 'day.swap', dayIdA: 'd1-0', dayIdB: 'd2-4' });
    expect(dayOf(a, 'd1-0')).toMatchObject({ id: 'd1-0', index: 0, kind: 'rest' });
    expect(dayOf(a, 'd1-0').workout).toBeUndefined();
    expect(dayOf(a, 'd2-4')).toMatchObject({ id: 'd2-4', index: 4, kind: 'training' });
    expect(dayOf(a, 'd2-4').workout!.id).toBe('wk1');
    expect(allIds(a).sort()).toEqual(allIds(F()).sort());
  });
  it('T21 day.swap between two workout days swaps the workouts both ways', () => {
    const a = run(F(), { type: 'day.swap', dayIdA: 'd1-0', dayIdB: 'd1-1' });
    expect(dayOf(a, 'd1-0')).toMatchObject({ kind: 'active_recovery' }); expect(dayOf(a, 'd1-0').workout!.id).toBe('wk2');
    expect(dayOf(a, 'd1-1')).toMatchObject({ kind: 'training' }); expect(dayOf(a, 'd1-1').workout!.id).toBe('wk1');
  });
  it('Q02 day.swap moves the day note with kind and workout (decided 2026-11-07: a day note describes that day\'s contents)', () => {
    const f = F();
    const a = run(f, { type: 'day.swap', dayIdA: 'd1-3', dayIdB: 'd1-4' });
    expect(dayOf(a, 'd1-4').note).toEqual({ en: 'rest note' });
    expect(dayOf(a, 'd1-3').note).toBeUndefined();
    expect(dayOf(a, 'd1-4').kind).toBe(dayOf(f, 'd1-3').kind);
  });
  it('T22 day.copyTo copies kind + workout to two targets with distinct fresh ids and leaves the source alone', () => {
    const a = run(F(), { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-4', 'd1-5'] });
    expect(dayOf(a, 'd1-0')).toEqual(dayOf(F(), 'd1-0'));
    const w4 = dayOf(a, 'd1-4').workout!, w5 = dayOf(a, 'd1-5').workout!;
    expect(stripIds(w4)).toEqual(stripIds(dayOf(F(), 'd1-0').workout));
    expect(stripIds(w5)).toEqual(stripIds(w4));
    const both = [...allIds(w4), ...allIds(w5), ...allIds(dayOf(F(), 'd1-0').workout)];
    expect(new Set(both).size).toBe(both.length);
    expect(dayOf(a, 'd1-4')).toMatchObject({ id: 'd1-4', index: 4, kind: 'training' });
  });
  it('T23 day.copyTo overwrites a non-rest target (kind and whole workout) and keeps the target note', () => {
    const f = F();
    const a = run(f, { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-1'] });
    expect(dayOf(a, 'd1-1').kind).toBe('training');
    expect(stripIds(dayOf(a, 'd1-1').workout)).toEqual(stripIds(dayOf(f, 'd1-0').workout));
    const noteTarget = run(run(f, { type: 'day.update', dayId: 'd1-4', patch: { note: { en: 'mine' } } }), { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-4'] });
    expect(dayOf(noteTarget, 'd1-4').note).toEqual({ en: 'mine' });
  });
  it('T24 day.copyTo from a rest day onto a training day makes it a rest day with no workout', () => {
    const a = run(F(), { type: 'day.copyTo', fromDayId: 'd1-5', toDayIds: ['d1-0'] });
    expect(dayOf(a, 'd1-0').kind).toBe('rest');
    expect(dayOf(a, 'd1-0').workout).toBeUndefined();
  });
  it('T25 day.copyTo with duplicated target ids copies once; empty target list is a no-op; unknown target throws not_found', () => {
    const c = counter();
    const a = applyProgramOp(F(), { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-4', 'd1-4'] }, c.ctx);
    expect(allIds(dayOf(a, 'd1-4').workout).length).toBe(c.n);
    expect(run(F(), { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: [] })).toEqual(F());
    expect(codeOf(() => run(F(), { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-4', 'ghost'] }))).toBe('not_found');
    expect(codeOf(() => run(F(), { type: 'day.copyTo', fromDayId: 'ghost', toDayIds: ['d1-4'] }))).toBe('not_found');
  });
  it('T26 day.copyTo onto the source plus another target: both targets show the SOURCE\'s original content', () => {
    const f = F();
    const a = run(f, { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-0', 'd1-4'] });
    expect(stripIds(dayOf(a, 'd1-0'))).toEqual(stripIds(dayOf(f, 'd1-0')));
    expect(stripIds(dayOf(a, 'd1-4').workout)).toEqual(stripIds(dayOf(f, 'd1-0').workout));
    const ids = allIds(a); expect(new Set(ids).size).toBe(ids.length);
  });
  it('Q03 day.copyTo onto itself is a no-op, so the day keeps its workout ids (decided 2026-11-07)', () => {
    // Reading A (code today): "copies ... (new ids) onto each target" taken literally, the workout gets fresh ids.
    // Reading B: copying a day onto itself is a no-op, so the document equals the input.
    const f = F();
    expect(run(f, { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-0'] })).toEqual(f);
  });
  it('T27 day.setKind matrix: workout creation, deletion and retention exactly as the contract says', () => {
    const f = F();
    const toTraining = run(f, { type: 'day.setKind', dayId: 'd1-5', kind: 'training' });
    const w = dayOf(toTraining, 'd1-5').workout!;
    expect(w.name).toEqual({ ar: 'تمرين', en: 'Workout' });
    expect(w.blocks).toHaveLength(1);
    expect(w.blocks[0]).toMatchObject({ kind: 'main', items: [] });
    expect(new Set(allIds(w)).size).toBe(2);
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-0', kind: 'training' }), 'd1-0')).toEqual(dayOf(f, 'd1-0')); // existing workout untouched
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-0', kind: 'rest' }), 'd1-0').workout).toBeUndefined();
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-0', kind: 'active_recovery' }), 'd1-0').workout?.id).toBe('wk1');
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-1', kind: 'rest' }), 'd1-1').workout).toBeUndefined();
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-5', kind: 'active_recovery' }), 'd1-5').workout).toBeUndefined();
    expect(dayOf(run(f, { type: 'day.setKind', dayId: 'd1-1', kind: 'training' }), 'd1-1').workout!.id).toBe('wk2');
  });
  it('T28 day.clear gives a rest day with no workout; clearing a rest day is a no-op', () => {
    const a = run(F(), { type: 'day.clear', dayId: 'd1-0' });
    expect(dayOf(a, 'd1-0')).toEqual({ id: 'd1-0', index: 0, kind: 'rest' });
    expect(run(F(), { type: 'day.clear', dayId: 'd1-5' })).toEqual(F());
  });
  it('T29 day.update note set then null removes it', () => {
    const a = run(F(), { type: 'day.update', dayId: 'd1-5', patch: { note: { en: 'x' } } });
    expect(dayOf(a, 'd1-5').note).toEqual({ en: 'x' });
    const b = run(a, { type: 'day.update', dayId: 'd1-5', patch: { note: null } });
    expect(dayOf(b, 'd1-5')).not.toHaveProperty('note');
    expect(dayOf(run(a, { type: 'day.update', dayId: 'd1-5', patch: { note: undefined } }), 'd1-5').note).toEqual({ en: 'x' });
  });
  it('T30 day ops with a week id or an item id in place of a day id throw not_found', () => {
    expect(codeOf(() => run(F(), { type: 'day.clear', dayId: 'w1' }))).toBe('not_found');
    expect(codeOf(() => run(F(), { type: 'day.setKind', dayId: 'i1', kind: 'rest' }))).toBe('not_found');
  });
});

/* ===================================================== targeted: items, sets, blocks */
describe('T items, sets, blocks, workouts', () => {
  it('T31 item.replaceExercise keeps id, order, sets, notes, progression rule, alternatives', () => {
    const f = F();
    const a = run(f, { type: 'item.replaceExercise', dayId: 'd1-0', itemId: 'i1', exerciseId: 'ex-new' });
    expect(itemOf(a, 'i1').item).toEqual({ ...itemOf(f, 'i1').item, exerciseId: 'ex-new' });
  });
  it('T32 item.replaceExercise with an empty or 65-char exercise id is invalid_op', () => {
    expect(codeOf(() => run(F(), { type: 'item.replaceExercise', dayId: 'd1-0', itemId: 'i1', exerciseId: '' }))).toBe('invalid_op');
    expect(codeOf(() => run(F(), { type: 'item.replaceExercise', dayId: 'd1-0', itemId: 'i1', exerciseId: 'x'.repeat(65) }))).toBe('invalid_op');
  });
  it('T33 set.applyToAll patches every set, keeps setNo; null removes; undefined leaves; empty patch no-op', () => {
    const f = F();
    const a = run(f, { type: 'set.applyToAll', dayId: 'd1-0', itemId: 'i1', patch: { reps: '12', restSec: 90, rpe: 8 } });
    expect(itemOf(a, 'i1').item.sets).toEqual([1, 2, 3].map(n => ({ setNo: n, reps: '12', load: { value: 20, unit: 'kg' }, restSec: 90, rpe: 8, note: { en: 'sn' } })));
    const b = run(a, { type: 'set.applyToAll', dayId: 'd1-0', itemId: 'i1', patch: bad({ load: null, note: null, reps: undefined }) });
    for (const s of itemOf(b, 'i1').item.sets) { expect(s).not.toHaveProperty('load'); expect(s).not.toHaveProperty('note'); expect(s.reps).toBe('12'); }
    expect(run(f, { type: 'set.applyToAll', dayId: 'd1-0', itemId: 'i1', patch: {} })).toEqual(f);
  });
  it('T34 set.applyToAll with an out-of-range value throws invalid_op and changes nothing', () => {
    expect(codeOf(() => run(F(), { type: 'set.applyToAll', dayId: 'd1-0', itemId: 'i1', patch: { rpe: 11 } }))).toBe('invalid_op');
    expect(codeOf(() => run(F(), { type: 'set.applyToAll', dayId: 'd1-0', itemId: 'i1', patch: { reps: 'x'.repeat(33) } }))).toBe('invalid_op');
  });
  it('T35 set.update touches only the addressed set; null removes a field; unknown or zero setNo is not_found', () => {
    const f = F();
    const a = run(f, { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 2, patch: bad({ reps: null, rir: 2 }) });
    expect(itemOf(a, 'i1').item.sets[1]).toEqual({ setNo: 2, load: { value: 20, unit: 'kg' }, restSec: 60, note: { en: 'sn' }, rir: 2 });
    expect(itemOf(a, 'i1').item.sets[0]).toEqual(itemOf(f, 'i1').item.sets[0]);
    expect(codeOf(() => run(f, { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 4, patch: {} }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 0, patch: {} }))).toBe('not_found');
  });
  it('T36 set.add default copies the last set with setNo n+1; copyLast:false gives a bare set; copy is independent of the original', () => {
    const f = F();
    const a = run(f, { type: 'set.add', dayId: 'd1-0', itemId: 'i1' });
    const sets = itemOf(a, 'i1').item.sets;
    expect(sets).toHaveLength(4);
    expect(sets[3]).toEqual({ ...sets[2]!, setNo: 4 });
    expect(sets[3]).toMatchObject({ reps: '8', load: { value: 20, unit: 'kg' } });
    const b = run(f, { type: 'set.add', dayId: 'd1-0', itemId: 'i1', copyLast: false });
    expect(itemOf(b, 'i1').item.sets[3]).toEqual({ setNo: 4 });
    const c = run(a, { type: 'set.update', dayId: 'd1-0', itemId: 'i1', setNo: 4, patch: { load: { value: 99, unit: 'kg' } } });
    expect(itemOf(c, 'i1').item.sets[2]!.load).toEqual({ value: 20, unit: 'kg' });
  });
  it('T37 item.add defaults to 3 sets, copies template into every set (setNo wins over template), appends with order = length', () => {
    const f = F();
    const a = run(f, { type: 'item.add', dayId: 'd1-0', blockId: 'b1', exerciseId: 'ex-n', template: bad({ reps: '5', load: { value: 60, unit: 'kg' }, setNo: 42 }) });
    const it = itemOf(a, new Set(NEW(f, a)).values().next().value as string).item;
    expect(it.order).toBe(2); expect(it.exerciseId).toBe('ex-n');
    expect(it.sets).toEqual([1, 2, 3].map(n => ({ setNo: n, reps: '5', load: { value: 60, unit: 'kg' } })));
    const one = run(f, { type: 'item.add', dayId: 'd1-0', blockId: 'b2', exerciseId: 'ex-n', sets: 1 });
    expect(itemOf(one, NEW(f, one)[0]!).item.sets).toEqual([{ setNo: 1 }]);
  });
  it('T38 item.add rejects 0, negative, fractional and NaN set counts with invalid_op', () => {
    for (const sets of [0, -1, 1.5, Number.NaN]) expect(codeOf(() => run(F(), { type: 'item.add', dayId: 'd1-0', blockId: 'b1', exerciseId: 'e', sets }))).toBe('invalid_op');
  });
  it('T39 item.add template: the same load object is not shared between sets in the result', () => {
    const a = run(F(), { type: 'item.add', dayId: 'd1-0', blockId: 'b1', exerciseId: 'ex-n', template: { load: { value: 60, unit: 'kg' } } });
    const it = itemOf(a, NEW(F(), a)[0]!).item;
    expect(it.sets[0]!.load).not.toBe(it.sets[1]!.load);
  });
  it('T40 item.update sets and removes optional fields; invalid rule is invalid_op; empty alternatives array allowed', () => {
    const f = F();
    const a = run(f, { type: 'item.update', dayId: 'd1-0', itemId: 'i1', patch: { progressionRule: null, coachNote: null, alternatives: null } });
    const it = itemOf(a, 'i1').item;
    expect(it).not.toHaveProperty('progressionRule'); expect(it).not.toHaveProperty('coachNote'); expect(it).not.toHaveProperty('alternatives');
    expect(itemOf(run(f, { type: 'item.update', dayId: 'd1-0', itemId: 'i2', patch: { alternatives: [] } }), 'i2').item.alternatives).toEqual([]);
    expect(codeOf(() => run(f, { type: 'item.update', dayId: 'd1-0', itemId: 'i1', patch: bad({ progressionRule: { type: 'speed', threshold: 1, step: 1 } }) }))).toBe('invalid_op');
    expect(codeOf(() => run(f, { type: 'item.update', dayId: 'd1-0', itemId: 'i1', patch: { alternatives: [''] } }))).toBe('invalid_op');
  });
  it('T41 item.duplicate inserts right after the source with a fresh id and deep-copied sets; later orders shift', () => {
    const f = F();
    const a = run(f, { type: 'item.duplicate', dayId: 'd1-0', itemId: 'i1' });
    const items = a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items;
    expect(items.map(i => i.order)).toEqual([0, 1, 2]);
    expect(items[0]!.id).toBe('i1'); expect(items[2]!.id).toBe('i2');
    expect(items[1]!.id).not.toBe('i1');
    expect(stripIds(items[1])).toEqual(stripIds({ ...items[0]!, order: 1 }));
    expect(items[1]!.sets[0]!.load).not.toBe(items[0]!.sets[0]!.load);
  });
  it('T42 block.add: default position is the end, afterBlockId inserts after it, unknown after id is not_found, rest day is not_found', () => {
    const f = F();
    const a = run(f, { type: 'block.add', dayId: 'd1-0', kind: 'warmup', name: { en: 'WU' } });
    expect(dayOf(a, 'd1-0').workout!.blocks.map(b => b.id).slice(0, 2)).toEqual(['b1', 'b2']);
    expect(dayOf(a, 'd1-0').workout!.blocks[2]).toMatchObject({ kind: 'warmup', name: { en: 'WU' }, items: [] });
    const b = run(f, { type: 'block.add', dayId: 'd1-0', kind: 'cardio', afterBlockId: 'b1' });
    expect(dayOf(b, 'd1-0').workout!.blocks.map(x => x.id)[2]).toBe('b2');
    expect(dayOf(b, 'd1-0').workout!.blocks[1]!.kind).toBe('cardio');
    expect(codeOf(() => run(f, { type: 'block.add', dayId: 'd1-0', kind: 'main', afterBlockId: 'zz' }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'block.add', dayId: 'd1-5', kind: 'main' }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'block.add', dayId: 'd1-0', kind: bad('yoga') }))).toBe('invalid_op');
  });
  it('T43 block.update null removes name/rounds/restBetweenRoundsSec/note; kind changes; rounds 0 is invalid_op', () => {
    const a = run(F(), { type: 'block.update', dayId: 'd1-0', blockId: 'b1', patch: { name: null, rounds: null, restBetweenRoundsSec: null, note: null, kind: 'circuit' } });
    const b = dayOf(a, 'd1-0').workout!.blocks[0]!;
    expect(b).toEqual({ id: 'b1', kind: 'circuit', items: dayOf(F(), 'd1-0').workout!.blocks[0]!.items });
    expect(codeOf(() => run(F(), { type: 'block.update', dayId: 'd1-0', blockId: 'b1', patch: { rounds: 0 } }))).toBe('invalid_op');
  });
  it('T44 workout.update sets name/estimatedMinutes/note; null removes; 0 minutes invalid_op; day without workout not_found', () => {
    const a = run(F(), { type: 'workout.update', dayId: 'd1-0', patch: { name: { en: 'Z' }, estimatedMinutes: null, note: null } });
    const w = dayOf(a, 'd1-0').workout!;
    expect(w.name).toEqual({ en: 'Z' }); expect(w).not.toHaveProperty('estimatedMinutes'); expect(w).not.toHaveProperty('note');
    expect(codeOf(() => run(F(), { type: 'workout.update', dayId: 'd1-0', patch: { estimatedMinutes: 0 } }))).toBe('invalid_op');
    expect(codeOf(() => run(F(), { type: 'workout.update', dayId: 'd1-5', patch: { name: { en: 'n' } } }))).toBe('not_found');
  });
  it('T46 block.insert into a workout day: fresh ids for block + items, content identical, position after afterBlockId', () => {
    const f = F();
    const src = clone(dayOf(f, 'd1-0').workout!.blocks[0]!); // ids collide with live ids on purpose
    const c = counter();
    const a = applyProgramOp(freeze(clone(f)), freeze({ type: 'block.insert', dayId: 'd1-0', block: src, afterBlockId: 'b1' } as ProgramOp), c.ctx);
    const blocks = dayOf(a, 'd1-0').workout!.blocks;
    expect(blocks.map(b => b.id)[0]).toBe('b1'); expect(blocks[1]!.id).not.toBe('b1'); expect(blocks[2]!.id).toBe('b2');
    expect(c.n).toBe(1 + src.items.length);
    expect(stripIds(blocks[1])).toEqual(stripIds(src));
    const ids = allIds(a); expect(new Set(ids).size).toBe(ids.length);
    expect(blocks[1]!.items.every((it, i) => it.order === i)).toBe(true);
  });
  it('T47 block.insert: later edits of the inserted copy never touch the master block object the caller still holds', () => {
    const f = F(); const master = clone(dayOf(f, 'd1-0').workout!.blocks[0]!); const snap = JSON.stringify(master);
    const a = run(f, { type: 'block.insert', dayId: 'd1-0', block: master });
    const newBlock = NEW(f, a).find(i => dayOf(a, 'd1-0').workout!.blocks.some(b => b.id === i))!;
    run(a, { type: 'set.applyToAll', dayId: 'd1-0', itemId: dayOf(a, 'd1-0').workout!.blocks.find(b => b.id === newBlock)!.items[0]!.id, patch: { reps: '99' } });
    expect(JSON.stringify(master)).toBe(snap);
  });
  it('T48 block.insert with a stale order/setNo block renumbers; invalid block is invalid_op; unknown after id not_found', () => {
    const f = F();
    const blk = { id: 'x', kind: 'main', items: [{ id: 'xi1', exerciseId: 'e', order: 9, sets: [{ setNo: 7 }, { setNo: 7 }] }, { id: 'xi2', exerciseId: 'e', order: 9, sets: [{ setNo: 3 }] }] } as WorkoutBlock;
    const a = run(f, { type: 'block.insert', dayId: 'd1-0', block: blk });
    const ins = dayOf(a, 'd1-0').workout!.blocks[2]!;
    expect(ins.items.map(i => i.order)).toEqual([0, 1]);
    expect(ins.items[0]!.sets.map(s => s.setNo)).toEqual([1, 2]);
    expect(codeOf(() => run(f, { type: 'block.insert', dayId: 'd1-0', block: bad({ id: 'x', kind: 'nope', items: [] }) }))).toBe('invalid_op');
    expect(codeOf(() => run(f, { type: 'block.insert', dayId: 'd1-0', block: blk, afterBlockId: 'ghost' }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'block.insert', dayId: 'd1-5', block: blk }))).toBe('not_found');
  });
});

/* ====================================================== targeted: phases and weeks */
describe('T phases and weeks', () => {
  it('T49 phase.duplicate sits right after the source, identical content, every id new, source untouched, indexes intact', () => {
    const f = F();
    const c = counter();
    const a = applyProgramOp(f, { type: 'phase.duplicate', phaseId: 'p1' }, c.ctx);
    expect(a.phases.map(p => p.id)[0]).toBe('p1'); expect(a.phases[2]!.id).toBe('p2');
    expect(a.phases[0]).toEqual(f.phases[0]);
    expect(stripIds(a.phases[1])).toEqual(stripIds(f.phases[0]));
    expect(c.n).toBe(allIds(f.phases[0]).length);
    expect(a.phases[1]!.weeks.map(w => w.index)).toEqual([0, 1]);
  });
  it('T50 phase.add defaults: one all-rest week with 7 days, positioned at the end or after afterPhaseId', () => {
    const f = F();
    const end = run(f, { type: 'phase.add' });
    expect(end.phases).toHaveLength(3);
    const p = end.phases[2]!;
    expect(p.weeks).toHaveLength(1); expect(p.weeks[0]!.days).toHaveLength(7);
    expect(p.weeks[0]!.days.every(d => d.kind === 'rest' && !d.workout)).toBe(true);
    const mid = run(f, { type: 'phase.add', afterPhaseId: 'p1', name: { en: 'Mid' }, weeks: 3 });
    expect(mid.phases.map(x => x.id)[0]).toBe('p1'); expect(mid.phases[1]!.name).toEqual({ en: 'Mid' }); expect(mid.phases[1]!.weeks).toHaveLength(3);
    expect(mid.phases[2]!.id).toBe('p2');
    expect(mid.phases[1]!.weeks.map(w => w.index)).toEqual([0, 1, 2]);
  });
  it('T51 phase.add: weeks 0 / negative / fractional is invalid_op; unknown afterPhaseId is not_found', () => {
    for (const weeks of [0, -2, 1.2]) expect(codeOf(() => run(F(), { type: 'phase.add', weeks }))).toBe('invalid_op');
    expect(codeOf(() => run(F(), { type: 'phase.add', afterPhaseId: 'nope' }))).toBe('not_found');
  });
  it('T52 phase.update: goal null removes, name cannot be emptied', () => {
    const a = run(F(), { type: 'phase.update', phaseId: 'p1', patch: { goal: null } });
    expect(a.phases[0]).not.toHaveProperty('goal');
    expect(codeOf(() => run(F(), { type: 'phase.update', phaseId: 'p1', patch: { name: {} } }))).toBe('invalid_op');
    expect(codeOf(() => run(F(), { type: 'phase.update', phaseId: 'p1', patch: { name: { ar: '  ', en: '' } } }))).toBe('invalid_op');
  });
  it('T53 week.add with copyFromWeekId copies workouts with new ids (also from another phase), inserted after afterWeekId', () => {
    const f = F(); const c = counter();
    const a = applyProgramOp(f, { type: 'week.add', phaseId: 'p2', copyFromWeekId: 'w1' }, c.ctx);
    const copied = a.phases[1]!.weeks[1]!;
    expect(stripIds({ ...copied, index: 0 })).toEqual(stripIds(f.phases[0]!.weeks[0]));
    expect(c.n).toBe(allIds(f.phases[0]!.weeks[0]).length);
    const b = run(f, { type: 'week.add', phaseId: 'p1', afterWeekId: 'w1', copyFromWeekId: 'w2' });
    expect(b.phases[0]!.weeks.map(w => w.id)[0]).toBe('w1'); expect(b.phases[0]!.weeks[1]!.isDeload).toBe(true); expect(b.phases[0]!.weeks[2]!.id).toBe('w2');
    expect(codeOf(() => run(f, { type: 'week.add', phaseId: 'p1', copyFromWeekId: 'ghost' }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'week.add', phaseId: 'p1', afterWeekId: 'w3' }))).toBe('not_found');
    expect(codeOf(() => run(f, { type: 'week.add', phaseId: 'ghost' }))).toBe('not_found');
  });
  it('T54 week.add without copy adds a blank all-rest week at the end', () => {
    const a = run(F(), { type: 'week.add', phaseId: 'p1' });
    const w = a.phases[0]!.weeks[2]!;
    expect(w.index).toBe(2); expect(w.days.map(d => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(w.days.every(d => d.kind === 'rest' && !d.workout)).toBe(true);
    expect(w).not.toHaveProperty('isDeload');
  });
  it('T55 week.duplicate sits right after the source, keeps isDeload/note, renumbers the following weeks', () => {
    const f = F();
    const a = run(f, { type: 'week.duplicate', phaseId: 'p1', weekId: 'w1' });
    expect(a.phases[0]!.weeks.map(w => w.index)).toEqual([0, 1, 2]);
    expect(a.phases[0]!.weeks[2]!.id).toBe('w2');
    const b = run(f, { type: 'week.duplicate', phaseId: 'p1', weekId: 'w2' });
    expect(b.phases[0]!.weeks[2]).toMatchObject({ isDeload: true, note: { en: 'deload' } });
    expect(codeOf(() => run(f, { type: 'week.duplicate', phaseId: 'p1', weekId: 'w3' }))).toBe('not_found');
  });
  it('T56 week.update isDeload/note set and removed', () => {
    const a = run(F(), { type: 'week.update', phaseId: 'p1', weekId: 'w2', patch: { note: null } });
    expect(a.phases[0]!.weeks[1]).not.toHaveProperty('note'); expect(a.phases[0]!.weeks[1]!.isDeload).toBe(true);
    const b = run(F(), { type: 'week.update', phaseId: 'p1', weekId: 'w1', patch: { isDeload: false, note: { en: 'n' } } });
    expect(b.phases[0]!.weeks[0]).toMatchObject({ isDeload: false, note: { en: 'n' } });
  });
});

/* ============================================================== targeted: meta etc. */
describe('T meta, batch ops, factory, errors', () => {
  it('T57 meta.update sets every field, null removes each, undefined leaves, order violations are not rejected here', () => {
    const f = F();
    const a = run(f, { type: 'meta.update', patch: { startDate: '2026-03-01', reviewDate: '2026-02-01', endDate: '2026-01-01', goal: { en: 'g' }, notes: { ar: 'ن' } } });
    expect(a).toMatchObject({ startDate: '2026-03-01', reviewDate: '2026-02-01', endDate: '2026-01-01', goal: { en: 'g' }, notes: { ar: 'ن' } });
    const b = run(a, { type: 'meta.update', patch: { reviewDate: null, goal: null, startDate: undefined } });
    expect(b).not.toHaveProperty('reviewDate'); expect(b).not.toHaveProperty('goal'); expect(b.startDate).toBe('2026-03-01'); expect(b.endDate).toBe('2026-01-01');
    const c = run(b, { type: 'meta.update', patch: { startDate: null, endDate: null, notes: null } });
    expect(c).toEqual(f);
  });
  it('T58 meta.update with an impossible calendar date or wrong format is invalid_op', () => {
    for (const startDate of ['2026-02-30', '2026-13-01', '01/02/2026', '2026-1-1', '']) expect(codeOf(() => run(F(), { type: 'meta.update', patch: { startDate } }))).toBe('invalid_op');
  });
  it('T59 applyProgramOps equals sequential application with the same factory state and does not touch the input', () => {
    const f = freeze(F());
    const ops: ProgramOp[] = [
      { type: 'week.add', phaseId: 'p1', copyFromWeekId: 'w1' }, { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-5', 'd2-5'] },
      { type: 'phase.duplicate', phaseId: 'p2' }, { type: 'set.add', dayId: 'd1-0', itemId: 'i1' }, { type: 'meta.update', patch: { startDate: '2026-01-01' } },
    ];
    const c1 = counter(), c2 = counter();
    const viaOps = applyProgramOps(f, ops, c1.ctx);
    let seq: Doc = f; for (const op of ops) seq = applyProgramOp(seq, op, c2.ctx);
    expect(viaOps).toEqual(seq); expect(c1.n).toBe(c2.n);
  });
  it('T60 applyProgramOps stops at the first failing op: throws that op\'s error, input unchanged, later ops never run', () => {
    const f = freeze(F()); const c = counter();
    const ops: ProgramOp[] = [{ type: 'phase.add' }, { type: 'week.remove', phaseId: 'p2', weekId: 'w3' }, { type: 'phase.add' }, { type: 'day.clear', dayId: 'ghost' }];
    expect(codeOf(() => applyProgramOps(f, ops, c.ctx))).toBe('last_week');
    expect(c.n).toBe(9); // only the first op minted ids: phase + week + 7 days
  });
  it('T61 applyProgramOps with an empty list returns an equal document; with a failing second op the first op\'s effect is not returned', () => {
    expect(applyProgramOps(F(), [], ctx())).toEqual(F());
    expect(codeOf(() => applyProgramOps(F(), [{ type: 'phase.add' }, { type: 'phase.remove', phaseId: 'ghost' }], ctx()))).toBe('not_found');
  });
  it('T62 unknown op type is invalid_op', () => {
    expect(codeOf(() => run(F(), bad({ type: 'phase.explode' })))).toBe('invalid_op');
    expect(codeOf(() => run(F(), bad({ type: 'meta.update_all', patch: {} })))).toBe('invalid_op');
  });
  it('T63 not_found for an unknown id in every id-taking op', () => {
    const g = 'ghost';
    const ops: ProgramOp[] = [
      { type: 'phase.update', phaseId: g, patch: {} }, { type: 'phase.remove', phaseId: g }, { type: 'phase.move', phaseId: g, toIndex: 0 }, { type: 'phase.duplicate', phaseId: g },
      { type: 'week.add', phaseId: g }, { type: 'week.remove', phaseId: 'p1', weekId: g }, { type: 'week.duplicate', phaseId: 'p1', weekId: g }, { type: 'week.move', phaseId: 'p1', weekId: g, toIndex: 0 }, { type: 'week.update', phaseId: 'p1', weekId: g, patch: {} },
      { type: 'day.setKind', dayId: g, kind: 'rest' }, { type: 'day.update', dayId: g, patch: {} }, { type: 'day.copyTo', fromDayId: g, toDayIds: [] }, { type: 'day.swap', dayIdA: g, dayIdB: 'd1-0' }, { type: 'day.swap', dayIdA: 'd1-0', dayIdB: g }, { type: 'day.clear', dayId: g },
      { type: 'workout.update', dayId: g, patch: {} }, { type: 'block.add', dayId: g, kind: 'main' }, { type: 'block.update', dayId: 'd1-0', blockId: g, patch: {} }, { type: 'block.remove', dayId: 'd1-0', blockId: g }, { type: 'block.move', dayId: 'd1-0', blockId: g, toIndex: 0 },
      { type: 'item.add', dayId: 'd1-0', blockId: g, exerciseId: 'e' }, { type: 'item.update', dayId: 'd1-0', itemId: g, patch: {} }, { type: 'item.replaceExercise', dayId: 'd1-0', itemId: g, exerciseId: 'e' }, { type: 'item.remove', dayId: 'd1-0', itemId: g }, { type: 'item.duplicate', dayId: 'd1-0', itemId: g },
      { type: 'set.add', dayId: 'd1-0', itemId: g }, { type: 'set.update', dayId: 'd1-0', itemId: g, setNo: 1, patch: {} }, { type: 'set.remove', dayId: 'd1-0', itemId: g, setNo: 1 }, { type: 'set.applyToAll', dayId: 'd1-0', itemId: g, patch: {} },
    ];
    const wrong = ops.filter(op => codeOf(() => run(F(), op)) !== 'not_found').map(o => o.type);
    expect(wrong).toEqual([]);
  });
  it('T64 an item id from another day is not_found for item/set ops', () => {
    expect(codeOf(() => run(F(), { type: 'item.remove', dayId: 'd1-1', itemId: 'i1' }))).toBe('not_found');
    expect(codeOf(() => run(F(), { type: 'set.add', dayId: 'd1-1', itemId: 'i1' }))).toBe('not_found');
  });
  it('T65 results share no mutable state with the input or the op payload', () => {
    const f = F(); const patch = { name: { en: 'Z' } };
    const a = applyProgramOp(f, { type: 'phase.update', phaseId: 'p1', patch }, ctx());
    patch.name.en = 'changed after';
    expect(a.phases[0]!.name).toEqual({ en: 'Z' });
    (a.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items[0]!.sets[0]!.load as any).value = 999;
    expect(itemOf(f, 'i1').item.sets[0]!.load!.value).toBe(20);
    const tpl = { load: { value: 5, unit: 'kg' as const } };
    const b = applyProgramOp(f, { type: 'item.add', dayId: 'd1-0', blockId: 'b1', exerciseId: 'e', template: tpl }, ctx());
    tpl.load.value = 777;
    expect(itemOf(b, NEW(f, b)[0]!).item.sets[0]!.load!.value).toBe(5);
  });
  it('T66 same doc + same op + same counter state gives an identical result (pure)', () => {
    const op: ProgramOp = { type: 'phase.duplicate', phaseId: 'p1' };
    expect(applyProgramOp(F(), op, counter().ctx)).toEqual(applyProgramOp(F(), op, counter().ctx));
  });
  it('T67 an id factory that repeats, returns an input id, an empty string or an over-long id fails with ProgramEditError invalid_op', () => {
    const op: ProgramOp = { type: 'week.add', phaseId: 'p1' };
    expect(codeOf(() => applyProgramOp(F(), op, { newId: () => 'same' }))).toBe('invalid_op');
    expect(codeOf(() => applyProgramOp(F(), op, { newId: () => 'w1' }))).toBe('invalid_op');
    expect(codeOf(() => applyProgramOp(F(), op, { newId: () => '' }))).toBe('invalid_op');
    expect(codeOf(() => applyProgramOp(F(), op, { newId: () => 'z'.repeat(65) }))).toBe('invalid_op');
  });
  it('T68 the document passed in is rejected with ProgramEditError (not a ZodError) when it does not satisfy the schema', () => {
    const broke = bad<Doc>({ schemaVersion: 1, phases: [] });
    expect(codeOf(() => applyProgramOp(broke, { type: 'meta.update', patch: {} }, ctx()))).toBe('invalid_op');
    expect(codeOf(() => applyProgramOps(broke, [], ctx()))).toBe('invalid_op');
    expect(codeOf(() => programStats(broke))).toBe('invalid_op');
    expect(codeOf(() => validateProgram(broke))).toBe('invalid_op');
    expect(codeOf(() => findDay(broke, 'x'))).toBe('invalid_op');
  });
  it('Q04 a malformed day.copyTo (toDayIds missing) throws invalid_op like every other malformed op (decided 2026-11-07)', () => {
    // Reading A: ops are typed, a missing required field is the caller's bug and a silent no-op is acceptable.
    // Reading B: the builder dispatches JSON; every other op with a missing required field throws ProgramEditError (invalid_op / not_found), so this one should too.
    expect(codeOf(() => run(F(), bad({ type: 'day.copyTo', fromDayId: 'd1-0' })))).toMatch(/^(invalid_op|not_found)$/);
  });
  it('Q05 patches with keys outside the documented patch type (id, kind, workout, phases) are rejected with invalid_op (decided 2026-11-07)', () => {
    // Reading A: types forbid it, caller's problem.  Reading B: an op must never change an element id or bypass
    // the dedicated ops (day.setKind, day.clear): patch objects should be rejected (invalid_op) or the extra keys ignored.
    const attempts: ProgramOp[] = [
      bad({ type: 'phase.update', phaseId: 'p1', patch: { id: 'hijacked' } }),
      bad({ type: 'day.update', dayId: 'd1-0', patch: { kind: 'rest' } }),
      bad({ type: 'item.update', dayId: 'd1-0', itemId: 'i1', patch: { id: 'hijacked-item' } }),
    ];
    const before = allIds(F()).sort();
    const changed = attempts.filter(op => {
      try { const out = run(F(), op); return JSON.stringify(out) !== JSON.stringify(F()); } catch (e) { return !(e instanceof ProgramEditError); }
    });
    expect(changed.map(o => o.type)).toEqual([]);
    expect(before.length).toBeGreaterThan(0);
  });
  it('Q06 a document with duplicate ids is corrupt input: ops throw invalid_op and validateProgram reports duplicate_id (decided 2026-11-07)', () => {
    // No op and no emptyProgram call can produce duplicates, so they only arrive through an import or a raw write,
    // where the API rejects the document using validateProgram.
    const dup = broken(d => { d.phases[0].weeks[0].days[1].id = d.phases[0].weeks[0].days[0].id; });
    expect(validateProgram(dup).map(i => i.code)).toContain('duplicate_id');
    expect(codeOf(() => run(dup, { type: 'meta.update', patch: { notes: { en: 'x' } } }))).toBe('invalid_op');
    expect(codeOf(() => run(dup, { type: 'day.clear', dayId: 'd1-0' }))).toBe('invalid_op');
  });
});

/* ============================================================= emptyProgram, find, stats */
describe('T emptyProgram / findDay / programStats', () => {
  it('T69 emptyProgram defaults: 1 phase, 4 weeks, 28 days, 12 training days with empty workouts, phase name with Western digit', () => {
    const d = emptyProgram(ctx());
    expect(d.phases).toHaveLength(1); expect(d.phases[0]!.weeks).toHaveLength(4);
    expect(d.phases[0]!.name).toEqual({ ar: 'المرحلة 1', en: 'Phase 1' });
    expect(days(d)).toHaveLength(28);
    const tr = days(d).filter(x => x.kind === 'training');
    expect(tr).toHaveLength(12);
    expect(tr.every(x => x.workout && x.workout.blocks.length === 1 && x.workout.blocks[0]!.items.length === 0)).toBe(true);
    expect(tr.map(x => x.index)).toEqual(Array.from({ length: 4 }, () => [0, 2, 4]).flat());
    expect(days(d).filter(x => x.kind !== 'training').every(x => x.kind === 'rest' && !x.workout)).toBe(true);
    expect(d.phases[0]!.weeks.map(w => w.index)).toEqual([0, 1, 2, 3]);
    expect(ProgramDocument.safeParse(d).success).toBe(true);
    expect(new Set(allIds(d)).size).toBe(allIds(d).length);
  });
  it('T70 emptyProgram options: weeks, trainingDays (any order, duplicates), phaseName, no meta fields', () => {
    const d = emptyProgram(ctx(), { weeks: 1, trainingDays: [6, 6, 0], phaseName: { en: 'Prep' } });
    expect(days(d).filter(x => x.kind === 'training').map(x => x.index)).toEqual([0, 6]);
    expect(d.phases[0]!.name).toEqual({ en: 'Prep' });
    expect(Object.keys(d).sort()).toEqual(['phases', 'schemaVersion']);
    expect(days(emptyProgram(ctx(), { trainingDays: [] })).every(x => x.kind === 'rest')).toBe(true);
    expect(days(emptyProgram(ctx(), { trainingDays: [0, 1, 2, 3, 4, 5, 6], weeks: 1 })).every(x => x.kind === 'training' && x.workout)).toBe(true);
  });
  it('T71 emptyProgram rejects weeks 0 / -1 / 2.5 / NaN and training day 7 / -1 / 1.5 with invalid_op', () => {
    for (const weeks of [0, -1, 2.5, Number.NaN]) expect(codeOf(() => emptyProgram(ctx(), { weeks }))).toBe('invalid_op');
    for (const d of [7, -1, 1.5]) expect(codeOf(() => emptyProgram(ctx(), { trainingDays: [d] }))).toBe('invalid_op');
    expect(codeOf(() => emptyProgram(ctx(), { phaseName: {} }))).toBe('invalid_op');
  });
  it('T72 findDay returns indexes and containing phase/week; null for unknown ids and for ids of other element kinds', () => {
    const f = F();
    const r = findDay(f, 'd2-4')!;
    expect([r.phaseIndex, r.weekIndex, r.dayIndex]).toEqual([0, 1, 4]);
    expect(r.phase.id).toBe('p1'); expect(r.week.id).toBe('w2'); expect(r.day.id).toBe('d2-4');
    expect(findDay(f, 'd1-0')!.day).toEqual(dayOf(f, 'd1-0'));
    expect(findDay(f, 'ghost')).toBeNull(); expect(findDay(f, 'w1')).toBeNull(); expect(findDay(f, 'i1')).toBeNull(); expect(findDay(f, '')).toBeNull();
    expect(findDay(f, 'd3-6')!.phaseIndex).toBe(1);
  });
  it('T73 programStats on the fixture and edge documents', () => {
    expect(programStats(F())).toEqual({ phases: 2, weeks: 3, trainingDays: 3, workouts: 4, blocks: 5, items: 5, sets: 3 + 2 + 1 + 2 + 2, exerciseIds: ['ex-a', 'ex-b', 'ex-c', 'ex-d'] });
    const rest = emptyProgram(ctx(), { weeks: 1, trainingDays: [] });
    expect(programStats(rest)).toEqual({ phases: 1, weeks: 1, trainingDays: 0, workouts: 0, blocks: 0, items: 0, sets: 0, exerciseIds: [] });
  });
  it('T74 programStats: distinct exercise ids in first-seen order across phases/weeks/blocks; alternatives are not counted; repeats counted in items/sets', () => {
    const d = broken(x => {
      x.phases[0].weeks[0].days[0].workout.blocks[0].items.push({ id: 'i3', exerciseId: 'ex-b', order: 2, sets: [{ setNo: 1 }], alternatives: ['ex-zzz'] });
      x.phases.push({ id: 'p2', name: { en: 'x' }, weeks: [{ id: 'w2', index: 0, days: clone(mkDays('2', { 0: { kind: 'training', workout: { id: 'wk9', name: { en: 'n' }, blocks: [{ id: 'bx', kind: 'main', items: [mkItem('i9', 'ex-c', 0, 1), mkItem('i10', 'ex-a', 1, 1)] }] } } })) }] });
    });
    const s = programStats(d);
    expect(s.exerciseIds).toEqual(['ex-a', 'ex-b', 'ex-c']);
    expect(s).toMatchObject({ phases: 2, weeks: 2, items: 5, sets: 2 + 2 + 1 + 1 + 1, trainingDays: 2, workouts: 2, blocks: 2 });
  });
  it('T75 programStats: a training day without workout counts as a training day but not as a workout; active_recovery workout counts as workout not training day', () => {
    const d = broken(x => {
      delete x.phases[0].weeks[0].days[0].workout; // training, no workout
      x.phases[0].weeks[0].days[1] = { id: 'dr', index: 1, kind: 'active_recovery', workout: { id: 'wr', name: { en: 'r' }, blocks: [{ id: 'br', kind: 'mobility', items: [mkItem('ir', 'ex-m', 0, 2)] }] } };
    });
    expect(programStats(d)).toEqual({ phases: 1, weeks: 1, trainingDays: 1, workouts: 1, blocks: 1, items: 1, sets: 2, exerciseIds: ['ex-m'] });
  });
  it('T76 stats after edits track the edits (item.add + set.add + day.clear)', () => {
    let d = clean(); const c = ctx();
    d = applyProgramOp(d, { type: 'item.add', dayId: 'd1-0', blockId: 'b1', exerciseId: 'ex-q' }, c);
    d = applyProgramOp(d, { type: 'set.add', dayId: 'd1-0', itemId: d.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items[2]!.id }, c);
    expect(programStats(d)).toMatchObject({ items: 3, sets: 2 + 2 + 4, exerciseIds: ['ex-a', 'ex-b', 'ex-q'] });
    d = applyProgramOp(d, { type: 'day.clear', dayId: 'd1-0' }, c);
    expect(programStats(d)).toMatchObject({ trainingDays: 0, workouts: 0, items: 0, sets: 0, exerciseIds: [] });
  });
});

/* ====================================================================== validateProgram */
describe('V validateProgram', () => {
  const codes = (d: Doc, o?: Parameters<typeof validateProgram>[1]) => validateProgram(d, o).map(i => i.code);
  it('V01 a clean document yields no issues, with and without knownExerciseIds', () => {
    expect(validateProgram(clean())).toEqual([]);
    expect(validateProgram(clean(), { knownExerciseIds: new Set(['ex-a', 'ex-b']) })).toEqual([]);
  });
  it('V02 unknown_exercise once per unknown item and once per unknown alternative; silent without knownExerciseIds', () => {
    const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].alternatives = ['ex-b', 'nope1', 'nope2']; });
    const known = new Set(['ex-a', 'ex-b']);
    expect(codes(d, { knownExerciseIds: known })).toEqual(['unknown_exercise', 'unknown_exercise']);
    expect(codes(d)).toEqual([]);
    const two = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[1].exerciseId = 'ghost'; });
    const issues = validateProgram(two, { knownExerciseIds: known });
    expect(issues).toHaveLength(1); expect(issues[0]!.path).toContain('items[1]');
    expect(codes(clean(), { knownExerciseIds: new Set() })).toEqual(['unknown_exercise', 'unknown_exercise']);
  });
  it('V03 unknown_exercise: an exercise with 5 sets is reported once, not once per set', () => {
    const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].sets = mkSets(5); });
    expect(codes(d, { knownExerciseIds: new Set(['ex-b']) })).toEqual(['unknown_exercise']);
  });
  it('V04 empty_workout: a workout with no blocks gives exactly one issue (no empty_block, nothing to point at)', () => {
    const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks = []; });
    expect(codes(d)).toEqual(['empty_workout']);
    expect(validateProgram(d)[0]!.path).toContain('days[0]');
  });
  it('V05 empty_workout: a workout whose blocks all lack items is reported as empty_workout', () => {
    const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items = []; });
    expect(codes(d)).toContain('empty_workout');
  });
  it('Q07 a freshly created training day (one empty main block) is one problem, reported once as empty_workout (decided 2026-11-07)', () => {
    // Reading A (code today): both codes fire, the UI shows two issues for one empty day.
    // Reading B: "reported once per problem" - the workout is the problem and the block is just its only child.
    const d = emptyProgram(ctx(), { weeks: 1, trainingDays: [0] });
    expect(validateProgram(d)).toHaveLength(1);
  });
  it('V06 empty_block: one empty block among non-empty ones is reported once, with the block path, and no empty_workout', () => {
    const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks.push({ id: 'b9', kind: 'cooldown', items: [] }); });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(['empty_block']);
    expect(issues[0]!.path).toContain('blocks[1]');
  });
  it('V07 training_without_workout: reported once per day with the day path; a rest or active_recovery day without workout is fine', () => {
    const d = broken(x => { delete x.phases[0].weeks[0].days[0].workout; x.phases[0].weeks[0].days[1].kind = 'active_recovery'; });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(['training_without_workout']);
    expect(issues[0]!.path).toContain('days[0]');
  });
  it('V08 duplicate_id: one issue per extra occurrence, across element kinds (week id equal to a block id)', () => {
    const d = broken(x => { x.phases[0].weeks[0].id = 'b1'; });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(['duplicate_id']);
  });
  it('V09 duplicate_id for day ids in two different weeks', () => {
    const d = broken(x => { x.phases[0].weeks.push({ id: 'w2', index: 1, days: mkDays('1') }); });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(Array(7).fill('duplicate_id'));
    expect(new Set(issues.map(i => i.path)).size).toBe(7);
  });
  it('V10 bad_set_numbers once per item with wrong numbering (gap, duplicate, not starting at 1)', () => {
    for (const nums of [[1, 3], [2, 3], [1, 1], [2, 1]]) {
      const d = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].sets = nums.map(setNo => ({ setNo })); });
      expect(codes(d)).toEqual(['bad_set_numbers']);
    }
    const two = broken(x => { for (const it of x.phases[0].weeks[0].days[0].workout.blocks[0].items) it.sets = [{ setNo: 5 }]; });
    expect(codes(two)).toEqual(['bad_set_numbers', 'bad_set_numbers']);
  });
  it('V11 bad_order once per wrongly ordered item (start at 1, gap, duplicate, swapped)', () => {
    const d = broken(x => { const its = x.phases[0].weeks[0].days[0].workout.blocks[0].items; its[0].order = 1; its[1].order = 2; });
    expect(codes(d)).toEqual(['bad_order', 'bad_order']);
    const swapped = broken(x => { const its = x.phases[0].weeks[0].days[0].workout.blocks[0].items; its[0].order = 1; its[1].order = 0; });
    expect(codes(swapped)).toEqual(['bad_order', 'bad_order']);
    const gap = broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[1].order = 5; });
    expect(codes(gap)).toEqual(['bad_order']);
  });
  it('V12 bad_week_index once per wrong week; path points at the week', () => {
    const d = broken(x => { x.phases[0].weeks.push({ id: 'w2', index: 5, days: mkDays('2') }); x.phases[0].weeks[0].index = 3; });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(['bad_week_index', 'bad_week_index']);
    expect(issues.map(i => i.path)).toEqual([expect.stringContaining('weeks[0]'), expect.stringContaining('weeks[1]')]);
  });
  it('V13 bad_day_index once per wrong day: in-range but out-of-order indexes are reported, not thrown', () => {
    const d = broken(x => { const ds = x.phases[0].weeks[0].days; [ds[2].index, ds[3].index] = [3, 2]; });
    const issues = validateProgram(d);
    expect(issues.map(i => i.code)).toEqual(['bad_day_index', 'bad_day_index']);
    expect(issues[0]!.path).toContain('days[2]');
  });
  it('V14 date_order accepts equal dates and any single date; flags start>review, review>end, start>end (no review)', () => {
    expect(codes({ ...clean(), startDate: '2026-01-01', reviewDate: '2026-01-01', endDate: '2026-01-01' })).toEqual([]);
    expect(codes({ ...clean(), startDate: '2026-05-01' })).toEqual([]);
    expect(codes({ ...clean(), endDate: '2026-05-01', reviewDate: '2026-05-01' })).toEqual([]);
    expect(codes({ ...clean(), startDate: '2026-05-02', reviewDate: '2026-05-01' })).toEqual(['date_order']);
    expect(codes({ ...clean(), reviewDate: '2026-05-02', endDate: '2026-05-01' })).toEqual(['date_order']);
    expect(codes({ ...clean(), startDate: '2026-05-02', endDate: '2026-05-01' })).toEqual(['date_order']);
    expect(codes({ ...clean(), startDate: '2025-12-31', reviewDate: '2026-01-01', endDate: '2026-12-31' })).toEqual([]);
  });
  it('V15 date_order is reported once per violated pair: start > review and review > end give two issues', () => {
    const issues = validateProgram({ ...clean(), startDate: '2026-03-01', reviewDate: '2026-02-01', endDate: '2026-01-01' });
    expect(issues.map(i => i.code)).toEqual(['date_order', 'date_order']);
    expect(new Set(issues.map(i => i.path)).size).toBe(2);
  });
  it('V16 start after end with a review date in between-but-before-start: the start>end violation is still visible', () => {
    // start 05-01, review 03-01 (< start), end 04-01 (< start): contract "startDate <= reviewDate <= endDate".
    const issues = validateProgram({ ...clean(), startDate: '2026-05-01', reviewDate: '2026-03-01', endDate: '2026-04-01' });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues.every(i => i.code === 'date_order')).toBe(true);
  });
  it('V17 every issue carries a non-empty Arabic and English message', () => {
    const d = broken(x => {
      const w = x.phases[0].weeks[0]; delete w.days[0].workout; w.days[1] = { ...w.days[1], index: 3 };
      w.days[2] = { id: 'dx', index: 2, kind: 'training', workout: { id: 'wkx', name: { en: 'x' }, blocks: [{ id: 'bx', kind: 'main', items: [] }] } };
      x.startDate = '2026-02-01'; x.endDate = '2026-01-01';
    });
    const issues = validateProgram(d, { knownExerciseIds: new Set() });
    // The empty block 'bx' is the empty workout's only block, so it is reported once, as empty_workout (review Q07).
    expect(new Set(issues.map(i => i.code))).toEqual(new Set(['training_without_workout', 'bad_day_index', 'empty_workout', 'date_order']));
    for (const i of issues) { expect(i.message.ar?.trim().length).toBeGreaterThan(0); expect(i.message.en?.trim().length).toBeGreaterThan(0); expect(i.path.length).toBeGreaterThan(0); }
  });
  it('V18 all ten documented issue codes are reachable', () => {
    const seen = new Set<string>();
    const add = (d: Doc, o?: Parameters<typeof validateProgram>[1]) => validateProgram(d, o).forEach(i => seen.add(i.code));
    add(clean(), { knownExerciseIds: new Set() });
    add(broken(x => { delete x.phases[0].weeks[0].days[0].workout; }));
    add(broken(x => { x.phases[0].weeks[0].days[0].workout.blocks = []; }));
    add(broken(x => { x.phases[0].weeks[0].days[0].workout.blocks.push({ id: 'e', kind: 'main', items: [] }); }));
    add(broken(x => { x.phases[0].weeks[0].id = 'b1'; }));
    add(broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].sets = [{ setNo: 2 }]; }));
    add(broken(x => { x.phases[0].weeks[0].days[0].workout.blocks[0].items[0].order = 4; }));
    add(broken(x => { x.phases[0].weeks[0].index = 2; }));
    add(broken(x => { x.phases[0].weeks[0].days[4].index = 5; }));
    add({ ...clean(), startDate: '2026-02-01', endDate: '2026-01-01' });
    expect([...seen].sort()).toEqual(['bad_day_index', 'bad_order', 'bad_set_numbers', 'bad_week_index', 'date_order', 'duplicate_id', 'empty_block', 'empty_workout', 'training_without_workout', 'unknown_exercise']);
  });
  it('V19 validateProgram after emptyProgram + edits: filling every empty training day with items clears all issues', () => {
    let d = emptyProgram(ctx(), { weeks: 2, trainingDays: [0] }); const c = ctx();
    const known = new Set(['sq']);
    expect(validateProgram(d, { knownExerciseIds: known }).length).toBeGreaterThan(0);
    for (const day of days(d)) if (day.kind === 'training') d = applyProgramOp(d, { type: 'item.add', dayId: day.id, blockId: day.workout!.blocks[0]!.id, exerciseId: 'sq' }, c);
    expect(validateProgram(d, { knownExerciseIds: known })).toEqual([]);
  });
  it('V20 edits never produce structural issues: after a random-ish chain of ops validateProgram only reports content issues', () => {
    const c = counter();
    const ops: ProgramOp[] = [
      { type: 'phase.duplicate', phaseId: 'p1' }, { type: 'week.move', phaseId: 'p1', weekId: 'w2', toIndex: 0 }, { type: 'item.move', dayId: 'd1-0', itemId: 'i1', toBlockId: 'b2', toIndex: 0 },
      { type: 'set.remove', dayId: 'd1-0', itemId: 'i1', setNo: 1 }, { type: 'day.copyTo', fromDayId: 'd1-0', toDayIds: ['d1-5', 'd2-5'] }, { type: 'item.duplicate', dayId: 'd1-0', itemId: 'i2' },
    ];
    const out = applyProgramOps(F(), ops, c.ctx);
    const structural = new Set(['duplicate_id', 'bad_set_numbers', 'bad_order', 'bad_week_index', 'bad_day_index']);
    expect(validateProgram(out).filter(i => structural.has(i.code))).toEqual([]);
  });
});

describe('T misc', () => {
  it('T77 programStats, validateProgram and findDay accept a deep-frozen document and hand back data detached from it', () => {
    const f = freeze(F());
    expect(() => programStats(f)).not.toThrow();
    expect(() => validateProgram(f)).not.toThrow();
    const r = findDay(f, 'd1-0')!;
    (r.day as any).kind = 'rest'; // detached copy: must not leak into the document
    expect(dayOf(f, 'd1-0').kind).toBe('training');
  });
  it('T78 a realistic 6 x 12 week program is edited in well under a second per op', () => {
    let d = emptyProgram(ctx(), { weeks: 12, trainingDays: [0, 1, 3, 4] });
    const c = ctx();
    for (let i = 0; i < 5; i++) d = applyProgramOp(d, { type: 'phase.duplicate', phaseId: d.phases[0]!.id }, c);
    expect(d.phases).toHaveLength(6);
    const day = d.phases[3]!.weeks[5]!.days[0]!;
    const t0 = performance.now();
    d = applyProgramOp(d, { type: 'item.add', dayId: day.id, blockId: day.workout!.blocks[0]!.id, exerciseId: 'sq' }, c);
    const ms = performance.now() - t0;
    expect(ms, `one op took ${ms.toFixed(0)} ms`).toBeLessThan(1000);
  });
});

