import { join } from 'node:path';
import { ExerciseSeed, FoodSeed } from '@dawlyy/core/types';
import { SEED_DIR, loadJsonDir } from './load';

/**
 * Validates the system seed library (seed/exercises/*.json, seed/foods/*.json).
 * Exits 1 on any error. Prints "exercises=<n> foods=<m> errors=<k>" as the last line.
 */

/** A food is flagged when its kcal is more than 15 % away from 4·protein + 4·carbs + 9·fat. */
const KCAL_TOLERANCE = 0.15;
/**
 * Noise floor in kcal: for very low-energy foods (lettuce, tea, herbs) 15 % is a fraction of a kcal
 * and the Atwater sum is not meaningful, so a difference up to this many kcal is accepted.
 */
const KCAL_NOISE_FLOOR = 8;

function main(): void {
  const errors: string[] = [];
  const exercises: ExerciseSeed[] = [];
  const foods: FoodSeed[] = [];
  const exerciseCounts: Record<string, number> = {};
  const foodCounts: Record<string, number> = {};

  for (const { file, rows } of loadJsonDir(join(SEED_DIR, 'exercises'))) {
    rows.forEach((row, i) => {
      const parsed = ExerciseSeed.safeParse(row);
      if (!parsed.success) {
        errors.push(`exercises/${file}[${i}]: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
        return;
      }
      exercises.push(parsed.data);
      exerciseCounts[parsed.data.category] = (exerciseCounts[parsed.data.category] ?? 0) + 1;
      if (`${parsed.data.category}.json` !== file) errors.push(`exercises/${file}: ${parsed.data.slug} has category ${parsed.data.category}`);
      // The shared shape allows an empty list (coach imports fill details later); the system library does not.
      if (parsed.data.primaryMuscles.length === 0) errors.push(`exercises/${file}: ${parsed.data.slug} has no primary muscle`);
    });
  }

  for (const { file, rows } of loadJsonDir(join(SEED_DIR, 'foods'))) {
    rows.forEach((row, i) => {
      const parsed = FoodSeed.safeParse(row);
      if (!parsed.success) {
        errors.push(`foods/${file}[${i}]: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
        return;
      }
      foods.push(parsed.data);
      foodCounts[parsed.data.category] = (foodCounts[parsed.data.category] ?? 0) + 1;
      if (`${parsed.data.category}.json` !== file) errors.push(`foods/${file}: ${parsed.data.slug} has category ${parsed.data.category}`);
    });
  }

  // Duplicate slugs.
  for (const [label, items] of [['exercise', exercises], ['food', foods]] as const) {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.slug)) errors.push(`duplicate ${label} slug: ${item.slug}`);
      seen.add(item.slug);
    }
  }

  // Unknown slug references.
  const exerciseSlugs = new Set(exercises.map((e) => e.slug));
  for (const e of exercises) {
    for (const field of ['alternatives', 'progressions', 'regressions'] as const) {
      for (const ref of e[field]) {
        if (!exerciseSlugs.has(ref)) errors.push(`exercise ${e.slug}.${field}: unknown slug ${ref}`);
        if (ref === e.slug) errors.push(`exercise ${e.slug}.${field}: references itself`);
      }
    }
  }
  const foodSlugs = new Set(foods.map((f) => f.slug));
  for (const f of foods) {
    if (f.counterpartSlug !== undefined && !foodSlugs.has(f.counterpartSlug)) errors.push(`food ${f.slug}.counterpartSlug: unknown slug ${f.counterpartSlug}`);
  }

  // Energy consistency.
  for (const f of foods) {
    const { kcal, proteinG, carbsG, fatG } = f.per100;
    const atwater = 4 * proteinG + 4 * carbsG + 9 * fatG;
    const diff = Math.abs(kcal - atwater);
    const relative = atwater === 0 ? (kcal === 0 ? 0 : Infinity) : diff / atwater;
    if (relative > KCAL_TOLERANCE && diff > KCAL_NOISE_FLOOR) {
      errors.push(`food ${f.slug}: kcal ${kcal} vs 4P+4C+9F ${atwater.toFixed(1)} (${(relative * 100).toFixed(0)} % off)`);
    }
  }

  const fmt = (m: Record<string, number>) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`exercise categories: ${fmt(exerciseCounts)}`);
  console.log(`food categories: ${fmt(foodCounts)}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(`exercises=${exercises.length} foods=${foods.length} errors=${errors.length}`);
  if (errors.length > 0) process.exit(1);
}

main();
