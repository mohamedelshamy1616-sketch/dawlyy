"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "dashboard", href: "/coach" },
  { key: "clients", href: "/coach/clients" },
  { key: "programs", href: "/coach/programs" },
  { key: "nutrition", href: "/coach/nutrition" },
  { key: "checkins", href: "/coach/checkins" },
  { key: "calendar", href: "/coach/calendar" },
  { key: "messages", href: "/coach/messages" },
  { key: "packages", href: "/coach/packages" },
  { key: "billing", href: "/coach/billing" },
  { key: "settings", href: "/coach/settings" },
] as const;

export function CoachNav() {
  const t = useTranslations("nav.coach");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map(({ key, href }) => {
        const active = href === "/coach" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
