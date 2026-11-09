import { describe, expect, it } from 'vitest';
import { isAllowed } from '@dawlyy/core/authz';
import type { AuthContext } from '../db';
import { requireBillingPermission } from './permission';

describe('T3b coach billing boundary', () => {
  const client: AuthContext = { userId: 'client-user', membershipId: 'client-membership', tenantId: 'tenant', role: 'client', clientId: 'client', permissions: null };
  it('refuses clients even where core permits client-facing billing actions', () => {
    expect(isAllowed(client, 'billing', 'create')).toBe(true);
    for (const action of ['view', 'create', 'edit', 'verify'] as const) expect(() => requireBillingPermission(client, action)).toThrow();
  });
  it('preserves staff action restrictions and owner access', () => {
    const staff: AuthContext = { ...client, role: 'staff', permissions: { client_scope: 'all', modules: { billing: ['create'] } } };
    expect(() => requireBillingPermission(staff, 'create')).not.toThrow();
    expect(() => requireBillingPermission(staff, 'verify')).toThrow();
    expect(() => requireBillingPermission({ ...client, role: 'owner' }, 'verify')).not.toThrow();
  });
});
