import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { generateInvitationToken, hashInvitationToken, invitationExpired, invitationInputSchema } from './invitations';

describe('Task 2 invitation security primitives', () => {
  it('generates 32 random bytes encoded as canonical base64url and stores a different SHA-256 hash', () => {
    const token = generateInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(Buffer.from(token, 'base64url').toString('base64url')).toBe(token);
    expect(hashInvitationToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken(token)).not.toBe(token);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(generateInvitationToken()).not.toBe(token);
  });

  it('treats the expiry instant as expired', () => {
    const expiry = new Date('2026-11-16T12:00:00Z');
    expect(invitationExpired(expiry, new Date('2026-11-16T11:59:59Z'))).toBe(false);
    expect(invitationExpired(expiry, expiry)).toBe(true);
    expect(invitationExpired(expiry, new Date('2026-11-17T00:00:00Z'))).toBe(true);
  });

  it('requires client identity and contact details and rejects unknown presets', () => {
    expect(invitationInputSchema.safeParse({ role: 'client', displayName: 'Client', email: 'client@example.com' }).success).toBe(false);
    expect(invitationInputSchema.safeParse({ role: 'staff', displayName: 'Coach' }).success).toBe(false);
    expect(invitationInputSchema.safeParse({ role: 'staff', displayName: 'Coach', phone: '01012345678', preset: 'administrator' }).success).toBe(false);
  });
});
