import { describe, expect, it } from 'vitest';
import { dayKey, effectiveChannels, groupByDay, inQuietHours, isValidTimeZone, mergePreferences, parseClock, quietWindowEnd, resolveLanguage, retryDelayMs } from './logic';

const night = { start: '22:00', end: '07:00' };

describe('Task 9 quiet hours', () => {
  it('parses HH:MM strictly', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(1439);
    for (const bad of ['24:00', '7:00', '07:60', 'noon', '']) expect(parseClock(bad)).toBeNull();
  });

  it('covers a window that wraps midnight, in the user zone', () => {
    expect(inQuietHours(new Date('2026-11-11T23:30:00Z'), night, 'UTC')).toBe(true);
    expect(inQuietHours(new Date('2026-11-11T03:00:00Z'), night, 'UTC')).toBe(true);
    expect(inQuietHours(new Date('2026-11-11T07:00:00Z'), night, 'UTC')).toBe(false);
    expect(inQuietHours(new Date('2026-11-11T12:00:00Z'), night, 'UTC')).toBe(false);
    // 21:30 UTC is 23:30 in Cairo in November (UTC+2): inside the window there, outside in UTC.
    expect(inQuietHours(new Date('2026-11-11T21:30:00Z'), night, 'Africa/Cairo')).toBe(true);
    expect(inQuietHours(new Date('2026-11-11T21:30:00Z'), night, 'UTC')).toBe(false);
  });

  it('covers a same-day window and ignores empty or malformed ones', () => {
    const lunch = { start: '12:00', end: '14:00' };
    expect(inQuietHours(new Date('2026-11-11T12:00:00Z'), lunch, 'UTC')).toBe(true);
    expect(inQuietHours(new Date('2026-11-11T14:00:00Z'), lunch, 'UTC')).toBe(false);
    expect(inQuietHours(new Date('2026-11-11T13:00:00Z'), { start: '10:00', end: '10:00' }, 'UTC')).toBe(false);
    expect(inQuietHours(new Date('2026-11-11T13:00:00Z'), { start: 'x', end: '10:00' }, 'UTC')).toBe(false);
    expect(inQuietHours(new Date('2026-11-11T13:00:00Z'), undefined, 'UTC')).toBe(false);
  });

  it('finds the end of the window, across midnight, and is null outside it', () => {
    expect(quietWindowEnd(new Date('2026-11-11T23:30:00Z'), night, 'UTC')?.toISOString()).toBe('2026-11-12T07:00:00.000Z');
    expect(quietWindowEnd(new Date('2026-11-11T03:10:45Z'), night, 'UTC')?.toISOString()).toBe('2026-11-11T07:00:00.000Z');
    expect(quietWindowEnd(new Date('2026-11-11T12:00:00Z'), night, 'UTC')).toBeNull();
    expect(quietWindowEnd(new Date('2026-11-11T21:30:00Z'), night, 'Africa/Cairo')?.toISOString()).toBe('2026-11-12T05:00:00.000Z');
  });

  it('validates IANA zones', () => {
    expect(isValidTimeZone('Africa/Cairo')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('Task 9 preferences', () => {
  it('merges channels key by key and keeps untouched values', () => {
    const merged = mergePreferences({ locale: 'ar', channels: { email: false } }, { channels: { webpush: false }, quietHours: night });
    expect(merged).toEqual({ locale: 'ar', channels: { email: false, webpush: false }, quietHours: night });
  });

  it('clears values with null and leaves the input untouched', () => {
    const current = { locale: 'en' as const, timezone: 'Africa/Cairo', quietHours: night };
    const merged = mergePreferences(current, { locale: null, quietHours: null });
    expect(merged).toEqual({ timezone: 'Africa/Cairo' });
    expect(current.quietHours).toEqual(night);
  });

  it('defaults every channel on, and in-app cannot be switched off', () => {
    expect(effectiveChannels(undefined)).toEqual({ inapp: true, webpush: true, email: true });
    expect(effectiveChannels({ channels: { inapp: false, email: false } })).toEqual({ inapp: true, webpush: true, email: false });
  });

  it('picks the language from preference, then membership, then tenant default', () => {
    expect(resolveLanguage('en', 'ar', 'ar')).toBe('en');
    expect(resolveLanguage(undefined, 'en', 'ar')).toBe('en');
    expect(resolveLanguage(null, 'fr', 'en')).toBe('en');
    expect(resolveLanguage(undefined, undefined, undefined)).toBe('ar');
  });

  it('backs retries off in five-minute steps', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([300_000, 600_000, 900_000]);
  });
});

describe('Task 9 notification grouping', () => {
  it('buckets by calendar day in the given zone', () => {
    expect(dayKey('2026-11-11T22:30:00Z', 'UTC')).toBe('2026-11-11');
    expect(dayKey('2026-11-11T22:30:00Z', 'Africa/Cairo')).toBe('2026-11-12');
    const groups = groupByDay([
      { id: 'a', createdAt: '2026-11-11T23:00:00Z' }, { id: 'b', createdAt: '2026-11-11T08:00:00Z' }, { id: 'c', createdAt: '2026-11-10T20:00:00Z' },
    ], 'UTC');
    expect(groups.map(group => [group.day, group.items.map(item => item.id)])).toEqual([['2026-11-11', ['a', 'b']], ['2026-11-10', ['c']]]);
    expect(groupByDay([], 'UTC')).toEqual([]);
  });
});
