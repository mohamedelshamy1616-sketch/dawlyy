import { describe, expect, it } from 'vitest';
import { CORRECTION_WINDOW_MS, correctionEligibility } from './eligibility';
const NOW = Date.parse('2026-11-17T12:00:00.000Z');
const timestamp = (age: number) => new Date(NOW - age).toISOString();
describe('inclusive migration 0008 correction eligibility', () => {
  it.each([0, 1, 7 * 86400000 - 1, 7 * 86400000])('allows a row aged %i milliseconds', age => {
    expect(correctionEligibility(timestamp(age), NOW, null)).toEqual({ eligible: true, reason: 'eligible' });
  });
  it('refuses the millisecond outside seven full 24-hour days', () => {
    expect(CORRECTION_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(correctionEligibility(timestamp(CORRECTION_WINDOW_MS + 1), NOW, null)).toEqual({ eligible: false, reason: 'expired' });
  });
  it.each([null, undefined, ''])('never invents the missing timestamp %s', createdAt => {
    expect(correctionEligibility(createdAt, NOW, null).eligible).toBe(false);
  });
  it.each(['bad date', '2026-11-17', '2026-02-30T12:00:00Z', '2026-11-17T12:00:00'])('rejects invalid timestamp %s', createdAt => {
    expect(correctionEligibility(createdAt, NOW, null)).toEqual({ eligible: false, reason: 'invalidTimestamp' });
  });
  it('refuses future timestamps and unreadable now values', () => {
    expect(correctionEligibility(timestamp(-1), NOW, null).reason).toBe('futureTimestamp');
    expect(correctionEligibility(timestamp(0), Number.NaN, null).eligible).toBe(false);
  });
  it('refuses voided rows even if their timestamps are missing', () => {
    expect(correctionEligibility(timestamp(1), NOW, timestamp(0))).toEqual({ eligible: false, reason: 'voided' });
    expect(correctionEligibility(null, NOW, 'present')).toEqual({ eligible: false, reason: 'voided' });
  });
  it('uses createdAt rather than fresh localDate or clientUpdatedAt', () => {
    const row = { createdAt: timestamp(CORRECTION_WINDOW_MS + 1), localDate: '2026-11-17', clientUpdatedAt: timestamp(0), voidedAt: null };
    expect(correctionEligibility(row.createdAt, new Date(NOW), row.voidedAt).eligible).toBe(false);
    expect(correctionEligibility('2026-11-10T14:00:00+02:00', '2026-11-17T12:00:00Z', null).eligible).toBe(true);
  });
});
