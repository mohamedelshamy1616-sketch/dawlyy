import { formRequest } from '../form-runner/http';

export function submitReview(id: string, feedback: string, results?: Record<string, string | number | null>) {
  const comment = feedback.trim();
  return formRequest(`/submissions/${id}/review`, 'POST', {
    outcome: 'reviewed',
    ...(comment ? { coachFeedback: comment } : {}),
    ...(results ? { results } : {}),
  }, crypto.randomUUID());
}
