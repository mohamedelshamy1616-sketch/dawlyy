import { describe, expect, it } from 'vitest';
import { FormDocument } from '@dawlyy/core/types';
import { eventBucket, eventStatus, operatorsFor, visibilitySummary } from './presentation';

const now = Date.parse('2026-11-10T12:00:00Z');
const past = '2026-11-09T08:00:00Z';
const future = '2026-11-12T08:00:00Z';

describe('Task 7 client status mapping', () => {
  it('maps events to the fixed status vocabulary', () => {
    expect(eventStatus({ state: 'due', dueAt: past, submission: null }, now)).toBe('due');
    expect(eventStatus({ state: 'overdue', dueAt: past, submission: null }, now)).toBe('overdue');
    expect(eventStatus({ state: 'scheduled', dueAt: future, submission: null }, now)).toBe('upcoming');
    expect(eventStatus({ state: 'completed', dueAt: past, submission: { state: 'submitted' } }, now)).toBe('waitingForCoach');
    expect(eventStatus({ state: 'completed', dueAt: past, submission: { state: 'reviewed' } }, now)).toBe('complete');
    expect(eventStatus({ state: 'skipped', dueAt: past, submission: null }, now)).toBe('skipped');
  });
  it('keeps a saved draft due until it is submitted', () => {
    expect(eventStatus({ state: 'due', dueAt: past, submission: { state: 'due' } }, now)).toBe('due');
  });
  it('groups statuses into due, upcoming and past', () => {
    expect(eventBucket('overdue')).toBe('due');
    expect(eventBucket('upcoming')).toBe('upcoming');
    expect(['waitingForCoach', 'complete', 'skipped'].map(value => eventBucket(value as 'complete'))).toEqual(['past', 'past', 'past']);
  });
});

describe('Task 7 visibility rule presentation', () => {
  const document = FormDocument.parse({ sections: [{ id: 's', title: { en: 'S' }, questions: [
    { id: 'plan', type: 'single', label: { en: 'Plan' }, options: [{ value: 'o1', label: { en: 'Cut' } }, { value: 'o2', label: { en: 'Bulk' } }] },
    { id: 'x', type: 'text', label: { en: 'X' }, visibleIf: { questionId: 'plan', op: 'in', value: ['o1', 'o2'] } },
  ] }] });
  it('shows option labels instead of stored values', () => {
    const rule = document.sections[0]!.questions[1]!.visibleIf!;
    expect(visibilitySummary(document, rule, 'en', { in: 'is one of' })).toBe('Plan is one of Cut, Bulk');
  });
  it('offers only operators the core evaluator supports for the referenced type', () => {
    expect(operatorsFor('multi')).toEqual(['in', 'answered']);
    expect(operatorsFor('photo')).toEqual(['answered']);
    expect(operatorsFor('number')).toContain('gt');
    expect(operatorsFor('yes_no')).not.toContain('gt');
    expect(operatorsFor(undefined)).toEqual(['eq', 'neq', 'answered']);
  });
});
