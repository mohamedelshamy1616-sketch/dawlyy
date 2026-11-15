import { Buffer } from 'node:buffer';
import { z } from '@hono/zod-openapi';
import { validationError } from '../../api/errors';
import { ACTIVITY_ENTITY_NAMES, type ActivityQuery } from './types';

const entitySchema = z.enum(ACTIVITY_ENTITY_NAMES);
const clientSchema = z.uuid().transform(value => value.toLowerCase());
const decimalId = z.string().regex(/^[1-9]\d{0,18}$/).refine(value => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'));
const exactTimestamp = z.iso.datetime({ precision: 6 }).refine(value => !value.startsWith('0000-'));
const cursorSchema = z.object({
  v: z.literal(1), t: exactTimestamp, id: decimalId,
  clientId: clientSchema.nullable(), entity: entitySchema.nullable(),
}).strict();
export type ActivityCursor = z.infer<typeof cursorSchema>;
type Filters = Pick<ActivityQuery, 'clientId' | 'entity'>;

/** The cursor preserves PostgreSQL microseconds and bigint text; it conveys no authority. */
export function decodeActivityCursor(value: string, query: Filters): ActivityCursor {
  try {
    if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error('Noncanonical encoding');
    const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const cursor = cursorSchema.parse(json);
    if (cursor.clientId !== (query.clientId?.toLowerCase() ?? null) || cursor.entity !== (query.entity ?? null)) throw new Error('Filter mismatch');
    return cursor;
  } catch {
    throw validationError(undefined, 'Invalid activity cursor');
  }
}

export function encodeActivityCursor(row: { id: string; createdAt: string }, query: Filters): string {
  const parsed = cursorSchema.safeParse({ v: 1, t: row.createdAt, id: row.id, clientId: query.clientId?.toLowerCase() ?? null, entity: query.entity ?? null });
  if (!parsed.success) throw validationError(undefined, 'Invalid activity cursor');
  return Buffer.from(JSON.stringify(parsed.data), 'utf8').toString('base64url');
}

/** Strict raw-query schema, used before entering the authenticated transaction. */
export const activityQuerySchema = z.object({
  clientId: clientSchema.optional(),
  entity: entitySchema.optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  cursor: z.string().max(1024).optional(),
}).strict().superRefine((query, ctx) => {
  if (query.cursor !== undefined) {
    try { decodeActivityCursor(query.cursor, query); }
    catch { ctx.addIssue({ code: 'custom', path: ['cursor'], message: 'Invalid activity cursor' }); }
  }
});

export function parseActivityQuery(query: ActivityQuery) {
  const parsed = activityQuerySchema.safeParse(query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return { ...parsed.data, limit: Number(parsed.data.limit ?? '50'), cursor: parsed.data.cursor === undefined ? null : decodeActivityCursor(parsed.data.cursor, parsed.data) };
}

export const activityPageSchema = z.object({
  items: z.array(z.object({
    id: decimalId, createdAt: exactTimestamp, clientId: z.uuid().nullable(),
    actor: z.object({ userId: z.uuid().nullable(), displayName: z.string().nullable(), role: z.string().nullable() }),
    action: z.string(), entity: z.string(), entityId: z.string().nullable(), href: z.string().nullable(),
    version: z.object({ kind: z.enum(['program', 'nutrition', 'form']), headId: z.uuid(), versionNo: z.number().int().positive(), href: z.string(), canRevert: z.boolean() }).nullable(),
  })),
  nextCursor: z.string().nullable(),
});
