import { describe, it, expect } from 'vitest';
import { FormDocument, NutritionDocument, ProgramDocument } from '../src/types';
import {
  VersioningError, publish, nextVersionNo, currentPublished, diffDocuments, summarizeDiff,
  type VersionRecord,
} from '../src/versioning';

const now = '2026-11-07T09:00:00+02:00';
const program = (reps: string) => ProgramDocument.parse({
  phases: [{ id: 'p1', name: { ar: 'تأسيس', en: 'Base' }, weeks: [{ id: 'w2', index: 0,
    days: Array.from({ length: 7 }, (_, index) => ({ id: `d${index + 3}`, index, kind: 'training',
      ...(index === 0 ? { workout: { id: 'workout', name: { en: 'Upper' }, blocks: [{ id: 'b1', kind: 'main',
        items: [{ id: 'i2', exerciseId: 'bench', order: 0, sets: [{ setNo: 1, reps: '8' }, { setNo: 2, reps }] }],
      }] } } : {}),
    })),
  }] }],
});
const nutrition = (extra: boolean) => NutritionDocument.parse({
  targets: { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
  meals: [{ id: 'm1', name: { ar: 'الفطار', en: 'Breakfast' }, options: [
    { id: 'o1', items: [{ id: 'food1', foodId: 'egg', quantity: 1, measure: { kind: 'g' } }] },
    ...(extra ? [{ id: 'o2', items: [{ id: 'food2', foodId: 'rice', quantity: 100, measure: { kind: 'g' } }] }] : []),
  ] }],
});

describe('publishing immutable versions', () => {
  it('publishes the first snapshot and preserves the supplied timestamp and change note', () => {
    const document = { value: { reps: 8 } };
    const result = publish([], { document, changeNote: 'First plan' }, now);
    expect(result).toEqual({ newVersion: { versionNo: 1, status: 'published', document,
      publishedAt: now, changeNote: 'First plan' }, supersededIds: [] });
    document.value.reps = 20;
    expect(result.newVersion.document.value.reps).toBe(8);
  });

  it('supersedes published rows without modifying their documents or statuses', () => {
    const versions: VersionRecord<{ reps: number }>[] = [
      { id: 'v1', versionNo: 1, status: 'published', document: { reps: 8 } },
    ];
    const snapshot = structuredClone(versions);
    expect(publish(versions, { document: { reps: 10 } }, now)).toEqual({
      newVersion: { versionNo: 2, status: 'published', document: { reps: 10 }, publishedAt: now },
      supersededIds: ['v1'],
    });
    expect(versions).toEqual(snapshot);
  });

  it('ignores object key order when rejecting an unchanged document', () => {
    const versions: VersionRecord[] = [{ id: 'v1', versionNo: 1, status: 'published', document: { a: 1, b: [2] } }];
    expect(() => publish(versions, { document: { b: [2], a: 1 } }, now))
      .toThrow(expect.objectContaining({ code: 'nothing_to_publish' }));
  });

  it('rejects duplicate version numbers in every version-list helper', () => {
    const versions: VersionRecord[] = [1, 2].map(id => ({ id: `v${id}`, versionNo: 1, status: 'draft', document: {} }));
    for (const act of [() => nextVersionNo(versions), () => currentPublished(versions), () => publish(versions, { document: {} }, now)]) {
      expect(act).toThrow(VersioningError);
      expect(act).toThrow(expect.objectContaining({ code: 'invalid_versions' }));
    }
  });

  it('uses the maximum number across all statuses and selects the latest published row', () => {
    const versions: VersionRecord[] = [
      { id: 'v5', versionNo: 5, status: 'draft', document: {} },
      { id: 'v3', versionNo: 3, status: 'published', document: { x: 3 } },
      { id: 'v1', versionNo: 1, status: 'published', document: { x: 1 } },
    ];
    expect(nextVersionNo([])).toBe(1);
    expect(nextVersionNo(versions)).toBe(6);
    expect(currentPublished([])).toBeNull();
    expect(currentPublished(versions)?.id).toBe('v3');
    expect(publish(versions, { document: { x: 4 } }, now).supersededIds).toEqual(['v3', 'v1']);
  });

  it('validates recognized document schemas before publishing', () => {
    expect(() => publish([], { document: { phases: [] } }, now)).toThrow();
    expect(publish([], { document: program('8') }, now).newVersion.document).toEqual(program('8'));
  });
});

describe('human document diffs', () => {
  it('locates the second set reps under stable element ids and translates the label', () => {
    const entries = diffDocuments(program('8'), program('10'), { flavor: 'program' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: 'phases[p1].weeks[w2].days[d3].workout.blocks[b1].items[i2].sets[2].reps',
      kind: 'changed', before: '8', after: '10' });
    expect(entries[0]?.label.en).toContain('Reps');
    expect(entries[0]?.label.en).toContain('Base');
    expect(entries[0]?.label.ar).toContain('العدات');
  });

  it('reports one added meal option without an order change', () => {
    const entries = diffDocuments(nutrition(false), nutrition(true), { flavor: 'nutrition' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: 'meals[m1].options[o2]', kind: 'added' });
    expect(entries[0]?.label.ar).toContain('الفطار');
  });

  it('reports one removed question with its readable label', () => {
    const before = FormDocument.parse({ sections: [{ id: 's1', title: { en: 'Health' }, questions: [
      { id: 'q1', type: 'text', label: { ar: 'عندك إصابة؟', en: 'Injuries?' } },
    ] }] });
    const after = FormDocument.parse({ sections: [{ id: 's1', title: { en: 'Health' }, questions: [] }] });
    const entries = diffDocuments(before, after, { flavor: 'form' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: 'sections[s1].questions[q1]', kind: 'removed' });
    expect(entries[0]?.label.en).toContain('Injuries?');
  });

  it('reports only an order change when id-based items move', () => {
    const a = { id: 'a', name: { en: 'Squat' } }, b = { id: 'b', name: { en: 'Press' } };
    const entries = diffDocuments({ items: [a, b] }, { items: [b, a] });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: 'items', kind: 'changed', before: ['a', 'b'], after: ['b', 'a'] });
    expect(entries[0]?.label.en?.toLowerCase()).toContain('order');
  });

  it('compares non-id arrays by index and handles primitive roots, nulls and type changes', () => {
    expect(diffDocuments({ values: [1, 2] }, { values: [1, 3] })[0]).toMatchObject({ path: 'values[1]', before: 2, after: 3 });
    expect(diffDocuments(null, null)).toEqual([]);
    expect(diffDocuments(null, { x: 1 })).toMatchObject([{ path: '', kind: 'changed' }]);
    expect(diffDocuments({ x: 1 }, { x: [1] })).toMatchObject([{ path: 'x', kind: 'changed' }]);
    expect(diffDocuments({ a: false }, { a: false })).toEqual([]);
  });

  it('allows arbitrary generic documents and labels keys that shadow object properties', () => {
    expect(diffDocuments({ phases: [] }, { phases: [1] }, { flavor: 'generic' }))
      .toMatchObject([{ path: 'phases[0]', kind: 'added' }]);
    expect(diffDocuments({ sections: [] }, { sections: [1] }))
      .toMatchObject([{ path: 'sections[0]', kind: 'added' }]);
    expect(diffDocuments({ constructor: 1 }, { constructor: 2 })[0]?.label)
      .toEqual({ ar: 'constructor', en: 'constructor' });
    expect(() => diffDocuments({ phases: [] }, { phases: [] }, { flavor: 'program' })).toThrow();
  });

  it('summarizes kinds and returns distinct paths in encounter order', () => {
    const entries = diffDocuments({ old: 1, changed: 1 }, { added: 2, changed: 2 });
    expect(summarizeDiff(entries)).toEqual({ added: 1, removed: 1, changed: 1, paths: entries.map(e => e.path) });
    expect(summarizeDiff([])).toEqual({ added: 0, removed: 0, changed: 0, paths: [] });
    expect(summarizeDiff([...entries, ...entries]).paths).toHaveLength(3);
  });
});
