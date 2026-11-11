import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { closeDb, withErasureTx } from '../src/client';
import * as s from '../src/schema';
import { DEMO_IDS as I } from './demo/ids';
import { assertLocalDatabase } from './demo/helpers';

/** doc §7.9, §12.1(7) / Task 12: reset only demo-coach in a local scratch database, through the service erasure path. */
export async function resetDemo(): Promise<void> {
  assertLocalDatabase();
  await withErasureTx(I.tenant, 'reset local scratch demo-coach', async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`seed:demo:${I.tenant}`}::text, 0))`);
    const [tenant] = await tx.select({ slug: s.tenants.slug }).from(s.tenants).where(eq(s.tenants.id, I.tenant)).limit(1).for('update');
    if (!tenant) return;
    if (tenant.slug !== 'demo-coach') throw new Error('Refusing reset: demo UUID does not belong to demo-coach.');
    for (const table of [s.notificationDeliveries, s.notifications, s.pushSubscriptions, s.idempotencyKeys,
      s.messageRevisions, s.messages, s.conversations, s.setLogs, s.workoutSessions, s.mealLogs, s.supplementLogs,
      s.formSubmissions, s.progressPhotoSets, s.measurementSets, s.inbodyRecords, s.metricEntries,
      s.payments, s.calendarEvents, s.subscriptionEvents, s.clientEntitlementOverrides]) {
      await tx.execute(sql`delete from ${table} where tenant_id = ${I.tenant}::uuid`);
    }
    // Heads and versions refer to each other. Clear pointers, erase versions under app.erasure, then client copies.
    for (const table of [s.programs, s.nutritionPlans, s.forms]) {
      await tx.execute(sql`update ${table} set current_version_id = null, published_version_id = null where tenant_id = ${I.tenant}::uuid`);
    }
    for (const table of [s.programVersions, s.nutritionPlanVersions, s.formVersions]) {
      await tx.execute(sql`delete from ${table} where tenant_id = ${I.tenant}::uuid`);
    }
    for (const table of [s.programs, s.nutritionPlans, s.forms]) {
      await tx.execute(sql`delete from ${table} where tenant_id = ${I.tenant}::uuid and kind = 'client'`);
      await tx.execute(sql`delete from ${table} where tenant_id = ${I.tenant}::uuid`);
    }
    for (const table of [s.tasks, s.aiRequests, s.clientFlags, s.clientNotes, s.invitations, s.staffClientAssignments,
      s.tenantHiddenItems, s.exercises, s.foods, s.media, s.subscriptions, s.packages,
      s.consents, s.userPreferences, s.businessSettings, s.memberships, s.clients]) {
      await tx.execute(sql`delete from ${table} where tenant_id = ${I.tenant}::uuid`);
    }
    // Sweep FK-free tables too: job_runs, idempotency_keys, audit_log, events (doc §7.9).
    await tx.execute(sql`select app.close_tenant(${I.tenant}::uuid)`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  resetDemo().then(() => console.log('Local demo-coach tenant reset; shared system library retained.')).catch(() => {
    console.error('Demo reset rolled back. Check local URL restrictions, demo-coach identity and migration erasure guards.');
    process.exitCode = 1;
  }).finally(() => closeDb());
}
