import { describe, expect, it } from 'vitest';
import { ACTIONS, MODULES, permissionsFromPreset, type Action, type Module, type StaffPermissions } from '@dawlyy/core/authz';
import type { AuthContext } from '@dawlyy/db';
import { ApiError } from '../api/errors';
import { requirePermission } from './require-permission';

function context(role: AuthContext['role'], permissions: StaffPermissions | null = null): AuthContext {
  return {
    userId: 'user-a',
    tenantId: 'tenant-a',
    membershipId: 'membership-a',
    role,
    permissions,
    clientId: role === 'client' ? 'client-a' : undefined,
  };
}

const owner = context('owner');
const coach = context('staff', permissionsFromPreset('coach'));
const assistant = context('staff', permissionsFromPreset('assistant'));
const businessManager = context('staff', permissionsFromPreset('business_manager'));
const client = context('client');

function expectForbidden(auth: AuthContext, module: Module, action: Action): void {
  const check = () => requirePermission(auth, module, action);
  expect(check).toThrow(ApiError);
  expect(check).toThrow(expect.objectContaining({ status: 403, code: 'forbidden' }));
}

describe('requirePermission (doc §12.1)', () => {
  it('allows owners every known module action without a permissions matrix', () => {
    for (const mod of MODULES) {
      for (const action of ACTIONS) expect(requirePermission(owner, mod, action)).toBeUndefined();
    }
  });

  it('allows coach publication and billing edits while refusing verification and team/settings management', () => {
    expect(requirePermission(coach, 'programs', 'publish')).toBeUndefined();
    expect(requirePermission(coach, 'billing', 'create')).toBeUndefined();
    expect(requirePermission(coach, 'billing', 'edit')).toBeUndefined();
    expectForbidden(coach, 'billing', 'verify');
    expectForbidden(coach, 'billing', 'manage');
    expectForbidden(coach, 'team', 'manage');
    expectForbidden(coach, 'settings', 'manage');
  });

  it('allows assistant reviews and message edits while refusing publication and payment writes', () => {
    expect(requirePermission(assistant, 'checkins', 'review')).toBeUndefined();
    expect(requirePermission(assistant, 'messages', 'edit')).toBeUndefined();
    expect(requirePermission(assistant, 'billing', 'view')).toBeUndefined();
    expectForbidden(assistant, 'programs', 'publish');
    expectForbidden(assistant, 'billing', 'create');
    expectForbidden(assistant, 'billing', 'edit');
    expectForbidden(assistant, 'billing', 'verify');
  });

  it('expands business_manager manage grants without granting coaching edits', () => {
    for (const mod of ['billing', 'packages', 'reports'] as const) {
      for (const action of ACTIONS) expect(requirePermission(businessManager, mod, action)).toBeUndefined();
    }
    expect(requirePermission(businessManager, 'clients', 'view')).toBeUndefined();
    expectForbidden(businessManager, 'programs', 'edit');
    expectForbidden(businessManager, 'nutrition', 'edit');
  });

  it('uses client grants for payment submission, messages and check-ins', () => {
    expect(requirePermission(client, 'billing', 'create')).toBeUndefined();
    expect(requirePermission(client, 'messages', 'create')).toBeUndefined();
    expect(requirePermission(client, 'checkins', 'edit')).toBeUndefined();
    expectForbidden(client, 'billing', 'edit');
    expectForbidden(client, 'billing', 'verify');
    expectForbidden(client, 'programs', 'publish');
    expectForbidden(client, 'team', 'view');
  });

  it('uses stored staff overrides instead of inferring permissions from the preset name', () => {
    const overridden = context('staff', permissionsFromPreset('business_manager', {
      modules: { billing: ['view', 'edit'] },
    }));
    expect(requirePermission(overridden, 'billing', 'edit')).toBeUndefined();
    expectForbidden(overridden, 'billing', 'verify');
    expectForbidden(overridden, 'billing', 'manage');
    const elevatedCoach = context('staff', permissionsFromPreset('coach', { modules: { billing: ['manage'] } }));
    expect(requirePermission(elevatedCoach, 'billing', 'verify')).toBeUndefined();
  });

  it('fails closed for missing staff grants and ignores staff grants on a client context', () => {
    expectForbidden(context('staff'), 'programs', 'view');
    expectForbidden(context('staff', { client_scope: 'all', modules: {} }), 'billing', 'create');
    expectForbidden(context('client', permissionsFromPreset('business_manager')), 'billing', 'verify');
  });

  it('rejects unknown modules and actions even for owners and manage grants', () => {
    for (const auth of [owner, coach, assistant, businessManager, client]) {
      expectForbidden(auth, 'unknown' as Module, 'view');
      expectForbidden(auth, 'billing', 'unknown' as Action);
      expectForbidden(auth, '__proto__' as Module, 'view');
    }
  });
});
