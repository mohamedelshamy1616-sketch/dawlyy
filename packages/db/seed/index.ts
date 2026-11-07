import { join } from 'node:path';
import { and, inArray, isNull, eq } from 'drizzle-orm';
import { ExerciseSeed, FoodSeed } from '@dawlyy/core/types';
import { closeDb, withServiceTx, type Tx } from '../src/client';
import { exercises, foods } from '../src/schema';
import { SEED_DIR, loadJsonDir } from './load';

/**
 * Seeds the system library (tenant_id null): exercises and foods from seed/exercises and seed/foods.
 *
 * Idempotent. The unique indexes are on (tenant_id, slug) and Postgres treats NULLs as distinct, so
 * `ON CONFLICT (tenant_id, slug)` never fires for system rows. Instead the existing system slugs are
 * read first, then known slugs are updated by id and unknown slugs are inserted. Re-running changes
 * nothing except `updated_at` on rows whose content is rewritten.
 */

const CHUNK = 100;

function parseAll<T>(dir: string, schema: { parse: (row: unknown) => T }): T[] {
  const out: T[] = [];
  for (const { file, rows } of loadJsonDir(join(SEED_DIR, dir))) {
    rows.forEach((row, i) => {
      try {
        out.push(schema.parse(row));
      } catch (err) {
        throw new Error(`${dir}/${file}[${i}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
  return out;
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

async function seedExercises(tx: Tx, items: ExerciseSeed[]): Promise<{ inserted: number; updated: number }> {
  const existing = new Map<string, string>();
  for (const part of chunks(items)) {
    const rows = await tx
      .select({ id: exercises.id, slug: exercises.slug })
      .from(exercises)
      .where(and(isNull(exercises.tenantId), inArray(exercises.slug, part.map((e) => e.slug))));
    for (const r of rows) existing.set(r.slug, r.id);
  }
  const toInsert: (typeof exercises.$inferInsert)[] = [];
  let updated = 0;
  for (const e of items) {
    const values = {
      slug: e.slug,
      name: e.name,
      aliases: e.aliases,
      category: e.category,
      primaryMuscles: e.primaryMuscles,
      secondaryMuscles: e.secondaryMuscles,
      movementPattern: e.movementPattern,
      equipment: e.equipment,
      difficulty: e.difficulty,
      unilateral: e.unilateral,
      compound: e.compound,
      plane: e.plane,
      cues: e.cues,
      commonMistakes: e.commonMistakes,
      contraindications: e.contraindications,
      progressions: e.progressions,
      regressions: e.regressions,
      alternatives: e.alternatives,
      tags: e.tags,
      videoUrl: e.videoUrl ?? null,
      source: 'system',
      hidden: false,
    } satisfies Omit<typeof exercises.$inferInsert, 'tenantId'>;
    const id = existing.get(e.slug);
    if (id) {
      await tx.update(exercises).set({ ...values, updatedAt: new Date() }).where(eq(exercises.id, id));
      updated += 1;
    } else {
      toInsert.push({ ...values, tenantId: null });
    }
  }
  for (const part of chunks(toInsert)) await tx.insert(exercises).values(part);
  return { inserted: toInsert.length, updated };
}

async function seedFoods(tx: Tx, items: FoodSeed[]): Promise<{ inserted: number; updated: number }> {
  const existing = new Map<string, string>();
  for (const part of chunks(items)) {
    const rows = await tx
      .select({ id: foods.id, slug: foods.slug })
      .from(foods)
      .where(and(isNull(foods.tenantId), inArray(foods.slug, part.map((f) => f.slug))));
    for (const r of rows) existing.set(r.slug, r.id);
  }
  const toInsert: (typeof foods.$inferInsert)[] = [];
  let updated = 0;
  for (const f of items) {
    const values = {
      slug: f.slug,
      name: f.name,
      aliases: f.aliases,
      category: f.category,
      per100: f.per100,
      micronutrients: f.micronutrients ?? null,
      rawOrCooked: f.rawOrCooked ?? null,
      counterpartSlug: f.counterpartSlug ?? null,
      cookedYield: f.cookedYield ?? null,
      measures: f.measures,
      source: f.source,
      brand: f.brand ?? null,
      tags: f.tags,
      hidden: false,
    } satisfies Omit<typeof foods.$inferInsert, 'tenantId'>;
    const id = existing.get(f.slug);
    if (id) {
      await tx.update(foods).set({ ...values, updatedAt: new Date() }).where(eq(foods.id, id));
      updated += 1;
    } else {
      toInsert.push({ ...values, tenantId: null });
    }
  }
  for (const part of chunks(toInsert)) await tx.insert(foods).values(part);
  return { inserted: toInsert.length, updated };
}

async function main(): Promise<void> {
  const exerciseItems = parseAll('exercises', ExerciseSeed);
  const foodItems = parseAll('foods', FoodSeed);
  const result = await withServiceTx(null, 'seed:system-library', async (tx) => ({
    exercises: await seedExercises(tx, exerciseItems),
    foods: await seedFoods(tx, foodItems),
  }));
  console.log(
    `seeded exercises inserted=${result.exercises.inserted} updated=${result.exercises.updated}; foods inserted=${result.foods.inserted} updated=${result.foods.updated}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
