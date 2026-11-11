import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../src/client';
import { exercises, foods, packages } from '../../src/schema';
import { DEMO_IDS as I } from './ids';
import type { Demo } from './model';

/** doc §7.6 / Task 12: resolve shared system rows by slug; never copy the system library into the demo tenant. */
export async function loadDemoLibrary(tx: Tx) {
  const exerciseRows = await tx.select().from(exercises).where(isNull(exercises.tenantId));
  const foodRows = await tx.select().from(foods).where(isNull(foods.tenantId));
  if (exerciseRows.length < 200 || foodRows.length < 300) throw new Error('Run the system library seed before seed:demo (at least 200 exercises / 300 foods required).');
  for (const rows of [exerciseRows, foodRows]) {
    if (new Set(rows.map(row => row.slug)).size !== rows.length) throw new Error('Duplicate system slugs; repair the system library before seeding demo.');
  }
  return { exercises: new Map(exerciseRows.map(row => [row.slug, row.id])), foods: new Map(foodRows.map(row => [row.slug, row])) };
}

/** doc §8, §14 / Task 12: three priced packages, upgrading only the untouched P2.5 zero-price placeholder. */
export async function seedCatalog(tx: Tx, demo: Demo): Promise<void> {
  for (const [index, pack] of demo.packages.entries()) {
    const where = and(eq(packages.tenantId, I.tenant), eq(packages.id, pack.id));
    const [existing] = await tx.select().from(packages).where(where).limit(1);
    const values = { ...pack, tenantId: I.tenant, currency: 'EGP', isPublic: true, sortOrder: index, createdBy: I.ownerUser };
    if (!existing) await tx.insert(packages).values({ ...values, createdAt: demo.now });
    else if (pack.id === I.package && existing.price === 0 && existing.entitlements.length === 0
      && existing.durationDays === 30 && existing.updatedAt === null && existing.name.en === 'Demo package') {
      await tx.update(packages).set({ ...values, updatedAt: demo.now }).where(where);
    }
  }
}
