# Batch C — form logic, authorization matrix

Modules: `packages/core/src/forms/`, `packages/core/src/authz/`. Tests: `packages/core/test/forms.test.ts`, `authz.test.ts`.

## X7 — forms (`src/forms/index.ts`)

Spec §12, §17, §18: one form engine for intake, check-ins and assessments; conditional visibility; required fields; media answers. Types from `../types`: `FormDocument`, `FormSection`, `Question`, `QuestionType`, `VisibilityCondition`, `Answers`, `AnswerValue`, `LocalizedText`.

```ts
export function questionsById(doc: FormDocument): Map<string, Question>;

export type Visibility = { visible: Set<string>; hidden: Set<string>; missingRequired: string[] };

/**
 * Evaluate `visibleIf` for every question.
 *  - A question with no condition is visible.
 *  - A condition on a question that is itself hidden evaluates to false (chains hide dependents).
 *  - ops: eq / neq (strict equality after normalising numbers and booleans), gt / lt (numeric), in (value array contains the answer, or any answer of a multi), answered (non-null, non-empty string/array, or a media object with ≥ 1 id).
 *  - Unknown questionId in a condition → the dependent question is visible (fail open) and the issue is reported by validateDocument.
 *  - missingRequired = visible questions with required true and no answer (null, undefined, '', [], or media with no ids).
 */
export function evaluateVisibility(doc: FormDocument, answers: Answers): Visibility;

export type AnswerIssue = {
  questionId: string;
  code: 'required' | 'type' | 'option' | 'range' | 'scale' | 'media' | 'unknown_question';
  message: LocalizedText;
};

/**
 * Validate answers for the visible questions only. Type rules: text/long_text string; number finite number within min/max;
 * date `YYYY-MM-DD`; time `HH:mm`; yes_no boolean; single: string in options; multi: string[] all in options; scale: integer in [min,max];
 * photo/video/file: { mediaIds: string[] } with ≥ 1 id when required. Answers for ids not in the form → 'unknown_question'.
 */
export function validateAnswers(doc: FormDocument, answers: Answers): AnswerIssue[];

/** Structural problems in a template before publishing: duplicate question ids, conditions pointing to unknown questions, single/multi without options, scale without bounds, self-referencing conditions. */
export function validateDocument(doc: FormDocument): Array<{ path: string; code: 'duplicate_id' | 'unknown_reference' | 'missing_options' | 'missing_scale' | 'self_reference'; message: LocalizedText }>;

/** Numeric answers to questions that declare `metricKey`, for writing metric entries after a submission. */
export function metricAnswers(doc: FormDocument, answers: Answers): Array<{ questionId: string; metricKey: string; value: number }>;

/** Progress for the client UI: answered visible questions over visible questions, in percent (whole number). */
export function completion(doc: FormDocument, answers: Answers): { answered: number; total: number; pct: number };
```

Error class `FormsError` (code `invalid_document`) used only when a document fails `FormDocument.safeParse`.

Acceptance tests: a required question hidden by logic is not in `missingRequired`; a chain A→B→C hides C when A hides B; `in` with a multi answer matches on any element; `answered` on an empty media object is false; validateAnswers flags a number above max with code 'range', a single answer not in options with 'option', a yes_no string with 'type', an unknown id with 'unknown_question'; validateDocument catches a duplicate id and a dangling reference; metricAnswers returns only numeric answers of questions with metricKey; completion of 2 answered of 4 visible → 50.

## X8 — authz (`src/authz/index.ts`)

Spec §5 (roles), §41 (team permissions: Coach, Assistant, Nutrition Coach, Assessment/Rehab Specialist, Business Manager as editable presets), §3 (client isolation). Types from `../types`: `MembershipRole`, `ClientScope`, `LocalizedText`. The database stores staff permissions as `{ client_scope, modules: Record<module, action[]>, preset? }` (see packages/db/src/schema/tenants.ts `StaffPermissions`).

```ts
export const MODULES = ['dashboard','clients','packages','billing','programs','exercises','nutrition','foods','forms','checkins','assessments','calendar','tracking','messages','media','team','settings','reports','ai'] as const;
export type Module = (typeof MODULES)[number];
export const ACTIONS = ['view','create','edit','publish','delete','review','verify','export','manage'] as const; // manage implies every action
export type Action = (typeof ACTIONS)[number];
export type PermissionMatrix = Partial<Record<Module, readonly Action[]>>;

export type StaffPermissions = { client_scope: ClientScope; modules: Record<string, string[]>; preset?: string };

export const PRESETS: Readonly<Record<'coach' | 'assistant' | 'nutrition_coach' | 'assessment_specialist' | 'business_manager', { name: LocalizedText; description: LocalizedText; clientScope: ClientScope; modules: PermissionMatrix }>>;
// coach: everything except team/settings manage and billing verify; assistant: view most, edit checkins review, messages, calendar, tracking; nutrition_coach: nutrition/foods manage + clients/checkins/messages view/review; assessment_specialist: assessments/forms manage + media review + clients view; business_manager: billing/packages/reports manage + clients view, no programs/nutrition edit.

/** What a client may do on their own data; `clientId` must equal their membership clientId. */
export const CLIENT_MATRIX: PermissionMatrix;
// programs view, nutrition view, checkins view+create+edit, tracking view+create+edit, messages view+create, billing view+create (submit payment proof), calendar view, media view+create, dashboard view

export type MembershipLike = { role: MembershipRole; permissions?: StaffPermissions | null; clientId?: string | null };

export function permissionsFromPreset(preset: keyof typeof PRESETS, overrides?: Partial<StaffPermissions>): StaffPermissions;
export function hasAction(matrix: PermissionMatrix | Record<string, string[]>, module: Module, action: Action): boolean; // manage ⇒ true

/**
 * owner → true. client → CLIENT_MATRIX and, when opts.clientId is given, it must equal m.clientId. staff → permissions.modules
 * grants the action, and when opts.clientId is given: client_scope 'all' or opts.assignedClientIds includes it.
 * Missing permissions on staff → false. Unknown module/action → false.
 */
export function isAllowed(m: MembershipLike, module: Module, action: Action, opts?: { clientId?: string; assignedClientIds?: readonly string[] }): boolean;

export function describePermissions(m: MembershipLike): Array<{ module: Module; actions: Action[] }>;
export function diffPermissions(a: StaffPermissions, b: StaffPermissions): Array<{ module: Module; added: Action[]; removed: Action[] }>;
```

Error class `AuthzError`, code `unknown_preset`.

Acceptance tests: owner allowed on everything including team manage; client may view own program but not another client's (same action, different clientId → false); client cannot edit programs; assistant preset can review checkins but cannot publish programs; staff with client_scope 'assigned' and assignedClientIds [A] → allowed for A, denied for B; `manage` implies `delete`; permissionsFromPreset with an override replaces only the given module; diffPermissions reports added/removed actions; unknown preset throws `unknown_preset`.
