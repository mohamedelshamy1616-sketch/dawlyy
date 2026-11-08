import { useTranslations } from "next-intl";

/** First focusable element on the page: jumps keyboard and screen-reader users past the navigation to `#main`. */
export function SkipLink() {
  const t = useTranslations("common");
  return (
    <a
      href="#main"
      className="focus-ring sr-only z-50 rounded-lg bg-brand px-4 py-3 text-sm font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
    >
      {t("skipToContent")}
    </a>
  );
}
