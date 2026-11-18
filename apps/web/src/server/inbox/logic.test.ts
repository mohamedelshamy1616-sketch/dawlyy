import { describe, expect, it } from 'vitest';
import { ProgramDocument } from '@dawlyy/core/types';
import { plannedWorkouts, actionHref, attentionGoal } from './logic';

describe('R1b inbox schedule and action boundaries', () => {
  const document = ProgramDocument.parse({ startDate: '2026-11-01', phases: [{ id: 'p', name: { en: 'Phase' }, weeks: [0, 1, 2].map(index => ({
    id: `w${index}`, index, days: Array.from({ length: 7 }, (_, day) => ({ id: `d${index}-${day}`, index: day,
      kind: day === 0 || day === 2 ? 'training' : 'rest',
      ...(day === 0 || day === 2 ? { workout: { id: `s${index}-${day}`, name: { en: 'Train' }, blocks: [] } } : {}),
    })),
  })) }] });
  it('counts actual training days in inclusive rolling windows and excludes future days', () => {
    expect(plannedWorkouts(document, null, '2026-11-16')).toEqual({ planned7: 2, planned14: 4 });
    expect(plannedWorkouts(document, null, '2026-10-31')).toEqual({ planned7: 0, planned14: 0 });
  });
  it('honours endDate and uses an assignment date only when startDate is absent', () => {
    expect(plannedWorkouts({ ...document, endDate: '2026-11-08' }, null, '2026-11-16')).toEqual({ planned7: 0, planned14: 2 });
    expect(plannedWorkouts({ ...document, startDate: undefined }, '2026-11-01', '2026-11-16')).toEqual({ planned7: 2, planned14: 4 });
    expect(plannedWorkouts({ ...document, startDate: undefined }, null, '2026-11-16')).toEqual({ planned7: 0, planned14: 0 });
  });
  it('resolves the exact review, payment and conversation instead of opening a generic list', () => {
    const refs = { reviewId: 'review', paymentId: 'payment', conversationId: 'thread' };
    expect(actionHref('review', 'client', refs)).toBe('/coach/clients/client/review');
    expect(actionHref('confirm_payment', 'client', refs)).toBe('/coach/billing/payments/payment');
    expect(actionHref('reply', 'client', refs)).toBe('/coach/messages/thread');
    expect(actionHref('renew', 'client', refs)).toBe('/coach/clients/client/subscription');
    expect(actionHref('handle_flag', 'client', refs)).toBe('/coach/clients/client');
    expect(actionHref('nudge', 'client', {})).toBeNull();
  });
  it('only maps stored goals with a known direction', () => {
    expect(attentionGoal('lose')).toBe('lose');
    expect(attentionGoal('gain')).toBe('gain');
    expect(attentionGoal('maintain')).toBe('maintain');
    expect(attentionGoal('get stronger')).toBeNull();
  });
});
