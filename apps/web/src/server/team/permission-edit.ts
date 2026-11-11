import {
  ACTIONS, MODULES, PRESETS, hasAction, permissionsFromPreset,
  type Action, type Module, type StaffPermissions,
} from '@dawlyy/core/authz';

// Pure permission-editing logic, shared by the team API (server) and the permission editor (client).
// It must stay free of `server-only` imports so the browser bundle can use it.

/** Task 11: a request named a module, action, preset or scope that the core matrix does not know. */
export class PermissionInputError extends Error {
  readonly code: 'unknown_module' | 'unknown_action' | 'unknown_preset' | 'unknown_scope';

  constructor(code: PermissionInputError['code'], message: string) {
    super(message);
    this.name = 'PermissionInputError';
    this.code = code;
  }
}

/** Task 11: preset ids in the core matrix order, for pickers. */
export const PRESET_IDS = Object.keys(PRESETS) as Array<keyof typeof PRESETS>;

/** Task 11: module to actions map after validation. */
export type ModuleGrants = Record<string, string[]>;

const moduleSet: ReadonlySet<string> = new Set(MODULES);
const actionSet: ReadonlySet<string> = new Set(ACTIONS);

/** Task 11: true when the id names a preset of the core matrix (own properties only). */
export function isPresetId(value: string): value is keyof typeof PRESETS {
  return Object.hasOwn(PRESETS, value);
}

/**
 * Task 11: validate and normalise a module map. Unknown modules or actions throw; `manage` absorbs every other
 * action of the same module (the core matrix forbids explicit exceptions beside it); empty lists are dropped;
 * output follows MODULES and ACTIONS order so equal grants compare equal.
 */
export function normalizeModules(input: Record<string, readonly string[]>): ModuleGrants {
  for (const [mod, actions] of Object.entries(input)) {
    if (!moduleSet.has(mod)) throw new PermissionInputError('unknown_module', `Unknown module "${mod.slice(0, 40)}"`);
    for (const action of actions) {
      if (!actionSet.has(action)) throw new PermissionInputError('unknown_action', `Unknown action "${action.slice(0, 40)}"`);
    }
  }
  const result: ModuleGrants = {};
  for (const mod of MODULES) {
    const given = Object.hasOwn(input, mod) ? input[mod] ?? [] : [];
    if (!given.length) continue;
    result[mod] = given.includes('manage') ? ['manage'] : ACTIONS.filter((action) => given.includes(action));
  }
  return result;
}

/** Task 11: the request body of PUT /team/{id}/permissions, already parsed for its shape. */
export type PermissionEditInput = {
  preset?: string;
  modules?: Record<string, string[]>;
  client_scope: string;
};

/**
 * Task 11: compute the stored permissions.
 * - preset only: the preset's matrix.
 * - preset and modules: the preset with those modules replaced (permissionsFromPreset merge).
 * - modules only: exactly those modules, no preset label (a custom set).
 * - neither: keep the current modules and preset, change only the scope.
 */
export function resolvePermissions(current: StaffPermissions | null, input: PermissionEditInput): StaffPermissions {
  if (input.client_scope !== 'all' && input.client_scope !== 'assigned') {
    throw new PermissionInputError('unknown_scope', 'client_scope must be "all" or "assigned"');
  }
  const scope = input.client_scope;
  const modules = input.modules ? normalizeModules(input.modules) : undefined;
  if (input.preset !== undefined) {
    if (!isPresetId(input.preset)) throw new PermissionInputError('unknown_preset', 'Unknown permission preset');
    const base = permissionsFromPreset(input.preset, { client_scope: scope, modules });
    return { client_scope: base.client_scope, modules: normalizeModules(base.modules), preset: input.preset };
  }
  if (modules) return { client_scope: scope, modules };
  return {
    client_scope: scope,
    modules: normalizeModules(current?.modules ?? {}),
    ...(current?.preset ? { preset: current.preset } : {}),
  };
}

/** Task 11: whether the grid shows an action as on (`manage` shows every action of its module on). */
export function isGranted(modules: ModuleGrants, mod: Module, action: Action): boolean {
  return hasAction(modules, mod, action);
}

/**
 * Task 11: flip one cell of the grid and return a new normalised map.
 * Turning `manage` on collapses the module to `manage`; turning any action off while `manage` is on expands it
 * into the other eight explicit actions first; turning actions on until all eight are set stays explicit.
 */
export function toggleAction(modules: ModuleGrants, mod: Module, action: Action): ModuleGrants {
  const current = modules[mod] ?? [];
  const wasOn = hasAction(modules, mod, action);
  let next: string[];
  if (action === 'manage') {
    next = wasOn ? [] : ['manage'];
  } else {
    const explicit = current.includes('manage') ? ACTIONS.filter((a) => a !== 'manage') : [...current];
    next = wasOn ? explicit.filter((a) => a !== action) : [...explicit, action];
  }
  return normalizeModules({ ...modules, [mod]: next });
}
