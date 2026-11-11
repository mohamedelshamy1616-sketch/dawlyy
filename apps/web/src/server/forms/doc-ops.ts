import type { FormDocument, FormSection, LocalizedText, Question, QuestionType } from '@dawlyy/core/types';

/** Task 7: pure, immutable edits of a FormDocument for the builder; no I/O so the browser and tests share it. */

function clone(document: FormDocument): FormDocument {
  return structuredClone(document);
}

/** Task 7: every question in document order, with its section index. */
export function flatQuestions(document: FormDocument): Array<{ question: Question; sectionIndex: number }> {
  return document.sections.flatMap((section, sectionIndex) => section.questions.map(question => ({ question, sectionIndex })));
}

/** Task 7: the questions that precede `questionId` in document order, the only valid `visibleIf` targets. */
export function earlierQuestions(document: FormDocument, questionId: string): Question[] {
  const all = flatQuestions(document).map(item => item.question);
  const index = all.findIndex(question => question.id === questionId);
  return index < 0 ? [] : all.slice(0, index);
}

/** Task 7: drop a `visibleIf` whose target no longer precedes the question (after a move, remove or retype). */
export function sanitizeVisibility(document: FormDocument): FormDocument {
  const next = clone(document);
  const seen = new Set<string>();
  for (const section of next.sections) {
    for (const question of section.questions) {
      if (question.visibleIf && !seen.has(question.visibleIf.questionId)) delete question.visibleIf;
      seen.add(question.id);
    }
  }
  return next;
}

/** Task 7: starting shape for each of the twelve question types. */
export function newQuestion(type: QuestionType, id: string, label: LocalizedText): Question {
  const base: Question = { id, type, label, required: false };
  if (type === 'scale') return { ...base, scale: { min: 1, max: 10 } };
  if (type === 'single' || type === 'multi') return { ...base, options: [] };
  return base;
}

/** Task 7: a section with a title and no questions. */
export function newSection(id: string, title: LocalizedText): FormSection {
  return { id, title, questions: [] };
}

/** Task 7: append a section after `afterSectionId` (or at the end). */
export function addSection(document: FormDocument, section: FormSection, afterSectionId?: string): FormDocument {
  const next = clone(document);
  const index = afterSectionId ? next.sections.findIndex(item => item.id === afterSectionId) : -1;
  next.sections.splice(index < 0 ? next.sections.length : index + 1, 0, section);
  return next;
}

/** Task 7: replace a section's title/description; questions are untouched. */
export function updateSection(document: FormDocument, sectionId: string, patch: Partial<Pick<FormSection, 'title' | 'description'>>): FormDocument {
  const next = clone(document);
  const section = next.sections.find(item => item.id === sectionId);
  if (!section) return document;
  Object.assign(section, patch);
  if (!section.description) delete section.description;
  return next;
}

/** Task 7: a document always keeps at least one section; the last one cannot be removed. */
export function removeSection(document: FormDocument, sectionId: string): FormDocument {
  if (document.sections.length <= 1) return document;
  const next = clone(document);
  next.sections = next.sections.filter(item => item.id !== sectionId);
  return sanitizeVisibility(next);
}

/** Task 7: move a section up (-1) or down (+1); a no-op at the ends. */
export function moveSection(document: FormDocument, sectionId: string, delta: -1 | 1): FormDocument {
  const index = document.sections.findIndex(item => item.id === sectionId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= document.sections.length) return document;
  const next = clone(document);
  const [moved] = next.sections.splice(index, 1);
  if (!moved) return document;
  next.sections.splice(target, 0, moved);
  return sanitizeVisibility(next);
}

/** Task 7: append a question to a section. */
export function addQuestion(document: FormDocument, sectionId: string, question: Question): FormDocument {
  const next = clone(document);
  const section = next.sections.find(item => item.id === sectionId);
  if (!section) return document;
  section.questions.push(question);
  return next;
}

/** Task 7: replace a question in place by id and clean any rule that became invalid. */
export function updateQuestion(document: FormDocument, question: Question): FormDocument {
  const next = clone(document);
  for (const section of next.sections) {
    const index = section.questions.findIndex(item => item.id === question.id);
    if (index >= 0) { section.questions[index] = question; return sanitizeVisibility(next); }
  }
  return document;
}

/** Task 7: remove a question and every rule that depended on it. */
export function removeQuestion(document: FormDocument, questionId: string): FormDocument {
  const next = clone(document);
  for (const section of next.sections) section.questions = section.questions.filter(item => item.id !== questionId);
  for (const section of next.sections) {
    for (const question of section.questions) if (question.visibleIf?.questionId === questionId) delete question.visibleIf;
  }
  return sanitizeVisibility(next);
}

/** Task 7: move a question one step; at a section edge it crosses into the neighbouring section. */
export function moveQuestion(document: FormDocument, questionId: string, delta: -1 | 1): FormDocument {
  const flat = flatQuestions(document);
  const index = flat.findIndex(item => item.question.id === questionId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= flat.length) return document;
  const next = clone(document);
  const from = next.sections[flat[index]!.sectionIndex]!;
  const at = from.questions.findIndex(item => item.id === questionId);
  const [moved] = from.questions.splice(at, 1);
  if (!moved) return document;
  const destination = next.sections[flat[target]!.sectionIndex]!;
  if (destination === from) from.questions.splice(at + delta, 0, moved);
  else if (delta < 0) destination.questions.push(moved);
  else destination.questions.unshift(moved);
  return sanitizeVisibility(next);
}
