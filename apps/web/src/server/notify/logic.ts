import type { UserPreferences } from '@dawlyy/db/schema';

/** Task 9: pure notification rules (quiet hours, channel preferences, language), tested without a database. */

export type NotifyLanguage = 'ar' | 'en';
export type NotifyChannel = 'inapp' | 'webpush' | 'email';
export type QuietHours = { start: string; end: string };
export type ChannelPrefs = Record<NotifyChannel, boolean>;

/** Every channel is on until the user switches it off. */
export const DEFAULT_CHANNELS: ChannelPrefs = { inapp: true, webpush: true, email: true };

/** Task 9: `HH:MM` (24 h) to minutes after midnight, or null when malformed. */
export function parseClock(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Task 9: whether `zone` is an IANA zone the runtime knows. */
export function isValidTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
}

/** Task 9: wall-clock minutes after local midnight for an instant in `zone`. */
export function localMinutes(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0');
  return (hour % 24) * 60 + minute;
}

/**
 * Task 9: is `at` inside the quiet window? The window may wrap midnight (22:00 to 07:00). An empty window
 * (start equals end) or a malformed one never defers anything.
 */
export function inQuietHours(at: Date, quiet: QuietHours | undefined | null, zone: string): boolean {
  if (!quiet) return false;
  const start = parseClock(quiet.start); const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;
  const now = localMinutes(at, zone);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/** Task 9: the instant the quiet window ends (whole minute), or null when `at` is not inside it. */
export function quietWindowEnd(at: Date, quiet: QuietHours | undefined | null, zone: string): Date | null {
  if (!quiet || !inQuietHours(at, quiet, zone)) return null;
  const end = parseClock(quiet.end);
  if (end === null) return null;
  const delta = (end - localMinutes(at, zone) + 1440) % 1440;
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000 + delta * 60_000);
}

/** Task 9: the preference patch accepted by `PUT /notifications/preferences`; null clears a value. */
export type PreferencePatch = {
  locale?: 'ar' | 'en' | null;
  timezone?: string | null;
  quietHours?: QuietHours | null;
  channels?: Partial<Record<NotifyChannel, boolean>>;
};

/** Task 9: merge a patch into stored preferences. Channels merge key by key; null removes a scalar or the window. */
export function mergePreferences(current: UserPreferences, patch: PreferencePatch): UserPreferences {
  const next: UserPreferences = { ...current };
  if (patch.locale !== undefined) { if (patch.locale === null) delete next.locale; else next.locale = patch.locale; }
  if (patch.timezone !== undefined) { if (patch.timezone === null) delete next.timezone; else next.timezone = patch.timezone; }
  if (patch.quietHours !== undefined) { if (patch.quietHours === null) delete next.quietHours; else next.quietHours = { start: patch.quietHours.start, end: patch.quietHours.end }; }
  if (patch.channels) next.channels = { ...current.channels, ...patch.channels };
  return next;
}

/** Task 9: channel switches with defaults applied (in-app is always on; it is the notification center itself). */
export function effectiveChannels(prefs: UserPreferences | undefined | null): ChannelPrefs {
  return { inapp: true, webpush: prefs?.channels?.webpush !== false, email: prefs?.channels?.email !== false };
}

/** Task 9: language for notification text: the user's preference, then their membership locale, then the tenant default. */
export function resolveLanguage(preferred: string | null | undefined, membershipLocale: string | null | undefined, tenantDefault: string | null | undefined): NotifyLanguage {
  for (const candidate of [preferred, membershipLocale, tenantDefault]) {
    if (candidate === 'ar' || candidate === 'en') return candidate;
  }
  return 'ar';
}

/** Task 9: bounded retry schedule for failed provider calls: 5, 10 minutes, then give up after the third attempt. */
export const MAX_DELIVERY_ATTEMPTS = 3;
export function retryDelayMs(attempts: number): number { return Math.max(1, attempts) * 5 * 60_000; }

/** Task 9: the calendar day of an ISO timestamp in `zone` (the viewer's zone when omitted), as `YYYY-MM-DD`. */
export function dayKey(iso: string, zone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(zone ? { timeZone: zone } : {}) }).format(new Date(iso));
}

/** Task 9: group items (already newest first) into consecutive day buckets for the notification center. */
export function groupByDay<T extends { createdAt: string }>(items: readonly T[], zone?: string): Array<{ day: string; items: T[] }> {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const item of items) {
    const day = dayKey(item.createdAt, zone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item); else groups.push({ day, items: [item] });
  }
  return groups;
}
