import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { NutritionDocument } from '../src/types';
import { detectRedFlags, type RedFlagCategory } from '../src/safety';
import {
  WeekReviewInput, CheckinSnapshot, ReviewError, REVIEW_TEMPLATES,
  weekReview, applyNutritionChange, canonicalReviewInput,
  type NutritionChange,
} from '../src/review';

const ids = {
  client: '10000000-0000-4000-8000-000000000001',
  version: '10000000-0000-4000-8000-000000000002',
  exercise: '10000000-0000-4000-8000-000000000003',
  second: '10000000-0000-4000-8000-000000000004',
  third: '10000000-0000-4000-8000-000000000005',
};
const targets = { kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, fiberG: 25, waterMl: 2500, steps: 8000 };
const options = { locale: 'en' } as const;
function empty(): WeekReviewInput {
  return {
    client: { id: ids.client, firstName: 'Omar', goal: null },
    coach: { firstName: 'Mona', dialect: 'egyptian', signaturePhrases: [] },
    period: { from: '2026-11-01', to: '2026-11-07' },
    workouts: { planned: 0, done: 0, previousPlanned: 0, previousDone: 0 },
    exercises: [], meals: { nutritionAssigned: false, daysLogged: 0, daysInPeriod: 7, avgKcal: null, targetKcal: null },
    checkin: { current: null, previous: null }, weights: [], measurements: [], redFlags: [], attention: null, nutrition: null,
  };
}
function proposalInput(goal: 'lose' | 'gain' = 'lose'): WeekReviewInput {
  const input = empty();
  input.client.goal = goal;
  input.workouts = { planned: 5, done: 4, previousPlanned: 5, previousDone: 4 };
  input.meals = { nutritionAssigned: true, daysLogged: 8, daysInPeriod: 10, avgKcal: 2000, targetKcal: 2000 };
  input.nutrition = { versionId: ids.version, targets: { ...targets } };
  input.weights = [{ on: '2026-10-24', kg: 80 }, { on: '2026-10-31', kg: 80 }, { on: '2026-11-07', kg: 80 }];
  return input;
}
function snapshot(answers: CheckinSnapshot['answers']): CheckinSnapshot {
  return { submissionId: ids.second, submittedOn: '2026-11-07', answers };
}
function answer(questionId: string, kind: CheckinSnapshot['answers'][number]['kind'], value: CheckinSnapshot['answers'][number]['value']) {
  return { questionId, kind, value, label: { ar: 'متابعة', en: 'Progress' } };
}
function exercise(overrides: Partial<WeekReviewInput['exercises'][number]> = {}): WeekReviewInput['exercises'][number] {
  return { exerciseId: ids.exercise, name: { ar: 'سكوات', en: 'Squat' }, status: 'improved', topLoadKg: 85,
    previousTopLoadKg: 80, stalledSessions: 0, ...overrides };
}
function document(dayTypes = false): NutritionDocument {
  return NutritionDocument.parse({
    targets,
    ...(dayTypes ? { dayTypes: { training: { ...targets, kcal: 2200 }, rest: { ...targets, kcal: 1250, carbsG: 10 } } } : {}),
    instructions: { ar: 'تابع تسجيلك', en: 'Keep logging' },
    meals: [{ id: 'meal', name: { en: 'Lunch' }, options: [{ id: 'option', items: [
      { id: 'item', foodId: 'rice', quantity: 100, measure: { kind: 'g' } },
    ] }] }],
  });
}
function change(deltaKcal = -100): NutritionChange {
  return { kind: 'nutrition_targets', fromVersionId: ids.version, deltaKcal,
    targets: { ...targets, kcal: targets.kcal + deltaKcal, carbsG: targets.carbsG + deltaKcal / 4 } };
}

describe('weekly review summaries', () => {
  it('returns an empty week without inventing evidence', () => {
    const result = weekReview(empty(), options);
    expect(result.summary.adherence).toEqual({ workouts: { done: 0, planned: 0, percent: null, previousPercent: null, change: null }, meals: null });
    expect(result.summary.checkin).toEqual({ submittedOn: null, changes: [] });
    expect(result.summary.weight).toEqual({ first: null, last: null, deltaKg: null, kgPerWeek: null, trend: null });
    expect(result.summary.measurements).toEqual([]);
    expect(result.summary.prs).toEqual([]);
    expect(result.summary.stalls).toEqual([]);
    expect(result.summary.redFlags).toEqual([]);
    expect(result.summary.attentionReasons).toEqual([]);
    expect(result.mustHandleFlags).toBe(false);
    expect(result.proposals).toEqual([]);
    expect(result.draft.text.split('\n')).toHaveLength(2);
  });
  it.each([
    ['up', 9, 20, 8, 20, 'same'], ['down', 7, 20, 8, 20, 'same'],
    ['above tolerance', 10, 20, 8, 20, 'up'], ['below tolerance', 6, 20, 8, 20, 'down'],
    ['unchanged', 8, 20, 8, 20, 'same'], ['no previous plan', 4, 5, 0, 0, null],
  ] as const)('compares workout adherence: %s', (_name, done, planned, previousDone, previousPlanned, expected) => {
    const input = empty();
    input.workouts = { done, planned, previousDone, previousPlanned };
    expect(weekReview(input, options).summary.adherence.workouts.change).toBe(expected);
  });
  it('clamps workout percentages but preserves actual completion counts', () => {
    const input = empty();
    input.workouts = { planned: 3, done: 4, previousPlanned: 2, previousDone: 3 };
    expect(weekReview(input, options).summary.adherence.workouts).toMatchObject({ done: 4, planned: 3, percent: 100, previousPercent: 100 });
  });
  it('rounds meal adherence and calories for display', () => {
    const input = empty();
    input.meals = { nutritionAssigned: true, daysLogged: 2, daysInPeriod: 3, avgKcal: 2003, targetKcal: 1997 };
    expect(weekReview(input, options).summary.adherence.meals).toEqual({ daysLogged: 2, daysInPeriod: 3, percent: 67, avgKcal: 2005, targetKcal: 1995 });
  });
  it('preserves missing calories and caps meal adherence at 100 percent', () => {
    const input = empty();
    input.meals = { nutritionAssigned: true, daysLogged: 8, daysInPeriod: 7, avgKcal: null, targetKcal: null };
    expect(weekReview(input, options).summary.adherence.meals).toMatchObject({ percent: 100, avgKcal: null, targetKcal: null });
  });
  it.each([
    ['number rises', 'number', 4, 3, 'up'], ['number falls', 'number', 2, 3, 'down'],
    ['number same', 'number', 3, 3, 'same'], ['scale rises', 'scale', 5, 4, 'up'],
    ['scale falls', 'scale', 3, 4, 'down'], ['scale same', 'scale', 4, 4, 'same'],
    ['text changed', 'text', 'Good', 'OK', 'changed'], ['text same', 'text', 'OK', 'OK', 'same'],
    ['choice changed', 'choice', ['a'], ['b'], 'changed'], ['choice same', 'choice', ['a', 'b'], ['a', 'b'], 'same'],
    ['boolean changed', 'boolean', true, false, 'changed'], ['boolean same', 'boolean', false, false, 'same'],
    ['null same', 'number', null, null, 'same'], ['null becomes numeric', 'number', 3, null, 'changed'],
    ['numeric becomes null', 'number', null, 3, 'changed'], ['single choice', 'choice', 'a', 'b', 'changed'],
  ] as const)('compares check-in answers: %s', (_name, kind, current, previous, expected) => {
    const input = empty();
    input.checkin = { current: snapshot([answer('q', kind, typeof current === 'object' && current !== null ? [...current] : current)]),
      previous: snapshot([answer('q', kind, typeof previous === 'object' && previous !== null ? [...previous] : previous)]) };
    expect(weekReview(input, options).summary.checkin.changes[0]).toMatchObject({ questionId: 'q', change: expected, current, previous });
  });
  it('keeps current answer order then missing answers in previous order', () => {
    const input = empty();
    input.checkin = { current: snapshot([answer('b', 'number', 3), answer('new', 'text', 'Hello')]),
      previous: snapshot([answer('a', 'boolean', false), answer('b', 'number', 2), answer('c', 'scale', 3)]) };
    const result = weekReview(input, options).summary.checkin;
    expect(result.submittedOn).toBe('2026-11-07');
    expect(result.changes.map(row => [row.questionId, row.change])).toEqual([['b', 'up'], ['new', 'new'], ['a', 'missing'], ['c', 'missing']]);
    expect(result.changes[1]).toMatchObject({ previous: null });
    expect(result.changes[2]).toMatchObject({ current: null });
  });
  it('marks previous-only answers missing when there is no current check-in', () => {
    const input = empty();
    input.checkin.previous = snapshot([answer('q', 'text', 'OK')]);
    expect(weekReview(input, options).summary.checkin).toMatchObject({ submittedOn: null, changes: [{ change: 'missing' }] });
  });
  it('treats a changed answer kind as changed rather than a numeric trend', () => {
    const input = empty();
    input.checkin = { current: snapshot([answer('q', 'number', 3)]), previous: snapshot([answer('q', 'text', '3')]) };
    expect(weekReview(input, options).summary.checkin.changes[0]?.change).toBe('changed');
  });
  it('shows two unsorted weights as endpoints without a regression trend', () => {
    const input = empty();
    input.weights = [{ on: '2026-11-07', kg: 79.24 }, { on: '2026-11-01', kg: 80.16 }];
    expect(weekReview(input, options).summary.weight).toEqual({ first: { on: '2026-11-01', kg: 80.2 },
      last: { on: '2026-11-07', kg: 79.2 }, deltaKg: -0.9, kgPerWeek: null, trend: null });
  });
  it('keeps a single weigh-in without inventing a change', () => {
    const input = empty(); input.weights = [{ on: '2026-11-01', kg: 80 }];
    expect(weekReview(input, options).summary.weight).toMatchObject({ deltaKg: null, kgPerWeek: null, trend: null });
  });
  it.each([
    ['down', [80, 79, 78], -1, 'down'], ['up', [80, 81, 82], 1, 'up'],
    ['flat', [80, 80, 80], 0, 'flat'], ['small increase', [80, 80.06, 80.12], 0.1, 'flat'],
    ['flat boundary', [80, 80.1, 80.2], 0.1, 'up'],
  ] as const)('fits least-squares weight trend: %s', (_name, values, rate, trend) => {
    const input = empty();
    input.weights = [{ on: '2026-11-01', kg: values[0] }, { on: '2026-11-08', kg: values[1] }, { on: '2026-11-15', kg: values[2] }];
    expect(weekReview(input, options).summary.weight).toMatchObject({ kgPerWeek: rate, trend });
  });
  it('uses calendar spacing in regression rather than weigh-in indexes', () => {
    const input = empty();
    input.weights = [{ on: '2026-11-08', kg: 87 }, { on: '2026-11-01', kg: 80 }, { on: '2026-11-02', kg: 81 }];
    expect(weekReview(input, options).summary.weight).toMatchObject({ deltaKg: 7, kgPerWeek: 7, trend: 'up' });
  });
  it('does not fit a trend with three weights spanning only six days', () => {
    const input = empty(); input.weights = [{ on: '2026-11-01', kg: 80 }, { on: '2026-11-04', kg: 79 }, { on: '2026-11-07', kg: 78 }];
    expect(weekReview(input, options).summary.weight.kgPerWeek).toBeNull();
  });
  it('fits a trend at exactly seven elapsed days', () => {
    const input = empty();
    input.weights = [{ on: '2026-11-01', kg: 80 }, { on: '2026-11-04', kg: 80 - 3 / 7 }, { on: '2026-11-08', kg: 79 }];
    expect(weekReview(input, options).summary.weight).toMatchObject({ kgPerWeek: -1, trend: 'down' });
  });
  it('does not divide by zero for repeated same-day weights', () => {
    const input = empty(); input.weights = [80, 81, 82].map(kg => ({ on: '2026-11-01', kg }));
    expect(weekReview(input, options).summary.weight.kgPerWeek).toBeNull();
  });
  it('compares only measurement keys at both endpoints and sorts them', () => {
    const input = empty();
    input.measurements = [{ on: '2026-11-07', values: { waist: 89.24, arm: 35.34, latestOnly: 5 } },
      { on: '2026-11-01', values: { waist: 90.16, arm: 35.12, firstOnly: 3 } }];
    expect(weekReview(input, options).summary.measurements).toEqual([
      { key: 'arm', first: 35.1, last: 35.3, delta: 0.2 }, { key: 'waist', first: 90.2, last: 89.2, delta: -0.9 },
    ]);
  });
  it('detects only load PRs with two known loads and improved status', () => {
    const input = empty();
    input.exercises = [exercise({ topLoadKg: 85.16 }), exercise({ status: 'new' }), exercise({ previousTopLoadKg: null }),
      exercise({ topLoadKg: null }), exercise({ topLoadKg: 80 }), exercise({ topLoadKg: 79 })];
    expect(weekReview(input, options).summary.prs).toEqual([{ exerciseId: ids.exercise, name: { ar: 'سكوات', en: 'Squat' }, topLoadKg: 85.2, previousTopLoadKg: 80 }]);
  });
  it.each([
    ['three sessions', 'maintained', 3, true], ['two sessions', 'maintained', 2, false],
    ['regression', 'regressed', 0, true], ['new exercise', 'new', 0, false],
  ] as const)('detects stalls: %s', (_name, status, stalledSessions, included) => {
    const input = empty(); input.exercises = [exercise({ status, stalledSessions })];
    expect(weekReview(input, options).summary.stalls).toHaveLength(included ? 1 : 0);
  });
  it('deduplicates flag categories by first occurrence and retains source evidence', () => {
    const input = empty(); input.redFlags = [
      { id: ids.exercise, category: 'medication', source: 'message' },
      { id: ids.second, category: 'pregnancy', source: 'checkin' },
      { id: ids.third, category: 'medication', source: 'meal_note' },
    ];
    expect(weekReview(input, options).summary.redFlags).toEqual(input.redFlags.slice(0, 2));
    expect(weekReview(input, options).mustHandleFlags).toBe(true);
  });
  it('passes through attention reasons with their parameters', () => {
    const input = empty(); input.attention = { clientId: ids.client, score: 20, primaryAction: 'review',
      reasons: [{ code: 'checkin_waiting', params: { days: 2 } }] };
    expect(weekReview(input, options).summary.attentionReasons).toEqual(input.attention.reasons);
  });
});

describe('review templates', () => {
  it.each([
    ['Egyptian', 'ar', 'egyptian', 'يا Omar'], ['Gulf', 'ar', 'gulf', 'يا Omar'], ['English', 'en', 'gulf', 'Hi Omar'],
  ] as const)('uses the %s greeting and metadata', (_name, locale, dialect, greeting) => {
    const input = empty(); input.coach.dialect = dialect;
    const draft = weekReview(input, { locale }).draft;
    expect(draft.text).toContain(greeting);
    expect(draft.dialect).toBe(locale === 'en' ? null : dialect);
    expect(draft.locale).toBe(locale);
  });
  it('exports all three editable copy sets', () => {
    expect(Object.keys(REVIEW_TEMPLATES).sort()).toEqual(['ar', 'en']);
    expect(Object.keys(REVIEW_TEMPLATES.ar).sort()).toEqual(['egyptian', 'gulf']);
  });
  it.each([[4, 5, 'Great consistency'], [2, 5, 'one session at a time'], [1, 2, '']] as const)(
    'uses workout encouragement at %i of %i', (done, planned, phrase) => {
      const input = empty(); input.workouts.done = done; input.workouts.planned = planned;
      const text = weekReview(input, options).draft.text;
      expect(text).toContain(`${done} of ${planned}`);
      if (phrase) expect(text).toContain(phrase);
      else { expect(text).not.toContain('Great consistency'); expect(text).not.toContain('one session at a time'); }
    });
  it('includes meal logging, goal context, PRs and stalls in the required order', () => {
    const input = proposalInput();
    input.exercises = [exercise(), exercise({ exerciseId: ids.second, name: { en: 'Row' }, stalledSessions: 3 })];
    const lines = weekReview(input, options).draft.text.split('\n');
    expect(lines[1]).toContain('4 of 5'); expect(lines[2]).toContain('8 of 10'); expect(lines[3]).toContain('loss goal');
    expect(lines[4]).toContain('Squat'); expect(lines[5]).toContain('Row'); expect(lines[6]).toContain('coming week');
  });
  it('lists at most two exercises per PR and stall line and falls back across locales', () => {
    const input = empty(); input.exercises = [exercise({ name: { ar: 'سكوات' }, stalledSessions: 3 }),
      exercise({ exerciseId: ids.second, name: { en: 'Row' }, stalledSessions: 3 }),
      exercise({ exerciseId: ids.third, name: { en: 'Third' }, stalledSessions: 3 })];
    const text = weekReview(input, options).draft.text;
    expect(text).toContain('سكوات'); expect(text).toContain('Row'); expect(text).not.toContain('Third');
  });
  it('appends signature phrases exactly in input order', () => {
    const input = empty(); input.coach.signaturePhrases = ['واحدة واحدة', 'Keep showing up'];
    expect(weekReview(input, options).draft.text.endsWith('واحدة واحدة\nKeep showing up')).toBe(true);
  });
  it('is deterministic and leaves the complete input untouched', () => {
    const input = proposalInput(); const before = structuredClone(input);
    expect(weekReview(input, options)).toEqual(weekReview(input, options));
    expect(input).toEqual(before);
  });
  const categories: (RedFlagCategory | 'other')[] = ['pain_injury', 'eating_disorder', 'pregnancy', 'medication', 'other'];
  for (const locale of ['ar', 'en'] as const) for (const dialect of ['egyptian', 'gulf'] as const) {
    it.each(categories)(`keeps ${locale}/${dialect} draft free of safety terms for %s`, category => {
      const input = proposalInput(); input.coach.dialect = dialect;
      input.exercises = [exercise({ stalledSessions: 3 })];
      input.checkin.current = snapshot([answer('private', 'text', 'pain, pregnancy, medication, binge eating')]);
      const normal = weekReview(input, { locale }).draft.text;
      input.redFlags = [{ id: ids.third, category, source: 'checkin' }];
      const result = weekReview(input, { locale });
      expect(result.mustHandleFlags).toBe(true); expect(result.proposals).toEqual([]);
      expect(result.draft.text).toBe(normal); expect(detectRedFlags(result.draft.text)).toEqual([]);
    });
  }
  it.each(['lose', 'gain', 'maintain', null] as const)('describes weight relative to goal %s without plan advice', goal => {
    const input = proposalInput(); input.client.goal = goal;
    expect(weekReview(input, options).draft.text).toContain('Weight');
    expect(weekReview(input, options).draft.text).not.toContain('calories');
  });
  it('keeps Western digits in Arabic output', () => {
    const text = weekReview(proposalInput(), { locale: 'ar' }).draft.text;
    expect(text).toContain('4'); expect(text).not.toMatch(/[٠-٩۰-۹]/u);
  });
});

describe('rule-based proposals', () => {
  it.each([['lose', 'lower_kcal_flat', -100, 1900, 175], ['gain', 'raise_kcal_flat', 100, 2100, 225]] as const)(
    'proposes a flat-weight change for %s at both 80 percent thresholds and 14 elapsed days', (goal, code, deltaKcal, kcal, carbsG) => {
      const result = weekReview(proposalInput(goal), options).proposals;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ code, change: { kind: 'nutrition_targets', fromVersionId: ids.version, deltaKcal,
        targets: { ...targets, kcal, carbsG } } });
    });
  it.each(['lose', 'gain'] as const)('does not propose a flat %s change before 14 elapsed days', goal => {
    const input = proposalInput(goal); input.weights[0]!.on = '2026-10-25';
    expect(weekReview(input, options).proposals).toEqual([]);
  });
  it.each(['lose', 'gain'] as const)('proposes a flat %s change beyond the span and adherence thresholds', goal => {
    const input = proposalInput(goal);
    input.weights[0]!.on = '2026-10-23';
    input.workouts.done = 5; input.meals.daysLogged = 9;
    expect(weekReview(input, options).proposals).toHaveLength(1);
  });
  it.each(['workout', 'meal'] as const)('does not round sub-80 percent %s adherence into eligibility', kind => {
    const input = proposalInput();
    if (kind === 'workout') input.workouts = { planned: 49, done: 39, previousPlanned: 0, previousDone: 0 };
    else { input.meals.daysLogged = 11; input.meals.daysInPeriod = 14; }
    expect(weekReview(input, options).proposals).toEqual([]);
  });
  it('does not propose from a displayed flat rate when the raw slope is at least 0.1', () => {
    const input = proposalInput(); input.weights[1]!.kg = 80.1; input.weights[2]!.kg = 80.2;
    expect(weekReview(input, options).summary.weight.trend).toBe('up');
    expect(weekReview(input, options).proposals).toEqual([]);
  });
  it.each([[-1, true], [-1.01, true], [-0.99, false]] as const)('handles loss rate %s at the fast-loss boundary', (rate, matches) => {
    const input = proposalInput(); input.weights[1]!.kg = 80 + rate; input.weights[2]!.kg = 80 + rate * 2;
    const proposals = weekReview(input, options).proposals;
    expect(proposals).toHaveLength(matches ? 1 : 0);
    if (matches) expect(proposals[0]).toMatchObject({ code: 'slow_loss_too_fast', change: { deltaKcal: 100, targets: { kcal: 2100, carbsG: 225 } } });
  });
  it('does not require adherence for the fast-loss rule', () => {
    const input = proposalInput(); input.weights[1]!.kg = 79; input.weights[2]!.kg = 78;
    input.workouts.planned = 0; input.meals.nutritionAssigned = false;
    expect(weekReview(input, options).proposals[0]?.code).toBe('slow_loss_too_fast');
  });
  it.each(['no nutrition', 'open flag', 'maintain goal', 'no meal plan', 'no weights', 'no workouts'] as const)('suppresses proposals: %s', reason => {
    const input = proposalInput();
    if (reason === 'no nutrition') input.nutrition = null;
    if (reason === 'open flag') input.redFlags = [{ id: ids.third, category: 'other', source: 'message' }];
    if (reason === 'maintain goal') input.client.goal = 'maintain';
    if (reason === 'no meal plan') input.meals.nutritionAssigned = false;
    if (reason === 'no weights') input.weights = [];
    if (reason === 'no workouts') input.workouts.planned = 0;
    expect(weekReview(input, options).proposals).toEqual([]);
  });
  it.each([1200, 1190] as const)('emits no reduction blocked by the floor at %i kcal', kcal => {
    const input = proposalInput(); input.nutrition!.targets.kcal = kcal;
    expect(weekReview(input, options).proposals).toEqual([]);
  });
  it('uses actual delta for a partial change at the 1200 kcal floor', () => {
    const input = proposalInput(); input.nutrition!.targets.kcal = 1250;
    expect(weekReview(input, options).proposals[0]?.change).toMatchObject({ deltaKcal: -50, targets: { kcal: 1200, carbsG: 188 } });
  });
  it('floors carbs at zero and rounds calorie and carb targets', () => {
    const input = proposalInput(); input.nutrition!.targets = { ...targets, kcal: 2003, carbsG: 10 };
    expect(weekReview(input, options).proposals[0]?.change).toMatchObject({ deltaKcal: -98, targets: { kcal: 1905, carbsG: 0 } });
  });
});

describe('applying nutrition changes', () => {
  it.each([false, true])('applies the change with dayTypes=%s without mutating the original', withDayTypes => {
    const input = document(withDayTypes); const before = structuredClone(input);
    const result = applyNutritionChange(input, change(), ids.version);
    expect(result.targets).toEqual({ ...targets, kcal: 1900, carbsG: 175 });
    expect(input).toEqual(before); expect(result).not.toBe(input); expect(result.meals).toEqual(input.meals);
    expect(result.supplements).toEqual(input.supplements);
    expect(result.instructions).toEqual(input.instructions);
    if (withDayTypes) {
      expect(result.dayTypes?.training).toEqual({ ...targets, kcal: 2100, carbsG: 175 });
      expect(result.dayTypes?.rest).toEqual({ ...targets, kcal: 1200, carbsG: 0 });
    } else expect(result.dayTypes).toBeUndefined();
    expect(NutritionDocument.safeParse(result).success).toBe(true);
  });
  it('shifts both day types upwards by the same delta', () => {
    const result = applyNutritionChange(document(true), change(100), ids.version);
    expect(result.dayTypes?.training).toMatchObject({ kcal: 2300, carbsG: 225 });
    expect(result.dayTypes?.rest).toMatchObject({ kcal: 1350, carbsG: 35 });
  });
  it('keeps protein and fat unchanged even when their source values have decimals', () => {
    const input = document(); input.targets.proteinG = 150.4; input.targets.fatG = 60.3;
    expect(applyNutritionChange(input, change(), ids.version).targets).toMatchObject({ proteinG: 150.4, fatG: 60.3 });
  });
  it('throws a stable ReviewError on version mismatch', () => {
    expect(() => applyNutritionChange(document(), change(), ids.third)).toThrow(ReviewError);
    expect(() => applyNutritionChange(document(), change(), ids.third)).toThrow(expect.objectContaining({ code: 'proposal_version_mismatch' }));
  });
  it('validates a nutrition document rather than trusting a cast', () => {
    const input = document(); input.meals = [];
    expect(() => applyNutritionChange(input, change(), ids.version)).toThrow(ZodError);
  });
  it('applies its own partially floored proposal to the matching source targets', () => {
    const input = proposalInput(); input.nutrition!.targets.kcal = 1250;
    const proposal = weekReview(input, options).proposals[0]!;
    const source = document(); source.targets = { ...input.nutrition!.targets };
    expect(applyNutritionChange(source, proposal.change, ids.version).targets).toEqual(proposal.change.targets);
  });
});

describe('canonical input binding', () => {
  it('is equal after shuffling all unordered arrays and nested object keys', () => {
    const input = proposalInput();
    input.exercises = [exercise(), exercise({ exerciseId: ids.second, name: { en: 'Row', ar: 'سحب' } })];
    input.measurements = [{ on: '2026-11-01', values: { waist: 90, arm: 35 } }, { on: '2026-11-07', values: { waist: 89, arm: 36 } }];
    input.redFlags = [{ id: ids.exercise, category: 'pregnancy', source: 'message' }, { id: ids.second, category: 'other', source: 'checkin' }];
    input.checkin.current = snapshot([answer('b', 'scale', 2), answer('a', 'text', 'OK')]);
    input.checkin.previous = snapshot([answer('z', 'boolean', false), answer('x', 'number', 5)]);
    const shuffled = structuredClone(input);
    shuffled.weights.reverse(); shuffled.exercises.reverse(); shuffled.redFlags.reverse(); shuffled.measurements.reverse();
    shuffled.checkin.current!.answers.reverse(); shuffled.checkin.previous!.answers.reverse();
    shuffled.measurements[0]!.values = { arm: 36, waist: 89 };
    shuffled.exercises[0]!.name = { ar: 'سحب', en: 'Row' };
    expect(canonicalReviewInput(shuffled)).toBe(canonicalReviewInput(input));
    expect(JSON.parse(canonicalReviewInput(input))).toMatchObject({ client: input.client });
  });
  it('uses deterministic tie breaks for duplicate dates and question IDs', () => {
    const input = empty(); input.weights = [{ on: '2026-11-01', kg: 80 }, { on: '2026-11-01', kg: 81 }];
    input.checkin.current = snapshot([answer('a', 'text', 'second'), answer('a', 'text', 'first')]);
    const other = structuredClone(input); other.weights.reverse(); other.checkin.current!.answers.reverse();
    expect(canonicalReviewInput(input)).toBe(canonicalReviewInput(other));
  });
  it('differs for one changed value', () => {
    const input = proposalInput(); const changed = structuredClone(input); changed.weights[0]!.kg = 80.1;
    expect(canonicalReviewInput(input)).not.toBe(canonicalReviewInput(changed));
  });
  it('preserves signature order because it affects the message', () => {
    const input = empty(); input.coach.signaturePhrases = ['First', 'Second'];
    const changed = structuredClone(input); changed.coach.signaturePhrases.reverse();
    expect(canonicalReviewInput(input)).not.toBe(canonicalReviewInput(changed));
  });
});

describe('external input validation', () => {
  it.each([
    ['reversed period', (input: WeekReviewInput) => { input.period.to = '2026-10-31'; }],
    ['15 inclusive days', (input: WeekReviewInput) => { input.period.to = '2026-11-15'; }],
    ['invalid date', (input: WeekReviewInput) => { input.period.to = '2026-02-30'; }],
    ['invalid UUID', (input: WeekReviewInput) => { input.client.id = 'client'; }],
    ['fractional workout count', (input: WeekReviewInput) => { input.workouts.done = 1.5; }],
    ['negative weight', (input: WeekReviewInput) => { input.weights = [{ on: '2026-11-01', kg: -1 }]; }],
    ['too many phrases', (input: WeekReviewInput) => { input.coach.signaturePhrases = ['a', 'b', 'c', 'd', 'e', 'f']; }],
    ['empty name', (input: WeekReviewInput) => { input.client.firstName = ''; }],
    ['nonfinite measurement', (input: WeekReviewInput) => { input.measurements = [{ on: '2026-11-01', values: { waist: Infinity } }]; }],
    ['101 exercises', (input: WeekReviewInput) => { input.exercises = Array.from({ length: 101 }, () => exercise()); }],
    ['61 weights', (input: WeekReviewInput) => { input.weights = Array.from({ length: 61 }, () => ({ on: '2026-11-01', kg: 80 })); }],
    ['31 measurement sets', (input: WeekReviewInput) => { input.measurements = Array.from({ length: 31 }, () => ({ on: '2026-11-01', values: {} })); }],
  ] as const)('rejects %s with ZodError', (_name, mutate) => {
    const input = empty(); mutate(input);
    expect(() => WeekReviewInput.parse(input)).toThrow(ZodError);
    expect(() => weekReview(input, options)).toThrow(ZodError);
    expect(() => canonicalReviewInput(input)).toThrow(ZodError);
  });
  it.each(['2026-11-01', '2026-11-14'])('accepts a valid inclusive period ending %s', to => {
    const input = empty(); input.period.to = to;
    expect(WeekReviewInput.safeParse(input).success).toBe(true);
  });
});
