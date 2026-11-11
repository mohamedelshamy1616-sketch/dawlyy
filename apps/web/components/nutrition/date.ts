/** Task 6: the date shape the Astryx DateInput speaks (yyyy-mm-dd). */
export type IsoDay = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
/** Task 6: narrow a server-provided local date before handing it to a date control. */
export function isIsoDay(value: string | undefined): value is IsoDay { return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value); }
