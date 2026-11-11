import { questionsById } from '@dawlyy/core/forms';
import { localize, type FormDocument, type VisibilityCondition } from '@dawlyy/core/types';

/** Task 7: browser-safe summary of a visibility rule, using the referenced question's localized label and option labels. */
export function visibilitySummary(document: FormDocument, condition: VisibilityCondition, locale: 'ar' | 'en', words: Record<string, string>): string {
  const question = questionsById(document).get(condition.questionId);
  const option = (raw: string | number) => localize(question?.options?.find(item => item.value === String(raw))?.label, locale) || String(raw);
  const value = typeof condition.value === 'boolean' ? words[condition.value ? 'yes' : 'no'] ?? String(condition.value)
    : Array.isArray(condition.value) ? condition.value.map(option).join(locale === 'ar' ? '، ' : ', ') : option(condition.value ?? '');
  return [localize(question?.label, locale), words[condition.op] ?? condition.op, condition.op === 'answered' ? '' : value].filter(Boolean).join(' ');
}

/** Task 7: operators a coach may pick for a rule that depends on a question of this type (all are core-supported). */
export function operatorsFor(type: string | undefined): Array<'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'answered'> {
  switch (type) {
    case 'yes_no': return ['eq', 'neq', 'answered'];
    case 'single': return ['eq', 'neq', 'in', 'answered'];
    case 'multi': return ['in', 'answered'];
    case 'number':
    case 'scale': return ['eq', 'neq', 'gt', 'lt', 'answered'];
    case 'photo':
    case 'video':
    case 'file': return ['answered'];
    default: return ['eq', 'neq', 'answered'];
  }
}

/** Task 7: the client-facing state of one calendar event with its (optional) submission. */
export type EventStatus = 'due' | 'overdue' | 'upcoming' | 'waitingForCoach' | 'complete' | 'skipped';

/** Task 7 / spec §61: map event and submission state to the fixed status vocabulary; `now` is passed in for testability. */
export function eventStatus(item: { state: string; dueAt: string; submission: { state: string } | null }, now: number): EventStatus {
  const submitted = item.submission?.state;
  if (submitted === 'reviewed') return 'complete';
  if (submitted === 'submitted' || submitted === 'waiting_for_coach') return 'waitingForCoach';
  if (submitted === 'skipped' || item.state === 'skipped' || item.state === 'cancelled') return 'skipped';
  if (item.state === 'completed') return 'complete';
  if (Date.parse(item.dueAt) > now) return 'upcoming';
  return item.state === 'overdue' || submitted === 'overdue' ? 'overdue' : 'due';
}

/** Task 7: due and overdue first, then upcoming, then history. */
export function eventBucket(status: EventStatus): 'due' | 'upcoming' | 'past' {
  return status === 'due' || status === 'overdue' ? 'due' : status === 'upcoming' ? 'upcoming' : 'past';
}
