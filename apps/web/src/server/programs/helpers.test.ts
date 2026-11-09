import { describe, expect, it } from 'vitest';
import { applyProgramOp, applyProgramOps, emptyProgram } from '@dawlyy/core/program-edit';
import { documentRevision, editContext, exerciseReferences, mapProgramError, versionRecords } from './helpers';
import { ApiError } from '../../api/errors';
import { programOpSchema } from './schemas';
import { programPageGrants } from './page-data';
import { programErrorKey, ProgramRequestError } from '../../../components/program-builder/transport';
import { replaceSetOps } from '../../../components/program-builder/set-ops';

describe('Task 4 program payload helpers', () => {
  it('replays supplied UUIDs so optimistic browser edits address the same elements on the server', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    let i = 0;
    const original = emptyProgram({ newId: () => ids[i++]! }, { weeks: 1, trainingDays: [] });
    const op = { type: 'phase.add' as const, weeks: 1 };
    const generated = ids.slice(i);
    const result = applyProgramOp(original, op, editContext(generated));
    expect(result.phases[1]?.id).toBe('00000000-0000-4000-8000-000000000010');
    expect(result.phases[1]?.weeks[0]?.days[6]?.id).toBe('00000000-0000-4000-8000-000000000018');
    expect(() => applyProgramOp(original, op, editContext([]))).toThrow(ApiError);
  });

  it('collects alternatives as well as primary exercises for RLS validation', () => {
    const doc = emptyProgram(editContext(), { weeks: 1, trainingDays: [0] });
    const day = doc.phases[0]!.weeks[0]!.days[0]!;
    const block = day.workout!.blocks[0]!;
    const withItem = applyProgramOp(doc, { type: 'item.add', dayId: day.id, blockId: block.id, exerciseId: 'a' }, editContext());
    const item = withItem.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items[0]!;
    const result = applyProgramOp(withItem, { type: 'item.update', dayId: day.id, itemId: item.id, patch: { alternatives: ['b', 'a'] } }, editContext());
    expect(exerciseReferences(result)).toEqual(['a', 'b']);
  });

  it('changes the concurrency token for content or state changes but ignores object key order', () => {
    expect(documentRevision({ id: 'v', status: 'draft', document: { a: 1, b: 2 } })).toBe(documentRevision({ id: 'v', status: 'draft', document: { b: 2, a: 1 } }));
    expect(documentRevision({ id: 'v', status: 'draft', document: { a: 2 } })).not.toBe(documentRevision({ id: 'v', status: 'draft', document: { a: 1 } }));
    expect(documentRevision({ id: 'v', status: 'published', document: {} })).not.toBe(documentRevision({ id: 'v', status: 'draft', document: {} }));
  });

  it('maps nested immutable trigger failures without exposing the database error', () => {
    expect(mapProgramError({ cause: { code: 'P0001', detail: 'rule:app.protect_published_version' } })).toMatchObject({ status: 409, code: 'version_immutable' });
    expect(mapProgramError({ code: '42501' })).toMatchObject({ status: 403 });
    const unexpected = new Error('unexpected');
    expect(mapProgramError(unexpected)).toBe(unexpected);
  });

  it('omits nullable database stamps from the core version record', () => {
    expect(versionRecords([{ id: 'v', versionNo: 1, status: 'draft', document: {}, publishedAt: null, changeNote: null }])).toEqual([
      { id: 'v', versionNo: 1, status: 'draft', document: {} },
    ]);
  });

  it('rejects structural patches and invalid set prescriptions at the API boundary', () => {
    expect(programOpSchema.safeParse({ type: 'day.update', dayId: 'day', patch: { kind: 'rest' } }).success).toBe(false);
    expect(programOpSchema.safeParse({ type: 'set.update', dayId: 'day', itemId: 'item', setNo: 1, patch: { rpe: 11 } }).success).toBe(false);
    expect(programOpSchema.safeParse({ type: 'item.add', dayId: 'day', blockId: 'block', exerciseId: 'bad-id' }).success).toBe(false);
  });

  it('never offers coach builder actions to client-role callers and respects staff action grants', () => {
    const identity = { userId: 'user', tenantId: 'tenant', membershipId: 'membership' };
    expect(() => programPageGrants({ ...identity, role: 'client', clientId: 'client', permissions: null })).toThrow(ApiError);
    expect(programPageGrants({ ...identity, role: 'owner', permissions: null })).toEqual({ edit: true, create: true, publish: true });
    expect(programPageGrants({ ...identity, role: 'staff', permissions: { client_scope: 'assigned', modules: { programs: ['view', 'edit'] } } })).toEqual({ edit: true, create: false, publish: false });
  });

  it('maps errors to localized recovery instructions without displaying arbitrary server messages', () => {
    expect(programErrorKey(new ProgramRequestError('stale_draft'))).toBe('stale');
    expect(programErrorKey(new ProgramRequestError('client_has_program'))).toBe('hasProgram');
    expect(programErrorKey(new Error('Internal detail'))).toBe('requestFailed');
  });

  it('clears an optional prescription without changing other sets or the exercise identity', () => {
    let document = emptyProgram(editContext(), { weeks: 1, trainingDays: [0] });
    const dayId = document.phases[0]!.weeks[0]!.days[0]!.id;
    const blockId = document.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.id;
    document = applyProgramOp(document, { type: 'item.add', dayId, blockId, exerciseId: 'exercise', sets: 2, template: { reps: '10', load: { value: 30, unit: 'kg' } } }, editContext());
    const original = document.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items[0]!;
    const updated = applyProgramOps(document, replaceSetOps(dayId, original.id, 2, [{ setNo: 1, reps: '10' }, { setNo: 2, reps: '10', load: { value: 30, unit: 'kg' } }]), editContext());
    expect(updated.phases[0]!.weeks[0]!.days[0]!.workout!.blocks[0]!.items[0]).toEqual({ id: original.id, exerciseId: 'exercise', order: 0, sets: [{ setNo: 1, reps: '10' }, { setNo: 2, reps: '10', load: { value: 30, unit: 'kg' } }] });
    expect(original.sets[0]?.load?.value).toBe(30);
    expect(() => replaceSetOps(dayId, original.id, 2, [])).toThrow();
  });
});
