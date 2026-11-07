"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "@/i18n/navigation";

const LABELS = { ar: "العربية", en: "English" } as const;

export function LocaleSwitcher() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const other = locale === "ar" ? "en" : "ar";

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={t("language")}
      lang={other}
      onClick={() => router.replace(pathname, { locale: other })}
    >
      {LABELS[other]}
    </Button>
  );
}
