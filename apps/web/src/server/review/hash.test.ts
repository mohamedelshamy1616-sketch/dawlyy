import { describe, expect, it } from 'vitest';
import { WeekReviewInput } from '@dawlyy/core/review';
import { canonicalSourceRevision, hashReviewInputs } from './hash';

const id = '10000000-0000-4000-8000-000000000001';
const input = WeekReviewInput.parse({
  client: { id, firstName: 'Mona', goal: 'lose' }, coach: { firstName: 'Coach', dialect: 'egyptian', signaturePhrases: [] },
  period: { from: '2026-11-01', to: '2026-11-07' }, workouts: { planned: 2, done: 1, previousPlanned: 2, previousDone: 1 },
  exercises: [], meals: { nutritionAssigned: false, daysLogged: 0, daysInPeriod: 7, avgKcal: null, targetKcal: null },
  checkin: { current: null, previous: null }, weights: [], measurements: [], redFlags: [], attention: null, nutrition: null,
});

describe('R4b server evidence binding', () => {
  it('is invariant to query order and JSON key order', () => {
    const a = { table: 'metric_entries', id: 'a', data: { value: 80, voidedAt: null } };
    const b = { table: 'form_submissions', id: 'b', data: { answers: { sleep: 7, energy: 4 } } };
    const first = canonicalSourceRevision([a, b], { tracking: true, nutrition: false });
    const second = canonicalSourceRevision([{ ...b, data: { answers: { energy: 4, sleep: 7 } } }, a], { nutrition: false, tracking: true });
    expect(hashReviewInputs(input, first, 'en')).toBe(hashReviewInputs(input, second, 'en'));
  });
  it.each([
    ['answer', { answers: { sleep: 8 } }], ['void', { value: 80, voidedAt: '2026-11-08T00:00:00Z' }],
    ['published version', { versionId: 'new', document: { targets: { kcal: 2000 } } }], ['flag status', { status: 'handled' }],
  ])('detects changed %s despite equal computed aggregates', (_name, data) => {
    const before = canonicalSourceRevision([{ table: 'source', id: 'a', data: { value: 80 } }], {});
    const after = canonicalSourceRevision([{ table: 'source', id: 'a', data }], {});
    expect(hashReviewInputs(input, before, 'en')).not.toBe(hashReviewInputs(input, after, 'en'));
  });
  it('binds source identity, permission projection and locale', () => {
    const marker = { table: 'metric_entries', id: 'original', data: { value: 80 } };
    const a = canonicalSourceRevision([marker], { tracking: true });
    const b = canonicalSourceRevision([{ ...marker, id: 'correction' }], { tracking: true });
    const c = canonicalSourceRevision([marker], { tracking: false });
    expect(hashReviewInputs(input, a, 'en')).not.toBe(hashReviewInputs(input, b, 'en'));
    expect(hashReviewInputs(input, a, 'en')).not.toBe(hashReviewInputs(input, c, 'en'));
    expect(hashReviewInputs(input, a, 'en')).not.toBe(hashReviewInputs(input, a, 'ar'));
    expect(hashReviewInputs(input, a, 'en')).toMatch(/^[a-f0-9]{64}$/);
  });
});
