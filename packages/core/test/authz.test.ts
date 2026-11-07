import { describe, it, expect } from 'vitest';
import {
  MODULES, ACTIONS, PRESETS, CLIENT_MATRIX, AuthzError,
  permissionsFromPreset, hasAction, isAllowed, describePermissions, diffPermissions,
  type Module, type Action, type MembershipLike, type StaffPermissions,
} from '../src/authz';

describe('authorization', () => {
  it('allows owners every known action, including team management', () => {
    for (const module of MODULES) {
      for (const action of ACTIONS) {
        expect(isAllowed({ role: 'owner' }, module, action, { clientId: 'any' })).toBe(true);
      }
    }
  });

  it('limits clients to their own client-facing data', () => {
    const client: MembershipLike = { role: 'client', clientId: 'A' };
    expect(isAllowed(client, 'programs', 'view', { clientId: 'A' })).toBe(true);
    expect(isAllowed(client, 'programs', 'view', { clientId: 'B' })).toBe(false);
    expect(isAllowed(client, 'programs', 'edit', { clientId: 'A' })).toBe(false);
    expect(isAllowed(client, 'billing', 'create', { clientId: 'A' })).toBe(true);
    expect(isAllowed(client, 'billing', 'verify', { clientId: 'A' })).toBe(false);
    expect(isAllowed(client, 'team', 'view')).toBe(false);
    expect(isAllowed({ role: 'client' }, 'programs', 'view', { clientId: 'A' })).toBe(false);
    expect(isAllowed(client, 'programs', 'view')).toBe(true);
    expect(hasAction(CLIENT_MATRIX, 'media', 'create')).toBe(true);
  });

  it('allows assistant reviews without granting program publication', () => {
    const assistant: MembershipLike = { role: 'staff', permissions: permissionsFromPreset('assistant') };
    expect(isAllowed(assistant, 'checkins', 'review')).toBe(true);
    expect(isAllowed(assistant, 'programs', 'publish')).toBe(false);
    for (const module of ['messages', 'calendar', 'tracking'] as const) {
      expect(isAllowed(assistant, module, 'edit')).toBe(true);
    }
  });

  it('requires both module permission and client scope for staff', () => {
    const staff: MembershipLike = { role: 'staff', permissions: {
      client_scope: 'assigned', modules: { programs: ['view'] },
    } };
    expect(isAllowed(staff, 'programs', 'view', { clientId: 'A', assignedClientIds: ['A'] })).toBe(true);
    expect(isAllowed(staff, 'programs', 'view', { clientId: 'B', assignedClientIds: ['A'] })).toBe(false);
    expect(isAllowed(staff, 'programs', 'view', { clientId: 'A' })).toBe(false);
    expect(isAllowed(staff, 'programs', 'view')).toBe(true);
    expect(isAllowed(staff, 'programs', 'edit', { clientId: 'A', assignedClientIds: ['A'] })).toBe(false);
    const all: MembershipLike = { role: 'staff', permissions: { client_scope: 'all', modules: { programs: ['view'] } } };
    expect(isAllowed(all, 'programs', 'view', { clientId: 'B' })).toBe(true);
    expect(isAllowed({ role: 'staff' }, 'programs', 'view')).toBe(false);
    expect(isAllowed({ role: 'staff', permissions: null }, 'programs', 'view')).toBe(false);
  });

  it('treats manage as every action without promoting edit to publish or manage', () => {
    expect(hasAction({ programs: ['manage'] }, 'programs', 'delete')).toBe(true);
    expect(hasAction({ programs: ['edit'] }, 'programs', 'publish')).toBe(false);
    expect(hasAction({ programs: ['edit'] }, 'programs', 'manage')).toBe(false);
    expect(hasAction({}, 'programs', 'view')).toBe(false);
  });

  it('denies unknown modules and actions even for owner and manage grants', () => {
    const memberships: MembershipLike[] = [{ role: 'owner' }, { role: 'staff', permissions: {
      client_scope: 'all', modules: { programs: ['manage'], unknown: ['manage'] },
    } }];
    for (const membership of memberships) {
      expect(isAllowed(membership, 'unknown' as Module, 'view')).toBe(false);
      expect(isAllowed(membership, 'programs', 'approve' as Action)).toBe(false);
    }
    expect(hasAction({ unknown: ['manage'] }, 'unknown' as Module, 'view')).toBe(false);
    expect(hasAction({ programs: ['manage'] }, 'programs', 'unknown' as Action)).toBe(false);
    expect(hasAction({ toString: ['manage'] }, 'toString' as Module, 'view')).toBe(false);
  });
});

describe('editable presets', () => {
  it('keeps the coach exceptions effective despite manage implication', () => {
    const coach = permissionsFromPreset('coach');
    expect(coach.client_scope).toBe('all');
    expect(hasAction(coach.modules, 'programs', 'publish')).toBe(true);
    expect(hasAction(coach.modules, 'team', 'manage')).toBe(false);
    expect(hasAction(coach.modules, 'settings', 'manage')).toBe(false);
    expect(hasAction(coach.modules, 'billing', 'verify')).toBe(false);
    expect(hasAction(coach.modules, 'billing', 'manage')).toBe(false);
    expect(hasAction(coach.modules, 'billing', 'view')).toBe(true);
  });

  it('grants specialist presets only their stated areas', () => {
    const nutrition = permissionsFromPreset('nutrition_coach');
    expect(hasAction(nutrition.modules, 'nutrition', 'delete')).toBe(true);
    expect(hasAction(nutrition.modules, 'foods', 'manage')).toBe(true);
    expect(hasAction(nutrition.modules, 'checkins', 'review')).toBe(true);
    expect(hasAction(nutrition.modules, 'programs', 'edit')).toBe(false);
    const assessment = permissionsFromPreset('assessment_specialist');
    expect(hasAction(assessment.modules, 'assessments', 'publish')).toBe(true);
    expect(hasAction(assessment.modules, 'forms', 'manage')).toBe(true);
    expect(hasAction(assessment.modules, 'media', 'review')).toBe(true);
    expect(hasAction(assessment.modules, 'clients', 'view')).toBe(true);
    expect(hasAction(assessment.modules, 'billing', 'view')).toBe(false);
    const business = permissionsFromPreset('business_manager');
    for (const module of ['billing', 'packages', 'reports'] as const) {
      expect(hasAction(business.modules, module, 'manage')).toBe(true);
    }
    expect(hasAction(business.modules, 'clients', 'view')).toBe(true);
    expect(hasAction(business.modules, 'programs', 'edit')).toBe(false);
    expect(hasAction(business.modules, 'nutrition', 'edit')).toBe(false);
  });

  it('replaces only overridden modules and returns independent editable copies', () => {
    const overrides: Partial<StaffPermissions> = { client_scope: 'all', modules: { programs: ['view'], checkins: [] } };
    const result = permissionsFromPreset('assistant', overrides);
    expect(result.modules.programs).toEqual(['view']);
    expect(result.modules.checkins).toEqual([]);
    expect(result.modules.messages).toContain('edit');
    expect(result.client_scope).toBe('all');
    expect(result.preset).toBe('assistant');
    result.modules.programs?.push('delete');
    result.modules.messages?.push('manage');
    expect(overrides.modules?.programs).toEqual(['view']);
    expect(permissionsFromPreset('assistant').modules.messages).not.toContain('manage');
    expect(PRESETS.assistant.modules.checkins).toContain('review');
  });

  it('copies an unknown JSON module name without changing the modules prototype', () => {
    const overrides: Partial<StaffPermissions> = { modules: JSON.parse('{"__proto__":["manage"]}') };
    const result = permissionsFromPreset('assistant', overrides);
    expect(Object.getPrototypeOf(result.modules)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result.modules, '__proto__')).toBe(true);
    expect(hasAction(result.modules, '__proto__' as Module, 'view')).toBe(false);
  });

  it.each(['missing', 'toString', '__proto__'])('throws unknown_preset for %s', (preset) => {
    const call = () => permissionsFromPreset(preset as keyof typeof PRESETS);
    expect(call).toThrow(AuthzError);
    expect(call).toThrow(expect.objectContaining({ code: 'unknown_preset' }));
  });
});

describe('permission descriptions and diffs', () => {
  it('describes effective known actions in stable module/action order', () => {
    expect(describePermissions({ role: 'staff', permissions: { client_scope: 'all', modules: {
      programs: ['edit', 'view', 'view', 'unknown'], nutrition: ['manage'], unknown: ['manage'],
    } } })).toEqual([
      { module: 'programs', actions: ['view', 'edit'] },
      { module: 'nutrition', actions: ['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'] },
    ]);
    expect(describePermissions({ role: 'staff' })).toEqual([]);
    expect(describePermissions({ role: 'client', clientId: 'A' }).find((row) => row.module === 'programs'))
      .toEqual({ module: 'programs', actions: ['view'] });
    expect(describePermissions({ role: 'owner' }).find((row) => row.module === 'team')?.actions)
      .toContain('manage');
  });

  it('diffs added and removed effective actions, including manage expansion', () => {
    const a: StaffPermissions = { client_scope: 'all', modules: { programs: ['view', 'edit'], billing: ['manage'] } };
    const b: StaffPermissions = { client_scope: 'assigned', modules: { programs: ['view', 'publish'], billing: ['view'] } };
    expect(diffPermissions(a, b)).toEqual([
      { module: 'billing', added: [], removed: ['create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'] },
      { module: 'programs', added: ['publish'], removed: ['edit'] },
    ]);
    expect(diffPermissions(a, a)).toEqual([]);
    expect(diffPermissions({ client_scope: 'all', modules: {} }, {
      client_scope: 'all', modules: { forms: ['view'] },
    })).toEqual([{ module: 'forms', added: ['view'], removed: [] }]);
  });
});
