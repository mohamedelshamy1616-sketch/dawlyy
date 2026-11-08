import { Buffer } from 'node:buffer';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { describe, expect, it } from 'vitest';
import { ApiError, validationError } from '../errors';
import { decodeCursor, encodeCursor, listQuerySchema, page, pageSchema, parseListQuery } from './pagination';

describe('pagination', () => {
  it.each([{ k: 'اسم / +', id: 'row-1' }, { k: 42, id: 'row-2' }])('round trips an opaque cursor %j', (cursor) => {
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
    expect(parseListQuery({ cursor: encoded })).toEqual({ limit: 20, cursor });
  });

  it('uses the default and accepts both limit bounds', () => {
    expect(parseListQuery({})).toEqual({ limit: 20, cursor: undefined });
    expect(parseListQuery({ limit: '1' }).limit).toBe(1);
    expect(parseListQuery({ limit: '100' }).limit).toBe(100);
  });

  it.each(['0', '101', '-1', '1.5', 'NaN', 'Infinity', '', ' 2', '1e2', '0x10'])('rejects invalid limit %j', (limit) => {
    expect(() => parseListQuery({ limit })).toThrow(ApiError);
    expect(() => parseListQuery({ limit })).toThrow(expect.objectContaining({ status: 400, code: 'validation_error' }));
    expect(listQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([
    '', 'not-a-cursor', '%%%=',
    Buffer.from('not JSON').toString('base64url'),
    Buffer.from('null').toString('base64url'),
    Buffer.from('{"k":null,"id":"row"}').toString('base64url'),
    Buffer.from('{"k":{},"id":"row"}').toString('base64url'),
    Buffer.from('{"k":"key"}').toString('base64url'),
    Buffer.from('{"k":"key","id":2}').toString('base64url'),
    Buffer.from('{"k":1e400,"id":"row"}').toString('base64url'),
    Buffer.from('{"k":"key","id":"row","extra":true}').toString('base64url'),
    Buffer.from([123, 34, 107, 34, 58, 34, 255, 34, 44, 34, 105, 100, 34, 58, 34, 120, 34, 125]).toString('base64url'),
  ])('rejects malformed cursor %j', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(expect.objectContaining({ status: 400, code: 'validation_error' }));
    expect(() => parseListQuery({ cursor })).toThrow(ApiError);
    expect(listQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  it('returns only the requested rows and encodes the last returned tie-breaker', () => {
    const rows = [{ id: 'a', score: 5 }, { id: 'b', score: 5 }, { id: 'c', score: 6 }];
    const result = page(rows, 2, (row) => row.score);
    expect(result.items).toEqual(rows.slice(0, 2));
    expect(decodeCursor(result.nextCursor ?? '')).toEqual({ k: 5, id: 'b' });
    expect(rows).toHaveLength(3);
  });

  it('returns null on the last or empty page', () => {
    expect(page([{ id: 'a', key: 'x' }], 1, (row) => row.key)).toEqual({
      items: [{ id: 'a', key: 'x' }], nextCursor: null,
    });
    expect(page([], 20, () => 0)).toEqual({ items: [], nextCursor: null });
  });

  it('provides query parsing and response schemas for OpenAPI routes', () => {
    expect(listQuerySchema.parse({ limit: '2' })).toEqual({ limit: 2 });
    const schema = pageSchema(z.object({ id: z.string() }));
    expect(schema.safeParse({ items: [{ id: 'a' }], nextCursor: null }).success).toBe(true);
    expect(schema.safeParse({ items: [], nextCursor: 1 }).success).toBe(false);
  });

  it('works in a mounted OpenAPI route with the shared validation envelope', async () => {
    const app = new OpenAPIHono({
      defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); },
    });
    app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: 'unexpected' }, 500));
    const router = new OpenAPIHono();
    router.openapi(createRoute({
      method: 'get', path: '/', request: { query: listQuerySchema },
      responses: { 200: { description: 'Page', content: { 'application/json': { schema: pageSchema(z.object({ id: z.string() })) } } } },
    }), (c) => {
      const query = c.req.valid('query');
      return c.json(page([{ id: 'a' }, { id: 'b' }], query.limit, (row) => row.id), 200);
    });
    app.route('/items', router);
    const document = app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 'Test', version: '1' } });
    expect(document.paths?.['/items']?.get?.parameters).toHaveLength(2);
    const response = await app.request('/items?limit=1');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: 'a' }], nextCursor: encodeCursor({ k: 'a', id: 'a' }) });
    const invalid = await app.request('/items?limit=101');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
});
