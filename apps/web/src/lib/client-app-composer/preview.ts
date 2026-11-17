import type { ClientModules, LocalizedText } from '@dawlyy/core/types';
import type { ClientTodayModel } from '@/components/client-today/types';
import ar from '../../../messages/ar/clientAppComposer.json';
import en from '../../../messages/en/clientAppComposer.json';

/** R2c: a fixed day, so the example never reads a clock. */
export const PREVIEW_DATE = '2026-11-18';
export const PREVIEW_SAMPLE_MEAL_OPTION = 'preview-option';

const both = (pick: (catalog: typeof en) => string): LocalizedText => ({ ar: pick(ar as typeof en), en: pick(en) });

/**
 * R2c: a typed, synthetic Today for the configuration preview. Sample wording comes from this feature's catalogs
 * (both locales, because Today localizes each value itself). Nothing here is read from a real client, and a
 * module that is off contributes no content, exactly like the real Today.
 */
export function makeComposerPreview(modules: ClientModules, locale: 'ar' | 'en', numerals: 'latn' | 'arab'): ClientTodayModel {
  return {
    date: PREVIEW_DATE,
    locale,
    numerals,
    modules,
    workout: modules.workouts
      ? { state: 'planned', name: both(c => c.preview.sample.workoutName), dayLabel: both(c => c.preview.sample.workoutDay), exerciseCount: 6 }
      : null,
    meals: modules.nutrition
      ? [
        { id: 'preview-meal-1', name: both(c => c.preview.sample.meal1), optionId: PREVIEW_SAMPLE_MEAL_OPTION, status: 'eaten' },
        { id: 'preview-meal-2', name: both(c => c.preview.sample.meal2), optionId: PREVIEW_SAMPLE_MEAL_OPTION, status: null },
        { id: 'preview-meal-3', name: both(c => c.preview.sample.meal3), optionId: PREVIEW_SAMPLE_MEAL_OPTION, status: null },
      ]
      : [],
    checkins: modules.checkins
      ? [{ eventId: 'preview-checkin', title: both(c => c.preview.sample.checkin), dueAt: `${PREVIEW_DATE}T15:00:00.000Z`, state: 'due' }]
      : [],
    intakePending: false,
    subscription: modules.payments ? { state: 'active', daysLeft: 9 } : null,
  };
}
