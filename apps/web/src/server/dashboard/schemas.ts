import { z } from '@hono/zod-openapi';
import { QUEUE_KINDS } from './logic';

const instant = z.iso.datetime({ offset: true });
const listBase = { limit: z.string().optional(), cursor: z.string().optional() };

/** Task 10: GET /dashboard/queue/{kind} path parameter. */
export const queueParams = z.object({ kind: z.enum(QUEUE_KINDS) });
/** Task 10: paging query shared by queue and timeline reads. */
export const pagingQuery = z.object(listBase);
/** Task 10: GET /dashboard/timeline/{clientId} path parameter. */
export const timelineParams = z.object({ clientId: z.uuid() });
/** Task 10: task id path parameter. */
export const taskParams = z.object({ id: z.uuid() });

/** Task 10: GET /tasks filters. `open` (default) includes snoozes whose time has passed. */
export const taskListQuery = z.object({
  ...listBase,
  state: z.enum(['open', 'snoozed', 'done', 'cancelled', 'all']).optional(),
  assigneeMembershipId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  dueBefore: instant.optional(),
});

/** Task 10: POST /tasks body. Server-owned columns (id, tenant, source, dedupe key, state, stamps) are not accepted. */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).nullish(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueAt: instant.nullish(),
  clientId: z.uuid().nullish(),
  assigneeMembershipId: z.uuid().nullish(),
}).strict();

/** Task 10: PATCH /tasks/{id} body; the client of a task is immutable. */
export const patchTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  detail: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueAt: instant.nullable().optional(),
  assigneeMembershipId: z.uuid().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, { message: 'At least one field is required' });

/** Task 10: POST /tasks/{id}/snooze body. */
export const snoozeSchema = z.object({ until: instant }).strict();

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type PatchTaskInput = z.infer<typeof patchTaskSchema>;
export type TaskListQuery = z.infer<typeof taskListQuery>;
