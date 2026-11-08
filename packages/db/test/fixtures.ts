import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { permissionsFromPreset, type PRESETS, type StaffPermissions } from '@dawlyy/core/authz';
import { withServiceTx, type AuthContext, type Tx } from '../src/client';

/** doc §13.5: Read the db package environment without overriding existing process variables. */
export function loadEnv(): void {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv();

/** doc §13.3: postgres-js through Drizzle returns the row array itself. */
export function rows<T = Record<string, unknown>>(result: unknown): T[] {
  return result as unknown as T[];
}

/** doc §13.3: Find the exact driver SQLSTATE through an acyclic Drizzle cause chain. */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  let driverCode: string | undefined;
  const seen = new Set<object>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) driverCode = code;
    current = (current as { cause?: unknown }).cause;
  }
  return driverCode;
}

/** doc §13.2: Shared baseline names; every context carries its §14 permission snapshot. */
export type Fixture = {
  /** Tenant One. */
  t1: string;
  /** Tenant Two. */
  t2: string;
  /** Active T1 client A, assigned only to S1. */
  clientA: string;
  /** Active T1 client B, unassigned. */
  clientB: string;
  /** Active T2 client C. */
  clientC: string;
  /** Active T2 client D, linked to B's disabled T2 membership. */
  clientD: string;
  /** Active owner of T1, permissions null. */
  o1: AuthContext;
  /** Staff of T1 with client_scope 'assigned', assigned to client A only. */
  s1: AuthContext;
  /** Staff of T1 with client_scope 'all'. */
  s2: AuthContext;
  /** Disabled all-scope T1 staff; its pin must not establish a tenant. */
  sx: AuthContext;
  /** Owner of T2. */
  o2: AuthContext;
  /** O1's user as active staff (client_scope 'all') of T2: one user, two tenants. */
  o1t2: AuthContext;
  /** Active client A membership, permissions null. */
  ua: AuthContext;
  /** Active client B membership, permissions null. */
  ub: AuthContext;
  /** Active client C membership, permissions null. */
  uc: AuthContext;
  /** Disabled T2 client membership for B's same user, linked to D. */
  memBT2: string;
  /** Context pinning memBT2, role client, permissions null. */
  ubT2: AuthContext;
  /** S1's membership UUID. */
  s1MembershipId: string;
  /** Public, unarchived 30-day T1 package. */
  packageT1: string;
  /** Public, unarchived 30-day T2 package. */
  packageT2: string;
  /** A's active subscription to packageT1. */
  subA: string;
  /** B's active subscription to packageT1. */
  subB: string;
  /** C's active subscription to packageT2. */
  subC: string;
  /** T1 program template. */
  templateProgram: string;
  /** A's draft-only program copy. */
  copyProgram: string;
  /** Published v1 of templateProgram, published by O1. */
  publishedVersion: string;
  /** Draft version 1 of A's copy program. */
  copyVersion: string;
  /** Coach-private note on A, author O1. */
  noteA: string;
  /** A's manual weight entry, 80 kg. */
  metricA: string;
  /** B's manual weight entry, 70 kg. */
  metricB: string;
  /** Pending T1 staff invitation by O1, null client. */
  invOwnerStaff: string;
  /** Pending A client invitation by S1, permissions null. */
  invS1ClientA: string;
  /** Pending B client invitation by O1, permissions null. */
  invO1ClientB: string;
  /** Pending A/subA cash payment, EGP 100, server fields null. */
  payA: string;
  /** Pending B/subB cash payment, EGP 100, server fields null. */
  payB: string;
  /** Pending C/subC cash payment, EGP 100, server fields null. */
  payC: string;
  /** Empty A client conversation. */
  convA: string;
  /** Empty B client conversation. */
  convB: string;
  /** Empty T1 internal conversation, client null. */
  convInternal: string;
  /** Empty C client conversation. */
  convC: string;
  /** A-owned JPEG payment proof with null review state. */
  mediaA: string;
  /** B-owned JPEG payment proof with null review state. */
  mediaB: string;
  /** C-owned JPEG payment proof with null review state. */
  mediaC: string;
  /** A's second program copy, distinct from copyProgram. */
  copyProgramA2: string;
  /** Published v1 of copyProgramA2. */
  copyPubA: string;
  /** Draft v2 of copyProgramA2. */
  copyDraftA2: string;
  /** B's program copy. */
  copyProgramB: string;
  /** Published v1 of copyProgramB. */
  copyPubB: string;
  /** T1 check-in form template. */
  templateForm: string;
  /** Published v1 of templateForm. */
  templateFormPub: string;
  /** Draft v2 of templateForm. */
  templateFormDraft: string;
  /** B's check-in form copy. */
  copyFormB: string;
  /** Published v1 of copyFormB. */
  copyFormBPub: string;
  /** A's nutrition copy. */
  planCopyA: string;
  /** Published v1 of planCopyA. */
  planPubA: string;
  /** B's nutrition copy. */
  planCopyB: string;
  /** Published v1 of planCopyB. */
  planPubB: string;
  /** Shared system exercise, tenant null. */
  exerciseSystem: string;
  /** T1 exercise. */
  exerciseT1: string;
  /** T2 exercise. */
  exerciseT2: string;
  /** Shared system food, tenant null. */
  foodSystem: string;
  /** T2 food. */
  foodT2: string;
  /** A's due manual check-in calendar event. */
  eventA: string;
  /** B's due manual check-in calendar event. */
  eventB: string;
  /** Notification for A's user. */
  notifA: string;
  /** In-app delivery of notifA to A's user. */
  deliveryA: string;
  /** Notification for B's user. */
  notifB: string;
  /** A's unwithdrawn terms/v1/en consent in T1. */
  consentA: string;
  /** B's unwithdrawn terms/v1/en consent in T1. */
  consentB: string;
  /** S1's unwithdrawn terms/v1/en consent in T1. */
  consentS1: string;
  /** Open manual T1 task with null client, automation and completion fields. */
  taskT1: string;
  /** Open manual A task with null automation and completion fields. */
  taskA: string;
};

const SERVICE_TABLES = 'tenants, audit_log, events, job_runs, idempotency_keys';
type DocumentFamily = 'program' | 'nutrition' | 'form';
const documentTables = {
  program: { head: 'programs', versions: 'program_versions', key: 'program_id' },
  nutrition: { head: 'nutrition_plans', versions: 'nutrition_plan_versions', key: 'plan_id' },
  form: { head: 'forms', versions: 'form_versions', key: 'form_id' },
} as const;

/** doc §13.2: Supply valid core document payloads with fresh embedded identifiers. */
function versionDocument(family: DocumentFamily, foodId?: string): string {
  if (family === 'form') return JSON.stringify({ schemaVersion: 1, sections: [{ id: randomUUID(), title: { en: 'Check-in' }, questions: [] }] });
  if (family === 'nutrition') {
    if (!foodId) throw new Error('nutrition fixture needs a food');
    return JSON.stringify({ schemaVersion: 1, targets: { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 },
      meals: [{ id: randomUUID(), name: { en: 'Meal' }, options: [{ id: randomUUID(), items: [
        { id: randomUUID(), foodId, quantity: 100, measure: { kind: 'g' }, approx: false },
      ] }] }], supplements: [], allergens: [] });
  }
  return JSON.stringify({ schemaVersion: 1, phases: [{ id: randomUUID(), name: { en: 'Phase' },
    weeks: [{ id: randomUUID(), index: 0, days: Array.from({ length: 7 }, (_, index) => ({ id: randomUUID(), index, kind: 'rest' })) }] }] });
}

/** doc §13.2: Insert a template or client-copy head with the family's required kind columns. */
async function insertHead(tx: Tx, family: DocumentFamily, id: string, tenantId: string, clientId: string | null, templateId: string | null = null): Promise<void> {
  await tx.execute(sql`insert into ${sql.identifier(documentTables[family].head)}
    (id, tenant_id, name, kind, client_id, template_id${family === 'form' ? sql`, form_kind` : sql``})
    values (${id}, ${tenantId}, ${JSON.stringify({ en: 'Fixture ' + family })}::jsonb,
      ${clientId === null ? 'template' : 'client'}, ${clientId}, ${templateId}${family === 'form' ? sql`, 'checkin'` : sql``})`);
}

/** doc §13.2: Insert versions in order with all CHECK and every-role publication stamps satisfied. */
async function insertVersion(tx: Tx, family: DocumentFamily, id: string, tenantId: string, headId: string, clientId: string | null,
  versionNo: number, status: 'draft' | 'published', publisher: string, foodId?: string): Promise<void> {
  await tx.execute(sql`insert into ${sql.identifier(documentTables[family].versions)}
    (id, tenant_id, ${sql.identifier(documentTables[family].key)}, client_id, version_no, status, document, published_at, published_by)
    values (${id}, ${tenantId}, ${headId}, ${clientId}, ${versionNo}, ${status}, ${versionDocument(family, foodId)}::jsonb,
      ${status === 'published' ? sql`now()` : sql`null`}, ${status === 'published' ? publisher : null})`);
}

/** doc §13.2: Insert a valid system or tenant food with a unique slug and macro payload. */
async function insertFood(tx: Tx, id: string, tenantId: string | null): Promise<void> {
  await tx.execute(sql`insert into foods (id, tenant_id, slug, name, category, per_100)
    values (${id}, ${tenantId}, ${'food-' + id}, ${JSON.stringify({ en: 'Fixture food' })}::jsonb,
      'grains', ${JSON.stringify({ kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 })}::jsonb)`);
}

/** doc §13.2: Clear tenant graphs, the system library and non-cascading service tables. */
export async function truncateAll(): Promise<void> {
  await withServiceTx(null, 'rls test cleanup', async (tx) => {
    await tx.execute(sql`set local client_min_messages = warning`);
    await tx.execute(sql.raw(`truncate table ${SERVICE_TABLES} restart identity cascade`));
  });
}

/** doc §13.2: Reset the migrated test database, then build the shared baseline. */
export async function buildFixture(): Promise<Fixture> {
  await truncateAll();
  return buildPrivateFixture();
}

/** doc §13.2: Build fresh tenant graphs without truncation; reuse read-only system seeds. */
export async function buildPrivateFixture(): Promise<Fixture> {
  const suffix = randomUUID();
  const f = {
    t1: randomUUID(),
    t2: randomUUID(),
    clientA: randomUUID(),
    clientB: randomUUID(),
    clientC: randomUUID(),
    clientD: randomUUID(),
    userO1: randomUUID(),
    userS1: randomUUID(),
    userS2: randomUUID(),
    userSX: randomUUID(),
    userO2: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    userC: randomUUID(),
    memO1: randomUUID(),
    memS1: randomUUID(),
    memS2: randomUUID(),
    memSX: randomUUID(),
    memO2: randomUUID(),
    memO1T2: randomUUID(),
    memA: randomUUID(),
    memB: randomUUID(),
    memC: randomUUID(),
    memBT2: randomUUID(),
    packageT1: randomUUID(),
    packageT2: randomUUID(),
    subA: randomUUID(),
    subB: randomUUID(),
    subC: randomUUID(),
    templateProgram: randomUUID(),
    copyProgram: randomUUID(),
    publishedVersion: randomUUID(),
    copyVersion: randomUUID(),
    noteA: randomUUID(),
    metricA: randomUUID(),
    metricB: randomUUID(),
    invOwnerStaff: randomUUID(), invS1ClientA: randomUUID(), invO1ClientB: randomUUID(),
    payA: randomUUID(), payB: randomUUID(), payC: randomUUID(),
    convA: randomUUID(), convB: randomUUID(), convInternal: randomUUID(), convC: randomUUID(),
    mediaA: randomUUID(), mediaB: randomUUID(), mediaC: randomUUID(),
    copyProgramA2: randomUUID(), copyPubA: randomUUID(), copyDraftA2: randomUUID(),
    copyProgramB: randomUUID(), copyPubB: randomUUID(),
    templateForm: randomUUID(), templateFormPub: randomUUID(), templateFormDraft: randomUUID(),
    copyFormB: randomUUID(), copyFormBPub: randomUUID(),
    planCopyA: randomUUID(), planPubA: randomUUID(), planCopyB: randomUUID(), planPubB: randomUUID(),
    exerciseSystem: randomUUID(), exerciseT1: randomUUID(), exerciseT2: randomUUID(), foodSystem: randomUUID(), foodT2: randomUUID(),
    eventA: randomUUID(), eventB: randomUUID(), notifA: randomUUID(), deliveryA: randomUUID(), notifB: randomUUID(),
    consentA: randomUUID(), consentB: randomUUID(), consentS1: randomUUID(), taskT1: randomUUID(), taskA: randomUUID(),
  };

  const schedule = JSON.stringify({ checkins: [], workouts: [] });
  const snapshot = (name: string) =>
    JSON.stringify({ name: { en: name }, entitlements: [], scheduleRules: { checkins: [], workouts: [] }, durationDays: 30, price: 0, currency: 'EGP' });

  await withServiceTx(null, 'rls test fixture', async (tx) => {
    await tx.execute(sql`insert into tenants (id, name, slug) values
      (${f.t1}, 'Tenant One', ${'rls-t1-' + suffix}),
      (${f.t2}, 'Tenant Two', ${'rls-t2-' + suffix})`);

    // Persistent client codes come from the database function, as in production.
    const codeA = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t1}::uuid) as code`))[0]!.code;
    const codeB = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t1}::uuid) as code`))[0]!.code;
    const codeC = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t2}::uuid) as code`))[0]!.code;
    const codeD = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t2}::uuid) as code`))[0]!.code;

    await tx.execute(sql`insert into clients (id, tenant_id, code, first_name, status) values
      (${f.clientA}, ${f.t1}, ${codeA}, 'Client A', 'active'),
      (${f.clientB}, ${f.t1}, ${codeB}, 'Client B', 'active'),
      (${f.clientC}, ${f.t2}, ${codeC}, 'Client C', 'active'),
      (${f.clientD}, ${f.t2}, ${codeD}, 'Client D', 'active')`);

    const staffPermissions = JSON.stringify({ client_scope: 'assigned', modules: {} });
    await tx.execute(sql`insert into memberships (id, tenant_id, user_id, role, status, client_id, permissions) values
      (${f.memO1}, ${f.t1}, ${f.userO1}, 'owner', 'active', null, null),
      (${f.memS1}, ${f.t1}, ${f.userS1}, 'staff', 'active', null, ${staffPermissions}::jsonb),
      (${f.memA}, ${f.t1}, ${f.userA}, 'client', 'active', ${f.clientA}, null),
      (${f.memB}, ${f.t1}, ${f.userB}, 'client', 'active', ${f.clientB}, null),
      (${f.memC}, ${f.t2}, ${f.userC}, 'client', 'active', ${f.clientC}, null)`);

    const allScope = JSON.stringify({ client_scope: 'all', modules: {} });
    await tx.execute(sql`insert into memberships (id, tenant_id, user_id, role, status, client_id, permissions) values
      (${f.memS2}, ${f.t1}, ${f.userS2}, 'staff', 'active', null, ${allScope}::jsonb),
      (${f.memSX}, ${f.t1}, ${f.userSX}, 'staff', 'disabled', null, ${allScope}::jsonb),
      (${f.memO2}, ${f.t2}, ${f.userO2}, 'owner', 'active', null, null),
      (${f.memO1T2}, ${f.t2}, ${f.userO1}, 'staff', 'active', null, ${allScope}::jsonb),
      (${f.memBT2}, ${f.t2}, ${f.userB}, 'client', 'disabled', ${f.clientD}, null)`);

    await tx.execute(sql`insert into staff_client_assignments (tenant_id, membership_id, client_id)
      values (${f.t1}, ${f.memS1}, ${f.clientA})`);

    await tx.execute(sql`insert into packages (id, tenant_id, name, duration_days, schedule_rules, is_public, archived_at) values
      (${f.packageT1}, ${f.t1}, ${JSON.stringify({ en: 'Package T1' })}::jsonb, 30, ${schedule}::jsonb, true, null),
      (${f.packageT2}, ${f.t2}, ${JSON.stringify({ en: 'Package T2' })}::jsonb, 30, ${schedule}::jsonb, true, null)`);

    await tx.execute(sql`insert into subscriptions (id, tenant_id, client_id, package_id, package_snapshot, state, starts_on, ends_on) values
      (${f.subA}, ${f.t1}, ${f.clientA}, ${f.packageT1}, ${snapshot('Package T1')}::jsonb, 'active', current_date, current_date + 30),
      (${f.subB}, ${f.t1}, ${f.clientB}, ${f.packageT1}, ${snapshot('Package T1')}::jsonb, 'active', current_date, current_date + 30),
      (${f.subC}, ${f.t2}, ${f.clientC}, ${f.packageT2}, ${snapshot('Package T2')}::jsonb, 'active', current_date, current_date + 30)`);

    // Template (client_id null) with one published version, plus a client copy for A.
    await tx.execute(sql`insert into programs (id, tenant_id, name, kind, client_id) values
      (${f.templateProgram}, ${f.t1}, ${JSON.stringify({ en: 'Template' })}::jsonb, 'template', null)`);
    await tx.execute(sql`insert into programs (id, tenant_id, name, kind, template_id, client_id) values
      (${f.copyProgram}, ${f.t1}, ${JSON.stringify({ en: 'Copy for A' })}::jsonb, 'client', ${f.templateProgram}, ${f.clientA})`);
    await tx.execute(sql`insert into program_versions (id, tenant_id, program_id, client_id, version_no, status, document, published_at, published_by) values
      (${f.publishedVersion}, ${f.t1}, ${f.templateProgram}, null, 1, 'published', ${versionDocument('program')}::jsonb, now(), ${f.userO1}),
      (${f.copyVersion}, ${f.t1}, ${f.copyProgram}, ${f.clientA}, 1, 'draft', ${versionDocument('program')}::jsonb, null, null)`);

    await tx.execute(sql`insert into client_notes (id, tenant_id, client_id, body, author_user_id)
      values (${f.noteA}, ${f.t1}, ${f.clientA}, 'private coach note about A', ${f.userO1})`);

    await tx.execute(sql`insert into metric_entries (id, tenant_id, client_id, metric, value, unit, source, recorded_at, local_date, timezone, client_uuid) values
      (${f.metricA}, ${f.t1}, ${f.clientA}, 'weight', 80, 'kg', 'manual', now(), current_date, 'Africa/Cairo', ${randomUUID()}),
      (${f.metricB}, ${f.t1}, ${f.clientB}, 'weight', 70, 'kg', 'manual', now(), current_date, 'Africa/Cairo', ${randomUUID()})`);

    // After truncation these are absent; private graphs reuse them to preserve shared system SELECT sets.
    const systemExercise = rows<{ id: ReturnType<typeof randomUUID> }>(await tx.execute(sql`select id from exercises where tenant_id is null order by id limit 1`))[0];
    const systemFood = rows<{ id: ReturnType<typeof randomUUID> }>(await tx.execute(sql`select id from foods where tenant_id is null order by id limit 1`))[0];
    if (systemExercise) f.exerciseSystem = systemExercise.id;
    if (systemFood) f.foodSystem = systemFood.id;
    for (const [id, tenantId] of [[f.exerciseSystem, null], [f.exerciseT1, f.t1], [f.exerciseT2, f.t2]] as const) {
      if (tenantId === null && systemExercise) continue;
      await tx.execute(sql`insert into exercises (id, tenant_id, slug, name, category, movement_pattern, difficulty)
        values (${id}, ${tenantId}, ${'exercise-' + id}, ${JSON.stringify({ en: 'Fixture squat' })}::jsonb, 'strength', 'squat', 'beginner')`);
    }
    if (!systemFood) await insertFood(tx, f.foodSystem, null);
    await insertFood(tx, f.foodT2, f.t2);

    for (const [headId, clientId, versionId] of [[f.copyProgramA2, f.clientA, f.copyPubA], [f.copyProgramB, f.clientB, f.copyPubB]] as const) {
      await insertHead(tx, 'program', headId, f.t1, clientId, f.templateProgram);
      await insertVersion(tx, 'program', versionId, f.t1, headId, clientId, 1, 'published', f.userO1);
    }
    await insertVersion(tx, 'program', f.copyDraftA2, f.t1, f.copyProgramA2, f.clientA, 2, 'draft', f.userO1);
    await insertHead(tx, 'form', f.templateForm, f.t1, null);
    await insertVersion(tx, 'form', f.templateFormPub, f.t1, f.templateForm, null, 1, 'published', f.userO1);
    await insertVersion(tx, 'form', f.templateFormDraft, f.t1, f.templateForm, null, 2, 'draft', f.userO1);
    await insertHead(tx, 'form', f.copyFormB, f.t1, f.clientB, f.templateForm);
    await insertVersion(tx, 'form', f.copyFormBPub, f.t1, f.copyFormB, f.clientB, 1, 'published', f.userO1);
    for (const [headId, clientId, versionId] of [[f.planCopyA, f.clientA, f.planPubA], [f.planCopyB, f.clientB, f.planPubB]] as const) {
      await insertHead(tx, 'nutrition', headId, f.t1, clientId);
      await insertVersion(tx, 'nutrition', versionId, f.t1, headId, clientId, 1, 'published', f.userO1, f.foodSystem);
    }
    await tx.execute(sql`insert into invitations (id, tenant_id, token_hash, role, client_id, permissions, status, invited_by, expires_at) values
      (${f.invOwnerStaff}, ${f.t1}, ${'inv-os-' + suffix}, 'staff', null, null, 'pending', ${f.userO1}, now() + interval '7 days'),
      (${f.invS1ClientA}, ${f.t1}, ${'inv-sa-' + suffix}, 'client', ${f.clientA}, null, 'pending', ${f.userS1}, now() + interval '7 days'),
      (${f.invO1ClientB}, ${f.t1}, ${'inv-ob-' + suffix}, 'client', ${f.clientB}, null, 'pending', ${f.userO1}, now() + interval '7 days')`);
    for (const [id, tenantId, clientId, subscriptionId] of [
      [f.payA, f.t1, f.clientA, f.subA], [f.payB, f.t1, f.clientB, f.subB], [f.payC, f.t2, f.clientC, f.subC],
    ] as const) {
      await tx.execute(sql`insert into payments (id, tenant_id, client_id, subscription_id, amount, currency, method, state)
        values (${id}, ${tenantId}, ${clientId}, ${subscriptionId}, 100, 'EGP', 'cash', 'pending')`);
    }
    for (const [id, tenantId, clientId, kind] of [[f.convA, f.t1, f.clientA, 'client'], [f.convB, f.t1, f.clientB, 'client'],
      [f.convC, f.t2, f.clientC, 'client'], [f.convInternal, f.t1, null, 'internal']] as const) {
      await tx.execute(sql`insert into conversations (id, tenant_id, client_id, kind, unread_for_coach, unread_for_client)
        values (${id}, ${tenantId}, ${clientId}, ${kind}, 0, 0)`);
    }
    for (const [id, tenantId, clientId, userId] of [
      [f.mediaA, f.t1, f.clientA, f.userA], [f.mediaB, f.t1, f.clientB, f.userB], [f.mediaC, f.t2, f.clientC, f.userC],
    ] as const) {
      await tx.execute(sql`insert into media (id, tenant_id, client_id, owner_user_id, bucket, path, kind, purpose, mime_type, review_state)
        values (${id}, ${tenantId}, ${clientId}, ${userId}, 'client-media',
          ${tenantId + '/clients/' + clientId + '/f-' + suffix + '.jpg'}, 'file', 'payment_proof', 'image/jpeg', null)`);
    }
    for (const [id, clientId] of [[f.eventA, f.clientA], [f.eventB, f.clientB]] as const) {
      await tx.execute(sql`insert into calendar_events (id, tenant_id, client_id, type, state, source, rule_key, due_at, local_date, timezone)
        values (${id}, ${f.t1}, ${clientId}, 'checkin', 'due', 'manual', null, now(), current_date, 'Africa/Cairo')`);
    }
    await tx.execute(sql`insert into notifications (id, tenant_id, client_id, user_id, type, title) values
      (${f.notifA}, ${f.t1}, ${f.clientA}, ${f.userA}, 'checkin_due', ${JSON.stringify({ en: 'Check-in due' })}::jsonb),
      (${f.notifB}, ${f.t1}, ${f.clientB}, ${f.userB}, 'checkin_due', ${JSON.stringify({ en: 'Check-in due' })}::jsonb)`);
    await tx.execute(sql`insert into notification_deliveries (id, tenant_id, notification_id, user_id, channel)
      values (${f.deliveryA}, ${f.t1}, ${f.notifA}, ${f.userA}, 'inapp')`);
    for (const [id, userId] of [[f.consentA, f.userA], [f.consentB, f.userB], [f.consentS1, f.userS1]] as const) {
      await tx.execute(sql`insert into consents (id, tenant_id, user_id, kind, version, locale, withdrawn_at)
        values (${id}, ${f.t1}, ${userId}, 'terms', 'v1', 'en', null)`);
    }
    await tx.execute(sql`insert into tasks (id, tenant_id, client_id, title, state, source) values
      (${f.taskT1}, ${f.t1}, null, 'Tenant task', 'open', 'manual'),
      (${f.taskA}, ${f.t1}, ${f.clientA}, 'Client A task', 'open', 'manual')`);
  });

  return {
    t1: f.t1,
    t2: f.t2,
    clientA: f.clientA,
    clientB: f.clientB,
    clientC: f.clientC,
    clientD: f.clientD,
    o1: { userId: f.userO1, tenantId: f.t1, membershipId: f.memO1, role: 'owner', permissions: null },
    s1: { userId: f.userS1, tenantId: f.t1, membershipId: f.memS1, role: 'staff', permissions: { client_scope: 'assigned', modules: {} } },
    s2: { userId: f.userS2, tenantId: f.t1, membershipId: f.memS2, role: 'staff', permissions: { client_scope: 'all', modules: {} } },
    sx: { userId: f.userSX, tenantId: f.t1, membershipId: f.memSX, role: 'staff', permissions: { client_scope: 'all', modules: {} } },
    o2: { userId: f.userO2, tenantId: f.t2, membershipId: f.memO2, role: 'owner', permissions: null },
    o1t2: { userId: f.userO1, tenantId: f.t2, membershipId: f.memO1T2, role: 'staff', permissions: { client_scope: 'all', modules: {} } },
    ua: { userId: f.userA, tenantId: f.t1, membershipId: f.memA, role: 'client', clientId: f.clientA, permissions: null },
    ub: { userId: f.userB, tenantId: f.t1, membershipId: f.memB, role: 'client', clientId: f.clientB, permissions: null },
    uc: { userId: f.userC, tenantId: f.t2, membershipId: f.memC, role: 'client', clientId: f.clientC, permissions: null },
    memBT2: f.memBT2,
    ubT2: { userId: f.userB, tenantId: f.t2, membershipId: f.memBT2, role: 'client', clientId: f.clientD, permissions: null },
    s1MembershipId: f.memS1,
    packageT1: f.packageT1,
    packageT2: f.packageT2,
    subA: f.subA,
    subB: f.subB,
    subC: f.subC,
    templateProgram: f.templateProgram,
    copyProgram: f.copyProgram,
    publishedVersion: f.publishedVersion,
    copyVersion: f.copyVersion,
    noteA: f.noteA,
    metricA: f.metricA,
    metricB: f.metricB,
    invOwnerStaff: f.invOwnerStaff, invS1ClientA: f.invS1ClientA, invO1ClientB: f.invO1ClientB,
    payA: f.payA, payB: f.payB, payC: f.payC,
    convA: f.convA, convB: f.convB, convInternal: f.convInternal, convC: f.convC,
    mediaA: f.mediaA, mediaB: f.mediaB, mediaC: f.mediaC,
    copyProgramA2: f.copyProgramA2, copyPubA: f.copyPubA, copyDraftA2: f.copyDraftA2,
    copyProgramB: f.copyProgramB, copyPubB: f.copyPubB,
    templateForm: f.templateForm, templateFormPub: f.templateFormPub, templateFormDraft: f.templateFormDraft,
    copyFormB: f.copyFormB, copyFormBPub: f.copyFormBPub,
    planCopyA: f.planCopyA, planPubA: f.planPubA, planCopyB: f.planCopyB, planPubB: f.planPubB,
    exerciseSystem: f.exerciseSystem, exerciseT1: f.exerciseT1, exerciseT2: f.exerciseT2, foodSystem: f.foodSystem, foodT2: f.foodT2,
    eventA: f.eventA, eventB: f.eventB, notifA: f.notifA, deliveryA: f.deliveryA, notifB: f.notifB,
    consentA: f.consentA, consentB: f.consentB, consentS1: f.consentS1, taskT1: f.taskT1, taskA: f.taskA,
  };
}

/** doc §13.2: Create a fresh tenant with zero counters and a unique slug. */
export async function mkTenant(name = 'Private tenant'): Promise<string> {
  const id = randomUUID();
  await withServiceTx(id, 'security test tenant factory', async (tx) => {
    await tx.execute(sql`insert into tenants (id, name, slug) values (${id}, ${name}, ${'private-' + id})`);
  });
  return id;
}

/** doc §13.2: Create a fresh active client with a service-generated persistent code. */
export async function mkClient(tenantId: string, firstName = 'Private client'): Promise<string> {
  const id = randomUUID();
  await withServiceTx(tenantId, 'security test client factory', async (tx) => {
    const code = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${tenantId}::uuid) as code`))[0]?.code;
    if (!code) throw new Error('app.next_client_code did not return a code');
    await tx.execute(sql`insert into clients (id, tenant_id, code, first_name, status)
      values (${id}, ${tenantId}, ${code}, ${firstName}, 'active')`);
  });
  return id;
}

/** doc §13.2: Clone role/scope/assignments into a fresh actor; preset grants come from core. */
export async function mkMembership(model: AuthContext, options: {
  status?: 'active' | 'disabled' | 'invited';
  permissions?: StaffPermissions | null;
  preset?: keyof typeof PRESETS;
  assignedClientIds?: readonly string[];
} = {}): Promise<AuthContext> {
  const inherited = options.permissions === undefined ? model.permissions : options.permissions;
  let permissions: StaffPermissions | null = null;
  if (model.role === 'staff') {
    if (options.preset !== undefined) {
      permissions = permissionsFromPreset(options.preset, { client_scope: model.permissions?.client_scope ?? 'all', ...options.permissions });
    } else if (inherited !== null) {
      permissions = { ...inherited, modules: Object.fromEntries(Object.entries(inherited.modules).map(([key, actions]) => [key, [...actions]])) };
    }
  }
  const actor: AuthContext = { ...model, userId: randomUUID(), membershipId: randomUUID(), permissions };
  await withServiceTx(actor.tenantId, 'security test membership factory', async (tx) => {
    await tx.execute(sql`insert into memberships (id, tenant_id, user_id, role, status, client_id, permissions)
      values (${actor.membershipId}, ${actor.tenantId}, ${actor.userId}, ${actor.role}, ${options.status ?? 'active'},
        ${actor.clientId ?? null}, ${permissions === null ? null : JSON.stringify(permissions)}::jsonb)`);
    if (actor.role === 'staff') {
      const assigned = options.assignedClientIds ?? rows<{ client_id: string }>(await tx.execute(sql`select client_id
        from staff_client_assignments where tenant_id = ${model.tenantId} and membership_id = ${model.membershipId}`)).map((row) => row.client_id);
      for (const clientId of assigned) {
        await tx.execute(sql`insert into staff_client_assignments (tenant_id, membership_id, client_id, assigned_by)
          values (${actor.tenantId}, ${actor.membershipId}, ${clientId}, ${model.userId})`);
      }
    }
  });
  return actor;
}

/** doc §13.2: Create a fresh public, unarchived 30-day package with empty schedule rules. */
export async function mkPackage(tenantId: string): Promise<string> {
  const id = randomUUID();
  await withServiceTx(tenantId, 'security test package factory', async (tx) => {
    await tx.execute(sql`insert into packages (id, tenant_id, name, duration_days, schedule_rules, is_public, archived_at)
      values (${id}, ${tenantId}, ${JSON.stringify({ en: 'Private package' })}::jsonb, 30,
        ${JSON.stringify({ checkins: [], workouts: [] })}::jsonb, true, null)`);
  });
  return id;
}

/** doc §13.2: Create an active subscription, building omitted client/package dependencies. */
export async function mkSubscription(tenantId: string, clientId?: string, packageId?: string): Promise<string> {
  const id = randomUUID();
  const client = clientId ?? await mkClient(tenantId);
  const pack = packageId ?? await mkPackage(tenantId);
  await withServiceTx(tenantId, 'security test subscription factory', async (tx) => {
    const inserted = rows(await tx.execute(sql`insert into subscriptions
        (id, tenant_id, client_id, package_id, package_snapshot, state, starts_on, ends_on)
      select ${id}::uuid, p.tenant_id, ${client}::uuid, p.id,
        jsonb_build_object('name', p.name, 'entitlements', p.entitlements, 'scheduleRules', p.schedule_rules,
          'durationDays', p.duration_days, 'price', p.price, 'currency', p.currency),
        'active', current_date, current_date + 30
      from packages p where p.tenant_id = ${tenantId} and p.id = ${pack} returning id`));
    if (inserted.length !== 1) throw new Error('fixture package was not found in the requested tenant');
  });
  return id;
}

/** doc §13.2: Create a pending EGP 100 cash payment with fresh omitted dependencies. */
export async function mkPayment(tenantId: string, clientId?: string, subscriptionId?: string): Promise<string> {
  const id = randomUUID();
  const client = clientId ?? (subscriptionId === undefined ? await mkClient(tenantId) : await withServiceTx(tenantId, 'security test payment parent', async (tx) => {
    const parent = rows<{ client_id: string }>(await tx.execute(sql`select client_id from subscriptions
      where tenant_id = ${tenantId} and id = ${subscriptionId}`));
    if (parent.length !== 1) throw new Error('fixture subscription was not found in the requested tenant');
    return parent[0]!.client_id;
  }));
  const subscription = subscriptionId ?? await mkSubscription(tenantId, client);
  await withServiceTx(tenantId, 'security test payment factory', async (tx) => {
    await tx.execute(sql`insert into payments (id, tenant_id, client_id, subscription_id, amount, currency, method, state)
      values (${id}, ${tenantId}, ${client}, ${subscription}, 100, 'EGP', 'cash', 'pending')`);
  });
  return id;
}

/** doc §13.2: Create an independent head and v1, including every-role publication stamps. */
export async function mkVersion(tenantId: string, options: {
  family?: 'program' | 'nutrition' | 'form';
  clientId?: string | null;
  status?: 'draft' | 'published';
  publishedBy?: string;
} = {}): Promise<{ headId: string; versionId: string; clientId: string | null }> {
  const headId = randomUUID();
  const versionId = randomUUID();
  const clientId = options.clientId ?? null;
  const family = options.family ?? 'program';
  await withServiceTx(tenantId, 'security test version factory', async (tx) => {
    let foodId: string | undefined;
    if (family === 'nutrition') {
      foodId = randomUUID();
      await insertFood(tx, foodId, tenantId);
    }
    await insertHead(tx, family, headId, tenantId, clientId);
    await insertVersion(tx, family, versionId, tenantId, headId, clientId, 1, options.status ?? 'draft', options.publishedBy ?? randomUUID(), foodId);
  });
  return { headId, versionId, clientId };
}

/** doc §13.2: Create a fresh not-started session and its own published program/head. */
export async function mkSession(tenantId: string, clientId?: string): Promise<string> {
  const id = randomUUID();
  const client = clientId ?? await mkClient(tenantId);
  const version = await mkVersion(tenantId, { clientId: client, status: 'published' });
  await withServiceTx(tenantId, 'security test session factory', async (tx) => {
    await tx.execute(sql`insert into workout_sessions (id, tenant_id, client_id, program_id, program_version_id, state, local_date, timezone, client_uuid)
      values (${id}, ${tenantId}, ${client}, ${version.headId}, ${version.versionId}, 'not_started', current_date, 'Africa/Cairo', ${randomUUID()})`);
  });
  return id;
}
