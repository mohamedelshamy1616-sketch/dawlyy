import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { ExerciseSeed, FoodSeed, NutritionDocument, ProgramDocument, FormDocument } from '@dawlyy/core/types';
import { addDays, generateSchedule, localDateOf } from '@dawlyy/core/schedule';
import { validateAnswers } from '@dawlyy/core/forms';
import { validateProgram } from '@dawlyy/core/program-edit';
import { sql } from 'drizzle-orm';
import { closeDb, withServiceTx } from '../src/client';
import { SEED_DIR, loadJsonDir } from './load';
import { DEMO_IDS, demoId } from './demo/ids';
import { buildDemo, DEMO_CLIENTS } from './demo/model';
import { buildDocuments } from './demo/programs-nutrition';
import { DEMO_FORMS } from './demo/forms';
import { seedDemo } from './demo';
import { assertLocalDatabase } from './demo/helpers';

const now = new Date('2026-11-11T10:00:00Z');

describe('Task 12 demo fixtures (no database)', () => {
  it('preserves the original screen/dev-login identities and allocates unique UUIDs', () => {
    expect(DEMO_IDS.tenant).toBe('d0250000-0000-4000-8000-000000000001');
    expect(DEMO_IDS.firstClient).toBe('d0250000-0000-4000-8000-000000000301');
    expect(DEMO_IDS.program).toBe('d0250000-0000-4000-8000-000000000501');
    const ids = Object.values(DEMO_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^d0250000-0000-4000-8000-[0-9a-f]{12}$/);
    const generated = Array.from({ length: 3000 }, (_, i) => demoId(`test:${i}`));
    expect(new Set([...ids, ...generated]).size).toBe(ids.length + generated.length);
    expect(demoId('same')).toBe(demoId('same'));
  });

  it('contains eight safe client identities, two English locales, three packages and all situations', () => {
    const demo = buildDemo(now);
    expect(DEMO_CLIENTS).toHaveLength(8);
    expect(DEMO_CLIENTS.filter(c => c.locale === 'en')).toHaveLength(2);
    expect(new Set(DEMO_CLIENTS.map(c => c.userId)).size).toBe(8);
    for (const c of DEMO_CLIENTS) {
      expect(c.email).toMatch(/@demo\.dawlyy\.test$/);
      expect(c.phone).toMatch(/^\+2010000000\d{2}$/);
    }
    expect(demo.packages).toHaveLength(3);
    expect(demo.subscriptions).toHaveLength(8);
    expect(new Set(demo.subscriptions.map(s => s.state))).toEqual(new Set(['active', 'grace', 'expired', 'paused', 'pending']));
    expect(demo.subscriptions[1]?.endsOn).toBe(addDays(demo.today, 5));
    expect(demo.subscriptions[2]?.graceEndsOn! > demo.today).toBe(true);
    expect(demo.subscriptions[3]?.graceEndsOn! < demo.today).toBe(true);
  });

  it('balances verified/refunded/pending/rejected payments against each subscription', () => {
    const demo = buildDemo(now);
    expect(demo.payments.some(p => p.state === 'pending' && p.proofMediaId === DEMO_IDS.pendingProof)).toBe(true);
    expect(demo.payments.filter(p => p.state === 'refunded')).toHaveLength(1);
    expect(demo.payments.filter(p => p.state === 'rejected')).toHaveLength(1);
    for (const sub of demo.subscriptions) {
      const rows = demo.payments.filter(p => p.subscriptionId === sub.id);
      const received = rows.reduce((sum, p) => sum + (p.state === 'verified' ? p.amount : 0), 0);
      expect(received).toBe(sub.state === 'pending' ? 0 : sub.price);
      for (const row of rows) {
        expect(row.clientId).toBe(sub.clientId);
        expect(row.amount).toBe(sub.price);
        expect(row.paidAt.getTime()).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it('uses core schedules, has due/overdue/completed work and no open work during a freeze', () => {
    const demo = buildDemo(now);
    for (const sub of demo.subscriptions.filter(s => s.state !== 'paused')) {
      const generated = generateSchedule({ startDate: sub.startsOn, endDate: sub.endsOn, timezone: 'Africa/Cairo', rules: sub.packageSnapshot.scheduleRules });
      expect(demo.calendar.filter(e => e.subscriptionId === sub.id).map(e => e.ruleKey)).toEqual(generated.map(e => e.ruleKey));
    }
    const keys = demo.calendar.map(e => `${e.subscriptionId}:${e.ruleKey}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const state of ['scheduled', 'due', 'overdue', 'completed']) expect(demo.calendar.some(e => e.state === state)).toBe(true);
    const frozen = demo.subscriptions.find(s => s.state === 'paused')!;
    expect(demo.calendar.filter(e => e.subscriptionId === frozen.id && e.localDate >= addDays(demo.today, -2) && e.localDate < addDays(demo.today, 5))).toHaveLength(0);
    for (const e of demo.calendar) {
      expect(localDateOf(e.dueAt.toISOString(), e.timezone)).toBe(e.localDate);
      if (e.state === 'completed') expect(e.completedAt?.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('refuses remote runtime and service URLs before seed or reset can open a connection', () => {
    try {
      vi.stubEnv('DATABASE_URL', 'postgres://demo:demo@127.0.0.1:54329/scratch');
      vi.stubEnv('DATABASE_URL_SERVICE', 'postgres://demo:demo@localhost:54329/scratch');
      expect(assertLocalDatabase).not.toThrow();
      vi.stubEnv('DATABASE_URL_SERVICE', 'postgres://demo:demo@remote.invalid/scratch');
      expect(assertLocalDatabase).toThrow('localhost or 127.0.0.1');
      vi.stubEnv('DATABASE_URL_SERVICE', '');
      vi.stubEnv('DATABASE_URL', 'postgres://demo:demo@localhost.remote.invalid/scratch');
      expect(assertLocalDatabase).toThrow('localhost or 127.0.0.1');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('validates the real system JSON and records its actual counts above Task 12 minimums', () => {
    const exercises = loadJsonDir(join(SEED_DIR, 'exercises')).flatMap(f => f.rows.map(r => ExerciseSeed.parse(r)));
    const foods = loadJsonDir(join(SEED_DIR, 'foods')).flatMap(f => f.rows.map(r => FoodSeed.parse(r)));
    // Task 12 asks for 200/300, but the existing system seed has 210/371. Keep its richer library intact.
    expect(exercises).toHaveLength(210);
    expect(foods).toHaveLength(371);
    expect(exercises.length).toBeGreaterThanOrEqual(200);
    expect(foods.length).toBeGreaterThanOrEqual(300);
    for (const items of [exercises, foods]) expect(new Set(items.map(i => i.slug)).size).toBe(items.length);
    for (const e of exercises) {
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      for (const ref of [...e.alternatives, ...e.progressions, ...e.regressions]) {
        expect(ref).not.toBe(e.slug);
        expect(exercises.some(other => other.slug === ref)).toBe(true);
      }
    }
    for (const f of foods) {
      if (f.counterpartSlug) expect(foods.some(other => other.slug === f.counterpartSlug)).toBe(true);
      const atwater = 4 * f.per100.proteinG + 4 * f.per100.carbsG + 9 * f.per100.fatG;
      expect(Math.abs(f.per100.kcal - atwater)).toBeLessThanOrEqual(Math.max(8, 0.15 * atwater));
    }
    const validator = readFileSync(join(SEED_DIR, 'validate.ts'), 'utf8');
    expect(validator).toContain('ExerciseSeed.safeParse');
    expect(validator).toContain('FoodSeed.safeParse');
    const docs = buildDocuments(new Map(exercises.map(e => [e.slug, demoId(`exercise:${e.slug}`)])),
      new Map(foods.map(f => [f.slug, { ...f, id: demoId(`food:${f.slug}`) }])));
    expect(docs.programs).toHaveLength(2);
    expect(docs.diets).toHaveLength(2);
    docs.programs.forEach(d => {
      ProgramDocument.parse(d);
      expect(validateProgram(d, { knownExerciseIds: new Set(exercises.map(e => demoId(`exercise:${e.slug}`))) })).toEqual([]);
    });
    docs.diets.forEach(d => NutritionDocument.parse(d));
    for (const f of DEMO_FORMS) {
      FormDocument.parse(f.document);
      expect(validateAnswers(f.document, f.answers)).toEqual([]);
    }
  });
});

// This file lives in seed/ as required by the brief. The current vitest.config.ts includes test/ only;
// the integrator must include seed/demo.test.ts in the test runner (without moving this file).
describe.runIf(process.env.DATABASE_URL)('demo seed on a migrated scratch database', () => {
  afterAll(() => closeDb());
  async function counts(): Promise<Record<string, number>> {
    return withServiceTx(DEMO_IDS.tenant, 'test:demo counts', async tx => {
      const tables = await tx.execute<{ name: string }>(sql`
        select table_name as name from information_schema.columns
        where table_schema = 'public' and column_name = 'tenant_id' order by table_name`);
      const result: Record<string, number> = {};
      for (const table of tables) {
        const [row] = await tx.execute<{ count: number }>(sql`select count(*)::int as count from ${sql.identifier(table.name)} where tenant_id = ${DEMO_IDS.tenant}::uuid`);
        result[table.name] = row?.count ?? 0;
      }
      return result;
    });
  }
  it('seeds twice without changing any tenant table count or burning counters', async () => {
    await seedDemo(now);
    const before = await counts();
    const counters = () => withServiceTx(DEMO_IDS.tenant, 'test:demo counters', tx => tx.execute(sql`
      select client_counter, receipt_counter from public.tenants where id = ${DEMO_IDS.tenant}::uuid`));
    const firstCounters = [...await counters()];
    await seedDemo(new Date('2026-12-13T23:00:00Z'));
    expect(await counts()).toEqual(before);
    expect([...await counters()]).toEqual(firstCounters);
    expect(before.clients).toBe(8);
    expect(before.memberships).toBe(10);
    expect(before.packages).toBe(3);
    expect(before.metric_entries).toBe(32);
    expect(before.measurement_sets).toBe(2);
    expect(before.meal_logs).toBe(21);
    expect(before.conversations).toBe(3);
    expect(before.consents).toBe(14);
    expect(before.programs).toBe(7); // Two templates and five client copies (§7.3).
    expect(before.program_versions).toBe(7);
    expect(before.nutrition_plans).toBe(8); // Two templates and six client copies.
    expect(before.nutrition_plan_versions).toBe(8);
    expect(before.workout_sessions).toBe(16);
    expect(before.forms).toBe(3);
    expect(before.form_submissions).toBe(5);
    expect(before.payments).toBe(10);
    await withServiceTx(DEMO_IDS.tenant, 'test:demo receipts and unread', async tx => {
      const receipts = await tx.execute<{ state: string; receipt_no: string | null; amount: number; refund_amount: number | null }>(sql`
        select state, receipt_no, amount::float8 as amount, refund_amount::float8 as refund_amount from public.payments
        where tenant_id = ${DEMO_IDS.tenant}::uuid`);
      expect(receipts.filter(p => p.receipt_no !== null)).toHaveLength(8);
      expect(new Set(receipts.flatMap(p => p.receipt_no ? [p.receipt_no] : [])).size).toBe(8);
      for (const p of receipts) {
        if (p.state === 'verified' || p.state === 'refunded') expect(p.receipt_no).toMatch(/^R-\d+$/);
        else expect(p.receipt_no).toBeNull();
        if (p.state === 'refunded') expect(p.refund_amount).toBe(p.amount);
      }
      const conversations = await tx.execute<{ unread_for_coach: number; unread_for_client: number }>(sql`
        select unread_for_coach, unread_for_client from public.conversations where tenant_id = ${DEMO_IDS.tenant}::uuid`);
      expect(conversations).toHaveLength(3);
      for (const c of conversations) expect(c).toEqual({ unread_for_coach: 1, unread_for_client: 1 });
    });
  }, 120_000);
});
