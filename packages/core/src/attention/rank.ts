import { z } from 'zod';
import { IsoDate } from '../types/common';
import { AttentionInput, type AttentionAction, type AttentionItem, type AttentionReason, type ReasonCode } from './types';
import { ATTENTION_WEIGHTS } from './weights';

const requestSchema = z.object({ clients: z.array(AttentionInput), opts: z.object({ today: IsoDate }) });
const importance: readonly ReasonCode[] = [
  'red_flag', 'checkin_waiting', 'unread_messages', 'payment_pending',
  'subscription_ends', 'checkin_overdue', 'adherence_drop', 'weight_wrong_way',
  'weight_flat', 'low_adherence', 'meals_missing', 'subscription_ended', 'no_contact',
];

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function ordinal(date: IsoDate): number {
  // UTC represents a calendar ordinal only; no local timezone or clock is read.
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}
function daysBetween(from: IsoDate, to: IsoDate): number {
  return ordinal(to) - ordinal(from);
}
function adherence(done: number, planned: number): number {
  return planned <= 0 ? 0 : Math.max(0, Math.min(100, done / planned * 100));
}
function points(reason: AttentionReason): number {
  const { base, perUnit = 0, cap = Infinity } = ATTENTION_WEIGHTS[reason.code];
  let units = 0;
  if (reason.code === 'adherence_drop') {
    units = Number(reason.params.from) - Number(reason.params.to);
  } else if (reason.code === 'weight_wrong_way') {
    units = Math.abs(Number(reason.params.kgPerWeek));
  } else {
    units = Number(reason.params.days ?? reason.params.count ?? reason.params.percent ?? 0);
  }
  return Math.min(cap, base + perUnit * units);
}
function primaryAction(code: ReasonCode): AttentionAction {
  switch (code) {
    case 'red_flag': return 'handle_flag';
    case 'checkin_waiting': return 'review';
    case 'unread_messages': return 'reply';
    case 'payment_pending': return 'confirm_payment';
    case 'subscription_ends':
    case 'subscription_ended': return 'renew';
    default: return 'nudge';
  }
}

function weightReasons(client: AttentionInput, add: (code: ReasonCode, params: AttentionReason['params']) => void): void {
  if ((client.goal !== 'lose' && client.goal !== 'gain') || client.weights14.length < 3) return;
  // Canonical order also makes floating-point summation independent of input order.
  const samples = [...client.weights14].sort((a, b) => compareText(a.on, b.on) || a.kg - b.kg);
  const first = samples[0]!;
  const span = daysBetween(first.on, samples[samples.length - 1]!.on);
  const values = samples.map(sample => sample.kg);
  if (span >= 10 && Math.max(...values) - Math.min(...values) <= 0.5) {
    add('weight_flat', { days: span });
  }
  if (span < 7) return;
  const xs = samples.map(sample => daysBetween(first.on, sample.on));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / samples.length;
  const meanY = values.reduce((sum, kg) => sum + kg, 0) / samples.length;
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < samples.length; i++) {
    const dx = xs[i]! - meanX;
    covariance += dx * (values[i]! - meanY);
    variance += dx * dx;
  }
  const kgPerWeek = covariance / variance * 7;
  if ((client.goal === 'lose' && kgPerWeek > 0.25) || (client.goal === 'gain' && kgPerWeek < -0.25)) {
    // Round magnitudes symmetrically, then restore the sign for the UI.
    add('weight_wrong_way', { kgPerWeek: Math.sign(kgPerWeek) * Math.round(Math.abs(kgPerWeek) * 10) / 10 });
  }
}

/** Validate all inputs, then rank without reading a clock, doing I/O, or mutating callers' data. */
export function rankAttention(clients: readonly AttentionInput[], opts: { today: IsoDate }): AttentionItem[] {
  const parsed = requestSchema.parse({ clients, opts });
  const today = parsed.opts.today;
  const result: AttentionItem[] = [];
  for (const client of parsed.clients) {
    const reasons: AttentionReason[] = [];
    const add = (code: ReasonCode, params: AttentionReason['params'] = {}): void => { reasons.push({ code, params }); };
    // Alphabetical category order breaks ties between flags of the same importance.
    for (const category of [...new Set(client.openRedFlags.map(flag => flag.category))].sort(compareText)) {
      add('red_flag', { category });
    }
    const { submittedOn, status, dueOn } = client.lastCheckin;
    if (status === 'waiting_review') {
      // Unknown or future submission dates never create negative waiting time.
      add('checkin_waiting', { days: submittedOn === null ? 0 : Math.max(0, daysBetween(submittedOn, today)) });
    }
    if (dueOn !== null && dueOn < today && (submittedOn === null || submittedOn < dueOn)) {
      add('checkin_overdue', { days: daysBetween(dueOn, today) });
    }
    if (client.unreadFromClient > 0) add('unread_messages', { count: client.unreadFromClient });
    if (client.paymentPending) add('payment_pending');
    if (client.subscriptionEndsOn !== null) {
      const days = daysBetween(today, client.subscriptionEndsOn);
      if (days >= 0 && days <= 7) add('subscription_ends', { days });
      else if (days < 0 && days >= -14) add('subscription_ended', { days: -days });
    }
    const { done7, planned7, done14, planned14 } = client.workouts;
    const latest = adherence(done7, planned7);
    const fortnight = adherence(done14, planned14);
    if (planned7 >= 2) {
      // Trigger uses the full fortnight; displayed "from" uses the earlier week.
      if (fortnight - latest >= 30) {
        add('adherence_drop', { from: Math.round(adherence(done14 - done7, planned14 - planned7)), to: Math.round(latest) });
      } else if (latest < 50) add('low_adherence', { percent: Math.round(latest) });
    }
    if (client.nutritionAssigned && client.mealLogDays7 <= 2) add('meals_missing', { days: 7 - client.mealLogDays7 });
    weightReasons(client, add);
    const days = client.lastCoachMessageOn === null ? 999 : daysBetween(client.lastCoachMessageOn, today);
    if (days >= 10) add('no_contact', { days });
    if (!reasons.length) continue;
    reasons.sort((a, b) => points(b) - points(a) || importance.indexOf(a.code) - importance.indexOf(b.code));
    result.push({
      clientId: client.clientId,
      score: Math.round(reasons.reduce((sum, reason) => sum + points(reason), 0)),
      reasons,
      primaryAction: primaryAction(reasons[0]!.code),
    });
  }
  return result.sort((a, b) => b.score - a.score
    || importance.indexOf(a.reasons[0]!.code) - importance.indexOf(b.reasons[0]!.code)
    || compareText(a.clientId, b.clientId));
}
