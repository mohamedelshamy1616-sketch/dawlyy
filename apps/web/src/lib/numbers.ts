/**
 * The one place that formats kcal, macro grams and other counts for display.
 *
 * Western digits (`latn`) are the default in both locales: the plan is "default Western digits in Arabic UI".
 * A per-user `numerals: 'arab'` choice is read by `numeralPolicy`; storing it and its toggle come later.
 *
 * Missing input (null, undefined, NaN, Infinity) formats as EMPTY_NUMBER, an en dash, so a gap is visible
 * instead of showing "NaN" or a blank that reads like zero.
 */
export type NumeralSystem = 'latn' | 'arab';
export type NumberLocale = 'ar' | 'en';
export type NumberOptions = { locale: NumberLocale; numerals?: NumeralSystem };

export const EMPTY_NUMBER = '–';

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(locale: NumberLocale, numerals: NumeralSystem, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${locale}|${numerals}|${maximumFractionDigits}`;
  let found = formatters.get(key);
  if (!found) {
    found = new Intl.NumberFormat(locale, { numberingSystem: numerals, maximumFractionDigits, minimumFractionDigits: 0 });
    formatters.set(key, found);
  }
  return found;
}

const usable = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Half away from zero (so -2.5 gives -3, like 2.5 gives 3) and never negative zero. */
function roundTo(value: number, step: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) / step) * step;
  return rounded === 0 ? 0 : rounded;
}

/** Calories, rounded to the nearest 5. */
export function formatKcal(value: number | null | undefined, opts: NumberOptions): string {
  if (!usable(value)) return EMPTY_NUMBER;
  return formatter(opts.locale, opts.numerals ?? 'latn', 0).format(roundTo(value, 5));
}

/** Macro grams, rounded to a whole number. */
export function formatMacro(value: number | null | undefined, opts: NumberOptions): string {
  if (!usable(value)) return EMPTY_NUMBER;
  return formatter(opts.locale, opts.numerals ?? 'latn', 0).format(roundTo(value, 1));
}

/** Any other count or measurement: at most `maximumFractionDigits` decimals (default 1), no rounding to 5. */
export function formatNumber(value: number | null | undefined, opts: NumberOptions & { maximumFractionDigits?: number }): string {
  if (!usable(value)) return EMPTY_NUMBER;
  const formatted = formatter(opts.locale, opts.numerals ?? 'latn', opts.maximumFractionDigits ?? 1).format(value);
  // Intl prints "-0" for tiny negatives that round to zero.
  return /^[-‎‏؜−]+[0٠.,٫]+$/.test(formatted) ? formatter(opts.locale, opts.numerals ?? 'latn', 0).format(0) : formatted;
}

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/**
 * Text a coach wrote or the app stored ("Phase 1") keeps Western digits in the database. Show it in the reader's
 * numeral system, so one screen never mixes the two. Only the digits 0 to 9 change; every other character stays.
 */
export function localizeDigits(text: string, numerals: NumeralSystem = 'latn'): string {
  return numerals === 'arab' ? text.replace(/[0-9]/g, digit => ARABIC_INDIC_DIGITS[Number(digit)]!) : text;
}

/** The numeral system chosen in a user's preferences; anything unreadable falls back to Western digits. */
export function numeralPolicy(preferences: unknown): NumeralSystem {
  if (typeof preferences !== 'object' || preferences === null) return 'latn';
  const value = (preferences as { numerals?: unknown }).numerals;
  return value === 'arab' ? 'arab' : 'latn';
}

/** Next-intl gives a string locale; anything but Arabic is formatted as English. */
export const numberLocale = (locale: string): NumberLocale => (locale === 'ar' ? 'ar' : 'en');

/** A nutrition value by its key: `kcal` rounds to 5, the gram keys to a whole number. */
export function formatNutrient(key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG', value: number | null | undefined, opts: NumberOptions): string {
  return key === 'kcal' ? formatKcal(value, opts) : formatMacro(value, opts);
}
