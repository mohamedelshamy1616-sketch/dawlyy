/** R1b: plain link data shared by hubs, the palette and filesystem reachability checks. */
export type HubLink = { key: string; href: string };

/** R1b: Forms uses the existing check-in form list; assessment/intake lists remain in the menu. */
export const LIBRARY_LINKS: readonly HubLink[] = [
  { key: 'programs', href: '/coach/programs' },
  { key: 'exercises', href: '/coach/exercises' },
  { key: 'foods', href: '/coach/foods' },
  { key: 'forms', href: '/coach/checkins?tab=templates' },
  { key: 'packages', href: '/coach/packages' },
  { key: 'nutrition', href: '/coach/nutrition' },
];

/** R1b: creation/import routes appear in the Library beneath the existing list links. */
export const LIBRARY_TOOL_LINKS: readonly HubLink[] = [
  { key: 'newProgram', href: '/coach/programs/new' },
  { key: 'newExercise', href: '/coach/exercises/new' },
  { key: 'importExercises', href: '/coach/exercises/import' },
  { key: 'newFood', href: '/coach/foods/new' },
  { key: 'newPackage', href: '/coach/packages/new' },
  { key: 'newNutrition', href: '/coach/nutrition/new' },
];

/** R1b: renewals use the dashboard's existing queue and client subscription destinations. */
export const MONEY_LINKS: readonly HubLink[] = [
  { key: 'payments', href: '/coach/billing' },
  { key: 'renewals', href: '/coach?queue=expiring_subscriptions' },
  { key: 'sell', href: '/coach/billing/sell' },
];
