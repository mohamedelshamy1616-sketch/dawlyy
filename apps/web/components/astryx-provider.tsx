"use client";

import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LinkProvider } from "@astryxdesign/core/Link";
import arSA from "@astryxdesign/core/locales/ar-SA.generated.js";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { Link } from "@/i18n/navigation";

type Props = {
  locale: "ar" | "en";
  children: React.ReactNode;
};

const astryxLocale = { ar: "ar-SA", en: "en" } as const;
const messages = { "ar-SA": arSA };

/**
 * Root provider for the Astryx design system (Meta, @astryxdesign/core).
 * - Theme: the built neutral theme; its CSS is imported in app/globals.css. The app has no dark mode
 *   switch yet, so the mode is fixed to light to match the shadcn tokens.
 * - InternationalizationProvider: Astryx's own strings and RTL mirroring follow the page locale.
 *   Product copy stays in next-intl.
 * - LinkProvider: Astryx links use the locale-aware next-intl Link.
 */
export function AstryxProvider({ locale, children }: Props) {
  return (
    <InternationalizationProvider locale={astryxLocale[locale]} messages={messages}>
      <LinkProvider component={Link}>
        <Theme theme={neutralTheme} mode="light">
          {children}
        </Theme>
      </LinkProvider>
    </InternationalizationProvider>
  );
}
