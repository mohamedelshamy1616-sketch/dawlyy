import { z } from 'zod';
import { evaluateVisibility, metricAnswers, questionsById, validateDocument } from '@dawlyy/core/forms';
import { type Answers, type FormDocument } from '@dawlyy/core/types';
import { VersioningError } from '@dawlyy/core/versioning';
import { ApiError, forbidden, notFound, unprocessable, validationError } from '../../api/errors';
import { parseListQuery } from '../../api/lib/pagination';

/** Task 7: enforce earlier-question dependencies in addition to core publish validation. */
export function draftIssues(document: FormDocument) {
  const issues: Array<{ path: string; code: string; message: { ar?: string; en?: string } }> = [...validateDocument(document)];
  const seen = new Set<string>();
  const sectionIds = new Set<string>();
  document.sections.forEach((section, s) => {
    if (sectionIds.has(section.id)) issues.push({ path: `sections.${s}.id`, code: 'duplicate_id', message: { en: 'Section IDs must be unique.', ar: 'كل قسم لازم يكون له معرّف مختلف.' } });
    sectionIds.add(section.id);
    section.questions.forEach((question, q) => {
      if (question.visibleIf && !seen.has(question.visibleIf.questionId)) issues.push({ path: `sections.${s}.questions.${q}.visibleIf`, code: 'forward_reference', message: { en: 'Choose an earlier question.', ar: 'اختار سؤال موجود قبل السؤال ده.' } });
      if (question.type === 'scale' && question.scale && question.scale.max - question.scale.min > 100) issues.push({ path: `sections.${s}.questions.${q}.scale`, code: 'scale_too_large', message: { en: 'Use at most 101 scale values.', ar: 'خلي المقياس بحد أقصى ١٠١ قيمة.' } });
      seen.add(question.id);
    });
  });
  return issues;
}

/** Task 7: retain the original helper contract while keeping browser imports free of node built-ins. */
export { visibilitySummary } from './presentation';

const metricUnits = { weight: 'kg', water: 'ml', steps: 'steps', sleep_hours: 'hours', cardio_minutes: 'minutes', calories_in: 'kcal', mood: 'score', energy: 'score' } as const;
type Metric = keyof typeof metricUnits | 'habit' | 'custom';

/** Task 7 / G9: map visible metric answers, preserving measurement names as custom metric keys. */
export function mappedMetrics(document: FormDocument, answers: Answers): Array<{ questionId: string; metric: Metric; metricKey: string | null; value: number; unit: string }> {
  const visible = evaluateVisibility(document, answers).visible;
  const questions = questionsById(document);
  return metricAnswers(document, answers).filter(answer => visible.has(answer.questionId)).map(answer => {
    const metric: Metric = Object.hasOwn(metricUnits, answer.metricKey) ? answer.metricKey as keyof typeof metricUnits : answer.metricKey === 'habit' ? 'habit' : 'custom';
    return { questionId: answer.questionId, metric, metricKey: metric === 'custom' || metric === 'habit' ? answer.metricKey : null,
      value: answer.value, unit: questions.get(answer.questionId)?.unit ?? (metric === 'custom' || metric === 'habit' ? 'value' : metricUnits[metric]) };
  });
}

/** Task 7: validate opaque timestamp cursors without losing PostgreSQL microseconds. */
export function formCursor(query: { limit?: string; cursor?: string }) {
  const result = parseListQuery(query);
  if (result.cursor && (!z.string().uuid().safeParse(result.cursor.id).success || typeof result.cursor.k !== 'string'
    || !z.iso.datetime({ offset: true }).safeParse(result.cursor.k).success)) throw validationError(undefined, 'Invalid form cursor');
  return result;
}

/** Task 7 / doc §7: map guard refusals without bypassing database rules. */
export function mapFormError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof VersioningError) return unprocessable(error.code);
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const pg = current as { code?: string; detail?: string; cause?: unknown };
    if (pg.detail === 'rule:app.protect_published_version') return new ApiError(409, 'version_immutable', 'Published versions are immutable');
    if (pg.code === '42501') return forbidden();
    if (pg.code === '23503' || pg.code === 'P0002') return notFound();
    if (pg.code === '23505') return new ApiError(409, 'stale_draft', 'Concurrent form change; reload');
    if (pg.code === 'P0001') return unprocessable('transition_refused', 'The database refused the transition', { rule: pg.detail });
    if (pg.code === '23514') return unprocessable('form_invalid');
    current = pg.cause;
  }
  return error;
}

/** Task 7 / §12.1.10: inspect wrapped PostgreSQL errors for the one permitted submit retry. */
export function isTransitionRefusal(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    const pg = current as { code?: string; cause?: unknown };
    if (pg.code === 'P0001') return true;
    current = pg.cause;
  }
  return false;
}
