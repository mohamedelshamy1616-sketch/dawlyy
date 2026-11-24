import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  AttentionInput, ATTENTION_WEIGHTS, rankAttention,
  type AttentionAction, type AttentionReason,
} from '../src/attention';

const today = '2026-11-13';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function client(patch: Partial<AttentionInput> = {}): AttentionInput {
  return {
    clientId: id(1),
    lastCheckin: { submittedOn: null, status: 'none', dueOn: null },
    workouts: { planned7: 4, done7: 4, planned14: 8, done14: 8 },
    mealLogDays7: 7, nutritionAssigned: false, weights14: [], goal: null,
    openRedFlags: [], paymentPending: false, subscriptionEndsOn: null,
    lastCoachMessageOn: today, unreadFromClient: 0, ...patch,
  };
}
const reason = (code: AttentionReason['code'], params: AttentionReason['params'] = {}): AttentionReason => ({ code, params });
const checkin = (patch: Partial<AttentionInput['lastCheckin']>): AttentionInput['lastCheckin'] => ({
  submittedOn: null, status: 'none', dueOn: null, ...patch,
});
const weights = (first = 80, middle = 80, last = 80, start = '2026-11-03') => [
  { on: start, kg: first }, { on: '2026-11-08', kg: middle }, { on: today, kg: last },
];

type Case = { name: string; patch: Partial<AttentionInput>; expected: AttentionReason[] };
const cases: Case[] = [
  { name: 'no signals omits the client', patch: {}, expected: [] },
  ...(['pain_injury', 'eating_disorder', 'pregnancy', 'medication', 'other'] as const).map(category => ({
    name: `open ${category} flag`, patch: { openRedFlags: [{ category }] }, expected: [reason('red_flag', { category })],
  })),
  { name: 'reviewed check-in does not wait', patch: { lastCheckin: checkin({ status: 'reviewed', submittedOn: today }) }, expected: [] },
  { name: 'waiting check-in submitted today', patch: { lastCheckin: checkin({ status: 'waiting_review', submittedOn: today }) }, expected: [reason('checkin_waiting', { days: 0 })] },
  { name: 'waiting check-in submitted yesterday', patch: { lastCheckin: checkin({ status: 'waiting_review', submittedOn: '2026-11-12' }) }, expected: [reason('checkin_waiting', { days: 1 })] },
  { name: 'waiting with unknown submission uses zero days', patch: { lastCheckin: checkin({ status: 'waiting_review' }) }, expected: [reason('checkin_waiting', { days: 0 })] },
  { name: 'future submission cannot have negative waiting days', patch: { lastCheckin: checkin({ status: 'waiting_review', submittedOn: '2026-11-14' }) }, expected: [reason('checkin_waiting', { days: 0 })] },
  { name: 'check-in due today is not overdue', patch: { lastCheckin: checkin({ dueOn: today }) }, expected: [] },
  { name: 'check-in due tomorrow is not overdue', patch: { lastCheckin: checkin({ dueOn: '2026-11-14' }) }, expected: [] },
  { name: 'check-in due yesterday is overdue', patch: { lastCheckin: checkin({ dueOn: '2026-11-12' }) }, expected: [reason('checkin_overdue', { days: 1 })] },
  { name: 'submission before due date stays overdue', patch: { lastCheckin: checkin({ dueOn: '2026-11-12', submittedOn: '2026-11-11', status: 'reviewed' }) }, expected: [reason('checkin_overdue', { days: 1 })] },
  { name: 'submission on due date resolves overdue', patch: { lastCheckin: checkin({ dueOn: '2026-11-12', submittedOn: '2026-11-12', status: 'reviewed' }) }, expected: [] },
  { name: 'submission after due date resolves overdue', patch: { lastCheckin: checkin({ dueOn: '2026-11-12', submittedOn: today, status: 'reviewed' }) }, expected: [] },
  { name: 'zero unread messages', patch: { unreadFromClient: 0 }, expected: [] },
  { name: 'one unread message', patch: { unreadFromClient: 1 }, expected: [reason('unread_messages', { count: 1 })] },
  { name: 'payment is not pending', patch: { paymentPending: false }, expected: [] },
  { name: 'payment is pending', patch: { paymentPending: true }, expected: [reason('payment_pending')] },
  { name: 'subscription ends today', patch: { subscriptionEndsOn: today }, expected: [reason('subscription_ends', { days: 0 })] },
  { name: 'subscription ends in seven days', patch: { subscriptionEndsOn: '2026-11-20' }, expected: [reason('subscription_ends', { days: 7 })] },
  { name: 'subscription ends in eight days', patch: { subscriptionEndsOn: '2026-11-21' }, expected: [] },
  { name: 'subscription ended yesterday', patch: { subscriptionEndsOn: '2026-11-12' }, expected: [reason('subscription_ended', { days: 1 })] },
  { name: 'subscription ended fourteen days ago', patch: { subscriptionEndsOn: '2026-10-30' }, expected: [reason('subscription_ended', { days: 14 })] },
  { name: 'subscription ended fifteen days ago', patch: { subscriptionEndsOn: '2026-10-29' }, expected: [] },
  { name: 'drop exactly thirty points compares fortnight to latest week', patch: { workouts: { planned7: 5, done7: 2, planned14: 10, done14: 7 } }, expected: [reason('adherence_drop', { from: 100, to: 40 })] },
  { name: 'drop above thirty points suppresses low adherence', patch: { workouts: { planned7: 4, done7: 1, planned14: 8, done14: 5 } }, expected: [reason('adherence_drop', { from: 100, to: 25 })] },
  { name: 'drop just below thirty points does not trigger', patch: { workouts: { planned7: 100, done7: 40, planned14: 200, done14: 139 } }, expected: [reason('low_adherence', { percent: 40 })] },
  { name: 'earlier-week drop alone does not meet fortnight threshold', patch: { workouts: { planned7: 4, done7: 2, planned14: 8, done14: 6 } }, expected: [] },
  { name: 'low adherence exactly fifty is excluded', patch: { workouts: { planned7: 2, done7: 1, planned14: 4, done14: 2 } }, expected: [] },
  { name: 'low adherence just below fifty rounds only its parameter', patch: { workouts: { planned7: 101, done7: 50, planned14: 202, done14: 100 } }, expected: [reason('low_adherence', { percent: 50 })] },
  { name: 'two planned workouts permit low adherence', patch: { workouts: { planned7: 2, done7: 0, planned14: 4, done14: 0 } }, expected: [reason('low_adherence', { percent: 0 })] },
  { name: 'one planned workout excludes adherence reasons', patch: { workouts: { planned7: 1, done7: 0, planned14: 10, done14: 9 } }, expected: [] },
  { name: 'zero planned workouts avoid division by zero', patch: { workouts: { planned7: 0, done7: 0, planned14: 0, done14: 0 } }, expected: [] },
  { name: 'adherence above one hundred is clamped before comparison', patch: { workouts: { planned7: 2, done7: 3, planned14: 4, done14: 8 } }, expected: [] },
  { name: 'earlier-week adherence above one hundred is clamped in params', patch: { workouts: { planned7: 4, done7: 0, planned14: 8, done14: 12 } }, expected: [reason('adherence_drop', { from: 100, to: 0 })] },
  { name: 'inconsistent nested windows stay finite', patch: { workouts: { planned7: 4, done7: 0, planned14: 0, done14: 9 } }, expected: [reason('low_adherence', { percent: 0 })] },
  { name: 'three meal-log days do not trigger', patch: { nutritionAssigned: true, mealLogDays7: 3 }, expected: [] },
  { name: 'two meal-log days trigger five missing days', patch: { nutritionAssigned: true, mealLogDays7: 2 }, expected: [reason('meals_missing', { days: 5 })] },
  { name: 'no meal logs trigger seven missing days', patch: { nutritionAssigned: true, mealLogDays7: 0 }, expected: [reason('meals_missing', { days: 7 })] },
  { name: 'nutrition not assigned excludes meal signal', patch: { nutritionAssigned: false, mealLogDays7: 0 }, expected: [] },
  { name: 'two weigh-ins do not trigger either weight reason', patch: { goal: 'lose', weights14: [weights()[0]!, weights()[2]!] }, expected: [] },
  { name: 'flat weight at ten-day span', patch: { goal: 'lose', weights14: weights() }, expected: [reason('weight_flat', { days: 10 })] },
  { name: 'flat weight below ten-day span', patch: { goal: 'lose', weights14: weights(80, 80, 80, '2026-11-04') }, expected: [] },
  { name: 'flat range exactly half a kilo', patch: { goal: 'gain', weights14: weights(80, 80.5, 80) }, expected: [reason('weight_flat', { days: 10 })] },
  { name: 'range over half a kilo is not flat', patch: { goal: 'lose', weights14: weights(80, 80.51, 80) }, expected: [] },
  { name: 'unsorted weigh-ins preserve span and trend', patch: { goal: 'gain', weights14: [weights()[2]!, weights()[0]!, weights()[1]!] }, expected: [reason('weight_flat', { days: 10 })] },
  { name: 'maintain goal excludes weight reasons', patch: { goal: 'maintain', weights14: weights(80, 81, 82) }, expected: [] },
  { name: 'null goal excludes weight reasons', patch: { goal: null, weights14: weights(80, 81, 82) }, expected: [] },
  { name: 'lose goal wrong-way weight rises', patch: { goal: 'lose', weights14: weights(80, 81, 82) }, expected: [reason('weight_wrong_way', { kgPerWeek: 1.4 })] },
  { name: 'gain goal wrong-way weight falls', patch: { goal: 'gain', weights14: weights(82, 81, 80) }, expected: [reason('weight_wrong_way', { kgPerWeek: -1.4 })] },
  { name: 'lose goal falling weight is fine', patch: { goal: 'lose', weights14: weights(82, 81, 80) }, expected: [] },
  { name: 'gain goal rising weight is fine', patch: { goal: 'gain', weights14: weights(80, 81, 82) }, expected: [] },
  { name: 'wrong way at seven-day span', patch: { goal: 'lose', weights14: weights(80, 81, 82, '2026-11-06') }, expected: [reason('weight_wrong_way', { kgPerWeek: 1.9 })] },
  { name: 'wrong way below seven-day span', patch: { goal: 'lose', weights14: weights(80, 81, 82, '2026-11-07') }, expected: [] },
  { name: 'positive slope exactly quarter kilo per week is excluded', patch: { goal: 'lose', weights14: [{ on: '2026-11-06', kg: 80 }, { on: '2026-11-06', kg: 80 }, { on: today, kg: 80.25 }] }, expected: [] },
  { name: 'positive slope just above threshold rounds after comparison', patch: { goal: 'lose', weights14: [{ on: '2026-11-06', kg: 80 }, { on: '2026-11-06', kg: 80 }, { on: today, kg: 80.251 }] }, expected: [reason('weight_wrong_way', { kgPerWeek: 0.3 })] },
  { name: 'negative slope exactly quarter kilo per week is excluded', patch: { goal: 'gain', weights14: [{ on: '2026-11-06', kg: 80 }, { on: '2026-11-06', kg: 80 }, { on: today, kg: 79.75 }] }, expected: [] },
  { name: 'negative slope just beyond threshold rounds after comparison', patch: { goal: 'gain', weights14: [{ on: '2026-11-06', kg: 80 }, { on: '2026-11-06', kg: 80 }, { on: today, kg: 79.749 }] }, expected: [reason('weight_wrong_way', { kgPerWeek: -0.3 })] },
  { name: 'same-day weights have no trend', patch: { goal: 'lose', weights14: [80, 81, 82].map(kg => ({ on: today, kg })) }, expected: [] },
  { name: 'nine days since contact is excluded', patch: { lastCoachMessageOn: '2026-11-04' }, expected: [] },
  { name: 'ten days since contact triggers', patch: { lastCoachMessageOn: '2026-11-03' }, expected: [reason('no_contact', { days: 10 })] },
  { name: 'eleven days since contact triggers', patch: { lastCoachMessageOn: '2026-11-02' }, expected: [reason('no_contact', { days: 11 })] },
  { name: 'unknown contact uses 999 days', patch: { lastCoachMessageOn: null }, expected: [reason('no_contact', { days: 999 })] },
  { name: 'unavailable messages create neither contact nor unread reasons', patch: { messagesAvailable: false, lastCoachMessageOn: null, unreadFromClient: 3 }, expected: [] },
  { name: 'future coach message is not stale', patch: { lastCoachMessageOn: '2026-11-14' }, expected: [] },
];

describe('attention thresholds', () => {
  it.each(cases)('$name', ({ patch, expected }) => {
    const result = rankAttention([client(patch)], { today });
    expect(result.flatMap(item => item.reasons)).toEqual(expected);
    expect(result).toHaveLength(expected.length ? 1 : 0);
    expect(result.every(item => Number.isInteger(item.score))).toBe(true);
  });
  it('returns no rows for empty input', () => {
    expect(rankAttention([], { today })).toEqual([]);
  });
});

describe('attention scoring and determinism', () => {
  it('orders reasons, sums points before rounding, and chooses the top action', () => {
    const result = rankAttention([client({
      openRedFlags: [{ category: 'pain_injury' }],
      lastCheckin: checkin({ status: 'waiting_review', submittedOn: '2026-11-11' }),
      unreadFromClient: 2, paymentPending: true, subscriptionEndsOn: '2026-11-20',
      nutritionAssigned: true, mealLogDays7: 2, lastCoachMessageOn: '2026-11-03',
    })], { today });
    expect(result).toEqual([{
      clientId: id(1), score: 579, primaryAction: 'handle_flag',
      reasons: [reason('red_flag', { category: 'pain_injury' }), reason('checkin_waiting', { days: 2 }),
        reason('unread_messages', { count: 2 }), reason('payment_pending'), reason('subscription_ends', { days: 7 }),
        reason('meals_missing', { days: 5 }), reason('no_contact', { days: 10 })],
    }]);
  });
  it('deduplicates flags and orders equal-point categories independently of input order', () => {
    const input = client({ openRedFlags: [{ category: 'pregnancy' }, { category: 'pain_injury' }, { category: 'pregnancy' }] });
    const result = rankAttention([input], { today });
    expect(result[0]?.score).toBe(280);
    expect(result[0]?.reasons).toEqual([reason('red_flag', { category: 'pain_injury' }), reason('red_flag', { category: 'pregnancy' })]);
    expect(rankAttention([{ ...input, openRedFlags: [...input.openRedFlags].reverse() }], { today })).toEqual(result);
  });
  const actions: [string, Partial<AttentionInput>, AttentionAction][] = [
    ['review', { lastCheckin: checkin({ status: 'waiting_review' }) }, 'review'],
    ['reply', { unreadFromClient: 1 }, 'reply'],
    ['confirm payment', { paymentPending: true }, 'confirm_payment'],
    ['renew upcoming', { subscriptionEndsOn: today }, 'renew'],
    ['renew ended', { subscriptionEndsOn: '2026-11-12' }, 'renew'],
    ['nudge overdue', { lastCheckin: checkin({ dueOn: '2026-11-12' }) }, 'nudge'],
    ['nudge adherence', { workouts: { planned7: 2, done7: 0, planned14: 4, done14: 0 } }, 'nudge'],
    ['nudge meals', { nutritionAssigned: true, mealLogDays7: 0 }, 'nudge'],
    ['nudge contact', { lastCoachMessageOn: null }, 'nudge'],
  ];
  it.each(actions)('selects action: %s', (_name, patch, action) => {
    expect(rankAttention([client(patch)], { today })[0]?.primaryAction).toBe(action);
  });
  it('caps extreme counts below the next importance band', () => {
    const rows = rankAttention([
      client({ clientId: id(1), unreadFromClient: 1_000_000 }),
      client({ clientId: id(2), lastCheckin: checkin({ status: 'waiting_review' }) }),
    ], { today });
    expect(rows.map(row => [row.clientId, row.score])).toEqual([[id(2), 120], [id(1), 119]]);
    expect(ATTENTION_WEIGHTS.unread_messages.cap).toBe(119);
  });
  it('resolves equal scores by top-reason importance before client ID', () => {
    // 40 low adherence + 37 missing meals + 10.10 no contact rounds to 87.
    const rows = rankAttention([
      client({ clientId: id(1), workouts: { planned7: 2, done7: 0, planned14: 4, done14: 0 }, nutritionAssigned: true, mealLogDays7: 0, lastCoachMessageOn: '2026-11-03' }),
      client({ clientId: id(2), lastCheckin: checkin({ dueOn: '2026-11-06' }) }),
    ], { today });
    expect(rows.map(row => row.score)).toEqual([87, 87]);
    expect(rows.map(row => row.clientId)).toEqual([id(2), id(1)]);
  });
  it('resolves a constructed score tie by importance', () => {
    // 50 + 1 flat-weight points, 35 meal points, 10.10 contact points round to 96.
    // An overdue check-in (81) and contact (15) also total 96, so overdue wins.
    const rows = rankAttention([
      client({ clientId: id(1), goal: 'lose', weights14: weights(), nutritionAssigned: true, mealLogDays7: 2, lastCoachMessageOn: '2026-11-03' }),
      client({ clientId: id(2), lastCheckin: checkin({ dueOn: '2026-11-12' }), lastCoachMessageOn: '2025-07-01' }),
    ], { today });
    expect(rows.map(row => row.score)).toEqual([96, 96]);
    expect(rows.map(row => row.clientId)).toEqual([id(2), id(1)]);
  });
  it('resolves equal scores and importance by client ID and ignores client array order', () => {
    const inputs = [client({ clientId: id(3), paymentPending: true }), client({ clientId: id(1), paymentPending: true }), client({ clientId: id(2), paymentPending: true })];
    const result = rankAttention(inputs, { today });
    expect(result.map(row => row.clientId)).toEqual([id(1), id(2), id(3)]);
    expect(rankAttention([...inputs].reverse(), { today })).toEqual(result);
  });
  it('uses calendar day distances through leap days', () => {
    expect(rankAttention([client({ lastCoachMessageOn: '2024-02-28' })], { today: '2024-03-09' })[0]?.reasons).toEqual([reason('no_contact', { days: 10 })]);
  });
  it('uses least squares over every sample, not endpoint differences', () => {
    // x = [0, 1, 10]: covariance 80/3, variance 182/3, weekly slope 40/13.
    expect(rankAttention([client({ goal: 'lose', weights14: [
      { on: '2026-11-03', kg: 80 }, { on: '2026-11-04', kg: 70 }, { on: today, kg: 80 },
    ] })], { today })[0]?.reasons).toEqual([reason('weight_wrong_way', { kgPerWeek: 3.1 })]);
  });
  it('can emit flat and wrong-way reasons together when both rules hold', () => {
    expect(rankAttention([client({ goal: 'lose', weights14: weights(80, 80.2, 80.4) })], { today })[0]?.reasons)
      .toEqual([reason('weight_wrong_way', { kgPerWeek: 0.3 }), reason('weight_flat', { days: 10 })]);
  });
  it('does not mutate even deeply frozen inputs', () => {
    const input = client({ weights14: weights().reverse(), goal: 'gain', openRedFlags: [{ category: 'other' }] });
    const original = structuredClone(input);
    function freeze(value: unknown): void {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    }
    freeze(input);
    const inputs = Object.freeze([input]);
    rankAttention(inputs, Object.freeze({ today }));
    expect(input).toEqual(original);
  });
});

describe('attention validation', () => {
  it.each([
    ['negative unread count', { unreadFromClient: -1 }],
    ['fractional unread count', { unreadFromClient: 0.5 }],
    ['negative planned count', { workouts: { planned7: -1, done7: 0, planned14: 0, done14: 0 } }],
    ['too many meal days', { mealLogDays7: 8 }],
    ['invalid UUID', { clientId: 'client-1' }],
    ['invalid calendar date', { subscriptionEndsOn: '2026-02-30' }],
    ['nonfinite weight', { weights14: [{ on: today, kg: Infinity }] }],
  ] satisfies [string, Partial<AttentionInput>][])('throws ZodError for %s', (_name, patch) => {
    expect(() => rankAttention([client(patch)], { today })).toThrow(ZodError);
    expect(() => AttentionInput.parse(client(patch))).toThrow(ZodError);
  });
  it('validates today even for empty input', () => {
    expect(() => rankAttention([], { today: 'invalid' })).toThrow(ZodError);
  });
});
