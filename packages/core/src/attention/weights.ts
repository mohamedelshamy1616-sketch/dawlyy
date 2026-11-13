import type { ReasonCode } from './types';

/**
 * Safety and direct coach work lead, followed by retention and coaching signals.
 * Capped bands keep each reason below the next priority even for extreme counts;
 * subscription_ends and checkin_overdue share a band. Upcoming renewals have a
 * fixed weight so a distant expiry cannot outrank today's solely for having more days.
 * Lower-priority signals can still add up to a higher client total.
 */
export const ATTENTION_WEIGHTS: Record<ReasonCode, { base: number; perUnit?: number; cap?: number }> = {
  red_flag: { base: 140 },
  checkin_waiting: { base: 120, perUnit: 1, cap: 139 },
  unread_messages: { base: 100, perUnit: 1, cap: 119 },
  payment_pending: { base: 90 },
  subscription_ends: { base: 80 },
  checkin_overdue: { base: 80, perUnit: 1, cap: 89 },
  adherence_drop: { base: 70, perUnit: 0.1, cap: 79 },
  weight_wrong_way: { base: 60, perUnit: 1, cap: 69 },
  weight_flat: { base: 50, perUnit: 0.1, cap: 59 },
  low_adherence: { base: 40 },
  meals_missing: { base: 30, perUnit: 1, cap: 39 },
  subscription_ended: { base: 20, perUnit: 0.5, cap: 29 },
  no_contact: { base: 10, perUnit: 0.01, cap: 19 },
};
