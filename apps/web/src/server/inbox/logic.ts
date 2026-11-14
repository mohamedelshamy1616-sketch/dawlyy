import type { AttentionAction, AttentionInput } from '@dawlyy/core/attention';
import type { ProgramDocument } from '@dawlyy/core/types';

/** R1b: only explicit profile goal directions can drive a weight warning. */
export function attentionGoal(value: unknown): AttentionInput['goal'] {
  return value === 'lose' || value === 'gain' || value === 'maintain' ? value : null;
}

/** R1b: count dated training days in a published program, never rest days or future sessions. */
export function plannedWorkouts(document: ProgramDocument, assignedOn: string | null, today: string) {
  const start = document.startDate ?? assignedOn;
  const result = { planned7: 0, planned14: 0 };
  if (!start) return result;
  const todayDay = Date.parse(`${today}T00:00:00Z`) / 86400000;
  const firstDay = Date.parse(`${start}T00:00:00Z`) / 86400000;
  let weekOffset = 0;
  for (const phase of document.phases) {
    for (const week of [...phase.weeks].sort((a, b) => a.index - b.index)) {
      for (const day of week.days) {
        if (day.kind !== 'training' || !day.workout) continue;
        const ordinal = firstDay + weekOffset * 7 + day.index;
        const on = new Date(ordinal * 86400000).toISOString().slice(0, 10);
        if (document.endDate && on > document.endDate) continue;
        const ago = todayDay - ordinal;
        if (ago >= 0 && ago < 14) result.planned14++;
        if (ago >= 0 && ago < 7) result.planned7++;
      }
      weekOffset++;
    }
  }
  return result;
}

/** R1b: resolve an inline action; null asks the UI to open/create a conversation first. */
export function actionHref(action: AttentionAction, clientId: string, refs: { reviewId?: string | null; paymentId?: string | null; conversationId?: string | null }): string | null {
  switch (action) {
    case 'review': return refs.reviewId ? `/coach/checkins/review/${refs.reviewId}` : `/coach/clients/${clientId}`;
    case 'confirm_payment': return refs.paymentId ? `/coach/billing/payments/${refs.paymentId}` : '/coach/billing';
    case 'renew': return `/coach/clients/${clientId}/subscription`;
    case 'handle_flag': return `/coach/clients/${clientId}`;
    default: return refs.conversationId ? `/coach/messages/${refs.conversationId}` : null;
  }
}
