import { TZDate } from '@date-fns/tz';
import type { IsoDate } from '../types';

export function calendarDay(on: IsoDate): number {
  // Date-only ordinals have no local time: UTC avoids Cairo DST or server-zone effects.
  return new TZDate(`${on}T00:00:00Z`, 'UTC').getTime() / 86_400_000;
}

export function round(value: number, step = 0.1): number {
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + 1e-10) / step) * step;
  // Decimal display precision and negative zero are kept out of serialized reviews.
  return Number(rounded.toFixed(step === 0.1 ? 1 : 0));
}

export function percent(done: number, planned: number): number | null {
  return planned === 0 ? null : Math.min(100, done / planned * 100);
}

export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => compareText(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sortRecords<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((a, b) => compareText(key(a), key(b)) || compareText(stableJson(a), stableJson(b)));
}
