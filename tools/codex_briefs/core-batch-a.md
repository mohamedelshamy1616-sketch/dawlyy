# Batch A — entitlements, schedule, state machines

Modules: `packages/core/src/entitlements/`, `packages/core/src/schedule/`, `packages/core/src/state/`. Tests: `packages/core/test/entitlements.test.ts`, `schedule.test.ts`, `state.test.ts`.

## X1 — entitlements (`src/entitlements/index.ts`)

Spec §8–§9: a package carries entitlements; a client may have overrides that win over the package without touching the package. Types come from `../types`: `Entitlement`, `PackageEntitlements`, `EntitlementOverride`, `EffectiveEntitlement`, `EntitlementKey`, `Frequency`, `ENTITLEMENT_KEYS`, `IsoDate`, `IsoDateTime`.

```ts
export type EntitlementRef = EntitlementKey | { key: 'custom'; customKey: string };

/** Identity of an entitlement: `key`, or `custom:<customKey>` for custom ones. */
export function entitlementId(e: { key: EntitlementKey; customKey?: string }): string;

/**
 * Merge package entitlements with client overrides.
 *  - An override applies to the entitlement with the same id; defined fields replace the package values, undefined fields keep them.
 *  - An override whose `expiresOn` is before `opts.today` (IsoDate) is ignored.
 *  - An override for an id the package does not have adds a new entitlement (missing `enabled` → false).
 *  - Result is sorted by ENTITLEMENT_KEYS order, custom ones last by customKey; `source` is 'override' when any override touched it, else 'package'.
 */
export function resolveEntitlements(
  packageEntitlements: PackageEntitlements,
  overrides: EntitlementOverride[],
  opts?: { today?: IsoDate },
): EffectiveEntitlement[];

export type UsagePeriod = { start: IsoDateTime; end: IsoDateTime };

/**
 * The usage window that contains `now` for a frequency, in the client's zone.
 *  daily → that local day; weekly → 7-day blocks counted from subscriptionStart; biweekly → 14-day blocks;
 *  monthly → calendar month; per_cycle → `cycleDays` blocks (default 28) from subscriptionStart;
 *  per_subscription and unlimited → null (the whole subscription / no window).
 */
export function periodFor(
  frequency: Frequency,
  now: IsoDateTime,
  subscriptionStart: IsoDate,
  timezone: string,
  opts?: { cycleDays?: number },
): UsagePeriod | null;

export type CanResult = {
  allowed: boolean;
  reason?: 'not_included' | 'disabled' | 'limit_reached' | 'window_expired';
  remaining?: number; // undefined when unlimited
  period?: UsagePeriod | null;
  entitlement?: EffectiveEntitlement;
};

/**
 * May the client use `ref` now?
 *  - not in `effective` → { allowed: false, reason: 'not_included' }
 *  - enabled false → 'disabled'
 *  - durationDays set and now is after subscriptionStart + durationDays (end of that local day) → 'window_expired'
 *  - limit set and usedThisPeriod >= limit → 'limit_reached', remaining 0
 *  - otherwise allowed, remaining = limit - usedThisPeriod (or undefined when no limit)
 */
export function can(
  effective: EffectiveEntitlement[],
  ref: EntitlementRef,
  ctx: { now: IsoDateTime; subscriptionStart: IsoDate; timezone: string; usedThisPeriod: number },
): CanResult;
```

Error class: `EntitlementsError` with codes `invalid_override`, `invalid_frequency`.

Acceptance tests: override wins over package for `limit`; override with `enabled: false` denies even if package enables; override past `expiresOn` is ignored; override for a missing key adds it; `durationDays` denies after the window (test the last allowed day and the first denied day in Africa/Cairo); `limit` with weekly frequency: 2 used of 2 → denied, remaining 0; unlimited → remaining undefined; `periodFor('monthly')` in Africa/Cairo returns the local calendar month with correct offsets; custom key identity round-trips.

## X2 — schedule (`src/schedule/index.ts`)

Spec §22: Start Date = Day 0; Tracking Day 1 = next calendar day; first weekly check-in = Start Date + 7 unless the rule says otherwise; when `perCycle` is set, exactly that many check-ins per cycle (cycleWeeks × 7 days) spaced evenly, the first at `firstAfterDays`; VIP never creates daily check-ins unless `dailyCheckin.enabled`. Types from `../types`: `ScheduleInput`, `ScheduleRules`, `ScheduleEvent`, `ScheduleEventType`, `WeighInCadence`, `IsoDate`, `IsoDateTime`.

```ts
/**
 * Deterministic: same input → same events in the same order (sorted by dueAt, then type).
 * Every event: dueAt = localDate at the rule's timeOfDay in input.timezone, rendered as ISO with offset
 * (use TZDate from @date-fns/tz; DST transitions must keep the local time, so the offset changes, not the clock time).
 * ruleKey = `${type}:${localDate}` and, when two events of one type fall on the same local date, `${type}:${localDate}:${n}` with n from 1.
 * Nothing is generated before Day 1 except baseline events whose rule has firstAfterDays = 0 (measurements, progressPhotos); nothing after endDate.
 */
export function generateSchedule(input: ScheduleInput): ScheduleEvent[];

/** Helper exported for the API: the next N upcoming events after `after`. */
export function upcoming(events: ScheduleEvent[], after: IsoDateTime, limit: number): ScheduleEvent[];

/** Add `days` to an IsoDate (calendar arithmetic, zone-independent). */
export function addDays(date: IsoDate, days: number): IsoDate;

/** Local date string for an instant in a zone. */
export function localDateOf(instant: IsoDateTime, timezone: string): IsoDate;
```

Rule mapping (all types from `ScheduleEventType`):
- `weeklyCheckin` → `weekly_checkin`: if `perCycle` unset: Day firstAfterDays, then every `everyDays`; if set: within each cycle of `cycleWeeks*7` days starting Day 0, events at `firstAfterDays + k * floor(cycleDays / perCycle)` for k in 0..perCycle-1, repeated per cycle while ≤ endDate. `windowDays` from the rule; payload `{ cycle: number, indexInCycle: number }` when perCycle is set.
- `dailyCheckin` (only if enabled) → `daily_checkin` every day from Day 1 to endDate at its timeOfDay.
- `weighIn` → `weigh_in` at `weighInTimeOfDay`: `daily_fasted` every day from Day 1; `days_of_week` on those weekdays from Day 1; `weekly` on that weekday from Day 1; `custom` only the listed dates inside [Day 1, endDate]; `none` nothing.
- `measurements` / `progressPhotos` (IntervalRule, optional) → `measurements` / `progress_photos`: Day firstAfterDays (0 allowed = baseline on Day 0), then every `everyDays`.
- `techniqueReview` (if enabled) → `technique_review` once per week for the first `firstWeeks` weeks on Day 3 of each week (Day 3, 10, 17, …), payload `{ maxPerWeek }`, windowDays 6.
- `renewalReminderDaysBefore` → `renewal_reminder` at endDate − d for each d, 10:00 local, only when the date is after Day 0; payload `{ daysBefore: d }`, windowDays 0.
- `programReviewEveryDays` (optional) → `program_review` every N days from Day 0, excluding Day 0.

Error class: `ScheduleError` with codes `invalid_range` (endDate before startDate), `invalid_timezone`.

Acceptance tests: defaults with start 2026-11-01, end 2026-11-28, Africa/Cairo → weekly check-ins on 11-08, 11-15, 11-22 (and none on 11-29), no daily check-ins, renewal reminders on 11-21, 11-25, 11-27; `perCycle: 4, cycleWeeks: 4` over 8 weeks → 8 check-ins, first on Day 7, spaced 7 days; weigh-in `days_of_week [0,3]` never produces an event on Day 0; `custom` dates outside the range are dropped; DST: Africa/Cairo switches on 2026-04-24 (clocks forward at 00:00) and 2026-10-29 (back) — a daily weigh-in at 07:00 across 2026-04-23→04-25 keeps `T07:00` local with offsets +02:00 then +03:00; a 29-day February (2028) interval of 7 days lands on the right dates; determinism: two calls return deep-equal arrays; ruleKeys are unique within a result; `endDate < startDate` throws `invalid_range`.

## X3 — state machines (`src/state/index.ts`)

Spec §56. State vocabularies come from `../types` (`SUBSCRIPTION_STATES`, `CHECKIN_STATES`, `SESSION_STATES`, `MEDIA_REVIEW_STATES`, `PUBLISH_STATES`, `AUTOMATION_RUN_STATES`). Define the events here.

```ts
export type MachineName = 'subscription' | 'checkin' | 'session' | 'mediaReview' | 'publish' | 'automationRun';

export type Machine<S extends string = string, E extends string = string> = {
  name: MachineName;
  initial: S;
  states: readonly S[];
  terminal: readonly S[];
  transitions: ReadonlyArray<{ from: readonly S[]; event: E; to: S; note?: string }>;
};

export const machines: Readonly<Record<MachineName, Machine>>;

export type TransitionResult = { ok: true; to: string } | { ok: false; reason: 'unknown_machine' | 'unknown_state' | 'unknown_event' | 'not_allowed' | 'terminal'; message: string };

export function transition(machine: MachineName, from: string, event: string): TransitionResult;
export function canTransition(machine: MachineName, from: string, event: string): boolean;
export function eventsFrom(machine: MachineName, from: string): string[];
export function isTerminal(machine: MachineName, state: string): boolean;
```

Transitions to encode (from → event → to):
- subscription (initial `pending`, terminal `cancelled`): pending→activate→active; active→enter_grace→grace; active|grace→expire→expired; active→pause→paused; paused→resume→active; active|grace|paused→cancel→cancelled; pending|active|grace|paused|expired→suspend→suspended; suspended→reinstate→active; expired|grace→renew→active.
- checkin (initial `scheduled`, terminal reviewed|skipped|rescheduled|cancelled): scheduled→become_due→due; due→overdue→overdue; due|overdue→submit→submitted; submitted→route_to_coach→waiting_for_coach; submitted|waiting_for_coach→review→reviewed; scheduled|due|overdue→skip→skipped; scheduled|due|overdue→reschedule→rescheduled; scheduled|due|overdue→cancel→cancelled.
- session (initial `not_started`, terminal completed|partially_completed|abandoned|skipped): not_started→start→active; active→pause→paused; paused→resume→active; active|paused→complete→completed; active|paused→complete_partial→partially_completed; active|paused→abandon→abandoned; not_started→skip→skipped.
- mediaReview (initial `requested`, terminal archived): requested→upload→uploaded; uploaded→process→processing; uploaded|processing→queue→queued_for_review; queued_for_review→approve→approved; queued_for_review→request_resubmission→needs_resubmission; queued_for_review→reject→rejected; needs_resubmission→resubmit→uploaded; approved|rejected|needs_resubmission→archive→archived.
- publish (initial `draft`, terminal archived): draft→submit_review→in_review; in_review→approve→approved; in_review→reject→draft; approved→publish→published; draft→publish→published (note: solo owner shortcut, spec §40); published→supersede→superseded; draft|in_review|approved|published|superseded→archive→archived.
- automationRun (initial `pending`, terminal completed|cancelled): pending→start→running; running→complete→completed; running→fail→failed; failed→retry→retrying; retrying→rerun→running; pending|running|failed|retrying→cancel→cancelled.

Acceptance tests: for every machine, every state in `states` is reachable from `initial` (BFS over transitions); terminal states have no outgoing transitions; every `to` and every `from` is in `states`; the six specific paths above succeed; `transition('subscription','cancelled','activate')` returns `{ ok: false, reason: 'terminal' }`; unknown event returns `unknown_event`; `eventsFrom('checkin','due')` equals `['overdue','submit','skip','reschedule','cancel']` in declaration order.
