import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * DAWLYY theme: the neutral theme with the brand teal as its accent. Source for `pnpm theme:build`,
 * which writes theme/built/dawlyy.{js,css,d.ts}. Values are the sRGB hex of the --brand tokens in
 * app/globals.css (light oklch(0.45 0.09 185), soft oklch(0.955 0.03 185); dark oklch(0.72 0.11 185)).
 * Tuples are [light, dark]. Everything else is inherited from neutral.
 */
const teal = { light: "#00655c", dark: "#3dbbae" };
const tealSoft = { light: "#dbf7f3", dark: "#053631" };
const onTeal = { light: "#f5fefd", dark: "#001c18" };

export const dawlyyTheme = defineTheme({
  name: "dawlyy",
  extends: neutralTheme,
  tokens: {
    "--color-accent": [teal.light, teal.dark],
    "--color-accent-muted": [tealSoft.light, tealSoft.dark],
    "--color-text-accent": [teal.light, teal.dark],
    "--color-icon-accent": [teal.light, teal.dark],
    "--color-on-accent": [onTeal.light, onTeal.dark],
    "--shadow-inset-selected": "inset 0px 0px 0px 2px #00655c80",
  },
});
