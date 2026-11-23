import { randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import type { AuthContext, Tx } from '../src/client';
import type { Fixture } from './fixtures';
import { mkClient, mkSession, mkVersion } from './factories';
import { q, svc } from './helpers';

/** doc §3.3: independent runtime table grants, entered from the frozen matrix. */
export const TABLE_GRANTS = {
  tenants: 'SU', memberships: 'SIU', staff_client_assignments: 'SID', invitations: 'SIUD',
  business_settings: 'SIU', user_preferences: 'SIUD', consents: 'SIU', clients: 'SIU',
  client_notes: 'SIUD', client_flags: 'SIU', tasks: 'SIUD', ai_requests: 'SIU',
  // reinvent R0a: private drafts and source-derived red flags.
  ai_drafts: 'SIU', red_flags: 'SU',
  packages: 'SIUD', subscriptions: 'SIU', subscription_events: 'SI', client_entitlement_overrides: 'SIU',
  payments: 'SIU', exercises: 'SIU', foods: 'SIU', tenant_hidden_items: 'SID',
  programs: 'SIUD', program_versions: 'SIUD', nutrition_plans: 'SIUD', nutrition_plan_versions: 'SIUD',
  forms: 'SIUD', form_versions: 'SIUD', form_submissions: 'SIU', calendar_events: 'SIU',
  metric_entries: 'SI', measurement_sets: 'SIU', progress_photo_sets: 'SIU', inbody_records: 'SIU',
  workout_sessions: 'SIU', set_logs: 'SIU', meal_logs: 'SIU', supplement_logs: 'SIU',
  conversations: 'SIU', messages: 'SIU', message_revisions: 'S', notifications: 'SUD',
  notification_deliveries: 'S', push_subscriptions: 'SIUD', idempotency_keys: 'SID',
  media: 'SIUD', audit_log: 'S', events: 'S', job_runs: 'S',
} as const;
/** doc §13.4 S: tables in the independent security matrix. */
export type MatrixTable = keyof typeof TABLE_GRANTS;
/** doc §13.4 S01: all required baseline actors, including both inactive pins. */
export const ACTORS = ['o1', 's1', 's2', 'sx', 'ua', 'ub', 'uc', 'o2', 'o1t2', 'ubT2'] as const;
/** doc §13.4 S: fixture actor key, rather than a database-discovered identity. */
export type MatrixActor = typeof ACTORS[number];
/** doc §13.4 S: literal operation and expected refusal layer. */
export type MatrixCommand = 'select' | 'insert' | 'update' | 'delete';
/** doc §5.2: independently specified policy object, including both expressions. */
export type PolicyContract = {
  table: MatrixTable; name: string; command: MatrixCommand | 'all'; permissive: boolean;
  using: string | null; check: string | null; impliedBy?: string;
};
const T = 'tenant_id = (SELECT app.tenant_id() AS tenant_id)';
const staff = '(SELECT app.is_staff() AS is_staff)';
const owner = '(SELECT app.is_owner() AS is_owner)';
const client = '(SELECT app.is_client() AS is_client)';
const me = (column: string) => `${column} = (SELECT app.uid() AS uid)`;
const own = (column: string) => `${column} = (SELECT app.client_id() AS client_id)`;
const access = (column: string) => `((SELECT app.sees_all_clients() AS sees_all_clients) OR ${column} IN (SELECT app.assigned_client_ids() AS assigned_client_ids))`;
const scoped = `${T} AND ${staff} AND ${access('client_id')}`;
const self = `${T} AND ${me('user_id')}`;
const policyList: PolicyContract[] = [];
function allow(table: MatrixTable, prefix: string, commands: string, expression: string, check = expression): void {
  for (const command of commands.split(' ') as MatrixCommand[]) {
    policyList.push({ table, name: `${prefix}_${command}`, command, permissive: true,
      using: command === 'insert' ? null : expression,
      check: command === 'insert' || command === 'update' ? check : null,
      ...(prefix === 'memberships_owner' && command === 'select' ? { impliedBy: 'memberships_staff_select' } : {}),
      ...(prefix === 'staff_client_assignments_owner' && command === 'select' ? { impliedBy: 'staff_client_assignments_staff_select' } : {}),
    });
  }
}
for (const table of Object.keys(TABLE_GRANTS) as MatrixTable[]) {
  const usingExpression = table === 'tenants' ? 'id = (SELECT app.tenant_id() AS tenant_id)'
    : table === 'memberships' ? `${T} OR ${me('user_id')}`
      : table === 'exercises' || table === 'foods' ? `tenant_id IS NULL OR ${T}` : T;
  policyList.push({ table, name: `${table}_tenant_guard`, command: 'all', permissive: false, using: usingExpression,
    check: table === 'tenants' ? usingExpression : T });
}
allow('tenants', 'tenants_member', 'select', 'id = (SELECT app.tenant_id() AS tenant_id)');
allow('tenants', 'tenants_owner', 'update', `id = (SELECT app.tenant_id() AS tenant_id) AND ${owner}`);
allow('memberships', 'memberships_self', 'select', me('user_id'));
allow('memberships', 'memberships_self', 'update', self);
allow('memberships', 'memberships_owner', 'select insert update', `${T} AND ${owner}`);
allow('memberships', 'memberships_staff', 'select', `${T} AND ${staff} AND (role IN ('owner','staff') OR ${access('client_id')})`);
allow('staff_client_assignments', 'staff_client_assignments_owner', 'select insert delete', `${T} AND ${owner}`);
allow('staff_client_assignments', 'staff_client_assignments_staff', 'select', `${T} AND ${staff} AND (membership_id = (SELECT app.membership_id() AS membership_id) OR ${access('client_id')})`);
allow('invitations', 'invitations_owner', 'select insert update delete', `${T} AND ${owner}`);
allow('invitations', 'invitations_staff', 'select', `${T} AND ${staff} AND (${me('invited_by')} OR (role = 'client' AND ${access('client_id')}))`);
allow('invitations', 'invitations_staff', 'insert', `${T} AND ${staff} AND role = 'client' AND permissions IS NULL AND ${access('client_id')}`);
allow('invitations', 'invitations_staff', 'update', `${T} AND ${staff} AND ${me('invited_by')} AND role = 'client'`);
allow('business_settings', 'business_settings_member', 'select', T);
allow('business_settings', 'business_settings_owner', 'insert update', `${T} AND ${owner}`);
allow('user_preferences', 'user_preferences_self', 'select insert update delete', self);
allow('consents', 'consents_self', 'select insert update', self);
allow('consents', 'consents_owner', 'select', `${T} AND ${owner}`);
allow('consents', 'consents_staff', 'select', `${T} AND ${staff} AND user_id IN (SELECT app.accessible_user_ids() AS accessible_user_ids)`);
allow('clients', 'clients_staff', 'select update', `${T} AND ${staff} AND ${access('id')}`);
allow('clients', 'clients_create', 'insert', `${T} AND ${staff} AND (SELECT app.has_perm('clients','create') AS has_perm)`);
allow('clients', 'clients_client', 'select update', `${T} AND ${own('id')}`);
allow('client_notes', 'client_notes_staff', 'select insert', scoped);
allow('client_notes', 'client_notes_author', 'update delete', `${scoped} AND (${me('author_user_id')} OR ${owner})`);
allow('client_flags', 'client_flags_staff', 'select insert update', scoped);
// reinvent R0a: no client, delete, or direct flag insert policy.
allow('ai_drafts', 'ai_drafts_staff', 'select insert update', scoped);
allow('red_flags', 'red_flags_staff', 'select update', scoped);
for (const table of ['tasks', 'ai_requests'] as const) allow(table, `${table}_staff`, table === 'tasks' ? 'select insert update delete' : 'select insert update', `${T} AND ${staff} AND (client_id IS NULL OR ${access('client_id')})`);
allow('packages', 'packages_staff', 'select insert update delete', `${T} AND ${staff}`);
allow('packages', 'packages_client', 'select', `${T} AND ${client} AND is_public AND archived_at IS NULL`);
for (const table of ['subscriptions', 'client_entitlement_overrides', 'subscription_events'] as const) {
  allow(table, `${table}_staff`, table === 'subscription_events' ? 'select insert' : 'select insert update', scoped);
  allow(table, `${table}_client`, 'select', `${T} AND ${own('client_id')}`);
}
allow('payments', 'payments_staff', 'select insert update', scoped);
allow('payments', 'payments_client', 'select insert', `${T} AND ${own('client_id')}`);
allow('payments', 'payments_client', 'update', `${T} AND ${own('client_id')} AND state = 'pending'`, `${T} AND ${own('client_id')}`);
for (const table of ['exercises', 'foods'] as const) {
  allow(table, `${table}_system`, 'select', 'tenant_id IS NULL');
  allow(table, `${table}_member`, 'select', T);
  allow(table, `${table}_staff`, 'insert update', `${T} AND ${staff}`);
}
allow('tenant_hidden_items', 'tenant_hidden_items_member', 'select', T);
allow('tenant_hidden_items', 'tenant_hidden_items_staff', 'insert delete', `${T} AND ${staff}`);
for (const table of ['programs', 'nutrition_plans', 'forms', 'program_versions', 'nutrition_plan_versions', 'form_versions'] as const) {
  allow(table, `${table}_staff_templates`, 'select insert update delete', `${T} AND ${staff} AND client_id IS NULL`);
  allow(table, `${table}_staff_copies`, 'select insert update delete', `${T} AND ${staff} AND client_id IS NOT NULL AND ${access('client_id')}`);
  const states = table.endsWith('_versions') ? " AND status IN ('published','superseded')" : '';
  allow(table, `${table}_client`, 'select', `${T} AND ${own('client_id')}${states}`);
  if (table === 'forms' || table === 'form_versions') allow(table, `${table}_client_templates`, 'select', `${T} AND ${client} AND client_id IS NULL${states}`);
}
for (const table of ['metric_entries', 'measurement_sets', 'progress_photo_sets', 'inbody_records', 'workout_sessions', 'set_logs', 'meal_logs', 'supplement_logs', 'form_submissions', 'calendar_events'] as const) {
  allow(table, `${table}_staff`, table === 'metric_entries' ? 'select insert' : 'select insert update', scoped);
  allow(table, `${table}_client`, table === 'metric_entries' ? 'select insert' : table === 'calendar_events' ? 'select update' : 'select insert update', `${T} AND ${own('client_id')}`);
}
for (const table of ['conversations', 'messages'] as const) {
  allow(table, `${table}_staff_client`, 'select insert update', `${T} AND ${staff} AND client_id IS NOT NULL AND ${access('client_id')}`);
  allow(table, `${table}_staff_internal`, 'select insert update', `${T} AND ${staff} AND client_id IS NULL${table === 'conversations' ? " AND kind = 'internal'" : ''}`);
  allow(table, `${table}_client`, 'select insert update', `${T} AND ${own('client_id')}`);
}
allow('message_revisions', 'message_revisions_member', 'select', `${T} AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id)`);
for (const [table, commands] of [['notifications', 'select update delete'], ['notification_deliveries', 'select'], ['push_subscriptions', 'select insert update delete'], ['idempotency_keys', 'select insert delete']] as const) allow(table, `${table}_self`, commands, self);
allow('media', 'media_tenant_assets', 'select', `${T} AND client_id IS NULL`);
allow('media', 'media_tenant_assets_staff', 'insert update delete', `${T} AND ${staff} AND client_id IS NULL`);
allow('media', 'media_client_staff', 'select insert update', `${T} AND ${staff} AND client_id IS NOT NULL AND ${access('client_id')}`);
allow('media', 'media_client_own', 'select insert', `${T} AND ${own('client_id')}`);
allow('media', 'media_client_own', 'update', `${T} AND ${own('client_id')} AND (${me('owner_user_id')} OR review_state IN ('requested','needs_resubmission'))`, `${T} AND ${own('client_id')}`);
allow('audit_log', 'audit_log_owner', 'select', `${T} AND ${owner}`);
allow('audit_log', 'audit_log_staff', 'select', `${T} AND ${staff} AND client_id IS NOT NULL AND ${access('client_id')}`);
allow('events', 'events_owner', 'select', `${T} AND ${owner}`);
allow('job_runs', 'job_runs_staff', 'select', `${T} AND ${staff}`);
/** doc §5.2/C02/S00: complete independent policy set; no migration/catalog input. */
export const POLICY_CONTRACTS: readonly PolicyContract[] = policyList;

/** doc §13.4 S: explicit key columns, including composite and bigint text keys. */
export function keyColumns(table: MatrixTable): readonly string[] {
  return ({ staff_client_assignments: ['tenant_id', 'membership_id', 'client_id'], business_settings: ['tenant_id'],
    user_preferences: ['tenant_id', 'user_id'], tenant_hidden_items: ['tenant_id', 'kind', 'item_id'],
    idempotency_keys: ['tenant_id', 'user_id', 'key'] } as Partial<Record<MatrixTable, string[]>>)[table] ?? ['id'];
}
/** doc §13.4 S: parameterised original-key predicate; no bigint Number conversion. */
export function keyWhere(table: MatrixTable, row: Record<string, unknown>): SQL {
  return sql.join(keyColumns(table).map((column) => sql`${sql.identifier(column)} = ${bindDate(row[column])}`), sql` and `);
}
/** The helpers return timestamptz columns as Date; postgres.js refuses a raw Date parameter, so bind the ISO instant. */
function bindDate(value: unknown): SQL {
  return value instanceof Date ? sql`${value.toISOString()}::timestamptz` : sql`${value}`;
}
/** doc §13.4 S/N: execute an explicitly supplied row; objects serialize as JSONB. */
export function insertRow(tx: Tx, table: MatrixTable, row: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  return q(tx, insertStatement(table,row));
}
function insertStatement(table: MatrixTable,row: Record<string,unknown>): SQL {
  const entries = Object.entries(row);
  const textArrays = ['aliases','tags','primary_muscles','secondary_muscles','equipment','progressions','regressions','alternatives','missing_required'];
  return sql`insert into ${sql.identifier(table)} (${sql.join(entries.map(([k]) => sql.identifier(k)), sql`, `)})
    values (${sql.join(entries.map(([k, v]) => Array.isArray(v) && textArrays.includes(k) ? sql`array[${sql.join(v.map((item: unknown) => sql`${item}`),sql`, `)}]::text[]`
      : v !== null && typeof v === 'object' && !(v instanceof Date) ? sql`${JSON.stringify(v)}::jsonb` : bindDate(v)), sql`, `)}) returning *`;
}
function statement(table:MatrixTable,command:MatrixCommand,row:Record<string,unknown>,changes:Record<string,unknown>={}):SQL {
  if(command==='insert')return insertStatement(table,row);
  if(command==='select')return sql`select * from ${sql.identifier(table)}`;
  if(command==='delete')return sql`delete from ${sql.identifier(table)} where ${keyWhere(table,row)}`;
  return sql`update ${sql.identifier(table)} set ${sql.join(Object.entries(changes).map(([column,value])=>sql`${sql.identifier(column)}=${value!==null&&typeof value==='object'&&!(value instanceof Date)?sql`${JSON.stringify(value)}::jsonb`:bindDate(value)}`),sql`, `)} where ${keyWhere(table,row)}`;
}
/** doc §13.2/S03: valid independent row recipe with private mutable parents. */
export async function makeRow(table: MatrixTable, f: Fixture, actor: AuthContext = f.o1): Promise<Record<string, unknown>> {
  const id = randomUUID(); const tenant_id = actor.tenantId;
  const client_id = actor.clientId ?? (tenant_id === f.t2 ? f.clientC : f.clientA);
  const subscription_id = client_id === f.clientB ? f.subB : tenant_id === f.t2 ? f.subC : f.subA;
  const base = { id, tenant_id }; const bound = { ...base, client_id };
  const sync = { ...bound, client_uuid: randomUUID(), client_updated_at: '2001-01-02T00:00:00Z' };
  const local_date = '2026-11-09';
  switch (table) {
    case 'tenants': return { id, name: 'Matrix tenant', slug: `matrix-${id}` };
    case 'memberships': return { ...base, user_id: randomUUID(), role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: {} } };
    case 'staff_client_assignments': return { tenant_id, membership_id: tenant_id === f.t2 ? f.o1t2.membershipId : f.s2.membershipId, client_id: await mkClient(tenant_id) };
    case 'invitations': return { ...bound, role: 'client', invited_by: actor.userId, token_hash: `matrix-${id}`, expires_at: '2099-01-01T00:00:00Z' };
    case 'business_settings': return { tenant_id, settings: {units:{weight:'kg',length:'cm'},exerciseCategories:[],measurementTemplate:[],weekStartsOn:6,checkinReviewTurnaroundHours:24,numerals:'western'} };
    case 'user_preferences': return { tenant_id, user_id: actor.userId, preferences: {} };
    case 'consents': return { ...base, user_id: actor.userId, kind: 'terms', version: id, locale: 'en' };
    case 'clients': return { ...base, first_name: 'Matrix client', status: 'active' };
    case 'client_notes': return { ...bound, body: 'Matrix note', author_user_id: actor.userId };
    case 'client_flags': return { ...bound, kind: 'manual' };
    case 'tasks': return { ...bound, title: 'Matrix task', source: 'manual', state: 'open' };
    case 'ai_requests': return { ...bound, kind: 'matrix', input: {}, created_by: actor.userId, state: 'draft' };
    // reinvent R0a: valid independent service recipes for the new table inventory.
    case 'ai_drafts': return { ...bound, kind: 'week_review', input_hash: 'a'.repeat(64), input_version: 'matrix-v1', body: {}, status: 'draft' };
    case 'red_flags': return { ...bound, source: 'message', source_id: randomUUID(), category: 'other', matched: 'matrix', status: 'open' };
    case 'packages': return { ...base, name: { en: 'Matrix package' }, duration_days: 30, schedule_rules: { checkins: [], workouts: [] }, is_public: true };
    case 'subscriptions': {
      const packageId=tenant_id===f.t2?f.packageT2:f.packageT1;
      const parent=(await svc((tx)=>q<{snapshot:unknown}>(tx,sql`select jsonb_build_object('name',name,'entitlements',entitlements,'scheduleRules',schedule_rules,'durationDays',duration_days,'price',price,'currency',currency)as snapshot from packages where tenant_id=${tenant_id} and id=${packageId}`)))[0];
      if(!parent)throw new Error('private subscription recipe has no package');
      return {...bound,package_id:packageId,package_snapshot:parent.snapshot,starts_on:local_date,ends_on:'2026-12-09',state:'active'};
    }
    case 'subscription_events': return { ...bound, subscription_id, kind: 'extension', reason: 'Matrix ledger' };
    case 'client_entitlement_overrides': return { ...bound, subscription_id, override: {key:'chat',enabled:true} };
    case 'payments': return { ...bound, subscription_id, amount: 100, currency: 'EGP', method: 'cash', state: 'pending' };
    case 'exercises': return { ...base, slug: `matrix-${id}`, name: { en: 'Squat' }, category: 'strength', movement_pattern: 'squat', difficulty: 'beginner' };
    case 'foods': return { ...base, slug: `matrix-${id}`, name: { en: 'Food' }, category: 'grains', per_100: { kcal: 100, proteinG: 10, carbsG: 10, fatG: 2 } };
    case 'tenant_hidden_items': return { tenant_id, kind: 'exercise', item_id: f.exerciseSystem };
    case 'programs': case 'nutrition_plans': case 'forms': return { ...base, name: { en: 'Matrix template' }, kind: 'template', ...(table === 'forms' ? { form_kind: 'checkin' } : {}) };
    case 'program_versions': case 'nutrition_plan_versions': case 'form_versions': {
      const family = table === 'program_versions' ? 'program' : table === 'form_versions' ? 'form' : 'nutrition';
      const parent = await mkVersion(tenant_id, { family, clientId: actor.role === 'client' ? client_id : null });
      const document=(await svc((tx)=>q<{document:unknown}>(tx,sql`select document from ${sql.identifier(table)} where id=${parent.versionId}`)))[0];
      if(!document)throw new Error('private version recipe has no document');
      return { ...base, [family === 'program' ? 'program_id' : family === 'form' ? 'form_id' : 'plan_id']: parent.headId,
        client_id: parent.clientId, version_no: 2, status: 'draft', document: document.document };
    }
    case 'metric_entries': return { ...sync, metric: 'weight', value: 81, unit: 'kg', source: 'manual', recorded_at: '2001-01-01T00:00:00Z', local_date, timezone: 'Africa/Cairo' };
    case 'measurement_sets': return { ...sync, local_date, values: [], taken_by: 'client' };
    case 'progress_photo_sets': return { ...sync, local_date, poses: [] };
    case 'inbody_records': return { ...bound, local_date, source: 'manual', fields: {} };
    case 'workout_sessions': return { ...sync, local_date, timezone: 'Africa/Cairo', state: 'not_started' };
    case 'set_logs': return { ...sync, session_id: await mkSession(tenant_id, client_id), exercise_id: f.exerciseSystem, set_no: 1 };
    case 'meal_logs': return { ...sync, local_date, status: 'eaten' };
    case 'supplement_logs': return { ...sync, local_date, supplement_id: 'matrix', taken: true };
    case 'form_submissions': {
      const parent = await mkVersion(tenant_id, { family: 'form', status: 'published', publishedBy: actor.userId });
      return { ...sync, form_id: parent.headId, form_version_id: parent.versionId, form_kind: 'checkin', state: 'due', answers: {} };
    }
    case 'calendar_events': return { ...bound, type: 'checkin', state: 'due', source: 'manual', due_at: '2026-11-09T00:00:00Z', local_date, timezone: 'Africa/Cairo' };
    case 'conversations': return actor.role === 'client' ? { ...bound, kind: 'client' } : { ...base, kind: 'internal', client_id: null };
    case 'messages': return { ...bound, conversation_id: tenant_id === f.t2 ? f.convC : client_id === f.clientB ? f.convB : f.convA, sender_user_id: actor.userId, sender_role: actor.role, body: 'Matrix message', client_uuid: randomUUID() };
    case 'message_revisions': {
      const message = await makeRow('messages', f, actor);
      await svc((tx) => insertRow(tx, 'messages', message));
      return { ...bound, message_id: message.id, body: 'Earlier text', revised_by: actor.userId };
    }
    case 'notifications': return { ...bound, user_id: actor.userId, type: 'checkin_due', title: { en: 'Matrix notification' } };
    case 'notification_deliveries': {
      const notification = await makeRow('notifications', f, actor);
      await svc((tx) => insertRow(tx, 'notifications', notification));
      return { ...base, user_id: actor.userId, notification_id: notification.id, channel: 'inapp' };
    }
    case 'push_subscriptions': return { ...base, user_id: actor.userId, endpoint: `https://push.example.test/${id}`, keys: { p256dh: 'key', auth: 'auth' } };
    case 'idempotency_keys': return { tenant_id, user_id: actor.userId, key: id, request_hash: id, status_code: 200, response_body: {} };
    case 'media': return { ...bound, owner_user_id: actor.userId, bucket: 'client-media', path: `${tenant_id}/clients/${client_id}/${id}.jpg`, kind: 'file', purpose: 'other', mime_type: 'image/jpeg' };
    case 'audit_log': return { tenant_id, client_id, action: 'matrix.fixture', entity: 'clients', entity_id: client_id };
    case 'events': return { tenant_id, client_id, type: 'matrix.fixture', aggregate: 'clients', aggregate_id: client_id };
    case 'job_runs': return { ...base, job: 'matrix', state: 'pending' };
  }
}

/** doc §13.4 S01: expected SELECT classes evaluated only against service row data, never live policies. */
export function allowsSelect(table: MatrixTable, row: Record<string, unknown>, actorName: MatrixActor, f: Fixture, data: ReadonlyMap<MatrixTable, Record<string, unknown>[]>): boolean {
  const a = f[actorName]; const active = actorName !== 'sx' && actorName !== 'ubT2';
  const isStaff = a.role !== 'client'; const isOwner = a.role === 'owner';
  const accessible = (id: unknown) => isStaff && (a.role === 'owner' || a.permissions?.client_scope === 'all' || id === f.clientA);
  if (table === 'memberships' && row.user_id === a.userId) return true;
  if ((table === 'exercises' || table === 'foods') && row.tenant_id === null) return true;
  if (!active || (table === 'tenants' ? row.id : row.tenant_id) !== a.tenantId) return false;
  const ownClient = row.client_id === a.clientId && a.clientId !== undefined;
  switch (table) {
    case 'tenants': case 'business_settings': case 'tenant_hidden_items': case 'exercises': case 'foods': return true;
    case 'memberships': return isOwner || isStaff && (row.role === 'owner' || row.role === 'staff' || accessible(row.client_id));
    case 'staff_client_assignments': return isOwner || isStaff && (row.membership_id === a.membershipId || accessible(row.client_id));
    case 'invitations': return isOwner || isStaff && (row.invited_by === a.userId || row.role === 'client' && accessible(row.client_id));
    case 'user_preferences': case 'notifications': case 'notification_deliveries': case 'push_subscriptions': case 'idempotency_keys': return row.user_id === a.userId;
    case 'consents': return row.user_id === a.userId || isOwner || isStaff && (data.get('memberships') ?? []).some((m) => m.tenant_id === a.tenantId && m.user_id === row.user_id && (m.role === 'owner' || m.role === 'staff' || accessible(m.client_id)));
    case 'clients': return row.id === a.clientId || accessible(row.id);
    case 'client_notes': case 'client_flags': return accessible(row.client_id);
    // reinvent R0a: even the owning client cannot read either review table.
    case 'ai_drafts': case 'red_flags': return accessible(row.client_id);
    case 'tasks': case 'ai_requests': return isStaff && (row.client_id === null || accessible(row.client_id));
    case 'packages': return isStaff || row.is_public === true && row.archived_at === null;
    case 'programs': case 'nutrition_plans': case 'forms': return ownClient || isStaff && (row.client_id === null || accessible(row.client_id)) || table === 'forms' && a.role === 'client' && row.client_id === null;
    case 'program_versions': case 'nutrition_plan_versions': case 'form_versions': return isStaff && (row.client_id === null || accessible(row.client_id)) || ['published', 'superseded'].includes(String(row.status)) && (ownClient || table === 'form_versions' && row.client_id === null && a.role === 'client');
    case 'conversations': case 'messages': return ownClient || isStaff && (row.client_id === null || accessible(row.client_id));
    case 'message_revisions': return (data.get('messages') ?? []).some((m) => m.id === row.message_id && allowsSelect('messages', m, actorName, f, data));
    case 'media': return row.client_id === null || ownClient || accessible(row.client_id);
    case 'audit_log': return isOwner || row.client_id !== null && accessible(row.client_id);
    case 'events': return isOwner;
    case 'job_runs': return isStaff;
    default: return ownClient || accessible(row.client_id);
  }
}

const ownerOnly = new Set<MatrixTable>(['tenants', 'memberships', 'staff_client_assignments', 'business_settings']);
const staffOnly = new Set<MatrixTable>(['client_notes', 'client_flags', 'tasks', 'ai_requests', 'packages', 'subscriptions', 'subscription_events', 'client_entitlement_overrides', 'exercises', 'foods', 'tenant_hidden_items', 'programs', 'nutrition_plans', 'forms', 'program_versions', 'nutrition_plan_versions', 'form_versions']);
// reinvent R0a: table grants still separately deny direct INSERT into red_flags.
staffOnly.add('ai_drafts');
staffOnly.add('red_flags');
/** doc §13.4 S03: normal write outcome before table-specific self-edit/delete rules. */
export function writeOutcome(table: MatrixTable, actor: MatrixActor, command: Exclude<MatrixCommand, 'select'>): 'allow' | 'privilege' | 'rls' | 'noeffect' {
  const letter = { insert: 'I', update: 'U', delete: 'D' }[command];
  if (!TABLE_GRANTS[table].includes(letter)) return 'privilege';
  const staffActor = ['o1', 's1', 's2', 'o2', 'o1t2'].includes(actor);
  let allowed = true;
  if (ownerOnly.has(table)) allowed = actor === 'o1' || actor === 'o2' || table === 'memberships' && command === 'update';
  else if (staffOnly.has(table)) allowed = staffActor;
  if (table === 'invitations') allowed = staffActor && (command !== 'delete' || actor === 'o1' || actor === 'o2');
  if (table === 'clients' && command === 'insert' || table === 'calendar_events' && command === 'insert') allowed = staffActor;
  if (table === 'notifications' && command === 'insert') allowed = false;
  if (table === 'media' && command === 'delete') allowed = staffActor;
  return allowed ? 'allow' : command === 'insert' ? 'rls' : 'noeffect';
}
/** doc §13.4 S00–S03: implemented tuples, exact policy coverage and explicit implication metadata. */
export const matrix = (Object.keys(TABLE_GRANTS) as MatrixTable[]).flatMap((table) => ACTORS.flatMap((actor) => {
  const commands: MatrixCommand[] = actor === 'sx' || actor === 'ubT2' ? ['select'] : ['select', 'insert', 'update', 'delete'];
  return commands.map((command) => ({ table, actor, command, rowClass:'default', factory: makeRow, keys: keyColumns(table), predicate: keyWhere, statement,
    expectedValues: (row:Record<string,unknown>,changes:Record<string,unknown>) => command==='insert'?row:changes,
    expected: command === 'select' ? 'exact-select-set' : command === 'update' && ['ua', 'ub', 'uc'].includes(actor) && ['meal_logs', 'measurement_sets', 'supplement_logs'].includes(table) ? 'guard' : writeOutcome(table, actor, command),
    covers: POLICY_CONTRACTS.filter((p) => p.table === table && (p.command === command || p.command === 'all')).map((p) => `policy:${p.name}`),
    implications: POLICY_CONTRACTS.filter((p) => p.table === table && p.impliedBy).map((p) => `${p.name} => ${p.impliedBy}`),
  }));
})).concat((['programs','nutrition_plans','forms','program_versions','nutrition_plan_versions','form_versions']as const).flatMap((table)=>(['o1','s1','s2','ua']as const).flatMap((actor)=>(['insert','update','delete']as const).map((command)=>({
  table,actor,command,rowClass:'client copy draft',factory:makeCopyRow,keys:keyColumns(table),predicate:keyWhere,statement,
  expectedValues:(row:Record<string,unknown>,changes:Record<string,unknown>)=>command==='insert'?row:changes,
  expected:writeOutcome(table,actor,command),covers:POLICY_CONTRACTS.filter((p)=>p.table===table&&(p.command===command||p.command==='all')).map((p)=>`policy:${p.name}`),implications:[] as string[],
})))));
async function makeCopyRow(table:MatrixTable,f:Fixture,actor:AuthContext=f.o1):Promise<Record<string,unknown>>{
  const row=await makeRow(table,f,actor);const clientId=actor.clientId??(actor.tenantId===f.t2?f.clientC:f.clientA);
  if(!table.endsWith('_versions'))return{...row,kind:'client',client_id:clientId};
  const family=table==='program_versions'?'program':table==='nutrition_plan_versions'?'nutrition':'form';
  const parent=await mkVersion(actor.tenantId,{family,clientId});
  return{...row,client_id:clientId,[family==='program'?'program_id':family==='nutrition'?'plan_id':'form_id']:parent.headId};
}
/** doc §13.4 S03: additional self-edit and frozen-document cells at their actual refusal layer. */
export const GUARD_CELLS = [
  {table:'clients' as const,actor:'ua' as const,command:'update' as const,column:'status',rule:'client_update',code:'42501',starting:'active'},
  {table:'memberships' as const,actor:'ua' as const,command:'update' as const,column:'permissions',rule:'client_update',code:'42501',starting:'active client'},
  {table:'memberships' as const,actor:'s1' as const,command:'update' as const,column:'permissions',rule:'staff_update',code:'42501',starting:'active staff'},
  ...(['programs','nutrition_plans','forms','program_versions','nutrition_plan_versions','form_versions']as const).flatMap((table)=>(['o1','s2']as const).map((actor)=>({table,actor,command:'delete' as const,column:'status',rule:table.endsWith('_versions')?'rule:app.protect_published_version':'rule:app.head_rules',code:'P0001',starting:'published'}))),
];
/** doc §5.2/§13.4 S03: visible-but-nonwritable USING arms with the permitted counterpart. */
export const USING_CELLS = [
  {table:'client_notes' as const,actor:'s1' as const,column:'body',starting:'other author',permitted:'own author',covers:['policy:client_notes_author_update']},
  {table:'invitations' as const,actor:'s1' as const,column:'status',starting:'other inviter client invitation',permitted:'own client invitation',covers:['policy:invitations_staff_update']},
  {table:'payments' as const,actor:'ua' as const,column:'reference',starting:'verified',permitted:'pending',covers:['policy:payments_client_update']},
  {table:'media' as const,actor:'ua' as const,column:'review_state',starting:'coach-owned approved',permitted:'coach-owned requested',covers:['policy:media_client_own_update']},
];
