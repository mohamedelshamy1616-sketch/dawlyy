import { describe, expect, it } from 'vitest';
import { FormDocument } from '@dawlyy/core/types';
import { validateDocument } from '@dawlyy/core/forms';
import { addQuestion, addSection, earlierQuestions, moveQuestion, moveSection, newQuestion, newSection, removeQuestion, removeSection, sanitizeVisibility, updateQuestion, updateSection } from './doc-ops';

const base = FormDocument.parse({ sections: [
  { id: 's1', title: { en: 'One' }, questions: [
    { id: 'a', type: 'yes_no', label: { en: 'A' } },
    { id: 'b', type: 'text', label: { en: 'B' }, visibleIf: { questionId: 'a', op: 'eq', value: true } },
  ] },
  { id: 's2', title: { en: 'Two' }, questions: [{ id: 'c', type: 'number', label: { en: 'C' }, visibleIf: { questionId: 'b', op: 'answered' } }] },
] });

describe('Task 7 builder document operations', () => {
  it('lists only earlier questions as visibility targets', () => {
    expect(earlierQuestions(base, 'a')).toEqual([]);
    expect(earlierQuestions(base, 'c').map(question => question.id)).toEqual(['a', 'b']);
    expect(earlierQuestions(base, 'missing')).toEqual([]);
  });
  it('builds starting questions that publish cleanly except for missing options', () => {
    expect(newQuestion('scale', 'q', { en: 'Scale' }).scale).toEqual({ min: 1, max: 10 });
    const single = addQuestion(base, 's1', newQuestion('single', 'd', { en: 'D' }));
    expect(validateDocument(single).map(issue => issue.code)).toContain('missing_options');
    const text = addQuestion(base, 's1', newQuestion('long_text', 'e', { en: 'E' }));
    expect(validateDocument(text)).toEqual([]);
  });
  it('never mutates its input and keeps a section when it is the last one', () => {
    const before = JSON.stringify(base);
    const added = addSection(base, newSection('s3', { en: 'Three' }), 's1');
    expect(added.sections.map(section => section.id)).toEqual(['s1', 's3', 's2']);
    expect(JSON.stringify(base)).toBe(before);
    const single = FormDocument.parse({ sections: [{ id: 'only', title: { en: 'Only' }, questions: [] }] });
    expect(removeSection(single, 'only')).toBe(single);
  });
  it('removes a question together with the rules that depended on it', () => {
    const next = removeQuestion(base, 'a');
    expect(next.sections[0]?.questions.map(question => question.id)).toEqual(['b']);
    expect(next.sections[0]?.questions[0]?.visibleIf).toBeUndefined();
    expect(next.sections[1]?.questions[0]?.visibleIf).toEqual({ questionId: 'b', op: 'answered' });
  });
  it('drops a rule that would point forward after a move', () => {
    const moved = moveQuestion(base, 'a', 1);
    expect(moved.sections[0]?.questions.map(question => question.id)).toEqual(['b', 'a']);
    expect(moved.sections[0]?.questions[0]?.visibleIf).toBeUndefined();
    expect(moveQuestion(base, 'a', -1)).toBe(base);
  });
  it('moves a question across a section boundary', () => {
    const down = moveQuestion(base, 'b', 1);
    expect(down.sections[0]?.questions.map(question => question.id)).toEqual(['a']);
    expect(down.sections[1]?.questions.map(question => question.id)).toEqual(['b', 'c']);
    const up = moveQuestion(base, 'c', -1);
    expect(up.sections[0]?.questions.map(question => question.id)).toEqual(['a', 'b', 'c']);
  });
  it('moves sections and cleans rules that now point forward', () => {
    const moved = moveSection(base, 's2', -1);
    expect(moved.sections.map(section => section.id)).toEqual(['s2', 's1']);
    expect(moved.sections[0]?.questions[0]?.visibleIf).toBeUndefined();
    expect(moveSection(base, 's1', -1)).toBe(base);
  });
  it('updates titles and questions in place and clears an empty description', () => {
    const titled = updateSection(base, 's1', { title: { ar: 'واحد', en: 'One' }, description: undefined });
    expect(titled.sections[0]?.title).toEqual({ ar: 'واحد', en: 'One' });
    expect(titled.sections[0]).not.toHaveProperty('description');
    const first = base.sections[0]!.questions[0]!;
    const retyped = updateQuestion(base, { ...first, required: true });
    expect(retyped.sections[0]?.questions[0]?.required).toBe(true);
    expect(sanitizeVisibility(base)).toEqual(base);
  });
});
