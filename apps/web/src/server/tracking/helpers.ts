import { generateSchedule } from '@dawlyy/core/schedule';
import { ScheduleRules, type WeighInCadence } from '@dawlyy/core/types';
import type { MeasurementValue } from '@dawlyy/db/schema';

/** Task 8: reuse core generation for every scalar cadence, retaining Day 0 and timezone rules. */
export function expectedEntries(cadence: WeighInCadence, startDate: string, endDate: string, timezone: string): string[] {
  return generateSchedule({ startDate, endDate, timezone, rules: ScheduleRules.parse({ weeklyCheckin: { enabled: false }, weighIn: cadence, renewalReminderDaysBefore: [] }) }).map(event => event.localDate);
}

/** Task 8: signed absolute and percentage changes, with no fabricated zero baseline. */
export function numericDelta(current: number, previous: number | null) {
  const absolute = previous === null ? null : current - previous;
  return { absolute, percent: previous === null || previous === 0 || absolute === null ? null : absolute / previous * 100 };
}

/** Task 8: compare like measurement types/sides in the current set's unit. */
export function measurementDeltas(current: MeasurementValue[], previous: MeasurementValue[]) {
  return current.map(value => {
    const before = previous.find(candidate => candidate.type === value.type && candidate.side === value.side);
    const normalized = before ? before.value * (before.unit === value.unit ? 1 : value.unit === 'cm' ? 2.54 : 1 / 2.54) : null;
    return { ...value, ...numericDelta(value.value, normalized) };
  });
}
