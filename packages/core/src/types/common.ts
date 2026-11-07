import { z } from 'zod';

/** Opaque identifier: database uuid or client-generated uuid. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/** Calendar date without time, `YYYY-MM-DD`. */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

/** Timestamp with offset, e.g. `2026-11-07T09:00:00+02:00`. */
export const IsoDateTime = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTime>;

export const LOCALES = ['ar', 'en'] as const;
export const Locale = z.enum(LOCALES);
export type Locale = z.infer<typeof Locale>;

/**
 * Text shown to a client or coach. At least one language is present; the UI
 * falls back to the other language when the active one is missing.
 */
export const LocalizedText = z
  .object({ ar: z.string().optional(), en: z.string().optional() })
  .refine((v) => (v.ar ?? '').trim().length > 0 || (v.en ?? '').trim().length > 0, {
    message: 'LocalizedText needs at least one of ar or en',
  });
export type LocalizedText = z.infer<typeof LocalizedText>;

/** Resolve a LocalizedText for a locale with fallback to the other language. */
export function localize(text: LocalizedText | undefined | null, locale: Locale): string {
  if (!text) return '';
  const primary = text[locale];
  if (primary && primary.trim().length > 0) return primary;
  const other = locale === 'ar' ? text.en : text.ar;
  return other ?? '';
}

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export const WeightUnit = z.enum(WEIGHT_UNITS);
export type WeightUnit = z.infer<typeof WeightUnit>;

export const LENGTH_UNITS = ['cm', 'in'] as const;
export const LengthUnit = z.enum(LENGTH_UNITS);
export type LengthUnit = z.infer<typeof LengthUnit>;

/** Household and metric measures used for food quantities (spec §45, Egyptian household measures). */
export const MEASURE_KINDS = ['g', 'ml', 'piece', 'cup', 'tbsp', 'tsp', 'slice', 'can', 'loaf', 'custom'] as const;
export const MeasureKind = z.enum(MEASURE_KINDS);
export type MeasureKind = z.infer<typeof MeasureKind>;

export const Measure = z.object({
  kind: MeasureKind,
  /** Required when kind is `custom` (e.g. "كف يد", "handful"). */
  label: LocalizedText.optional(),
});
export type Measure = z.infer<typeof Measure>;

export const Macros = z.object({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().optional(),
});
export type Macros = z.infer<typeof Macros>;

export const MEDIA_KINDS = ['photo', 'video', 'file', 'voice'] as const;
export const MediaKind = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof MediaKind>;

/** Day of week, 0 = Sunday … 6 = Saturday (JavaScript convention). */
export const DayOfWeek = z.number().int().min(0).max(6);
export type DayOfWeek = z.infer<typeof DayOfWeek>;
