import type { LocalizedText } from '@dawlyy/core/types';
/** Task 5: all authored client content falls back to the other available language. */
export const localized = (value: LocalizedText | null | undefined, locale: string): string => value?.[locale === 'ar' ? 'ar' : 'en'] ?? value?.en ?? value?.ar ?? '';
/** Task 5: ISO calendar dates are formatted without a UTC-to-local date shift. */
export const displayDate = (value: string, locale: string): string => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
