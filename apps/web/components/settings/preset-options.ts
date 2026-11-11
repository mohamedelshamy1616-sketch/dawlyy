'use client';
import { useLocale } from 'next-intl';
import { PRESETS } from '@dawlyy/core/authz';
import { PRESET_IDS } from '@/src/server/team/permission-edit';

/** Task 11: role presets for pickers, named in the active locale from the core matrix. */
export function usePresetOptions() {
  const locale = useLocale() === 'en' ? 'en' : 'ar';
  return PRESET_IDS.map((id) => ({ value: id as string, label: PRESETS[id].name[locale] }));
}
