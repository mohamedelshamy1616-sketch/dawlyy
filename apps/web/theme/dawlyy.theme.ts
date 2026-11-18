import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * DAWLYY theme: the neutral theme with the brand teal as its accent. Source for `pnpm theme:build`,
 * which writes theme/built/dawlyy.{js,css,d.ts}. No color is chosen here: every value references a variable
 * from src/styles/tokens.css (the one owner-editable source), so re-branding means editing that file and
 * rebuilding. Tuples are [light, dark] and become light-dark(); the light and dark teal are separate variables
 * because Astryx switches with color-scheme, not with the app's .dark class. Everything else is inherited from neutral.
 */
const teal = ["var(--dawlyy-accent-light)", "var(--dawlyy-accent-dark)"] satisfies [string, string];
const tealSoft = ["var(--dawlyy-accent-soft-light)", "var(--dawlyy-accent-soft-dark)"] satisfies [string, string];
const onTeal = ["var(--dawlyy-on-accent-light)", "var(--dawlyy-on-accent-dark)"] satisfies [string, string];

export const dawlyyTheme = defineTheme({
  name: "dawlyy",
  extends: neutralTheme,
  tokens: {
    "--color-accent": teal,
    "--color-accent-muted": tealSoft,
    "--color-text-accent": teal,
    "--color-icon-accent": teal,
    "--color-on-accent": onTeal,
    "--shadow-inset-selected": "var(--dawlyy-selected-inset)",
  },
});
