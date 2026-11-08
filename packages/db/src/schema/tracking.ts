import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { ACCESS, OWN, STAFF, T, allow, tenantGuard } from './_rls';
import { exercises, programVersions, programs } from './programs';
import { media } from './ops';
import { clients } from './clients';
import type { Workout } from '@dawlyy/core/types';
import { metricKind, metricSource, sessionState } from './enums';
import { tenants } from './tenants';

// 0004 hand edit H2: place referenced unique indexes before foreign keys, doc §11.2.

/** Spec §19 (workout execution), §24–§28 (tracking, measurements, photos, InBody). */

/** One scalar measurement. Corrections insert a new row pointing at the old one; nothing is deleted. */
/** doc §5.2, §8: metric_entries policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const metricEntries = pgTable(
  'metric_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    metric: metricKind('metric').notNull(),
    /** For metric = habit or custom. */
    metricKey: text('metric_key'),
    value: numeric('value', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    unit: text('unit').notNull(),
    source: metricSource('source').notNull().default('manual'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    localDate: date('local_date').notNull(),
    timezone: text('timezone').notNull(),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    correctionOf: uuid('correction_of'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('metric_entries_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('metric_entries_client_metric_date_idx').on(t.tenantId, t.clientId, t.metric, t.localDate),
    uniqueIndex('metric_entries_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    foreignKey({
      name: 'metric_entries_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'metric_entries_correction_fk',
      columns: [t.tenantId, t.clientId, t.correctionOf],
      foreignColumns: [t.tenantId as AnyPgColumn, t.clientId as AnyPgColumn, t.id as AnyPgColumn],
    }).onDelete('no action'),
    ...tenantGuard('metric_entries', T(t.tenantId)),
    ...allow('metric_entries_staff', ['select', 'insert'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('metric_entries_client', ['select', 'insert'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

export type MeasurementValue = { type: string; value: number; unit: 'cm' | 'in'; side?: 'left' | 'right' };

/** doc §5.2, §8: measurement_sets policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const measurementSets = pgTable(
  'measurement_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    localDate: date('local_date').notNull(),
    values: jsonb('values').$type<MeasurementValue[]>().notNull(),
    takenBy: text('taken_by').notNull().default('client'),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('measurement_sets_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('measurement_sets_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    foreignKey({
      name: 'measurement_sets_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    ...tenantGuard('measurement_sets', T(t.tenantId)),
    ...allow('measurement_sets_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('measurement_sets_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

export type ProgressPose = { pose: 'front' | 'back' | 'left' | 'right' | 'custom'; mediaId: string; label?: string };

/** doc §5.2, §8: progress_photo_sets policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const progressPhotoSets = pgTable(
  'progress_photo_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    localDate: date('local_date').notNull(),
    poses: jsonb('poses').$type<ProgressPose[]>().notNull(),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2, mode: 'number' }),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('progress_photo_sets_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('progress_photo_sets_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    foreignKey({
      name: 'progress_photo_sets_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    ...tenantGuard('progress_photo_sets', T(t.tenantId)),
    ...allow('progress_photo_sets_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('progress_photo_sets_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** doc §5.2, §8: inbody_records policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const inbodyRecords = pgTable(
  'inbody_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    localDate: date('local_date').notNull(),
    rawMediaId: uuid('raw_media_id'),
    /** Fields as typed by the coach/client. */
    fields: jsonb('fields').$type<Record<string, number | string>>().notNull().default({}),
    /** Normalized: weightKg, skeletalMuscleKg, bodyFatKg, bodyFatPct, bmi, visceralFatLevel, bmrKcal, waterL … */
    normalized: jsonb('normalized').$type<Record<string, number>>().notNull().default({}),
    source: text('source').notNull().default('manual'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inbody_records_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    foreignKey({
      name: 'inbody_records_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'inbody_records_media_fk',
      columns: [t.tenantId, t.clientId, t.rawMediaId],
      foreignColumns: [media.tenantId, media.clientId, media.id],
    }).onDelete('no action'),
    ...tenantGuard('inbody_records', T(t.tenantId)),
    ...allow('inbody_records_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('inbody_records_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

/** A workout the client performed (or skipped). The planned workout is snapshotted so history survives republishing. */
/** doc §5.2, §8: workout_sessions policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    programId: uuid('program_id'),
    programVersionId: uuid('program_version_id'),
    /** Ids inside the program document. */
    phaseId: text('phase_id'),
    weekId: text('week_id'),
    dayId: text('day_id'),
    workoutId: text('workout_id'),
    plannedWorkout: jsonb('planned_workout').$type<Workout>(),
    state: sessionState('state').notNull().default('not_started'),
    localDate: date('local_date').notNull(),
    timezone: text('timezone').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Seconds the timer ran, excluding pauses. */
    activeSeconds: integer('active_seconds').notNull().default(0),
    rpeOverall: numeric('rpe_overall', { precision: 4, scale: 1, mode: 'number' }),
    mood: text('mood'),
    painNote: text('pain_note'),
    clientNote: text('client_note'),
    /** Computed by @dawlyy/core/workout on completion. */
    summary: jsonb('summary').$type<Record<string, unknown>>(),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('workout_sessions_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('workout_sessions_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    index('workout_sessions_client_workout_idx').on(t.tenantId, t.clientId, t.workoutId),
    uniqueIndex('workout_sessions_tenant_client_id_uq').on(t.tenantId, t.clientId, t.id),
    foreignKey({
      name: 'workout_sessions_client_fk',
      columns: [t.tenantId, t.clientId],
      foreignColumns: [clients.tenantId, clients.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'workout_sessions_program_fk',
      columns: [t.tenantId, t.clientId, t.programId],
      foreignColumns: [programs.tenantId, programs.clientId, programs.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'workout_sessions_version_fk',
      columns: [t.tenantId, t.clientId, t.programId, t.programVersionId],
      foreignColumns: [programVersions.tenantId, programVersions.clientId, programVersions.programId, programVersions.id],
    }).onDelete('no action'),
    check('workout_sessions_program_pair_ck', sql`${t.programVersionId} is null or ${t.programId} is not null`),
    ...tenantGuard('workout_sessions', T(t.tenantId)),
    ...allow('workout_sessions_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('workout_sessions_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();

export const SET_TAGS = ['warmup', 'working', 'drop', 'failure', 'backoff', 'amrap'] as const;

/** One performed set. Last-write-wins by client_updated_at on (tenant_id, client_id, client_uuid). */
/** doc §5.2, §8: set_logs policies and referential integrity. */
// triggers, functions and grants: 0006, doc §6.3, §7, §11.4.
export const setLogs = pgTable(
  'set_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    exerciseId: uuid('exercise_id').notNull(),
    /** Ids inside the planned workout, when the set was planned. */
    blockId: text('block_id'),
    itemId: text('item_id'),
    setNo: integer('set_no').notNull(),
    tag: text('tag').notNull().default('working'),
    reps: integer('reps'),
    load: numeric('load', { precision: 8, scale: 2, mode: 'number' }),
    loadUnit: text('load_unit'),
    durationSec: integer('duration_sec'),
    distanceM: numeric('distance_m', { precision: 9, scale: 1, mode: 'number' }),
    rpe: numeric('rpe', { precision: 4, scale: 1, mode: 'number' }),
    rir: integer('rir'),
    restSec: integer('rest_sec'),
    completed: boolean('completed').notNull().default(true),
    skipped: boolean('skipped').notNull().default(false),
    /** Set when the client swapped the planned exercise. */
    substitutedFor: uuid('substituted_for'),
    painFlag: boolean('pain_flag').notNull().default(false),
    note: text('note'),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('set_logs_client_uuid_uq').on(t.tenantId, t.clientId, t.clientUuid),
    index('set_logs_session_idx').on(t.sessionId),
    index('set_logs_client_exercise_idx').on(t.tenantId, t.clientId, t.exerciseId, t.createdAt),
    index('set_logs_exercise_idx').on(t.exerciseId),
    index('set_logs_substituted_idx').on(t.substitutedFor).where(sql`${t.substitutedFor} is not null`),
    foreignKey({
      name: 'set_logs_session_fk',
      columns: [t.tenantId, t.clientId, t.sessionId],
      foreignColumns: [workoutSessions.tenantId, workoutSessions.clientId, workoutSessions.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'set_logs_exercise_fk',
      columns: [t.exerciseId],
      foreignColumns: [exercises.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'set_logs_substituted_fk',
      columns: [t.substitutedFor],
      foreignColumns: [exercises.id],
    }).onDelete('no action'),
    ...tenantGuard('set_logs', T(t.tenantId)),
    ...allow('set_logs_staff', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${STAFF} and ${ACCESS(t.clientId)}`),
    ...allow('set_logs_client', ['select', 'insert', 'update'], sql`${T(t.tenantId)} and ${OWN(t.clientId)}`),
  ],
).enableRLS();
