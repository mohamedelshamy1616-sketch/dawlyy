import { describe, expect, it } from 'vitest';
import { bootstrapInputSchema, deriveTenantSlug } from './bootstrap';

describe('Task 2 tenant bootstrap inputs', () => {
  it('derives an ASCII-safe slug and a fallback for Arabic names', () => {
    expect(deriveTenantSlug('  Strong & Fit Cairo  ')).toBe('strong-fit-cairo');
    expect(deriveTenantSlug('Café Coaching')).toBe('cafe-coaching');
    expect(deriveTenantSlug('كوتش محمد')).toBe('business');
    expect(deriveTenantSlug('---')).toBe('business');
  });

  it('validates the timezone against Intl, rather than accepting arbitrary strings', () => {
    const input = { businessName: 'Coaching', displayName: 'Coach', locale: 'ar', timezone: 'Africa/Cairo' };
    expect(bootstrapInputSchema.safeParse(input).success).toBe(true);
    expect(bootstrapInputSchema.safeParse({ ...input, timezone: 'Not/AZone' }).success).toBe(false);
    expect(bootstrapInputSchema.safeParse({ ...input, tenantId: 'spoofed' }).success).toBe(false);
  });
});
