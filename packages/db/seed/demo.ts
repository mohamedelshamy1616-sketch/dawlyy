import { and, eq, sql } from 'drizzle-orm';
import { permissionsFromPreset } from '@dawlyy/core/authz';
import { ScheduleRules } from '@dawlyy/core';
import { closeDb, withServiceTx, type Tx } from '../src/client';
import { clients, memberships, packages, programs, tenants } from '../src/schema';

// Autopilot P2.5 / doc §14: stable local-only demo identities. Keep e2e/screens.spec.ts in sync.
const DEMO_IDS = {
  tenant: 'd0250000-0000-4000-8000-000000000001',
  ownerUser: 'd0250000-0000-4000-8000-000000000101',
  staffUser: 'd0250000-0000-4000-8000-000000000102',
  firstClientUser: 'd0250000-0000-4000-8000-000000000103',
  secondClientUser: 'd0250000-0000-4000-8000-000000000104',
  thirdClientUser: 'd0250000-0000-4000-8000-000000000105',
  ownerMembership: 'd0250000-0000-4000-8000-000000000201',
  staffMembership: 'd0250000-0000-4000-8000-000000000202',
  firstClientMembership: 'd0250000-0000-4000-8000-000000000203',
  secondClientMembership: 'd0250000-0000-4000-8000-000000000204',
  thirdClientMembership: 'd0250000-0000-4000-8000-000000000205',
  firstClient: 'd0250000-0000-4000-8000-000000000301',
  secondClient: 'd0250000-0000-4000-8000-000000000302',
  thirdClient: 'd0250000-0000-4000-8000-000000000303',
  package: 'd0250000-0000-4000-8000-000000000401',
  program: 'd0250000-0000-4000-8000-000000000501',
} as const;

const DEMO_CLIENTS = [
  { id: DEMO_IDS.firstClient, userId: DEMO_IDS.firstClientUser, membershipId: DEMO_IDS.firstClientMembership,
    firstName: 'أحمد', lastName: 'حسن', displayName: 'أحمد حسن' },
  { id: DEMO_IDS.secondClient, userId: DEMO_IDS.secondClientUser, membershipId: DEMO_IDS.secondClientMembership,
    firstName: 'سارة', lastName: 'علي', displayName: 'سارة علي' },
  { id: DEMO_IDS.thirdClient, userId: DEMO_IDS.thirdClientUser, membershipId: DEMO_IDS.thirdClientMembership,
    firstName: 'محمود', lastName: 'عادل', displayName: 'محمود عادل' },
] as const;

// doc §14: privileged reads include the tenant; identity collisions fail instead of repurposing a row.
async function insertMembershipIfMissing(
  tx: Tx,
  values: typeof memberships.$inferInsert & { id: string; tenantId: typeof DEMO_IDS.tenant },
): Promise<void> {
  const [existing] = await tx.select({ userId: memberships.userId, role: memberships.role, clientId: memberships.clientId })
    .from(memberships)
    .where(and(eq(memberships.tenantId, DEMO_IDS.tenant), eq(memberships.id, values.id)))
    .limit(1);
  if (existing) {
    if (existing.userId !== values.userId || existing.role !== values.role || existing.clientId !== (values.clientId ?? null)) {
      throw new Error('Demo membership identity conflicts with an existing row; nothing was changed.');
    }
    return;
  }
  await tx.insert(memberships).values(values);
}

async function main(): Promise<void> {
  // seed/index.ts has an unexported, self-running main and closes the pools at import time.
  // Run it first, then this file (tools/start_preview.ps1 does both in order).
  await withServiceTx(null, 'seed:demo', async (tx) => {
    const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants)
      .where(eq(tenants.id, DEMO_IDS.tenant)).limit(1);
    if (tenant && tenant.slug !== 'demo-coach') {
      throw new Error('Demo tenant ID belongs to another slug; nothing was changed.');
    }
    if (!tenant) {
      await tx.insert(tenants).values({
        id: DEMO_IDS.tenant,
        name: 'Demo Coaching',
        slug: 'demo-coach',
        defaultLocale: 'ar',
        timezone: 'Africa/Cairo',
        currency: 'EGP',
      });
    }

    await insertMembershipIfMissing(tx, {
      id: DEMO_IDS.ownerMembership, tenantId: DEMO_IDS.tenant, userId: DEMO_IDS.ownerUser,
      role: 'owner', status: 'active', displayName: 'كابتن محمد', locale: 'ar', clientId: null, permissions: null,
    });
    await insertMembershipIfMissing(tx, {
      id: DEMO_IDS.staffMembership, tenantId: DEMO_IDS.tenant, userId: DEMO_IDS.staffUser,
      role: 'staff', status: 'active', displayName: 'كابتن منى', locale: 'ar', clientId: null,
      permissions: permissionsFromPreset('coach', { client_scope: 'all' }),
    });

    for (const client of DEMO_CLIENTS) {
      const [existing] = await tx.select({ id: clients.id }).from(clients)
        .where(and(eq(clients.tenantId, DEMO_IDS.tenant), eq(clients.id, client.id))).limit(1);
      if (!existing) {
        // doc §7.7 / §13.2 fixtures: generate a persistent code only for a genuinely new client.
        const [generated] = await tx.execute<{ code: string }>(sql`select app.next_client_code(${DEMO_IDS.tenant}::uuid) as code`);
        if (!generated?.code) throw new Error('app.next_client_code did not return a demo client code.');
        await tx.insert(clients).values({
          id: client.id, tenantId: DEMO_IDS.tenant, code: generated.code,
          membershipId: client.membershipId, firstName: client.firstName, lastName: client.lastName,
          displayName: client.displayName, locale: 'ar', timezone: 'Africa/Cairo', status: 'active',
        });
      }
      await insertMembershipIfMissing(tx, {
        id: client.membershipId, tenantId: DEMO_IDS.tenant, userId: client.userId,
        role: 'client', status: 'active', clientId: client.id, displayName: client.displayName,
        locale: 'ar', permissions: null,
      });
    }

    const [demoPackage] = await tx.select({ id: packages.id }).from(packages)
      .where(and(eq(packages.tenantId, DEMO_IDS.tenant), eq(packages.id, DEMO_IDS.package))).limit(1);
    if (!demoPackage) {
      await tx.insert(packages).values({
        id: DEMO_IDS.package, tenantId: DEMO_IDS.tenant,
        name: { ar: 'باقة التجربة', en: 'Demo package' }, durationDays: 30,
        scheduleRules: ScheduleRules.parse({}), isPublic: true, archivedAt: null,
      });
    }

    const [demoProgram] = await tx.select({ id: programs.id }).from(programs)
      .where(and(eq(programs.tenantId, DEMO_IDS.tenant), eq(programs.id, DEMO_IDS.program))).limit(1);
    if (!demoProgram) {
      // doc §7.3 / P2.5: an unpublished template head, with no version or client assignment yet.
      await tx.insert(programs).values({
        id: DEMO_IDS.program, tenantId: DEMO_IDS.tenant,
        name: { ar: 'برنامج التجربة', en: 'Demo program' }, kind: 'template', clientId: null,
        createdBy: DEMO_IDS.ownerUser,
      });
    }
  });
  console.log('demo-coach ready: 1 owner, 1 staff (coach/all), 3 clients with active memberships, 1 package, 1 unpublished program head; existing rows preserved.');
}

main().catch((error: unknown) => {
  // Print only the Postgres error code and message, never the error object: connection details can carry credentials.
  const e = error as { code?: unknown; message?: unknown };
  const detail = [typeof e.code === 'string' ? e.code : '', typeof e.message === 'string' ? e.message.slice(0, 300) : '']
    .filter(Boolean).join(' ');
  console.error(`Demo seed failed; its transaction was rolled back. Check migrations and the demo IDs. ${detail}`);
  process.exitCode = 1;
}).finally(() => closeDb());
