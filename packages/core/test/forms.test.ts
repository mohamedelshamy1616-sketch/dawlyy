import { describe, it, expect } from 'vitest';
import { FormDocument, type Answers, type Question, type VisibilityCondition } from '../src/types';
import {
  FormsError, questionsById, evaluateVisibility, validateAnswers,
  validateDocument, metricAnswers, completion,
} from '../src/forms';

const question = (id: string, fields: Partial<Question> = {}): Question => ({
  id, type: 'text', label: { ar: 'إجابتك', en: 'Your answer' }, required: false, ...fields,
});
const document = (...questions: Question[]): FormDocument => ({
  schemaVersion: 1,
  sections: [{ id: 'section', title: { ar: 'المتابعة', en: 'Check-in' }, questions }],
});
const options = [
  { value: 'gym', label: { ar: 'الجيم', en: 'Gym' } },
  { value: 'home', label: { ar: 'البيت', en: 'Home' } },
];

describe('forms visibility', () => {
  it('indexes questions across sections', () => {
    const doc = document(question('a'));
    doc.sections.push({ id: 'other', title: { en: 'Other' }, questions: [question('b')] });
    expect([...questionsById(doc).keys()]).toEqual(['a', 'b']);
  });

  it('hides required questions and their dependents regardless of document order', () => {
    const doc = document(
      question('c', { required: true, visibleIf: { questionId: 'b', op: 'answered' } }),
      question('b', { required: true, visibleIf: { questionId: 'a', op: 'eq', value: true } }),
      question('a', { type: 'yes_no', required: true }),
    );
    const result = evaluateVisibility(doc, { a: false, b: 'stale answer' });
    expect([...result.visible]).toEqual(['a']);
    expect([...result.hidden]).toEqual(['c', 'b']);
    expect(result.missingRequired).toEqual([]);
  });

  it.each([
    ['eq', '72', 72, true], ['eq', 'false', false, true],
    ['eq', 1, true, false], ['neq', '72', 72, false],
    ['neq', 'gym', 'home', true], ['gt', '11', 10, true],
    ['lt', 9, '10', true], ['gt', '', -1, false],
    ['lt', false, 1, false], ['gt', 'bad', 0, false],
    ['in', ['home', 'gym'], ['gym'], true], ['in', 'gym', ['home'], false],
    ['in', '72', [72], true], ['in', 'gym', 'gym', false],
  ] as Array<[VisibilityCondition['op'], Answers[string], VisibilityCondition['value'], boolean]>)
  ('evaluates %s for %j against %j', (op, answer, value, visible) => {
    const doc = document(question('source'), question('dependent', {
      visibleIf: { questionId: 'source', op, value },
    }));
    expect(evaluateVisibility(doc, { source: answer }).visible.has('dependent')).toBe(visible);
  });

  it.each([{ answer: null }, { answer: '' }, { answer: [] }, { answer: { mediaIds: [] } }])
  ('treats $answer as unanswered', ({ answer }) => {
    const doc = document(question('source', { required: true }), question('dependent', {
      visibleIf: { questionId: 'source', op: 'answered' },
    }));
    const result = evaluateVisibility(doc, { source: answer });
    expect(result.visible.has('dependent')).toBe(false);
    expect(result.missingRequired).toEqual(['source']);
  });

  it.each([false, 0, { mediaIds: ['photo-1'] }])('counts %j as answered', (answer) => {
    const doc = document(question('source'), question('dependent', {
      visibleIf: { questionId: 'source', op: 'answered' },
    }));
    expect(evaluateVisibility(doc, { source: answer }).visible.has('dependent')).toBe(true);
  });

  it('fails open for dangling references but does not use unknown answers', () => {
    const doc = document(question('a', { required: true,
      visibleIf: { questionId: 'missing', op: 'eq', value: true } }));
    expect(evaluateVisibility(doc, { missing: false }).missingRequired).toEqual(['a']);
  });

  it('does not mistake inherited object properties for submitted answers', () => {
    const doc = document(question('toString', { required: true }), question('dependent', {
      visibleIf: { questionId: 'toString', op: 'answered' },
    }));
    expect(evaluateVisibility(doc, {}).missingRequired).toEqual(['toString']);
    expect(evaluateVisibility(doc, {}).hidden.has('dependent')).toBe(true);
    expect(completion(doc, {})).toEqual({ answered: 0, total: 1, pct: 0 });
    expect(validateAnswers(doc, {}).map((issue) => issue.code)).toEqual(['required']);
  });

  it('terminates and hides circular dependencies and their dependents', () => {
    const doc = document(
      question('a', { visibleIf: { questionId: 'b', op: 'answered' } }),
      question('b', { visibleIf: { questionId: 'a', op: 'answered' } }),
      question('c', { visibleIf: { questionId: 'a', op: 'answered' } }),
    );
    expect([...evaluateVisibility(doc, { a: 'yes', b: 'yes' }).hidden]).toEqual(['a', 'b', 'c']);
  });
});

describe('answer validation', () => {
  it('reports range, option, type and unknown-question issues with both languages', () => {
    const doc = document(question('weight', { type: 'number', max: 100 }),
      question('place', { type: 'single', options }), question('pain', { type: 'yes_no' }));
    const issues = validateAnswers(doc, { weight: 101, place: 'outside', pain: 'yes', ghost: 1 });
    expect(issues.map(({ questionId, code }) => ({ questionId, code }))).toEqual([
      { questionId: 'weight', code: 'range' }, { questionId: 'place', code: 'option' },
      { questionId: 'pain', code: 'type' }, { questionId: 'ghost', code: 'unknown_question' },
    ]);
    for (const issue of issues) {
      expect(issue.message.ar).toBeTruthy();
      expect(issue.message.en).toBeTruthy();
    }
  });

  it('validates only visible questions and still rejects unknown ids', () => {
    const doc = document(question('a', { type: 'yes_no' }), question('hidden', {
      type: 'number', required: true, visibleIf: { questionId: 'a', op: 'eq', value: true },
    }));
    expect(validateAnswers(doc, { a: false, hidden: 'bad' })).toEqual([]);
  });

  it('reports required for absent and empty answers while accepting optional omissions', () => {
    const doc = document(question('absent', { required: true }), question('null', { required: true }),
      question('text', { required: true }), question('multi', { type: 'multi', options, required: true }),
      question('photo', { type: 'photo', required: true }), question('optional'));
    expect(validateAnswers(doc, { null: null, text: '', multi: [], photo: { mediaIds: [] } })
      .map((issue) => [issue.questionId, issue.code])).toEqual([
      ['absent', 'required'], ['null', 'required'], ['text', 'required'],
      ['multi', 'required'], ['photo', 'required'],
    ]);
  });

  it('accepts valid answers for every supported question type', () => {
    const doc = document(question('text'), question('long', { type: 'long_text' }),
      question('number', { type: 'number', min: 0, max: 10 }), question('date', { type: 'date' }),
      question('time', { type: 'time' }), question('yes', { type: 'yes_no' }),
      question('single', { type: 'single', options }), question('multi', { type: 'multi', options }),
      question('scale', { type: 'scale', scale: { min: 1, max: 5 } }),
      ...(['photo', 'video', 'file'] as const).map((type) => question(type, { type, required: true })));
    expect(validateAnswers(doc, { text: 'ok', long: 'details', number: 0, date: '2024-02-29',
      time: '23:59', yes: false, single: 'gym', multi: ['gym', 'home'], scale: 5,
      photo: { mediaIds: ['p'] }, video: { mediaIds: ['v'] }, file: { mediaIds: ['f'] },
    })).toEqual([]);
  });

  it('accepts inclusive numeric and scale boundaries and empty optional media', () => {
    const doc = document(question('number', { type: 'number', min: 0, max: 10 }),
      question('scale', { type: 'scale', scale: { min: 1, max: 5 } }),
      question('photo', { type: 'photo' }));
    expect(validateAnswers(doc, { number: 10, scale: 1, photo: { mediaIds: [] } })).toEqual([]);
  });

  it.each([
    ['text', 1, {}, 'type'], ['long_text', false, {}, 'type'],
    ['number', '10', {}, 'type'], ['number', Number.NaN, {}, 'type'],
    ['number', Infinity, {}, 'type'], ['number', -1, { min: 0 }, 'range'],
    ['date', '2023-02-29', {}, 'type'], ['date', '2026-04-31', {}, 'type'],
    ['date', '2026-1-01', {}, 'type'], ['time', '24:00', {}, 'type'],
    ['time', '12:60', {}, 'type'], ['time', '9:00', {}, 'type'],
    ['single', ['gym'], { options }, 'type'], ['multi', 'gym', { options }, 'type'],
    ['multi', ['other'], { options }, 'option'],
    ['scale', 1.5, { scale: { min: 1, max: 5 } }, 'scale'],
    ['scale', 6, { scale: { min: 1, max: 5 } }, 'scale'],
    ['scale', '3', { scale: { min: 1, max: 5 } }, 'type'],
    ['scale', 3, {}, 'scale'], ['photo', 'id', {}, 'type'],
    ['video', { mediaIds: [''] }, {}, 'media'],
    ['file', { mediaIds: ['x'.repeat(65)] }, {}, 'media'],
  ] as Array<[Question['type'], Answers[string], Partial<Question>, string]>)
  ('rejects invalid %s answer %j', (type, answer, fields, code) => {
    const issues = validateAnswers(document(question('q', { type, ...fields })), { q: answer });
    expect(issues.map((issue) => issue.code)).toEqual([code]);
  });
});

describe('document validation and derived answers', () => {
  it('reports structural problems with stable paths across sections', () => {
    const doc = document(question('same'), question('dangling', {
      visibleIf: { questionId: 'unknown', op: 'answered' },
    }), question('single', { type: 'single' }), question('multi', { type: 'multi', options: [] }),
    question('scale', { type: 'scale' }), question('self', {
      visibleIf: { questionId: 'self', op: 'answered' },
    }));
    doc.sections.push({ id: 'second', title: { en: 'Second' }, questions: [question('same')] });
    expect(validateDocument(doc).map(({ path, code }) => ({ path, code }))).toEqual([
      { path: 'sections.0.questions.1.visibleIf.questionId', code: 'unknown_reference' },
      { path: 'sections.0.questions.2.options', code: 'missing_options' },
      { path: 'sections.0.questions.3.options', code: 'missing_options' },
      { path: 'sections.0.questions.4.scale', code: 'missing_scale' },
      { path: 'sections.0.questions.5.visibleIf.questionId', code: 'self_reference' },
      { path: 'sections.1.questions.0.id', code: 'duplicate_id' },
    ]);
  });

  it('accepts valid templates and rejects inverted scale bounds structurally', () => {
    expect(validateDocument(document(question('q', { type: 'single', options })))).toEqual([]);
    expect(validateDocument(document(question('q', { type: 'scale', scale: { min: 5, max: 1 } })))
      .map((issue) => issue.code)).toEqual(['missing_scale']);
  });

  it('extracts finite numeric metric answers without converting strings or booleans', () => {
    const doc = document(question('weight', { type: 'number', metricKey: 'weight' }),
      question('plain', { type: 'number' }), question('string', { metricKey: 'sleep' }),
      question('bool', { type: 'yes_no', metricKey: 'habit' }),
      question('bad', { type: 'number', metricKey: 'bad' }));
    expect(metricAnswers(doc, { weight: 0, plain: 10, string: '8', bool: true, bad: Infinity, unknown: 5 }))
      .toEqual([{ questionId: 'weight', metricKey: 'weight', value: 0 }]);
  });

  it('counts only answered visible questions and rounds to a whole percent', () => {
    const doc = document(question('a'), question('b'), question('c'), question('d'),
      question('hidden', { visibleIf: { questionId: 'a', op: 'eq', value: 'show' } }));
    expect(completion(doc, { a: 'answer', b: false, hidden: 'stale' })).toEqual({ answered: 2, total: 4, pct: 50 });
    expect(completion(document(question('a'), question('b'), question('c')), { a: 0 }))
      .toEqual({ answered: 1, total: 3, pct: 33 });
    expect(completion(document(), {})).toEqual({ answered: 0, total: 0, pct: 0 });
    expect(completion(document(question('a', { visibleIf: { questionId: 'a', op: 'answered' } })), {}))
      .toEqual({ answered: 0, total: 0, pct: 0 });
  });

  it('applies schema defaults without changing the supplied document', () => {
    const raw = { sections: [{ id: 's', title: { en: 'Section' }, questions: [
      { id: 'q', type: 'text', label: { en: 'Answer' } },
    ] }] };
    expect(questionsById(raw as FormDocument).get('q')?.required).toBe(false);
    expect(raw).not.toHaveProperty('schemaVersion');
  });

  it('wraps schema failures in FormsError for every document entry point', () => {
    const bad = { schemaVersion: 1, sections: [] } as unknown as FormDocument;
    const calls = [() => questionsById(bad), () => evaluateVisibility(bad, {}),
      () => validateAnswers(bad, {}), () => validateDocument(bad),
      () => metricAnswers(bad, {}), () => completion(bad, {})];
    for (const call of calls) {
      expect(call).toThrow(FormsError);
      expect(call).toThrow(expect.objectContaining({ code: 'invalid_document' }));
    }
  });
});
