# Task 5: iOS Safari and installed PWA acceptance

Status: checklist written; device checks have not been performed by the builder. Record device, iOS version,
build identifier, locale, date and PASS/FAIL with evidence for every step when the integrator runs this.
Use a demo/test account and a migrated, seeded test database. Enable the worker in production or set
`NEXT_PUBLIC_ENABLE_SW=1` before starting the test server. Never enable it in normal development by default.

1. In Safari sign in as the demo client. Open Today, My Program, a workout, History and exercise history
   online. Confirm loading placeholders and friendly unassigned, rest-day and empty-history states.
2. Add the app to Home Screen and open it. Confirm the signed-in client, Today date in the client's
   timezone, phase/week selector, day buttons, exercise cues and video link. Repeat in English and Arabic.
3. At 360/375 px, check every page in both directions: no horizontal page scroll, wrapped long names,
   readable fields, 44 px touch targets, visible keyboard focus and no page zoom when editing numbers.
4. Start a workout online. Verify previous reps/load are visible before logging and prefilled in the
   preferred kg/lb unit. Verify the plan, notes and alternatives are cached before leaving this screen.
5. Turn on airplane mode. Log exactly three sets, including RPE/RIR, a set tag and a pain note.
   Confirm each completion and the persistent unsynced count. Pause/resume the session clock.
6. Finish a set: the rest timer uses the prescription. Add/remove 15 seconds. Background the app and return:
   countdown must follow wall time. At zero, lack of vibration on iOS is acceptable; logging must continue.
7. Close and reopen the installed app in airplane mode, then reload the previously visited workout URL.
   Confirm the workout and all three sets are present from IndexedDB and can still be edited.
   An unvisited offline URL may fail; never claim the app can download a new plan without a connection.
8. Reconnect and foreground the app. Verify flush on open, online event, returning to visible, and within
   30 seconds while visible. Tap Sync now twice. Query `GET /api/v1/workout-sessions/<sessionId>`:
   exactly three unique set UUIDs, latest values, no duplicate rows. A failed request must retain entries.
9. Finish online and compare volume, reps, top load and completion with the saved sets. Confirm server
   confirmation replaces the provisional summary. Try a changed prescription and verify the not-comparable notice.
   Finish offline separately, then reconnect and verify the same authoritative summary appears.
10. Open exercise history: last five sessions, numeric table and SVG trend. Open full workout history,
    including sessions older than three months, and use Load more without repeating entries.
11. Test a rejected record (terminal session resumed by another device): reason remains visible,
    rejected row stays stored and is never presented as synced. Test retry after network failure/backoff.
12. With two demo clients, switch accounts online and in another tab. Verify no prior user's badge,
    pending rows, cached pages or workout inputs appear in the other account, and no old queue is sent.
    Sign out, go offline and try Back/reload. Previously cached personal pages must be unavailable.
13. Under storage pressure/private browsing, verify a storage failure produces the save error and never
    claims a set is safely saved. iOS may evict site storage: reopen online before relying on offline mode.
14. Upgrade the worker version and reopen online. Verify obsolete worker caches are removed; the per-user
    IndexedDB outbox survives the update. Recheck offline reopen after one online visit to the new version.

Automated companion: `apps/web/e2e/offline-workout.spec.ts` provisions a published demo copy using coach APIs,
records an earlier comparison session, reloads offline, logs three sets, adjusts rest, reconnects and double-flushes.
Run it with the worker opt-in above; this file does not record an automated or manual pass.

## Integrator handoff (resume round 3)

Written in this run: the seven page/loading pairs (Today, Program, workout start, workout detail, history list,
history detail, exercise history); the client layout runtime mount; StartWorkout, HistoryList, HistoryDetail,
PortalFrame and PortalEmpty; the versioned public worker; both API suites and their isolated workoutFixture;
the offline Playwright test; both workout namespaces and additions to both client namespaces. Existing owned
portal components now use Astryx controls, typography and layouts, including BottomSheet and Table. No new
shadcn fallback or dependency was needed. The existing API routes and their service implementation were kept.
The owned logic adds parseWorkoutNumber, and the runtime/flusher now hide an expired or different identity.

Validation performed by the builder: Python JSON/key/Arabic-character checks and a local tree-sitter syntax
parse. Not run: TypeScript, ESLint, Vitest/DB tests, Playwright, next build, check-messages.mjs or Astryx doctor,
because the build brief prohibits their executable/toolchain commands. Device checks above remain unperformed.
Claude must run these gates before accepting or committing this batch. No commits or remote actions were made.

API contract (all paths below have the /api/v1 prefix):

- GET /me is unchanged. GET /me/today and GET /me/program require role client and tracking:view.
  Portal errors are 401 unauthenticated, 403 forbidden, 404 not_found; Today additionally has 400 validation_error.
- POST /workout-sessions, POST /workout-sessions/sync, PATCH /workout-sessions/{id}, and
  POST /workout-sessions/{id}/finish require role client and tracking:edit, and mount idempotentReplay after auth.
- GET /workout-sessions, GET /workout-sessions/{id}, GET /workout-sessions/exercise-history/{exerciseId}
  expose own-client history; staff/owner reads require clients:view and remain restricted by RLS. Coach lists
  and exercise history require clientId. Error vocabulary: 400 validation_error, 401 unauthenticated,
  403 forbidden (or substitution_not_allowed), 404 not_found, 409 session_conflict, 422 illegal_transition.
  The shared replay middleware can additionally report 409 idempotency_key_reused. Sync reports record-level
  refusals in rejected rather than aborting the batch with 4xx.

GET /me/today returns exactly the following public structure; names/titles are LocalizedText objects:

```ts
{
  date: string,
  workout: { state: 'none' | 'planned' | 'active' | 'done' | 'rest',
    sessionId?: string, name?: LocalizedText, dayLabel?: LocalizedText, exerciseCount?: number },
  meals: { planName?: LocalizedText, kcalTarget?: number, link: true } | null,
  checkins: Array<{ eventId: string, title: LocalizedText | null, dueAt: string, state: string }>,
  intakePending: boolean, unreadMessages: number,
  subscription: { state: string, daysLeft?: number }
}
```

GET /me/program returns null or:

```ts
{ programId: string, name: LocalizedText, versionNo: number, document: ProgramDocument,
  startDate?: string, progress: { weeksTotal: number, currentWeekIndex: number } }
```

The document is parsed into the core public schema, without top-level internal notes, and always comes from
publishedVersionId. The start page resolves programVersionId server-side; it is not an extra field in this
fixed program response. It performs no write on GET: StartWorkout posts, caches the full SessionDetail and
then replaces the URL. A stable per-owner/program/version/day UUID survives retry.

The shared outbox envelope is:

```ts
type OutboxRecord<P> = {
  clientUuid: string; clientUpdatedAt: string; payload: P;
  syncState: 'pending' | 'synced' | 'rejected'; attempts: number;
  nextAttemptAt?: number; reason?: string;
};
type SessionOutbox = OutboxRecord<SessionWrite> & { cached: SessionDetail };
type SetOutbox = OutboxRecord<SetWrite>;
type MetricOutbox = OutboxRecord<Record<string, unknown>>;
```

The Dexie name is dawlyy-outbox-<userId>; sessions, setLogs and metrics all key on clientUuid. T8 owns metrics
flushing; workout sync never acknowledges metric rows. Pending rows sort by timestamp then UUID, and sessions
are sent before sets. Acknowledgements compare the timestamp actually sent, preserving concurrent edits.

Guard-owned/immutable columns found in the real contract: workout_sessions has immutable id, tenant_id,
client_id, program_id, program_version_id, phase_id, week_id, day_id, workout_id, planned_workout, client_uuid,
created_at and summary. updated_at is stamped by the guard. The API supplies tenant/client identity and derives
the plan from the published version; summary starts null and is written only by the documented service path.
set_logs has immutable id, tenant_id, client_id, session_id, client_uuid and created_at. Both tables enforce
monotonic client_updated_at; set_logs requires a non-null timestamp and uses deleted_at as its LWW tombstone.
There is no additional set-once guard list on these tables, nor a database session-transition machine: the
API must enforce every state move through core transition, including compaction of offline snapshots.

Other builders can reuse the existing exported PortalToday, PortalProgram, PortalSession, PortalExercise,
SessionDetail, SessionWrite, SetWrite, WorkoutSummary and ExerciseHistory contracts; resolveProgramDay,
parseWorkoutNumber, coreRecord and buildSummary; getToday/getPortalProgram; startSession/syncWorkout,
getSession/listSessions/getExerciseHistory; outboxFor/OutboxDatabase, queueSession/queueSet/cacheSession,
flushOutbox and useOutbox. Metrics remains the explicit T8 extension point. SetRow's per-set layout leaves
room for T9 coach feedback without putting private coach notes into these responses.

Resolved source discrepancies: actual spec workout logging is section 13, while sections 29–33 concern
versioning/access/automation/AI/voice. The real G2 row covers duplicate-safe sync; G3 covers previous values,
rest controls and unrestricted history. Both behaviours have API or e2e assertions. The brief explicitly
supersedes the old build-plan Serwist proposal with public/sw.js and the installed dependency set.
Exercise media uses its RLS-projected video URL; thumbnailMediaId is retained in the offline metadata, but
this batch has no signed-thumbnail URL endpoint, so no private media path is guessed or exposed.

### Exact message keys added in both locales

Existing client.today.subtitle, emptyTitle and emptyBody were retained. All workout keys below are new.

- `workout.blocks.{warmup, main, superset, circuit, cardio, mobility, corrective, cooldown}`.

- `workout.units.{kg, lb, %1rm, rpe-target, bodyweight}`.

- `workout.outcomes.{completed, partially_completed, abandoned, skipped, not_started, active, paused}`.

- `workout.reasons.{illegal_transition, session_conflict, not_found, forbidden, substitution_not_allowed, validation_error, unknown}`.

- `workout.tags.{warmup, working, drop, failure, amrap, backoff}`.

- `workout.muscleNames.{chest, back, lats, traps, shoulders, biceps, triceps, forearms, quads, hamstrings, glutes, calves, core, abs, obliques, adductors, abductors, lower_back}`.

Top-level `workout` keys: `program`, `workout`, `history`, `phaseWeek`, `week`, `day`, `days`, `planned`, `asPrescribed`, `restSeconds`, `tempo`, `restDay`, `exercise`, `video`, `muscles`, `targetMuscles`, `exerciseHistory`, `lastFive`, `historyOffline`, `loading`, `fullHistory`, `dismiss`, `emptyHistory`, `emptyHistoryBody`, `strengthTrend`, `date`, `volume`, `estimated1RM`, `setNumber`, `repUnit`, `rpe`, `rir`, `summary`, `wellDone`, `summaryPending`, `reps`, `topLoad`, `completionPct`, `percent`, `volumeUnit`, `delta`, `notComparable`, `loadWithUnit`, `load`, `durationSec`, `distanceM`, `prescription`, `lastTime`, `tag`, `painFlag`, `setNote`, `substitute`, `substitutionCoach`, `setDone`, `completeSet`, `skip`, `undoSkip`, `skipped`, `incomplete`, `storageError`, `unavailable`, `openOnlineFirst`, `sessionTimer`, `pause`, `resume`, `clientNote`, `mood`, `painNote`, `rpeOverall`, `outcome`, `finish`, `restTimer`, `lessRest`, `moreRest`, `restAdjustment`, `accountChanged`, `unsynced`, `syncNow`, `syncing`, `offlineSaved`, `rejected`, `emptyProgram`, `emptyProgramBody`, `startTitle`, `startError`, `retry`, `loadMore`.

Added `client` keys: `client.today.workout`, `client.today.restTitle`, `client.today.restBody`, `client.today.exercises`, `client.today.start`, `client.today.continue`, `client.today.meals`, `client.today.kcal`, `client.today.checkin`, `client.today.intake`, `client.today.water`, `client.today.steps`, `client.today.messages`, `client.today.subscription`, `client.today.daysLeft`, `client.today.subscriptionStates.none`, `client.today.subscriptionStates.pending`, `client.today.subscriptionStates.grace`, `client.today.subscriptionStates.suspended`.
