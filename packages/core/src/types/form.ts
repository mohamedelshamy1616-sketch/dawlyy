import { z } from 'zod';
import { Id, LocalizedText } from './common';

/** Spec §12 (intake), §17 (check-ins) and §18 (assessments) share one form engine. */

export const QUESTION_TYPES = [
  'text',
  'long_text',
  'number',
  'date',
  'time',
  'yes_no',
  'single',
  'multi',
  'scale',
  'photo',
  'video',
  'file',
] as const;
export const QuestionType = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof QuestionType>;

export const VISIBILITY_OPS = ['eq', 'neq', 'gt', 'lt', 'in', 'answered'] as const;

export const VisibilityCondition = z.object({
  questionId: Id,
  op: z.enum(VISIBILITY_OPS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});
export type VisibilityCondition = z.infer<typeof VisibilityCondition>;

export const QuestionOption = z.object({
  value: z.string().min(1),
  label: LocalizedText,
});

export const Question = z.object({
  id: Id,
  type: QuestionType,
  label: LocalizedText,
  help: LocalizedText.optional(),
  required: z.boolean().default(false),
  options: z.array(QuestionOption).optional(),
  scale: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
      minLabel: LocalizedText.optional(),
      maxLabel: LocalizedText.optional(),
    })
    .optional(),
  /** Number constraints. */
  min: z.number().optional(),
  max: z.number().optional(),
  unit: z.string().optional(),
  /** Show this question only when the condition holds. */
  visibleIf: VisibilityCondition.optional(),
  /** Metric this answer feeds (e.g. `weight`), so submissions can write metric entries. */
  metricKey: z.string().optional(),
});
export type Question = z.infer<typeof Question>;

export const FormSection = z.object({
  id: Id,
  title: LocalizedText,
  description: LocalizedText.optional(),
  questions: z.array(Question),
});
export type FormSection = z.infer<typeof FormSection>;

/** The immutable payload stored in `form_versions.document`. */
export const FormDocument = z.object({
  schemaVersion: z.literal(1).default(1),
  sections: z.array(FormSection).min(1),
  /** Minutes the client should expect to spend. */
  estimatedMinutes: z.number().int().positive().optional(),
  intro: LocalizedText.optional(),
});
export type FormDocument = z.infer<typeof FormDocument>;

export const AnswerValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  /** media ids for photo/video/file questions */
  z.object({ mediaIds: z.array(Id) }),
  z.null(),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

/** Answers keyed by question id. */
export const Answers = z.record(z.string(), AnswerValue);
export type Answers = z.infer<typeof Answers>;
