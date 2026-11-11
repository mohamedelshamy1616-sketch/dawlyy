import { z } from '@hono/zod-openapi';
import { IntervalRule, WeighInCadence } from '@dawlyy/core/types';

/** Task 8: scalar vocabulary matches the frozen metric_kind enum. */
export const metricKinds = ['weight', 'water', 'steps', 'sleep_hours', 'habit', 'cardio_minutes', 'calories_in', 'mood', 'energy', 'custom'] as const;
/** Task 8: validated IANA zone, used for all date calculations. */
export const timezoneSchema = z.string().min(1).max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid timezone');
/** Task 8: common cursor, client and inclusive local-date range filters. */
export const rangeQuery = z.object({ clientId: z.uuid().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), cursor: z.string().optional(), limit: z.string().optional() });
/** Task 8: UUID route parameter. */
export const idParams = z.object({ id: z.uuid() });
/** Task 8: immutable scalar entry input; server always supplies source=manual. */
export const metricInput = z.object({ clientId: z.uuid().optional(), metric: z.enum(metricKinds), metricKey: z.string().trim().min(1).max(80).optional(), value: z.number().finite().min(0).max(999999999), unit: z.string().trim().min(1).max(32), recordedAt: z.iso.datetime({ offset: true }), timezone: timezoneSchema, clientUuid: z.uuid(), correctionOf: z.uuid().optional() }).strict().refine(value => !['habit', 'custom'].includes(value.metric) || !!value.metricKey, 'Custom metrics need a key');
const interval = IntervalRule.extend({ everyDays: z.number().int().min(1).max(366), timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('09:00') }).strict();
/** Task 8: coach-written cadence metadata is stored in the existing client profile JSON. */
export const cadenceInput = z.object({ startsOn: z.iso.date(), endsOn: z.iso.date(), timezone: timezoneSchema,
  metrics: z.array(z.object({ metric: z.enum(metricKinds), metricKey: z.string().trim().min(1).max(80).optional(), unit: z.string().trim().min(1).max(32), cadence: WeighInCadence, timeOfDay: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default('07:00') }).strict()).max(30),
  measurements: z.object({ rule: interval, fields: z.array(z.object({ type: z.string().trim().min(1).max(80), unit: z.enum(['cm', 'in']) }).strict()).max(50).default([]) }).strict().optional(),
  progressPhotos: z.object({ rule: interval, poses: z.array(z.enum(['front', 'left', 'right', 'back'])).min(1).max(4) }).strict().optional(),
}).strict().refine(value => value.endsOn >= value.startsOn && Date.parse(value.endsOn) - Date.parse(value.startsOn) <= 366 * 86400000, 'Cadence range must be within one year').refine(value => new Set(value.metrics.map(m => `${m.metric}:${m.metricKey ?? ''}`)).size === value.metrics.length, 'Duplicate metric').refine(value => value.metrics.every(m => !['habit', 'custom'].includes(m.metric) || !!m.metricKey), 'Custom metrics need a key').refine(value => !value.progressPhotos || new Set(value.progressPhotos.poses).size === value.progressPhotos.poses.length, 'Duplicate required pose').refine(value => !value.measurements || new Set(value.measurements.fields.map(field => field.type)).size === value.measurements.fields.length, 'Duplicate measurement field');
/** Task 8: paired named measurements; duplicate type/side keys are rejected. */
export const measurementInput = z.object({ clientId: z.uuid().optional(), localDate: z.iso.date(), clientUuid: z.uuid(), clientUpdatedAt: z.iso.datetime({ offset: true }), values: z.array(z.object({ type: z.string().trim().min(1).max(80), value: z.number().finite().positive().max(10000), unit: z.enum(['cm', 'in']), side: z.enum(['left', 'right']).optional() }).strict()).min(1).max(50) }).strict().refine(value => new Set(value.values.map(v => `${v.type}:${v.side ?? ''}`)).size === value.values.length, 'Duplicate measurement');
/** Task 8: the database calls side poses left/right, not side. */
export const photoInput = z.object({ clientId: z.uuid().optional(), localDate: z.iso.date(), clientUuid: z.uuid(), clientUpdatedAt: z.iso.datetime({ offset: true }), weightKg: z.number().positive().max(1000).optional(), poses: z.array(z.object({ pose: z.enum(['front', 'back', 'left', 'right', 'custom']), mediaId: z.uuid(), label: z.string().trim().max(80).optional() }).strict()).min(1).max(10) }).strict().refine(value => new Set(value.poses.map(p => p.mediaId)).size === value.poses.length && new Set(value.poses.map(p => `${p.pose}:${p.label ?? ''}`)).size === value.poses.length, 'Duplicate pose or media');
/** Task 8: shared OpenAPI result/error envelopes; runtime errors use ApiError. */
export const resultResponse = { description: 'Task 8 result', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
/** Task 8: documented failure statuses for all tracking/calendar endpoints. */
export const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };
