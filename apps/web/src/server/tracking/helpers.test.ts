import { describe, expect, it } from 'vitest';
import { expectedEntries, measurementDeltas, numericDelta } from './helpers';

describe('Task 8 cadence and deltas', () => {
  it('expects only the configured weekday, never daily entries', () => {
    expect(expectedEntries({ kind: 'weekly', day: 0 }, '2026-11-01', '2026-11-15', 'Africa/Cairo')).toEqual(['2026-11-08', '2026-11-15']);
    expect(expectedEntries({ kind: 'none' }, '2026-11-01', '2026-11-15', 'Africa/Cairo')).toEqual([]);
  });
  it('does not invent a percent delta against zero', () => {
    expect(numericDelta(80, 100)).toEqual({ absolute: -20, percent: -20 });
    expect(numericDelta(5, 0)).toEqual({ absolute: 5, percent: null });
    expect(numericDelta(5, null)).toEqual({ absolute: null, percent: null });
  });
  it('compares matching sides and converts inches to centimetres', () => {
    expect(measurementDeltas([{ type: 'arm', side: 'left', unit: 'cm', value: 25.4 }], [{ type: 'arm', side: 'left', unit: 'in', value: 10 }])[0]).toMatchObject({ absolute: 0, percent: 0 });
  });
});
