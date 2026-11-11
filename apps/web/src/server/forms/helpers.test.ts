import { describe, expect, it } from 'vitest';
import { FormDocument } from '@dawlyy/core/types';
import { encodeCursor } from '../../api/lib/pagination';
import { draftIssues, formCursor, mappedMetrics, visibilitySummary } from './helpers';

const document = FormDocument.parse({ sections: [{ id: 'section', title: { en: 'Health' }, questions: [
  { id: 'train', type: 'yes_no', label: { en: 'Training?' } },
  { id: 'weight', type: 'number', label: { en: 'Weight' }, required: true, metricKey: 'weight', unit: 'kg', visibleIf: { questionId: 'train', op: 'eq', value: true } },
  { id: 'waist', type: 'number', label: { en: 'Waist' }, metricKey: 'waist', unit: 'cm' },
] }] });

describe('Task 7 pure form boundaries', () => {
  it('maps only visible finite answers, retaining custom measurement keys and units', () => {
    expect(mappedMetrics(document, { train: false, weight: 90, waist: 82 })).toEqual([
      { questionId: 'waist', metric: 'custom', metricKey: 'waist', value: 82, unit: 'cm' },
    ]);
    expect(mappedMetrics(document, { train: true, weight: 90 })[0]).toMatchObject({ metric: 'weight', value: 90, unit: 'kg' });
  });
  it('allows incomplete drafts but identifies publish errors and forward references', () => {
    expect(draftIssues(document)).toEqual([]);
    const bad = structuredClone(document);
    bad.sections[0]!.questions[0]!.visibleIf = { questionId: 'weight', op: 'answered' };
    expect(draftIssues(bad)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'forward_reference' })]));
    bad.sections[0]!.questions[0]!.type = 'single';
    expect(draftIssues(bad)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'missing_options' })]));
  });
  it('summarizes visibility using the referenced label and translated operator', () => {
    const condition = document.sections[0]!.questions[1]!.visibleIf!;
    expect(visibilitySummary(document, condition, 'en', { eq: 'equals', yes: 'Yes', no: 'No' })).toBe('Training? equals Yes');
  });
  it('preserves microsecond timestamps and rejects wrong cursor shapes', () => {
    const stamp = '2026-11-09T10:00:00.123456Z';
    const id = '11111111-1111-4111-8111-111111111111';
    expect(formCursor({ cursor: encodeCursor({ k: stamp, id }) }).cursor).toEqual({ k: stamp, id });
    expect(() => formCursor({ cursor: encodeCursor({ k: 42, id }) })).toThrow();
    expect(() => formCursor({ cursor: encodeCursor({ k: stamp, id: 'invalid' }) })).toThrow();
  });
});
