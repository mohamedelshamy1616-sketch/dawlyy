/**
 * Message key for a muscle name from the exercise library ("Biceps brachii (long head)" -> "biceps_brachii_long_head").
 * The labels live in `workout.muscleNames`; a muscle without a label is hidden, never shown as a generic placeholder.
 */
export const muscleKey = (muscle: string): string => muscle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Translated labels for the muscles that have one, in order, without duplicates. */
export function muscleLabels(muscles: readonly string[], t: { has: (key: string) => boolean; (key: string): string }): string[] {
  const labels: string[] = [];
  for (const muscle of muscles) {
    const key = `muscleNames.${muscleKey(muscle)}`;
    if (!t.has(key)) continue;
    const label = t(key);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}
