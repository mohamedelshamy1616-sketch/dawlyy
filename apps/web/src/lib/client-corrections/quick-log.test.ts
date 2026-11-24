import { describe, expect, it } from 'vitest';
import type { ClientNutrition } from '@/components/nutrition/types';
import type { MealHistoryRow } from './types';
import { mealLogSchema } from '@/src/server/nutrition/schemas';
import { buildQuickLogChoices, createQuickLogRunner } from './quick-log';

const uuid = '10000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-17T12:00:00.000Z';
const macros = { kcal: 100, proteinG: 5, carbsG: 15, fatG: 2 };
const plan: ClientNutrition = {
  head: { id: 'p', name: { en: 'Plan' } }, version: { id: 'v', versionNo: 1, document: {
    schemaVersion: 1, targets: macros, supplements: [], allergens: [], meals: [{ id: 'm', name: { en: 'Lunch', ar: 'الغدا' }, options: [{ id: 'o', items: [{ id: 'i', foodId: 'f', quantity: 150, measure: { kind: 'g' }, approx: false }] }] }],
  } }, foods: [{ id: 'f', name: { en: 'Rice', ar: 'رز' }, slug: 'rice', aliases: [], category: 'grain', per100: macros, measures: [], source: 'db' }], localDate: '2026-11-17', timezone: 'Africa/Cairo', dayType: 'training', targets: macros,
};
const row = (patch: Partial<MealHistoryRow> = {}): MealHistoryRow => ({ id: 'r', planVersionId: 'v', clientUuid: uuid, localDate: '2026-11-16', mealId: 'm', optionId: 'o', status: 'eaten', freeEntry: null, note: null, clientUpdatedAt: timestamp, createdAt: timestamp, voidedAt: null, replacesId: null, ...patch });

describe('quick log choices', () => {
  it('needs only navigation then one concrete choice, and factories supply fresh identity/date', () => {
    const choices = buildQuickLogChoices({ localDate: '2026-11-17', plan, recent: [row()], locale: 'en' });
    expect(choices.map(choice => choice.kind)).toEqual(['planned', 'yesterday', 'recentFood']);
    for (const choice of choices) {
      const body = choice.create(uuid, timestamp);
      expect(body).toMatchObject({ clientUuid: uuid, clientUpdatedAt: timestamp, localDate: '2026-11-17', status: 'eaten' });
      expect(body).not.toHaveProperty('foodId'); expect(mealLogSchema.safeParse(body).success).toBe(true);
      expect(choice.labelParams.name).toBeTruthy(); expect(choice.labelParams.portion).toBeTruthy();
    }
  });
  it('uses the referenced weighed portion and core macros for recent food', () => {
    const choice = buildQuickLogChoices({ localDate: plan.localDate, plan, recent: [row()], locale: 'en' }).find(item => item.kind === 'recentFood')!;
    expect(choice.create(uuid, timestamp).freeEntry).toEqual({ text: 'Rice — 150 g', macros: { kcal: 150, proteinG: 7.5, carbsG: 22.5, fatG: 3 } });
    expect(choice.create(uuid, timestamp).mealId).toBeUndefined();
  });
  it('never guesses food or macros from free text and reuses actual free-entry data', () => {
    const choices = buildQuickLogChoices({ localDate: plan.localDate, plan: null, recent: [row({ mealId: null, optionId: null, freeEntry: { text: 'Homemade lunch', macros } })], locale: 'en' });
    expect(choices).toHaveLength(1); expect(choices[0]!.kind).toBe('yesterday');
    expect(choices[0]!.create(uuid, timestamp).freeEntry).toEqual({ text: 'Homemade lunch', macros });
  });
  it('omits voided, superseded, skipped, out-of-range and removed meal/option rows', () => {
    const recent = [row({ voidedAt: timestamp }), row({ id: 'other', mealId: 'removed' }), row({ id: 'badOption', optionId: 'removed' }), row({ id: 'skipped', status: 'skipped' }), row({ id: 'old', localDate: '2026-11-09' })];
    expect(buildQuickLogChoices({ localDate: plan.localDate, plan, recent, locale: 'en' }).map(item => item.kind)).toEqual(['planned']);
    expect(buildQuickLogChoices({ localDate: plan.localDate, plan: null, recent: [], locale: 'en' })).toEqual([]);
  });
  it('has stable deduplicated keys, honors numerals and keeps state local to its input', () => {
    const input = { localDate: plan.localDate, plan, recent: [row(), row({ id: 'duplicate' })], locale: 'ar' as const, numerals: 'arab' as const };
    const choices = buildQuickLogChoices(input);
    expect(new Set(choices.map(item => item.key)).size).toBe(choices.length);
    expect(choices.find(item => item.kind === 'recentFood')!.labelParams.portion).toContain('١٥٠');
    expect(buildQuickLogChoices({ ...input, plan: null, recent: [] })).toEqual([]);
    expect(buildQuickLogChoices(input).map(item => item.key)).toEqual(choices.map(item => item.key));
  });
  it('omits superseded originals and never invents historical portions after a plan change', () => {
    const input = { localDate: plan.localDate, plan, locale: 'en' as const };
    const superseded = buildQuickLogChoices({ ...input, recent: [row(), row({ id: 'replacement', replacesId: 'r', status: 'skipped' })] });
    expect(superseded.filter(choice => choice.kind !== 'planned')).toEqual([]);
    for (const planVersionId of [null, 'old-version']) {
      const choices = buildQuickLogChoices({ ...input, recent: [row({ planVersionId })] });
      expect(choices.some(choice => choice.kind === 'recentFood')).toBe(false);
      expect(choices.some(choice => choice.kind === 'yesterday')).toBe(false);
    }
  });
  it('does not repeat a republished option with the same IDs and a different quantity', () => {
    const recent = [row()];
    const input = { localDate: plan.localDate, plan, recent, locale: 'en' as const };
    expect(buildQuickLogChoices(input).find(choice => choice.kind === 'yesterday')?.labelParams.portion).toContain('150');
    const revised = structuredClone(plan);
    revised.version!.id = 'v2';
    revised.version!.document.meals[0]!.options[0]!.items[0]!.quantity = 100;
    const choices = buildQuickLogChoices({ ...input, plan: revised });
    expect(choices.map(choice => choice.kind)).toEqual(['planned']);
    expect(choices[0]!.labelParams.portion).toContain('100');
  });
  it('one chosen row submits once, blocks duplicate clicks and preserves identity on retry', async () => {
    const choice = buildQuickLogChoices({ localDate: plan.localDate, plan, recent: [], locale: 'en' })[0]!;
    let made = 0; const sent: unknown[] = []; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const runner = createQuickLogRunner({ make: (selected: typeof choice) => { made++; return selected.create(uuid, timestamp); }, send: async (operation: unknown) => { sent.push(operation); await gate; return 'saved'; } });
    const first = runner.submit(choice);
    expect(await runner.submit(choice)).toEqual({ status: 'busy' });
    release(); expect((await first).status).toBe('saved');
    expect(await runner.submit(choice)).toEqual({ status: 'saved' });
    expect(sent).toHaveLength(1); expect(made).toBe(1);
    let attempt = 0; const retries: unknown[] = [];
    const retry = createQuickLogRunner({ make: (selected: typeof choice) => selected.create(uuid, timestamp), send: async (operation: unknown) => { retries.push(operation); if (attempt++ === 0) throw new Error('response lost'); return 'saved'; } });
    await expect(retry.submit(choice)).rejects.toThrow('response lost');
    await retry.submit(choice); expect(retries[0]).toBe(retries[1]);
  });

});
