import {
  FormDocument, IsoDate, Id,
  type Question, type VisibilityCondition, type Answers, type AnswerValue, type LocalizedText,
} from '../types';

export class FormsError extends Error {
  readonly code = 'invalid_document';

  constructor() {
    super('Invalid form document.');
    this.name = 'FormsError';
  }
}

export type Visibility = { visible: Set<string>; hidden: Set<string>; missingRequired: string[] };

export type AnswerIssue = {
  questionId: string;
  code: 'required' | 'type' | 'option' | 'range' | 'scale' | 'media' | 'unknown_question';
  message: LocalizedText;
};

type DocumentIssue = {
  path: string;
  code: 'duplicate_id' | 'unknown_reference' | 'missing_options' | 'missing_scale' | 'self_reference';
  message: LocalizedText;
};

function parseDocument(doc: FormDocument): FormDocument {
  const parsed = FormDocument.safeParse(doc);
  if (!parsed.success) throw new FormsError();
  return parsed.data;
}

function allQuestions(doc: FormDocument): Question[] {
  return doc.sections.flatMap((section) => section.questions);
}

function indexQuestions(questions: readonly Question[]): Map<string, Question> {
  return new Map(questions.map((question) => [question.id, question]));
}

/** Index the schema-validated questions in section order. */
export function questionsById(doc: FormDocument): Map<string, Question> {
  return indexQuestions(allQuestions(parseDocument(doc)));
}

function answerFor(answers: Answers, questionId: string): AnswerValue | undefined {
  return Object.prototype.hasOwnProperty.call(answers, questionId) ? answers[questionId] : undefined;
}

function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Array.isArray(value.mediaIds) && value.mediaIds.length > 0;
  return true;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalized(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return numeric(value) ?? value;
}

function matches(condition: VisibilityCondition, answer: AnswerValue | undefined): boolean {
  switch (condition.op) {
    case 'answered': return isAnswered(answer);
    case 'eq': return normalized(answer) === normalized(condition.value);
    case 'neq': return normalized(answer) !== normalized(condition.value);
    case 'gt':
    case 'lt': {
      const left = numeric(answer);
      const right = numeric(condition.value);
      if (left === undefined || right === undefined) return false;
      return condition.op === 'gt' ? left > right : left < right;
    }
    case 'in': {
      if (!Array.isArray(condition.value)) return false;
      const candidates = condition.value.map(normalized);
      const selected = Array.isArray(answer) ? answer : [answer];
      return selected.some((value) => candidates.some((candidate) => candidate === normalized(value)));
    }
  }
}

function visibilityFor(questions: readonly Question[], answers: Answers): Visibility {
  const byId = indexQuestions(questions);
  const resolved = new Map<string, boolean>();

  function resolve(start: Question): boolean {
    // Walk dependencies iteratively: long chains and malformed cycles must terminate.
    const path: Question[] = [];
    const visiting = new Set<string>();
    let current = start;
    let visible: boolean;
    while (true) {
      const cached = resolved.get(current.id);
      if (cached !== undefined) {
        visible = cached;
        break;
      }
      if (visiting.has(current.id)) {
        visible = false;
        break;
      }
      const condition = current.visibleIf;
      const dependency = condition ? byId.get(condition.questionId) : undefined;
      if (!condition || !dependency) {
        // Broken references fail open until the coach repairs the template.
        visible = true;
        resolved.set(current.id, true);
        break;
      }
      visiting.add(current.id);
      path.push(current);
      current = dependency;
    }
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const question = path[index];
      if (!question) continue;
      const condition = question.visibleIf;
      visible = visible && !!condition && matches(condition, answerFor(answers, condition.questionId));
      resolved.set(question.id, visible);
    }
    return visible;
  }

  const visible = new Set<string>();
  const hidden = new Set<string>();
  const missingRequired: string[] = [];
  for (const question of questions) {
    if (resolve(question)) {
      visible.add(question.id);
      if (question.required && !isAnswered(answerFor(answers, question.id))) missingRequired.push(question.id);
    } else {
      hidden.add(question.id);
    }
  }
  return { visible, hidden, missingRequired };
}

/** Evaluate dependencies before testing their answers, so hidden answers cannot reveal a dependent. */
export function evaluateVisibility(doc: FormDocument, answers: Answers): Visibility {
  return visibilityFor(allQuestions(parseDocument(doc)), answers);
}

function answerIssue(question: Question, answer: AnswerValue): AnswerIssue['code'] | undefined {
  switch (question.type) {
    case 'text':
    case 'long_text': return typeof answer === 'string' ? undefined : 'type';
    case 'number':
      if (typeof answer !== 'number' || !Number.isFinite(answer)) return 'type';
      return (question.min !== undefined && answer < question.min)
        || (question.max !== undefined && answer > question.max) ? 'range' : undefined;
    case 'date': return typeof answer === 'string' && IsoDate.safeParse(answer).success ? undefined : 'type';
    case 'time': return typeof answer === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(answer) ? undefined : 'type';
    case 'yes_no': return typeof answer === 'boolean' ? undefined : 'type';
    case 'single':
      if (typeof answer !== 'string') return 'type';
      return question.options?.some((option) => option.value === answer) ? undefined : 'option';
    case 'multi':
      if (!Array.isArray(answer) || !answer.every((value) => typeof value === 'string')) return 'type';
      return answer.every((value) => question.options?.some((option) => option.value === value)) ? undefined : 'option';
    case 'scale':
      if (typeof answer !== 'number' || !Number.isFinite(answer)) return 'type';
      return question.scale && Number.isInteger(answer)
        && answer >= question.scale.min && answer <= question.scale.max ? undefined : 'scale';
    case 'photo':
    case 'video':
    case 'file':
      if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) return 'type';
      return Array.isArray(answer.mediaIds) && answer.mediaIds.every((id) => Id.safeParse(id).success)
        ? undefined : 'media';
  }
}

function answerMessage(code: AnswerIssue['code']): LocalizedText {
  switch (code) {
    case 'required': return { ar: 'جاوب على السؤال ده عشان تكمّل.', en: 'Answer this required question to continue.' };
    case 'type': return { ar: 'اكتب الإجابة بالشكل المطلوب للسؤال ده.', en: 'Use the answer format requested for this question.' };
    case 'option': return { ar: 'اختار إجابة من الاختيارات الموجودة.', en: 'Choose from the available options.' };
    case 'range': return { ar: 'اكتب رقم جوّه الحدود المحددة للسؤال.', en: 'Enter a number within the allowed range.' };
    case 'scale': return { ar: 'اختار رقم صحيح على المقياس المحدد.', en: 'Choose a whole number within the scale bounds.' };
    case 'media': return { ar: 'المرفقات مش سليمة. ارفعها تاني.', en: 'The attachments are invalid. Upload them again.' };
    case 'unknown_question': return { ar: 'الإجابة دي لسؤال مش موجود في الاستمارة.', en: 'This answer belongs to a question outside this form.' };
  }
}

/** Validate visible answers; stale hidden answers remain ignored when a branch is closed. */
export function validateAnswers(doc: FormDocument, answers: Answers): AnswerIssue[] {
  const questions = allQuestions(parseDocument(doc));
  const { visible } = visibilityFor(questions, answers);
  const issues: AnswerIssue[] = [];
  for (const question of questions) {
    if (!visible.has(question.id)) continue;
    const answer = answerFor(answers, question.id);
    const code = !isAnswered(answer) ? (question.required ? 'required' : undefined)
      : answerIssue(question, answer as AnswerValue);
    if (code) issues.push({ questionId: question.id, code, message: answerMessage(code) });
  }
  const known = indexQuestions(questions);
  for (const questionId of Object.keys(answers)) {
    if (!known.has(questionId)) {
      issues.push({ questionId, code: 'unknown_question', message: answerMessage('unknown_question') });
    }
  }
  return issues;
}

/** Return publish-time issues that are legal in a saved draft's Zod shape. */
export function validateDocument(doc: FormDocument): DocumentIssue[] {
  const parsed = parseDocument(doc);
  const known = indexQuestions(allQuestions(parsed));
  const seen = new Set<string>();
  const issues: DocumentIssue[] = [];
  parsed.sections.forEach((section, sectionIndex) => {
    section.questions.forEach((question, questionIndex) => {
      const path = `sections.${sectionIndex}.questions.${questionIndex}`;
      if (seen.has(question.id)) {
        issues.push({ path: `${path}.id`, code: 'duplicate_id', message: {
          ar: 'رقم السؤال متكرر. خلي لكل سؤال رقم مختلف.', en: 'This question ID is duplicated. Give each question a unique ID.',
        } });
      }
      seen.add(question.id);
      const condition = question.visibleIf;
      if (condition?.questionId === question.id) {
        issues.push({ path: `${path}.visibleIf.questionId`, code: 'self_reference', message: {
          ar: 'السؤال مينفعش ظهوره يعتمد على إجابته هو.', en: 'A question cannot depend on its own answer for visibility.',
        } });
      } else if (condition && !known.has(condition.questionId)) {
        issues.push({ path: `${path}.visibleIf.questionId`, code: 'unknown_reference', message: {
          ar: 'شرط الظهور مرتبط بسؤال مش موجود. راجع السؤال المرتبط.', en: 'This visibility rule refers to a missing question. Check the reference.',
        } });
      }
      if ((question.type === 'single' || question.type === 'multi') && !question.options?.length) {
        issues.push({ path: `${path}.options`, code: 'missing_options', message: {
          ar: 'ضيف اختيارات للسؤال ده قبل نشر الاستمارة.', en: 'Add choices to this question before publishing the form.',
        } });
      }
      if (question.type === 'scale' && (!question.scale || question.scale.min > question.scale.max)) {
        issues.push({ path: `${path}.scale`, code: 'missing_scale', message: {
          ar: 'حدد بداية ونهاية صحيحة للمقياس قبل النشر.', en: 'Set valid minimum and maximum scale bounds before publishing.',
        } });
      }
    });
  });
  return issues;
}

/** Extract finite numeric metric values; coercion belongs to the answer-entry boundary. */
export function metricAnswers(doc: FormDocument, answers: Answers): Array<{ questionId: string; metricKey: string; value: number }> {
  const result: Array<{ questionId: string; metricKey: string; value: number }> = [];
  for (const question of allQuestions(parseDocument(doc))) {
    const value = answerFor(answers, question.id);
    if (question.metricKey !== undefined && typeof value === 'number' && Number.isFinite(value)) {
      result.push({ questionId: question.id, metricKey: question.metricKey, value });
    }
  }
  return result;
}

/** Progress measures presence of answers, independently of validation errors. */
export function completion(doc: FormDocument, answers: Answers): { answered: number; total: number; pct: number } {
  const { visible } = visibilityFor(allQuestions(parseDocument(doc)), answers);
  const answered = [...visible].filter((id) => isAnswered(answerFor(answers, id))).length;
  const total = visible.size;
  return { answered, total, pct: total === 0 ? 0 : Math.round(answered / total * 100) };
}
