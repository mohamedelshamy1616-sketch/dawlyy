# Batch R1a: `packages/core/src/attention/`, the coach's "who needs me this week" ranking

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R1, item R1a. Read it and the "Why this build"
section. Background (why a ranked list with one reason per row beats counters):
`docs/research/research_notes/DAWLYY product reinvention research/dawlyy_ui_audit_vs_best.md` around line 146.

## Files you may write

- `packages/core/src/attention/index.ts` (barrel), `packages/core/src/attention/rank.ts`,
  `packages/core/src/attention/weights.ts`, and other files inside `packages/core/src/attention/` if useful.
- `packages/core/test/attention.test.ts`.

Nothing else. Claude adds the `./attention` export to `packages/core/package.json` and to `src/index.ts` itself.

## What to build

A pure, deterministic function:

```ts
export function rankAttention(clients: readonly AttentionInput[], opts: { today: IsoDate }): AttentionItem[];
```

`AttentionInput` (define it with Zod 4 in the module and export the schema and the type; validate input with
`.parse` at the start of `rankAttention` and let a `ZodError` escape):

- `clientId: string` (uuid)
- `lastCheckin: { submittedOn: IsoDate | null; status: 'none' | 'waiting_review' | 'reviewed'; dueOn: IsoDate | null }`
  (`waiting_review` = the client submitted, the coach has not reviewed; `dueOn` = the next check-in due date)
- `workouts: { planned7: number; done7: number; planned14: number; done14: number }` (non-negative integers,
  done never above planned is NOT guaranteed: clamp adherence at 100%)
- `mealLogDays7: number` (0 to 7: days with at least one non-voided meal log in the last 7 days)
- `nutritionAssigned: boolean` (meal adherence only counts when a plan is assigned)
- `weights14: { on: IsoDate; kg: number }[]` (non-voided weigh-ins in the last 14 days, any order)
- `goal: 'lose' | 'gain' | 'maintain' | null`
- `openRedFlags: { category: 'pain_injury' | 'eating_disorder' | 'pregnancy' | 'medication' | 'other' }[]`
- `paymentPending: boolean` (a payment waiting for the coach to verify)
- `subscriptionEndsOn: IsoDate | null`
- `lastCoachMessageOn: IsoDate | null`
- `unreadFromClient: number` (non-negative integer)

`AttentionItem`:

```ts
{ clientId: string; score: number; reasons: AttentionReason[]; primaryAction: AttentionAction }
type AttentionReason = { code: ReasonCode; params: Record<string, number | string> };
type AttentionAction = 'review' | 'reply' | 'nudge' | 'confirm_payment' | 'renew' | 'handle_flag';
```

Reason codes and their params (the UI renders them in ar and en from these codes; do not produce text):

| code | when | params |
|---|---|---|
| `red_flag` | one per open red flag category (deduplicate categories) | `{category}` |
| `checkin_waiting` | `status = 'waiting_review'` | `{days}` days since `submittedOn` (0 or more) |
| `checkin_overdue` | `dueOn` is before `today` and nothing submitted since `dueOn` | `{days}` days late |
| `unread_messages` | `unreadFromClient > 0` | `{count}` |
| `payment_pending` | `paymentPending` | `{}` |
| `subscription_ends` | `subscriptionEndsOn` within 0 to 7 days from `today` | `{days}` |
| `subscription_ended` | `subscriptionEndsOn` before `today`, at most 14 days ago | `{days}` days since |
| `adherence_drop` | 14-day workout adherence minus 7-day adherence is 30 points or more, with `planned7 >= 2` | `{from, to}` whole percentages: from = the earlier 7 days (`done14-done7` over `planned14-planned7`), to = the last 7 days |
| `low_adherence` | 7-day workout adherence below 50% with `planned7 >= 2`, and no `adherence_drop` | `{percent}` |
| `meals_missing` | `nutritionAssigned` and `mealLogDays7 <= 2` | `{days}` = 7 - mealLogDays7 |
| `weight_flat` | goal `lose` or `gain`, at least 3 weigh-ins spanning at least 10 days, and max - min within 0.5 kg | `{days}` = span in days |
| `weight_wrong_way` | goal `lose` and the least-squares slope over the weigh-ins is above +0.25 kg per week (or `gain` and below -0.25), with at least 3 weigh-ins spanning at least 7 days | `{kgPerWeek}` rounded to 1 decimal, signed |
| `no_contact` | `lastCoachMessageOn` is 10 or more days before `today`, or null | `{days}` (use 999 for null) |

All day counts are whole calendar days between `IsoDate`s (no time zones involved: inputs are already local dates).

## Scoring

- Weights live in ONE exported constant table `ATTENTION_WEIGHTS: Record<ReasonCode, { base: number; perUnit?:
  number; cap?: number }>` in `weights.ts`. A reason's points = `base + perUnit * units`, capped at `cap`, where
  units is the reason's main number param (days, count, points dropped). Pick weights so that, in this order of
  importance: `red_flag` > `checkin_waiting` > `unread_messages` > `payment_pending` > `subscription_ends` /
  `checkin_overdue` > `adherence_drop` > `weight_wrong_way` > `weight_flat` > `low_adherence` > `meals_missing` >
  `subscription_ended` > `no_contact`. Explain the choice in a short comment above the table.
- `score` = the sum of the client's reason points, rounded to an integer. A client with no reasons is omitted from
  the output.
- `reasons` are sorted by their points, highest first (ties by the order of the importance list above).
- `primaryAction` comes from the top reason: `red_flag` -> `handle_flag`; `checkin_waiting` -> `review`;
  `unread_messages` -> `reply`; `payment_pending` -> `confirm_payment`; `subscription_ends` and
  `subscription_ended` -> `renew`; everything else -> `nudge`.
- Output order: score descending; ties by the top reason's importance; then by `clientId` ascending, so the output
  is fully deterministic.

## Tests (`packages/core/test/attention.test.ts`)

Table-driven, at least 30 cases, each with a name. Include: empty input; a client with no reasons; each reason
code alone at and just past its threshold (both sides); several reasons on one client (reason order, score sum,
primary action); deduplicated red-flag categories; adherence clamped above 100%; zero planned workouts (no
adherence reasons, no division by zero); weight reasons with 2 weigh-ins (none), unsorted weigh-ins, and each goal;
`no_contact` with null; ties in score resolved by importance and then by `clientId`; invalid input (a negative
count) throws a `ZodError`; the same input in a different array order gives the same output.

## Answer

Files written; every export with its signature; the weight table with its rationale; any threshold you had to
interpret, with your reading.
