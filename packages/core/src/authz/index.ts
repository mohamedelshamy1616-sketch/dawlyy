import type { MembershipRole, ClientScope, LocalizedText } from '../types';

export const MODULES = ['dashboard', 'clients', 'packages', 'billing', 'programs', 'exercises', 'nutrition', 'foods', 'forms', 'checkins', 'assessments', 'calendar', 'tracking', 'messages', 'media', 'team', 'settings', 'reports', 'ai'] as const;
export type Module = (typeof MODULES)[number];
export const ACTIONS = ['view', 'create', 'edit', 'publish', 'delete', 'review', 'verify', 'export', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];
export type PermissionMatrix = Partial<Record<Module, readonly Action[]>>;

/** Local mirror of the database JSON contract; core has no dependency on the database package. */
export type StaffPermissions = { client_scope: ClientScope; modules: Record<string, string[]>; preset?: string };
export type MembershipLike = { role: MembershipRole; permissions?: StaffPermissions | null; clientId?: string | null };

export class AuthzError extends Error {
  readonly code = 'unknown_preset';

  constructor() {
    super('Unknown permission preset.');
    this.name = 'AuthzError';
  }
}

type Preset = {
  name: LocalizedText;
  description: LocalizedText;
  clientScope: ClientScope;
  modules: PermissionMatrix;
};

function coachMatrix(): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const module of MODULES) {
    // Explicit exceptions cannot coexist with manage: manage grants every action.
    matrix[module] = module === 'team' || module === 'settings'
      ? ACTIONS.filter((action) => action !== 'manage')
      : module === 'billing'
        ? ACTIONS.filter((action) => action !== 'manage' && action !== 'verify')
        : ['manage'];
  }
  return matrix;
}

function assistantMatrix(): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const module of MODULES) {
    if (module !== 'team' && module !== 'settings' && module !== 'ai') matrix[module] = ['view'];
  }
  matrix.checkins = ['view', 'edit', 'review'];
  matrix.messages = ['view', 'create', 'edit'];
  matrix.calendar = ['view', 'create', 'edit'];
  matrix.tracking = ['view', 'create', 'edit'];
  return matrix;
}

function freezeMatrix(matrix: PermissionMatrix): PermissionMatrix {
  for (const actions of Object.values(matrix)) Object.freeze(actions);
  return Object.freeze(matrix);
}

function freezePreset(preset: Preset): Preset {
  Object.freeze(preset.name);
  Object.freeze(preset.description);
  freezeMatrix(preset.modules);
  return Object.freeze(preset);
}

// Spec roles: presets are editable starting points; only the owner has unconditional access.
export const PRESETS: Readonly<Record<'coach' | 'assistant' | 'nutrition_coach' | 'assessment_specialist' | 'business_manager', Preset>> = Object.freeze({
  coach: freezePreset({
    name: { ar: 'كوتش', en: 'Coach' },
    description: { ar: 'يدير التدريب والمتابعة لكل العملاء، من غير إدارة الفريق والإعدادات أو تأكيد الدفع.', en: 'Coaching access to all clients, excluding team/settings management and payment verification.' },
    clientScope: 'all', modules: coachMatrix(),
  }),
  assistant: freezePreset({
    name: { ar: 'مساعد الكوتش', en: 'Assistant' },
    description: { ar: 'يتابع العملاء المسؤول عنهم ويراجع المتابعات وينظم الرسايل والمواعيد.', en: 'Views assigned clients, reviews check-ins, and handles messages, calendar and tracking.' },
    clientScope: 'assigned', modules: assistantMatrix(),
  }),
  nutrition_coach: freezePreset({
    name: { ar: 'كوتش تغذية', en: 'Nutrition Coach' },
    description: { ar: 'يدير خطط الأكل ومكتبة الأطعمة ويراجع متابعات العملاء المسؤول عنهم.', en: 'Manages nutrition and foods and reviews assigned clients and their check-ins and messages.' },
    clientScope: 'assigned', modules: {
      nutrition: ['manage'], foods: ['manage'], clients: ['view', 'review'],
      checkins: ['view', 'review'], messages: ['view', 'review'],
    },
  }),
  assessment_specialist: freezePreset({
    name: { ar: 'أخصائي تقييم وتأهيل', en: 'Assessment / Rehab Specialist' },
    description: { ar: 'يدير التقييمات والاستمارات ويراجع صور وفيديوهات العملاء المسؤول عنهم.', en: 'Manages assessments and forms and reviews assigned client media.' },
    clientScope: 'assigned', modules: {
      assessments: ['manage'], forms: ['manage'], media: ['view', 'review'], clients: ['view'],
    },
  }),
  business_manager: freezePreset({
    name: { ar: 'مدير البيزنس', en: 'Business Manager' },
    description: { ar: 'يدير المدفوعات والباقات والتقارير ويطّلع على العملاء، من غير تعديل التمرين أو الأكل.', en: 'Manages billing, packages and reports and views clients without editing coaching plans.' },
    clientScope: 'all', modules: {
      billing: ['manage'], packages: ['manage'], reports: ['manage'], clients: ['view'],
    },
  }),
});

// Client-facing data only; private coaching information needs a separate server boundary.
export const CLIENT_MATRIX: PermissionMatrix = freezeMatrix({
  programs: ['view'], nutrition: ['view'], checkins: ['view', 'create', 'edit'],
  tracking: ['view', 'create', 'edit'], messages: ['view', 'create'],
  billing: ['view', 'create'], calendar: ['view'], media: ['view', 'create'], dashboard: ['view'],
});

/** Copy the preset and merge overrides by module, replacing each supplied action list. */
export function permissionsFromPreset(preset: keyof typeof PRESETS, overrides?: Partial<StaffPermissions>): StaffPermissions {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, preset)) throw new AuthzError();
  const base = PRESETS[preset];
  const modules: Record<string, string[]> = Object.fromEntries(
    Object.entries(base.modules).map(([module, actions]) => [module, [...(actions ?? [])]]),
  );
  for (const [module, actions] of Object.entries(overrides?.modules ?? {})) {
    // defineProperty also keeps JSON module names such as __proto__ as ordinary data.
    Object.defineProperty(modules, module, { value: [...actions], enumerable: true, writable: true, configurable: true });
  }
  return { client_scope: overrides?.client_scope ?? base.clientScope, modules, preset: overrides?.preset ?? preset };
}

function knownPermission(module: Module, action: Action): boolean {
  return MODULES.some((known) => known === module) && ACTIONS.some((known) => known === action);
}

/** Test known actions with manage expansion; absent grants never imply permission. */
export function hasAction(matrix: PermissionMatrix | Record<string, string[]>, module: Module, action: Action): boolean {
  if (!knownPermission(module, action) || !Object.prototype.hasOwnProperty.call(matrix, module)) return false;
  const actions = matrix[module];
  return !!actions && (actions.includes('manage') || actions.includes(action));
}

/** Apply role grants and, when a target is supplied, client ownership or staff assignment. */
export function isAllowed(m: MembershipLike, module: Module, action: Action, opts?: { clientId?: string; assignedClientIds?: readonly string[] }): boolean {
  if (!knownPermission(module, action)) return false;
  if (m.role === 'owner') return true;
  if (m.role === 'client') {
    return hasAction(CLIENT_MATRIX, module, action)
      && (opts?.clientId === undefined || opts.clientId === m.clientId);
  }
  if (m.role !== 'staff' || !m.permissions || !hasAction(m.permissions.modules, module, action)) return false;
  if (opts?.clientId === undefined) return true;
  return m.permissions.client_scope === 'all'
    || (m.permissions.client_scope === 'assigned' && !!opts.assignedClientIds?.includes(opts.clientId));
}

/** Describe effective grants in MODULES/ACTIONS order, without claiming client-scope access. */
export function describePermissions(m: MembershipLike): Array<{ module: Module; actions: Action[] }> {
  const result: Array<{ module: Module; actions: Action[] }> = [];
  for (const module of MODULES) {
    const actions = ACTIONS.filter((action) => isAllowed(m, module, action));
    if (actions.length) result.push({ module, actions });
  }
  return result;
}

/** Compare effective module grants from a to b; client scope is outside this return shape. */
export function diffPermissions(a: StaffPermissions, b: StaffPermissions): Array<{ module: Module; added: Action[]; removed: Action[] }> {
  const result: Array<{ module: Module; added: Action[]; removed: Action[] }> = [];
  for (const module of MODULES) {
    const added = ACTIONS.filter((action) => !hasAction(a.modules, module, action) && hasAction(b.modules, module, action));
    const removed = ACTIONS.filter((action) => hasAction(a.modules, module, action) && !hasAction(b.modules, module, action));
    if (added.length || removed.length) result.push({ module, added, removed });
  }
  return result;
}
