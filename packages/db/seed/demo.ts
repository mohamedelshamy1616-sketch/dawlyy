import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { closeDb, withServiceTx } from '../src/client';
import { subscriptions } from '../src/schema';
import { DEMO_IDS as I, demoId } from './demo/ids';
import { assertLocalDatabase } from './demo/helpers';
import { buildDemo } from './demo/model';
import { seedPeople } from './demo/people';
import { loadDemoLibrary, seedCatalog } from './demo/catalog';
import { seedBilling, seedCalendar } from './demo/billing';
import { seedProgramsNutrition } from './demo/programs-nutrition';
import { seedForms } from './demo/forms';
import { seedTracking } from './demo/tracking';
import { seedActivity } from './demo/activity';

/** doc §14 / Task 12: retain the original public demo identity import path. */
export { DEMO_IDS } from './demo/ids';

/** doc §14 / Task 12: atomic local seed; imports are inert and reruns retain the fixture clock and operator edits. */
export async function seedDemo(now: Date = new Date()): Promise<void> {
  assertLocalDatabase();
  await withServiceTx(I.tenant, 'seed:demo full coaching business', async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`seed:demo:${I.tenant}`}::text, 0))`);
    const [existing] = await tx.select({ createdAt: subscriptions.createdAt }).from(subscriptions)
      .where(and(eq(subscriptions.tenantId, I.tenant), eq(subscriptions.id, demoId(`subscription:${I.firstClient}`)))).limit(1);
    const demo = buildDemo(existing?.createdAt ?? now);
    // index.ts is a self-running CLI which closes pools. Run the system seed first; never import it here.
    const library = await loadDemoLibrary(tx);
    await seedPeople(tx, demo);
    await seedCatalog(tx, demo);
    await seedBilling(tx, demo);
    await seedCalendar(tx, demo);
    await seedProgramsNutrition(tx, demo, library);
    await seedForms(tx, demo);
    await seedTracking(tx, demo);
    await seedActivity(tx, demo);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  seedDemo().then(() => {
    console.log('demo-coach: 1 owner, 1 staff, 8 clients, 3 packages, published workout/nutrition/form templates and coaching history. Existing demo rows preserved.');
  }).catch((error: unknown) => {
    // Never print raw driver errors or connection URLs.
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'unknown';
    console.error(`Demo seed rolled back (${code}). Check local database, migrations, system seed and demo identity conflicts.`);
    process.exitCode = 1;
  }).finally(() => closeDb());
}
