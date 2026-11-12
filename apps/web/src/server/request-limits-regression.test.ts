import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { ApiError } from '../api/errors';
import { readLimitedBody } from '../api/middleware/body-limit';
import { syncSchema } from './workout/contracts';
import { importInput } from './exercises/validation';
import { MAX_CSV_BYTES, MAX_SYNC_TIMESTAMP_CHARS, requestBodyLimit } from './request-limits';

const id = '11111111-1111-4111-8111-111111111111';
const stamp = `2026-11-12T10:00:00.${'1'.repeat(MAX_SYNC_TIMESTAMP_CHARS - 21)}Z`;
const syncPath = '/api/v1/workout-sessions/sync';
const csvPath = '/api/v1/exercises/import/preview';
function transport() {
  const app = new Hono();
  app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({}, 500));
  app.post('*', async c => { await readLimitedBody(c); return c.json({ accepted: true }); });
  return app;
}

describe('D3 schema and transport byte ceilings', () => {
  it('accepts every field at its sync schema maximum, including escaped strings', async () => {
    const session = { clientUuid: id, clientUpdatedAt: stamp, programId: id, programVersionId: id,
      dayId: '\u0000'.repeat(64), workoutId: '\u0000'.repeat(64), localDate: '2026-11-12', timezone: 'Africa/Cairo',
      state: 'completed', startedAt: stamp, endedAt: stamp, activeSeconds: 31_536_000, rpeOverall: 10,
      mood: '\u0000'.repeat(200), painNote: '\u0000'.repeat(2000), clientNote: '\u0000'.repeat(4000) };
    const set = { clientUuid: id, clientUpdatedAt: stamp, sessionClientUuid: id, exerciseId: id,
      blockId: '\u0000'.repeat(64), itemId: '\u0000'.repeat(64), setNo: 1000, tag: 'working', reps: 10000,
      load: 999999.99, loadUnit: 'kg', durationSec: 86400, distanceM: 99999999, rpe: 10, rir: 100,
      restSec: 86400, completed: false, skipped: false, substitutedFor: id, painFlag: false,
      note: '\u0000'.repeat(4000), deletedAt: stamp };
    const value = { sessions: Array.from({ length: 100 }, () => session), sets: Array.from({ length: 1000 }, () => set) };
    expect(syncSchema.safeParse(value).success).toBe(true);
    const body = JSON.stringify(value);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(requestBodyLimit('POST', syncPath));
    expect((await transport().request(syncPath, { method: 'POST', body })).status).toBe(200);
  });
  it('accepts a maximum-byte CSV even with six-byte JSON escapes and commit options', async () => {
    const input = { csv: '\u0000'.repeat(MAX_CSV_BYTES), mapping: { name_en: 1000 } };
    expect(importInput.safeParse(input).success).toBe(true);
    for (const path of [csvPath, '/api/v1/exercises/import/commit']) {
      const body = JSON.stringify({ ...input, ...(path.endsWith('commit') ? { onDuplicate: 'import_anyway' } : {}) });
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(requestBodyLimit('POST', path));
      expect((await transport().request(path, { method: 'POST', body })).status).toBe(200);
    }
  });
  for (const path of [syncPath, csvPath, '/api/v1/exercises/import/commit']) {
    it(`${path}: accepts the exact ceiling and returns 413 one byte above it`, async () => {
      const limit = requestBodyLimit('POST', path);
      const app = transport();
      expect((await app.request(path, { method: 'POST', body: new Uint8Array(limit) })).status).toBe(200);
      expect((await app.request(path, { method: 'POST', body: new Uint8Array(limit + 1) })).status).toBe(413);
    });
  }
});
