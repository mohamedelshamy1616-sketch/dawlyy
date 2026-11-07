import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { Workout } from '@dawlyy/core/types';
import { clientPolicies } from './_rls';
import { metricKind, metricSource, sessionState } from './enums';
import { clients } from './clients';
import { tenants } from './tenants';

/** Spec §19 (workout execution), §24–§28 (tracking, measurements, photos, InBody). */

/** One scalar measurement. Corrections insert a new row pointing at the old one; nothing is deleted. */
export const metricEntries = pgTable(
  'metric_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
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
    uniqueIndex('metric_entries_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('metric_entries_client_metric_date_idx').on(t.tenantId, t.clientId, t.metric, t.localDate),
    ...clientPolicies('metric_entries', t, { clientWrite: true }),
  ],
);

export type MeasurementValue = { type: string; value: number; unit: 'cm' | 'in'; side?: 'left' | 'right' };

export const measurementSets = pgTable(
  'measurement_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    values: jsonb('values').$type<MeasurementValue[]>().notNull(),
    takenBy: text('taken_by').notNull().default('client'),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('measurement_sets_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('measurement_sets_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    ...clientPolicies('measurement_sets', t, { clientWrite: true }),
  ],
);

export type ProgressPose = { pose: 'front' | 'back' | 'left' | 'right' | 'custom'; mediaId: string; label?: string };

export const progressPhotoSets = pgTable(
  'progress_photo_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    poses: jsonb('poses').$type<ProgressPose[]>().notNull(),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2, mode: 'number' }),
    clientUuid: uuid('client_uuid').notNull(),
    clientUpdatedAt: timestamp('client_updated_at', { withTimezone: true }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('progress_photo_sets_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('progress_photo_sets_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    ...clientPolicies('progress_photo_sets', t, { clientWrite: true }),
  ],
);

export const inbodyRecords = pgTable(
  'inbody_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
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
  (t) => [index('inbody_records_client_date_idx').on(t.tenantId, t.clientId, t.localDate), ...clientPolicies('inbody_records', t, { clientWrite: true })],
);

/** A workout the client performed (or skipped). The planned workout is snapshotted so history survives republishing. */
export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
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
    uniqueIndex('workout_sessions_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('workout_sessions_client_date_idx').on(t.tenantId, t.clientId, t.localDate),
    index('workout_sessions_client_workout_idx').on(t.tenantId, t.clientId, t.workoutId),
    ...clientPolicies('workout_sessions', t, { clientWrite: true }),
  ],
);

export const SET_TAGS = ['warmup', 'working', 'drop', 'failure', 'backoff', 'amrap'] as const;

/** One performed set. Last-write-wins by client_updated_at on (tenant_id, client_uuid). */
export const setLogs = pgTable(
  'set_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('set_logs_client_uuid_uq').on(t.tenantId, t.clientUuid),
    index('set_logs_session_idx').on(t.sessionId),
    index('set_logs_client_exercise_idx').on(t.tenantId, t.clientId, t.exerciseId, t.createdAt),
    ...clientPolicies('set_logs', t, { clientWrite: true }),
  ],
);
