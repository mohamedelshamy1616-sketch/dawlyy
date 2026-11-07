import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { withServiceTx, type AuthContext } from '../src/client';

/** Minimal .env reader (no dotenv dependency). Existing process variables win. */
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

/** postgres-js through drizzle returns the row array itself. */
export function rows<T = Record<string, unknown>>(result: unknown): T[] {
  return result as unknown as T[];
}

/** SQLSTATE of a failed query, whether drizzle wrapped the driver error or not. */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export type Fixture = {
  t1: string;
  t2: string;
  clientA: string;
  clientB: string;
  clientC: string;
  /** Auth contexts. */
  o1: AuthContext;
  s1: AuthContext;
  ua: AuthContext;
  ub: AuthContext;
  uc: AuthContext;
  /** Row ids. */
  s1MembershipId: string;
  packageT1: string;
  packageT2: string;
  templateProgram: string;
  copyProgram: string;
  publishedVersion: string;
  noteA: string;
  metricA: string;
  metricB: string;
};

const SERVICE_TABLES = 'tenants, audit_log';

/** Remove everything the suite created. TRUNCATE ... CASCADE follows the tenant foreign keys. */
export async function truncateAll(): Promise<void> {
  await withServiceTx(null, 'rls test cleanup', async (tx) => {
    await tx.execute(sql`set local client_min_messages = warning`);
    await tx.execute(sql.raw(`truncate table ${SERVICE_TABLES} restart identity cascade`));
  });
}

export async function buildFixture(): Promise<Fixture> {
  await truncateAll();

  const suffix = randomUUID().slice(0, 8);
  const f = {
    t1: randomUUID(),
    t2: randomUUID(),
    clientA: randomUUID(),
    clientB: randomUUID(),
    clientC: randomUUID(),
    userO1: randomUUID(),
    userS1: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    userC: randomUUID(),
    memO1: randomUUID(),
    memS1: randomUUID(),
    memA: randomUUID(),
    memB: randomUUID(),
    memC: randomUUID(),
    packageT1: randomUUID(),
    packageT2: randomUUID(),
    templateProgram: randomUUID(),
    copyProgram: randomUUID(),
    publishedVersion: randomUUID(),
    copyVersion: randomUUID(),
    noteA: randomUUID(),
    metricA: randomUUID(),
    metricB: randomUUID(),
  };

  const schedule = JSON.stringify({ checkins: [], workouts: [] });
  const snapshot = (name: string) =>
    JSON.stringify({ name: { en: name }, entitlements: [], scheduleRules: {}, durationDays: 30, price: 0, currency: 'EGP' });

  await withServiceTx(null, 'rls test fixture', async (tx) => {
    await tx.execute(sql`insert into tenants (id, name, slug) values
      (${f.t1}, 'Tenant One', ${'rls-t1-' + suffix}),
      (${f.t2}, 'Tenant Two', ${'rls-t2-' + suffix})`);

    // Persistent client codes come from the database function, as in production.
    const codeA = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t1}::uuid) as code`))[0]!.code;
    const codeB = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t1}::uuid) as code`))[0]!.code;
    const codeC = rows<{ code: string }>(await tx.execute(sql`select app.next_client_code(${f.t2}::uuid) as code`))[0]!.code;

    await tx.execute(sql`insert into clients (id, tenant_id, code, first_name, status) values
      (${f.clientA}, ${f.t1}, ${codeA}, 'Client A', 'active'),
      (${f.clientB}, ${f.t1}, ${codeB}, 'Client B', 'active'),
      (${f.clientC}, ${f.t2}, ${codeC}, 'Client C', 'active')`);

    const staffPermissions = JSON.stringify({ client_scope: 'assigned', modules: {} });
    await tx.execute(sql`insert into memberships (id, tenant_id, user_id, role, status, client_id, permissions) values
      (${f.memO1}, ${f.t1}, ${f.userO1}, 'owner', 'active', null, null),
      (${f.memS1}, ${f.t1}, ${f.userS1}, 'staff', 'active', null, ${staffPermissions}::jsonb),
      (${f.memA}, ${f.t1}, ${f.userA}, 'client', 'active', ${f.clientA}, null),
      (${f.memB}, ${f.t1}, ${f.userB}, 'client', 'active', ${f.clientB}, null),
      (${f.memC}, ${f.t2}, ${f.userC}, 'client', 'active', ${f.clientC}, null)`);

    await tx.execute(sql`insert into staff_client_assignments (tenant_id, membership_id, client_id)
      values (${f.t1}, ${f.memS1}, ${f.clientA})`);

    await tx.execute(sql`insert into packages (id, tenant_id, name, duration_days, schedule_rules) values
      (${f.packageT1}, ${f.t1}, ${JSON.stringify({ en: 'Package T1' })}::jsonb, 30, ${schedule}::jsonb),
      (${f.packageT2}, ${f.t2}, ${JSON.stringify({ en: 'Package T2' })}::jsonb, 30, ${schedule}::jsonb)`);

    await tx.execute(sql`insert into subscriptions (tenant_id, client_id, package_id, package_snapshot, state, starts_on, ends_on) values
      (${f.t1}, ${f.clientA}, ${f.packageT1}, ${snapshot('Package T1')}::jsonb, 'active', current_date, current_date + 30),
      (${f.t1}, ${f.clientB}, ${f.packageT1}, ${snapshot('Package T1')}::jsonb, 'active', current_date, current_date + 30),
      (${f.t2}, ${f.clientC}, ${f.packageT2}, ${snapshot('Package T2')}::jsonb, 'active', current_date, current_date + 30)`);

    // Template (client_id null) with one published version, plus a client copy for A.
    await tx.execute(sql`insert into programs (id, tenant_id, name, kind, client_id) values
      (${f.templateProgram}, ${f.t1}, ${JSON.stringify({ en: 'Template' })}::jsonb, 'template', null)`);
    await tx.execute(sql`insert into programs (id, tenant_id, name, kind, template_id, client_id) values
      (${f.copyProgram}, ${f.t1}, ${JSON.stringify({ en: 'Copy for A' })}::jsonb, 'client', ${f.templateProgram}, ${f.clientA})`);
    await tx.execute(sql`insert into program_versions (id, tenant_id, program_id, client_id, version_no, status, document, published_at, published_by) values
      (${f.publishedVersion}, ${f.t1}, ${f.templateProgram}, null, 1, 'published', ${JSON.stringify({ weeks: [] })}::jsonb, now(), ${f.userO1}),
      (${f.copyVersion}, ${f.t1}, ${f.copyProgram}, ${f.clientA}, 1, 'draft', ${JSON.stringify({ weeks: [] })}::jsonb, null, null)`);

    await tx.execute(sql`insert into client_notes (id, tenant_id, client_id, body, author_user_id)
      values (${f.noteA}, ${f.t1}, ${f.clientA}, 'private coach note about A', ${f.userO1})`);

    await tx.execute(sql`insert into metric_entries (id, tenant_id, client_id, metric, value, unit, recorded_at, local_date, timezone, client_uuid) values
      (${f.metricA}, ${f.t1}, ${f.clientA}, 'weight', 80, 'kg', now(), current_date, 'Africa/Cairo', ${randomUUID()}),
      (${f.metricB}, ${f.t1}, ${f.clientB}, 'weight', 70, 'kg', now(), current_date, 'Africa/Cairo', ${randomUUID()})`);
  });

  return {
    t1: f.t1,
    t2: f.t2,
    clientA: f.clientA,
    clientB: f.clientB,
    clientC: f.clientC,
    o1: { userId: f.userO1, tenantId: f.t1, membershipId: f.memO1, role: 'owner' },
    s1: { userId: f.userS1, tenantId: f.t1, membershipId: f.memS1, role: 'staff' },
    ua: { userId: f.userA, tenantId: f.t1, membershipId: f.memA, role: 'client', clientId: f.clientA },
    ub: { userId: f.userB, tenantId: f.t1, membershipId: f.memB, role: 'client', clientId: f.clientB },
    uc: { userId: f.userC, tenantId: f.t2, membershipId: f.memC, role: 'client', clientId: f.clientC },
    s1MembershipId: f.memS1,
    packageT1: f.packageT1,
    packageT2: f.packageT2,
    templateProgram: f.templateProgram,
    copyProgram: f.copyProgram,
    publishedVersion: f.publishedVersion,
    noteA: f.noteA,
    metricA: f.metricA,
    metricB: f.metricB,
  };
}
