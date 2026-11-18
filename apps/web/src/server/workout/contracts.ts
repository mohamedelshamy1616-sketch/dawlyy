import { z } from 'zod';
import { SESSION_STATES, type ProgramDocument, type Workout, type LocalizedText } from '@dawlyy/core/types';
import type { PerformedSet, SessionRecord } from '@dawlyy/core/workout';
import type { buildSummary } from './logic';
import { MAX_SYNC_SESSIONS, MAX_SYNC_SETS, MAX_SYNC_TIMESTAMP_CHARS } from '../request-limits';

const uuid = z.string().uuid();
const stamp = z.iso.datetime({ offset: true }).max(MAX_SYNC_TIMESTAMP_CHARS);
const date = z.iso.date();
const zone = z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid timezone');

/** Task 5: immutable session references; the server resolves the workout snapshot itself. */
export const startSessionSchema = z.object({ clientUuid: uuid, programId: uuid, programVersionId: uuid, dayId: z.string().min(1).max(64), workoutId: z.string().min(1).max(64), localDate: date, timezone: zone }).strict();
const mutableSession = z.object({ localDate: date.optional(), timezone: zone.optional(), startedAt: stamp.nullable().optional(), endedAt: stamp.nullable().optional(), activeSeconds: z.number().int().min(0).max(31_536_000).optional(), rpeOverall: z.number().min(1).max(10).nullable().optional(), mood: z.string().max(200).nullable().optional(), painNote: z.string().max(2000).nullable().optional(), clientNote: z.string().max(4000).nullable().optional() });
/** Task 5: sync snapshots use client timestamps; state is validated with the core machine. */
export const sessionSyncSchema = startSessionSchema.partial().extend({ clientUuid: uuid, clientUpdatedAt: stamp, state: z.enum(SESSION_STATES).optional(), ...mutableSession.shape }).strict();
/** Task 5 / doc §6.3: exactly the mutable set-log fields, excluding server identities and stamps. */
export const setSyncSchema = z.object({ clientUuid: uuid, clientUpdatedAt: stamp, sessionClientUuid: uuid, exerciseId: uuid,
  blockId: z.string().max(64).nullable().optional(), itemId: z.string().max(64).nullable().optional(), setNo: z.number().int().min(1).max(1000),
  tag: z.enum(['warmup', 'working', 'drop', 'failure', 'backoff', 'amrap']).default('working'), reps: z.number().int().min(0).max(10000).nullable().optional(),
  load: z.number().min(0).max(999999.99).nullable().optional(), loadUnit: z.enum(['kg', 'lb']).nullable().optional(), durationSec: z.number().int().min(0).max(86400).nullable().optional(), distanceM: z.number().min(0).max(99999999).nullable().optional(),
  rpe: z.number().min(1).max(10).nullable().optional(), rir: z.number().int().min(0).max(100).nullable().optional(), restSec: z.number().int().min(0).max(86400).nullable().optional(),
  completed: z.boolean().default(false), skipped: z.boolean().default(false), substitutedFor: uuid.nullable().optional(), painFlag: z.boolean().default(false), note: z.string().max(4000).nullable().optional(), deletedAt: stamp.nullable().optional(),
}).strict();
/** Task 5: bounded atomic outbox batch; rejected records do not abort other rows. */
export const syncSchema = z.object({ sessions: z.array(sessionSyncSchema).max(MAX_SYNC_SESSIONS), sets: z.array(setSyncSchema).max(MAX_SYNC_SETS) }).strict();
/** Task 5: explicit online transition events and editable personal notes. */
export const patchSessionSchema = mutableSession.extend({ event: z.enum(['start', 'pause', 'resume']).optional() }).strict().refine(value => Object.keys(value).length > 0);
/** Task 5: finish accepts observed facts; comparisons and summary remain server-owned. */
export const finishSchema = mutableSession.omit({ localDate: true, timezone: true, startedAt: true }).extend({ outcome: z.enum(['completed', 'partially_completed', 'abandoned']), endedAt: stamp, activeSeconds: z.number().int().min(0).max(31_536_000) }).strict();
/** Task 5: caller history filters, with clientId required separately for coach callers. */
export const historyQuerySchema = z.object({ clientId: uuid.optional(), from: date.optional(), to: date.optional(), cursor: z.string().optional(), limit: z.string().optional() });
/** Task 5: portable sync record consumed by the outbox and API. */
export type SessionWrite = z.infer<typeof sessionSyncSchema>;
/** Task 5: portable performed-set write consumed by the outbox and API. */
export type SetWrite = z.infer<typeof setSyncSchema>;
/** Task 5: summary directly from the shared core mapper. */
export type WorkoutSummary = ReturnType<typeof buildSummary>;
/** Task 5: exercise metadata resolved through the client column projection. */
export type PortalExercise = { id: string; name: LocalizedText; cues: LocalizedText[]; primaryMuscles: string[]; secondaryMuscles: string[]; videoUrl: string | null; thumbnailMediaId: string | null };
/** Task 5: serializable session, safe for IndexedDB and offline render. */
export type PortalSession = { id: string; clientUuid: string; createdAt: string; programId: string | null; programVersionId: string | null; dayId: string | null; workoutId: string | null; plannedWorkout: Workout | null; state: SessionRecord['state']; localDate: string; timezone: string; startedAt: string | null; endedAt: string | null; activeSeconds: number; clientUpdatedAt: string | null; rpeOverall: number | null; mood: string | null; painNote: string | null; clientNote: string | null; summary: WorkoutSummary | null; voidedAt?: string | null };
/** Task 5: full detail and comparison, cached locally when a workout is opened. */
export type SessionDetail = { session: PortalSession; sets: Array<SetWrite & { id: string }>; lastComparable: SessionRecord | null; exercises: PortalExercise[]; unit: 'kg' | 'lb' };
/** Task 5 cross-task contract: only the client's own published program document. */
export type PortalProgram = { programId: string; name: LocalizedText; versionNo: number; document: ProgramDocument; startDate?: string; progress: { weeksTotal: number; currentWeekIndex: number } };
/** Task 5 cross-task contract: read-only Today cards. */
export type PortalToday = { date: string; workout: { state: 'none' | 'planned' | 'active' | 'done' | 'rest'; sessionId?: string; name?: LocalizedText; dayLabel?: LocalizedText; exerciseCount?: number }; meals: { planName?: LocalizedText; kcalTarget?: number; link: true } | null; checkins: Array<{ eventId: string; title: LocalizedText | null; dueAt: string; state: string }>; intakePending: boolean; unreadMessages: number; subscription: { state: string; daysLeft?: number } };
/** Task 5 / G3: the core drawer return type, shared with history UI. */
export type ExerciseHistory = Array<{ sessionId: string; localDate: string; sets: PerformedSet[]; totals: { volume: number; reps: number; sets: number; completedSets: number; topLoad: number; est1RM: number } }>;
