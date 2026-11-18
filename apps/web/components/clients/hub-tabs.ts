/** R1c client hub tabs. Kept out of the 'use client' module so server pages can read the value, not a client reference. */
export const HUB_TABS = ['week', 'plan', 'money', 'notes'] as const;
export type HubTab = (typeof HUB_TABS)[number];
