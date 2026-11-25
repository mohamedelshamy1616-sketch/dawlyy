import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * DAWLYY theme: the neutral theme with the brand lime as its accent. Source for `pnpm theme:build`,
 * which writes theme/built/dawlyy.{js,css,d.ts}. No color is chosen here: every value references a variable
 * from src/styles/tokens.css (the one owner-editable source), so re-branding means editing that file and
 * rebuilding. Tuples are [light, dark] and become light-dark(); the light and dark accents are separate variables
 * because Astryx switches with color-scheme, not with the app's .dark class. Everything else is inherited from neutral.
 */
const accentPair = ["var(--dawlyy-accent-light)", "var(--dawlyy-accent-dark)"] satisfies [string, string];
const accentSoft = ["var(--dawlyy-accent-soft-light)", "var(--dawlyy-accent-soft-dark)"] satisfies [string, string];
const onAccent = ["var(--dawlyy-on-accent-light)", "var(--dawlyy-on-accent-dark)"] satisfies [string, string];

export const dawlyyTheme = defineTheme({
  name: "dawlyy",
  extends: neutralTheme,
  tokens: {
    "--color-accent": accentPair,
    "--color-accent-muted": accentSoft,
    "--color-text-accent": accentPair,
    "--color-icon-accent": accentPair,
    "--color-on-accent": onAccent,
    "--shadow-inset-selected": "var(--dawlyy-selected-inset)",
  },
});
