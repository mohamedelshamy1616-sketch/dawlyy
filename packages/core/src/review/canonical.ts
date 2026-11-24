import { WeekReviewInput } from './types';
import { sortRecords, stableJson } from './math';

/** Canonical source data for server-side hashing; ordered message signatures remain ordered. */
export function canonicalReviewInput(input: WeekReviewInput): string {
  const parsed = WeekReviewInput.parse(input);
  const snapshot = (value: WeekReviewInput['checkin']['current']) => value === null ? null : {
    ...value, answers: sortRecords(value.answers, answer => answer.questionId),
  };
  return stableJson({
    ...parsed,
    weights: sortRecords(parsed.weights, value => value.on),
    rollingWeights: parsed.rollingWeights && sortRecords(parsed.rollingWeights, value => value.on),
    measurements: sortRecords(parsed.measurements, value => value.on),
    exercises: sortRecords(parsed.exercises, value => value.exerciseId),
    redFlags: sortRecords(parsed.redFlags, value => value.id),
    checkin: { current: snapshot(parsed.checkin.current), previous: snapshot(parsed.checkin.previous) },
  });
}
