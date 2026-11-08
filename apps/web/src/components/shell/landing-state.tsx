import { useTranslations } from "next-intl";
import { Wordmark } from "./wordmark";

/**
 * Full-screen branded state for `/[locale]`: shown while the visitor is sent to login, the coach
 * workspace or the client portal. Never a blank page, even for a moment.
 */
export function LandingState() {
  const t = useTranslations();

  return (
    <main
      id="main"
      aria-busy="true"
      className="flex min-h-svh w-full flex-col items-center justify-center gap-6 overflow-x-clip bg-linear-to-b from-brand-soft to-background px-6 text-center"
    >
      <Wordmark asLink={false} size="lg" className="motion-safe:animate-pulse" />
      <p className="max-w-xs text-base text-foreground/80">{t("common.tagline")}</p>
      <p role="status" className="text-sm text-foreground/75">
        {t("landing.opening")}
      </p>
    </main>
  );
}
