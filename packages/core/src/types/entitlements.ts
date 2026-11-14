import { z } from 'zod';
import { IsoDate, LocalizedText, MediaKind } from './common';
import { ClientModules } from './client-modules';

/** Spec §8 (packages and entitlements), §9 (client-level overrides). */

export const ENTITLEMENT_KEYS = [
  'workout_program',
  'nutrition_plan',
  'weekly_checkin',
  'daily_checkin',
  'technique_review',
  'chat',
  'voice_notes',
  'video_call',
  'progress_photos',
  'measurements',
  'inbody_review',
  'assessments',
  'supplements_plan',
  'program_updates',
  'custom',
] as const;
export const EntitlementKey = z.enum(ENTITLEMENT_KEYS);
export type EntitlementKey = z.infer<typeof EntitlementKey>;

export const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'per_cycle', 'per_subscription', 'unlimited'] as const;
export const Frequency = z.enum(FREQUENCIES);
export type Frequency = z.infer<typeof Frequency>;

export const Entitlement = z.object({
  key: EntitlementKey,
  /** Needed when key is `custom`. */
  customKey: z.string().min(1).optional(),
  enabled: z.boolean(),
  frequency: Frequency.optional(),
  /** Max uses per frequency window; undefined means unlimited. */
  limit: z.number().int().nonnegative().optional(),
  /** Only valid for the first N days of the subscription (e.g. technique review in the first 4 weeks). */
  durationDays: z.number().int().positive().optional(),
  /** Coach promise, e.g. 48 h to review a check-in. */
  turnaroundHours: z.number().int().positive().optional(),
  mediaTypes: z.array(MediaKind).optional(),
  note: LocalizedText.optional(),
});
export type Entitlement = z.infer<typeof Entitlement>;

/** Stored on `packages.entitlements`. */
export const PackageEntitlements = z.array(Entitlement);
export type PackageEntitlements = z.infer<typeof PackageEntitlements>;

/** One row of `client_entitlement_overrides`: partial fields win over the package value. */
export const EntitlementOverride = Entitlement.partial().extend({
  key: EntitlementKey,
  customKey: z.string().min(1).optional(),
  reason: z.string().optional(),
  /** Override stops applying after this date. */
  expiresOn: IsoDate.optional(),
  // reinvent R0a: only the seven client module keys may be overridden.
  modules: ClientModules.partial().optional(),
});
export type EntitlementOverride = z.infer<typeof EntitlementOverride>;

export const EffectiveEntitlement = Entitlement.extend({
  source: z.enum(['package', 'override']),
});
export type EffectiveEntitlement = z.infer<typeof EffectiveEntitlement>;
