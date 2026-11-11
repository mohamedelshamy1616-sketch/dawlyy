import 'server-only';

/** Task 10: the request time in ms, read once per request after connection() so overdue marks are consistent. */
export function requestTime(): number {
  return Date.now();
}
