import type { DateInputProps } from '@astryxdesign/core/DateInput';
import type { DateTimeInputProps } from '@astryxdesign/core/DateTimeInput';

/** Task 8: adapt server-validated ISO dates to Astryx's template-literal date contract. */
export function dateValue(value: string): DateInputProps['value'] { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value as DateInputProps['value'] : undefined; }
/** Task 8: adapt wall-clock datetimes to Astryx's branded datetime contract. */
export function dateTimeValue(value: string): DateTimeInputProps['value'] { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value as DateTimeInputProps['value'] : undefined; }

/** Task 8: serializable health-data view model; private coaching fields never cross this boundary. */
export type MetricRow = { id: string; metric: string; metricKey: string | null; value: number; unit: string; localDate: string; correctionOf?: string | null; createdAt?: string | null; voidedAt?: string | null; replacesId?: string | null };
/** Task 8: dated measurements and normalized deltas. */
export type MeasurementRow = { id: string; localDate: string; createdAt?: string | null; voidedAt?: string | null; replacesId?: string | null; values?: import('@/src/lib/client-corrections/types').MeasurementValue[]; deltas: { type: string; value: number; unit: string; side?: string; absolute: number | null; percent: number | null }[] };
/** Task 8: temporary signed image references, refreshed through the API when comparing dates. */
export type PhotoRow = { id: string; localDate: string; poses: { pose: string; mediaId: string; label?: string; url: string }[] };
/** Task 8: paginated JSON list envelope shared by the tracking controls. */
export type ListPage<T> = { items: T[]; nextCursor: string | null };
/** Task 8: API calls retain server error codes for localized presentation. */
export async function trackingRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok) {
    const code = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'object' && data.error !== null && 'code' in data.error ? String(data.error.code) : 'request_failed';
    throw new Error(code);
  }
  return data as T;
}
