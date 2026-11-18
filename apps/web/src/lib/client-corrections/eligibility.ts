/** Migration 0008 uses created_at >= now() - interval '7 days', inclusively. */
export const CORRECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export type EligibilityReason = 'eligible' | 'voided' | 'missingTimestamp' | 'invalidTimestamp' | 'futureTimestamp' | 'expired';
export type CorrectionEligibility = { eligible: boolean; reason: EligibilityReason };

/** Reject date-only, impossible dates and offsetless local times instead of granting misleading actions. */
function instant(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const days = new Date(`${match[1]}-${match[2]}-01T00:00:00Z`);
  if (month < 1 || month > 12 || !Number.isFinite(days.getTime())) return Number.NaN;
  days.setUTCMonth(days.getUTCMonth() + 1, 0);
  if (day < 1 || day > days.getUTCDate() || year < 1) return Number.NaN;
  return Date.parse(value);
}

/** A UI hint only: the authenticated server decides again when the deferred mutation commits. */
export function correctionEligibility(createdAt: string | null | undefined, now: number | Date | string, voidedAt: string | null | undefined): CorrectionEligibility {
  if (voidedAt) return { eligible: false, reason: 'voided' };
  if (!createdAt) return { eligible: false, reason: 'missingTimestamp' };
  const created = instant(createdAt);
  const current = now instanceof Date ? now.getTime() : typeof now === 'string' ? instant(now) : now;
  if (!Number.isFinite(created) || !Number.isFinite(current)) return { eligible: false, reason: 'invalidTimestamp' };
  if (created > current) return { eligible: false, reason: 'futureTimestamp' };
  if (current - created > CORRECTION_WINDOW_MS) return { eligible: false, reason: 'expired' };
  return { eligible: true, reason: 'eligible' };
}
