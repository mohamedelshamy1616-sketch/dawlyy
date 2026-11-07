import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('api', () => {
  it('GET /api/v1/health returns ok', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.time).toBe('string');
  });

  it('unknown routes return the error envelope', async () => {
    const res = await app.request('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
    expect(typeof body.error.message).toBe('string');
  });
});
