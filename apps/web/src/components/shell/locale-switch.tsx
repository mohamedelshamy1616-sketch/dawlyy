"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const LABELS = { ar: "العربية", en: "English" } as const;

/** ar/en switch. A real link to the same path in the other locale, so it works before hydration too. */
export function LocaleSwitch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Link
      href={pathname}
      locale={other}
      lang={other}
      hrefLang={other}
      prefetch={false}
      className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted"
    >
      <Languages className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("language")}: </span>
      <span>{LABELS[other]}</span>
    </Link>
  );
}
