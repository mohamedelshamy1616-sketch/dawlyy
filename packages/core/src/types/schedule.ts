import { z } from 'zod';
import { DayOfWeek, IsoDate, IsoDateTime } from './common';

/** Spec §22 (scheduling), §23 (calendar), §26 (tracking cadence). */

export const WeighInCadence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('daily_fasted') }),
  z.object({ kind: z.literal('days_of_week'), days: z.array(DayOfWeek).min(1) }),
  z.object({ kind: z.literal('weekly'), day: DayOfWeek }),
  z.object({ kind: z.literal('custom'), dates: z.array(IsoDate).min(1) }),
]);
export type WeighInCadence = z.infer<typeof WeighInCadence>;

export const CheckinRule = z.object({
  enabled: z.boolean().default(true),
  /** First check-in is Start Date + this many days (spec §22: 7). */
  firstAfterDays: z.number().int().positive().default(7),
  everyDays: z.number().int().positive().default(7),
  /** When set, generate exactly this many per cycle instead of everyDays. */
  perCycle: z.number().int().positive().optional(),
  cycleWeeks: z.number().int().positive().default(4),
  /** Local time of day, "HH:mm". */
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  windowDays: z.number().int().nonnegative().default(1),
});

export const IntervalRule = z.object({
  enabled: z.boolean().default(true),
  firstAfterDays: z.number().int().nonnegative().default(0),
  everyDays: z.number().int().positive(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  windowDays: z.number().int().nonnegative().default(1),
});

export const TechniqueReviewRule = z.object({
  enabled: z.boolean().default(false),
  /** Only in the first N weeks of the subscription. */
  firstWeeks: z.number().int().positive().default(4),
  maxPerWeek: z.number().int().positive().default(1),
});

/** Stored on `packages.schedule_rules`; may be overridden per client. */
export const ScheduleRules = z.object({
  // `.prefault({})` (not `.default`) so the inner field defaults are applied: Zod 4 returns `.default` values unparsed.
  weeklyCheckin: CheckinRule.prefault({}),
  /** Spec §22: VIP never creates daily check-ins unless this is explicitly enabled. */
  dailyCheckin: z
    .object({ enabled: z.boolean().default(false), timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default('20:00') })
    .prefault({}),
  weighIn: WeighInCadence.default({ kind: 'none' }),
  weighInTimeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
  measurements: IntervalRule.optional(),
  progressPhotos: IntervalRule.optional(),
  techniqueReview: TechniqueReviewRule.prefault({}),
  /** Days before `endsOn` to remind about renewal, e.g. [7, 3, 1]. */
  renewalReminderDaysBefore: z.array(z.number().int().positive()).default([7, 3, 1]),
  programReviewEveryDays: z.number().int().positive().optional(),
});
export type ScheduleRules = z.infer<typeof ScheduleRules>;
export type ScheduleRulesInput = z.input<typeof ScheduleRules>;

export const SCHEDULE_EVENT_TYPES = [
  'weekly_checkin',
  'daily_checkin',
  'weigh_in',
  'measurements',
  'progress_photos',
  'technique_review',
  'renewal_reminder',
  'program_review',
  'custom',
] as const;
export const ScheduleEventType = z.enum(SCHEDULE_EVENT_TYPES);
export type ScheduleEventType = z.infer<typeof ScheduleEventType>;

export const ScheduleInput = z.object({
  /** Day 0. Tracking Day 1 is the next calendar day (spec §22). */
  startDate: IsoDate,
  endDate: IsoDate,
  /** IANA zone, e.g. `Africa/Cairo`. */
  timezone: z.string().min(1),
  rules: ScheduleRules,
});
export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const ScheduleEvent = z.object({
  type: ScheduleEventType,
  dueAt: IsoDateTime,
  /** Local calendar date the event belongs to, in `timezone`. */
  localDate: IsoDate,
  timezone: z.string().min(1),
  windowDays: z.number().int().nonnegative(),
  /**
   * Stable key for idempotent inserts, e.g. `weekly_checkin:2026-11-14`.
   * Re-generating the schedule must produce the same keys for the same input.
   */
  ruleKey: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type ScheduleEvent = z.infer<typeof ScheduleEvent>;
