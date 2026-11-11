import { describe, expect, it } from 'vitest';
import { PRESETS, diffPermissions, isAllowed } from '@dawlyy/core/authz';
import {
  PermissionInputError, normalizeModules, resolvePermissions, toggleAction,
} from './permission-edit';

describe('Task 11 permission editing logic', () => {
  it('rejects unknown modules and actions with a typed error and keeps JSON prototype keys out', () => {
    expect(() => normalizeModules({ billingx: ['view'] })).toThrow(PermissionInputError);
    expect(() => normalizeModules({ billing: ['obliterate'] })).toThrow(PermissionInputError);
    const hostile = JSON.parse('{"__proto__":["view"]}') as Record<string, string[]>;
    expect(() => normalizeModules(hostile)).toThrow(/Unknown module/);
  });

  it('collapses manage, drops empty lists and orders by the core matrix', () => {
    expect(normalizeModules({ programs: ['edit', 'manage', 'view'], clients: [], billing: ['edit', 'view'] }))
      .toEqual({ billing: ['view', 'edit'], programs: ['manage'] });
  });

  it('resolves a preset, a preset with overrides, a custom set and a scope-only change', () => {
    const coach = resolvePermissions(null, { preset: 'coach', client_scope: 'all' });
    expect(coach.preset).toBe('coach');
    expect(coach.modules.programs).toEqual(['manage']);
    expect(coach.modules.team).not.toContain('manage');
    const tweaked = resolvePermissions(null, { preset: 'assistant', client_scope: 'assigned', modules: { billing: ['view', 'verify'] } });
    expect(tweaked.modules.billing).toEqual(['view', 'verify']);
    expect(tweaked.modules.checkins).toEqual([...PRESETS.assistant.modules.checkins ?? []]);
    const custom = resolvePermissions(coach, { client_scope: 'assigned', modules: { foods: ['view'] } });
    expect(custom).toEqual({ client_scope: 'assigned', modules: { foods: ['view'] } });
    const scopeOnly = resolvePermissions(coach, { client_scope: 'assigned' });
    expect(scopeOnly).toEqual({ ...coach, client_scope: 'assigned' });
    expect(() => resolvePermissions(null, { preset: 'administrator', client_scope: 'all' })).toThrow(/Unknown permission preset/);
    expect(() => resolvePermissions(null, { client_scope: 'everyone' })).toThrow(PermissionInputError);
  });

  it('toggles single cells and expands manage when one action is switched off', () => {
    let modules = normalizeModules({ programs: ['manage'] });
    modules = toggleAction(modules, 'programs', 'delete');
    expect(modules.programs).toEqual(['view', 'create', 'edit', 'publish', 'review', 'verify', 'export']);
    expect(isAllowed({ role: 'staff', permissions: { client_scope: 'all', modules } }, 'programs', 'delete')).toBe(false);
    modules = toggleAction(modules, 'programs', 'manage');
    expect(modules.programs).toEqual(['manage']);
    modules = toggleAction(modules, 'programs', 'manage');
    expect(modules.programs).toBeUndefined();
    modules = toggleAction(modules, 'foods', 'view');
    expect(modules.foods).toEqual(['view']);
  });

  it('diffPermissions on resolved values lists what a change adds and removes', () => {
    const before = resolvePermissions(null, { preset: 'assistant', client_scope: 'assigned' });
    const after = resolvePermissions(null, { preset: 'assistant', client_scope: 'assigned', modules: { checkins: ['view'], billing: ['view'] } });
    expect(diffPermissions(before, after)).toEqual([{ module: 'checkins', added: [], removed: ['edit', 'review'] }]);
  });
});
