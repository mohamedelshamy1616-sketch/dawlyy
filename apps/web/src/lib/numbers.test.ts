import { describe, expect, it } from 'vitest';
import { EMPTY_NUMBER, formatKcal, formatMacro, formatNumber, numeralPolicy } from './numbers';

const ar = { locale: 'ar' as const };
const en = { locale: 'en' as const };
const arab = { locale: 'ar' as const, numerals: 'arab' as const };

describe('formatKcal (nearest 5)', () => {
  it.each([
    [2082.4, en, '2,080'],
    [2083, en, '2,085'],
    [2082.5, en, '2,085'],
    [2084.9, en, '2,085'],
    [615.3, en, '615'],
    [2.5, en, '5'],
    [2.4, en, '0'],
    [0, en, '0'],
    [-2.5, en, '-5'],
    [-2.4, en, '0'],
    [2084.9, ar, '2,085'],
    [2083, arab, '٢٬٠٨٥'],
    [null, en, EMPTY_NUMBER],
    [undefined, ar, EMPTY_NUMBER],
    [Number.NaN, en, EMPTY_NUMBER],
  ] as const)('%s -> %s', (value, opts, expected) => {
    expect(formatKcal(value, opts).replace(/[‎‏؜]/g, '').replace('−', '-')).toBe(expected);
  });
});

describe('formatMacro (whole grams)', () => {
  it.each([
    [2.5, en, '3'],
    [2.4, en, '2'],
    [-2.5, en, '-3'],
    [99.5, ar, '100'],
    [0, ar, '0'],
    [31.7, arab, '٣٢'],
    [Number.POSITIVE_INFINITY, en, EMPTY_NUMBER],
  ] as const)('%s -> %s', (value, opts, expected) => {
    expect(formatMacro(value, opts).replace(/[‎‏؜]/g, '').replace('−', '-')).toBe(expected);
  });
});

describe('formatNumber', () => {
  it('keeps one decimal by default and Western digits in Arabic', () => {
    expect(formatNumber(2084.94, ar)).toBe('2,084.9');
    expect(formatNumber(12, en)).toBe('12');
  });
  it('honours maximumFractionDigits and Arabic digits', () => {
    expect(formatNumber(1.236, { ...en, maximumFractionDigits: 2 })).toBe('1.24');
    expect(formatNumber(12, arab)).toBe('١٢');
  });
  it('never prints negative zero', () => {
    expect(formatNumber(-0.01, en)).toBe('0');
  });
  it('returns the dash for missing input', () => {
    expect(formatNumber(null, en)).toBe(EMPTY_NUMBER);
    expect(formatNumber(Number.NaN, ar)).toBe(EMPTY_NUMBER);
  });
});

describe('numeralPolicy', () => {
  it.each([
    [{ numerals: 'arab' }, 'arab'],
    [{ numerals: 'latn' }, 'latn'],
    [{ numerals: 'other' }, 'latn'],
    [{}, 'latn'],
    [null, 'latn'],
    [undefined, 'latn'],
    ['arab', 'latn'],
    [42, 'latn'],
  ] as const)('%j -> %s', (preferences, expected) => {
    expect(numeralPolicy(preferences)).toBe(expected);
  });
});
