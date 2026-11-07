# Batch D — program editing operations, subscription lifecycle math

Modules: `packages/core/src/program-edit/`, `packages/core/src/subscription/`. Tests: `packages/core/test/program-edit.test.ts`, `packages/core/test/subscription.test.ts`.

Both modules are consumed by the next build wave: the coach program builder UI (React) dispatches `ProgramOp`s through `applyProgramOp`, and the subscriptions API uses `buildSubscriptionSchedule` / `reconcileSchedule` / `accessStatus` for assignment, extension, freeze and the client countdown. Existing modules you may import: `../types`, `../schedule` (read `packages/core/src/schedule/index.ts`: `generateSchedule`, `addDays`, `localDateOf`), `../versioning` is not needed.

## D1 — program-edit (`src/program-edit/index.ts`)

Spec §10 (program builder: phases, weeks, days, blocks, supersets/circuits, prescription fields) and §12 (inserted content becomes an instance). Types from `../types`: `ProgramDocument`, `ProgramPhase`, `ProgramWeek`, `ProgramDay`, `Workout`, `WorkoutBlock`, `WorkoutItem`, `PlannedSet`, `BlockKind`, `LocalizedText`, `IsoDate`, `ProgressionRule`.

Ids: pure functions cannot create random ids, so every function that creates elements takes `ctx: { newId: () => string }`. Tests use a deterministic counter factory (`id-1`, `id-2`, …) — note `Id` in `../types/common.ts` may require a uuid; read it and make the test factory produce values that satisfy the schema (e.g. deterministic uuid-shaped strings).

```ts
export type IdFactory = () => string;
export type EditCtx = { newId: IdFactory };

export type ProgramOp =
  | { type: 'phase.add'; afterPhaseId?: string; name?: LocalizedText; weeks?: number }      // default 1 week, all rest days
  | { type: 'phase.update'; phaseId: string; patch: { name?: LocalizedText; goal?: LocalizedText | null } }
  | { type: 'phase.remove'; phaseId: string }                                                 // last phase → ProgramEditError 'last_phase'
  | { type: 'phase.move'; phaseId: string; toIndex: number }
  | { type: 'phase.duplicate'; phaseId: string }                                              // inserted right after, every nested id new
  | { type: 'week.add'; phaseId: string; afterWeekId?: string; copyFromWeekId?: string }      // copy = deep copy with new ids
  | { type: 'week.remove'; phaseId: string; weekId: string }                                  // last week of a phase → 'last_week'
  | { type: 'week.duplicate'; phaseId: string; weekId: string }
  | { type: 'week.move'; phaseId: string; weekId: string; toIndex: number }
  | { type: 'week.update'; phaseId: string; weekId: string; patch: { isDeload?: boolean; note?: LocalizedText | null } }
  | { type: 'day.setKind'; dayId: string; kind: 'training' | 'rest' | 'active_recovery' }    // → training creates an empty workout { name: {ar:'تمرين',en:'Workout'}, blocks: [main block] } when none; → rest/active_recovery keeps an existing workout only for active_recovery
  | { type: 'day.update'; dayId: string; patch: { note?: LocalizedText | null } }
  | { type: 'day.copyTo'; fromDayId: string; toDayIds: string[] }                             // copies kind + workout (new ids) onto each target, overwriting
  | { type: 'day.swap'; dayIdA: string; dayIdB: string }                                      // swaps contents, keeps each day's id and index
  | { type: 'day.clear'; dayId: string }                                                      // → rest day, workout removed
  | { type: 'workout.update'; dayId: string; patch: { name?: LocalizedText; estimatedMinutes?: number | null; note?: LocalizedText | null } }
  | { type: 'block.add'; dayId: string; kind: BlockKind; afterBlockId?: string; name?: LocalizedText }
  | { type: 'block.update'; dayId: string; blockId: string; patch: { kind?: BlockKind; name?: LocalizedText | null; rounds?: number | null; restBetweenRoundsSec?: number | null; note?: LocalizedText | null } }
  | { type: 'block.remove'; dayId: string; blockId: string }
  | { type: 'block.move'; dayId: string; blockId: string; toIndex: number }
  | { type: 'block.insert'; dayId: string; block: WorkoutBlock; afterBlockId?: string }        // mini-plan insertion (§12): deep copy with new ids for block and items
  | { type: 'item.add'; dayId: string; blockId: string; exerciseId: string; sets?: number; template?: Partial<Omit<PlannedSet, 'setNo'>> } // default 3 sets, template copied into each set
  | { type: 'item.update'; dayId: string; itemId: string; patch: { progressionRule?: ProgressionRule | null; coachNote?: LocalizedText | null; alternatives?: string[] | null } }
  | { type: 'item.replaceExercise'; dayId: string; itemId: string; exerciseId: string }       // keeps sets and notes
  | { type: 'item.remove'; dayId: string; itemId: string }
  | { type: 'item.move'; dayId: string; itemId: string; toBlockId: string; toIndex: number }  // within or across blocks of the same workout
  | { type: 'item.duplicate'; dayId: string; itemId: string }
  | { type: 'set.add'; dayId: string; itemId: string; copyLast?: boolean }                    // default copyLast true
  | { type: 'set.update'; dayId: string; itemId: string; setNo: number; patch: Partial<Omit<PlannedSet, 'setNo'>> }
  | { type: 'set.remove'; dayId: string; itemId: string; setNo: number }                      // last set of an item → 'last_set'
  | { type: 'set.applyToAll'; dayId: string; itemId: string; patch: Partial<Omit<PlannedSet, 'setNo'>> }
  | { type: 'meta.update'; patch: { startDate?: IsoDate | null; endDate?: IsoDate | null; reviewDate?: IsoDate | null; goal?: LocalizedText | null; notes?: LocalizedText | null } };

/** A patch value of `null` removes that optional field; `undefined` leaves it unchanged. */
export function applyProgramOp(doc: ProgramDocument, op: ProgramOp, ctx: EditCtx): ProgramDocument;
export function applyProgramOps(doc: ProgramDocument, ops: ProgramOp[], ctx: EditCtx): ProgramDocument;

/** One phase named {ar:'المرحلة ١', en:'Phase 1'} (use Western digit 1 in both: 'المرحلة 1'), `weeks` weeks (default 4), 7 days each; days whose index is in trainingDays (default [0,2,4]) are training days with an empty workout. */
export function emptyProgram(ctx: EditCtx, opts?: { weeks?: number; trainingDays?: number[]; phaseName?: LocalizedText }): ProgramDocument;

export type DayRef = { phase: ProgramPhase; week: ProgramWeek; day: ProgramDay; phaseIndex: number; weekIndex: number; dayIndex: number };
export function findDay(doc: ProgramDocument, dayId: string): DayRef | null;

export type ProgramStats = { phases: number; weeks: number; trainingDays: number; workouts: number; blocks: number; items: number; sets: number; exerciseIds: string[] }; // exerciseIds distinct, first-seen order
export function programStats(doc: ProgramDocument): ProgramStats;

export type ProgramIssue = { path: string; code: 'unknown_exercise' | 'empty_workout' | 'training_without_workout' | 'duplicate_id' | 'bad_set_numbers' | 'bad_order' | 'bad_week_index' | 'bad_day_index' | 'empty_block' | 'date_order'; message: LocalizedText };
/** Publish-time checks beyond the Zod shape. `knownExerciseIds` given → every exerciseId and alternative must be in it. date_order: startDate ≤ reviewDate ≤ endDate when present. */
export function validateProgram(doc: ProgramDocument, opts?: { knownExerciseIds?: ReadonlySet<string> }): ProgramIssue[];

export class ProgramEditError extends Error { readonly code: 'not_found' | 'invalid_op' | 'last_phase' | 'last_week' | 'last_set' | 'index_out_of_range' }
```

Invariants every op must keep (tests assert them after every op):

- Input never mutated (deep-freeze the input in tests). Structural sharing of untouched branches is fine.
- The result passes `ProgramDocument.parse`.
- Week `index` is 0..n-1 in array order inside each phase after add/remove/move/duplicate. Day `index` stays 0..6 in array order (day.swap swaps contents, not indices).
- Item `order` is 0..n-1 in array order inside each block after add/remove/move/duplicate.
- `setNo` is 1..n in array order after set.add/set.remove.
- Every id in the document is unique; duplicate/copy/insert operations give every nested element (phase, week, day, workout, block, item) a fresh id from `ctx.newId`.
- `toIndex` is clamped to the valid range for move ops; an unknown id throws `not_found`.

Acceptance tests: emptyProgram defaults (1 phase, 4 weeks, 28 days, 12 training days with empty workouts); phase.duplicate yields fresh ids everywhere and identical content otherwise; week.add with copyFromWeekId copies workouts; removing the last week throws `last_week`; day.copyTo copies onto two targets with distinct new ids; item.move across blocks renumbers `order` in both blocks; set.remove renumbers to 1..n and refuses the last set; set.applyToAll patches every set but keeps setNo; meta.update with null removes reviewDate; block.insert deep-copies with new ids; validateProgram reports unknown exercise ids, a training day with an empty workout, and date_order; programStats counts on a fixture; applyProgramOps equals sequential application.

## D2 — subscription lifecycle (`src/subscription/index.ts`)

Spec §5 (overrides/extensions record old/new dates), §22 (Day 0), §24 (pause/freeze/extend recalculates dependent events), §30 (access vs payment, countdown, grace, never delete history), §56 (states). Types from `../types`: `IsoDate`, `IsoDateTime`, `SubscriptionState`, `CalendarEventState`, `ScheduleRules`, `ScheduleEvent`, `ScheduleEventType`, `LocalizedText`. Use `generateSchedule`, `addDays`, `localDateOf` from `../schedule`.

Date model (write it as a comment at the top of the module):

- `startsOn` is Day 0. A package of `durationDays` D has base `endsOn = startsOn + D` (so a 28-day package with weekly check-ins gets check-ins on days 7, 14, 21, 28 — the last one on endsOn).
- Access is active from startsOn through the whole local day of endsOn. Grace (when graceDays > 0) runs endsOn+1 … endsOn+graceDays.
- An extension of E days moves endsOn by +E and adds events for the new range. A freeze of F days starting on local date `fromDate` shifts every event dated on or after `fromDate` by +F and moves endsOn by +F. Renewal reminders are always recomputed relative to the final endsOn (never shifted).

```ts
export type Freeze = { fromDate: IsoDate; days: number };

export type SubscriptionTimeline = {
  startsOn: IsoDate;
  durationDays: number;
  /** Sum of all extensions granted (each extension is recorded separately by the caller; only the total matters here). */
  extensionDays: number;
  freezes: Freeze[];
  graceDays: number;
  timezone: string;
};

export function endsOnFor(t: SubscriptionTimeline): IsoDate;          // startsOn + durationDays + extensionDays + Σ freeze days
export function graceEndsOnFor(t: SubscriptionTimeline): IsoDate | null; // null when graceDays = 0

/** Events for the whole timeline: generateSchedule over [startsOn, startsOn + durationDays + extensionDays] with the rules, then freezes applied in fromDate order (cumulative), then renewal reminders recomputed against endsOnFor(t). ruleKey and localDate/dueAt reflect the shifted dates; wall-clock time of day is preserved in the timezone. */
export function buildSubscriptionSchedule(t: SubscriptionTimeline, rules: ScheduleRules): { endsOn: IsoDate; graceEndsOn: IsoDate | null; events: ScheduleEvent[] };

/** Mirrors a `calendar_events` row. `state` uses CALENDAR_EVENT_STATES from ../types: open = scheduled|due|overdue, closed = completed|skipped|rescheduled|cancelled. */
export type ExistingEvent = { id: string; ruleKey: string | null; type: string; localDate: IsoDate; dueAt: IsoDateTime; state: CalendarEventState; source: 'package_rule' | 'manual' | 'automation' };

export type Reconciliation = {
  insert: ScheduleEvent[];                                     // generated events (localDate ≥ today) whose ruleKey matches no existing row at all
  cancel: string[];                                            // ids of package_rule rows that are open, dated ≥ today, and whose ruleKey is absent from the new schedule
  update: Array<{ id: string; dueAt: IsoDateTime; localDate: IsoDate }>; // package_rule row, open, dated ≥ today, same ruleKey, dueAt changed
  /** The DB has a unique (subscription_id, rule_key) index, so a ruleKey that was cancelled earlier (e.g. by a freeze) and comes back must be reopened, never inserted twice. */
  reopen: Array<{ id: string; dueAt: IsoDateTime; localDate: IsoDate }>; // package_rule row in state 'cancelled' whose ruleKey reappears with localDate ≥ today
  untouched: string[];                                         // every other existing id: past rows, completed/skipped/rescheduled rows, manual/automation rows, unchanged open rows
};
/** Never touches rows dated before `today`, rows in completed|skipped|rescheduled, or rows whose source is not 'package_rule'. Every existing id appears in exactly one of cancel/update/reopen/untouched. Deterministic order: by dueAt then type. */
export function reconcileSchedule(existing: ExistingEvent[], generated: ScheduleEvent[], opts: { today: IsoDate }): Reconciliation;

export type AccessKind = 'not_started' | 'active' | 'grace' | 'paused' | 'expired' | 'cancelled' | 'suspended' | 'pending';
export type AccessStatus = {
  access: AccessKind;
  /** True only for active and grace: entitlement-gated content is served. */
  hasAccess: boolean;
  daysElapsed: number;      // max(0, today - startsOn), Day 0 = 0
  daysLeft: number;         // max(0, endsOn - today) — 0 on the last day itself means "ends today"
  totalDays: number;        // endsOn - startsOn
  graceDaysLeft: number | null;
  endsOn: IsoDate;
  label: LocalizedText;     // e.g. {ar:'باقي 5 أيام', en:'5 days left'}, {ar:'آخر يوم النهارده', en:'Ends today'}, {ar:'الاشتراك خلص', en:'Subscription ended'}, {ar:'فترة سماح: باقي يومين', en:'Grace period: 2 days left'}; Egyptian Arabic, correct dual/plural (يوم، يومين، 3 أيام، 11 يوم)
};
/** state is the stored subscription state; dates decide between active/grace/expired when the stored state is 'active' or 'grace' (a cron may lag). pending → 'pending', paused → 'paused', cancelled/suspended pass through, active before startsOn → 'not_started'. */
export function accessStatus(sub: { state: SubscriptionState; startsOn: IsoDate; endsOn: IsoDate; graceEndsOn?: IsoDate | null }, today: IsoDate): AccessStatus;

/** Which stored-state transition a nightly job should apply today, if any: 'enter_grace' | 'expire' | null (uses the state machine event names from ../state). */
export function dueTransition(sub: { state: SubscriptionState; endsOn: IsoDate; graceEndsOn?: IsoDate | null }, today: IsoDate): 'enter_grace' | 'expire' | null;

export class SubscriptionError extends Error { readonly code: 'invalid_timeline' | 'invalid_freeze' }
// invalid_timeline: durationDays < 1, extensionDays < 0, bad timezone; invalid_freeze: days < 1, fromDate before startsOn or after endsOn, overlapping freezes
```

Acceptance tests (Africa/Cairo unless stated): 28-day package with default rules → endsOn = start+28 and weekly check-ins on days 7/14/21/28 with renewal reminders 7/3/1 days before endsOn; extension of 7 days → endsOn +7, one more check-in on day 35, reminders move to the new end; a 7-day freeze from day 10 → check-ins on 7, 21, 28, 35 (the day-14 one shifted to 21, etc.), endsOn +7; two freezes accumulate; overlapping freezes throw `invalid_freeze`; reconcileSchedule after a freeze cancels the open future events whose ruleKey moved and inserts the shifted ones, but leaves a completed past check-in and a manual event untouched; update is emitted when only the time of day changed; a freeze followed by removing that freeze reopens the cancelled rows instead of inserting duplicates; every existing id lands in exactly one bucket; accessStatus labels for 5 days left, 2 days left (dual), 1 day left, ends today, grace with 2 days left, expired, not started, pending; dueTransition returns enter_grace the day after endsOn when grace > 0, expire when grace = 0 or after graceEndsOn, null otherwise; a DST case (Africa/Cairo switches in April and October; pick a 2026 transition) keeps 09:00 local wall time across a freeze shift.
