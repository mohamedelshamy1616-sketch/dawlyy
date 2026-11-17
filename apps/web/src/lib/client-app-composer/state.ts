import {
  CLIENT_MODULES, ClientModules, resolveClientModules,
  type ClientModule, type EntitlementOverride, type IsoDate,
} from '@dawlyy/core/types';

/** R2c: the reserved custom entitlement identity that carries the composer's module choices. */
export const COMPOSER_CUSTOM_KEY = 'client_app';
export const COMPOSER_KEY = `custom:${COMPOSER_CUSTOM_KEY}`;

/** R2c: what each module row can say. Tenant mode only uses `on` and `off`. */
export type ModuleChoice = 'inherit' | 'on' | 'off';
export type ComposerSelection = Record<ClientModule, ModuleChoice>;

/** R2c: the server-filtered (live, applicable) override rows in `createdAt, id` order. */
export type ComposerOverrideRow = { id: string; createdAt: string; override: EntitlementOverride };

/** Every module on `choice`. */
export function uniformSelection(choice: ModuleChoice): ComposerSelection {
  return Object.fromEntries(CLIENT_MODULES.map(module => [module, choice])) as ComposerSelection;
}

/** Tenant defaults as an on/off selection. */
export function selectionFromModules(modules: ClientModules): ComposerSelection {
  return Object.fromEntries(CLIENT_MODULES.map(module => [module, modules[module] ? 'on' : 'off'])) as ComposerSelection;
}

/** The sparse partial a selection sends: inherit modules are left out, never sent as a value. */
export function selectionToPartial(selection: ComposerSelection): Partial<ClientModules> {
  const partial: Partial<ClientModules> = {};
  for (const key of CLIENT_MODULES) {
    const choice = selection[key];
    if (choice === 'on') partial[key] = true;
    else if (choice === 'off') partial[key] = false;
  }
  return partial;
}

/** The complete strict map for the tenant PUT. Throws when a module is still on `inherit`. */
export function selectionToTenantModules(selection: ComposerSelection): ClientModules {
  return ClientModules.parse(Object.fromEntries(CLIENT_MODULES.map(module => {
    const choice = selection[module];
    if (choice === 'inherit') throw new Error(`Tenant defaults cannot inherit: ${module}`);
    return [module, choice === 'on'];
  })));
}

export const isComposerRow = (row: ComposerOverrideRow): boolean =>
  row.override.key === 'custom' && row.override.customKey === COMPOSER_CUSTOM_KEY;

/** Same order the API uses: `createdAt` ascending, then `id`. Returns a new array. */
export function sortRows(rows: readonly ComposerOverrideRow[]): ComposerOverrideRow[] {
  return [...rows].sort((a, b) => {
    const left = Date.parse(a.createdAt); const right = Date.parse(b.createdAt);
    if (left !== right) return left - right;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** An override applies through its `expiresOn` day, inclusive, in the client's local calendar. */
export const appliesOn = (override: EntitlementOverride, today: IsoDate): boolean =>
  override.expiresOn === undefined || override.expiresOn >= today;

/** Merge the modules maps of the rows that still apply; the newest defined boolean wins, false included. */
function mergeModules(rows: readonly ComposerOverrideRow[], today: IsoDate): Partial<ClientModules> {
  const merged: Partial<ClientModules> = {};
  for (const row of sortRows(rows)) {
    if (!appliesOn(row.override, today)) continue;
    for (const key of CLIENT_MODULES) {
      const value = row.override.modules?.[key];
      if (typeof value === 'boolean') merged[key] = value;
    }
  }
  return merged;
}

/** The effective modules the API would compute from these rows (the core resolver supplies the semantics). */
export function effectiveFromRows(tenant: ClientModules, rows: readonly ComposerOverrideRow[], today: IsoDate): ClientModules {
  return resolveClientModules(tenant, mergeModules(rows, today));
}

/** Rows other than the composer's own identity; they are never rewritten by this screen. */
export const otherRows = (rows: readonly ComposerOverrideRow[]): ComposerOverrideRow[] => rows.filter(row => !isComposerRow(row));

/** Is there a live composer row to reset (even an expired one still counts as saved history)? */
export const hasComposerRow = (rows: readonly ComposerOverrideRow[]): boolean => rows.some(isComposerRow);

/** The saved selection: what the live, still-applicable composer rows say per module. */
export function selectionFromRows(rows: readonly ComposerOverrideRow[], today: IsoDate): ComposerSelection {
  const merged = mergeModules(rows.filter(isComposerRow), today);
  return Object.fromEntries(CLIENT_MODULES.map(module => {
    const value = merged[module];
    return [module, value === undefined ? 'inherit' : value ? 'on' : 'off'];
  })) as ComposerSelection;
}

export const sameSelection = (a: ComposerSelection, b: ComposerSelection): boolean => CLIENT_MODULES.every(module => a[module] === b[module]);

/**
 * The effective modules after Save or Reset would succeed. The composer identity is removed first, the other
 * applicable rows merge in their existing order, then Save applies the local partial last (the PUT appends it
 * last). Inputs are never mutated.
 */
export function resolveComposerPreview(input: {
  tenant: ClientModules; rows: readonly ComposerOverrideRow[]; today: IsoDate;
  selection: ComposerSelection; intent: 'save' | 'reset';
}): ClientModules {
  const base = mergeModules(otherRows(input.rows), input.today);
  const partial = input.intent === 'save' ? selectionToPartial(input.selection) : {};
  return resolveClientModules(input.tenant, { ...base, ...partial });
}

/** A client-mode save is a reset when nothing is chosen, so no empty override row is ever appended. */
export function planClientSave(selection: ComposerSelection): { action: 'reset' } | { action: 'put'; modules: Partial<ClientModules> } {
  const modules = selectionToPartial(selection);
  return Object.keys(modules).length === 0 ? { action: 'reset' } : { action: 'put', modules };
}

/** Number of modules currently switched on. Zero is the "all modules off" state. */
export const countOn = (modules: ClientModules): number => CLIENT_MODULES.filter(module => modules[module]).length;
