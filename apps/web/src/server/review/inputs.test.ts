import { describe, expect, it, vi } from 'vitest';
import type { AuthContext, Tx } from '@dawlyy/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { FormDocument, NutritionDocument, ProgramDocument } from '@dawlyy/core/types';
import { assertReviewEvidenceAllowed, emptyReviewSources, getReviewClient, loadReviewInputs, projectReviewInputs, requireReviewAccess } from './inputs';
import type { ReviewContext } from './types';

const id = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const auth: AuthContext = { tenantId: id, userId: other, membershipId: other, role: 'owner', permissions: null };
const context: ReviewContext = { period: { from: '2026-11-01', to: '2026-11-07' }, locale: 'en', coach: { firstName: 'Coach', dialect: 'egyptian', signaturePhrases: [] } };
const client = { id, firstName: 'Mona', goal: 'lose' as const, timezone: 'Africa/Cairo', today: '2026-11-07', startedOn: '2026-10-01', updatedAt: null };
const grants = [{ module: 'programs', action: 'view' }, { module: 'nutrition', action: 'view' }, { module: 'tracking', action: 'view' }] as const;
const document = NutritionDocument.parse({ targets: { kcal: 1800, proteinG: 120, carbsG: 180, fatG: 60 }, meals: [{ id: 'breakfast', name: { en: 'Breakfast' }, options: [{ id: 'one', items: [{ id: 'item', foodId: id, quantity: 100, measure: { kind: 'g' } }], macros: { kcal: 500, proteinG: 30, carbsG: 60, fatG: 10 } }] }] });

describe('R4b authorized current evidence', () => {
  it('excludes voided workout/meal/metric/measurement contributions, retaining revision markers', () => {
    const rows = emptyReviewSources();
    rows.sessions = [
      { id, localDate: '2026-11-03', state: 'completed', workoutId: null, voidedAt: null, updatedAt: null },
      { id: other, localDate: '2026-11-04', state: 'completed', workoutId: null, voidedAt: '2026-11-05', updatedAt: null },
    ];
    rows.meals = [
      { id, localDate: '2026-11-03', status: 'eaten', voidedAt: null, updatedAt: null, freeEntry: { macros: { kcal: 500 } }, mealId: null, optionId: null, document: null, planVersionId: null },
      { id: other, localDate: '2026-11-04', status: 'eaten', voidedAt: '2026-11-05', updatedAt: null, freeEntry: { macros: { kcal: 900 } }, mealId: null, optionId: null, document: null, planVersionId: null },
    ];
    rows.weights = [
      { id, localDate: '2026-11-01', value: 80, unit: 'kg', voidedAt: null, updatedAt: null, correctionOf: null },
      { id: other, localDate: '2026-11-07', value: 10, unit: 'kg', voidedAt: '2026-11-07', updatedAt: null, correctionOf: null },
    ];
    rows.measurements = [{ id, localDate: '2026-11-07', values: [{ type: 'waist', value: 2, unit: 'in' }], voidedAt: null, updatedAt: null, replacesId: null }];
    rows.nutrition = [{ id, planId: other, document, publishedAt: '2026-10-01', archivedAt: null }];
    const result = projectReviewInputs(client, context, rows, grants);
    expect(result.input.workouts.done).toBe(1);
    expect(result.input.meals.daysLogged).toBe(1);
    expect(result.input.meals.avgKcal).toBe(500);
    expect(result.input.weights).toEqual([{ on: '2026-11-01', kg: 80 }]);
    expect(result.input.measurements[0]?.values.waist).toBe(5.08);
    expect(result.sourceRevision).toContain('voidedAt');
    expect(result.sourceRevision).toContain(other);
  });
  it('omits unauthorized optional source rows even if a mock mistakenly supplies them', () => {
    const rows = emptyReviewSources();
    rows.weights = [{ id, localDate: '2026-11-01', value: 80, unit: 'kg', voidedAt: null, updatedAt: null, correctionOf: null }];
    rows.nutrition = [{ id, planId: other, document, publishedAt: '2026-10-01', archivedAt: null }];
    const result = projectReviewInputs(client, context, rows, []);
    expect(result.input.weights).toEqual([]);
    expect(result.input.nutrition).toBeNull();
    expect(result.input.meals.nutritionAssigned).toBe(false);
    expect(result.evidenceUnavailable).toEqual(expect.arrayContaining(['programs', 'nutrition', 'tracking']));
    expect(result.sourceRevision).not.toContain('1800');
  });
  it('projects typed submitted answers using their immutable version labels', () => {
    const rows = emptyReviewSources();
    rows.checkins = [{ id, submittedOn: '2026-11-04', submittedAt: '2026-11-04T09:00:00Z', state: 'submitted', updatedAt: null, reviewedAt: null,
      formVersionId: other, answers: { sleep: 7, ready: true, meal: ['rice'] }, document: FormDocument.parse({ sections: [{ id: 's', title: { en: 'Week' }, questions: [
        { id: 'sleep', type: 'number', label: { en: 'Sleep' } }, { id: 'ready', type: 'yes_no', label: { en: 'Ready' } }, { id: 'meal', type: 'multi', label: { en: 'Meal' } },
      ] }] }) }];
    const result = projectReviewInputs(client, context, rows, []);
    expect(result.input.checkin.current?.answers.map(a => [a.kind, a.value])).toEqual([['number', 7], ['boolean', true], ['choice', ['rice']]]);
    expect(result.input.checkin.previous).toBeNull();
  });
  it('counts actual published training dates in current and preceding equal periods', () => {
    const rows = emptyReviewSources();
    rows.programs = [{ id, planId: other, assignedOn: '2026-10-25', publishedAt: '2026-10-24', archivedAt: null,
      document: ProgramDocument.parse({ startDate: '2026-10-25', phases: [{ id: 'p', name: { en: 'Block' }, weeks: [0, 1].map(index => ({ id: `w${index}`, index, days: [0, 1, 2, 3, 4, 5, 6].map(day => day === 0
        ? { id: `d${index}-${day}`, index: day, kind: 'training', workout: { id: 'workout', name: { en: 'Workout' }, blocks: [] } }
        : { id: `d${index}-${day}`, index: day, kind: 'rest' }) })) }] }) }];
    const result = projectReviewInputs(client, context, rows, grants);
    expect(result.input.workouts).toEqual({ planned: 1, done: 0, previousPlanned: 1, previousDone: 0 });
  });
  it('binds published nutrition only, excluding mutable head/proposal metadata', () => {
    const rows = emptyReviewSources();
    rows.nutrition = [{ id, planId: other, document, publishedAt: '2026-10-01', archivedAt: null }];
    const before = projectReviewInputs(client, context, rows, grants).sourceRevision;
    const withProposal = { ...rows, ignoredProposal: { id: 'draft-version', headUpdatedAt: 'tomorrow' } };
    expect(projectReviewInputs(client, context, withProposal, grants).sourceRevision).toBe(before);
    rows.nutrition[0] = { ...rows.nutrition[0]!, id: other };
    expect(projectReviewInputs(client, context, rows, grants).sourceRevision).not.toBe(before);
  });
  it('requires base staff permissions and prevents access to old fuller evidence after grant loss', () => {
    expect(() => requireReviewAccess({ ...auth, role: 'client' })).toThrowError();
    const staff: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'], checkins: ['review'] } } };
    expect(() => requireReviewAccess(staff)).not.toThrow();
    expect(() => assertReviewEvidenceAllowed(staff, [{ module: 'nutrition', action: 'view' }])).toThrowError(expect.objectContaining({ code: 'review_evidence_not_allowed' }));
  });
  it('does not execute unauthorized optional evidence queries', async () => {
    const staff: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'], checkins: ['review'] } } };
    const execute = vi.fn().mockResolvedValueOnce([client]).mockResolvedValue([]);
    await loadReviewInputs({ execute } as unknown as Tx, staff, id, context);
    const sql = execute.mock.calls.map(args => new PgDialect().sqlToQuery(args[0]).sql).join(' ');
    expect(sql).not.toContain('public.metric_entries');
    expect(sql).not.toContain('public.nutrition_plans');
    expect(sql).not.toContain('public.workout_sessions');
    expect(sql).toContain('public.form_submissions');
    expect(sql).toContain('public.red_flags');
  });
  it('returns 404 for an invisible or archived client before reading evidence', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    await expect(getReviewClient({ execute } as unknown as Tx, auth, id)).rejects.toMatchObject({ status: 404 });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
