import { describe, expect, it } from 'vitest';
import { resolveEntitlements } from '@dawlyy/core/entitlements';
import { CLIENT_MODULES, ClientModules, DEFAULT_CLIENT_MODULES, type ClientModule, type EntitlementOverride } from '@dawlyy/core/types';
import {
  COMPOSER_KEY, effectiveFromRows, planClientSave, resolveComposerPreview, selectionFromRows, selectionToPartial, selectionToTenantModules,
  uniformSelection, type ComposerOverrideRow, type ComposerSelection,
} from './state';
import { makeComposerPreview } from './preview';

const TODAY = '2026-11-18';
const all = (value: boolean): ClientModules => ({ ...DEFAULT_CLIENT_MODULES, ...Object.fromEntries(CLIENT_MODULES.map(m => [m, value])) });
const row = (id: string, createdAt: string, override: EntitlementOverride): ComposerOverrideRow => ({ id, createdAt, override });
const composer = (id: string, createdAt: string, modules: Partial<ClientModules>, extra: Partial<EntitlementOverride> = {}) =>
  row(id, createdAt, { key: 'custom', customKey: 'client_app', enabled: true, modules, ...extra });
const chat = (id: string, createdAt: string, modules: Partial<ClientModules>, extra: Partial<EntitlementOverride> = {}) =>
  row(id, createdAt, { key: 'chat', enabled: true, modules, ...extra });
const pick = (module: ClientModule, choice: 'on' | 'off'): ComposerSelection => ({ ...uniformSelection('inherit'), [module]: choice });

describe('selection helpers', () => {
  it('is all on by default and inherit sends nothing', () => {
    expect(selectionToTenantModules(uniformSelection('on'))).toEqual(DEFAULT_CLIENT_MODULES);
    expect(selectionToPartial(uniformSelection('inherit'))).toEqual({});
    expect(planClientSave(uniformSelection('inherit'))).toEqual({ action: 'reset' });
  });
  it.each(CLIENT_MODULES)('turns only %s off', module => {
    const selection = { ...uniformSelection('on'), [module]: 'off' } as ComposerSelection;
    expect(selectionToTenantModules(selection)).toEqual({ ...DEFAULT_CLIENT_MODULES, [module]: false });
    expect(selectionToPartial(pick(module, 'off'))).toEqual({ [module]: false });
    expect(planClientSave(pick(module, 'off'))).toEqual({ action: 'put', modules: { [module]: false } });
  });
  it('keeps inherit distinct from explicit false and rejects tenant inherit', () => {
    expect(selectionToPartial({ ...uniformSelection('inherit'), nutrition: 'off', workouts: 'on' })).toEqual({ workouts: true, nutrition: false });
    expect(() => selectionToTenantModules(uniformSelection('inherit'))).toThrow();
  });
  it('rejects unknown keys through the strict core schema', () => {
    expect(ClientModules.safeParse({ ...DEFAULT_CLIENT_MODULES, 'check-ins': true }).success).toBe(false);
    expect(ClientModules.safeParse({ ...DEFAULT_CLIENT_MODULES, extra: true }).success).toBe(false);
  });
});

describe('dedicated custom identity', () => {
  it('is a valid override for the real core resolver, even without a package entitlement', () => {
    expect(COMPOSER_KEY).toBe('custom:client_app');
    const resolved = resolveEntitlements([], [{ key: 'custom', customKey: 'client_app', enabled: true, modules: { nutrition: false } }]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ key: 'custom', customKey: 'client_app', enabled: true, source: 'override' });
  });
  it('reads the saved selection from the composer rows only', () => {
    const rows = [chat('a', '2026-11-01T00:00:00Z', { messages: false }), composer('b', '2026-11-02T00:00:00Z', { nutrition: false, workouts: true })];
    expect(selectionFromRows(rows, TODAY)).toEqual({ ...uniformSelection('inherit'), nutrition: 'off', workouts: 'on' });
  });
});

describe('effective modules from rows', () => {
  it('newest defined boolean wins, explicit false included, regardless of input order', () => {
    const older = chat('a', '2026-11-01T00:00:00Z', { nutrition: false, messages: false });
    const newer = composer('b', '2026-11-02T00:00:00Z', { nutrition: true });
    for (const rows of [[older, newer], [newer, older]]) {
      expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, rows, TODAY)).toEqual({ ...DEFAULT_CLIENT_MODULES, messages: false });
    }
    const reversed = [chat('a', '2026-11-03T00:00:00Z', { nutrition: false }), newer];
    expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, reversed, TODAY).nutrition).toBe(false);
  });
  it('breaks createdAt ties by id', () => {
    const rows = [chat('b', '2026-11-01T00:00:00Z', { payments: false }), chat('a', '2026-11-01T00:00:00Z', { payments: true })];
    expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, rows, TODAY).payments).toBe(false);
  });
  it('applies expiresOn through the supplied client-local day inclusive', () => {
    const rows = [composer('a', '2026-11-01T00:00:00Z', { nutrition: false }, { expiresOn: '2026-11-18' })];
    expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, rows, '2026-11-18').nutrition).toBe(false);
    expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, rows, '2026-11-19').nutrition).toBe(true);
    expect(effectiveFromRows(DEFAULT_CLIENT_MODULES, rows, '2026-11-17').nutrition).toBe(false);
    expect(selectionFromRows(rows, '2026-11-19').nutrition).toBe('inherit');
  });
  it('falls back to the tenant default where nothing is set', () => {
    expect(effectiveFromRows({ ...DEFAULT_CLIENT_MODULES, payments: false }, [], TODAY).payments).toBe(false);
  });
});

describe('resolveComposerPreview', () => {
  const rows = [
    composer('c1', '2026-11-01T00:00:00Z', { nutrition: false }),
    chat('o1', '2026-11-02T00:00:00Z', { messages: false, workouts: false }),
  ];
  it('Save applies the local partial last over unrelated rows', () => {
    const result = resolveComposerPreview({ tenant: DEFAULT_CLIENT_MODULES, rows, today: TODAY, selection: { ...pick('workouts', 'on'), nutrition: 'inherit' }, intent: 'save' });
    expect(result).toEqual({ ...DEFAULT_CLIENT_MODULES, workouts: true, messages: false });
  });
  it('Save replaces the old composer identity instead of stacking on it', () => {
    const result = resolveComposerPreview({ tenant: DEFAULT_CLIENT_MODULES, rows, today: TODAY, selection: uniformSelection('inherit'), intent: 'save' });
    expect(result.nutrition).toBe(true);
  });
  it('Reset removes only the composer identity and keeps unrelated overrides', () => {
    const result = resolveComposerPreview({ tenant: DEFAULT_CLIENT_MODULES, rows, today: TODAY, selection: pick('payments', 'off'), intent: 'reset' });
    expect(result).toEqual({ ...DEFAULT_CLIENT_MODULES, messages: false, workouts: false });
  });
  it('does not mutate its inputs', () => {
    const frozenRows = structuredClone(rows); const selection = pick('payments', 'off'); const tenant = { ...DEFAULT_CLIENT_MODULES };
    const copy = structuredClone({ frozenRows, selection, tenant });
    resolveComposerPreview({ tenant, rows: frozenRows, today: TODAY, selection, intent: 'save' });
    expect({ frozenRows, selection, tenant }).toEqual(copy);
  });
  it('all off gives an all-false map', () => {
    const result = resolveComposerPreview({ tenant: DEFAULT_CLIENT_MODULES, rows: [], today: TODAY, selection: uniformSelection('off'), intent: 'save' });
    expect(result).toEqual(all(false));
  });
});

describe('synthetic Today preview', () => {
  it('is deterministic and needs no clock', () => {
    const a = makeComposerPreview(DEFAULT_CLIENT_MODULES, 'en', 'latn');
    expect(a).toEqual(makeComposerPreview(DEFAULT_CLIENT_MODULES, 'en', 'latn'));
    expect(a.date).toBe('2026-11-18');
    expect(a.workout?.state).toBe('planned');
    expect(a.meals).toHaveLength(3);
    expect(a.locale).toBe('en');
  });
  it('keeps hidden modules out of its content', () => {
    const none = makeComposerPreview(all(false), 'ar', 'arab');
    expect(none).toMatchObject({ workout: null, meals: [], checkins: [], intakePending: false, subscription: null, numerals: 'arab' });
    const noMeals = makeComposerPreview({ ...DEFAULT_CLIENT_MODULES, nutrition: false }, 'en', 'latn');
    expect(noMeals.meals).toEqual([]);
    expect(noMeals.workout).not.toBeNull();
    expect(makeComposerPreview({ ...DEFAULT_CLIENT_MODULES, checkins: false }, 'en', 'latn').checkins).toEqual([]);
    expect(makeComposerPreview({ ...DEFAULT_CLIENT_MODULES, payments: false }, 'en', 'latn').subscription).toBeNull();
  });
});
