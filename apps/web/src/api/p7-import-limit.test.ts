import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { call, setupApiFixture } from '../test/api-harness';
import { MAX_CSV_BYTES } from '../server/request-limits';
import { app } from './index';

describe('P7 D3 maximum exercise CSV through the real API', () => {
  it('previews and commits a valid maximum-byte CSV after JSON wrapping', async () => {
    const f = await setupApiFixture();
    try {
      const prefix = `name_en,category,difficulty,unused\nD3-${randomUUID()},strength,beginner,"`;
      const csv = `${prefix}${' '.repeat(MAX_CSV_BYTES - prefix.length - 1)}"`;
      expect(new TextEncoder().encode(csv).length).toBe(MAX_CSV_BYTES);
      const preview = await call(app, 'POST', '/api/v1/exercises/import/preview', { as: f.owner.userId, body: { csv } });
      expect(preview).toMatchObject({ status: 200, json: { counts: { total: 1, ok: 1, error: 0 } } });
      const commit = await call(app, 'POST', '/api/v1/exercises/import/commit', { as: f.owner.userId,
        headers: { 'Idempotency-Key': randomUUID() }, body: { csv, mapping: { name_en: 0, category: 1, difficulty: 2 }, onDuplicate: 'skip' } });
      expect(commit).toMatchObject({ status: 200, json: { inserted: 1, skipped: 0, errors: [] } });
    } finally { await f.cleanup(); }
  });
});
