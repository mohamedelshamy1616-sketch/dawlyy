import { TZDate } from '@date-fns/tz';
import {
  ENTITLEMENT_KEYS,
  EntitlementOverride,
  EffectiveEntitlement,
  Frequency,
  PackageEntitlements,
  type EntitlementKey,
  type IsoDate,
  type IsoDateTime,
} from '../types';

export class EntitlementsError extends Error {
  constructor(public readonly code: 'invalid_override' | 'invalid_frequency', message: string) {
    super(message);
    this.name = 'EntitlementsError';
  }
}

export type EntitlementRef = EntitlementKey | { key: 'custom'; customKey: string };

/** Custom keys retain their entire value, including any colons. */
export function entitlementId(e: { key: EntitlementKey; customKey?: string }): string {
  if (e.key !== 'custom') return e.key;
  if (!e.customKey) throw new EntitlementsError('invalid_override', 'A custom entitlement requires customKey.');
  return `custom:${e.customKey}`;
}

/** Defined override fields win; expiry is evaluated only when today is supplied. */
export function resolveEntitlements(
  packageEntitlements: PackageEntitlements,
  overrides: EntitlementOverride[],
  opts?: { today?: IsoDate },
): EffectiveEntitlement[] {
  const base = PackageEntitlements.safeParse(packageEntitlements);
  const changes = EntitlementOverride.array().safeParse(overrides);
  if (!base.success || !changes.success) {
    throw new EntitlementsError('invalid_override', 'Invalid package entitlements or client overrides.');
  }

  const merged = new Map<string, EffectiveEntitlement>();
  for (const entitlement of base.data) {
    merged.set(entitlementId(entitlement), { ...entitlement, source: 'package' });
  }
  for (const override of changes.data) {
    const id = entitlementId(override);
    if (opts?.today !== undefined && override.expiresOn !== undefined && override.expiresOn < opts.today) continue;
    const existing = merged.get(id);
    const defined = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined));
    // Parse again to strip audit/expiry fields and detach nested client data.
    const result = EffectiveEntitlement.safeParse({
      ...existing,
      ...defined,
      enabled: override.enabled ?? existing?.enabled ?? false,
      source: 'override',
    });
    if (!result.success) throw new EntitlementsError('invalid_override', 'Invalid merged entitlement.');
    merged.set(id, result.data);
  }
  return [...merged.values()].sort((a, b) => {
    const keyOrder = ENTITLEMENT_KEYS.indexOf(a.key) - ENTITLEMENT_KEYS.indexOf(b.key);
    if (keyOrder !== 0) return keyOrder;
    const left = a.customKey ?? '';
    const right = b.customKey ?? '';
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export type UsagePeriod = { start: IsoDateTime; end: IsoDateTime };

function calendarDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function plusDays(date: IsoDate, days: number): IsoDate {
  const result = calendarDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function startOfDay(date: IsoDate, timezone: string): TZDate {
  const utc = calendarDate(date);
  return new TZDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 0, 0, 0, 0, timezone);
}

function validateTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new EntitlementsError('invalid_frequency', 'The usage window requires a valid timezone.');
  }
}

/** Inclusive local-day windows; calendar days keep anchored blocks stable over DST. */
export function periodFor(
  frequency: Frequency,
  now: IsoDateTime,
  subscriptionStart: IsoDate,
  timezone: string,
  opts?: { cycleDays?: number },
): UsagePeriod | null {
  if (!Frequency.safeParse(frequency).success) {
    throw new EntitlementsError('invalid_frequency', 'Unknown entitlement frequency.');
  }
  if (frequency === 'per_subscription' || frequency === 'unlimited') return null;
  validateTimezone(timezone);
  const today = new TZDate(now, timezone).toISOString().slice(0, 10);
  let start: IsoDate;
  let next: IsoDate;
  if (frequency === 'daily') {
    start = today;
    next = plusDays(today, 1);
  } else if (frequency === 'monthly') {
    start = `${today.slice(0, 7)}-01`;
    const following = calendarDate(start);
    following.setUTCMonth(following.getUTCMonth() + 1);
    next = following.toISOString().slice(0, 10);
  } else {
    const days = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : (opts?.cycleDays ?? 28);
    if (!Number.isSafeInteger(days) || days <= 0) {
      throw new EntitlementsError('invalid_frequency', 'cycleDays must be a positive integer.');
    }
    // Compare date ordinals, never elapsed zoned hours (a DST day can be 23/25 h).
    const elapsedDays = (calendarDate(today).getTime() - calendarDate(subscriptionStart).getTime()) / 86_400_000;
    start = plusDays(subscriptionStart, Math.floor(elapsedDays / days) * days);
    next = plusDays(start, days);
  }
  return {
    start: startOfDay(start, timezone).toISOString(),
    end: new TZDate(startOfDay(next, timezone).getTime() - 1, timezone).toISOString(),
  };
}

export type CanResult = {
  allowed: boolean;
  reason?: 'not_included' | 'disabled' | 'limit_reached' | 'window_expired';
  remaining?: number;
  period?: UsagePeriod | null;
  entitlement?: EffectiveEntitlement;
};

/** Check inclusion, enablement, local duration, then the caller-supplied usage count. */
export function can(
  effective: EffectiveEntitlement[],
  ref: EntitlementRef,
  ctx: { now: IsoDateTime; subscriptionStart: IsoDate; timezone: string; usedThisPeriod: number },
): CanResult {
  const parsed = EffectiveEntitlement.array().safeParse(effective);
  if (!parsed.success) throw new EntitlementsError('invalid_override', 'Invalid effective entitlements.');
  const id = entitlementId(typeof ref === 'string' ? { key: ref } : ref);
  const entitlement = parsed.data.find(item => entitlementId(item) === id);
  if (!entitlement) return { allowed: false, reason: 'not_included' };
  if (!entitlement.enabled) return { allowed: false, reason: 'disabled', entitlement };
  validateTimezone(ctx.timezone);
  const period = periodFor(entitlement.frequency ?? 'per_subscription', ctx.now, ctx.subscriptionStart, ctx.timezone);
  if (entitlement.durationDays !== undefined) {
    // Day 0 is the subscription start: duration N is usable through Day N's end.
    const lastDay = plusDays(ctx.subscriptionStart, entitlement.durationDays);
    const today = new TZDate(ctx.now, ctx.timezone).toISOString().slice(0, 10);
    if (today > lastDay) return { allowed: false, reason: 'window_expired', period, entitlement };
  }
  if (entitlement.limit !== undefined) {
    const remaining = Math.max(0, entitlement.limit - ctx.usedThisPeriod);
    if (ctx.usedThisPeriod >= entitlement.limit) return { allowed: false, reason: 'limit_reached', remaining: 0, period, entitlement };
    return { allowed: true, remaining, period, entitlement };
  }
  return { allowed: true, period, entitlement };
}
