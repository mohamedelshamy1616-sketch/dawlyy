import { Buffer } from 'node:buffer';
import { z } from '@hono/zod-openapi';
import { validationError } from '../errors';

const cursorSchema = z.object({ k: z.union([z.string(), z.number().finite()]), id: z.string() }).strict();

/** doc §12.1 / build-plan API: opaque keyset position, including the stable row-id tie-breaker. */
export type Cursor = z.infer<typeof cursorSchema>;

/** doc §12.1 / build-plan API: encode a sort key and row id as unpadded base64url JSON. */
export function encodeCursor(cursor: Cursor): string {
  const parsed = cursorSchema.safeParse(cursor);
  if (!parsed.success) throw validationError(parsed.error.issues, 'Invalid pagination cursor');
  return Buffer.from(JSON.stringify(parsed.data), 'utf8').toString('base64url');
}

/** doc §12.1 / build-plan API: decode a cursor or throw 400 validation_error. */
export function decodeCursor(cursor: string): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid base64url');
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw new Error('Noncanonical base64url');
    const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return cursorSchema.parse(json);
  } catch {
    throw validationError(undefined, 'Invalid pagination cursor');
  }
}

/** doc §12.1 / build-plan API: validates raw query strings and resolves the default limit and cursor. */
export const listQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().transform((value) => value === undefined ? 20 : Number(value))
    .pipe(z.number().int().min(1).max(100)),
  cursor: z.string().transform((value, ctx) => {
    try {
      return decodeCursor(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid pagination cursor' });
      return z.NEVER;
    }
  }).optional(),
});

/** doc §12.1 / build-plan API: parse list parameters; reject invalid input with the standard 400 envelope. */
export function parseListQuery(query: { cursor?: string; limit?: string }): { limit: number; cursor: Cursor | undefined } {
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return { limit: parsed.data.limit, cursor: parsed.data.cursor };
}

/** doc §12.1 / build-plan API: turn limit + 1 sorted rows into a page without changing their order. */
export function page<T extends { id: string }>(
  rows: readonly T[],
  limit: number,
  keyOf: (row: T) => string | number,
): { items: T[]; nextCursor: string | null } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw validationError(undefined, 'Invalid page limit');
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = rows.length > limit && last !== undefined ? encodeCursor({ k: keyOf(last), id: last.id }) : null;
  return { items, nextCursor };
}

/** doc §12.1 / build-plan API: describe the standard list response for an OpenAPI item schema. */
export function pageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({ items: z.array(itemSchema), nextCursor: z.string().nullable() });
}
