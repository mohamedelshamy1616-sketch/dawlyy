import { z } from 'zod';
import { Id, IsoDate, LocalizedText } from './common';

/** Spec §13 (exercise library) and §14 (program builder). */

export const LOAD_UNITS = ['kg', 'lb', '%1rm', 'rpe-target', 'bodyweight'] as const;
export const LoadUnit = z.enum(LOAD_UNITS);
export type LoadUnit = z.infer<typeof LoadUnit>;

export const PlannedLoad = z.object({
  value: z.number().nonnegative(),
  unit: LoadUnit,
});
export type PlannedLoad = z.infer<typeof PlannedLoad>;

export const PlannedSet = z.object({
  setNo: z.number().int().positive(),
  /** Free text so coaches can write "8-10", "AMRAP", "30s". */
  reps: z.string().max(32).optional(),
  load: PlannedLoad.optional(),
  /** e.g. "3-1-1-0" */
  tempo: z.string().max(16).optional(),
  restSec: z.number().int().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional(),
  rir: z.number().int().min(0).max(10).optional(),
  durationSec: z.number().int().positive().optional(),
  distanceM: z.number().positive().optional(),
  note: LocalizedText.optional(),
});
export type PlannedSet = z.infer<typeof PlannedSet>;

export const PROGRESSION_TYPES = ['reps', 'load', 'rpe'] as const;
export const ProgressionRule = z.object({
  type: z.enum(PROGRESSION_TYPES),
  /** When the client reaches this value on every set… */
  threshold: z.number(),
  /** …increase by this much next week (reps, kg/lb or RPE). */
  step: z.number(),
});
export type ProgressionRule = z.infer<typeof ProgressionRule>;

export const WorkoutItem = z.object({
  id: Id,
  exerciseId: Id,
  order: z.number().int().nonnegative(),
  sets: z.array(PlannedSet).min(1),
  progressionRule: ProgressionRule.optional(),
  coachNote: LocalizedText.optional(),
  /** Alternative exercise ids the client may swap to without asking. */
  alternatives: z.array(Id).optional(),
});
export type WorkoutItem = z.infer<typeof WorkoutItem>;

export const BLOCK_KINDS = ['warmup', 'main', 'superset', 'circuit', 'cardio', 'mobility', 'corrective', 'cooldown'] as const;
export const BlockKind = z.enum(BLOCK_KINDS);
export type BlockKind = z.infer<typeof BlockKind>;

export const WorkoutBlock = z.object({
  id: Id,
  kind: BlockKind,
  name: LocalizedText.optional(),
  items: z.array(WorkoutItem),
  /** Rounds for circuits; rest between rounds in seconds. */
  rounds: z.number().int().positive().optional(),
  restBetweenRoundsSec: z.number().int().nonnegative().optional(),
  note: LocalizedText.optional(),
});
export type WorkoutBlock = z.infer<typeof WorkoutBlock>;

export const Workout = z.object({
  id: Id,
  name: LocalizedText,
  blocks: z.array(WorkoutBlock),
  estimatedMinutes: z.number().int().positive().optional(),
  note: LocalizedText.optional(),
});
export type Workout = z.infer<typeof Workout>;

export const DAY_KINDS = ['training', 'rest', 'active_recovery'] as const;
export const ProgramDay = z.object({
  id: Id,
  /** 0-based index inside the week. */
  index: z.number().int().min(0).max(6),
  kind: z.enum(DAY_KINDS),
  workout: Workout.optional(),
  note: LocalizedText.optional(),
});
export type ProgramDay = z.infer<typeof ProgramDay>;

export const ProgramWeek = z.object({
  id: Id,
  /** 0-based index inside the phase. */
  index: z.number().int().nonnegative(),
  days: z.array(ProgramDay).length(7),
  isDeload: z.boolean().optional(),
  note: LocalizedText.optional(),
});
export type ProgramWeek = z.infer<typeof ProgramWeek>;

export const ProgramPhase = z.object({
  id: Id,
  name: LocalizedText,
  goal: LocalizedText.optional(),
  weeks: z.array(ProgramWeek).min(1),
});
export type ProgramPhase = z.infer<typeof ProgramPhase>;

/** The immutable payload stored in `program_versions.document`. */
export const ProgramDocument = z.object({
  schemaVersion: z.literal(1).default(1),
  phases: z.array(ProgramPhase).min(1),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
  reviewDate: IsoDate.optional(),
  goal: LocalizedText.optional(),
  notes: LocalizedText.optional(),
});
export type ProgramDocument = z.infer<typeof ProgramDocument>;

/** Spec §13: exercise library entry (seed and coach-created share the shape). */
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export const MOVEMENT_PATTERNS = [
  'squat',
  'hinge',
  'lunge',
  'push_horizontal',
  'push_vertical',
  'pull_horizontal',
  'pull_vertical',
  'carry',
  'rotation',
  'anti_rotation',
  'isolation',
  'locomotion',
  'other',
] as const;
export const PLANES = ['sagittal', 'frontal', 'transverse', 'multi'] as const;

export const ExerciseSeed = z.object({
  slug: z.string().min(1),
  name: LocalizedText,
  aliases: z.array(z.string()).default([]),
  category: z.string().min(1),
  // May be empty for coach-created or imported exercises; the system seed validator requires at least one.
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  movementPattern: z.enum(MOVEMENT_PATTERNS),
  equipment: z.array(z.string()).default([]),
  difficulty: z.enum(DIFFICULTIES),
  unilateral: z.boolean().default(false),
  compound: z.boolean().default(true),
  plane: z.enum(PLANES).default('sagittal'),
  cues: z.array(LocalizedText).default([]),
  commonMistakes: z.array(LocalizedText).default([]),
  contraindications: z.array(LocalizedText).default([]),
  progressions: z.array(z.string()).default([]),
  regressions: z.array(z.string()).default([]),
  alternatives: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  videoUrl: z.url().optional(),
});
export type ExerciseSeed = z.infer<typeof ExerciseSeed>;
