import { describe, expect, it, vi } from 'vitest';
import type { AuthContext, Tx } from '@dawlyy/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { getReviewPreferences, mergeReviewPreferences, putReviewPreferences, readReviewPreferences } from './preferences';
import { reviewPreferencesSchema } from './schemas';

const auth: AuthContext = { tenantId: '10000000-0000-4000-8000-000000000001', userId: '10000000-0000-4000-8000-000000000002', membershipId: '10000000-0000-4000-8000-000000000003', role: 'owner', permissions: null };
describe('R4b personal review preference JSON', () => {
  it('defaults invalid/absent unknown review data', () => {
    expect(readReviewPreferences({ numerals: 'arab' })).toEqual({ dialect: 'egyptian', signaturePhrases: [] });
    expect(readReviewPreferences({ review: { dialect: 'invented', signaturePhrases: [] } })).toEqual({ dialect: 'egyptian', signaturePhrases: [] });
  });
  it.each(['egyptian', 'gulf'] as const)('saves %s while retaining unrelated JSON keys', dialect => {
    const existing = { numerals: 'arab', channels: { email: false, webpush: true }, custom: { future: true }, review: { dialect: 'egyptian', signaturePhrases: [] } };
    expect(mergeReviewPreferences(existing, { dialect, signaturePhrases: [' Great week '] })).toEqual({ ...existing, review: { dialect, signaturePhrases: ['Great week'] } });
    expect(existing.review.signaturePhrases).toEqual([]);
  });
  it('rejects unknown keys, blank phrases and oversized lists', () => {
    expect(reviewPreferencesSchema.safeParse({ dialect: 'gulf', signaturePhrases: [], userId: 'other' }).success).toBe(false);
    expect(reviewPreferencesSchema.safeParse({ dialect: 'gulf', signaturePhrases: [' '] }).success).toBe(false);
    expect(reviewPreferencesSchema.safeParse({ dialect: 'gulf', signaturePhrases: Array(6).fill('hello') }).success).toBe(false);
  });
  it('uses a self-only parameterized JSON merge', async () => {
    const execute = vi.fn().mockResolvedValue([{ review: { dialect: 'gulf', signaturePhrases: ['Good'] } }]);
    const tx = { execute } as unknown as Tx;
    expect(await putReviewPreferences(tx, auth, { dialect: 'gulf', signaturePhrases: ['Good'] })).toEqual({ dialect: 'gulf', signaturePhrases: ['Good'] });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]![0]);
    expect(query.sql).toContain('jsonb_set');
    expect(query.sql).toContain('user_id');
    expect(query.params).toContain(auth.userId);
    expect(query.params).toContain(auth.tenantId);
    expect(query.params).toContain(JSON.stringify({ dialect: 'gulf', signaturePhrases: ['Good'] }));
  });
  it('denies clients and staff lacking checkins review before SQL', async () => {
    const execute = vi.fn(); const tx = { execute } as unknown as Tx;
    await expect(getReviewPreferences(tx, { ...auth, role: 'client' })).rejects.toMatchObject({ status: 403 });
    await expect(getReviewPreferences(tx, { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { checkins: ['view'] } } })).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });
});
