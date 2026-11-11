"use client";

import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LinkProvider } from "@astryxdesign/core/Link";
import arSA from "@astryxdesign/core/locales/ar-SA.generated.js";
import { Theme } from "@astryxdesign/core/theme";
import { Link } from "@/i18n/navigation";
import { dawlyyTheme } from "@/theme/built/dawlyy";

type Props = {
  locale: "ar" | "en";
  children: React.ReactNode;
};

const astryxLocale = { ar: "ar-SA", en: "en" } as const;
const messages = { "ar-SA": arSA };

/**
 * Root provider for the Astryx design system (Meta, @astryxdesign/core).
 * - Theme: the built DAWLYY theme (neutral with the brand teal accent; source theme/dawlyy.theme.ts,
 *   rebuilt with `pnpm --filter @dawlyy/web theme:build`); its CSS is imported in app/globals.css.
 *   The app has no dark mode switch yet, so the mode is fixed to light to match the shadcn tokens.
 * - InternationalizationProvider: Astryx's own strings and RTL mirroring follow the page locale.
 *   Product copy stays in next-intl.
 * - LinkProvider: Astryx links use the locale-aware next-intl Link.
 */
export function AstryxProvider({ locale, children }: Props) {
  return (
    <InternationalizationProvider locale={astryxLocale[locale]} messages={messages}>
      <LinkProvider component={Link}>
        <Theme theme={dawlyyTheme} mode="light">
          {children}
        </Theme>
      </LinkProvider>
    </InternationalizationProvider>
  );
}
