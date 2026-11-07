import { describe, expect, it } from 'vitest';
import {
  FormDocument,
  LocalizedText,
  NutritionDocument,
  ProgramDocument,
  ScheduleRules,
  localize,
} from '../src/types';

describe('LocalizedText', () => {
  it('requires at least one language', () => {
    expect(LocalizedText.safeParse({}).success).toBe(false);
    expect(LocalizedText.safeParse({ ar: 'سكوات' }).success).toBe(true);
  });

  it('localize falls back to the other language', () => {
    expect(localize({ en: 'Squat' }, 'ar')).toBe('Squat');
    expect(localize({ ar: 'سكوات', en: 'Squat' }, 'ar')).toBe('سكوات');
    expect(localize(undefined, 'en')).toBe('');
  });
});

describe('ProgramDocument', () => {
  const day = (index: number) => ({ id: `d${index}`, index, kind: index % 2 === 0 ? 'training' : 'rest' });
  const minimal = {
    phases: [
      {
        id: 'p1',
        name: { en: 'Base' },
        weeks: [{ id: 'w1', index: 0, days: [0, 1, 2, 3, 4, 5, 6].map(day) }],
      },
    ],
  };

  it('parses a minimal program and defaults schemaVersion', () => {
    const parsed = ProgramDocument.parse(minimal);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.phases[0]?.weeks[0]?.days).toHaveLength(7);
  });

  it('rejects a week that is not seven days', () => {
    const bad = { phases: [{ id: 'p1', name: { en: 'x' }, weeks: [{ id: 'w1', index: 0, days: [day(0)] }] }] };
    expect(ProgramDocument.safeParse(bad).success).toBe(false);
  });
});

describe('NutritionDocument', () => {
  it('parses a plan with household measures', () => {
    const parsed = NutritionDocument.parse({
      targets: { kcal: 2000, proteinG: 160, carbsG: 200, fatG: 60 },
      meals: [
        {
          id: 'm1',
          name: { ar: 'الفطار', en: 'Breakfast' },
          options: [
            {
              id: 'o1',
              items: [{ id: 'i1', foodId: 'egg', quantity: 3, measure: { kind: 'piece' }, approx: true }],
            },
          ],
        },
      ],
    });
    expect(parsed.supplements).toEqual([]);
    expect(parsed.meals[0]?.options[0]?.items[0]?.approx).toBe(true);
  });
});

describe('FormDocument', () => {
  it('parses conditional questions', () => {
    const parsed = FormDocument.parse({
      sections: [
        {
          id: 's1',
          title: { en: 'Health' },
          questions: [
            { id: 'q1', type: 'yes_no', label: { en: 'Any injuries?' }, required: true },
            { id: 'q2', type: 'long_text', label: { en: 'Describe' }, visibleIf: { questionId: 'q1', op: 'eq', value: true } },
          ],
        },
      ],
    });
    expect(parsed.sections[0]?.questions[1]?.visibleIf?.op).toBe('eq');
  });
});

describe('ScheduleRules', () => {
  it('defaults match spec §22: first check-in after 7 days, no daily check-ins', () => {
    const rules = ScheduleRules.parse({});
    expect(rules.weeklyCheckin.firstAfterDays).toBe(7);
    expect(rules.dailyCheckin.enabled).toBe(false);
    expect(rules.weighIn.kind).toBe('none');
    expect(rules.renewalReminderDaysBefore).toEqual([7, 3, 1]);
  });
});
