import { describe, it, expect } from 'vitest';
import { EntitlementsError, entitlementId, resolveEntitlements, periodFor, can } from '../src/entitlements';
import { EffectiveEntitlement, type EntitlementOverride, type Frequency, type PackageEntitlements } from '../src/types';

const context = {
  now: '2026-11-08T09:00:00+02:00',
  subscriptionStart: '2026-11-01',
  timezone: 'Africa/Cairo',
  usedThisPeriod: 0,
};

describe('resolveEntitlements', () => {
  const base: PackageEntitlements = [{ key: 'weekly_checkin', enabled: true, frequency: 'weekly', limit: 2 }];

  it('overrides defined fields while preserving undefined fields and package inputs', () => {
    const overrides: EntitlementOverride[] = [{ key: 'weekly_checkin', limit: 4, enabled: undefined }];
    const result = resolveEntitlements(base, overrides);
    expect(result).toEqual([{ key: 'weekly_checkin', enabled: true, frequency: 'weekly', limit: 4, source: 'override' }]);
    expect(base[0]?.limit).toBe(2);
    expect(overrides[0]?.enabled).toBeUndefined();
    expect(resolveEntitlements(base, [])[0]?.limit).toBe(2);
  });

  it('allows a client override to disable an enabled package entitlement', () => {
    const effective = resolveEntitlements(base, [{ key: 'weekly_checkin', enabled: false }]);
    expect(can(effective, 'weekly_checkin', context)).toMatchObject({ allowed: false, reason: 'disabled' });
  });

  it('ignores expired overrides but includes an override through its expiresOn date', () => {
    const overrides: EntitlementOverride[] = [{ key: 'weekly_checkin', limit: 4, expiresOn: '2026-11-07' }];
    expect(resolveEntitlements(base, overrides, { today: '2026-11-08' })).toEqual([
      { ...base[0], source: 'package' },
    ]);
    expect(resolveEntitlements(base, overrides, { today: '2026-11-07' })[0]?.limit).toBe(4);
    // Without an injected date there is no wall-clock-dependent expiry decision.
    expect(resolveEntitlements(base, overrides)[0]?.limit).toBe(4);
    expect(resolveEntitlements([], overrides, { today: '2026-11-08' })).toEqual([]);
  });

  it('adds missing keys, defaulting enabled to false, and composes overrides in input order', () => {
    const result = resolveEntitlements([], [
      { key: 'video_call', limit: 1 },
      { key: 'chat', enabled: true },
      { key: 'video_call', turnaroundHours: 24 },
    ]);
    expect(result).toEqual([
      { key: 'chat', enabled: true, source: 'override' },
      { key: 'video_call', enabled: false, limit: 1, turnaroundHours: 24, source: 'override' },
    ]);
  });

  it('keeps custom identities distinct and sorts built-ins before customKey order', () => {
    const result = resolveEntitlements([
      { key: 'custom', customKey: 'z:session', enabled: true, limit: 1 },
      { key: 'chat', enabled: true },
      { key: 'custom', customKey: 'a', enabled: true },
      { key: 'workout_program', enabled: true },
    ], [{ key: 'custom', customKey: 'z:session', limit: 3 }]);
    expect(result.map(entitlementId)).toEqual(['workout_program', 'chat', 'custom:a', 'custom:z:session']);
    expect(can(result, { key: 'custom', customKey: 'z:session' }, context).remaining).toBe(3);
    expect(can(result, { key: 'custom', customKey: 'other' }, context)).toEqual({ allowed: false, reason: 'not_included' });
    expect(entitlementId({ key: 'chat', customKey: 'ignored' })).toBe('chat');
  });

  it('returns detached, schema-valid documents without override metadata', () => {
    const input: PackageEntitlements = [{ key: 'chat', enabled: true, mediaTypes: ['voice'], note: { ar: 'ابعتلي لو محتاج مساعدة', en: 'Message me if you need help' } }];
    const result = resolveEntitlements(input, [{ key: 'chat', reason: 'exception', expiresOn: '2026-11-20' }]);
    expect(result[0]).not.toHaveProperty('reason');
    expect(result[0]).not.toHaveProperty('expiresOn');
    expect(EffectiveEntitlement.safeParse(result[0]).success).toBe(true);
    result[0]?.mediaTypes?.push('photo');
    if (result[0]?.note) result[0].note.ar = 'تم التعديل';
    expect(input[0]?.mediaTypes).toEqual(['voice']);
    expect(input[0]?.note?.ar).toBe('ابعتلي لو محتاج مساعدة');
  });

  it('rejects malformed documents and missing custom identities with stable errors', () => {
    expect(() => resolveEntitlements([], [{ key: 'chat', limit: -1 }])).toThrow(EntitlementsError);
    expect(() => resolveEntitlements([], [{ key: 'custom' }])).toThrow(expect.objectContaining({ code: 'invalid_override' }));
    expect(() => entitlementId({ key: 'custom' })).toThrow(expect.objectContaining({ code: 'invalid_override' }));
    expect(() => resolveEntitlements([{ key: 'custom', enabled: true }], [])).toThrow(expect.objectContaining({ code: 'invalid_override' }));
    expect(() => can([{ key: 'chat', enabled: true, source: 'package', limit: -1 }], 'chat', context))
      .toThrow(expect.objectContaining({ code: 'invalid_override' }));
  });
});

describe('periodFor', () => {
  it('returns the Cairo calendar month including the DST offset change', () => {
    expect(periodFor('monthly', '2026-04-25T07:00:00+03:00', '2026-01-01', 'Africa/Cairo')).toEqual({
      start: '2026-04-01T00:00:00.000+02:00',
      end: '2026-04-30T23:59:59.999+03:00',
    });
    expect(periodFor('monthly', '2028-02-29T12:00:00+02:00', '2028-01-01', 'Africa/Cairo')?.end)
      .toBe('2028-02-29T23:59:59.999+02:00');
  });

  it('uses the local day of the instant rather than its textual date', () => {
    expect(periodFor('daily', '2026-11-07T23:30:00Z', '2026-11-01', 'Africa/Cairo')).toEqual({
      start: '2026-11-08T00:00:00.000+02:00', end: '2026-11-08T23:59:59.999+02:00',
    });
  });

  it.each([
    ['weekly', '2026-11-08', '2026-11-14'],
    ['biweekly', '2026-11-01', '2026-11-14'],
    ['per_cycle', '2026-11-01', '2026-11-28'],
  ] as const)('anchors %s blocks at subscriptionStart', (frequency, start, end) => {
    expect(periodFor(frequency, context.now, context.subscriptionStart, context.timezone)).toEqual({
      start: `${start}T00:00:00.000+02:00`, end: `${end}T23:59:59.999+02:00`,
    });
  });

  it('supports custom cycle lengths and dates before the subscription anchor', () => {
    expect(periodFor('per_cycle', context.now, context.subscriptionStart, context.timezone, { cycleDays: 5 })).toEqual({
      start: '2026-11-06T00:00:00.000+02:00', end: '2026-11-10T23:59:59.999+02:00',
    });
    expect(periodFor('weekly', '2026-10-31T12:00:00+02:00', '2026-11-01', 'Africa/Cairo')).toEqual({
      start: '2026-10-25T00:00:00.000+03:00', end: '2026-10-31T23:59:59.999+02:00',
    });
  });

  it('counts calendar days across DST and returns no window for subscription/unlimited', () => {
    expect(periodFor('weekly', '2026-04-25T07:00:00+03:00', '2026-04-23', 'Africa/Cairo')).toEqual({
      start: '2026-04-23T00:00:00.000+02:00', end: '2026-04-29T23:59:59.999+03:00',
    });
    expect(periodFor('per_subscription', context.now, context.subscriptionStart, context.timezone)).toBeNull();
    expect(periodFor('unlimited', context.now, context.subscriptionStart, context.timezone)).toBeNull();
  });

  it('rejects unknown frequencies and invalid cycle lengths', () => {
    expect(() => periodFor('yearly' as Frequency, context.now, context.subscriptionStart, context.timezone))
      .toThrow(expect.objectContaining({ code: 'invalid_frequency' }));
    for (const cycleDays of [0, -1, 1.5, NaN]) {
      expect(() => periodFor('per_cycle', context.now, context.subscriptionStart, context.timezone, { cycleDays }))
        .toThrow(expect.objectContaining({ code: 'invalid_frequency' }));
    }
  });
});

describe('can', () => {
  it('distinguishes absent, disabled, exhausted and available entitlements', () => {
    const effective = resolveEntitlements([{ key: 'weekly_checkin', enabled: true, frequency: 'weekly', limit: 2 }], []);
    expect(can(effective, 'chat', context)).toEqual({ allowed: false, reason: 'not_included' });
    expect(can(effective, 'weekly_checkin', { ...context, usedThisPeriod: 2 }))
      .toMatchObject({ allowed: false, reason: 'limit_reached', remaining: 0, entitlement: effective[0] });
    expect(can(effective, 'weekly_checkin', { ...context, usedThisPeriod: 3 }).remaining).toBe(0);
    expect(can(effective, 'weekly_checkin', { ...context, usedThisPeriod: 1 }))
      .toMatchObject({ allowed: true, remaining: 1, period: { start: '2026-11-08T00:00:00.000+02:00' } });
    expect(can(resolveEntitlements([{ key: 'chat', enabled: true, limit: 0 }], []), 'chat', context))
      .toMatchObject({ allowed: false, reason: 'limit_reached', remaining: 0 });
  });

  it('allows the whole last duration day in Cairo and denies the next local day', () => {
    const effective = resolveEntitlements([{ key: 'technique_review', enabled: true, durationDays: 7 }], []);
    expect(can(effective, 'technique_review', { ...context, now: '2026-11-08T23:59:59.999+02:00' }).allowed).toBe(true);
    expect(can(effective, 'technique_review', { ...context, now: '2026-11-08T22:00:00Z' }))
      .toMatchObject({ allowed: false, reason: 'window_expired' });
  });

  it('checks disabled status before expiry and expiry before usage limits', () => {
    const effective = resolveEntitlements([
      { key: 'chat', enabled: false, durationDays: 1, limit: 0 },
      { key: 'voice_notes', enabled: true, durationDays: 1, limit: 0 },
    ], []);
    expect(can(effective, 'chat', context).reason).toBe('disabled');
    expect(can(effective, 'voice_notes', context).reason).toBe('window_expired');
  });

  it('applies duration as local calendar days across a DST change', () => {
    const effective = resolveEntitlements([{ key: 'technique_review', enabled: true, durationDays: 2 }], []);
    const ctx = { ...context, subscriptionStart: '2026-04-23' };
    expect(can(effective, 'technique_review', { ...ctx, now: '2026-04-25T23:59:59.999+03:00' }).allowed).toBe(true);
    expect(can(effective, 'technique_review', { ...ctx, now: '2026-04-26T00:00:00+03:00' }).reason).toBe('window_expired');
  });

  it('leaves remaining undefined without a limit, including unlimited frequency', () => {
    const effective = resolveEntitlements([{ key: 'chat', enabled: true, frequency: 'unlimited' }, { key: 'voice_notes', enabled: true }], []);
    expect(can(effective, 'chat', context)).toMatchObject({ allowed: true, period: null });
    expect(can(effective, 'chat', context).remaining).toBeUndefined();
    expect(can(effective, 'voice_notes', context).remaining).toBeUndefined();
  });
});
