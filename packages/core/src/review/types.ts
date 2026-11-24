import { z } from 'zod';
import { IsoDate, LocalizedText, NutritionTargets } from '../types';
import type { AttentionItem, AttentionReason, ReasonCode } from '../attention';
import type { RedFlagCategory } from '../safety';
import type { ExerciseStatus } from '../workout';
import { calendarDay } from './math';

export class ReviewError extends Error {
  constructor(public readonly code: 'proposal_version_mismatch' | 'invalid_period') {
    super(code);
    this.name = 'ReviewError';
  }
}

export const CheckinSnapshot = z.object({
  submissionId: z.uuid(),
  submittedOn: IsoDate,
  answers: z.array(z.object({
    questionId: z.string(),
    label: LocalizedText,
    kind: z.enum(['number', 'scale', 'text', 'choice', 'boolean']),
    value: z.union([z.number(), z.string(), z.boolean(), z.array(z.string()), z.null()]),
  })),
});
export type CheckinSnapshot = z.infer<typeof CheckinSnapshot>;

const reasonCode: z.ZodType<ReasonCode> = z.enum([
  'red_flag', 'checkin_waiting', 'unread_messages', 'payment_pending', 'subscription_ends',
  'checkin_overdue', 'adherence_drop', 'weight_wrong_way', 'weight_flat', 'low_adherence',
  'meals_missing', 'subscription_ended', 'no_contact',
]);
// R1a exports types only for this output; validate its wire shape at the review boundary.
const attention: z.ZodType<AttentionItem> = z.object({
  clientId: z.uuid(),
  score: z.number(),
  reasons: z.array(z.object({ code: reasonCode, params: z.record(z.string(), z.union([z.number(), z.string()])) })),
  primaryAction: z.enum(['review', 'reply', 'nudge', 'confirm_payment', 'renew', 'handle_flag']),
});
const category: z.ZodType<RedFlagCategory | 'other'> = z.enum(['pain_injury', 'eating_disorder', 'pregnancy', 'medication', 'other']);
const exerciseStatus: z.ZodType<ExerciseStatus> = z.enum(['improved', 'maintained', 'regressed', 'new', 'missing']);
const count = z.number().int().nonnegative();

export const WeekReviewInput = z.object({
  client: z.object({ id: z.uuid(), firstName: z.string().min(1).max(80), goal: z.enum(['lose', 'gain', 'maintain']).nullable() }),
  coach: z.object({
    firstName: z.string().min(1).max(80), dialect: z.enum(['egyptian', 'gulf']),
    signaturePhrases: z.array(z.string().min(1).max(200)).max(5),
  }),
  period: z.object({ from: IsoDate, to: IsoDate }).refine(({ from, to }) => {
    const span = calendarDay(to) - calendarDay(from);
    // The end date is included: Nov 1 through Nov 14 is fourteen calendar days.
    return span >= 0 && span < 14;
  }, { message: 'invalid_period' }),
  workouts: z.object({ planned: count, done: count, previousPlanned: count, previousDone: count }),
  exercises: z.array(z.object({
    exerciseId: z.uuid(), name: LocalizedText, status: exerciseStatus,
    topLoadKg: z.number().nullable(), previousTopLoadKg: z.number().nullable(), stalledSessions: count,
  })).max(100),
  meals: z.object({
    nutritionAssigned: z.boolean(), daysLogged: count.max(14), daysInPeriod: z.number().int().min(1).max(14),
    avgKcal: z.number().nullable(), targetKcal: z.number().nullable(),
  }),
  checkin: z.object({ current: CheckinSnapshot.nullable(), previous: CheckinSnapshot.nullable() }),
  weights: z.array(z.object({ on: IsoDate, kg: z.number().positive() })).max(60),
  rollingWeights: z.array(z.object({ on: IsoDate, kg: z.number().positive() })).max(22).optional(),
  measurements: z.array(z.object({ on: IsoDate, values: z.record(z.string(), z.number()) })).max(30),
  redFlags: z.array(z.object({ id: z.uuid(), category, source: z.enum(['message', 'checkin', 'meal_note']) })),
  attention: attention.nullable(),
  nutrition: z.object({ versionId: z.uuid(), targets: NutritionTargets }).nullable(),
});
export type WeekReviewInput = z.infer<typeof WeekReviewInput>;

export type ProposalCode = 'lower_kcal_flat' | 'raise_kcal_flat' | 'slow_loss_too_fast';
export type NutritionChange = {
  kind: 'nutrition_targets';
  fromVersionId: string;
  deltaKcal: number;
  targets: NutritionTargets;
};
export type Proposal = { code: ProposalCode; params: Record<string, number | string>; change: NutritionChange };

type Answer = CheckinSnapshot['answers'][number];
type Exercise = WeekReviewInput['exercises'][number];
type Weight = WeekReviewInput['weights'][number];
export type WeekReview = {
  summary: {
    adherence: {
      workouts: { done: number; planned: number; percent: number | null; previousPercent: number | null; change: 'up' | 'down' | 'same' | null };
      meals: { daysLogged: number; daysInPeriod: number; percent: number; avgKcal: number | null; targetKcal: number | null } | null;
    };
    checkin: {
      submittedOn: IsoDate | null;
      changes: { questionId: string; label: LocalizedText; kind: Answer['kind']; current: Answer['value']; previous: Answer['value'];
        change: 'up' | 'down' | 'same' | 'changed' | 'new' | 'missing' }[];
    };
    weight: { first: Weight | null; last: Weight | null; deltaKg: number | null; kgPerWeek: number | null; trend: 'down' | 'up' | 'flat' | null };
    measurements: { key: string; first: number; last: number; delta: number }[];
    prs: { exerciseId: string; name: LocalizedText; topLoadKg: number; previousTopLoadKg: number }[];
    stalls: Pick<Exercise, 'exerciseId' | 'name' | 'status' | 'stalledSessions'>[];
    redFlags: WeekReviewInput['redFlags'];
    attentionReasons: AttentionReason[];
  };
  mustHandleFlags: boolean;
  draft: { locale: 'ar' | 'en'; dialect: 'egyptian' | 'gulf' | null; text: string };
  proposals: Proposal[];
};
