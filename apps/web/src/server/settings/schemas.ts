import { z } from '@hono/zod-openapi';

import { CONSENT_KINDS } from './constants';

export { CONSENT_KINDS, LEGAL_VERSION } from './constants';

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const label = z.string().trim().min(1).max(60);
const units = z.object({ weight: z.enum(['kg', 'lb']), length: z.enum(['cm', 'in']) }).strict();
const quietHours = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();
const timeZone = z.string().trim().min(1).max(64).refine(validTimeZone, 'Unknown time zone');

/** Task 11: PUT /settings/business body. Every field is optional; absent fields keep their stored value. */
export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  logoMediaId: z.uuid().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  defaultLocale: z.enum(['ar', 'en']).optional(),
  timezone: timeZone.optional(),
  units: units.optional(),
  exerciseCategories: z.array(label).max(50).optional(),
  measurementTemplate: z.array(label).max(50).optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]).optional(),
  numerals: z.enum(['western', 'arabic']).optional(),
  quietHours: quietHours.nullable().optional(),
  checkinReviewTurnaroundHours: z.number().int().min(1).max(336).optional(),
}).strict();

/** Task 11: PUT /settings/business body type. */
export type BusinessUpdate = z.infer<typeof businessUpdateSchema>;

/** Task 11: PUT /settings/preferences body; matches `UserPreferences` in the tenants schema. */
export const preferencesUpdateSchema = z.object({
  locale: z.enum(['ar', 'en']).optional(),
  timezone: timeZone.optional(),
  units: units.optional(),
  quietHours: quietHours.nullable().optional(),
  channels: z.object({
    inapp: z.boolean().optional(), webpush: z.boolean().optional(),
    email: z.boolean().optional(), whatsapp: z.boolean().optional(),
  }).strict().optional(),
}).strict();

/** Task 11: PUT /settings/preferences body type. */
export type PreferencesUpdate = z.infer<typeof preferencesUpdateSchema>;

/** Task 11: POST /settings/consents body. Time, address and agent are filled by the server. */
export const consentInputSchema = z.object({
  kind: z.enum(CONSENT_KINDS),
  version: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/),
  locale: z.enum(['ar', 'en']),
  accepted: z.boolean(),
}).strict();

/** Task 11: POST /settings/consents body type. */
export type ConsentInput = z.infer<typeof consentInputSchema>;
