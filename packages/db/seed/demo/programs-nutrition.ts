import { and, eq } from 'drizzle-orm';
import { ProgramDocument, NutritionDocument, type Macros, type Workout } from '@dawlyy/core/types';
import { addMacros, scaleMacros } from '@dawlyy/core/nutrition';
import { validateProgram } from '@dawlyy/core/program-edit';
import type { Tx } from '../../src/client';
import { nutritionPlans, nutritionPlanVersions, programs, programVersions } from '../../src/schema';
import { DEMO_IDS as I, demoId } from './ids';
import { DEMO_CLIENTS, type Demo } from './model';
import { exists } from './helpers';
import type { loadDemoLibrary } from './catalog';

type Food = { id: string; per100: Macros };

/** doc §7.3, §12.1(3) / Task 12: validated strength/fat-loss documents referencing real system-library IDs. */
export function buildDocuments(exerciseIds: ReadonlyMap<string, string>, foodRows: ReadonlyMap<string, Food>) {
  const exercise = (slug: string) => {
    const id = exerciseIds.get(slug);
    if (!id) throw new Error(`System exercise missing: ${slug}`);
    return id;
  };
  function workout(key: string, name: string, slugs: string[], cardio = false): Workout {
    return { id: demoId(`workout:${key}`), name: { ar: name }, estimatedMinutes: cardio ? 50 : 60,
      blocks: [
        { id: demoId(`warmup:${key}`), kind: 'warmup', name: { ar: 'تسخين خفيف' }, items: [{ id: demoId(`warmup-item:${key}`),
          exerciseId: exercise('stationary-bike'), order: 0, sets: [{ setNo: 1, durationSec: 300 }] }] },
        { id: demoId(`main:${key}`), kind: 'main', name: { ar: 'التمارين الأساسية' }, items: slugs.map((slug, order) => ({
          id: demoId(`item:${key}:${slug}`), exerciseId: exercise(slug), order,
          sets: [1, 2, 3].map(setNo => ({ setNo, reps: '8-12', restSec: 90, rir: 2 })),
          progressionRule: { type: 'load', threshold: 12, step: 2.5 }, coachNote: { ar: 'سيب عدتين في الخزان وحافظ على الحركة' },
        })) },
        ...(cardio ? [{ id: demoId(`cardio:${key}`), kind: 'cardio' as const, name: { ar: 'مشي سريع بعد التمرين' },
          items: [{ id: demoId(`cardio-item:${key}`), exerciseId: exercise('treadmill-incline-walk'), order: 0,
            sets: [{ setNo: 1, durationSec: 1200, rpe: 6 }] }] }] : []),
      ], note: { ar: 'لو فيه ألم وقف التمرين وابعت للكابتن' } };
  }
  const upper = workout('upper', 'الجزء العلوي', ['bench-press-barbell', 'seated-cable-row', 'lat-pulldown', 'dumbbell-bench-press']);
  const lower = workout('lower', 'الرجلين', ['back-squat', 'leg-press', 'walking-lunge']);
  const fullA = workout('fat-a', 'جسم كامل أ', ['goblet-squat', 'chest-press-machine', 'seated-cable-row'], true);
  const fullB = workout('fat-b', 'جسم كامل ب', ['leg-press', 'lat-pulldown', 'incline-push-up'], true);
  function program(key: string, strength: boolean) {
    const training: Record<number, Workout> = strength ? { 0: upper, 1: lower, 3: upper, 4: lower } : { 0: fullA, 2: fullB, 4: fullA };
    function copyWorkout(source: Workout, week: number, day: number): Workout {
      const prefix = `${key}:${week}:${day}`;
      return { ...source, id: demoId(`workout-copy:${prefix}`), blocks: source.blocks.map((block, bi) => ({ ...block,
        id: demoId(`block-copy:${prefix}:${bi}`), items: block.items.map((item, ii) => ({ ...item, id: demoId(`item-copy:${prefix}:${bi}:${ii}`) })) })) };
    }
    const document = ProgramDocument.parse({ schemaVersion: 1, phases: [{ id: demoId(`phase:${key}`), name: { ar: strength ? 'تأسيس القوة' : 'نزول دهون ولياقة' },
      weeks: Array.from({ length: 4 }, (_, week) => ({ id: demoId(`week:${key}:${week}`), index: week,
        days: Array.from({ length: 7 }, (_, day) => ({ id: demoId(`day:${key}:${week}:${day}`), index: day,
          kind: training[day] ? 'training' : 'rest', ...(training[day] ? { workout: copyWorkout(training[day]!, week, day) } : { note: { ar: 'راحة ومشي خفيف على قد طاقتك' } }) })) })) }],
      notes: { ar: strength ? '٤ أيام في الأسبوع. سجّل الوزن والعدات بعد كل مجموعة.' : '٣ أيام مقاومة ومعاهم مشي سريع. التدرج حسب قدرتك.' } });
    if (validateProgram(document, { knownExerciseIds: new Set(exerciseIds.values()) }).length) throw new Error('Invalid demo program prescription.');
    return document;
  }
  function diet(key: string, factor: number) {
    const meals = [
      { name: 'الفطار', foods: [['egg-boiled', 100], ['oats-raw', 60], ['banana', 120]] as const },
      { name: 'الغدا', foods: [['chicken-breast-cooked', 180], ['rice-white-cooked', 220], ['tomato', 150], ['olive-oil', 10]] as const },
      { name: 'العشا', foods: [['cottage-cheese-qareesh', 200], ['potato-boiled', 250], ['cucumber', 150], ['olive-oil', 10]] as const },
    ].map((meal, index) => {
      const items = meal.foods.map(([slug, grams], i) => {
        const food = foodRows.get(slug);
        if (!food) throw new Error(`System food missing: ${slug}`);
        return { id: demoId(`meal-item:${key}:${index}:${i}`), foodId: food.id, quantity: Math.round(grams * factor),
          grams: Math.round(grams * factor), measure: { kind: 'g' as const }, approx: false };
      });
      const macros = addMacros(...meal.foods.map(([slug, grams]) => scaleMacros(foodRows.get(slug)!.per100, Math.round(grams * factor) / 100)));
      return { id: demoId(`meal:${key}:${index}`), name: { ar: meal.name },
        options: [{ id: demoId(`meal-option:${key}:${index}`), name: { ar: 'الاختيار الأساسي' }, items, macros }] };
    });
    const total = addMacros(...meals.map(m => m.options[0]!.macros));
    return NutritionDocument.parse({ schemaVersion: 1, targets: { ...total, waterMl: 2500, steps: 8000 }, meals, supplements: [],
      freeMealRule: { perWeek: 1, note: { ar: 'وجبة بتحبها من غير ما تحول اليوم كله لفري' } },
      instructions: { ar: 'الأوزان بالجرام. الرز والفراخ والبطاطس بعد التسوية، والشوفان قبل التسوية. القيم تقديرية من مكتبة الأكل.' } });
  }
  return { programs: [program('strength', true), program('fat-loss', false)], diets: [diet('strength', 1.25), diet('fat-loss', 1)] };
}

/** doc §7.1–§7.3, §12.1(5) / Task 12: publish two template pairs and distinct client copies; pointers come from triggers. */
export async function seedProgramsNutrition(tx: Tx, demo: Demo, library: Awaited<ReturnType<typeof loadDemoLibrary>>): Promise<void> {
  const documents = buildDocuments(library.exercises, library.foods);
  const publishedAt = new Date(`${demo.subscriptions[0]!.startsOn}T00:00:00Z`);
  const definitions = [
    { program: I.program, version: I.strengthVersion, diet: I.strengthDiet, dietVersion: I.strengthDietVersion, title: 'قوة — علوي وسفلي' },
    { program: I.fatLossProgram, version: I.fatLossVersion, diet: I.fatLossDiet, dietVersion: I.fatLossDietVersion, title: 'نزول دهون — مقاومة وكارديو' },
  ];
  for (const [index, def] of definitions.entries()) {
    if (!await exists(tx, programs, def.program)) await tx.insert(programs).values({ id: def.program, tenantId: I.tenant,
      name: { ar: def.title }, kind: 'template', createdBy: I.ownerUser, createdAt: publishedAt });
    if (!await exists(tx, programVersions, def.version)) {
      const [head] = await tx.select().from(programs).where(and(eq(programs.tenantId, I.tenant), eq(programs.id, def.program))).limit(1);
      const other = await tx.select({ id: programVersions.id }).from(programVersions)
        .where(and(eq(programVersions.tenantId, I.tenant), eq(programVersions.programId, def.program))).limit(1);
      // The old demo head had no versions. Preserve any versions an operator has since authored.
      if (other.length || !head || head.kind !== 'template') throw new Error('Demo program has operator-authored versions; reset a scratch demo before adding fixtures.');
      await tx.insert(programVersions).values({ id: def.version, tenantId: I.tenant, programId: def.program, versionNo: 1,
        status: 'published', document: documents.programs[index]!, publishedAt, publishedBy: I.ownerUser, createdBy: I.ownerUser, createdAt: publishedAt });
      await tx.update(programs).set({ currentVersionId: def.version }).where(and(eq(programs.tenantId, I.tenant), eq(programs.id, def.program)));
    }
    if (!await exists(tx, nutritionPlans, def.diet)) await tx.insert(nutritionPlans).values({ id: def.diet, tenantId: I.tenant,
      kind: 'template', name: { ar: index === 0 ? 'أكل متوازن لبناء العضل' : 'أكل متوازن لنزول الدهون' }, createdBy: I.ownerUser, createdAt: publishedAt });
    if (!await exists(tx, nutritionPlanVersions, def.dietVersion)) {
      await tx.insert(nutritionPlanVersions).values({ id: def.dietVersion, tenantId: I.tenant, planId: def.diet, versionNo: 1,
        status: 'published', document: documents.diets[index]!, publishedAt, publishedBy: I.ownerUser, createdBy: I.ownerUser, createdAt: publishedAt });
      await tx.update(nutritionPlans).set({ currentVersionId: def.dietVersion }).where(and(eq(nutritionPlans.tenantId, I.tenant), eq(nutritionPlans.id, def.diet)));
    }
  }
  for (const index of [0, 1, 2, 4, 6, 7]) {
    const client = DEMO_CLIENTS[index]!;
    const def = definitions[index === 0 ? 0 : 1]!;
    const whereVersion = and(eq(nutritionPlanVersions.tenantId, I.tenant), eq(nutritionPlanVersions.id, def.dietVersion));
    const [diet] = await tx.select().from(nutritionPlanVersions).where(whereVersion).limit(1);
    if (!diet) throw new Error('Demo nutrition template version is missing.');
    const dietId = demoId(`diet:${client.id}`), dietVersionId = demoId(`diet-version:${client.id}`);
    if (!await exists(tx, nutritionPlans, dietId)) await tx.insert(nutritionPlans).values({ id: dietId, tenantId: I.tenant,
      name: { ar: 'خطة الأكل بتاعتك' }, kind: 'client', clientId: client.id, subscriptionId: demo.subscriptions[index]!.id,
      templateId: def.diet, createdBy: I.ownerUser, createdAt: publishedAt });
    if (!await exists(tx, nutritionPlanVersions, dietVersionId)) {
      await tx.insert(nutritionPlanVersions).values({ id: dietVersionId, tenantId: I.tenant, clientId: client.id, planId: dietId, versionNo: 1,
        status: 'published', document: diet.document, publishedAt, publishedBy: I.ownerUser, createdBy: I.ownerUser, createdAt: publishedAt });
      await tx.update(nutritionPlans).set({ currentVersionId: dietVersionId }).where(and(eq(nutritionPlans.tenantId, I.tenant), eq(nutritionPlans.id, dietId)));
    }
    if (index === 6) continue; // Nutrition-only client intentionally has no workout program.
    const [program] = await tx.select().from(programVersions).where(and(eq(programVersions.tenantId, I.tenant), eq(programVersions.id, def.version))).limit(1);
    if (!program) throw new Error('Demo workout template version is missing.');
    const programId = demoId(`program:${client.id}`), versionId = demoId(`program-version:${client.id}`);
    if (!await exists(tx, programs, programId)) await tx.insert(programs).values({ id: programId, tenantId: I.tenant, name: { ar: def.title },
      kind: 'client', clientId: client.id, templateId: def.program, subscriptionId: demo.subscriptions[index]!.id, createdBy: I.ownerUser, createdAt: publishedAt });
    if (!await exists(tx, programVersions, versionId)) {
      await tx.insert(programVersions).values({ id: versionId, tenantId: I.tenant, programId, clientId: client.id, versionNo: 1,
        status: 'published', document: program.document, publishedAt, publishedBy: I.ownerUser, createdBy: I.ownerUser, createdAt: publishedAt });
      await tx.update(programs).set({ currentVersionId: versionId }).where(and(eq(programs.tenantId, I.tenant), eq(programs.id, programId)));
    }
  }
}
