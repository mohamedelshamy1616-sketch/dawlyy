import { z } from 'zod';
import { IsoDate } from '../types/common';

/** Caller supplies scoped, non-voided activity from the stated rolling windows. */
export const AttentionInput = z.object({
  clientId: z.uuid(),
  lastCheckin: z.object({
    submittedOn: IsoDate.nullable(),
    status: z.enum(['none', 'waiting_review', 'reviewed']),
    dueOn: IsoDate.nullable(),
  }),
  workouts: z.object({
    planned7: z.number().int().nonnegative(),
    done7: z.number().int().nonnegative(),
    planned14: z.number().int().nonnegative(),
    done14: z.number().int().nonnegative(),
  }),
  mealLogDays7: z.number().int().min(0).max(7),
  nutritionAssigned: z.boolean(),
  weights14: z.array(z.object({ on: IsoDate, kg: z.number() })),
  goal: z.enum(['lose', 'gain', 'maintain']).nullable(),
  openRedFlags: z.array(z.object({
    category: z.enum(['pain_injury', 'eating_disorder', 'pregnancy', 'medication', 'other']),
  })),
  paymentPending: z.boolean(),
  subscriptionEndsOn: IsoDate.nullable(),
  lastCoachMessageOn: IsoDate.nullable(),
  unreadFromClient: z.number().int().nonnegative(),
  messagesAvailable: z.boolean().optional(),
});
export type AttentionInput = z.infer<typeof AttentionInput>;

export type ReasonCode =
  | 'red_flag' | 'checkin_waiting' | 'unread_messages' | 'payment_pending'
  | 'subscription_ends' | 'checkin_overdue' | 'adherence_drop' | 'weight_wrong_way'
  | 'weight_flat' | 'low_adherence' | 'meals_missing' | 'subscription_ended' | 'no_contact';

export type AttentionReason = { code: ReasonCode; params: Record<string, number | string> };
export type AttentionAction = 'review' | 'reply' | 'nudge' | 'confirm_payment' | 'renew' | 'handle_flag';
export type AttentionItem = {
  clientId: string;
  score: number;
  reasons: AttentionReason[];
  primaryAction: AttentionAction;
};
